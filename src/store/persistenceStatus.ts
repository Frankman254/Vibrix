import { isQuotaExceededError } from '@/lib/db/storageDiagnostics';

export type PersistenceFailure = {
	id: number;
	storageName: string;
	kind: 'quota' | 'unavailable';
};

type Listener = () => void;

let failure: PersistenceFailure | null = null;
let nextFailureId = 1;
const listeners = new Set<Listener>();

/**
 * Was this failure about space, or about storage being unavailable?
 *
 * The distinction drives what the user is told: a quota failure has an action
 * ("free space or export the project"), an unavailable one does not ("private
 * mode / storage blocked"). The quota test itself lives in
 * `lib/db/storageDiagnostics` so the export path classifies it identically —
 * both surfaces compete for the same per-origin quota.
 */
export function classifyPersistenceFailure(
	error: unknown
): PersistenceFailure['kind'] {
	return isQuotaExceededError(error) ? 'quota' : 'unavailable';
}

export function reportPersistenceFailure(
	storageName: string,
	error: unknown
): void {
	if (failure?.storageName === storageName) return;
	failure = {
		id: nextFailureId,
		storageName,
		kind: classifyPersistenceFailure(error)
	};
	nextFailureId += 1;
	listeners.forEach(listener => listener());
}

export function clearPersistenceFailure(id?: number): void {
	if (!failure || (id !== undefined && failure.id !== id)) return;
	failure = null;
	listeners.forEach(listener => listener());
}

export function getPersistenceFailureSnapshot(): PersistenceFailure | null {
	return failure;
}

export function subscribePersistenceFailure(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
