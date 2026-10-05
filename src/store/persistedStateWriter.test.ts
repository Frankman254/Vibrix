import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersistedStateWriter } from './persistedStateWriter';
import {
	clearPersistenceFailure,
	getPersistenceFailureSnapshot
} from './persistenceStatus';

function quotaError(): Error {
	const error = new Error(
		'The operation failed because it would cause the application to exceed its storage quota.'
	);
	error.name = 'QuotaExceededError';
	return error;
}

/** A storage that records every write and can be told to start refusing. */
function fakeStorage() {
	const values = new Map<string, string>();
	const writes: { name: string; value: string }[] = [];
	let failWith: Error | null = null;
	return {
		values,
		writes,
		fail: (error: Error | null) => {
			failWith = error;
		},
		storage: {
			getItem: (name: string) => values.get(name) ?? null,
			setItem: async (name: string, value: string) => {
				if (failWith) throw failWith;
				writes.push({ name, value });
				values.set(name, value);
			},
			removeItem: async (name: string) => {
				values.delete(name);
			}
		}
	};
}

describe('createPersistedStateWriter', () => {
	let consoleError: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.useFakeTimers();
		clearPersistenceFailure();
		consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		consoleError.mockRestore();
	});

	it('collapses a burst of mutations into one write of the final value', async () => {
		// The reported defect: dragging a slider serialized the whole project
		// on every frame. 60 mutations must cost one write, not 60.
		const inner = fakeStorage();
		const writer = createPersistedStateWriter(inner.storage, {
			delayMs: 100,
			maxDelayMs: 1_000
		});
		for (let i = 0; i < 60; i += 1) {
			writer.storage.setItem('vibrix-state', `{"v":${i}}`);
			vi.advanceTimersByTime(1);
		}
		expect(inner.writes).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(200);
		expect(inner.writes).toEqual([
			{ name: 'vibrix-state', value: '{"v":59}' }
		]);
		expect(writer.getStats().coalesced).toBe(59);
	});

	it('still saves during a drag that never pauses', async () => {
		const inner = fakeStorage();
		const writer = createPersistedStateWriter(inner.storage, {
			delayMs: 100,
			maxDelayMs: 300
		});
		// A mutation every 50ms: the trailing debounce alone would never fire.
		for (let i = 0; i < 20; i += 1) {
			writer.storage.setItem('vibrix-state', `{"v":${i}}`);
			await vi.advanceTimersByTimeAsync(50);
		}
		expect(inner.writes.length).toBeGreaterThan(0);
		expect(writer.isSuspended()).toBe(false);
	});

	it('stops writing after a failure instead of hammering a full quota', async () => {
		const inner = fakeStorage();
		const writer = createPersistedStateWriter(inner.storage, {
			delayMs: 10,
			maxDelayMs: 50
		});
		inner.fail(quotaError());

		writer.storage.setItem('vibrix-state', '{"v":1}');
		await vi.advanceTimersByTimeAsync(50);
		expect(writer.isSuspended()).toBe(true);
		expect(getPersistenceFailureSnapshot()?.kind).toBe('quota');

		// Everything the user does afterwards: not one further attempt.
		const callsAfterBreak = consoleError.mock.calls.length;
		for (let i = 0; i < 50; i += 1) {
			writer.storage.setItem('vibrix-state', `{"v":${i}}`);
		}
		await vi.advanceTimersByTimeAsync(5_000);
		expect(consoleError.mock.calls.length).toBe(callsAfterBreak);
	});

	it('keeps the project alive and retries the CURRENT state, not the stale one', async () => {
		const inner = fakeStorage();
		const writer = createPersistedStateWriter(inner.storage, {
			delayMs: 10,
			maxDelayMs: 50
		});
		inner.fail(quotaError());
		writer.storage.setItem('vibrix-state', '{"v":1}');
		await vi.advanceTimersByTimeAsync(50);

		// The user keeps working while saving is paused.
		writer.storage.setItem('vibrix-state', '{"v":2}');
		writer.storage.setItem('vibrix-state', '{"v":3}');
		expect(writer.getStats().pendingKeys).toEqual(['vibrix-state']);
		// Nothing was deleted to recover from the quota error.
		expect(inner.values.size).toBe(0);

		inner.fail(null);
		await writer.retry();
		expect(writer.isSuspended()).toBe(false);
		expect(inner.values.get('vibrix-state')).toBe('{"v":3}');
	});

	it('leaves the breaker closed when the retry fails again', async () => {
		const inner = fakeStorage();
		const writer = createPersistedStateWriter(inner.storage, {
			delayMs: 10,
			maxDelayMs: 50
		});
		inner.fail(quotaError());
		writer.storage.setItem('vibrix-state', '{"v":1}');
		await vi.advanceTimersByTimeAsync(50);

		await writer.retry();
		expect(writer.isSuspended()).toBe(true);
		// Still held, so the next retry has something to write.
		expect(writer.getStats().pendingKeys).toEqual(['vibrix-state']);
	});

	it('flush writes immediately, for the moments that must be committed', async () => {
		const inner = fakeStorage();
		const writer = createPersistedStateWriter(inner.storage, {
			delayMs: 10_000,
			maxDelayMs: 60_000
		});
		writer.storage.setItem('vibrix-state', '{"v":7}');
		await writer.flush();
		expect(inner.values.get('vibrix-state')).toBe('{"v":7}');
	});

	it('does not defer a delete behind a pending write of the same key', async () => {
		// "Clear saved settings" must not be undone a second later by a
		// debounced write that was still in flight.
		const inner = fakeStorage();
		const writer = createPersistedStateWriter(inner.storage, {
			delayMs: 100,
			maxDelayMs: 1_000
		});
		writer.storage.setItem('vibrix-state', '{"v":1}');
		await writer.storage.removeItem('vibrix-state');
		await vi.advanceTimersByTimeAsync(1_000);
		expect(inner.values.has('vibrix-state')).toBe(false);
		expect(inner.writes).toHaveLength(0);
	});

	it('reads through to storage, debounce or not', () => {
		const inner = fakeStorage();
		inner.values.set('vibrix-state', '{"v":0}');
		const writer = createPersistedStateWriter(inner.storage);
		expect(writer.storage.getItem('vibrix-state')).toBe('{"v":0}');
	});
});
