import { useEffect, useRef, useState } from 'react';
import { loadImageBlob } from '@/lib/db/imageDb';
import type { OfflineExportAudioAssetRef } from '@/features/export/offlineExportPlanner';
import {
	OFFLINE_EXPORT_RESOLUTION_PRESETS,
	type OfflineExportFps,
	type OfflineExportResolutionPresetId
} from '@/features/export/offlineExportTypes';
import { decodeOfflineAudioFile } from '@/features/export/offlineAudioAnalysis';
import {
	buildDescriptiveExportFileName,
	downloadBlobFallback,
	type ExportNamingState
} from '@/features/export/exportFileUtils';
import type { RenderSubsystem } from '@/features/export/renderSubsystem';
import {
	createCancellableFileWritable,
	mediabunnyCodecProbe,
	type OfflineVideoSink
} from '@/features/export/video/offlineVideoEncoder';
import {
	resolveOfflineVideoFormat,
	type OfflineVideoExportProgress,
	type OfflineVideoFormat
} from '@/features/export/video/offlineVideoFormat';
import { runOfflineVideoExport } from '@/features/export/video/runOfflineVideoExport';

type SavePicker = (options: {
	suggestedName: string;
	types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

type UseOfflineVideoExportArgs = {
	offlineAudioAsset: OfflineExportAudioAssetRef | null;
	exportNamingState: ExportNamingState;
	trackTitle: string;
	fftSize: number;
	audioChannelSmoothing: number;
	extraSubsystems: RenderSubsystem[];
	canExport: boolean;
};

export type OfflineVideoExportError =
	| 'no-audio'
	| 'no-encoder'
	| 'audio-not-found'
	| 'failed';

const IDLE_PROGRESS: OfflineVideoExportProgress = {
	phase: 'idle',
	frameIndex: 0,
	frameCount: 0,
	ratio: 0,
	elapsedMs: 0,
	etaMs: null
};

function getSavePicker(): SavePicker | null {
	const picker = (window as Window & { showSaveFilePicker?: SavePicker })
		.showSaveFilePicker;
	return typeof picker === 'function' ? picker.bind(window) : null;
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

export function useOfflineVideoExport({
	offlineAudioAsset,
	exportNamingState,
	trackTitle,
	fftSize,
	audioChannelSmoothing,
	extraSubsystems,
	canExport
}: UseOfflineVideoExportArgs) {
	const [resolutionId, setResolutionId] =
		useState<OfflineExportResolutionPresetId>('1080p');
	const [fps, setFps] = useState<OfflineExportFps>(30);
	const [format, setFormat] = useState<OfflineVideoFormat | null>(null);
	const [formatChecked, setFormatChecked] = useState(false);
	const [progress, setProgress] =
		useState<OfflineVideoExportProgress>(IDLE_PROGRESS);
	const [error, setError] = useState<OfflineVideoExportError | null>(null);
	const [savedFileName, setSavedFileName] = useState('');
	const abortRef = useRef<AbortController | null>(null);

	const resolution =
		OFFLINE_EXPORT_RESOLUTION_PRESETS.find(
			preset => preset.id === resolutionId
		) ?? OFFLINE_EXPORT_RESOLUTION_PRESETS[0];

	// Probe codecs ahead of the click: the save picker needs the extension
	// and must open while the click still counts as a user gesture.
	useEffect(() => {
		let cancelled = false;
		setFormatChecked(false);
		void resolveOfflineVideoFormat(mediabunnyCodecProbe, {
			width: resolution.width,
			height: resolution.height
		})
			.catch(() => null)
			.then(next => {
				if (cancelled) return;
				setFormat(next);
				setFormatChecked(true);
			});
		return () => {
			cancelled = true;
		};
	}, [resolution.width, resolution.height]);

	useEffect(() => () => abortRef.current?.abort(), []);

	const busy =
		progress.phase === 'preparing' ||
		progress.phase === 'decoding' ||
		progress.phase === 'rendering' ||
		progress.phase === 'finalizing';

	async function startExport() {
		if (busy) return;
		setError(null);
		setSavedFileName('');
		if (!offlineAudioAsset) {
			setError('no-audio');
			return;
		}
		if (!format) {
			setError('no-encoder');
			return;
		}

		const fileName = buildDescriptiveExportFileName({
			kind: 'recording',
			state: exportNamingState,
			extension: format.extension,
			fps: String(fps)
		});
		const controller = new AbortController();
		let finalizing = false;
		let sink = { kind: 'buffer' } as OfflineVideoSink;

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
					writable: createCancellableFileWritable(
						file,
						() => !finalizing
					)
				};
			} catch (pickerError) {
				if (isAbortError(pickerError)) return;
				// No usable picker (permissions, iframe): keep it in memory.
			}
		}

		abortRef.current = controller;
		setProgress({ ...IDLE_PROGRESS, phase: 'preparing' });

		try {
			const blob = await loadImageBlob(offlineAudioAsset.assetId);
			if (!blob) throw new Error('audio-asset-not-found');
			controller.signal.throwIfAborted();
			setProgress({ ...IDLE_PROGRESS, phase: 'decoding' });
			const audioBuffer = await decodeOfflineAudioFile(blob);
			controller.signal.throwIfAborted();

			const result = await runOfflineVideoExport({
				audioBuffer,
				format,
				sink,
				width: resolution.width,
				height: resolution.height,
				fps,
				trackTitle,
				fftSize,
				audioChannelSmoothing,
				extraSubsystems,
				abortSignal: controller.signal,
				onProgress: next => {
					if (next.phase === 'finalizing') finalizing = true;
					setProgress(next);
				}
			});

			if (result.blob) downloadBlobFallback(result.blob, fileName);
			setSavedFileName(fileName);
		} catch (exportError) {
			if (controller.signal.aborted || isAbortError(exportError)) {
				setProgress({ ...IDLE_PROGRESS, phase: 'cancelled' });
			} else {
				setProgress({ ...IDLE_PROGRESS, phase: 'error' });
				setError(
					exportError instanceof Error &&
						exportError.message === 'audio-asset-not-found'
						? 'audio-not-found'
						: 'failed'
				);
				console.error('[offline-export]', exportError);
			}
			if (sink.kind === 'stream') {
				await sink.writable.abort().catch(() => undefined);
			}
		} finally {
			abortRef.current = null;
		}
	}

	function cancelExport() {
		abortRef.current?.abort();
	}

	return {
		resolutionId,
		setResolutionId,
		fps,
		setFps,
		format,
		formatChecked,
		progress,
		error,
		savedFileName,
		busy,
		canStart: canExport && !busy && Boolean(format) && formatChecked,
		startExport,
		cancelExport
	};
}
