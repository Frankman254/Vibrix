/**
 * What the browser will actually let this origin store, and whether a failure
 * was about space.
 *
 * Every persistent surface in Vibrix — the project state (`vibrix-store`), the
 * asset pool (`lwag-images`), saved project bundles (`lwag-sync`) and the OPFS
 * scratch file a large export streams through — draws on ONE per-origin quota.
 * So an export big enough to fill it does not just fail itself: it takes state
 * persistence down with it, which is how a quota problem shows up as
 * "Changes are not being saved". Reading the numbers is the only way to tell
 * that story apart from an encoder or GL failure.
 */

export type StorageEstimateSnapshot = {
	usageBytes: number | null;
	quotaBytes: number | null;
	/** `quota - usage`, or null when the browser would not answer. */
	availableBytes: number | null;
	/** Whether this origin has persistent (non-evictable) storage. */
	persisted: boolean | null;
	/**
	 * Chrome's non-standard `usageDetails`: bytes per backend (indexedDB,
	 * caches, fileSystem…). The single most useful field when deciding whether
	 * the pool, the saved projects or export debris is eating the quota.
	 */
	breakdown: Record<string, number>;
};

export const EMPTY_STORAGE_ESTIMATE: StorageEstimateSnapshot = {
	usageBytes: null,
	quotaBytes: null,
	availableBytes: null,
	persisted: null,
	breakdown: {}
};

/**
 * Free bytes from a usage/quota pair, or null when either is missing.
 *
 * Chrome can report usage ABOVE its own quota (the ceiling shrinks as the disk
 * fills, and debris from a crashed run still counts), so a negative result is
 * the browser contradicting itself rather than proof of a full disk. It is
 * reported as 0 — no space to promise — never as a negative number callers
 * would have to special-case.
 */
export function availableBytesFrom(
	usageBytes: number | null,
	quotaBytes: number | null
): number | null {
	if (typeof usageBytes !== 'number' || typeof quotaBytes !== 'number') {
		return null;
	}
	return Math.max(0, quotaBytes - usageBytes);
}

function numberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBreakdown(estimate: StorageEstimate): Record<string, number> {
	const details = (
		estimate as StorageEstimate & {
			usageDetails?: Record<string, unknown>;
		}
	).usageDetails;
	if (!details) return {};
	const breakdown: Record<string, number> = {};
	for (const [key, value] of Object.entries(details)) {
		const bytes = numberOrNull(value);
		if (bytes !== null) breakdown[key] = bytes;
	}
	return breakdown;
}

/** The quota snapshot, never throwing: an unanswered question is nulls. */
export async function readStorageEstimate(): Promise<StorageEstimateSnapshot> {
	if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
		return EMPTY_STORAGE_ESTIMATE;
	}
	try {
		const estimate = await navigator.storage.estimate();
		const usageBytes = numberOrNull(estimate.usage);
		const quotaBytes = numberOrNull(estimate.quota);
		let persisted: boolean | null = null;
		try {
			persisted = (await navigator.storage.persisted?.()) ?? null;
		} catch {
			// Reported as unknown; it changes nothing about the numbers.
		}
		return {
			usageBytes,
			quotaBytes,
			availableBytes: availableBytesFrom(usageBytes, quotaBytes),
			persisted,
			breakdown: readBreakdown(estimate)
		};
	} catch {
		return EMPTY_STORAGE_ESTIMATE;
	}
}

/**
 * Ask for persistent (non-evictable) storage. Worth doing — it stops the
 * browser evicting a project under disk pressure, and on Chrome it raises the
 * share of free disk this origin may use — but it is NOT how large exports are
 * made to work: those stream to a file the user picked, outside the quota
 * entirely. Resolves false when the browser says no or cannot be asked.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
		return false;
	}
	try {
		if ((await navigator.storage.persisted?.()) === true) return true;
		return (await navigator.storage.persist()) === true;
	} catch {
		return false;
	}
}

/**
 * Whether this error is the browser refusing for lack of room, as opposed to an
 * encoder refusal, a GL failure or a plain I/O error. Name first, because
 * `QuotaExceededError` is the only reliable signal; the legacy numeric codes
 * cover old Safari/Firefox, and the message check catches wrappers that
 * stringified the cause instead of rethrowing it.
 */
export function isQuotaExceededError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const name = 'name' in error ? String(error.name) : '';
	if (
		name === 'QuotaExceededError' ||
		name === 'NS_ERROR_DOM_QUOTA_REACHED'
	) {
		return true;
	}
	const code = 'code' in error ? Number(error.code) : 0;
	if (code === 22 || code === 1014) return true;
	const message = 'message' in error ? String(error.message) : '';
	return /quota.?exceeded|exceed.{0,20}quota/i.test(message);
}

export function formatStorageBytes(bytes: number | null): string {
	if (bytes === null) return '?';
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

/** One console line: `usage 4.1 GB / quota 12 GB · 7.9 GB free · …`. */
export function formatStorageEstimate(
	snapshot: StorageEstimateSnapshot
): string {
	const parts = [
		`usage ${formatStorageBytes(snapshot.usageBytes)}`,
		`quota ${formatStorageBytes(snapshot.quotaBytes)}`,
		`${formatStorageBytes(snapshot.availableBytes)} available`
	];
	if (snapshot.persisted !== null) {
		parts.push(snapshot.persisted ? 'persistent' : 'evictable');
	}
	const breakdown = Object.entries(snapshot.breakdown)
		.filter(([, bytes]) => bytes > 0)
		.sort((a, b) => b[1] - a[1])
		.map(([key, bytes]) => `${key} ${formatStorageBytes(bytes)}`);
	if (breakdown.length > 0) parts.push(breakdown.join(', '));
	return parts.join(' · ');
}
