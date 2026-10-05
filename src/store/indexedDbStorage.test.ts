import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	clearPersistedState,
	indexedDbStorage,
	resetIndexedDbStorageForTests
} from './indexedDbStorage';

const local = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => local.get(k) ?? null,
	setItem: (k: string, v: string) => void local.set(k, v),
	removeItem: (k: string) => void local.delete(k),
	clear: () => void local.clear()
};

describe('indexedDbStorage', () => {
	beforeEach(() => {
		local.clear();
		resetIndexedDbStorageForTests();
	});

	it('misses on an unknown key', async () => {
		expect(await indexedDbStorage.getItem('nothing-here')).toBeNull();
	});

	it('round-trips a value', async () => {
		await indexedDbStorage.setItem('k1', JSON.stringify({ a: 1 }));
		expect(await indexedDbStorage.getItem('k1')).toBe('{"a":1}');
	});

	it('stores far more than the localStorage quota would allow', async () => {
		// The whole reason for the switch: a real project exceeds ~5 MB.
		const big = JSON.stringify({ blob: 'x'.repeat(8 * 1024 * 1024) });
		await indexedDbStorage.setItem('big', big);
		expect((await indexedDbStorage.getItem('big'))?.length).toBe(
			big.length
		);
	});

	it('adopts an existing localStorage state on first read', async () => {
		// An install that predates the switch must keep its project.
		local.set('adopt-me', JSON.stringify({ state: { legacy: true } }));

		const first = await indexedDbStorage.getItem('adopt-me');
		expect(first).toContain('legacy');

		// And it is now in IndexedDB, so a later localStorage wipe is harmless.
		local.clear();
		expect(await indexedDbStorage.getItem('adopt-me')).toContain('legacy');
	});

	it('adopts the pre-rename localStorage key', async () => {
		// The app was `lwag-*` until the Vibrix rename. Reading the new name
		// must still find the old payload, or the user's library reads empty.
		local.set('lwag-state', JSON.stringify({ state: { fromLwag: true } }));

		expect(await indexedDbStorage.getItem('vibrix-state')).toContain(
			'fromLwag'
		);

		// Adopted into IndexedDB under the new name, so it survives a wipe of
		// the old one.
		local.clear();
		expect(await indexedDbStorage.getItem('vibrix-state')).toContain(
			'fromLwag'
		);
	});

	it('prefers the new key over the pre-rename one', async () => {
		// Same key as the test above, and IndexedDB persists between tests, so
		// the new name has to win over what is already adopted there.
		local.set('lwag-state', JSON.stringify({ state: { which: 'old' } }));
		await indexedDbStorage.setItem(
			'vibrix-state',
			JSON.stringify({ state: { which: 'new' } })
		);
		expect(await indexedDbStorage.getItem('vibrix-state')).toContain('new');
	});

	it('prefers IndexedDB over a stale localStorage copy', async () => {
		await indexedDbStorage.setItem('k2', JSON.stringify({ from: 'idb' }));
		local.set('k2', JSON.stringify({ from: 'localStorage' }));
		expect(await indexedDbStorage.getItem('k2')).toContain('idb');
	});

	it('ignores corrupted payloads instead of throwing', async () => {
		// Persist would crash the editor on a parse error; falling back to
		// defaults is recoverable.
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		await indexedDbStorage.setItem('broken', '{not json');
		expect(await indexedDbStorage.getItem('broken')).toBeNull();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it('ignores a corrupted legacy localStorage value', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		local.set('legacy-broken', 'not json at all');
		expect(await indexedDbStorage.getItem('legacy-broken')).toBeNull();
		spy.mockRestore();
	});

	it('removes from both stores', async () => {
		await indexedDbStorage.setItem('k3', '{"a":1}');
		local.set('k3', '{"a":1}');
		await indexedDbStorage.removeItem('k3');

		expect(await indexedDbStorage.getItem('k3')).toBeNull();
		expect(local.get('k3')).toBeUndefined();
	});

	it('clearPersistedState does not let the pre-rename copy come back', async () => {
		await indexedDbStorage.setItem('vibrix-state', '{"state":{"now":1}}');
		local.set('vibrix-state', '{"state":{"now":1}}');
		local.set('lwag-state', '{"state":{"old":1}}');

		await clearPersistedState('vibrix-state');

		// Without the legacy wipe, getItem would adopt `lwag-state` here.
		expect(await indexedDbStorage.getItem('vibrix-state')).toBeNull();
		expect(local.get('lwag-state')).toBeUndefined();
	});

	it('falls back to localStorage when IndexedDB is unavailable', async () => {
		const realIndexedDb = globalThis.indexedDB;
		// @ts-expect-error — simulating a browser with storage blocked.
		delete globalThis.indexedDB;
		resetIndexedDbStorageForTests();

		try {
			await indexedDbStorage.setItem('k4', '{"a":2}');
			expect(local.get('k4')).toBe('{"a":2}');
			expect(await indexedDbStorage.getItem('k4')).toBe('{"a":2}');
		} finally {
			globalThis.indexedDB = realIndexedDb;
			resetIndexedDbStorageForTests();
		}
	});

	it('rejects when the fallback storage refuses the write', async () => {
		const realIndexedDb = globalThis.indexedDB;
		// @ts-expect-error — simulating a browser with storage blocked.
		delete globalThis.indexedDB;
		resetIndexedDbStorageForTests();

		const setItem = vi
			.spyOn(globalThis.localStorage, 'setItem')
			.mockImplementation(() => {
				const error = new Error('quota');
				error.name = 'QuotaExceededError';
				throw error;
			});

		try {
			// The rejection is the contract: swallowing it here is what let
			// persist keep pushing the whole project at a full quota forever.
			// `createPersistedStateWriter` is the one caller, and it needs the
			// failure to open its breaker and hold the value for a retry — it
			// is also what keeps this from crashing the editor.
			await expect(
				indexedDbStorage.setItem('k5', '{"a":3}')
			).rejects.toThrow(/quota/);
		} finally {
			setItem.mockRestore();
			globalThis.indexedDB = realIndexedDb;
			resetIndexedDbStorageForTests();
		}
	});
});
