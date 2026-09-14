/**
 * Overlay images for the offline export — the maths behind
 * `OverlayImageLayerView`, which paints overlays as a CSS-styled `<img>`.
 *
 * Kept free of canvas calls so the CSS → canvas translation (sizes in CSS
 * pixels, `filter`, `mask-image`, `clip-path`) is unit-tested; the drawing
 * lives in `overlays.ts`.
 */
import { getScanlineAmount } from '@/lib/canvas/imageEffects';
import {
	resolveAudioChannelValue,
	type AudioChannelSelectionState,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';
import type { AudioEnvelope } from '@/utils/audioEnvelope';
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

/**
 * The editor's "advanced" Looks (RGB shift, scanlines, noise) apply to the
 * *selected* overlay only — they are filter state, not a layer. Live,
 * `OverlayImageLayerView` mounts an extra canvas whenever
 * `advancedEffectsActive` holds; the maths lives in `imageCanvasFrameState`.
 * This mirrors both: the gate is the view's, the metrics are the runtime's,
 * rescaled from live-viewport CSS px to output px via `sizeFactor`.
 *
 * The envelope + channel-selection objects are mutable dependencies owned by
 * the caller (the subsystem); the resolver only ticks them, which keeps this
 * function pure enough to test with synthetic audio snapshots.
 */
export type OverlayAdvancedEffects = {
	rgbShiftPixels: number;
	filmNoiseAmount: number;
	scanlineAmount: number;
	scanlineSpacing: number;
	scanlineThickness: number;
	/** Live draws the passes at `clamp(layer.opacity * filterOpacity)`. */
	passAlpha: number;
};

type AdvancedFilterState = Pick<
	WallpaperState,
	| 'rgbShift'
	| 'scanlinesEnabled'
	| 'scanlineIntensity'
	| 'scanlineMode'
	| 'scanlineSpacing'
	| 'scanlineThickness'
	| 'noiseIntensity'
	| 'filterOpacity'
	| 'rgbShiftAudioReactive'
	| 'rgbShiftAudioSensitivity'
	| 'rgbShiftAudioChannel'
	| 'rgbShiftAudioSmoothing'
	| 'rgbShiftAudioAttack'
	| 'rgbShiftAudioRelease'
	| 'rgbShiftAudioReactivitySpeed'
	| 'rgbShiftAudioPeakWindow'
	| 'rgbShiftAudioPeakFloor'
	| 'rgbShiftAudioPunch'
	| 'audioAutoKickThreshold'
	| 'audioAutoSwitchHoldMs'
>;

export function resolveOverlayAdvancedEffects(params: {
	layerOpacity: number;
	targeted: boolean;
	state: AdvancedFilterState;
	audio: AudioSnapshot;
	channelSelection: AudioChannelSelectionState;
	envelope: AudioEnvelope;
	/** Seconds since the previous tick, clamped by the caller's frame dt. */
	dt: number;
	timeMs: number;
	output: Size;
	sizeFactor: number;
}): OverlayAdvancedEffects | null {
	const { state } = params;
	// Same gate as OverlayImageLayerView.advancedEffectsActive. The live path
	// also gates on `!isTransitioning`, but that is the *per-image* crossfade
	// inside ImageLayerCanvas (one image replacing another). Offline exports
	// draw a single frozen image per overlay, so that transition never runs
	// here; scene fades are composited as subsystem alpha in frameComposition.
	// Deliberate: no isTransitioning gate offline.
	if (
		!params.targeted ||
		!(
			state.rgbShift > 0.0001 ||
			(state.scanlinesEnabled && state.scanlineIntensity > 0.001) ||
			state.noiseIntensity > 0.001
		)
	) {
		return null;
	}
	const { value: channelValue } = resolveAudioChannelValue(
		params.audio.channels,
		state.rgbShiftAudioChannel,
		params.channelSelection,
		state.rgbShiftAudioSmoothing,
		state.audioAutoKickThreshold,
		state.audioAutoSwitchHoldMs,
		params.audio.timestampMs
	);
	const envValue = params.envelope.tick(
		channelValue,
		Math.max(params.dt, 1 / 120),
		{
			attack: state.rgbShiftAudioAttack,
			release: state.rgbShiftAudioRelease,
			responseSpeed: state.rgbShiftAudioReactivitySpeed * 2.4,
			peakWindow: state.rgbShiftAudioPeakWindow,
			peakFloor: state.rgbShiftAudioPeakFloor,
			punch: state.rgbShiftAudioPunch,
			scaleIntensity: 1,
			min: 0,
			max: 1
		}
	).value;
	const rgbShiftBoost = state.rgbShiftAudioReactive
		? envValue * state.rgbShiftAudioSensitivity
		: 0;
	// Live clamps at 36 CSS px on the live canvas. The offline `output` is
	// already `sizeFactor` times the live canvas, so the raw shift must come
	// from the live-equivalent short edge: clamp there first, then scale the
	// clamped result up once. (Using the offline short edge *and* the factor
	// scaled every shift twice.)
	const liveShortEdge =
		Math.min(params.output.width, params.output.height) / params.sizeFactor;
	const rgbShiftPixels =
		Math.min(
			36,
			Math.max(0, (state.rgbShift + rgbShiftBoost) * liveShortEdge * 0.65)
		) * params.sizeFactor;
	return {
		rgbShiftPixels,
		filmNoiseAmount: state.noiseIntensity,
		scanlineAmount: getScanlineAmount(
			state.scanlineMode,
			state.scanlinesEnabled ? state.scanlineIntensity : 0,
			params.timeMs,
			params.audio.amplitude
		),
		// Spacing drives the line count (resolution-independent); thickness
		// is a pixel width and scales.
		scanlineSpacing: state.scanlineSpacing,
		scanlineThickness: state.scanlineThickness * params.sizeFactor,
		passAlpha: Math.max(
			0,
			Math.min(1, params.layerOpacity * state.filterOpacity)
		)
	};
}
