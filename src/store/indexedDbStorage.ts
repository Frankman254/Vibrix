/**
 * IndexedDB-backed storage for the Zustand persist middleware.
 *
 * Why this replaces `localStorage`: `localStorage` gives about 5 MB, and a real
 * project — a 200-image pool, 120 spectrum slots, 60 slots per other family,
 * dozens of scenes and setlists — reaches that. The failure mode is nasty
 * rather than loud: the write throws, the session keeps working from memory,
 * and everything since the last successful write disappears on reload. That is
 * the shape of a "disappears with no repro" bug. IndexedDB has orders of
 * magnitude more room and no synchronous main-thread cost.
 *
 * Two behaviours make the switch safe:
 *
 *  - **One-way migration on first read.** If IndexedDB is empty and
 *    `localStorage` holds a state, it is copied over. The `localStorage` copy
 *    is deliberately left in place — it costs a few MB and it is the escape
 *    hatch if this adapter ever has to be reverted.
 *  - **Fallback, never failure.** If IndexedDB is unavailable (private mode,
 *    blocked storage), every operation transparently uses `localStorage`
 *    instead. Losing the bigger quota is much better than losing persistence.
 *  - **Adoption across the product rename.** The database and key were called
 *    `lwag-*` before the app became Vibrix. A plain rename would have opened an
 *    empty database and shown every existing user an empty app, so the old
 *    names are read once and copied over. See `LEGACY_STORAGE` below.
 */
import { openStoreDb } from '@/lib/db/openStoreDb';

const DB_NAME = 'vibrix-store';
const DB_VERSION = 1;
const STORE = 'persist';

/**
 * Where this data lived before the rename to Vibrix.
 *
 * Read once, when the new database has nothing under the new name. The old
 * copy is deliberately **not deleted** — it is a single JSON string, and it is
 * the escape hatch if a user has to go back to a build from before the rename.
 * That is the same bargain the localStorage copy above already makes.
 */
const LEGACY_STORAGE = {
	dbName: 'lwag-store',
	/** New persist name → the name it had before the rename. */
	keys: { 'vibrix-state': 'lwag-state' } as Record<string, string>
};

/** Cached open handle — reopening per write would serialize on the upgrade. */
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
	if (dbPromise) return dbPromise;
	dbPromise = openStoreDb(DB_NAME, DB_VERSION, [
		{ name: STORE, create: db => db.createObjectStore(STORE) }
	]).then(result => result.db);
	return dbPromise;
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Reset the cached handle. Tests use this; production never needs it. */
export function resetIndexedDbStorageForTests(): void {
	dbPromise = null;
}

/**
 * Read one value out of the pre-rename database, without creating it.
 *
 * Opening a database with no version number creates an empty one when it does
 * not exist. That would litter every fresh install with a stray `lwag-store`,
 * so a database that turns out to have no `persist` store is deleted again
 * right away — we know we are the ones who just made it.
 */
function readLegacyDb(legacyKey: string): Promise<string | null> {
	return new Promise(resolve => {
		if (typeof indexedDB === 'undefined') {
			resolve(null);
			return;
		}
		let request: IDBOpenDBRequest;
		try {
			request = indexedDB.open(LEGACY_STORAGE.dbName);
		} catch {
			resolve(null);
			return;
		}
		request.onerror = () => resolve(null);
		request.onblocked = () => resolve(null);
		request.onsuccess = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.close();
				try {
					indexedDB.deleteDatabase(LEGACY_STORAGE.dbName);
				} catch {
					/* leaving an empty database behind is harmless */
				}
				resolve(null);
				return;
			}
			try {
				const store = db
					.transaction(STORE, 'readonly')
					.objectStore(STORE);
				const get = store.get(legacyKey);
				get.onsuccess = () => {
					db.close();
					resolve(typeof get.result === 'string' ? get.result : null);
				};
				get.onerror = () => {
					db.close();
					resolve(null);
				};
			} catch {
				db.close();
				resolve(null);
			}
		};
	});
}

/** The value this key held before the rename, from either storage. */
async function readLegacy(name: string): Promise<string | null> {
	const legacyKey = LEGACY_STORAGE.keys[name];
	if (!legacyKey) return null;
	const fromLocal = validate(legacyKey, readLocalStorage(legacyKey));
	if (fromLocal) return fromLocal;
	return validate(legacyKey, await readLegacyDb(legacyKey));
}

function readLocalStorage(name: string): string | null {
	try {
		return localStorage.getItem(name);
	} catch {
		return null;
	}
}

/**
 * Parse-check a payload before handing it to persist. A truncated or corrupted
 * value would otherwise throw inside the middleware and take the editor down;
 * dropping it falls back to defaults, which is recoverable.
 */
function validate(name: string, raw: string | null): string | null {
	if (!raw) return null;
	try {
		JSON.parse(raw);
		return raw;
	} catch (error) {
		console.error(
			`[vibrix] Corrupted persisted state for ${name}; ignoring it.`,
			error
		);
		return null;
	}
}

export const indexedDbStorage = {
	async getItem(name: string): Promise<string | null> {
		const db = await openDb();
		if (!db) {
			return (
				validate(name, readLocalStorage(name)) ??
				(await readLegacy(name))
			);
		}

		try {
			const store = db.transaction(STORE, 'readonly').objectStore(STORE);
			const stored = await runRequest(store.get(name));
			if (typeof stored === 'string') return validate(name, stored);

			// Nothing in IndexedDB yet — adopt whatever localStorage has, so an
			// existing install keeps its project on first load after the switch.
			const legacy =
				validate(name, readLocalStorage(name)) ??
				(await readLegacy(name));
			if (legacy) {
				// Best-effort: a full quota must not stop us RETURNING the
				// state the user already has.
				await indexedDbStorage
					.setItem(name, legacy)
					.catch(() => undefined);
			}
			return legacy;
		} catch (error) {
			console.error(`[vibrix] IndexedDB read failed for ${name}.`, error);
			return (
				validate(name, readLocalStorage(name)) ??
				(await readLegacy(name))
			);
		}
	},

	/**
	 * Write one value, **rejecting** when storage refuses it.
	 *
	 * This used to swallow the error and report it. It no longer does, because
	 * swallowing it here left the caller unable to tell a successful save from a
	 * refused one — so persist kept pushing the whole project at a full quota,
	 * failing every time. `createPersistedStateWriter` is the one caller, and it
	 * needs the rejection to open its circuit breaker and to hold the value for
	 * a retry. It is also what reports the failure to the UI, so nothing is
	 * lost by not reporting it twice.
	 */
	async setItem(name: string, value: string): Promise<void> {
		const db = await openDb();
		if (!db) {
			// No IndexedDB (private mode, storage blocked): the 5 MB
			// localStorage path is worse, but it is not nothing.
			localStorage.setItem(name, value);
			return;
		}

		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(value, name);
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	},

	async removeItem(name: string): Promise<void> {
		const db = await openDb();
		try {
			localStorage.removeItem(name);
		} catch {
			// Ignored — clearing the legacy copy is best-effort.
		}
		if (!db) return;
		try {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).delete(name);
			await new Promise<void>(resolve => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
			});
		} catch {
			// Ignored.
		}
	}
};

/**
 * Wipe a persisted state everywhere it can come back from: IndexedDB, the
 * localStorage copy, and the pre-rename key and database.
 *
 * `removeItem` alone is not enough for "Clear saved settings". It leaves the
 * `lwag-*` copies, which `getItem` adopts whenever the new key is missing — so
 * the state the user just cleared would reappear on the next load. Images and
 * folders live in their own databases and are intentionally not touched.
 */
export async function clearPersistedState(name: string): Promise<void> {
	await indexedDbStorage.removeItem(name);
	const legacyKey = LEGACY_STORAGE.keys[name];
	if (!legacyKey) return;
	try {
		localStorage.removeItem(legacyKey);
	} catch {
		// Ignored — no localStorage means there is no legacy copy there either.
	}
	if (typeof indexedDB === 'undefined') return;
	await new Promise<void>(resolve => {
		try {
			const request = indexedDB.deleteDatabase(LEGACY_STORAGE.dbName);
			request.onsuccess = () => resolve();
			request.onerror = () => resolve();
			request.onblocked = () => resolve();
		} catch {
			resolve();
		}
	});
}
