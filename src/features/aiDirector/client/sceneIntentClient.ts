/**
 * Client for the model-backed scene suggestion.
 *
 * **The Anthropic API key never reaches this code.** Anything reachable from
 * the browser bundle is public, so the key lives only on the server that owns
 * `/api/ai/scene-intent`; this module posts a signature (and optionally a small
 * image) and gets back a `SceneIntent`. That is also why the AI Director is the
 * feature that justifies the backend at all — key custody, a shared cache and
 * per-user quota are all server-shaped problems.
 *
 * Failure is never fatal. Anything that goes wrong — no server, a network
 * error, a timeout, junk JSON — falls back to the offline heuristic, so the
 * feature degrades to "good" instead of "broken". The caller is told which
 * source it got so the UI can be honest about it.
 */
import type { ImageSignature } from '../analysis/imageSignature';
import { buildModelImage } from '../analysis/imageThumbnail';
import { heuristicIntent } from '../intent/heuristicIntent';
import { parseSceneIntent, type SceneIntent } from '../intent/sceneIntent';

/** Same-origin by default so a dev proxy or a co-hosted server both work. */
const SCENE_INTENT_ENDPOINT = '/api/ai/scene-intent';

/** A model call that hasn't answered by now is worse than the heuristic. */
/**
 * Local LLMs (e.g. a 27B generation on CPU) can take well over 30s; the offline
 * heuristic only fires when this elapses, so a generous bound keeps local
 * models usable. Hosted Claude answers in ~2s, so this rarely matters there.
 */
const REQUEST_TIMEOUT_MS = 90_000;

export type SceneIntentSource = 'model' | 'heuristic';

export type SceneIntentResult = {
	intent: SceneIntent;
	source: SceneIntentSource;
	/** Why the model path was not used, when `source` is 'heuristic'. */
	fallbackReason?: string;
	/** Fields the server returned that failed validation (model path only). */
	rejected?: string[];
};

export type RequestSceneIntentOptions = {
	signature: ImageSignature;
	/** Image URL to send a 256px rendition of. Omit for a signature-only call. */
	imageUrl?: string | null;
	/** Free-text steer from the user ("make it calmer", "more retro"). */
	guidance?: string;
	signal?: AbortSignal;
	/** Scene-service base URL (see `sceneServiceBaseUrl` in the store).
	 *  '' / undefined means same-origin. */
	baseUrl?: string;
	/** Model to ask for, when the service offers several. '' / undefined
	 *  leaves the choice to the server. */
	model?: string;
};

/** Join a configured base URL with an API path; '' means same-origin. */
export function sceneServiceUrl(baseUrl: string | undefined, path: string) {
	return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path;
}

function heuristicResult(
	signature: ImageSignature,
	reason: string
): SceneIntentResult {
	return {
		intent: heuristicIntent(signature),
		source: 'heuristic',
		fallbackReason: reason
	};
}

/**
 * Ask the server for a scene intent, falling back to the local heuristic.
 *
 * The heuristic result is also sent as a `seed`: it is cheaper and more
 * consistent for a model to adjust a concrete starting point than to invent a
 * scene from nothing, and it gives the server something to return unchanged if
 * its own model call fails.
 */
export async function requestSceneIntent(
	options: RequestSceneIntentOptions
): Promise<SceneIntentResult> {
	const { signature, imageUrl, guidance, signal } = options;
	const seed = heuristicIntent(signature);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	const onExternalAbort = () => controller.abort();
	signal?.addEventListener('abort', onExternalAbort);

	try {
		// A failure building the image must not lose the whole request — the
		// server can still work from the signature alone.
		let image: Awaited<ReturnType<typeof buildModelImage>> | null = null;
		if (imageUrl) {
			try {
				image = await buildModelImage(imageUrl);
			} catch {
				image = null;
			}
		}

		const response = await fetch(
			sceneServiceUrl(options.baseUrl, SCENE_INTENT_ENDPOINT),
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					signature,
					seed,
					guidance,
					image,
					...(options.model ? { model: options.model } : {})
				}),
				signal: controller.signal
			}
		);

		if (!response.ok) {
			return heuristicResult(
				signature,
				`server responded ${response.status}`
			);
		}

		const payload: unknown = await response.json();
		const raw =
			typeof payload === 'object' &&
			payload !== null &&
			'intent' in payload
				? (payload as { intent: unknown }).intent
				: payload;

		// The server is not trusted either: its answer goes through the same
		// validator as any other untrusted JSON.
		const { intent, rejected } = parseSceneIntent(raw);

		// Every field rejected means we effectively got the default back — the
		// heuristic is a better answer than a neutral grey scene.
		if (rejected.includes('<root>')) {
			return heuristicResult(
				signature,
				'server returned a malformed intent'
			);
		}

		return { intent, source: 'model', rejected };
	} catch (error) {
		const reason =
			error instanceof DOMException && error.name === 'AbortError'
				? signal?.aborted
					? 'cancelled'
					: 'request timed out'
				: 'could not reach the scene service';
		return heuristicResult(signature, reason);
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener('abort', onExternalAbort);
	}
}

/** What `/api/health` says about the scene-intent provider. */
export type SceneIntentServiceStatus = {
	/** The server answered with a health payload. */
	reachable: boolean;
	/** A provider is configured and its runtime reports ready. */
	providerReady: boolean;
	/** Which provider the server picked ('anthropic' | 'ollama' | …). */
	provider: string | null;
	/** Why not ready, when `providerReady` is false. */
	reason: string | null;
	/** Models the service offers, when it can enumerate them. */
	models: string[];
	/** The one it would use with no explicit choice. */
	activeModel: string | null;
};

/**
 * Ask the server which provider it selected and whether it is ready.
 *
 * This goes to `/api/health`, NOT an OPTIONS on the endpoint itself: the
 * CORS middleware answers OPTIONS for every path, so an OPTIONS probe would
 * report "available" even with no provider configured. The health payload
 * is the only place that distinguishes "wrong URL" from "not configured"
 * from "provider up but its runtime is down" (e.g. Ollama not running).
 */
export async function probeSceneIntentService(
	baseUrl?: string
): Promise<SceneIntentServiceStatus> {
	try {
		const response = await fetch(sceneServiceUrl(baseUrl, '/api/health'));
		if (!response.ok) {
			return {
				reachable: false,
				providerReady: false,
				provider: null,
				reason: `health responded ${response.status}`,
				models: [],
				activeModel: null
			};
		}
		const payload: unknown = await response.json();
		if (
			typeof payload !== 'object' ||
			payload === null ||
			!('sceneIntent' in payload) ||
			typeof payload.sceneIntent !== 'object' ||
			payload.sceneIntent === null ||
			!('ok' in payload.sceneIntent)
		) {
			return {
				reachable: false,
				providerReady: false,
				provider: null,
				reason: 'health payload has no sceneIntent field',
				models: [],
				activeModel: null
			};
		}
		const scene = payload.sceneIntent;
		return {
			reachable: true,
			providerReady: scene.ok === true,
			provider:
				'provider' in scene && typeof scene.provider === 'string'
					? scene.provider
					: null,
			reason:
				'reason' in scene && typeof scene.reason === 'string'
					? scene.reason
					: null,
			models:
				'models' in scene && Array.isArray(scene.models)
					? scene.models.filter(
							(entry): entry is string =>
								typeof entry === 'string'
						)
					: [],
			activeModel:
				'model' in scene && typeof scene.model === 'string'
					? scene.model
					: null
		};
	} catch {
		return {
			reachable: false,
			providerReady: false,
			provider: null,
			reason: 'could not reach the scene service',
			models: [],
			activeModel: null
		};
	}
}
