/**
 * Offline video export — OPFS disk sink.
 *
 * Browsers without `showSaveFilePicker` (Brave, Firefox) used to fall back to
 * keeping the whole MP4 in RAM, which dies on long exports with
 * "Array buffer allocation failed". This sink writes the muxer's stream into
 * the Origin Private File System (`navigator.storage.getDirectory()`), where
 * the bytes live on disk instead of on the heap, and hands the finished file
 * to the browser as a download. The same helper is the storage layer the
 * chunked exports (Fase D) will reuse.
 */
import type { StreamTargetChunk } from 'mediabunny';
import { createCancellableFileWritable } from './offlineVideoEncoder';

/** Files this module creates; the sweep deletes anything older under it. */
const OPFS_FILE_PREFIX = 'vibrix-export-';

/**
 * Grace period before deleting a downloaded file. The anchor click starts an
 * asynchronous download that keeps reading from the OPFS file, and
 * `removeEntry` is rejected while the file is still in use — so deletion
 * retries a few times and, if it never succeeds, the next export's sweep
 * collects the file.
 */
const REMOVE_DELAY_MS = 10_000;
const REMOVE_RETRIES = 6;
const REMOVE_RETRY_STEP_MS = 15_000;

export type OpfsVideoSink = {
	writable: WritableStream<StreamTargetChunk>;
	/** Hand the finished file to the browser as a download, then clean up. */
	download(fileName: string): Promise<void>;
	/** Abort the stream and delete the file (cancel/error paths). */
	discard(): Promise<void>;
};

export function opfsSupported(): boolean {
	return (
		typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
	);
}

async function opfsRoot(): Promise<FileSystemDirectoryHandle> {
	return navigator.storage.getDirectory();
}

/** DirectoryHandle.values() is newer than the lib.dom entries typings. */
function entriesOf(
	root: FileSystemDirectoryHandle
): AsyncIterableIterator<FileSystemHandle> {
	const withValues = root as FileSystemDirectoryHandle & {
		values(): AsyncIterableIterator<FileSystemHandle>;
	};
	return withValues.values();
}

/**
 * Delete files left behind by exports that crashed or were interrupted.
 * Best effort: a file a download is still reading cannot be removed yet, and
 * that is fine — this runs again on the next export.
 */
export async function sweepStaleOpfsExports(): Promise<void> {
	if (!opfsSupported()) return;
	try {
		const root = await opfsRoot();
		for await (const entry of entriesOf(root)) {
			if (
				entry.kind === 'file' &&
				entry.name.startsWith(OPFS_FILE_PREFIX)
			) {
				await root.removeEntry(entry.name).catch(() => undefined);
			}
		}
	} catch {
		// The sweep never blocks an export.
	}
}

/**
 * Storage gate failed, with the numbers that prove it. The message stays the
 * `insufficient-storage` contract the export hook maps; the fields give the
 * UI the needed/free bytes and the console the raw quota snapshot.
 */
export class OfflineStorageError extends Error {
	readonly neededBytes: number;
	/** Free bytes reported by the quota system; null when it cannot answer. */
	readonly freeBytes: number | null;

	constructor(fields: {
		neededBytes: number;
		freeBytes: number | null;
		quotaBytes?: number;
		usageBytes?: number;
	}) {
		super('insufficient-storage');
		this.name = 'OfflineStorageError';
		this.neededBytes = fields.neededBytes;
		this.freeBytes = fields.freeBytes;
		// Kept only for the console.error trail.
		this.quotaBytes = fields.quotaBytes ?? null;
		this.usageBytes = fields.usageBytes ?? null;
	}

	readonly quotaBytes: number | null;
	readonly usageBytes: number | null;
}

/**
 * Ask the browser to raise this origin's storage ceiling. Persistent storage
 * lifts the eviction pressure and (on Chrome) grants a much larger share of
 * the free disk, which multi-hour exports need. Best effort: a denial just
 * leaves the smaller temporary quota in place.
 */
async function ensurePersistentStorage(): Promise<void> {
	try {
		if ((await navigator.storage.persisted?.()) === true) return;
		await navigator.storage.persist?.();
	} catch {
		// The quota check below still gets an honest answer.
	}
}

/**
 * Free space reported by the quota system, or null when the browser cannot
 * answer. The 10% margin covers muxer overhead and the estimate's own error.
 */
async function opfsFreeBytes(): Promise<{
	freeBytes: number;
	quotaBytes: number;
	usageBytes: number;
} | null> {
	try {
		const estimate = await navigator.storage.estimate();
		if (
			typeof estimate.quota !== 'number' ||
			typeof estimate.usage !== 'number'
		) {
			return null;
		}
		const freeBytes = estimate.quota - estimate.usage;
		// Chrome can report usage above its own ceiling (the quota shrinks
		// when the disk fills, or stale multi-GB files from a crashed run
		// still count). A negative "free" is the browser contradicting
		// itself, not proof of a full disk — treating it as a hard block
		// would reject every export. The real gate is createWritable.
		if (!(freeBytes >= 0)) return null;
		return {
			freeBytes,
			quotaBytes: estimate.quota,
			usageBytes: estimate.usage
		};
	} catch {
		return null;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		window.setTimeout(resolve, ms);
	});
}

/**
 * Opens `<prefix><stamp>-<fileName>` in OPFS and wraps its writable stream in
 * the same cancellable proxy the save-picker path uses, so the muxer's
 * position-based writes land on disk and a cancelled export aborts the file
 * instead of committing a half-video.
 *
 * Reclaims files from crashed runs and asks for persistent storage BEFORE the
 * quota check, so the gate sees today's real free space, not stale debris.
 * Throws `OfflineStorageError` when the quota check fails or the file cannot
 * be created (a disk-full signal); returns null when OPFS is unavailable and
 * the caller should consider the buffer fallback.
 */
export async function createOpfsVideoSink(options: {
	fileName: string;
	estimatedBytes: number;
	isCancelled: () => boolean;
}): Promise<OpfsVideoSink | null> {
	if (!opfsSupported()) return null;
	await sweepStaleOpfsExports();
	await ensurePersistentStorage();
	const free = await opfsFreeBytes();
	if (free && free.freeBytes < options.estimatedBytes * 1.1) {
		throw new OfflineStorageError({
			neededBytes: options.estimatedBytes,
			freeBytes: free.freeBytes,
			quotaBytes: free.quotaBytes,
			usageBytes: free.usageBytes
		});
	}

	let handle: FileSystemFileHandle;
	let file: FileSystemWritableFileStream;
	try {
		const root = await opfsRoot();
		const safeName = options.fileName.replace(/[^\w.-]+/g, '_');
		handle = await root.getFileHandle(
			`${OPFS_FILE_PREFIX}${Date.now()}-${safeName}`,
			{ create: true }
		);
		file = await handle.createWritable();
	} catch (error) {
		// A quota failure or a full disk at createWritable: same honest signal.
		if (error instanceof OfflineStorageError) throw error;
		throw new OfflineStorageError({
			neededBytes: options.estimatedBytes,
			freeBytes: free?.freeBytes ?? null
		});
	}

	const rootPromise = opfsRoot();
	const remove = async () => {
		const root = await rootPromise;
		for (let attempt = 0; attempt <= REMOVE_RETRIES; attempt += 1) {
			try {
				await root.removeEntry(handle.name);
				return;
			} catch {
				await sleep(REMOVE_RETRY_STEP_MS);
			}
		}
	};

	const writable = createCancellableFileWritable(file, options.isCancelled);
	return {
		writable,
		async download(fileName: string) {
			// A File from OPFS is disk-backed: the object URL never loads the
			// video into memory, the download streams it from disk.
			const downloaded = await handle.getFile();
			const url = URL.createObjectURL(downloaded);
			const link = document.createElement('a');
			link.href = url;
			link.download = fileName;
			link.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 2000);
			await sleep(REMOVE_DELAY_MS);
			void remove();
		},
		async discard() {
			await writable.abort().catch(() => undefined);
			const root = await rootPromise;
			await root.removeEntry(handle.name).catch(() => undefined);
		}
	};
}
