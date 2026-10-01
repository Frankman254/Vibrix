/**
 * The generated intro / ending, live.
 *
 * Draws the same composition the offline export draws — `introPlan` decides
 * how far every piece is mounted, `paintIntro` places it — on the track's own
 * clock, so what plays here is what lands in the file. The canvas sits above
 * every other layer and is a no-op whenever the playhead is outside both
 * windows.
 *
 * It deliberately carries no `data-camera-motion-layer`: an intro that shakes
 * with the camera would read as part of the scene instead of framing it.
 */
import { useEffect, useRef, useState } from 'react';
import type { IntroSequenceSettings, WallpaperState } from '@/types/wallpaper';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioContext } from '@/context/useAudioContext';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import {
	DEFAULT_BACKGROUND_PALETTE,
	getBackgroundPalette
} from '@/lib/backgroundPalette';
import { resolveIntroPaletteUrl, resolveIntroPool } from './introPool';
import {
	syncOutputCanvasBacking,
	subscribeOutputRenderQuality
} from '@/runtime/outputRenderQuality';
import { paintIntro } from './introPaint';
import { resolveIntroTextStyle } from './introTextStyle';
import {
	resolveIntroColors,
	resolveIntroFocusMap,
	resolveIntroLogoUrl,
	resolveIntroThemePalette,
	selectIntroSequence
} from './introColors';
import {
	INTRO_LAYER_Z_INDEX,
	pickIntroImages,
	resolveIntroFrame,
	resolveIntroPreviewWindow,
	resolveIntroWindow
} from './introPlan';
import {
	getIntroPreview,
	introPreviewElapsedSec,
	stopIntroPreview
} from './introPreviewStore';
import { createIntroSpectrumPainter } from './introSpectrumDraw';

export default function IntroLayer({
	zIndex = INTRO_LAYER_Z_INDEX
}: {
	zIndex?: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rafRef = useRef<number>(0);
	const paintedRef = useRef(false);
	const imagesRef = useRef(new Map<string, HTMLImageElement>());
	const { getCurrentTime, getDuration } = useAudioContext();
	/** Wall-clock of the previous frame, for the renderer's own smoothing. */
	const lastFrameMsRef = useRef(0);
	const livePalette = useBackgroundPalette();
	/**
	 * `current image` inside a window means the FIRST image of the setlist, not
	 * whatever is active: the intro plays before anything has been on screen.
	 * The live palette is the fallback for a collection with no setlist image.
	 */
	const paletteUrl = useWallpaperStore(resolveIntroPaletteUrl);
	const [introPalette, setIntroPalette] = useState(
		DEFAULT_BACKGROUND_PALETTE
	);
	useEffect(() => {
		if (!paletteUrl) return;
		let cancelled = false;
		void getBackgroundPalette(paletteUrl).then(next => {
			if (!cancelled) setIntroPalette(next);
		});
		return () => {
			cancelled = true;
		};
	}, [paletteUrl]);
	const palette =
		paletteUrl && introPalette.sourceUrl === paletteUrl
			? introPalette
			: livePalette;
	const paletteRef = useRef(palette);
	paletteRef.current = palette;

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

		/** Decoded lazily: a montage must not block a frame to start. */
		function imageFor(url: string): HTMLImageElement | null {
			const cached = imagesRef.current.get(url);
			if (cached) return cached.complete ? cached : null;
			const image = new Image();
			image.decoding = 'async';
			image.src = url;
			imagesRef.current.set(url, image);
			return null;
		}

		/**
		 * WHICH images this window draws, and where each one must be cropped.
		 *
		 * Pure in the four things it reads, none of which can change during a
		 * window, so it is resolved once per cast instead of once per frame.
		 * It used to run inside the loop: rebuilding the pool, re-picking the
		 * ids and doing a linear `pool.find` per card, sixty times a second,
		 * through the most expensive seconds of the video. Only the decoded
		 * `HTMLImageElement`s are looked up per frame — they arrive one by one
		 * while the montage is already playing.
		 */
		let cast: {
			key: readonly unknown[];
			/** Card index → source URL. */
			urls: Map<number, string>;
			focus: ReturnType<typeof resolveIntroFocusMap>;
			cardCount: number;
		} | null = null;

		function resolveCast(
			state: WallpaperState,
			settings: IntroSequenceSettings
		) {
			const key = [
				state.backgroundImages,
				state.setlists,
				state.activeSetlistId,
				settings
			] as const;
			if (
				cast &&
				cast.key.length === key.length &&
				cast.key.every((value, i) => value === key[i])
			) {
				return cast;
			}
			const pool = resolveIntroPool(state, settings);
			const ids = pickIntroImages(pool, settings);
			const byId = new Map(pool.map(item => [item.assetId, item]));
			const urls = new Map<number, string>();
			ids.forEach((assetId, index) => {
				const url = byId.get(assetId)?.url;
				if (url) urls.set(index, url);
			});
			const next = {
				key,
				urls,
				focus: resolveIntroFocusMap(pool, ids),
				cardCount: ids.length
			};
			cast = next;
			return next;
		}

		function frame() {
			const c = canvasRef.current;
			if (!c || !ctx) {
				rafRef.current = requestAnimationFrame(frame);
				return;
			}
			const state = useWallpaperStore.getState();
			const nowMs = performance.now();
			/**
			 * A preview wins over the track's clock while it runs: that is the
			 * whole point of it. Nothing else in the app looks at this, and the
			 * offline exporter deliberately never imports it, so the file always
			 * comes out ruled by the track.
			 */
			const preview = getIntroPreview();
			const window_ = preview
				? resolveIntroPreviewWindow(
						state,
						preview.kind,
						introPreviewElapsedSec(preview, nowMs),
						getDuration(),
						preview.pausedAtSec !== null
					)
				: resolveIntroWindow(
						state,
						Math.max(0, getCurrentTime()),
						getDuration()
					);
			if (!window_) {
				// A preview that ran out closes itself, so the button goes back
				// to "play" without the user stopping what already ended.
				if (preview) stopIntroPreview();
				if (paintedRef.current) {
					ctx.clearRect(0, 0, c.width, c.height);
					paintedRef.current = false;
				}
				rafRef.current = requestAnimationFrame(frame);
				return;
			}

			const settings = selectIntroSequence(state, window_.kind);
			const { urls, focus, cardCount } = resolveCast(state, settings);
			const images = new Map<number, HTMLImageElement>();
			for (const [index, url] of urls) {
				const image = imageFor(url);
				if (image) images.set(index, image);
			}
			const elapsedDt = lastFrameMsRef.current
				? Math.min(0.1, (nowMs - lastFrameMsRef.current) / 1000)
				: 1 / 60;
			lastFrameMsRef.current = nowMs;
			// A frozen preview freezes the WHOLE frame: the window's own
			// spectrum smooths on `dt`, so leaving it running would animate the
			// one thing the user paused to look at.
			const dt = preview && preview.pausedAtSec !== null ? 0 : elapsedDt;
			const logoUrl = resolveIntroLogoUrl(settings, state);
			const logo = logoUrl ? imageFor(logoUrl) : null;
			const viewport = { width: c.width, height: c.height };

			ctx.clearRect(0, 0, c.width, c.height);
			paintedRef.current = true;
			paintIntro({
				ctx,
				viewport,
				frame: resolveIntroFrame({
					kind: window_.kind,
					settings,
					progress: window_.progress,
					viewport,
					cardCount: Math.max(1, cardCount),
					durationSec: window_.durationSec
				}),
				images,
				focus,
				logo,
				colors: resolveIntroColors(
					settings,
					paletteRef.current,
					resolveIntroThemePalette(state)
				),
				paintSpectrum:
					createIntroSpectrumPainter({
						kind: window_.kind,
						state,
						palette: paletteRef.current,
						themePalette: resolveIntroThemePalette(state),
						windowTimeSec: window_.elapsedSec,
						dt
					}) ?? undefined,
				titleStyle: resolveIntroTextStyle(
					settings.titleTextStyleSource,
					settings.titleFontStyle,
					state,
					paletteRef.current,
					resolveIntroThemePalette(state)
				),
				taglineStyle: resolveIntroTextStyle(
					settings.taglineTextStyleSource,
					settings.taglineFontStyle,
					state,
					paletteRef.current,
					resolveIntroThemePalette(state)
				),
				titleFrameShape: settings.titleFrameShape,
				titleFrameStyle: settings.titleFrameStyle,
				titleFrameThickness: settings.titleFrameThickness
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
