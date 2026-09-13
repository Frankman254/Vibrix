import { useEffect, useMemo, useRef } from 'react';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioData } from '@/hooks/useAudioData';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import { getEditorThemePalette } from '@/lib/backgroundPalette';
import { updateStageLightsDiag } from '@/features/stageFx/stageFxConfig';
import {
	createStageLightsRuntime,
	drawStageLights,
	stepStageLights
} from '@/features/stageFx/stageLightsDraw';
import {
	resolveOutputMinFrameMs,
	syncOutputCanvasBacking,
	subscribeOutputRenderQuality
} from '@/runtime/outputRenderQuality';

/**
 * Directional concert beams only. Flash impacts live in `FlashLightCanvas` so
 * both layers can be tuned, disabled, and rendered independently. The beam
 * math and drawing live in `stageLightsDraw`, shared with the video export.
 */
export default function StageLightsCanvas({ zIndex = 1 }: { zIndex?: number }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rafRef = useRef<number>(0);
	const lastTimeRef = useRef<number>(0);
	const lastDrawTimeRef = useRef<number>(0);
	const runtimeRef = useRef(createStageLightsRuntime());
	// Tracks whether we drew anything last frame — used to avoid redundant
	// clearRect calls on every idle frame when the effect is off.
	const wasVisibleRef = useRef<boolean>(false);
	const palette = useBackgroundPalette();
	const paletteRef = useRef(palette);
	const editorTheme = useWallpaperStore(state => state.editorTheme);
	const themePalette = useMemo(
		() => getEditorThemePalette(editorTheme),
		[editorTheme]
	);
	const themePaletteRef = useRef(themePalette);
	const { getAudioSnapshot } = useAudioData();

	useEffect(() => {
		paletteRef.current = palette;
	}, [palette]);

	useEffect(() => {
		themePaletteRef.current = themePalette;
	}, [themePalette]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		function resize() {
			const c = canvasRef.current;
			if (!c) return;
			syncOutputCanvasBacking(c);
		}
		resize();
		const unsubQuality = subscribeOutputRenderQuality(resize);
		window.addEventListener('resize', resize);

		function clearIfVisible(c: HTMLCanvasElement) {
			if (!wasVisibleRef.current || !ctx) return;
			ctx.clearRect(0, 0, c.width, c.height);
			wasVisibleRef.current = false;
		}

		function frame(time: number) {
			const c = canvasRef.current;
			if (!c || !ctx) return;
			const state = useWallpaperStore.getState();
			const quality = state.performanceMode;
			const minFrameMs = resolveOutputMinFrameMs(quality);
			if (time - lastDrawTimeRef.current < minFrameMs) {
				rafRef.current = requestAnimationFrame(frame);
				return;
			}
			const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
			lastTimeRef.current = time;
			lastDrawTimeRef.current = time;

			// Skip entirely when disabled — only clear once on the transition frame.
			if (!state.stageLightsEnabled || state.sleepModeActive) {
				clearIfVisible(c);
				updateStageLightsDiag(false, 0, 0, quality);
				rafRef.current = requestAnimationFrame(frame);
				return;
			}

			const response = stepStageLights(
				runtimeRef.current,
				state,
				getAudioSnapshot(),
				time,
				dt,
				state.motionPaused
			);
			const result = drawStageLights(
				ctx,
				c.width,
				c.height,
				state,
				runtimeRef.current,
				response,
				{
					background: paletteRef.current,
					theme: themePaletteRef.current
				}
			);
			if (result.drawn) {
				wasVisibleRef.current = true;
			} else {
				clearIfVisible(c);
			}
			updateStageLightsDiag(
				result.drawn,
				result.beamCount,
				result.passes,
				quality
			);
			rafRef.current = requestAnimationFrame(frame);
		}

		rafRef.current = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(rafRef.current);
			window.removeEventListener('resize', resize);
			unsubQuality();
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		};
	}, [getAudioSnapshot]);

	return (
		<canvas
			ref={canvasRef}
			data-camera-motion-layer="stage-lights"
			style={{
				position: 'fixed',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				zIndex
			}}
		/>
	);
}
