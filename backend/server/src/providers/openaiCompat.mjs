/**
 * OpenAI-compatible provider (vLLM, LM Studio, llama.cpp server, Ollama /v1).
 *
 * Third adapter at the same seam as `ollama` and `anthropic`, so the route
 * still never learns which one ran. It exists because the interesting local
 * runtimes are not Ollama: a vLLM server (e.g. a DGx Spark on the tailnet)
 * speaks `/v1/chat/completions`, not Ollama's `/api/chat`, and one adapter per
 * dialect is cheaper than pretending they are the same thing.
 *
 * Structured output is requested the way these servers enforce it —
 * `response_format: { type: 'json_schema', json_schema: { strict: true } }` —
 * which is what keeps a small model from returning a shape the client has to
 * guess at. Verified against vLLM with the real `SCENE_INTENT_SCHEMA`.
 */

/** Local runtimes are slow to cold-load a model; stay generous but bounded. */
const REQUEST_TIMEOUT_MS = 180_000;

/** `http://host:port/v1/` and `http://host:port/v1` both mean the same place. */
function normalizeBase(host) {
	return String(host).replace(/\/+$/, '');
}

export function createOpenAiCompatProvider({
	host = process.env.OPENAI_BASE_URL || 'http://127.0.0.1:8000/v1',
	model = process.env.OPENAI_MODEL || '',
	/** Optional bearer token; local servers ignore it, hosted ones require it. */
	apiKey = process.env.OPENAI_API_KEY || '',
	/** Text-only is the safe default: a vision-less server rejects images. */
	supportsImages = process.env.OPENAI_VISION === '1',
	logger = console
} = {}) {
	const base = normalizeBase(host);

	const headers = { 'content-type': 'application/json' };
	if (apiKey) headers.authorization = `Bearer ${apiKey}`;

	// A shared single-model server (a DGX Spark whose operator swaps what it
	// serves) breaks every pinned id the day it changes. Leaving OPENAI_MODEL
	// unset — or 'auto' — asks the server what it is serving instead. Pin an id
	// when the server hosts several and the choice matters.
	const autoModel = !model || model === 'auto';
	let resolved = autoModel ? '' : model;

	async function listModels() {
		const response = await fetch(`${base}/models`, {
			headers,
			signal: AbortSignal.timeout(5000)
		});
		if (!response.ok)
			throw new Error(`models list HTTP ${response.status}`);
		const payload = await response.json();
		return (
			(Array.isArray(payload?.data) ? payload.data : [])
				.map(entry => entry?.id)
				.filter(Boolean)
				// LM Studio lists its embedding models here too, with nothing in the
				// entry to tell them apart. They cannot answer a chat completion, so
				// offering one in the UI — or auto-selecting it — only produces a
				// failed scene. The id is the only signal available.
				.filter(id => !/embed/i.test(id))
		);
	}

	/**
	 * The id to send. A caller's choice wins, but only if the server actually
	 * serves it: a stale pick from the UI must not turn every request into a
	 * 404 — falling back to the server's own model still produces a scene.
	 */
	async function modelId(requested) {
		if (requested) {
			const names = await listModels().catch(() => []);
			if (names.length === 0 || names.includes(requested))
				return requested;
			logger.warn(
				`[openai-compat] requested model ${requested} is not served; using the server's`
			);
		}
		if (!autoModel) return resolved;
		if (resolved) return resolved;
		const names = await listModels();
		if (names.length === 0) throw new Error('server serves no models');
		resolved = names[0];
		logger.log(`[openai-compat] auto-selected model ${resolved}`);
		return resolved;
	}

	return {
		get name() {
			return `openai:${resolved || (autoModel ? 'auto' : '(no model set)')}`;
		},

		async generateIntent({
			system,
			userText,
			image,
			schema,
			model: requested
		}) {
			const activeModel = await modelId(requested);
			const content = [];
			// Only send the image when the server was told the model takes one;
			// a text-only model answers 400 rather than ignoring it.
			if (image?.base64 && supportsImages) {
				content.push({
					type: 'image_url',
					image_url: {
						url: `data:${image.mediaType};base64,${image.base64}`
					}
				});
			}
			content.push({ type: 'text', text: userText });

			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REQUEST_TIMEOUT_MS
			);

			try {
				const response = await fetch(`${base}/chat/completions`, {
					method: 'POST',
					headers,
					signal: controller.signal,
					body: JSON.stringify({
						model: activeModel,
						stream: false,
						response_format: {
							type: 'json_schema',
							json_schema: {
								name: 'scene_intent',
								strict: true,
								schema
							}
						},
						messages: [
							{ role: 'system', content: system },
							{ role: 'user', content }
						],
						// vLLM-style reasoning servers take this and answer
						// directly; without it a thinking model spends the whole
						// budget on `reasoning` and leaves `content` empty.
						// Harmless elsewhere: unknown kwargs are ignored.
						chat_template_kwargs: { enable_thinking: false },
						temperature: 0.4,
						max_tokens: 1500
					})
				});

				if (!response.ok) {
					// The operator swapped the model out from under us: forget the
					// cached id so the next call asks the server again.
					if (response.status === 404 && autoModel) resolved = '';
					throw new Error(
						`${response.status}: ${(await response.text()).slice(0, 300)}`
					);
				}

				const payload = await response.json();
				const message = payload?.choices?.[0]?.message;
				// `content` is where the answer belongs, but a thinking model
				// behind LM Studio files its whole (schema-constrained) output
				// under `reasoning_content` and leaves `content` empty. Take the
				// first field that parses rather than failing on a right answer
				// filed in the wrong envelope.
				for (const field of [
					'content',
					'reasoning_content',
					'reasoning'
				]) {
					const value = message?.[field];
					if (typeof value !== 'string' || !value.trim()) continue;
					try {
						return JSON.parse(value.trim());
					} catch {
						// Prose, not the intent: keep looking.
					}
				}
				throw new Error(
					message?.reasoning || message?.reasoning_content
						? 'model returned reasoning but no answer (raise max_tokens or disable thinking)'
						: 'model returned empty content'
				);
			} finally {
				clearTimeout(timeout);
			}
		},

		/** Whether the server answers and actually serves the configured model. */
		async health() {
			try {
				const names = await listModels();
				if (autoModel) {
					// Auto mode follows the server, so it is healthy whenever the
					// server serves anything at all.
					if (names.length === 0) {
						return { ok: false, reason: 'server serves no models' };
					}
					if (!resolved || !names.includes(resolved)) {
						resolved = names[0];
					}
					return { ok: true, model: resolved, models: names };
				}
				return names.includes(model)
					? { ok: true, model, models: names }
					: {
							ok: false,
							reason: `model ${model} not served here`,
							models: names
						};
			} catch (error) {
				logger.warn(
					'[openai-compat] health check failed:',
					error?.message
				);
				return { ok: false, reason: 'unreachable' };
			}
		}
	};
}
