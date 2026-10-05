/**
 * The offline video export as a module-level runtime, not React state.
 *
 * A 4K/60 export runs for many minutes and the user keeps editing while it
 * does — which means leaving the Export tab. When the run lived in the tab's
 * component state, unmounting it aborted the encoder and threw away every
 * status field: the user came back to an idle panel with no way to tell
 * whether anything was still happening. One run per app, owned here, outlives
 * any component; the panel and the global progress bar are both subscribers.
 *
 * Same `useSyncExternalStore` shape as `store/persistenceStatus`.
 */
import { loadImageBlob } from '@/lib/db/imageDb';
import type { OfflineExportAudioAssetRef } from '@/features/export/offlineExportPlanner';
import type { OfflineExportFps } from '@/features/export/offlineExportTypes';
import {
	openOfflineAudioTrack,
	type OfflineAudioTrack
} from '@/features/export/video/offlineAudioTrack';
import {
	buildDescriptiveExportFileName,
	downloadBlobFallback,
	type ExportNamingState
} from '@/features/export/exportFileUtils';
import type { RenderSubsystem } from '@/features/export/renderSubsystem';
import {
	createCountingWritable,
	createCancellableFileWritable,
	type OfflineVideoSink
} from '@/features/export/video/offlineVideoEncoder';
import {
	estimateOfflineVideoBytes,
	type OfflineVideoExportProgress
} from '@/features/export/video/offlineVideoFormat';
import type { OfflineVideoEncoderPlan } from '@/features/export/video/offlineEncoderNegotiation';
import {
	createOpfsVideoSink,
	OfflineStorageError,
	sweepStaleOpfsExports,
	type OpfsVideoSink
} from '@/features/export/video/offlineOpfsSink';
import {
	EMPTY_STORAGE_ESTIMATE,
	formatStorageBytes,
	formatStorageEstimate,
	isQuotaExceededError,
	readStorageEstimate,
	type StorageEstimateSnapshot
} from '@/lib/db/storageDiagnostics';
import { runOfflineVideoExport } from '@/features/export/video/runOfflineVideoExport';

type SavePicker = (options: {
	suggestedName: string;
	types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

/**
 * Largest file the no-picker/no-OPFS path may keep in RAM. Beyond this the
 * browser throws while finalizing; the encoder was never asked to try.
 */
const BUFFER_FALLBACK_MAX_BYTES = 500 * 1024 * 1024;

export type OfflineVideoExportError =
	| 'no-audio'
	| 'no-encoder'
	| 'audio-not-found'
	| 'insufficient-storage'
	| 'failed';

/** Numbers behind an 'insufficient-storage' error, for the honest error line. */
export type OfflineStorageHint = {
	neededBytes: number;
	freeBytes: number | null;
};

export type OfflineVideoExportRunState = {
	progress: OfflineVideoExportProgress;
	error: OfflineVideoExportError | null;
	storageHint: OfflineStorageHint | null;
	savedFileName: string;
	savedFileBytes: number | null;
	/** The user closed the global bar; the Export panel keeps its result line. */
	noticeDismissed: boolean;
};

export type StartOfflineVideoExportArgs = {
	offlineAudioAsset: OfflineExportAudioAssetRef | null;
	exportNamingState: ExportNamingState;
	trackTitle: string;
	fftSize: number;
	audioSmoothing: number;
	extraSubsystems: RenderSubsystem[];
	/** The negotiated encoder config; null means negotiation found none. */
	plan: OfflineVideoEncoderPlan | null;
	width: number;
	height: number;
	fps: OfflineExportFps;
};

const IDLE_PROGRESS: OfflineVideoExportProgress = {
	phase: 'idle',
	frameIndex: 0,
	frameCount: 0,
	ratio: 0,
	elapsedMs: 0,
	etaMs: null
};

const IDLE_STATE: OfflineVideoExportRunState = {
	progress: IDLE_PROGRESS,
	error: null,
	storageHint: null,
	savedFileName: '',
	savedFileBytes: null,
	noticeDismissed: false
};

type Listener = () => void;

let state: OfflineVideoExportRunState = IDLE_STATE;
let abortController: AbortController | null = null;
const listeners = new Set<Listener>();

function patch(next: Partial<OfflineVideoExportRunState>): void {
	state = { ...state, ...next };
	listeners.forEach(listener => listener());
}

function getSavePicker(): SavePicker | null {
	const picker = (window as Window & { showSaveFilePicker?: SavePicker })
		.showSaveFilePicker;
	return typeof picker === 'function' ? picker.bind(window) : null;
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

export function isOfflineVideoExportBusyPhase(
	phase: OfflineVideoExportProgress['phase']
): boolean {
	return (
		phase === 'preparing' ||
		phase === 'decoding' ||
		phase === 'rendering' ||
		phase === 'finalizing'
	);
}

export function subscribeOfflineVideoExport(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getOfflineVideoExportSnapshot(): OfflineVideoExportRunState {
	return state;
}

export function cancelOfflineVideoExport(): void {
	abortController?.abort();
}

/** Hides the global bar only. The panel's done/error line survives. */
export function dismissOfflineVideoExportNotice(): void {
	if (state.noticeDismissed) return;
	patch({ noticeDismissed: true });
}

export async function startOfflineVideoExport({
	offlineAudioAsset,
	exportNamingState,
	trackTitle,
	fftSize,
	audioSmoothing,
	extraSubsystems,
	plan,
	width,
	height,
	fps
}: StartOfflineVideoExportArgs): Promise<void> {
	if (isOfflineVideoExportBusyPhase(state.progress.phase)) return;
	patch({ ...IDLE_STATE });
	if (!offlineAudioAsset) {
		patch({ error: 'no-audio' });
		return;
	}
	// Capability negotiation is a precondition, not a step: without a config
	// the browser already confirmed, not a single frame gets rendered.
	if (!plan) {
		patch({ error: 'no-encoder' });
		return;
	}
	const { format } = plan;

	const fileName = buildDescriptiveExportFileName({
		kind: 'recording',
		state: exportNamingState,
		extension: format.extension,
		fps: String(fps)
	});
	const controller = new AbortController();
	let finalizing = false;
	let sink = { kind: 'buffer' } as OfflineVideoSink;
	let opfs: OpfsVideoSink | null = null;
	// Real bytes the muxer pushed; shown in the done line so a gigabyte
	// export reports its size without opening the folder.
	const written = { bytes: 0 };
	let audioTrack: OfflineAudioTrack | null = null;
	// Both read before the first byte is written and reused by the error path,
	// so a quota failure can report what the numbers were when it started.
	let storage: StorageEstimateSnapshot = EMPTY_STORAGE_ESTIMATE;
	let estimatedBytes = 0;

	const picker = getSavePicker();
	if (picker) {
		try {
			const handle = await picker({
				suggestedName: fileName,
				types: [
					{
						description: 'Video',
						accept: {
							[format.mimeType]: [`.${format.extension}`]
						}
					}
				]
			});
			const file = await handle.createWritable();
			sink = {
				kind: 'stream',
				writable: createCountingWritable(
					createCancellableFileWritable(file, () => !finalizing),
					written
				)
			};
		} catch (pickerError) {
			if (isAbortError(pickerError)) return;
			// No usable picker (permissions, iframe): disk via OPFS below.
		}
	}

	abortController = controller;
	patch({ progress: { ...IDLE_PROGRESS, phase: 'preparing' } });

	// Reclaim debris from crashed runs, then read the quota — in that order, so
	// the numbers describe today's real free space. This runs for EVERY export,
	// not just the OPFS path: a Chrome user who gets the save picker streams
	// straight to their own disk, but gigabytes left in OPFS by a previous
	// failed run still sit in the same per-origin bucket as the project state,
	// and that is what makes saving start failing.
	//
	// Nothing here is user data: the files are this module's own
	// `vibrix-export-*` scratch files, and only ones untouched for minutes.
	const swept = await sweepStaleOpfsExports();
	if (swept.removed > 0) {
		console.info(
			`[offline-export] reclaimed ${formatStorageBytes(swept.reclaimedBytes)} from ${swept.removed} abandoned export file(s).`
		);
	}
	storage = await readStorageEstimate();
	console.info(
		`[offline-export] storage before export: ${formatStorageEstimate(storage)}`
	);

	try {
		const blob = await loadImageBlob(offlineAudioAsset.assetId);
		if (!blob) throw new Error('audio-asset-not-found');
		controller.signal.throwIfAborted();
		patch({ progress: { ...IDLE_PROGRESS, phase: 'decoding' } });
		// Opens metadata + decoder only: no samples are held before the
		// frame loop pumps them, so a 3-hour mix never hits RAM at once.
		audioTrack = await openOfflineAudioTrack(blob, {
			fftSize,
			feedsEncoder: true
		});
		controller.signal.throwIfAborted();

		estimatedBytes = estimateOfflineVideoBytes({
			width,
			height,
			fps,
			durationSec: audioTrack.durationSec,
			videoBitsPerSecond: plan.video.bitrate
		});
		console.info(
			`[offline-export] estimated output ${formatStorageBytes(estimatedBytes)} · ${sink.kind === 'stream' ? 'streaming to the file you picked (outside the browser quota)' : 'no save picker; falling back to browser storage'}`
		);

		if (sink.kind === 'buffer') {
			// No picker (Brave, Firefox): stream to disk instead of RAM;
			// BufferTarget stays the last resort for small files only.
			opfs = await createOpfsVideoSink({
				fileName,
				estimatedBytes,
				isCancelled: () => !finalizing
			});
			if (opfs) {
				sink = {
					kind: 'stream',
					writable: createCountingWritable(opfs.writable, written)
				};
			} else if (estimatedBytes > BUFFER_FALLBACK_MAX_BYTES) {
				patch({
					storageHint: {
						neededBytes: estimatedBytes,
						freeBytes: null
					}
				});
				throw new Error('insufficient-storage');
			}
		}
		const result = await runOfflineVideoExport({
			audioTrack,
			plan,
			sink,
			width,
			height,
			fps,
			trackTitle,
			fftSize,
			audioSmoothing,
			extraSubsystems,
			abortSignal: controller.signal,
			onProgress: next => {
				if (next.phase === 'finalizing') finalizing = true;
				patch({ progress: next });
			}
		});

		if (opfs) await opfs.download(fileName);
		else if (result.blob) downloadBlobFallback(result.blob, fileName);
		patch({
			savedFileName: fileName,
			savedFileBytes: result.blob
				? result.blob.size
				: written.bytes || null
		});
	} catch (exportError) {
		if (controller.signal.aborted || isAbortError(exportError)) {
			patch({ progress: { ...IDLE_PROGRESS, phase: 'cancelled' } });
		} else {
			const message =
				exportError instanceof Error ? exportError.message : '';
			// A QuotaExceededError from the writable is the browser running out
			// of room mid-write — a different problem from an encoder refusal
			// or a GL fault, with a different answer for the user, so it must
			// not be flattened into the generic 'failed'.
			const quotaExceeded = isQuotaExceededError(exportError);
			patch({
				progress: { ...IDLE_PROGRESS, phase: 'error' },
				storageHint:
					exportError instanceof OfflineStorageError
						? {
								neededBytes: exportError.neededBytes,
								freeBytes: exportError.freeBytes
							}
						: quotaExceeded
							? {
									neededBytes: estimatedBytes,
									freeBytes: storage.availableBytes
								}
							: state.storageHint,
				error:
					message === 'audio-asset-not-found'
						? 'audio-not-found'
						: message === 'insufficient-storage' || quotaExceeded
							? 'insufficient-storage'
							: 'failed'
			});
			if (quotaExceeded) {
				// The numbers AFTER the failure: how full it actually got.
				const after = await readStorageEstimate();
				console.error(
					`[offline-export] out of storage. ${formatStorageEstimate(after)} · estimated output ${formatStorageBytes(estimatedBytes)}`,
					exportError
				);
			} else {
				console.error('[offline-export]', exportError);
			}
		}
		if (opfs) {
			await opfs.discard();
		} else if (sink.kind === 'stream') {
			await sink.writable.abort().catch(() => undefined);
		}
	} finally {
		audioTrack?.dispose();
		abortController = null;
	}
}
