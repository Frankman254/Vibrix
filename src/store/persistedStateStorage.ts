/**
 * The single writer the persisted project state goes through.
 *
 * One instance per page: the debounce and the circuit breaker only mean
 * anything if every mutation funnels through the same one. See
 * `createPersistedStateWriter` for why both exist.
 */
import { indexedDbStorage } from '@/store/indexedDbStorage';
import {
	attachLifecycleFlush,
	createPersistedStateWriter
} from '@/store/persistedStateWriter';

export const persistedStateWriter =
	createPersistedStateWriter(indexedDbStorage);

attachLifecycleFlush(persistedStateWriter);

/**
 * Save now instead of waiting out the debounce. For moments the user reads as
 * a commit — finishing an import, applying a scene — and before anything that
 * is about to compete for storage, like an export.
 */
export function flushPersistedState(): Promise<void> {
	return persistedStateWriter.flush();
}

/**
 * Try again after a failed save, and resume automatic saving if it works.
 * Writes the CURRENT state, not the one that failed.
 */
export function retryPersistedState(): Promise<void> {
	return persistedStateWriter.retry();
}

export function isPersistenceSuspended(): boolean {
	return persistedStateWriter.isSuspended();
}
