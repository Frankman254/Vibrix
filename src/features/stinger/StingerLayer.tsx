/**
 * The generated intro / ending, live.
 *
 * Draws the same montage the offline export draws (`stingerPlan` decides the
 * window and the layout, `paintStinger` paints it) on the track's own clock, so
 * what plays here is what lands in the file. The canvas sits above every other
 * layer and is empty — a no-op — whenever the playhead is outside both windows.
 *
 * It deliberately carries no `data-camera-motion-layer`: an intro that shakes
 * with the camera would read as part of the scene instead of framing it.
 */
import { useEffect, useRef } from 'react';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioContext } from '@/context/useAudioContext';
import { resolveSlideshowPool } from '@/features/background';
import {
	syncOutputCanvasBacking,
	subscribeOutputRenderQuality
} from '@/runtime/outputRenderQuality';
import { paintStinger } from './stingerPaint';
import {
	pickStingerImages,
	resolveStingerBackdropAlpha,
	resolveStingerCards,
	resolveStingerWindow
} from './stingerPlan';

export default function StingerLayer({ zIndex = 95 }: { zIndex?: number }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rafRef = useRef<number>(0);
	const paintedRef = useRef(false);
	const imagesRef = useRef(new Map<string, HTMLImageElement>());
	const { getCurrentTime, getDuration } = useAudioContext();

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		function resize() {
			const c = canvasRef.current;
			if (c) syncOutputCanvasBacking(c);
		}
		resize();
		const unsubQuality = subscribeOutputRenderQuality(resize);
		window.addEventListener('resize', resize);

		/** Decoded lazily: a montage of four images must not block a frame. */
		function imageFor(url: string): HTMLImageElement | null {
			const cached = imagesRef.current.get(url);
			if (cached) return cached.complete ? cached : null;
			const image = new Image();
			image.decoding = 'async';
			image.src = url;
			imagesRef.current.set(url, image);
			return null;
		}

		function frame() {
			const c = canvasRef.current;
			if (!c || !ctx) {
				rafRef.current = requestAnimationFrame(frame);
				return;
			}
			const state = useWallpaperStore.getState();
			const window_ = resolveStingerWindow(
				state,
				Math.max(0, getCurrentTime()),
				getDuration()
			);
			if (!window_) {
				if (paintedRef.current) {
					ctx.clearRect(0, 0, c.width, c.height);
					paintedRef.current = false;
				}
				rafRef.current = requestAnimationFrame(frame);
				return;
			}

			const settings =
				window_.kind === 'intro'
					? state.introStinger
					: state.outroStinger;
			const pool = resolveSlideshowPool(
				state.backgroundImages,
				state.setlists,
				state.activeSetlistId
			);
			const ids = pickStingerImages(pool, settings);
			const images = new Map<number, HTMLImageElement>();
			ids.forEach((assetId, index) => {
				const url = pool.find(item => item.assetId === assetId)?.url;
				if (!url) return;
				const image = imageFor(url);
				if (image) images.set(index, image);
			});

			ctx.clearRect(0, 0, c.width, c.height);
			paintedRef.current = true;
			if (ids.length === 0) {
				rafRef.current = requestAnimationFrame(frame);
				return;
			}
			paintStinger({
				ctx,
				viewport: { width: c.width, height: c.height },
				cards: resolveStingerCards(
					window_.kind,
					settings.style,
					window_.progress,
					ids.length,
					{ width: c.width, height: c.height }
				),
				images,
				backdropAlpha: resolveStingerBackdropAlpha(
					window_.kind,
					window_.progress
				)
			});
			rafRef.current = requestAnimationFrame(frame);
		}

		rafRef.current = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(rafRef.current);
			window.removeEventListener('resize', resize);
			unsubQuality();
			imagesRef.current.clear();
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		};
	}, [getCurrentTime, getDuration]);

	return (
		<canvas
			ref={canvasRef}
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
