import { clamp } from '@/lib/math';
import type { BackgroundImageSnapshot } from '@/features/background/imageLayerGeometry';
import {
	drawBackgroundImageDirect,
	runBackgroundTransitionPass
} from './imageCanvasBackgroundTransitions';
import { runBackgroundPostEffectsPass } from './imageCanvasBackgroundPostEffects';
import type {
	BgDrawContext,
	BgTransitionCtx,
	RenderBackgroundFrameParams
} from './imageCanvasBackgroundRenderTypes';

export function renderBackgroundFrame({
	ctx,
	layer,
	canvasWidth,
	canvasHeight,
	loadedImage,
	time,
	transitionLevel,
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
	layerOpacity,
	rgbShiftPixels,
	scanlineMode,
	scanlineIntensity,
	scanlineSpacing,
	scanlineThickness,
	filmNoiseAmount,
	vignetteAmount,
	bloomAmount,
	lumaThreshold,
	lensWarpAmount,
	heatDistortionAmount,
	imagePostQuality,
	layoutResponsiveEnabled,
	layoutBackgroundReframeEnabled,
	layoutReferenceWidth,
	layoutReferenceHeight,
	previousBackgroundImageRef,
	previousBackgroundParamsRef,
	previousBackgroundTransitionRef,
	renderedBackgroundParamsRef,
	renderedBackgroundTransitionRef,
	transitionStartRef
}: RenderBackgroundFrameParams): void {
	const activeImage = loadedImage ? loadedImage : null;
	const transitionSettings = previousBackgroundTransitionRef.current;
	const transitionDurationMs = Math.max(
		100,
		transitionSettings.transitionDuration * 1000
	);
	const progress =
		activeImage &&
		previousBackgroundImageRef.current &&
		transitionStartRef.current !== null
			? clamp(
					(time - transitionStartRef.current) / transitionDurationMs,
					0,
					1
				)
			: 1;
	const easedProgress = progress * progress * (3 - 2 * progress);
	const transitionForce = clamp(
		transitionSettings.transitionIntensity +
			transitionLevel * transitionSettings.transitionAudioDrive,
		0.2,
		3.5
	);
	const transitionForceNorm = Math.min(1, transitionForce / 2.5);
	const baseFilter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) blur(${blur}px) hue-rotate(${hue}deg)`;
	const activeSnapshot: BackgroundImageSnapshot = {
		scale: layer.scale,
		positionX: layer.positionX,
		positionY: layer.positionY,
		fitMode: layer.fitMode,
		keepCovered: layer.keepCovered,
		focusX: layer.focusX,
		focusY: layer.focusY,
		mirror: layer.mirror,
		mirrorFill: layer.mirrorFill,
		mirrorFillInvert: layer.mirrorFillInvert,
		mirrorFillCount: layer.mirrorFillCount,
		rotation: layer.rotation
	};

	// Build the shared draw contexts once per frame call.
	const dc: BgDrawContext = {
		ctx,
		canvasWidth,
		canvasHeight,
		layerOpacity,
		baseFilter,
		blur,
		parallaxX,
		parallaxY,
		bassBoost,
		layoutResponsiveEnabled,
		layoutBackgroundReframeEnabled,
		layoutReferenceWidth,
		layoutReferenceHeight
	};
	const tc: BgTransitionCtx = {
		...dc,
		transitionForce,
		transitionForceNorm,
		time
	};

	if (!activeImage && previousBackgroundImageRef.current) {
		drawBackgroundImageDirect(
			dc,
			previousBackgroundImageRef.current,
			previousBackgroundParamsRef.current,
			1
		);
		return;
	}

	if (previousBackgroundImageRef.current && progress < 1) {
		runBackgroundTransitionPass({
			dc,
			tc,
			type: transitionSettings.transitionType,
			easedProgress,
			activeImage,
			activeSnapshot,
			previousBackgroundImage: previousBackgroundImageRef.current,
			previousBackgroundParams: previousBackgroundParamsRef.current,
			colorFilter
		});

		if (progress >= 1 && activeImage) {
			previousBackgroundImageRef.current = null;
			transitionStartRef.current = null;
		}
	} else if (activeImage) {
		drawBackgroundImageDirect(dc, activeImage, activeSnapshot, 1);
	} else if (previousBackgroundImageRef.current) {
		drawBackgroundImageDirect(
			dc,
			previousBackgroundImageRef.current,
			previousBackgroundParamsRef.current,
			1
		);
	}

	runBackgroundPostEffectsPass({
		dc,
		activeImage,
		previousBackgroundImage: previousBackgroundImageRef.current,
		activeSnapshot,
		rgbShiftPixels,
		filterActive,
		scanlineMode,
		scanlineIntensity,
		scanlineSpacing,
		scanlineThickness,
		filmNoiseAmount,
		vignetteAmount,
		bloomAmount,
		lumaThreshold,
		lensWarpAmount,
		heatDistortionAmount,
		colorFilter,
		time,
		amplitude,
		imagePostQuality
	});

	renderedBackgroundParamsRef.current = {
		scale: layer.scale,
		positionX: layer.positionX,
		positionY: layer.positionY,
		fitMode: layer.fitMode,
		keepCovered: layer.keepCovered,
		focusX: layer.focusX,
		focusY: layer.focusY,
		mirror: layer.mirror,
		mirrorFill: layer.mirrorFill,
		mirrorFillInvert: layer.mirrorFillInvert,
		mirrorFillCount: layer.mirrorFillCount,
		rotation: layer.rotation
	};
	renderedBackgroundTransitionRef.current = {
		transitionType: layer.transitionType,
		transitionDuration: layer.transitionDuration,
		transitionIntensity: layer.transitionIntensity,
		transitionAudioDrive: layer.transitionAudioDrive
	};
}
