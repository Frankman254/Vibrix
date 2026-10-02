import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openStoreDb, openStoreDbOrThrow } from './openStoreDb';

const IMAGES = [
	{
		name: 'images',
		create: (db: IDBDatabase) =>
			db.createObjectStore('images', { keyPath: 'id' })
	}
];

/** Make a database at `version` holding exactly `stores` — the broken state. */
function seed(
	name: string,
	version: number,
	stores: readonly string[]
): Promise<void> {
	return new Promise(resolve => {
		const open = indexedDB.open(name, version);
		open.onupgradeneeded = () => {
			for (const store of stores) open.result.createObjectStore(store);
		};
		open.onsuccess = () => {
			open.result.close();
			resolve();
		};
	});
}

function deleteDb(name: string): Promise<void> {
	return new Promise(resolve => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () => resolve();
		request.onblocked = () => resolve();
	});
}

describe('openStoreDb', () => {
	it('creates the store on a database that does not exist yet', async () => {
		await deleteDb('fresh');
		const { db, outcome } = await openStoreDb('fresh', 1, IMAGES);
		expect(outcome).toBe('opened');
		expect(Array.from(db!.objectStoreNames)).toEqual(['images']);
		db!.close();
	});

	/**
	 * The bug this module exists for. A database already at the asked-for
	 * version with the store missing never gets an `onupgradeneeded`, so every
	 * `transaction('images')` throws NotFoundError — uncaught, on every load,
	 * for ever.
	 */
	it('heals a database stuck at the right version without the store', async () => {
		await deleteDb('stuck');
		await seed('stuck', 1, []);
		const { db, outcome } = await openStoreDb('stuck', 1, IMAGES);
		expect(outcome).toBe('healed');
		expect(db!.version).toBe(2);
		// The whole point: a transaction now works instead of throwing.
		expect(() => db!.transaction('images', 'readonly')).not.toThrow();
		db!.close();
	});

	/** Healing must not wipe what the database already holds. */
	it('keeps the stores it already had while adding the missing one', async () => {
		await deleteDb('partial');
		await seed('partial', 1, ['other']);
		const { db, outcome } = await openStoreDb('partial', 1, IMAGES);
		expect(outcome).toBe('healed');
		expect(Array.from(db!.objectStoreNames).sort()).toEqual([
			'images',
			'other'
		]);
		db!.close();
	});

	/**
	 * A database ahead of this build (another tab upgraded it) opens at its own
	 * version, and healing it must step up from THERE, not from what we asked.
	 */
	it('steps up from the version on disk, not from the one asked for', async () => {
		await deleteDb('ahead');
		await seed('ahead', 5, ['other']);
		const { db, outcome } = await openStoreDb('ahead', 1, IMAGES);
		expect(outcome).toBe('healed');
		expect(db!.version).toBe(6);
		db!.close();
	});

	it('does nothing when the store is already there', async () => {
		await deleteDb('ok');
		await openStoreDb('ok', 1, IMAGES).then(r => r.db?.close());
		const { db, outcome } = await openStoreDb('ok', 1, IMAGES);
		expect(outcome).toBe('opened');
		expect(db!.version).toBe(1);
		db!.close();
	});

	it('resolves null instead of throwing when there is no IndexedDB', async () => {
		const real = globalThis.indexedDB;
		// @ts-expect-error — removing it is the point of the test.
		delete globalThis.indexedDB;
		try {
			const { db, outcome } = await openStoreDb('nope', 1, IMAGES);
			expect(db).toBeNull();
			expect(outcome).toBe('unavailable');
			await expect(
				openStoreDbOrThrow('nope', 1, IMAGES)
			).rejects.toThrow();
		} finally {
			globalThis.indexedDB = real;
		}
	});
});
