/**
 * Open an IndexedDB database and **guarantee** its object stores exist.
 *
 * The failure this exists for: a database that is already at the current
 * version but does not hold the store the code expects. `onupgradeneeded` only
 * runs when the version goes UP, so the store is never created, and every later
 * `db.transaction(store)` throws
 *
 *     NotFoundError: Failed to execute 'transaction' on 'IDBDatabase':
 *     One of the specified object stores was not found
 *
 * synchronously, from inside a promise executor, where nothing catches it. The
 * result is an uncaught exception on every single load and a feature that is
 * broken **for ever**: the version still matches, so the next load opens the
 * same broken handle and throws again. A user in that state never gets their
 * images back by reloading, by reopening the browser, or by waiting.
 *
 * How the state is reached is not something the page can know — an interrupted
 * upgrade, a half-applied `deleteDatabase`, an older build, storage evicted
 * mid-write, a `open(name)` with no version from somewhere else that created an
 * empty database with that name. What the page CAN do is stop treating it as
 * fatal: if a store is missing after a successful open, reopen one version
 * higher so `onupgradeneeded` runs and creates it. The database heals itself on
 * the next load instead of throwing for the rest of its life.
 *
 * This is the same bargain `indexedDbStorage` already documents for the store
 * itself — fallback, never failure — applied to opening.
 */

export type StoreSpec = {
	name: string;
	/** Called inside `onupgradeneeded`, only when the store is missing. */
	create: (db: IDBDatabase) => void;
};

/** How the open went. `healed` means a missing store had to be created. */
export type OpenStoreOutcome = 'opened' | 'healed' | 'unavailable';

export type OpenStoreResult = {
	db: IDBDatabase | null;
	outcome: OpenStoreOutcome;
};

type OpenFailure = { db: null; versionTooLow: boolean };
type OpenOutcome = { db: IDBDatabase } | OpenFailure;

function request(
	name: string,
	version: number | undefined,
	stores: readonly StoreSpec[]
): Promise<OpenOutcome> {
	return new Promise(resolve => {
		let open: IDBOpenDBRequest;
		try {
			open =
				version === undefined
					? indexedDB.open(name)
					: indexedDB.open(name, version);
		} catch {
			resolve({ db: null, versionTooLow: false });
			return;
		}
		open.onupgradeneeded = () => {
			const db = open.result;
			for (const store of stores) {
				if (!db.objectStoreNames.contains(store.name)) {
					store.create(db);
				}
			}
		};
		open.onsuccess = () => resolve({ db: open.result });
		open.onerror = () =>
			resolve({
				db: null,
				// The database on disk is AHEAD of this build — another tab, or
				// a newer version of the app, upgraded it. It is still usable:
				// a later schema is a superset, not a different database.
				versionTooLow: open.error?.name === 'VersionError'
			});
		// Another tab is holding the old version open. Resolving null is right:
		// the caller falls back rather than hanging until that tab is closed.
		open.onblocked = () => resolve({ db: null, versionTooLow: false });
	});
}

function missing(db: IDBDatabase, stores: readonly StoreSpec[]): StoreSpec[] {
	return stores.filter(store => !db.objectStoreNames.contains(store.name));
}

/**
 * Open `name` at `version` with every store in `stores` present, or resolve
 * `null`. Never throws and never rejects.
 */
export async function openStoreDb(
	name: string,
	version: number,
	stores: readonly StoreSpec[]
): Promise<OpenStoreResult> {
	if (typeof indexedDB === 'undefined') {
		return { db: null, outcome: 'unavailable' };
	}
	let opened = await request(name, version, stores);
	if (!opened.db && opened.versionTooLow) {
		// Reopen at whatever version the database already has. Safe to do
		// without a version number here precisely BECAUSE the failure proves it
		// exists — an unversioned open on a missing database would create the
		// empty husk this module is here to clean up.
		opened = await request(name, undefined, stores);
	}
	const db = opened.db;
	if (!db) return { db: null, outcome: 'unavailable' };
	if (missing(db, stores).length === 0) return { db, outcome: 'opened' };

	// At the right version and still missing a store: the only way to create one
	// is an upgrade, and the only way to get an upgrade is a higher version.
	// `db.version` rather than `version + 1` because the database on disk may
	// already be ahead of what this build asks for.
	const next = db.version + 1;
	db.close();
	const healed = (await request(name, next, stores)).db;
	if (!healed) return { db: null, outcome: 'unavailable' };
	if (missing(healed, stores).length > 0) {
		// Storage refused to create the store. Nothing left to try, and a handle
		// that would throw on first use is worse than none.
		healed.close();
		return { db: null, outcome: 'unavailable' };
	}
	return { db: healed, outcome: 'healed' };
}

/** `openStoreDb` for callers whose contract is to reject rather than return null. */
export async function openStoreDbOrThrow(
	name: string,
	version: number,
	stores: readonly StoreSpec[]
): Promise<IDBDatabase> {
	const { db } = await openStoreDb(name, version, stores);
	if (!db) throw new Error(`IndexedDB unavailable for "${name}"`);
	return db;
}
