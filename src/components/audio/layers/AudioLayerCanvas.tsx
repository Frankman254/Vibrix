import { useEffect, useRef } from 'react';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioData } from '@/hooks/useAudioData';
import { resetSpectrum } from '@/features/spectrum/render';
import { resetLogo } from '@/features/logo';
import { formatTrackTitle } from '@/lib/audio/trackTitle';
import { getOverlayLayerById } from '@/lib/layers';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import {
	createAudioLayerFrameRenderState,
	renderAudioLayerFrame,
	type RenderableAudioLayer
} from '@/features/audioLayers/render';
import {
	resolveOutputMinFrameMs,
	syncOutputCanvasBacking,
	subscribeOutputRenderQuality
} from '@/runtime/outputRenderQuality';
import {
	transitionSubsystemsForLayerType,
	useVisualTransitionFade
} from '@/features/visualTransition/useVisualTransitionFade';
import {
	cameraTargetForSpectrumPartition,
	partitionDrawsMainSpectrum,
	type SpectrumDrawPartition
} from '@/features/spectrum/domain/spectrumCameraSplit';

export default function AudioLayerCanvas({
	layer,
	spectrumPartition = 'all'
}: {
	layer: RenderableAudioLayer;
	/**
	 * Which spectrums this canvas draws. With `'all'` (everything but a split
	 * spectrum) there is one canvas; while the camera targets Spectrum 2 the
	 * viewport mounts two, `'main'` and `'instances'`, so each can be
	 * transformed on its own.
	 */
	spectrumPartition?: SpectrumDrawPartition;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const fadeRef = useVisualTransitionFade(
		transitionSubsystemsForLayerType(layer.type)
	);
	const rafRef = useRef<number>(0);
	const lastTimeRef = useRef<number>(0);
	const lastDrawTimeRef = useRef<number>(0);
	const layerRef = useRef<RenderableAudioLayer>(layer);
	const frameRenderStateRef = useRef(createAudioLayerFrameRenderState());
	const spectrumPartitionRef = useRef(spectrumPartition);
	const cachedRawTrackTitleRef = useRef<string>('');
	const cachedFormattedTrackTitleRef = useRef<string>('');
	const wasVisibleRef = useRef<boolean>(false);
	const backgroundPalette = useBackgroundPalette();
	const paletteRef = useRef(backgroundPalette);
	const {
		getAudioSnapshot,
		getFileName,
		getCurrentTime,
		getDuration,
		captureMode
	} = useAudioData();

	useEffect(() => {
		layerRef.current = layer;
	}, [layer]);

	useEffect(() => {
		spectrumPartitionRef.current = spectrumPartition;
	}, [spectrumPartition]);

	useEffect(() => {
		paletteRef.current = backgroundPalette;
	}, [backgroundPalette]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		function resize() {
			const currentCanvas = canvasRef.current;
			if (!currentCanvas) return;
			syncOutputCanvasBacking(currentCanvas);
		}
		resize();
		const unsubQuality = subscribeOutputRenderQuality(resize);
		window.addEventListener('resize', resize);

		function frame(time: number) {
			const currentCanvas = canvasRef.current;
			if (!currentCanvas || !ctx) return;

			const state = useWallpaperStore.getState();

			// Frame-rate cap by performance mode. A music visualiser looks
			// identical at 60fps as at 120fps, so on high-refresh displays this
			// roughly halves the cost of the (expensive) Canvas2D spectrum draw
			// — including the doubled main+clone pass — with no visible change.
			// Mirrors the cadence StageLightsCanvas already uses.
			const minFrameMs = resolveOutputMinFrameMs(state.performanceMode);
			if (time - lastDrawTimeRef.current < minFrameMs) {
				rafRef.current = requestAnimationFrame(frame);
				return;
			}

			if (state.motionPaused || state.sleepModeActive) {
				lastTimeRef.current = time;
				lastDrawTimeRef.current = time;
				rafRef.current = requestAnimationFrame(frame);
				return;
			}

			const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
			lastTimeRef.current = time;
			lastDrawTimeRef.current = time;

			// A layer that is switched off used to clear its full-screen
			// backing store on every frame and only then have
			// `renderAudioLayerFrame` notice `enabled` was false and return.
			// Clear once on the way out, then leave it alone — same shape
			// StageLightsCanvas already uses for its invisible frames.
			const liveLayer = getOverlayLayerById(state, layerRef.current.id);
			if (liveLayer?.enabled !== true) {
				if (wasVisibleRef.current) {
					ctx.clearRect(
						0,
						0,
						currentCanvas.width,
						currentCanvas.height
					);
					wasVisibleRef.current = false;
				}
				rafRef.current = requestAnimationFrame(frame);
				return;
			}
			ctx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
			wasVisibleRef.current = true;

			// Only use file-derived title in file mode; clear it in live capture modes
			const rawTrackTitle = captureMode === 'file' ? getFileName() : '';
			if (rawTrackTitle !== cachedRawTrackTitleRef.current) {
				cachedRawTrackTitleRef.current = rawTrackTitle;
				cachedFormattedTrackTitleRef.current =
					formatTrackTitle(rawTrackTitle);
			}

			const audio: AudioSnapshot = getAudioSnapshot();
			const trackCurrentTime = getCurrentTime();
			const trackDuration = getDuration();
			const configuredLayer = layerRef.current;
			renderAudioLayerFrame({
				ctx,
				canvas: currentCanvas,
				layer: configuredLayer,
				state,
				audio,
				dt,
				timeMs: time,
				palette: paletteRef.current,
				trackTitle: cachedFormattedTrackTitleRef.current,
				trackCurrentTime,
				trackDuration,
				frameState: frameRenderStateRef.current,
				spectrumPartition: spectrumPartitionRef.current
			});

			rafRef.current = requestAnimationFrame(frame);
		}

		rafRef.current = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(rafRef.current);
			window.removeEventListener('resize', resize);
			unsubQuality();
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		};
	}, [
		captureMode,
		getAudioSnapshot,
		getCurrentTime,
		getDuration,
		getFileName
	]);

	useEffect(
		() => () => {
			if (layer.type === 'logo') resetLogo();
			// Only the canvas that owns the main spectrum resets the shared draw
			// state: the instances canvas comes and goes with the camera split,
			// and resetting there would clear Spectrum 1's smoothing with it.
			if (
				layer.type === 'spectrum' &&
				partitionDrawsMainSpectrum(spectrumPartition)
			) {
				resetSpectrum();
			}
		},
		[layer.type, spectrumPartition]
	);

	return (
		<div
			ref={fadeRef}
			data-camera-motion-layer={
				layer.type === 'spectrum'
					? cameraTargetForSpectrumPartition(spectrumPartition)
					: layer.type
			}
			style={{
				position: 'fixed',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				zIndex: layer.zIndex
			}}
		>
			<canvas
				ref={canvasRef}
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					pointerEvents: 'none'
				}}
			/>
		</div>
	);
}
