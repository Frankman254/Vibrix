import { useEffect, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type { OfflineExportAudioAssetRef } from '@/features/export/offlineExportPlanner';
import {
	qualityScaleFor,
	readScreenMetrics,
	resolutionPresetForScreen,
	resolveExportDimensions,
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
		qualityId,
		performanceMode,
		setResolutionId,
		setResolutionAuto,
		setFps,
		setQualityId
	} = useWallpaperStore(
		useShallow(state => ({
			storedResolutionId: state.offlineExportResolutionId,
			resolutionAuto: state.offlineExportResolutionAuto,
			fps: state.offlineExportFps,
			qualityId: state.offlineExportQualityId,
			// Reported, not used: the render forces `high`, and `high` lifts the
			// ceilings that clamp the particle sliders — so an editor below it
			// is previewing something the video will not reproduce.
			performanceMode: state.performanceMode,
			setResolutionId: state.setOfflineExportResolutionId,
			setResolutionAuto: state.setOfflineExportResolutionAuto,
			setFps: state.setOfflineExportFps,
			setQualityId: state.setOfflineExportQualityId
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

	// The preset names the short side; the long one comes from the display's
	// own aspect, because a wallpaper's target is this monitor full screen.
	const resolution = resolveExportDimensions(resolutionId, screen);
	const qualityScale = qualityScaleFor(qualityId);

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
			fps,
			qualityScale
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
	}, [resolution.width, resolution.height, fps, qualityScale]);

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
		qualityId,
		setQualityId,
		/** `3440\u00d71440`, what the encoder was actually negotiated for. */
		dimensionsLabel: `${resolution.width}\u00d7${resolution.height}`,
		/** `2560\u00d71440`, the display's real pixels, for the Auto hint. */
		screenLabel: screen
			? `${Math.round(screen.width * (screen.devicePixelRatio || 1))}\u00d7${Math.round(
					screen.height * (screen.devicePixelRatio || 1)
				)}`
			: '',
		performanceMode,
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
