/**
 * Flash Light: an audio-peak impact over the whole frame. The peak envelope
 * (`stepFlashLight`) and the draw (`drawFlashLight`) are shared by the live
 * `FlashLightCanvas` and the offline video export.
 *
 * No React, no store: callers pass the settings, the audio snapshot, the
 * palettes and the clock, and own the runtime between frames.
 */
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { WallpaperState } from '@/types/wallpaper';
import {
	readFxChannel,
	resolveFxThreshold,
	shouldTriggerFxPeak,
	STAGE_FX_CAPS,
	type FlashLightShape
} from './stageFxConfig';
import { parseHexColor, type StageLightsPalettes } from './stageLightsDraw';

export type FlashLightSettings = Pick<
	WallpaperState,
	| 'flashLightAudioChannel'
	| 'flashLightBandThresholds'
	| 'flashLightBlendMode'
	| 'flashLightBrightness'
	| 'flashLightColor'
	| 'flashLightColorSource'
	| 'flashLightDecay'
	| 'flashLightIntensity'
	| 'flashLightRetriggerMs'
	| 'flashLightSensitivity'
	| 'flashLightShape'
	| 'flashLightSoftness'
	| 'flashLightThreshold'
>;

/** State a Flash Light carries from one frame to the next. */
export type FlashLightRuntime = {
	/** Current flash drive (0 – `STAGE_FX_CAPS.maxFlashOpacity`). */
	drive: number;
	lastLevel: number;
	lastTriggerMs: number;
	shapeCache: FlashShapeCache | null;
};

export function createFlashLightRuntime(): FlashLightRuntime {
	return {
		drive: 0,
		lastLevel: 0,
		lastTriggerMs: -Infinity,
		shapeCache: null
	};
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function rgba(color: string, alpha: number): string {
	const [r, g, b] = parseHexColor(color);
	return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function drawEdgeFlash(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	color: string,
	softness: number,
	pixelScale: number
) {
	const edgeDepth = Math.max(
		48 * pixelScale,
		Math.min(
			Math.max(w, h) * 0.42,
			Math.min(w, h) * (0.16 + softness * 0.3)
		)
	);
	const hot = rgba(color, 1);
	const mid = rgba(color, 0.42 + softness * 0.26);
	const clear = rgba(color, 0);

	const top = ctx.createLinearGradient(0, 0, 0, edgeDepth);
	top.addColorStop(0, hot);
	top.addColorStop(0.24, mid);
	top.addColorStop(1, clear);
	ctx.fillStyle = top;
	ctx.fillRect(0, 0, w, edgeDepth);

	const bottom = ctx.createLinearGradient(0, h, 0, h - edgeDepth);
	bottom.addColorStop(0, hot);
	bottom.addColorStop(0.24, mid);
	bottom.addColorStop(1, clear);
	ctx.fillStyle = bottom;
	ctx.fillRect(0, h - edgeDepth, w, edgeDepth);

	const left = ctx.createLinearGradient(0, 0, edgeDepth, 0);
	left.addColorStop(0, hot);
	left.addColorStop(0.24, mid);
	left.addColorStop(1, clear);
	ctx.fillStyle = left;
	ctx.fillRect(0, 0, edgeDepth, h);

	const right = ctx.createLinearGradient(w, 0, w - edgeDepth, 0);
	right.addColorStop(0, hot);
	right.addColorStop(0.24, mid);
	right.addColorStop(1, clear);
	ctx.fillStyle = right;
	ctx.fillRect(w - edgeDepth, 0, edgeDepth, h);
}

function drawFlashShape(
	ctx: CanvasRenderingContext2D,
	shape: FlashLightShape,
	w: number,
	h: number,
	color: string,
	softness: number,
	pixelScale: number
) {
	const cx = w / 2;
	const cy = h / 2;
	const softEdge = Math.max(0.05, Math.min(0.92, 1 - softness * 0.72));
	if (shape === 'full-screen') {
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		return;
	}

	if (shape === 'edge-flash') {
		drawEdgeFlash(ctx, w, h, color, softness, pixelScale);
		return;
	}

	if (shape === 'horizontal-blast' || shape === 'vertical-blast') {
		const horizontal = shape === 'horizontal-blast';
		const gradient = horizontal
			? ctx.createLinearGradient(0, 0, 0, h)
			: ctx.createLinearGradient(0, 0, w, 0);
		gradient.addColorStop(0, rgba(color, 0));
		gradient.addColorStop(
			Math.max(0.05, 0.5 - softEdge * 0.45),
			rgba(color, 1)
		);
		gradient.addColorStop(
			Math.min(0.95, 0.5 + softEdge * 0.45),
			rgba(color, 1)
		);
		gradient.addColorStop(1, rgba(color, 0));
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, w, h);
		return;
	}

	const radius =
		shape === 'circular-burst'
			? Math.min(w, h) * 0.48
			: shape === 'vignette-invert'
				? Math.hypot(w, h) * 0.5
				: Math.hypot(w, h) * 0.72;
	const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
	if (shape === 'vignette-invert') {
		const clearRadius = Math.max(0.18, 0.52 - softness * 0.3);
		gradient.addColorStop(0, rgba(color, 0));
		gradient.addColorStop(clearRadius, rgba(color, 0));
		gradient.addColorStop(
			Math.min(0.92, clearRadius + 0.22),
			rgba(color, 0.42)
		);
		gradient.addColorStop(1, rgba(color, 1));
	} else {
		gradient.addColorStop(0, rgba(color, 1));
		gradient.addColorStop(softEdge, rgba(color, 1));
		gradient.addColorStop(1, rgba(color, 0));
	}
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, w, h);
}

export type FlashShapeCache = {
	canvas: HTMLCanvasElement;
	shape: FlashLightShape;
	width: number;
	height: number;
	color: string;
	softness: number;
	pixelScale: number;
};

function getFlashShapeCanvas(
	cache: FlashShapeCache | null,
	shape: FlashLightShape,
	width: number,
	height: number,
	color: string,
	softness: number,
	pixelScale: number
): FlashShapeCache {
	if (
		cache &&
		cache.shape === shape &&
		cache.width === width &&
		cache.height === height &&
		cache.color === color &&
		cache.softness === softness &&
		cache.pixelScale === pixelScale
	) {
		return cache;
	}

	const buffer = cache?.canvas ?? document.createElement('canvas');
	buffer.width = width;
	buffer.height = height;
	const bufferCtx = buffer.getContext('2d');
	if (bufferCtx) {
		bufferCtx.clearRect(0, 0, width, height);
		drawFlashShape(
			bufferCtx,
			shape,
			width,
			height,
			color,
			softness,
			pixelScale
		);
	}
	return {
		canvas: buffer,
		shape,
		width,
		height,
		color,
		softness,
		pixelScale
	};
}

/** The flash colour for these settings (also feeds Flash Edge live). */
export function resolveFlashLightColor(
	settings: FlashLightSettings,
	palettes: StageLightsPalettes
): string {
	if (settings.flashLightColorSource === 'manual') {
		return settings.flashLightColor;
	}
	return settings.flashLightColorSource === 'theme'
		? palettes.theme.dominant
		: palettes.background.dominant;
}

/** Triggers on audio peaks and decays the drive by one frame. */
export function stepFlashLight(
	runtime: FlashLightRuntime,
	settings: FlashLightSettings,
	audio: AudioSnapshot,
	nowMs: number,
	dtSec: number
): number {
	const level = Math.max(
		0,
		readFxChannel(audio, settings.flashLightAudioChannel)
	);
	const threshold = resolveFxThreshold(
		settings.flashLightBandThresholds,
		settings.flashLightAudioChannel,
		settings.flashLightThreshold
	);
	const retriggerMs = Math.max(20, settings.flashLightRetriggerMs);
	const triggered =
		audio.bins.length > 0 &&
		shouldTriggerFxPeak({
			level,
			previousLevel: runtime.lastLevel,
			threshold,
			nowMs,
			lastTriggerMs: runtime.lastTriggerMs,
			retriggerMs,
			minRise: 0.012
		});
	// A hit usually crosses the threshold a frame before its peak. Inside the
	// retrigger window the same hit may still climb to that peak; otherwise a
	// low frame rate (30 fps export) fires on the crossing and the window
	// swallows the peak.
	const climbing =
		!triggered &&
		audio.bins.length > 0 &&
		level > threshold &&
		level > runtime.lastLevel &&
		nowMs - runtime.lastTriggerMs < retriggerMs;
	if (triggered || climbing) {
		const peak = clamp01(
			((level - threshold) / (1 - threshold)) *
				settings.flashLightSensitivity
		);
		runtime.drive = Math.min(
			STAGE_FX_CAPS.maxFlashOpacity,
			Math.max(runtime.drive, peak * settings.flashLightIntensity)
		);
		if (triggered) runtime.lastTriggerMs = nowMs;
	}
	runtime.lastLevel = level;
	runtime.drive = Math.max(
		0,
		runtime.drive - dtSec * Math.max(0.1, settings.flashLightDecay)
	);
	return runtime.drive;
}

/**
 * Paints the flash onto `ctx` (not cleared here) at the runtime's current
 * drive. `pixelScale` scales the edge flash's minimum depth for an output
 * larger or smaller than the live viewport.
 */
export function drawFlashLight(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	settings: FlashLightSettings,
	runtime: FlashLightRuntime,
	color: string,
	pixelScale = 1
): void {
	ctx.save();
	ctx.globalCompositeOperation = settings.flashLightBlendMode;
	ctx.globalAlpha = Math.min(
		STAGE_FX_CAPS.maxFlashOpacity,
		runtime.drive * Math.max(0, settings.flashLightBrightness)
	);
	ctx.shadowBlur = 0;
	runtime.shapeCache = getFlashShapeCanvas(
		runtime.shapeCache,
		settings.flashLightShape,
		width,
		height,
		color,
		clamp01(settings.flashLightSoftness),
		pixelScale
	);
	ctx.drawImage(runtime.shapeCache.canvas, 0, 0);
	ctx.restore();
}
