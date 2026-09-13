/**
 * Overlay images for the offline export — the maths behind
 * `OverlayImageLayerView`, which paints overlays as a CSS-styled `<img>`.
 *
 * Kept free of canvas calls so the CSS → canvas translation (sizes in CSS
 * pixels, `filter`, `mask-image`, `clip-path`) is unit-tested; the drawing
 * lives in `overlays.ts`.
 */
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { OverlayImageLayer } from '@/types/layers';
import type { WallpaperState } from '@/types/wallpaper';

type Size = { width: number; height: number };

type OverlayFilterState = Pick<
	WallpaperState,
	| 'filterTargets'
	| 'selectedOverlayId'
	| 'filterOpacity'
	| 'filterBrightness'
	| 'filterContrast'
	| 'filterSaturation'
	| 'filterBlur'
	| 'filterHueRotate'
	| 'layoutResponsiveEnabled'
>;

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

/**
 * Overlay sizes are CSS pixels on the editor's viewport, while logo and
 * spectrum follow the responsive layout. Scaling overlays by the short-edge
 * ratio keeps them the same size relative to those layers as in the preview.
 */
export function resolveOverlaySizeFactor(
	state: Pick<WallpaperState, 'layoutResponsiveEnabled'>,
	liveViewport: Size,
	output: Size
): number {
	if (!state.layoutResponsiveEnabled) return 1;
	const liveShortEdge = Math.max(
		1,
		Math.min(liveViewport.width, liveViewport.height)
	);
	return Math.min(output.width, output.height) / liveShortEdge;
}

export function resolveOverlayAudioOpacity(
	layer: Pick<
		OverlayImageLayer,
		| 'audioOpacityReactive'
		| 'audioOpacityAmount'
		| 'audioOpacityInvert'
		| 'audioOpacityChannel'
	>,
	audio: Pick<AudioSnapshot, 'amplitude' | 'channels'>
): number {
	if (!layer.audioOpacityReactive) return 1;
	const value =
		layer.audioOpacityChannel === 'auto'
			? audio.amplitude
			: (audio.channels[layer.audioOpacityChannel] ?? audio.amplitude);
	const driver = layer.audioOpacityInvert
		? 1 - clamp01(value)
		: clamp01(value);
	return clamp01(
		1 - layer.audioOpacityAmount + driver * layer.audioOpacityAmount
	);
}

export type OverlayDrawPlan = {
	/** Centre of the overlay on the output canvas. */
	centerX: number;
	centerY: number;
	width: number;
	height: number;
	rotationRad: number;
	opacity: number;
	composite: GlobalCompositeOperation;
	filter: string;
	cropShape: OverlayImageLayer['cropShape'];
	cornerRadius: number;
	/** Where the `mask-image` gradient starts fading, 0..1 of its radius. */
	fadeStart: number;
};

const COMPOSITE: Record<
	OverlayImageLayer['blendMode'],
	GlobalCompositeOperation
> = {
	normal: 'source-over',
	screen: 'screen',
	lighten: 'lighten',
	multiply: 'multiply'
};

export function resolveOverlayDrawPlan(
	layer: OverlayImageLayer,
	state: OverlayFilterState,
	audio: Pick<AudioSnapshot, 'amplitude' | 'channels'>,
	output: Size,
	sizeFactor: number
): OverlayDrawPlan {
	const targeted =
		state.filterTargets.includes('selected-overlay') &&
		state.selectedOverlayId === layer.id;
	const blurPx =
		(Math.max(0, layer.edgeBlur) + (targeted ? state.filterBlur : 0)) *
		sizeFactor;
	const glowPx = (8 + layer.edgeGlow * 26) * sizeFactor;
	const glowAlpha = 0.18 + layer.edgeGlow * 0.2;

	return {
		centerX: output.width / 2 + layer.positionX * output.width,
		centerY: output.height / 2 - layer.positionY * output.height,
		width: layer.width * layer.scale * sizeFactor,
		height: layer.height * layer.scale * sizeFactor,
		rotationRad: (layer.rotation * Math.PI) / 180,
		opacity:
			layer.opacity *
			resolveOverlayAudioOpacity(layer, audio) *
			(targeted ? state.filterOpacity : 1),
		composite: COMPOSITE[layer.blendMode] ?? 'source-over',
		filter: [
			`brightness(${targeted ? state.filterBrightness : 1})`,
			`contrast(${targeted ? state.filterContrast : 1})`,
			`saturate(${targeted ? state.filterSaturation : 1})`,
			`blur(${blurPx}px)`,
			`hue-rotate(${targeted ? state.filterHueRotate : 0}deg)`,
			`drop-shadow(0 0 ${glowPx}px rgba(255,255,255,${glowAlpha}))`
		].join(' '),
		cropShape: layer.cropShape,
		cornerRadius: 18 * sizeFactor,
		fadeStart: Math.max(48, 100 - layer.edgeFade * 120) / 100
	};
}
