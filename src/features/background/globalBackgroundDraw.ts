/**
 * The global background: one image behind every other layer, drawn on its own
 * canvas. Shared by the live `GlobalBackgroundView` and the offline video
 * export, so both frame, filter and post-process the image the same way.
 *
 * No React, no store: callers pass the settings, the image and the clock.
 */
import {
	drawBloom,
	drawFilmNoise,
	drawRgbShift,
	drawScanlines,
	drawVignette,
	getScanlineAmount
} from '@/lib/canvas/imageEffects';
import {
	getLayoutReferenceResolution,
	resolveResponsiveBackgroundTransform
} from '@/features/layout/responsiveLayout';
import type { WallpaperState } from '@/types/wallpaper';
import { resolveFilterStack } from '@/features/filterLooks/filterStack';
import type { FilterLookSettings } from '@/features/filterLooks/filterLooks';
import { getBackgroundBaseSize } from './imageLayerGeometry';

export type GlobalBackgroundDrawSettings = Pick<
	WallpaperState,
	| 'globalBackgroundFitMode'
	| 'globalBackgroundScale'
	| 'globalBackgroundPositionX'
	| 'globalBackgroundPositionY'
	| 'globalBackgroundOpacity'
	| 'globalBackgroundBrightness'
	| 'globalBackgroundContrast'
	| 'globalBackgroundSaturation'
	| 'globalBackgroundBlur'
	| 'globalBackgroundHueRotate'
	| 'layoutResponsiveEnabled'
	| 'layoutBackgroundReframeEnabled'
	| 'layoutReferenceWidth'
	| 'layoutReferenceHeight'
	| 'effectLayers'
	| 'activeEffectLayerId'
	| 'filterTargets'
> &
	// The whole Looks stack: resolving which effect layer wins may hand back
	// the active layer, whose live values are these keys on the state.
	FilterLookSettings;

type Size = { width: number; height: number };

export type GlobalBackgroundDrawPlan = {
	/** Centre of the image on the canvas. */
	cx: number;
	cy: number;
	width: number;
	height: number;
	opacity: number;
	filter: string;
	/** The editor filters target the global background. */
	filterActive: boolean;
	rgbShiftPixels: number;
	filmNoiseAmount: number;
	scanlineIntensity: number;
	/**
	 * Looks values the paint pass needs. They ride along in the plan because
	 * the winning effect layer is resolved once, here — the draw call has no
	 * business asking which layer targets the global background.
	 */
	scanlineMode: WallpaperState['scanlineMode'];
	scanlineSpacing: number;
	scanlineThickness: number;
	filterBloom: number;
	filterLumaThreshold: number;
	filterVignette: number;
};

/**
 * Cap for the two blur sliders combined. Each is range-bounded (20px / 12px),
 * but max + max = 32px on a full-canvas drawImage is expensive without adding
 * visible detail past ~24px.
 */
const MAX_COMBINED_BLUR_PX = 28;

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

/** The effect layer painting the global background, if any. */
function resolveStack(
	settings: GlobalBackgroundDrawSettings
): FilterLookSettings | null {
	return resolveFilterStack(settings, 'global-background');
}

function resolveScanlineIntensity(stack: FilterLookSettings | null): number {
	if (!stack?.scanlinesEnabled) return 0;
	return stack.scanlineIntensity;
}

/** Whether the frame changes over time, so the live view must keep drawing. */
export function hasAnimatedGlobalBackgroundFilter(
	settings: GlobalBackgroundDrawSettings
): boolean {
	const stack = resolveStack(settings);
	return (
		stack !== null &&
		(stack.rgbShift > 0.0001 ||
			stack.noiseIntensity > 0.001 ||
			resolveScanlineIntensity(stack) > 0.001)
	);
}

export function resolveGlobalBackgroundDrawPlan(
	settings: GlobalBackgroundDrawSettings,
	canvas: Size,
	image: Size
): GlobalBackgroundDrawPlan {
	const stack = resolveStack(settings);
	const filterActive = stack !== null;
	const imageWidth = image.width || canvas.width;
	const imageHeight = image.height || canvas.height;

	const base = getBackgroundBaseSize(
		canvas.width,
		canvas.height,
		imageWidth,
		imageHeight,
		settings.globalBackgroundFitMode
	);
	const authoredScale = Math.max(0.01, settings.globalBackgroundScale);
	let scale = authoredScale;
	let positionX = settings.globalBackgroundPositionX;
	let positionY = settings.globalBackgroundPositionY;
	if (
		settings.layoutResponsiveEnabled &&
		settings.layoutBackgroundReframeEnabled
	) {
		const reference = getLayoutReferenceResolution(settings);
		const referenceBase = getBackgroundBaseSize(
			reference.width,
			reference.height,
			image.width || reference.width,
			image.height || reference.height,
			settings.globalBackgroundFitMode
		);
		const responsive = resolveResponsiveBackgroundTransform({
			...settings,
			authoredScale,
			authoredPositionX: settings.globalBackgroundPositionX,
			authoredPositionY: settings.globalBackgroundPositionY,
			currentViewport: canvas,
			currentBaseWidth: base.width,
			currentBaseHeight: base.height,
			referenceBaseWidth: referenceBase.width,
			referenceBaseHeight: referenceBase.height
		});
		scale = responsive.scale;
		positionX = responsive.positionX;
		positionY = responsive.positionY;
	}

	const brightness =
		settings.globalBackgroundBrightness * (stack?.filterBrightness ?? 1);
	const contrast =
		settings.globalBackgroundContrast * (stack?.filterContrast ?? 1);
	const saturation =
		settings.globalBackgroundSaturation * (stack?.filterSaturation ?? 1);
	const blur = Math.min(
		MAX_COMBINED_BLUR_PX,
		settings.globalBackgroundBlur + (stack?.filterBlur ?? 0)
	);
	const hue =
		settings.globalBackgroundHueRotate + (stack?.filterHueRotate ?? 0);

	return {
		cx: canvas.width / 2 + positionX * canvas.width * 0.5,
		cy: canvas.height / 2 - positionY * canvas.height * 0.5,
		width: base.width * scale,
		height: base.height * scale,
		opacity: clamp01(
			settings.globalBackgroundOpacity * (stack?.filterOpacity ?? 1)
		),
		filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) blur(${blur}px) hue-rotate(${hue}deg)`,
		filterActive,
		rgbShiftPixels: stack
			? stack.rgbShift * Math.min(canvas.width, canvas.height) * 0.65
			: 0,
		filmNoiseAmount: stack?.noiseIntensity ?? 0,
		scanlineIntensity: resolveScanlineIntensity(stack),
		scanlineMode: stack?.scanlineMode ?? 'always',
		scanlineSpacing: stack?.scanlineSpacing ?? 0,
		scanlineThickness: stack?.scanlineThickness ?? 0,
		filterBloom: stack?.filterBloom ?? 0,
		filterLumaThreshold: stack?.filterLumaThreshold ?? 0,
		filterVignette: stack?.filterVignette ?? 0
	};
}

/**
 * Paints one frame onto `ctx` (which it clears first). `amplitude` only feeds
 * the audio-driven scanline mode.
 */
export function drawGlobalBackgroundFrame(
	ctx: CanvasRenderingContext2D,
	image: HTMLImageElement,
	settings: GlobalBackgroundDrawSettings,
	timeMs: number,
	amplitude: number
): void {
	const canvas = { width: ctx.canvas.width, height: ctx.canvas.height };
	const plan = resolveGlobalBackgroundDrawPlan(settings, canvas, {
		width: image.naturalWidth,
		height: image.naturalHeight
	});
	const { width, height } = plan;

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.save();
	ctx.translate(plan.cx, plan.cy);
	ctx.globalAlpha = plan.opacity;
	ctx.filter = plan.filter;
	ctx.drawImage(image, -width / 2, -height / 2, width, height);
	ctx.filter = 'none';
	if (plan.filterActive) {
		const scanlineAmount = getScanlineAmount(
			plan.scanlineMode,
			plan.scanlineIntensity,
			timeMs,
			amplitude
		);
		drawRgbShift(
			ctx,
			image,
			width,
			height,
			plan.rgbShiftPixels,
			'brightness(1) contrast(1) saturate(1) hue-rotate(0deg)',
			timeMs,
			ctx.globalAlpha
		);
		drawFilmNoise(
			ctx,
			width,
			height,
			plan.filmNoiseAmount,
			timeMs,
			ctx.globalAlpha
		);
		drawScanlines(
			ctx,
			width,
			height,
			scanlineAmount,
			plan.scanlineSpacing,
			plan.scanlineThickness,
			ctx.globalAlpha
		);
		drawBloom(
			ctx,
			image,
			width,
			height,
			plan.filterBloom,
			plan.filterLumaThreshold,
			ctx.globalAlpha
		);
		drawVignette(ctx, width, height, plan.filterVignette, ctx.globalAlpha);
	}
	ctx.restore();
}
