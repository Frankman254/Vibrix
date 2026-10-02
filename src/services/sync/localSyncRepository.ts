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
 */
const DB_NAME = 'lwag-sync';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const ASSETS = 'assets';

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
	blob: Blob;
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

async function prepareAssetRecord(
	projectId: string,
	asset: ProjectAssetWrite
): Promise<AssetRecord> {
	return {
		key: assetKey(projectId, asset.assetId),
		projectId,
		assetId: asset.assetId,
		kind: asset.kind,
		contentHash: await computeContentHash(asset.blob),
		sizeBytes: asset.blob.size,
		mimeType: asset.blob.type || 'application/octet-stream',
		storagePath: asset.storagePath,
		blob: asset.blob
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
		const records: AssetRecord[] = [];
		for (const asset of assets) {
			records.push(await prepareAssetRecord(input.id, asset));
		}
		return this.writeProject(input, records);
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
				mimeType: mimeType || blob.type || 'application/octet-stream',
				storagePath
			})
		);
	}

	async getAsset(projectId: string, assetId: string): Promise<Blob | null> {
		const db = await openDb();
		const record = await tx<AssetRecord | undefined>(
			db,
			ASSETS,
			'readonly',
			store =>
				store.get(assetKey(projectId, assetId)) as IDBRequest<
					AssetRecord | undefined
				>
		);
		return record?.blob ?? null;
	}

	async putAsset(
		projectId: string,
		meta: Omit<AssetMeta, 'contentHash' | 'sizeBytes' | 'mimeType'>,
		blob: Blob
	): Promise<AssetMeta> {
		const contentHash = await computeContentHash(blob);
		const record: AssetRecord = {
			key: assetKey(projectId, meta.assetId),
			projectId,
			assetId: meta.assetId,
			kind: meta.kind,
			contentHash,
			sizeBytes: blob.size,
			mimeType: blob.type || 'application/octet-stream',
			storagePath: meta.storagePath,
			blob
		};
		const db = await openDb();
		await tx(db, ASSETS, 'readwrite', store => store.put(record));
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
		assets?: AssetRecord[]
	): Promise<ProjectSnapshot> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const storeNames = assets ? [PROJECTS, ASSETS] : [PROJECTS];
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
				const nextKeys = new Set(assets.map(asset => asset.key));
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
				for (const asset of assets) assetStore.put(asset);
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
