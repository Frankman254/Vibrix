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
 * Free space reported by the quota system, or null when the browser cannot
 * answer. The 10% margin covers muxer overhead and the estimate's own error.
 */
export async function opfsHasSpaceFor(
	estimatedBytes: number
): Promise<boolean> {
	try {
		const estimate = await navigator.storage.estimate();
		if (
			typeof estimate.quota !== 'number' ||
			typeof estimate.usage !== 'number'
		) {
			return true;
		}
		return estimate.quota - estimate.usage >= estimatedBytes * 1.1;
	} catch {
		return true;
	}
}

function sleep(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	window.setTimeout(resolve, ms);
	return promise;
}

/**
 * Opens `<prefix><stamp>-<fileName>` in OPFS and wraps its writable stream in
 * the same cancellable proxy the save-picker path uses, so the muxer's
 * position-based writes land on disk and a cancelled export aborts the file
 * instead of committing a half-video.
 *
 * Throws `insufficient-storage` when the quota check fails or the file cannot
 * be created (a disk-full signal); returns null when OPFS is unavailable and
 * the caller should consider the buffer fallback.
 */
export async function createOpfsVideoSink(options: {
	fileName: string;
	estimatedBytes: number;
	isCancelled: () => boolean;
}): Promise<OpfsVideoSink | null> {
	if (!opfsSupported()) return null;
	if (!(await opfsHasSpaceFor(options.estimatedBytes))) {
		throw new Error('insufficient-storage');
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
		if (error instanceof Error && error.name === 'QuotaExceededError') {
			throw new Error('insufficient-storage');
		}
		throw new Error('insufficient-storage');
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

	return {
		writable: createCancellableFileWritable(file, options.isCancelled),
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
			await this.writable.abort().catch(() => undefined);
			const root = await rootPromise;
			await root.removeEntry(handle.name).catch(() => undefined);
		}
	};
}
