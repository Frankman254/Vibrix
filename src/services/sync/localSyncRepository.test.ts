import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WallpaperState } from '@/types/wallpaper';
import { SyncConflictError } from './SyncRepository';
import { LocalSyncRepository } from './localSyncRepository';

function deleteSyncDb(): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase('lwag-sync');
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

function state(label: string): WallpaperState {
	return { audioFileName: label } as WallpaperState;
}

/** How many rows the shared content-addressed blob store holds. */
function countStoredBlobs(): Promise<number> {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open('lwag-sync');
		open.onsuccess = () => {
			const db = open.result;
			if (!db.objectStoreNames.contains('blobs')) {
				db.close();
				resolve(0);
				return;
			}
			const request = db
				.transaction('blobs', 'readonly')
				.objectStore('blobs')
				.count();
			request.onsuccess = () => {
				db.close();
				resolve(request.result);
			};
			request.onerror = () => {
				db.close();
				reject(request.error);
			};
		};
		open.onerror = () => reject(open.error);
	});
}

describe('LocalSyncRepository', () => {
	beforeEach(async () => {
		await deleteSyncDb();
	});

	it('atomically replaces project state and its complete asset manifest', async () => {
		const repository = new LocalSyncRepository();
		const first = await repository.saveProjectBundle(
			{
				id: 'project-a',
				name: 'Project A',
				storePersistVersion: 104,
				state: state('first')
			},
			[
				{
					assetId: 'old-image',
					kind: 'image',
					blob: new Blob(['old'], { type: 'image/png' })
				}
			]
		);
		expect(first.revision).toBe(1);

		const second = await repository.saveProjectBundle(
			{
				id: 'project-a',
				name: 'Project A updated',
				storePersistVersion: 104,
				state: state('second'),
				baseRevision: first.revision
			},
			[
				{
					assetId: 'new-audio',
					kind: 'audio',
					blob: new Blob(['new'], { type: 'audio/mpeg' })
				}
			]
		);

		expect(second.revision).toBe(2);
		expect(second.state.audioFileName).toBe('second');
		expect(await repository.getAsset('project-a', 'old-image')).toBeNull();
		expect(
			await (await repository.getAsset('project-a', 'new-audio'))?.text()
		).toBe('new');
		expect(await repository.listAssets('project-a')).toMatchObject([
			{
				assetId: 'new-audio',
				kind: 'audio',
				mimeType: 'audio/mpeg',
				sizeBytes: 3
			}
		]);
	});

	it('rejects a stale revision without changing state or blobs', async () => {
		const repository = new LocalSyncRepository();
		await repository.saveProjectBundle(
			{
				id: 'project-a',
				name: 'Stable',
				storePersistVersion: 104,
				state: state('stable')
			},
			[
				{
					assetId: 'asset',
					kind: 'image',
					blob: new Blob(['stable'], { type: 'image/png' })
				}
			]
		);

		await expect(
			repository.saveProjectBundle(
				{
					id: 'project-a',
					name: 'Stale write',
					storePersistVersion: 104,
					state: state('stale'),
					baseRevision: 0
				},
				[
					{
						assetId: 'asset',
						kind: 'image',
						blob: new Blob(['stale'], { type: 'image/png' })
					}
				]
			)
		).rejects.toBeInstanceOf(SyncConflictError);

		const stored = await repository.loadProject('project-a');
		expect(stored?.name).toBe('Stable');
		expect(stored?.state.audioFileName).toBe('stable');
		expect(
			await (await repository.getAsset('project-a', 'asset'))?.text()
		).toBe('stable');
	});

	it('deletes a project and all of its assets together', async () => {
		const repository = new LocalSyncRepository();
		await repository.saveProjectBundle(
			{
				id: 'project-a',
				name: 'Delete me',
				storePersistVersion: 104,
				state: state('delete')
			},
			[
				{
					assetId: 'asset',
					kind: 'image',
					blob: new Blob(['data'], { type: 'image/png' })
				}
			]
		);

		await repository.deleteProject('project-a');
		expect(await repository.loadProject('project-a')).toBeNull();
		expect(await repository.listAssets('project-a')).toEqual([]);
	});

	it('stores identical asset bytes once across projects', async () => {
		// The reported quota problem: the same 200-image pool saved under N
		// projects used to cost N full copies of every picture, all of it
		// inside the one per-origin quota the video export also needs.
		const repository = new LocalSyncRepository();
		const shared = () => new Blob(['same-bytes'], { type: 'image/png' });
		for (const id of ['project-a', 'project-b', 'project-c']) {
			await repository.saveProjectBundle(
				{
					id,
					name: id,
					storePersistVersion: 146,
					state: state(id)
				},
				[{ assetId: 'pool-image', kind: 'image', blob: shared() }]
			);
		}

		expect(await countStoredBlobs()).toBe(1);
		// Every project still reads its own asset back in full.
		for (const id of ['project-a', 'project-b', 'project-c']) {
			const blob = await repository.getAsset(id, 'pool-image');
			expect(await blob?.text()).toBe('same-bytes');
		}
	});

	it('keeps shared bytes alive while any project still references them', async () => {
		const repository = new LocalSyncRepository();
		const shared = () => new Blob(['shared'], { type: 'image/png' });
		for (const id of ['keeper', 'goner']) {
			await repository.saveProjectBundle(
				{ id, name: id, storePersistVersion: 146, state: state(id) },
				[{ assetId: 'image', kind: 'image', blob: shared() }]
			);
		}

		await repository.deleteProject('goner');
		// Reachability, not a refcount: 'keeper' still names this hash.
		expect(await countStoredBlobs()).toBe(1);
		expect(
			await (await repository.getAsset('keeper', 'image'))?.text()
		).toBe('shared');
	});

	it('collects bytes once the last project referencing them is gone', async () => {
		const repository = new LocalSyncRepository();
		await repository.saveProjectBundle(
			{
				id: 'only',
				name: 'only',
				storePersistVersion: 146,
				state: state('only')
			},
			[
				{
					assetId: 'image',
					kind: 'image',
					blob: new Blob(['orphan'], { type: 'image/png' })
				}
			]
		);
		expect(await countStoredBlobs()).toBe(1);

		await repository.deleteProject('only');
		expect(await countStoredBlobs()).toBe(0);
	});

	it('drops the bytes of an asset a later save removed', async () => {
		const repository = new LocalSyncRepository();
		await repository.saveProjectBundle(
			{
				id: 'project-a',
				name: 'A',
				storePersistVersion: 146,
				state: state('one')
			},
			[
				{
					assetId: 'dropped',
					kind: 'image',
					blob: new Blob(['dropped'], { type: 'image/png' })
				}
			]
		);
		const saved = await repository.loadProject('project-a');
		await repository.saveProjectBundle(
			{
				id: 'project-a',
				name: 'A',
				storePersistVersion: 146,
				state: state('two'),
				baseRevision: saved?.revision
			},
			[
				{
					assetId: 'kept',
					kind: 'image',
					blob: new Blob(['kept'], { type: 'image/png' })
				}
			]
		);

		expect(await countStoredBlobs()).toBe(1);
		expect(await repository.getAsset('project-a', 'dropped')).toBeNull();
		expect(
			await (await repository.getAsset('project-a', 'kept'))?.text()
		).toBe('kept');
	});
});
