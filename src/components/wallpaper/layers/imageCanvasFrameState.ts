import type { AudioEnvelope } from '@/utils/audioEnvelope';
import { clamp, lerp } from '@/lib/math';
import { getScanlineAmount } from '@/lib/canvas/imageEffects';
import type { BackgroundImageLayer } from '@/types/layers';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import type { ImageLayer } from '@/features/background/imageLayerGeometry';

export type ParallaxOffset = {
	parallaxX: number;
	parallaxY: number;
};

export type BackgroundAudioMetrics = {
	bassBoost: number;
	envelopeNormalized: number;
	envelopeSmoothed: number;
	adaptivePeak: number;
	adaptiveFloor: number;
	reactivePulseNormalized: number;
};

export function hasBackgroundReactiveSource(state: WallpaperStore): boolean {
	return (
		state.imageBassReactive ||
		state.imageOpacityReactive ||
		state.imageBlurReactive
	);
}

export type LayerFilterMetrics = {
	brightness: number;
	contrast: number;
	saturation: number;
	blur: number;
	hue: number;
	colorFilter: string;
	rgbShiftPixels: number;
	scanlineAmount: number;
	filmNoiseAmount: number;
	vignetteAmount: number;
	bloomAmount: number;
	lumaThreshold: number;
	lensWarpAmount: number;
	heatDistortionAmount: number;
};

export function resolveActiveImageLayer(
	currentLayer: ImageLayer,
	state: WallpaperStore
): ImageLayer {
	if (currentLayer.type !== 'background-image') return currentLayer;

	return {
		...currentLayer,
		enabled: state.backgroundImageEnabled,
		imageUrl: state.imageUrl,
		scale: state.imageScale,
		positionX: state.imagePositionX,
		positionY: state.imagePositionY,
		opacity: state.imageOpacity,
		fitMode: state.imageFitMode,
		focusX: state.imageFocusX,
		focusY: state.imageFocusY,
		mirror: state.imageMirror,
		mirrorFill: state.imageMirrorFill,
		mirrorFillInvert: state.imageMirrorFillInvert,
		mirrorFillCount: state.imageMirrorFillCount,
		rotation: state.imageRotation,
		transitionType: state.slideshowTransitionType,
		transitionDuration: state.slideshowTransitionDuration,
		transitionIntensity: state.slideshowTransitionIntensity,
		transitionAudioDrive: state.slideshowTransitionAudioDrive,
		audioReactiveConfig: {
			...currentLayer.audioReactiveConfig,
			enabled: state.imageBassReactive,
			sensitivity: state.imageBassScaleIntensity,
			channel: state.imageAudioChannel
		}
	};
}

export function smoothMouseMotion(
	current: { x: number; y: number },
	target: { x: number; y: number },
	factor = 0.05
): { x: number; y: number } {
	return {
		x: lerp(current.x, target.x, factor),
		y: lerp(current.y, target.y, factor)
	};
}

export function resolveParallaxOffset(
	layer: ImageLayer,
	state: WallpaperStore,
	smoothedMouse: { x: number; y: number },
	canvasWidth: number,
	canvasHeight: number
): ParallaxOffset {
	if (layer.type !== 'background-image') {
		return { parallaxX: 0, parallaxY: 0 };
	}

	return {
		parallaxX:
			smoothedMouse.x * state.parallaxStrength * canvasWidth * 0.08,
		parallaxY:
			smoothedMouse.y * state.parallaxStrength * canvasHeight * 0.08
	};
}

export function resolveBackgroundAudioMetrics(
	layer: BackgroundImageLayer,
	state: WallpaperStore,
	imageChannelValue: number,
	instantImageChannelValue: number,
	dt: number,
	envelope: AudioEnvelope
): BackgroundAudioMetrics {
	if (!hasBackgroundReactiveSource(state)) {
		return {
			bassBoost: 0,
			envelopeNormalized: 0,
			envelopeSmoothed: 0,
			adaptivePeak: 0,
			adaptiveFloor: 0,
			reactivePulseNormalized: 0
		};
	}

	const env = envelope.tick(imageChannelValue, Math.max(dt, 1 / 120), {
		attack: state.imageBassAttack,
		release: state.imageBassRelease,
		responseSpeed: state.imageBassReactivitySpeed * 2.4,
		peakWindow: state.imageBassPeakWindow,
		peakFloor: state.imageBassPeakFloor,
		punch: state.imageBassPunch,
		scaleIntensity: state.imageBassReactiveScaleIntensity,
		min: 0,
		max: layer.audioReactiveConfig?.sensitivity ?? 0
	});

	const reactivePulseNormalized = resolveReactivePulseNormalized(
		instantImageChannelValue,
		env.smoothedAmplitude,
		env.adaptivePeak,
		env.adaptiveFloor
	);

	return {
		bassBoost: state.imageBassReactive ? env.value : 0,
		envelopeNormalized: env.normalizedAmplitude,
		envelopeSmoothed: env.smoothedAmplitude,
		adaptivePeak: env.adaptivePeak,
		adaptiveFloor: env.adaptiveFloor,
		reactivePulseNormalized
	};
}

function resolveReactivePulseNormalized(
	instantLevel: number,
	smoothedAmplitude: number,
	adaptivePeak: number,
	adaptiveFloor: number
): number {
	const usableRange = Math.max(0.08, adaptivePeak - adaptiveFloor);
	const instantNormalized = clamp(
		(instantLevel - adaptiveFloor) / usableRange,
		0,
		1
	);
	const peakFocused = Math.pow(
		clamp((instantNormalized - 0.72) / 0.28, 0, 1),
		1.85
	);
	const transientFocused = clamp(
		(instantLevel - smoothedAmplitude * 0.88) /
			Math.max(usableRange * 0.38, 0.06),
		0,
		1
	);

	return clamp(Math.max(peakFocused, transientFocused * 0.92), 0, 1);
}

function resolveReactiveDriver(
	normalizedPulse: number,
	envelopeNormalized: number,
	threshold: number,
	softness: number,
	invert: boolean
): number {
	const safeThreshold = clamp(threshold, 0, 0.95);
	const gatedPulse = clamp(
		(normalizedPulse - safeThreshold) / Math.max(0.02, 1 - safeThreshold),
		0,
		1
	);
	const driver = clamp(
		gatedPulse * (1 - clamp(softness, 0, 1)) +
			envelopeNormalized * clamp(softness, 0, 1),
		0,
		1
	);
	return invert ? 1 - driver : driver;
}

export function resolveEffectiveLayerOpacity(
	layer: ImageLayer,
	state: WallpaperStore,
	filterActive: boolean,
	isTransitioning: boolean,
	backgroundReactivePulse: number,
	backgroundEnvelopeNormalized: number
): number {
	if (layer.type !== 'background-image') {
		return layer.opacity;
	}

	const backgroundOpacityFactor = state.imageOpacityReactive
		? clamp(
				1 -
					state.imageOpacityReactiveAmount +
					resolveReactiveDriver(
						backgroundReactivePulse,
						backgroundEnvelopeNormalized,
						state.imageOpacityReactiveThreshold,
						state.imageOpacityReactiveSoftness,
						state.imageOpacityReactiveInvert
					) *
						state.imageOpacityReactiveAmount,
				0.05,
				1
			)
		: 1;

	return (
		layer.opacity *
		(isTransitioning ? 1 : backgroundOpacityFactor) *
		(filterActive ? state.filterOpacity : 1)
	);
}

export function resolveLayerFilterMetrics(params: {
	state: WallpaperStore;
	filterActive: boolean;
	isTransitioning: boolean;
	time: number;
	amplitude: number;
	backgroundReactivePulse: number;
	backgroundEnvelopeNormalized: number;
	rgbShiftChannelValue: number;
	canvasWidth: number;
	canvasHeight: number;
}): LayerFilterMetrics {
	const {
		state,
		filterActive,
		isTransitioning,
		time,
		amplitude,
		backgroundReactivePulse,
		backgroundEnvelopeNormalized,
		rgbShiftChannelValue,
		canvasWidth,
		canvasHeight
	} = params;

	const brightness = filterActive ? state.filterBrightness : 1;
	const contrast = filterActive ? state.filterContrast : 1;
	const saturation = filterActive ? state.filterSaturation : 1;
	const audioBlurBoost =
		!isTransitioning && state.imageBlurReactive
			? resolveReactiveDriver(
					backgroundReactivePulse,
					backgroundEnvelopeNormalized,
					state.imageBlurReactiveThreshold,
					state.imageBlurReactiveSoftness,
					state.imageBlurReactiveInvert
				) * state.imageBlurReactiveAmount
			: 0;
	const blur = clamp(
		(filterActive ? state.filterBlur : 0) + audioBlurBoost,
		0,
		32
	);
	const hue = filterActive ? state.filterHueRotate : 0;
	const colorFilter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg)`;
	const rgbShiftBoost = state.rgbShiftAudioReactive
		? rgbShiftChannelValue * state.rgbShiftAudioSensitivity
		: 0;
	const rgbShiftPixels =
		filterActive && !isTransitioning
			? clamp(
					(state.rgbShift + rgbShiftBoost) *
						Math.min(canvasWidth, canvasHeight) *
						0.65,
					0,
					36
				)
			: 0;
	const scanlineAmount =
		filterActive && !isTransitioning
			? getScanlineAmount(
					state.scanlineMode,
					state.scanlinesEnabled ? state.scanlineIntensity : 0,
					time,
					amplitude
				)
			: 0;
	const filmNoiseAmount =
		filterActive && !isTransitioning ? state.noiseIntensity : 0;
	const vignetteAmount =
		filterActive && !isTransitioning ? state.filterVignette : 0;
	const bloomAmount =
		filterActive && !isTransitioning ? state.filterBloom : 0;
	const lumaThreshold = filterActive ? state.filterLumaThreshold : 0.72;
	const lensWarpAmount =
		filterActive && !isTransitioning ? state.filterLensWarp : 0;
	const heatDistortionAmount =
		filterActive && !isTransitioning ? state.filterHeatDistortion : 0;

	return {
		brightness,
		contrast,
		saturation,
		blur,
		hue,
		colorFilter,
		rgbShiftPixels,
		scanlineAmount,
		filmNoiseAmount,
		vignetteAmount,
		bloomAmount,
		lumaThreshold,
		lensWarpAmount,
		heatDistortionAmount
	};
}
