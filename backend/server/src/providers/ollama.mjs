/**
 * Local-model provider (Ollama).
 *
 * Why this fits the AI Director unusually well:
 *  - The model authors a ~15-field `SceneIntent`, not raw configuration, so an
 *    8B model on a laptop is enough. The heavy lifting is the deterministic
 *    compiler on the client.
 *  - Ollama enforces a JSON Schema through its `format` parameter, so the
 *    output shape is constrained the same way the hosted provider constrains
 *    it — not coaxed with prompt text.
 *  - No key, no quota, no network. The signature alone carries palette, luma,
 *    contrast, edge density and the pixel-art flag, so a text-only model works;
 *    an image is sent only when the configured model actually accepts one.
 */

/** Default host for a stock Ollama install. */
const DEFAULT_HOST = 'http://127.0.0.1:11434';

/**
 * Local models are slower than a hosted API — a cold model has to load into
 * memory first. This is deliberately generous, and still bounded so a wedged
 * runtime cannot hang the request forever.
 */
const REQUEST_TIMEOUT_MS = 180_000;

export function createOllamaProvider({
	host = process.env.OLLAMA_HOST || DEFAULT_HOST,
	model = process.env.OLLAMA_MODEL || 'qwen3:8b',
	/** Set for a vision model (llava, qwen2.5-vl, moondream…). Text-only models
	 *  reject images, so this stays off unless explicitly enabled. */
	supportsImages = process.env.OLLAMA_VISION === '1',
	logger = console
} = {}) {
	return {
		name: `ollama:${model}`,

		async generateIntent({
			system,
			userText,
			image,
			schema,
			// The UI can pick among the models Ollama has pulled; anything else
			// falls back to the configured one.
			model: requested
		}) {
			const activeModel = requested || model;
			const message = { role: 'user', content: userText };
			if (image?.base64 && supportsImages) {
				// Ollama takes bare base64 strings in `images`, no data: prefix.
				message.images = [image.base64];
			}

			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REQUEST_TIMEOUT_MS
			);

			try {
				const response = await fetch(`${host}/api/chat`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					signal: controller.signal,
					body: JSON.stringify({
						model: activeModel,
						stream: false,
						// The schema is enforced by the runtime, not requested in prose.
						format: schema,
						// Reasoning models otherwise spend the whole token budget
						// thinking and return empty content for a task this small.
						think: false,
						messages: [
							{ role: 'system', content: system },
							message
						],
						options: {
							// Low temperature: this is a constrained choice, not prose.
							temperature: 0.4,
							num_predict: 1024
						}
					})
				});

				if (!response.ok) {
					throw new Error(
						`Ollama responded ${response.status}: ${await response.text()}`
					);
				}

				const payload = await response.json();
				const content = payload?.message?.content?.trim();
				if (!content) throw new Error('Ollama returned empty content');
				return JSON.parse(content);
			} finally {
				clearTimeout(timeout);
			}
		},

		/** Whether the runtime is up and the configured model is present. */
		async health() {
			try {
				const response = await fetch(`${host}/api/tags`, {
					signal: AbortSignal.timeout(3000)
				});
				if (!response.ok) return { ok: false, reason: 'unreachable' };
				const { models = [] } = await response.json();
				const names = models.map(entry => entry.name);
				return names.includes(model)
					? { ok: true, model, models: names }
					: {
							ok: false,
							reason: `model ${model} not pulled`,
							models: names
						};
			} catch (error) {
				logger.warn('[ollama] health check failed:', error?.message);
				return { ok: false, reason: 'unreachable' };
			}
		}
	};
}
