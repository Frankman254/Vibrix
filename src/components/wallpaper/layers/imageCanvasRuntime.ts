import type { MutableRefObject } from 'react';
import type {
	AudioSnapshot,
	AudioChannelSelectionState
} from '@/lib/audio/audioChannels';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import type { AudioEnvelope } from '@/utils/audioEnvelope';
import { renderBackgroundFrame } from './imageCanvasBackgroundRenderer';
import { drawAutoZoomDebugOverlay } from './imageCanvasAutoZoomDebug';
import { renderOverlayImageLayer } from './imageCanvasOverlayRenderer';
import {
	getLayerRect,
	targetMatches,
	type ImageLayer
} from '@/features/background/imageLayerGeometry';
import type { BackgroundTransitionRuntimeRefs } from './imageCanvasBackgroundTransitionState';
import { syncBackgroundImageRequestDuringFrame } from './imageCanvasBackgroundTransitionState';
import {
	hasBackgroundReactiveSource,
	resolveActiveImageLayer,
	resolveBackgroundAudioMetrics,
	resolveEffectiveLayerOpacity,
	resolveLayerFilterMetrics,
	resolveParallaxOffset,
	smoothMouseMotion
} from './imageCanvasFrameState';
import { resolveImageCanvasAudioState } from './imageCanvasAudioState';
import { publishImageCanvasBackgroundDebugState } from './imageCanvasDebugState';
import { resolveImagePostProcessQuality } from '@/lib/visual/performanceQuality';
import { drawBgFlashEdge } from '@/features/flashEdge/flashEdgeRenderer';
import {
	getFlashEdgeDrive,
	getFlashEdgeColor
} from '@/features/stageFx/flashEdgeDrive';
import { syncOutputCanvasBacking } from '@/runtime/outputRenderQuality';
import { isVisualTransitionActive } from '@/features/visualTransition/visualTransitionCoordinator';

type MousePositionRef = MutableRefObject<{ x: number; y: number }>;

export type ImageCanvasRuntimeRefs = BackgroundTransitionRuntimeRefs & {
	layerRef: MutableRefObject<ImageLayer>;
	mouseRef: MousePositionRef;
	smoothedMouseRef: MousePositionRef;
	lastFrameTimeRef: MutableRefObject<number>;
	backgroundEnvelopeRef: MutableRefObject<AudioEnvelope>;
	rgbShiftEnvelopeRef: MutableRefObject<AudioEnvelope>;
	imageChannelSelectionRef: MutableRefObject<AudioChannelSelectionState>;
	transitionChannelSelectionRef: MutableRefObject<AudioChannelSelectionState>;
	rgbShiftChannelSelectionRef: MutableRefObject<AudioChannelSelectionState>;
};

export function syncCanvasViewport(canvas: HTMLCanvasElement): void {
	syncOutputCanvasBacking(canvas);
}

export function renderImageCanvasFrame(params: {
	now: number;
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	loadedImage: HTMLImageElement | null;
	renderBaseImage: boolean;
	getAudioSnapshot: () => AudioSnapshot;
	runtimeRefs: ImageCanvasRuntimeRefs;
	state: WallpaperStore;
}): boolean {
	const {
		now,
		canvas,
		ctx,
		loadedImage,
		renderBaseImage,
		getAudioSnapshot,
		runtimeRefs,
		state
	} = params;
	const {
		layerRef,
		mouseRef,
		smoothedMouseRef,
		imageRef,
		loadedImageUrlRef,
		previousBackgroundImageRef,
		previousBackgroundParamsRef,
		renderedBackgroundParamsRef,
		previousBackgroundTransitionRef,
		renderedBackgroundTransitionRef,
		currentRequestedBackgroundUrlRef,
		transitionStartRef,
		lastFrameTimeRef,
		effectiveTimeRef,
		backgroundEnvelopeRef,
		rgbShiftEnvelopeRef,
		imageChannelSelectionRef,
		transitionChannelSelectionRef,
		rgbShiftChannelSelectionRef
	} = runtimeRefs;

	const currentLayer = layerRef.current;
	const deltaMs =
		lastFrameTimeRef.current === 0 ? 0 : now - lastFrameTimeRef.current;
	const dt = Math.min(deltaMs / 1000, 0.1);
	lastFrameTimeRef.current = now;

	const imagePostQuality = resolveImagePostProcessQuality(
		state.performanceMode
	);
	if (state.motionPaused || state.sleepModeActive) {
		return false;
	}

	effectiveTimeRef.current += deltaMs;
	const time = effectiveTimeRef.current;
	const activeLayer = resolveActiveImageLayer(currentLayer, state);
	syncBackgroundImageRequestDuringFrame(activeLayer, {
		imageRef,
		loadedImageUrlRef,
		previousBackgroundImageRef,
		previousBackgroundParamsRef,
		renderedBackgroundParamsRef,
		previousBackgroundTransitionRef,
		renderedBackgroundTransitionRef,
		currentRequestedBackgroundUrlRef,
		transitionStartRef,
		effectiveTimeRef
	});
	const filterActive = targetMatches(
		activeLayer,
		state.filterTargets,
		state.selectedOverlayId
	);
	const audio = getAudioSnapshot();
	const amplitude = audio.amplitude;
	const {
		imageChannelResolved,
		imageChannelValue,
		transitionChannelValue,
		rgbShiftChannelValue
	} = resolveImageCanvasAudioState(
		audio,
		state,
		{
			imageChannelSelection: imageChannelSelectionRef.current,
			transitionChannelSelection: transitionChannelSelectionRef.current,
			rgbShiftChannelSelection: rgbShiftChannelSelectionRef.current,
			rgbShiftEnvelope: rgbShiftEnvelopeRef.current
		},
		dt
	);

	smoothedMouseRef.current = smoothMouseMotion(
		smoothedMouseRef.current,
		mouseRef.current
	);
	const { parallaxX, parallaxY } = resolveParallaxOffset(
		activeLayer,
		state,
		smoothedMouseRef.current,
		canvas.width,
		canvas.height
	);

	const isTransitioning =
		transitionStartRef.current !== null &&
		previousBackgroundImageRef.current !== null &&
		effectiveTimeRef.current - transitionStartRef.current <
			Math.max(100, state.slideshowTransitionDuration * 1000);
	const visualTransitionActive = isVisualTransitionActive(
		state.visualTransition,
		Date.now()
	);
	const {
		bassBoost,
		envelopeNormalized: bgEnvelopeNormalized,
		envelopeSmoothed: bgEnvelopeSmoothed,
		adaptivePeak: bgAdaptivePeak,
		adaptiveFloor: bgAdaptiveFloor,
		reactivePulseNormalized: bgReactivePulseNormalized
	} = activeLayer.type === 'background-image'
		? resolveBackgroundAudioMetrics(
				activeLayer,
				state,
				imageChannelValue,
				imageChannelResolved.instantLevel,
				dt,
				backgroundEnvelopeRef.current
			)
		: {
				bassBoost: 0,
				envelopeNormalized: 0,
				envelopeSmoothed: 0,
				adaptivePeak: 0,
				adaptiveFloor: 0,
				reactivePulseNormalized: 0
			};
	const effectiveBackgroundOpacity = resolveEffectiveLayerOpacity(
		activeLayer,
		state,
		filterActive,
		isTransitioning,
		bgReactivePulseNormalized,
		bgEnvelopeNormalized
	);

	publishImageCanvasBackgroundDebugState(
		activeLayer.type === 'background-image' ? activeLayer : null,
		state,
		{
			bassBoost,
			envelopeNormalized: bgEnvelopeNormalized,
			envelopeSmoothed: bgEnvelopeSmoothed,
			adaptivePeak: bgAdaptivePeak,
			adaptiveFloor: bgAdaptiveFloor,
			imageChannelValue,
			imageChannelResolved
		}
	);

	const rect = loadedImage
		? getLayerRect(
				activeLayer,
				canvas.width,
				canvas.height,
				loadedImage,
				bassBoost,
				parallaxX,
				-parallaxY,
				{
					layoutResponsiveEnabled: state.layoutResponsiveEnabled,
					layoutBackgroundReframeEnabled:
						state.layoutBackgroundReframeEnabled,
					layoutReferenceWidth: state.layoutReferenceWidth,
					layoutReferenceHeight: state.layoutReferenceHeight
				}
			)
		: null;

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const {
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
	} = resolveLayerFilterMetrics({
		state,
		filterActive,
		isTransitioning,
		time,
		amplitude,
		backgroundReactivePulse: bgReactivePulseNormalized,
		backgroundEnvelopeNormalized: bgEnvelopeNormalized,
		rgbShiftChannelValue,
		canvasWidth: canvas.width,
		canvasHeight: canvas.height
	});
	const hasAnimatedFilters =
		filterActive &&
		(rgbShiftPixels > 0.25 ||
			scanlineAmount > 0.001 ||
			filmNoiseAmount > 0.001 ||
			heatDistortionAmount > 0.001);
	const hasParallaxMotion =
		activeLayer.type === 'background-image' &&
		Math.abs(state.parallaxStrength) > 0.0001 &&
		(Math.abs(smoothedMouseRef.current.x - mouseRef.current.x) > 0.001 ||
			Math.abs(smoothedMouseRef.current.y - mouseRef.current.y) > 0.001);
	const shouldKeepAnimating =
		isTransitioning ||
		visualTransitionActive ||
		hasAnimatedFilters ||
		hasParallaxMotion ||
		(activeLayer.type === 'background-image' &&
			hasBackgroundReactiveSource(state));

	if (activeLayer.type === 'background-image') {
		renderBackgroundFrame({
			ctx,
			layer: activeLayer,
			canvasWidth: canvas.width,
			canvasHeight: canvas.height,
			loadedImage:
				loadedImage &&
				loadedImageUrlRef.current === activeLayer.imageUrl
					? loadedImage
					: null,
			time,
			transitionLevel: transitionChannelValue,
			bassBoost,
			amplitude,
			parallaxX,
			parallaxY,
			brightness,
			contrast,
			saturation,
			blur,
			hue,
			colorFilter,
			filterActive,
			layerOpacity: effectiveBackgroundOpacity,
			rgbShiftPixels,
			scanlineMode: state.scanlineMode,
			scanlineIntensity: state.scanlinesEnabled
				? state.scanlineIntensity
				: 0,
			scanlineSpacing: state.scanlineSpacing,
			scanlineThickness: state.scanlineThickness,
			filmNoiseAmount,
			vignetteAmount,
			bloomAmount,
			lumaThreshold,
			lensWarpAmount,
			heatDistortionAmount,
			imagePostQuality,
			layoutResponsiveEnabled: state.layoutResponsiveEnabled,
			layoutBackgroundReframeEnabled:
				state.layoutBackgroundReframeEnabled,
			layoutReferenceWidth: state.layoutReferenceWidth,
			layoutReferenceHeight: state.layoutReferenceHeight,
			previousBackgroundImageRef,
			previousBackgroundParamsRef,
			previousBackgroundTransitionRef,
			renderedBackgroundParamsRef,
			renderedBackgroundTransitionRef,
			transitionStartRef
		});

		// Reactive Neon Edge — usa driver compartido del Flash Light.
		if (state.bgFlashEdgeEnabled && rect) {
			drawBgFlashEdge(
				ctx,
				rect,
				{
					enabled: state.bgFlashEdgeEnabled,
					intensityMult: state.bgFlashEdgeIntensityMult,
					thickness: state.bgFlashEdgeThickness,
					radius: state.bgFlashEdgeRadius,
					colorMode: state.bgFlashEdgeColorMode,
					color: state.bgFlashEdgeColor
				},
				getFlashEdgeDrive(),
				getFlashEdgeColor()
			);
		}

		// Debug: AutoZoom (Keep-Covered) coverage frames over the live canvas.
		if (
			state.showAutoZoomDebug &&
			loadedImage &&
			loadedImageUrlRef.current === activeLayer.imageUrl
		) {
			drawAutoZoomDebugOverlay({
				ctx,
				viewportWidth: canvas.width,
				viewportHeight: canvas.height,
				imageWidth: loadedImage.naturalWidth || canvas.width,
				imageHeight: loadedImage.naturalHeight || canvas.height,
				snapshot: {
					scale: activeLayer.scale,
					positionX: activeLayer.positionX,
					positionY: activeLayer.positionY,
					fitMode: activeLayer.fitMode,
					focusX: activeLayer.focusX,
					focusY: activeLayer.focusY,
					mirror: activeLayer.mirror,
					mirrorFill: activeLayer.mirrorFill,
					mirrorFillInvert: activeLayer.mirrorFillInvert,
					mirrorFillCount: activeLayer.mirrorFillCount,
					rotation: activeLayer.rotation
				},
				reactiveScaleBoost: bassBoost,
				parallaxX,
				parallaxY: -parallaxY,
				layout: {
					layoutResponsiveEnabled: state.layoutResponsiveEnabled,
					layoutBackgroundReframeEnabled:
						state.layoutBackgroundReframeEnabled,
					layoutReferenceWidth: state.layoutReferenceWidth,
					layoutReferenceHeight: state.layoutReferenceHeight
				}
			});
		}

		return shouldKeepAnimating;
	}

	if (!loadedImage || !rect) {
		return hasAnimatedFilters;
	}

	renderOverlayImageLayer({
		ctx,
		layer: activeLayer,
		image: loadedImage,
		rect,
		renderBaseImage,
		filterActive,
		filterOpacity: filterActive ? state.filterOpacity : 1,
		brightness,
		contrast,
		saturation,
		blur,
		hue,
		rgbShiftPixels,
		filmNoiseAmount,
		scanlineAmount,
		scanlineSpacing: state.scanlineSpacing,
		scanlineThickness: state.scanlineThickness,
		time,
		imagePostQuality
	});
	return hasAnimatedFilters;
}
