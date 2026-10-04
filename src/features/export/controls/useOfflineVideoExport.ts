import { useEffect, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type { OfflineExportAudioAssetRef } from '@/features/export/offlineExportPlanner';
import { OFFLINE_EXPORT_RESOLUTION_PRESETS } from '@/features/export/offlineExportTypes';
import type { ExportNamingState } from '@/features/export/exportFileUtils';
import type { RenderSubsystem } from '@/features/export/renderSubsystem';
import { webCodecsEncoderProbe } from '@/features/export/video/offlineVideoEncoder';
import {
	negotiateOfflineVideoEncoder,
	type OfflineVideoEncoderPlan
} from '@/features/export/video/offlineEncoderNegotiation';
import { resolvePlatformLabel } from '@/lib/env/platform';
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
	const [plan, setPlan] = useState<OfflineVideoEncoderPlan | null>(null);
	const [planChecked, setPlanChecked] = useState(false);
	// Cosmetic only ("Windows 11" instead of "Windows"); the negotiation
	// never branches on it.
	const [platformLabel, setPlatformLabel] = useState('');
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

	useEffect(() => {
		let cancelled = false;
		void resolvePlatformLabel().then(label => {
			if (!cancelled) setPlatformLabel(label);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	// Negotiate the encoder ahead of the click, for two reasons: the save
	// picker needs the container's extension while the click still counts as
	// a user gesture, and no frame may be rendered before a config has passed
	// `VideoEncoder.isConfigSupported()`. The frame rate is part of that
	// config — a Windows H.264 encoder answers differently at 60 fps than at
	// 30 — so changing it renegotiates.
	useEffect(() => {
		let cancelled = false;
		setPlanChecked(false);
		void negotiateOfflineVideoEncoder(webCodecsEncoderProbe, {
			width: resolution.width,
			height: resolution.height,
			fps
		})
			.catch(() => null)
			.then(next => {
				if (cancelled) return;
				setPlan(next);
				setPlanChecked(true);
			});
		return () => {
			cancelled = true;
		};
	}, [resolution.width, resolution.height, fps]);

	const busy = isOfflineVideoExportBusyPhase(run.progress.phase);

	function startExport() {
		void startOfflineVideoExport({
			offlineAudioAsset,
			exportNamingState,
			trackTitle,
			fftSize,
			audioSmoothing,
			extraSubsystems,
			plan,
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
		plan,
		planChecked,
		platformLabel,
		progress: run.progress,
		error: run.error,
		storageHint: run.storageHint,
		savedFileName: run.savedFileName,
		savedFileBytes: run.savedFileBytes,
		busy,
		canStart: canExport && !busy && Boolean(plan) && planChecked,
		startExport,
		cancelExport: cancelOfflineVideoExport
	};
}
