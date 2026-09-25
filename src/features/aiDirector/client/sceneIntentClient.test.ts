import { describe, expect, it, vi, afterEach } from 'vitest';
import { probeSceneIntentService } from './sceneIntentClient';

function jsonResponse(payload: unknown, ok = true, status = 200) {
	return { ok, status, json: async () => payload };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('probeSceneIntentService', () => {
	it('reports the configured provider when health says ready', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse({
					ok: true,
					sceneIntent: { ok: true, provider: 'anthropic' },
					sync: false
				})
			)
		);
		expect(await probeSceneIntentService()).toEqual({
			reachable: true,
			providerReady: true,
			provider: 'anthropic',
			reason: null,
			models: [],
			activeModel: null
		});
	});

	it('distinguishes provider-down from server-down', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse({
					ok: true,
					sceneIntent: {
						ok: false,
						reason: 'ollama runtime not reachable'
					}
				})
			)
		);
		const status = await probeSceneIntentService();
		expect(status.reachable).toBe(true);
		expect(status.providerReady).toBe(false);
		expect(status.reason).toBe('ollama runtime not reachable');
	});

	it('reports not-ready for the unconfigured server shape', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse({
					ok: true,
					sceneIntent: { ok: false, reason: 'not configured' }
				})
			)
		);
		const status = await probeSceneIntentService();
		expect(status.reachable).toBe(true);
		expect(status.providerReady).toBe(false);
		expect(status.provider).toBeNull();
	});

	it('never throws when the service is down', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('fetch failed');
			})
		);
		const status = await probeSceneIntentService();
		expect(status.reachable).toBe(false);
		expect(status.providerReady).toBe(false);
	});

	it('treats a junk health payload as unreachable rather than trusting it', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResponse({ everything: 'fine' }))
		);
		const status = await probeSceneIntentService();
		expect(status.reachable).toBe(false);
		expect(status.providerReady).toBe(false);
	});
});
