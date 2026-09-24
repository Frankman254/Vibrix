import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioData } from '@/hooks/useAudioData';
import { setLruEntry, getLruEntry } from '@/lib/lruCache';
import {
	drawGlobalBackgroundFrame,
	hasAnimatedGlobalBackgroundFilter
} from '@/features/background/render';
import {
	resolveOutputCanvasBacking,
	syncOutputCanvasBacking,
	subscribeOutputRenderQuality
} from '@/runtime/outputRenderQuality';

const GLOBAL_BACKGROUND_CACHE_LIMIT = 6;
const imageCache = new Map<string, HTMLImageElement>();

function getCachedImage(
	url: string,
	onReady: (image: HTMLImageElement) => void
): HTMLImageElement {
	const cached = getLruEntry(imageCache, url);
	if (cached) {
		if (cached.complete && cached.naturalWidth > 0) onReady(cached);
		else cached.onload = () => onReady(cached);
		return cached;
	}

	const image = new Image();
	image.decoding = 'async';
	image.onload = () => onReady(image);
	image.src = url;
	setLruEntry(imageCache, url, image, GLOBAL_BACKGROUND_CACHE_LIMIT);
	return image;
}

export default function GlobalBackgroundView() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rafRef = useRef<number>(0);
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const { getAudioSnapshot } = useAudioData();
	const store = useWallpaperStore(
		useShallow(state => ({
			globalBackgroundEnabled: state.globalBackgroundEnabled,
			globalBackgroundUrl: state.globalBackgroundUrl,
			globalBackgroundFitMode: state.globalBackgroundFitMode,
			globalBackgroundScale: state.globalBackgroundScale,
			globalBackgroundPositionX: state.globalBackgroundPositionX,
			globalBackgroundPositionY: state.globalBackgroundPositionY,
			globalBackgroundOpacity: state.globalBackgroundOpacity,
			globalBackgroundBrightness: state.globalBackgroundBrightness,
			globalBackgroundContrast: state.globalBackgroundContrast,
			globalBackgroundSaturation: state.globalBackgroundSaturation,
			globalBackgroundBlur: state.globalBackgroundBlur,
			globalBackgroundHueRotate: state.globalBackgroundHueRotate,
			layoutResponsiveEnabled: state.layoutResponsiveEnabled,
			layoutBackgroundReframeEnabled:
				state.layoutBackgroundReframeEnabled,
			layoutReferenceWidth: state.layoutReferenceWidth,
			layoutReferenceHeight: state.layoutReferenceHeight,
			effectLayers: state.effectLayers,
			activeEffectLayerId: state.activeEffectLayerId,
			filterTargets: state.filterTargets,
			filterBrightness: state.filterBrightness,
			filterContrast: state.filterContrast,
			filterSaturation: state.filterSaturation,
			filterBlur: state.filterBlur,
			filterHueRotate: state.filterHueRotate,
			filterOpacity: state.filterOpacity,
			filterVignette: state.filterVignette,
			filterBloom: state.filterBloom,
			filterLumaThreshold: state.filterLumaThreshold,
			filterLensWarp: state.filterLensWarp,
			filterHeatDistortion: state.filterHeatDistortion,
			rgbShiftAudioReactive: state.rgbShiftAudioReactive,
			rgbShiftAudioSensitivity: state.rgbShiftAudioSensitivity,
			rgbShiftAudioChannel: state.rgbShiftAudioChannel,
			rgbShiftAudioSmoothing: state.rgbShiftAudioSmoothing,
			rgbShiftAudioAttack: state.rgbShiftAudioAttack,
			rgbShiftAudioRelease: state.rgbShiftAudioRelease,
			rgbShiftAudioReactivitySpeed: state.rgbShiftAudioReactivitySpeed,
			rgbShiftAudioPeakWindow: state.rgbShiftAudioPeakWindow,
			rgbShiftAudioPeakFloor: state.rgbShiftAudioPeakFloor,
			rgbShiftAudioPunch: state.rgbShiftAudioPunch,
			rgbShift: state.rgbShift,
			noiseIntensity: state.noiseIntensity,
			scanlineMode: state.scanlineMode,
			scanlinesEnabled: state.scanlinesEnabled,
			scanlineIntensity: state.scanlineIntensity,
			scanlineSpacing: state.scanlineSpacing,
			scanlineThickness: state.scanlineThickness,
			motionPaused: state.motionPaused,
			sleepModeActive: state.sleepModeActive
		}))
	);

	useEffect(() => {
		if (!store.globalBackgroundEnabled || !store.globalBackgroundUrl) {
			setImage(null);
			return;
		}

		const nextImage = getCachedImage(store.globalBackgroundUrl, setImage);
		if (nextImage.complete && nextImage.naturalWidth > 0) {
			setImage(nextImage);
		}
	}, [store.globalBackgroundEnabled, store.globalBackgroundUrl]);

	const hasAnimatedFilter = hasAnimatedGlobalBackgroundFilter(store);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (
			!canvas ||
			!image ||
			!store.globalBackgroundUrl ||
			!store.globalBackgroundEnabled
		) {
			return;
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const resize = () => {
			syncOutputCanvasBacking(canvas);
		};
		// `canvas.width=` clears the bitmap, so a viewport resize without an
		// active animation loop leaves the background blank. We always redraw
		// after a resize/fullscreen toggle to avoid that.
		const redraw = () => {
			resize();
			draw(performance.now());
		};

		const draw = (time: number) => {
			if (!canvasRef.current) return;
			const currentCanvas = canvasRef.current;
			const { backingWidth, backingHeight } =
				resolveOutputCanvasBacking();
			if (
				currentCanvas.width !== backingWidth ||
				currentCanvas.height !== backingHeight
			) {
				resize();
			}

			const audio = hasAnimatedFilter ? getAudioSnapshot() : null;
			drawGlobalBackgroundFrame(
				ctx,
				image,
				store,
				time,
				audio?.amplitude ?? 0
			);
		};

		const shouldAnimate =
			!store.motionPaused && !store.sleepModeActive && hasAnimatedFilter;

		function frame(time: number) {
			draw(time);
			if (shouldAnimate) {
				rafRef.current = requestAnimationFrame(frame);
			}
		}

		resize();
		draw(performance.now());
		if (shouldAnimate) {
			rafRef.current = requestAnimationFrame(frame);
		}

		window.addEventListener('resize', redraw);
		const unsubQuality = subscribeOutputRenderQuality(redraw);
		// Some browsers don't always fire `resize` synchronously when entering
		// or leaving fullscreen — wire `fullscreenchange` as a belt-and-braces
		// trigger so the bitmap never stays blank after a toggle.
		document.addEventListener('fullscreenchange', redraw);
		return () => {
			cancelAnimationFrame(rafRef.current);
			window.removeEventListener('resize', redraw);
			document.removeEventListener('fullscreenchange', redraw);
			unsubQuality();
		};
	}, [getAudioSnapshot, hasAnimatedFilter, image, store]);

	if (!store.globalBackgroundEnabled || !store.globalBackgroundUrl || !image)
		return null;

	return (
		<div
			data-camera-motion-layer="global-background"
			style={{
				position: 'fixed',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				zIndex: -10
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
