import type { WallpaperState } from '@/types/wallpaper';
import {
	SyncConflictError,
	type AssetMeta,
	type ProjectSnapshot,
	type ProjectSummary,
	type ProjectAssetWrite,
	type SaveProjectInput,
	type SyncRepository
} from './SyncRepository';
import { computeContentHash } from './contentHash';
import { openStoreDbOrThrow } from '@/lib/db/openStoreDb';

/**
 * IndexedDB-backed `SyncRepository`. This is the "local backend" that works
 * offline today; a Postgres/Supabase adapter implements the same interface and
 * swaps in without touching callers. It intentionally mirrors the server schema
 * (a projects store keyed by id, an assets store keyed by `${projectId}::${assetId}`)
 * so migrating a user's local data up to the cloud is a straight copy.
 *
 * **Asset bytes are content-addressed** (`blobs`, keyed by content hash) while
 * asset ROWS stay per project. They used to carry the blob inline, so saving
 * the same 200-image pool under three projects stored three full copies of
 * every picture — gigabytes of duplication inside the one per-origin quota
 * every other storage surface draws on, which is how a project save and a
 * video export end up competing for the same bytes. The hash was already
 * being computed and thrown away; now it is the key.
 *
 * `v1` rows that still hold an inline `blob` are read as they are and are NOT
 * rewritten or deleted: a project saved before this change keeps working, and
 * re-saving it is what moves its bytes into the shared store.
 */
const DB_NAME = 'lwag-sync';
const DB_VERSION = 2;
const PROJECTS = 'projects';
const ASSETS = 'assets';
/** Content-addressed asset bytes, shared by every project that uses them. */
const BLOBS = 'blobs';

type ProjectRecord = {
	id: string;
	name: string;
	storePersistVersion: number;
	state: WallpaperState;
	revision: number;
	updatedAt: string;
};

type AssetRecord = AssetMeta & {
	key: string; // `${projectId}::${assetId}`
	projectId: string;
	/** Present only on rows written before the blobs store existed (v1). */
	blob?: Blob;
};

type BlobRecord = {
	contentHash: string;
	blob: Blob;
	sizeBytes: number;
	mimeType: string;
};

function openDb(): Promise<IDBDatabase> {
	return openStoreDbOrThrow(DB_NAME, DB_VERSION, [
		{
			name: PROJECTS,
			create: db => db.createObjectStore(PROJECTS, { keyPath: 'id' })
		},
		{
			name: ASSETS,
			create: db => {
				const store = db.createObjectStore(ASSETS, { keyPath: 'key' });
				store.createIndex('projectId', 'projectId', { unique: false });
			}
		},
		{
			name: BLOBS,
			create: db =>
				db.createObjectStore(BLOBS, { keyPath: 'contentHash' })
		}
	]);
}

function tx<T>(
	db: IDBDatabase,
	store: string,
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(store, mode);
		const request = run(transaction.objectStore(store));
		transaction.oncomplete = () => {
			db.close();
			resolve(request.result);
		};
		transaction.onerror = () => {
			db.close();
			reject(transaction.error);
		};
	});
}

function assetKey(projectId: string, assetId: string): string {
	return `${projectId}::${assetId}`;
}

/**
 * An asset row and the blob row it points at. The write transaction stores the
 * bytes once per distinct content hash and the row once per project, which is
 * what stops N projects sharing a pool from costing N copies of it.
 */
type PreparedAsset = { record: AssetRecord; blob: BlobRecord };

async function prepareAssetRecord(
	projectId: string,
	asset: ProjectAssetWrite
): Promise<PreparedAsset> {
	const contentHash = await computeContentHash(asset.blob);
	const mimeType = asset.blob.type || 'application/octet-stream';
	return {
		record: {
			key: assetKey(projectId, asset.assetId),
			projectId,
			assetId: asset.assetId,
			kind: asset.kind,
			contentHash,
			sizeBytes: asset.blob.size,
			mimeType,
			storagePath: asset.storagePath
		},
		blob: {
			contentHash,
			blob: asset.blob,
			sizeBytes: asset.blob.size,
			mimeType
		}
	};
}

/**
 * Store the bytes only if this hash is not already there. `add` rejects a
 * duplicate key, and `preventDefault` on that one request stops the rejection
 * from aborting the whole save — the alternative, `put`, would rewrite
 * megabytes that are already on disk byte for byte.
 */
function addBlobIfAbsent(store: IDBObjectStore, blob: BlobRecord): void {
	const request = store.add(blob);
	request.onerror = event => {
		event.preventDefault();
		event.stopPropagation();
	};
}

export class LocalSyncRepository implements SyncRepository {
	async listProjects(): Promise<ProjectSummary[]> {
		const db = await openDb();
		const records = await tx<ProjectRecord[]>(
			db,
			PROJECTS,
			'readonly',
			store => store.getAll() as IDBRequest<ProjectRecord[]>
		);
		return records
			.map(({ id, name, updatedAt, revision }) => ({
				id,
				name,
				updatedAt,
				revision
			}))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async loadProject(id: string): Promise<ProjectSnapshot | null> {
		const db = await openDb();
		const record = await tx<ProjectRecord | undefined>(
			db,
			PROJECTS,
			'readonly',
			store => store.get(id) as IDBRequest<ProjectRecord | undefined>
		);
		return record ? { ...record } : null;
	}

	async saveProject(input: SaveProjectInput): Promise<ProjectSnapshot> {
		return this.writeProject(input);
	}

	async saveProjectBundle(
		input: SaveProjectInput,
		assets: ProjectAssetWrite[]
	): Promise<ProjectSnapshot> {
		const prepared: PreparedAsset[] = [];
		for (const asset of assets) {
			prepared.push(await prepareAssetRecord(input.id, asset));
		}
		const snapshot = await this.writeProject(input, prepared);
		// Assets this save dropped may have been the last users of their bytes.
		await this.collectOrphanBlobs();
		return snapshot;
	}

	async deleteProject(id: string): Promise<void> {
		const db = await openDb();
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction([PROJECTS, ASSETS], 'readwrite');
			transaction.objectStore(PROJECTS).delete(id);
			const cursor = transaction
				.objectStore(ASSETS)
				.index('projectId')
				.openCursor(IDBKeyRange.only(id));
			cursor.onsuccess = () => {
				const current = cursor.result;
				if (!current) return;
				current.delete();
				current.continue();
			};
			transaction.oncomplete = () => {
				db.close();
				resolve();
			};
			transaction.onerror = () => {
				db.close();
				reject(transaction.error);
			};
		});
		// Bytes no remaining project references are now dead weight.
		await this.collectOrphanBlobs();
	}

	async listAssets(projectId: string): Promise<AssetMeta[]> {
		const records = await this.listAssetRecords(projectId);
		return records.map(
			({
				assetId,
				kind,
				contentHash,
				sizeBytes,
				mimeType,
				storagePath,
				blob
			}) => ({
				assetId,
				kind,
				contentHash,
				sizeBytes,
				mimeType: mimeType || blob?.type || 'application/octet-stream',
				storagePath
			})
		);
	}

	async getAsset(projectId: string, assetId: string): Promise<Blob | null> {
		const record = await tx<AssetRecord | undefined>(
			await openDb(),
			ASSETS,
			'readonly',
			store =>
				store.get(assetKey(projectId, assetId)) as IDBRequest<
					AssetRecord | undefined
				>
		);
		if (!record) return null;
		// A v1 row carries its own copy; anything written since points at the
		// shared store.
		if (record.blob) return record.blob;
		const blobRecord = await tx<BlobRecord | undefined>(
			await openDb(),
			BLOBS,
			'readonly',
			store =>
				store.get(record.contentHash) as IDBRequest<
					BlobRecord | undefined
				>
		);
		return blobRecord?.blob ?? null;
	}

	async putAsset(
		projectId: string,
		meta: Omit<AssetMeta, 'contentHash' | 'sizeBytes' | 'mimeType'>,
		blob: Blob
	): Promise<AssetMeta> {
		const contentHash = await computeContentHash(blob);
		const mimeType = blob.type || 'application/octet-stream';
		const record: AssetRecord = {
			key: assetKey(projectId, meta.assetId),
			projectId,
			assetId: meta.assetId,
			kind: meta.kind,
			contentHash,
			sizeBytes: blob.size,
			mimeType,
			storagePath: meta.storagePath
		};
		const db = await openDb();
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction([ASSETS, BLOBS], 'readwrite');
			transaction.objectStore(ASSETS).put(record);
			addBlobIfAbsent(transaction.objectStore(BLOBS), {
				contentHash,
				blob,
				sizeBytes: blob.size,
				mimeType
			});
			transaction.oncomplete = () => {
				db.close();
				resolve();
			};
			transaction.onabort = () => {
				db.close();
				reject(transaction.error);
			};
		});
		return {
			assetId: record.assetId,
			kind: record.kind,
			contentHash: record.contentHash,
			sizeBytes: record.sizeBytes,
			mimeType: record.mimeType,
			storagePath: record.storagePath
		};
	}

	private async writeProject(
		input: SaveProjectInput,
		assets?: PreparedAsset[]
	): Promise<ProjectSnapshot> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const storeNames = assets ? [PROJECTS, ASSETS, BLOBS] : [PROJECTS];
			const transaction = db.transaction(storeNames, 'readwrite');
			const projectStore = transaction.objectStore(PROJECTS);
			const getRequest = projectStore.get(input.id) as IDBRequest<
				ProjectRecord | undefined
			>;
			let record: ProjectRecord | null = null;
			let conflict: SyncConflictError | null = null;

			getRequest.onsuccess = () => {
				const existing = getRequest.result;
				if (
					existing &&
					(input.baseRevision === undefined ||
						input.baseRevision !== existing.revision)
				) {
					conflict = new SyncConflictError(
						input.id,
						existing.revision
					);
					transaction.abort();
					return;
				}

				record = {
					id: input.id,
					name: input.name,
					storePersistVersion: input.storePersistVersion,
					state: input.state,
					revision: (existing?.revision ?? 0) + 1,
					updatedAt: new Date().toISOString()
				};
				projectStore.put(record);

				if (!assets) return;
				const assetStore = transaction.objectStore(ASSETS);
				const blobStore = transaction.objectStore(BLOBS);
				const nextKeys = new Set(assets.map(asset => asset.record.key));
				const cursor = assetStore
					.index('projectId')
					.openCursor(IDBKeyRange.only(input.id));
				cursor.onsuccess = () => {
					const current = cursor.result;
					if (!current) return;
					if (!nextKeys.has(String(current.primaryKey))) {
						current.delete();
					}
					current.continue();
				};
				// The row every time, the bytes only when this content hash is
				// new — two projects sharing a pool share its blobs.
				for (const asset of assets) {
					assetStore.put(asset.record);
					addBlobIfAbsent(blobStore, asset.blob);
				}
			};

			transaction.oncomplete = () => {
				db.close();
				if (record) resolve({ ...record });
				else reject(new Error('project-save-incomplete'));
			};
			transaction.onabort = () => {
				db.close();
				reject(
					conflict ??
						transaction.error ??
						new Error('project-save-aborted')
				);
			};
			transaction.onerror = () => {
				// onabort owns rejection and preserves a richer conflict error.
			};
		});
	}

	/**
	 * Delete blob rows no asset row points at any more.
	 *
	 * Refcounting would be the obvious alternative, but a counter that drifts
	 * by one either leaks a blob forever or deletes bytes a project is still
	 * using. Reachability cannot drift: a hash still referenced is kept, full
	 * stop. Deliberately conservative — it only ever removes rows from THIS
	 * module's own shared store, never a project, an asset row, or a v1 row's
	 * inline copy.
	 */
	private async collectOrphanBlobs(): Promise<void> {
		const db = await openDb();
		await new Promise<void>(resolve => {
			const transaction = db.transaction([ASSETS, BLOBS], 'readwrite');
			const referenced = new Set<string>();
			const assetCursor = transaction.objectStore(ASSETS).openCursor();
			assetCursor.onsuccess = () => {
				const current = assetCursor.result;
				if (current) {
					const record = current.value as AssetRecord;
					if (record.contentHash) referenced.add(record.contentHash);
					current.continue();
					return;
				}
				// Every asset row has been seen: anything not named is dead.
				const blobCursor = transaction.objectStore(BLOBS).openCursor();
				blobCursor.onsuccess = () => {
					const blobEntry = blobCursor.result;
					if (!blobEntry) return;
					if (!referenced.has(String(blobEntry.primaryKey))) {
						blobEntry.delete();
					}
					blobEntry.continue();
				};
			};
			transaction.oncomplete = () => {
				db.close();
				resolve();
			};
			// A failed sweep costs disk space, never data: nothing to report.
			transaction.onerror = () => {
				db.close();
				resolve();
			};
			transaction.onabort = () => {
				db.close();
				resolve();
			};
		});
	}

	private async listAssetRecords(projectId: string): Promise<AssetRecord[]> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(ASSETS, 'readonly');
			const index = transaction.objectStore(ASSETS).index('projectId');
			const request = index.getAll(projectId) as IDBRequest<
				AssetRecord[]
			>;
			transaction.oncomplete = () => {
				db.close();
				resolve(request.result);
			};
			transaction.onerror = () => {
				db.close();
				reject(transaction.error);
			};
		});
	}
}

/** Process-wide default. Swap the construction site for a remote adapter when
 *  the cloud backend is wired — callers depend only on `SyncRepository`. */
export const localSyncRepository: SyncRepository = new LocalSyncRepository();
