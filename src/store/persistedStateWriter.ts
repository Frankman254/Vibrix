/**
 * Debounced, coalescing, self-limiting writer for the persisted project state.
 *
 * Two defects in the previous arrangement — Zustand's persist middleware
 * talking straight to `indexedDbStorage` — are what turned a full quota into
 * the reported "Changes are not being saved":
 *
 *  - **A write per mutation.** Dragging one slider fires `set` on every
 *    animation frame, and each one serialized the COMPLETE project (a 200-image
 *    pool, 120 spectrum slots, every scene and setlist) and pushed it into
 *    IndexedDB. Tens of megabytes a second of writes for a few edited numbers.
 *    A trailing debounce collapses that burst into one write of the final value;
 *    `maxDelayMs` stops a continuous drag from deferring the write forever.
 *  - **Retrying forever after it broke.** Once the quota was full, every
 *    subsequent mutation tried again, failed again, and logged again — a steady
 *    stream of rejected transactions competing with the export that filled the
 *    disk in the first place. Here the first failure opens a circuit breaker:
 *    automatic writes stop until something calls `retry()`.
 *
 * What the breaker deliberately does NOT do is touch the user's data. The
 * in-memory project keeps running untouched and the newest pending value is
 * kept so a manual retry writes the CURRENT state, not a stale one. Recovering
 * from a quota error by deleting a project would be trading a warning for the
 * loss it warns about.
 */
import { reportPersistenceFailure } from '@/store/persistenceStatus';

/** The string-keyed contract `createJSONStorage` expects. */
export type StringStorage = {
	getItem(name: string): Promise<string | null> | string | null;
	setItem(name: string, value: string): Promise<void> | void;
	removeItem(name: string): Promise<void> | void;
};

export type PersistedStateWriterOptions = {
	/** Quiet period after the last mutation before writing. */
	delayMs?: number;
	/** Hard ceiling on deferral, so a continuous drag still gets saved. */
	maxDelayMs?: number;
};

export type PersistedStateWriterStats = {
	/** Writes that actually reached storage. */
	writes: number;
	/** Mutations absorbed by the debounce without their own write. */
	coalesced: number;
	suspended: boolean;
	pendingKeys: string[];
	lastWriteAt: number | null;
	lastErrorName: string | null;
};

const DEFAULT_DELAY_MS = 1_200;
const DEFAULT_MAX_DELAY_MS = 5_000;

export type PersistedStateWriter = {
	/** Hand this to `createJSONStorage`. */
	storage: StringStorage;
	/** Write anything pending now. Resolves when storage has it (or failed). */
	flush(): Promise<void>;
	/** Close the breaker and try the pending value again. */
	retry(): Promise<void>;
	isSuspended(): boolean;
	getStats(): PersistedStateWriterStats;
};

export function createPersistedStateWriter(
	inner: StringStorage,
	options: PersistedStateWriterOptions = {}
): PersistedStateWriter {
	const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
	const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

	let pending = new Map<string, string>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let queuedAt = 0;
	let suspended = false;
	// Writes are chained rather than overlapped: two concurrent transactions
	// putting the same key race, and the loser silently wins half the time.
	let chain: Promise<void> = Promise.resolve();
	let writes = 0;
	let coalesced = 0;
	let lastWriteAt: number | null = null;
	let lastErrorName: string | null = null;

	function clearTimer(): void {
		if (timer === null) return;
		clearTimeout(timer);
		timer = null;
	}

	function schedule(): void {
		if (suspended || pending.size === 0) return;
		const waited = Date.now() - queuedAt;
		const wait = Math.max(0, Math.min(delayMs, maxDelayMs - waited));
		clearTimer();
		timer = setTimeout(() => {
			timer = null;
			void flush();
		}, wait);
	}

	function flush(): Promise<void> {
		clearTimer();
		if (pending.size === 0) return chain;
		const batch = pending;
		pending = new Map();
		chain = chain.then(async () => {
			for (const [name, value] of batch) {
				try {
					await inner.setItem(name, value);
					writes += 1;
					lastWriteAt = Date.now();
				} catch (error) {
					lastErrorName =
						error && typeof error === 'object' && 'name' in error
							? String(error.name)
							: 'Error';
					// Open the breaker BEFORE keeping the value, so a mutation
					// arriving during this await does not reschedule a write.
					suspended = true;
					// Keep it for a manual retry — but never over a newer value
					// that arrived while this write was in flight.
					if (!pending.has(name)) pending.set(name, value);
					console.error(
						`[vibrix] Failed to persist ${name}. The project is still running in memory; automatic saving is paused until you retry.`,
						error
					);
					reportPersistenceFailure(name, error);
				}
			}
		});
		return chain;
	}

	const storage: StringStorage = {
		getItem: name => inner.getItem(name),
		setItem(name, value) {
			if (pending.size === 0) queuedAt = Date.now();
			if (pending.has(name)) coalesced += 1;
			pending.set(name, value);
			schedule();
		},
		async removeItem(name) {
			// Deletion is explicit user intent ("Clear saved settings") and must
			// not be debounced behind a pending write of what is being deleted.
			clearTimer();
			pending.delete(name);
			await inner.removeItem(name);
		}
	};

	return {
		storage,
		flush,
		async retry() {
			suspended = false;
			queuedAt = Date.now();
			await flush();
		},
		isSuspended: () => suspended,
		getStats: () => ({
			writes,
			coalesced,
			suspended,
			pendingKeys: [...pending.keys()],
			lastWriteAt,
			lastErrorName
		})
	};
}

/**
 * Flush on the way out of the page.
 *
 * The debounce means up to `delayMs` of edits are in memory only at any moment,
 * so a close or a tab switch has to spend them. `visibilitychange → hidden` is
 * the reliable hook (`pagehide` can be cut short, and `beforeunload` is not
 * fired at all on mobile), but both are registered: the cost of an extra flush
 * is one no-op when there is nothing pending.
 */
export function attachLifecycleFlush(writer: PersistedStateWriter): () => void {
	if (typeof document === 'undefined') return () => {};
	const flush = () => {
		void writer.flush();
	};
	const onVisibility = () => {
		if (document.visibilityState === 'hidden') flush();
	};
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('pagehide', flush);
	return () => {
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('pagehide', flush);
	};
}
