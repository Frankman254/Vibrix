import { useEffect, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type { OfflineExportAudioAssetRef } from '@/features/export/offlineExportPlanner';
import {
	OFFLINE_EXPORT_RESOLUTION_PRESETS,
	readScreenMetrics,
	resolutionPresetForScreen,
	type ScreenMetrics
} from '@/features/export/offlineExportTypes';
import type { ExportNamingState } from '@/features/export/exportFileUtils';
import type { RenderSubsystem } from '@/features/export/renderSubsystem';
import { webCodecsEncoderProbe } from '@/features/export/video/offlineVideoEncoder';
import {
	negotiateOfflineVideoEncoder,
	type OfflineVideoEncoderPlan
} from '@/features/export/video/offlineEncoderNegotiation';
import { resolvePlatformLabel } from '@/lib/env/platform';
import { flushPersistedState } from '@/store/persistedStateStorage';
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
	const {
		storedResolutionId,
		resolutionAuto,
		fps,
		setResolutionId,
		setResolutionAuto,
		setFps
	} = useWallpaperStore(
		useShallow(state => ({
			storedResolutionId: state.offlineExportResolutionId,
			resolutionAuto: state.offlineExportResolutionAuto,
			fps: state.offlineExportFps,
			setResolutionId: state.setOfflineExportResolutionId,
			setResolutionAuto: state.setOfflineExportResolutionAuto,
			setFps: state.setOfflineExportFps
		}))
	);
	// Re-read on resize: `screen.*` reports the display the window is ON, so
	// dragging the editor to a 4K monitor should change the answer.
	const [screen, setScreen] = useState<ScreenMetrics | null>(() =>
		readScreenMetrics()
	);
	useEffect(() => {
		const onResize = () => setScreen(readScreenMetrics());
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);
	const screenResolutionId = resolutionPresetForScreen(screen);
	// Auto is the default, so a 1440p screen exports at 1440p without anybody
	// opening this tab. The negotiation below reads THIS, never the stored
	// value, so the encoder is always probed for the size that will be used.
	const resolutionId = resolutionAuto
		? screenResolutionId
		: storedResolutionId;
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
		// Spend the pending debounced write before the export starts competing
		// for the same per-origin storage quota: if the export fills it, this
		// is the last chance for the project's own state to land on disk.
		void flushPersistedState();
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
		resolutionAuto,
		setResolutionAuto,
		/** `2560\u00d71440`, the display's real pixels, for the Auto hint. */
		screenLabel: screen
			? `${Math.round(screen.width * (screen.devicePixelRatio || 1))}\u00d7${Math.round(
					screen.height * (screen.devicePixelRatio || 1)
				)}`
			: '',
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
