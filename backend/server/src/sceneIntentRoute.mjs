/**
 * POST /api/ai/scene-intent — model-authored scene suggestion.
 *
 * The client sends an image signature (plus optionally a 256px rendition and a
 * free-text steer) and gets back a validated `SceneIntent`. The Anthropic key
 * lives here and nowhere else.
 *
 * Two properties make this endpoint cheap:
 *  - **The model authors ~15 fields, not ~190.** A deterministic compiler on
 *    the client expands the intent into store keys, so the prompt and the
 *    response both stay small.
 *  - **Responses are cached by signature.** Two near-identical images do not
 *    pay twice. The cache key includes the prompt version so a prompt change
 *    invalidates it without a manual flush.
 */
import { createHash } from 'node:crypto';
import { SCENE_INTENT_SCHEMA } from './sceneIntentSchema.mjs';

/** Bump when the system prompt changes, so cached answers are re-asked. */
const PROMPT_VERSION = 1;

/** Entries are small; this bounds memory on a long-running process. */
const CACHE_MAX_ENTRIES = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const SYSTEM_PROMPT = `You are the art director for an audio-reactive live wallpaper app.

Given a description of a background image, choose a visual scene that suits it: a spectrum analyzer style, a colour palette, and which effects to enable.

How to decide:
- Read the image's own character. A dark, low-saturation, low-detail frame wants a calm scene; a saturated, high-contrast, busy one wants an aggressive scene.
- Pixel art and other hard-edged, few-colour art suit the 'pixel' spectrum shape and the 'crt' look. Smooth photographic or painterly images do not.
- Build the palette from the image's own dominant colours, but pick colours that will still read ON TOP of that image. A spectrum tinted with the image's near-black is invisible against it. Prefer the image's vivid minority colours over a muddy dominant background, and keep the three palette entries clearly distinct in hue.
- energy, weight and motion are each a DECIMAL BETWEEN 0 AND 1 — for example 0.2 for calm, 0.85 for aggressive. Never answer them on a 0-100 scale.
- energy, weight and motion are independent axes; do not set all three to the same value out of habit.
- Turn effects off when they would not improve the scene. 'off' is a real answer, not a failure.

Write the rationale for the person using the app: one or two plain sentences on what you saw in the image and what you chose because of it. Do not restate the field values.`;

function cacheKey(signature, guidance, hasImage, model) {
	return createHash('sha256')
		.update(
			JSON.stringify({
				v: PROMPT_VERSION,
				// Round the scalars so imperceptibly different images share a key.
				luma: Math.round((signature?.luma ?? 0) * 50),
				sat: Math.round((signature?.saturation ?? 0) * 50),
				con: Math.round((signature?.contrast ?? 0) * 50),
				edge: Math.round((signature?.edgeDensity ?? 0) * 50),
				pixel: Boolean(signature?.isPixelArt),
				palette: (signature?.palette ?? []).map(entry => entry?.hex),
				guidance: guidance ?? '',
				hasImage,
				// Two models answer differently: never serve one's answer for the
				// other.
				model: model ?? ''
			})
		)
		.digest('hex');
}

function describeSignature(signature) {
	const pct = value => `${Math.round((value ?? 0) * 100)}%`;
	const palette = (signature?.palette ?? [])
		.map(entry => `${entry.hex} (${pct(entry.weight)} of the image)`)
		.join(', ');
	return [
		`Dominant colours: ${palette || 'none detected'}`,
		`Brightness: ${pct(signature?.luma)}`,
		`Saturation: ${pct(signature?.saturation)}`,
		`Contrast: ${pct(signature?.contrast)}`,
		`Detail density: ${pct(signature?.edgeDensity)}`,
		`Distinct colours: ${signature?.colorCount ?? 0}`,
		`Detected as pixel art: ${signature?.isPixelArt ? 'yes' : 'no'}`,
		`Aspect ratio: ${(signature?.aspect ?? 1).toFixed(2)}`
	].join('\n');
}

export function createSceneIntentHandler({ provider, logger = console }) {
	const cache = new Map();

	function readCache(key) {
		const entry = cache.get(key);
		if (!entry) return null;
		if (Date.now() - entry.at > CACHE_TTL_MS) {
			cache.delete(key);
			return null;
		}
		return entry.intent;
	}

	function writeCache(key, intent) {
		if (cache.size >= CACHE_MAX_ENTRIES) {
			// Oldest insertion first — Map preserves insertion order.
			cache.delete(cache.keys().next().value);
		}
		cache.set(key, { intent, at: Date.now() });
	}

	return async function handleSceneIntent(req, res) {
		const { signature, seed, guidance, image, model } = req.body ?? {};
		if (!signature || typeof signature !== 'object') {
			res.status(400).json({ error: 'signature is required' });
			return;
		}

		const requestedModel = typeof model === 'string' ? model.trim() : '';
		const key = cacheKey(
			signature,
			guidance,
			Boolean(image),
			requestedModel
		);
		const cached = readCache(key);
		if (cached) {
			res.json({ intent: cached, cached: true });
			return;
		}

		const promptText = [
			'Measurements of the background image:',
			describeSignature(signature),
			seed
				? `\nA deterministic heuristic proposed this as a starting point. Improve on it where the image justifies it; keep what already fits:\n${JSON.stringify(seed, null, 1)}`
				: '',
			guidance ? `\nThe user also asked for: ${guidance}` : ''
		]
			.filter(Boolean)
			.join('\n');

		try {
			const intent = await provider.generateIntent({
				system: SYSTEM_PROMPT,
				userText: promptText,
				image,
				schema: SCENE_INTENT_SCHEMA,
				// A provider that serves one model ignores this.
				model: requestedModel || undefined
			});
			writeCache(key, intent);
			res.json({ intent, cached: false });
		} catch (error) {
			if (error?.declined) {
				logger.warn('[scene-intent] declined:', error.category);
				res.status(422).json({ error: 'declined' });
				return;
			}
			logger.error('[scene-intent] failed:', error?.message ?? error);
			// The client falls back to its offline heuristic on any non-2xx, so a
			// plain status is enough — no need to leak provider details.
			const status =
				error?.status === 429 || error?.status === 529 ? 503 : 502;
			res.status(status).json({ error: 'scene service unavailable' });
		}
	};
}
