import { getVirtualFileBlob } from './localFoldersDb';
import { openStoreDbOrThrow } from './openStoreDb';

const DB_NAME = 'lwag-images';
const DB_VERSION = 1;
const STORE = 'images';

interface ImageRecord {
	id: string;
	data: ArrayBuffer | Blob;
	type: string;
}

export interface StoredImageAsset {
	id: string;
	data: ArrayBuffer;
	type: string;
}

export interface StoredImageAssetInfo {
	bytes: number;
	type: string;
}

function openDb(): Promise<IDBDatabase> {
	return openStoreDbOrThrow(DB_NAME, DB_VERSION, [
		{
			name: STORE,
			create: db => db.createObjectStore(STORE, { keyPath: 'id' })
		}
	]);
}

export async function saveImage(file: File): Promise<string> {
	const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return saveImageAsset(id, file, file.type);
}

export async function saveImageAsset(
	id: string,
	data: ArrayBuffer | Blob,
	type: string
): Promise<string> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put({
			id,
			data,
			type
		} satisfies ImageRecord);
		tx.oncomplete = () => {
			db.close();
			resolve(id);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}

async function getFromIDB(id: string): Promise<StoredImageAsset | null> {
	const db = await openDb();
	return new Promise(resolve => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(id);
		req.onsuccess = async () => {
			db.close();
			if (!req.result) {
				resolve(null);
				return;
			}
			const rec = req.result as ImageRecord;
			resolve({
				id: rec.id,
				data:
					rec.data instanceof Blob
						? await rec.data.arrayBuffer()
						: rec.data.slice(0),
				type: rec.type
			});
		};
		req.onerror = () => {
			db.close();
			resolve(null);
		};
	});
}

export async function loadImageAsset(
	id: string
): Promise<StoredImageAsset | null> {
	if (id.startsWith('virtual://')) {
		const parts = id.substring('virtual://'.length).split('/');
		const folderId = parts[0] as 'audio' | 'image';
		const fileName = parts.slice(1).join('/');
		const file = await getVirtualFileBlob(folderId, fileName);
		if (file) {
			return {
				id,
				data: await file.arrayBuffer(),
				type: file.type
			};
		}
		// Fallback to indexedDB if virtual file not available
	}

	return getFromIDB(id);
}

/**
 * Byte size of a stored asset without materializing a copy. Used by the
 * project exporter and storage diagnostics to inspect size without decoding
 * media. Virtual files and current IndexedDB records report `Blob.size`;
 * legacy ArrayBuffer records remain readable via `byteLength`.
 */
export async function getImageAssetByteLength(
	id: string
): Promise<number | null> {
	if (id.startsWith('virtual://')) {
		const parts = id.substring('virtual://'.length).split('/');
		const folderId = parts[0] as 'audio' | 'image';
		const fileName = parts.slice(1).join('/');
		const file = await getVirtualFileBlob(folderId, fileName);
		if (file) return file.size;
		// Fallback to indexedDB if virtual file not available
	}

	const db = await openDb();
	return new Promise(resolve => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(id);
		req.onsuccess = () => {
			db.close();
			const rec = req.result as ImageRecord | undefined;
			resolve(
				rec?.data
					? rec.data instanceof Blob
						? rec.data.size
						: rec.data.byteLength
					: null
			);
		};
		req.onerror = () => {
			db.close();
			resolve(null);
		};
	});
}

/** Metadata-only read used to lay out a binary project package before any
 * asset bytes are streamed to disk. */
export async function getImageAssetInfo(
	id: string
): Promise<StoredImageAssetInfo | null> {
	if (id.startsWith('virtual://')) {
		const parts = id.substring('virtual://'.length).split('/');
		const folderId = parts[0] as 'audio' | 'image';
		const fileName = parts.slice(1).join('/');
		const file = await getVirtualFileBlob(folderId, fileName);
		if (file) return { bytes: file.size, type: file.type };
	}

	const db = await openDb();
	return new Promise(resolve => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(id);
		req.onsuccess = () => {
			db.close();
			const rec = req.result as ImageRecord | undefined;
			resolve(
				rec?.data
					? {
							bytes:
								rec.data instanceof Blob
									? rec.data.size
									: rec.data.byteLength,
							type: rec.type
						}
					: null
			);
		};
		req.onerror = () => {
			db.close();
			resolve(null);
		};
	});
}

export async function loadImageBlob(id: string): Promise<Blob | null> {
	if (id.startsWith('virtual://')) {
		const parts = id.substring('virtual://'.length).split('/');
		const folderId = parts[0] as 'audio' | 'image';
		const fileName = parts.slice(1).join('/');
		const file = await getVirtualFileBlob(folderId, fileName);
		if (file) return file;
		// Fallback to indexedDB if virtual file not available
	}

	const db = await openDb();
	return new Promise(resolve => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(id);
		req.onsuccess = () => {
			db.close();
			const rec = req.result as ImageRecord | undefined;
			resolve(
				rec?.data
					? rec.data instanceof Blob
						? rec.data
						: new Blob([rec.data], { type: rec.type })
					: null
			);
		};
		req.onerror = () => {
			db.close();
			resolve(null);
		};
	});
}

export async function loadImage(id: string): Promise<string | null> {
	const blob = await loadImageBlob(id);
	return blob ? URL.createObjectURL(blob) : null;
}

export async function deleteImage(id: string): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).delete(id);
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}

export async function clearAllImages(): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).clear();
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}

export async function loadAllImages(
	ids: string[]
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	await Promise.all(
		ids.map(async id => {
			const url = await loadImage(id);
			if (url) map.set(id, url);
		})
	);
	return map;
}
