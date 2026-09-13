import { useEffect, useMemo, useRef } from 'react';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioData } from '@/hooks/useAudioData';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import { getEditorThemePalette } from '@/lib/backgroundPalette';
import { updateFlashDiag } from '@/features/stageFx/stageFxConfig';
import { updateFlashEdgeDrive } from '@/features/stageFx/flashEdgeDrive';
import {
	createFlashLightRuntime,
	drawFlashLight,
	resolveFlashLightColor,
	stepFlashLight
} from '@/features/stageFx/flashLightDraw';
import {
	syncOutputCanvasBacking,
	subscribeOutputRenderQuality
} from '@/runtime/outputRenderQuality';

/**
 * Audio-peak impact overlay, independent from the moving Stage Lights beams.
 * The peak envelope and the shapes live in `flashLightDraw`, shared with the
 * video export.
 */
export default function FlashLightCanvas({ zIndex = 90 }: { zIndex?: number }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rafRef = useRef<number>(0);
	const lastTimeRef = useRef<number>(0);
	const runtimeRef = useRef(createFlashLightRuntime());
	const visibleRef = useRef<boolean>(false);
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

		function frame(time: number) {
			const c = canvasRef.current;
			if (!c || !ctx) return;
			const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
			lastTimeRef.current = time;
			const state = useWallpaperStore.getState();

			const runtime = runtimeRef.current;
			// Always compute drive even when Flash Light visual is off so Flash
			// Edge can sync independently.
			if (!state.sleepModeActive) {
				stepFlashLight(runtime, state, getAudioSnapshot(), time, dt);
			} else {
				runtime.drive = 0;
				runtime.lastLevel = 0;
			}

			const resolvedFlashColor = resolveFlashLightColor(state, {
				background: paletteRef.current,
				theme: themePaletteRef.current
			});

			// Expose drive + color for Flash Edge consumers in other layers.
			updateFlashEdgeDrive(runtime.drive, resolvedFlashColor);
			updateFlashDiag(runtime.drive > 0.001, runtime.drive);

			// Only draw if Flash Light visual is enabled.
			if (!state.flashLightEnabled) {
				if (visibleRef.current) {
					ctx.clearRect(0, 0, c.width, c.height);
					visibleRef.current = false;
				}
				rafRef.current = requestAnimationFrame(frame);
				return;
			}

			const visible = runtime.drive > 0.001;
			if (!visible && !visibleRef.current) {
				rafRef.current = requestAnimationFrame(frame);
				return;
			}
			ctx.clearRect(0, 0, c.width, c.height);
			visibleRef.current = visible;

			if (visible) {
				drawFlashLight(
					ctx,
					c.width,
					c.height,
					state,
					runtime,
					resolvedFlashColor
				);
			}

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
			data-camera-motion-layer="flash-light"
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
