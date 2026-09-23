import { useEffect, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type { OfflineExportAudioAssetRef } from '@/features/export/offlineExportPlanner';
import { OFFLINE_EXPORT_RESOLUTION_PRESETS } from '@/features/export/offlineExportTypes';
import type { ExportNamingState } from '@/features/export/exportFileUtils';
import type { RenderSubsystem } from '@/features/export/renderSubsystem';
import { mediabunnyCodecProbe } from '@/features/export/video/offlineVideoEncoder';
import {
	resolveOfflineVideoFormat,
	type OfflineVideoFormat
} from '@/features/export/video/offlineVideoFormat';
import {
	cancelOfflineVideoExport,
	getOfflineVideoExportSnapshot,
	isOfflineVideoExportBusyPhase,
	startOfflineVideoExport,
	subscribeOfflineVideoExport
} from '@/features/export/video/offlineVideoExportRuntime';

export type {
	OfflineStorageHint,
	OfflineVideoExportError
} from '@/features/export/video/offlineVideoExportRuntime';

type UseOfflineVideoExportArgs = {
	offlineAudioAsset: OfflineExportAudioAssetRef | null;
	exportNamingState: ExportNamingState;
	trackTitle: string;
	fftSize: number;
	audioSmoothing: number;
	extraSubsystems: RenderSubsystem[];
	canExport: boolean;
};

export function useOfflineVideoExport({
	offlineAudioAsset,
	exportNamingState,
	trackTitle,
	fftSize,
	audioSmoothing,
	extraSubsystems,
	canExport
}: UseOfflineVideoExportArgs) {
	// Resolution and fps are a standing preference, not a per-visit choice:
	// they live in the persisted store so a reload (or a tab switch) keeps
	// whatever the user picked last.
	const { resolutionId, fps, setResolutionId, setFps } = useWallpaperStore(
		useShallow(state => ({
			resolutionId: state.offlineExportResolutionId,
			fps: state.offlineExportFps,
			setResolutionId: state.setOfflineExportResolutionId,
			setFps: state.setOfflineExportFps
		}))
	);
	const [format, setFormat] = useState<OfflineVideoFormat | null>(null);
	const [formatChecked, setFormatChecked] = useState(false);
	// The run itself lives outside React (see offlineVideoExportRuntime): the
	// Export tab unmounts whenever the user looks at anything else.
	const run = useSyncExternalStore(
		subscribeOfflineVideoExport,
		getOfflineVideoExportSnapshot,
		getOfflineVideoExportSnapshot
	);

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

	const busy = isOfflineVideoExportBusyPhase(run.progress.phase);

	function startExport() {
		void startOfflineVideoExport({
			offlineAudioAsset,
			exportNamingState,
			trackTitle,
			fftSize,
			audioSmoothing,
			extraSubsystems,
			format,
			width: resolution.width,
			height: resolution.height,
			fps
		});
	}

	return {
		resolutionId,
		setResolutionId,
		fps,
		setFps,
		format,
		formatChecked,
		progress: run.progress,
		error: run.error,
		storageHint: run.storageHint,
		savedFileName: run.savedFileName,
		savedFileBytes: run.savedFileBytes,
		busy,
		canStart: canExport && !busy && Boolean(format) && formatChecked,
		startExport,
		cancelExport: cancelOfflineVideoExport
	};
}
