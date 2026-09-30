import {
	getLinearBase,
	getLinearMetrics
} from '@/features/spectrum/renderers/linear/linearRenderer';
import {
	createWaveGradient,
	getColor,
	hexToRgb
} from '@/features/spectrum/color/spectrumColor';
import {
	getRadialBaseRadius,
	getSpectrumRadialAngleRad,
	traceRadialShapeContour
} from '@/features/spectrum/geometry/radialGeometry';
import { getSpectrumFamilyCapabilities } from '@/features/spectrum/domain/spectrumFamilyCapabilities';
import { resolveRadialSharpness } from './spectrumPlacement';
import { blitInFrameSpace } from '@/features/stageFx/render';
import type {
	PerformanceMode,
	ResolvedAudioReactiveChannel
} from '@/types/wallpaper';
import type { VisualQualityTier } from '@/lib/visual/performanceQuality';
import {
	historyDepthCapForTier,
	spectrumEnergyBloomScale,
	spectrumPeakRibbonScale
} from '@/lib/visual/performanceQuality';
import { DEFAULT_SHOCKWAVE_BAND_THRESHOLDS } from '@/features/spectrum/domain/shockwaveCalibration';
import {
	type SpectrumSettings,
	type SpectrumRuntimeState,
	copyCanvas,
	ensureSnapshotCanvas
} from './spectrumRuntime';

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function safeRgbChannel(n: number): number {
	return Number.isFinite(n) ? n : 0;
}

/** Hex colors only — `mixHexColors()` returns `rgb(...)` which must not be passed here. */
function rgbaFromHex(hex: string, alpha: number): string {
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${safeRgbChannel(r)}, ${safeRgbChannel(g)}, ${safeRgbChannel(b)}, ${clamp(alpha, 0, 1)})`;
}

function rgbaMixHex(
	primary: string,
	secondary: string,
	mixT: number,
	alpha: number
): string {
	const [r1, g1, b1] = hexToRgb(primary);
	const [r2, g2, b2] = hexToRgb(secondary);
	const r = Math.round(
		safeRgbChannel(r1) + (safeRgbChannel(r2) - safeRgbChannel(r1)) * mixT
	);
	const g = Math.round(
		safeRgbChannel(g1) + (safeRgbChannel(g2) - safeRgbChannel(g1)) * mixT
	);
	const b = Math.round(
		safeRgbChannel(b1) + (safeRgbChannel(b2) - safeRgbChannel(b1)) * mixT
	);
	return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

type ShockwaveBandCalibration = {
	threshold: number;
	edge: number;
	cooldown: number;
	lineBias: number;
	thickness: number;
	speed: number;
};

const SHOCKWAVE_BAND_CALIBRATION: Record<
	ResolvedAudioReactiveChannel,
	ShockwaveBandCalibration
> = {
	kick: {
		threshold: 0.58,
		edge: 0.14,
		cooldown: 0.13,
		lineBias: 0,
		thickness: 1.2,
		speed: 1.0
	},
	bass: {
		threshold: 0.5,
		edge: 0.1,
		cooldown: 0.18,
		lineBias: 0.35,
		thickness: 1.08,
		speed: 0.86
	},
	instrumental: {
		threshold: 0.42,
		edge: 0.08,
		cooldown: 0.13,
		lineBias: 0.65,
		thickness: 0.9,
		speed: 1.05
	},
	hihat: {
		threshold: 0.38,
		edge: 0.07,
		cooldown: 0.075,
		lineBias: 1.2,
		thickness: 0.5,
		speed: 1.34
	},
	vocal: {
		threshold: 0.4,
		edge: 0.075,
		cooldown: 0.16,
		lineBias: 0.45,
		thickness: 0.72,
		speed: 0.92
	},
	full: {
		threshold: 0.46,
		edge: 0.085,
		cooldown: 0.12,
		lineBias: 0.7,
		thickness: 0.82,
		speed: 1.08
	}
};

function resolveAdaptiveShockwaveLevel(
	runtime: SpectrumRuntimeState,
	channel: ResolvedAudioReactiveChannel,
	level: number
): { normalized: number; risingEdge: number } {
	const levels = (runtime.shockwaveAdaptiveLevels ??= {});
	const previous = levels[channel] ?? {
		floor: level,
		peak: Math.max(level + 0.08, 0.12),
		lastNormalized: 0
	};
	const floorRate = level < previous.floor ? 0.08 : 0.006;
	const peakRate = level > previous.peak ? 0.2 : 0.012;
	const floor = previous.floor + (level - previous.floor) * floorRate;
	const peak = Math.max(
		floor + 0.06,
		previous.peak + (level - previous.peak) * peakRate
	);
	const normalized = clamp(
		(level - floor) / Math.max(0.06, peak - floor),
		0,
		1.35
	);
	const risingEdge = normalized - previous.lastNormalized;
	levels[channel] = {
		floor,
		peak,
		lastNormalized: normalized
	};
	return { normalized, risingEdge };
}

function getShockwaveBandThreshold(
	settings: SpectrumSettings,
	channel: ResolvedAudioReactiveChannel
): number {
	const configured = settings.spectrumShockwaveBandThresholds?.[channel];
	const fallback =
		DEFAULT_SHOCKWAVE_BAND_THRESHOLDS[channel] ??
		SHOCKWAVE_BAND_CALIBRATION[channel].threshold;
	return typeof configured === 'number' && Number.isFinite(configured)
		? clamp(configured, 0.15, 0.9)
		: fallback;
}

function getShockwaveLineCount(
	channel: ResolvedAudioReactiveChannel,
	level: number,
	energy: number,
	intensity: number,
	performanceMode: PerformanceMode
): number {
	const calibration = SHOCKWAVE_BAND_CALIBRATION[channel];
	const strength = clamp(
		level * 0.7 + energy * 0.3 + intensity * 0.24,
		0,
		1.8
	);
	const rawCount = 1 + Math.floor(strength * calibration.lineBias * 2.2);
	const cap = performanceMode === 'low' ? 2 : channel === 'hihat' ? 4 : 3;
	return Math.max(1, Math.min(cap, rawCount));
}

/**
 * Resolve how many past frames blend into the trail composite.
 *
 * User picks the depth via `spectrumFrameHistoryDepth` (range 1..6). The
 * visual-quality tier still caps the result so a `minimal` tier never goes
 * above 2 — that protects low-end GPUs without silently overriding the
 * user's slider on medium / full tiers. `performanceMode` is no longer the
 * single source of truth; it only feeds `renderQuality` upstream.
 */
function effectiveHistoryDepth(
	settings: SpectrumSettings,
	renderQuality: VisualQualityTier
): number {
	const requested = Math.round(settings.spectrumFrameHistoryDepth ?? 3);
	const sanitized = Math.max(1, Math.min(6, requested));
	return Math.min(sanitized, historyDepthCapForTier(renderQuality));
}

function resolveTrailAngle(
	settings: SpectrumSettings,
	rotation: number
): number {
	if (
		settings.spectrumFamily === 'tunnel' ||
		settings.spectrumFamily === 'orbital' ||
		settings.spectrumMode === 'radial'
	) {
		return rotation - Math.PI / 2;
	}

	if (settings.spectrumLinearOrientation === 'vertical') {
		return settings.spectrumLinearDirection === 'normal' ? 0 : Math.PI;
	}

	return settings.spectrumLinearDirection === 'normal'
		? -Math.PI / 2
		: Math.PI / 2;
}

function ensureHistoryCanvases(
	runtime: SpectrumRuntimeState,
	width: number,
	height: number,
	count: number
): Array<HTMLCanvasElement | null> {
	const existing = runtime.frameHistoryCanvases ?? [];
	if (existing.length === count) {
		for (let index = 0; index < count; index += 1) {
			existing[index] = ensureSnapshotCanvas(
				existing[index] ?? null,
				width,
				height
			);
		}
		return existing;
	}
	const next = Array.from({ length: count }, (_, index) =>
		ensureSnapshotCanvas(existing[index] ?? null, width, height)
	);
	runtime.frameHistoryCanvases = next;
	if (
		typeof runtime.frameHistoryIndex !== 'number' ||
		runtime.frameHistoryIndex < 0 ||
		runtime.frameHistoryIndex >= count
	) {
		runtime.frameHistoryIndex = 0;
	}
	return next;
}

function drawSmoothPath(
	ctx: CanvasRenderingContext2D,
	points: Array<[number, number]>
): void {
	if (points.length === 0) return;
	ctx.beginPath();
	ctx.moveTo(points[0][0], points[0][1]);
	for (let index = 1; index < points.length - 1; index += 1) {
		const mx = (points[index][0] + points[index + 1][0]) / 2;
		const my = (points[index][1] + points[index + 1][1]) / 2;
		ctx.quadraticCurveTo(points[index][0], points[index][1], mx, my);
	}
	if (points.length > 1) {
		const last = points[points.length - 1];
		ctx.lineTo(last[0], last[1]);
	}
	ctx.stroke();
}

export function drawSpectrumFrameMemoryUnderlay(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	runtime: SpectrumRuntimeState,
	settings: SpectrumSettings,
	energyNormalized: number,
	performanceMode: PerformanceMode,
	renderQuality: VisualQualityTier
): void {
	if (!settings.spectrumFrameMemoryEnabled) return;
	const width = canvas.width;
	const height = canvas.height;
	const historyDepth = effectiveHistoryDepth(settings, renderQuality);
	const blurQuality =
		renderQuality === 'full' ? 1 : renderQuality === 'reduced' ? 0.55 : 0.2;
	const afterglow = clamp(settings.spectrumAfterglow, 0, 1);
	const ghostFrames = clamp(settings.spectrumGhostFrames, 0, 1);
	const motionTrails = clamp(settings.spectrumMotionTrails, 0, 1);

	if (afterglow > 0.001 && runtime.feedbackCanvas) {
		const feedbackCanvas = runtime.feedbackCanvas;
		// Low perf used to hard-zero the blur which hid the slider entirely —
		// keep a reduced amount instead so the user sees their input have an
		// effect, just at a lower GPU cost.
		const blurScale = performanceMode === 'low' ? 0.3 : 1;
		const blurPx = Math.max(0, afterglow * 10 * blurQuality * blurScale);
		// Captured from the canvas: frame space, never through the camera again.
		blitInFrameSpace(ctx, frame => {
			frame.globalCompositeOperation = 'lighter';
			frame.globalAlpha = 0.08 + afterglow * 0.22;
			if (blurPx > 0.5) {
				frame.filter = `blur(${blurPx.toFixed(1)}px)`;
			}
			frame.drawImage(feedbackCanvas, 0, 0, width, height);
		});
	}

	if (ghostFrames <= 0.001 && motionTrails <= 0.001) return;

	const trailAngle = resolveTrailAngle(settings, runtime.rotation);
	const trailDrift = (3 + energyNormalized * 14) * motionTrails;
	const historyCanvases = ensureHistoryCanvases(
		runtime,
		width,
		height,
		historyDepth
	);
	const writeIndex = runtime.frameHistoryIndex ?? 0;

	for (let age = 1; age <= historyDepth; age += 1) {
		const historyIndex =
			(writeIndex - age + historyCanvases.length) %
			historyCanvases.length;
		const historyCanvas = historyCanvases[historyIndex];
		if (!historyCanvas) continue;

		const ageFactor = 1 - (age - 1) / Math.max(historyDepth, 1);
		const alpha =
			ghostFrames * (0.08 + ageFactor * 0.12) +
			motionTrails * (0.05 + ageFactor * 0.1);
		if (alpha <= 0.002) continue;

		const drift = trailDrift * age;
		const offsetX = Math.cos(trailAngle) * drift;
		const offsetY = Math.sin(trailAngle) * drift;

		// Low perf used to hard-zero the trail blur which made Motion Trails
		// look identical to Ghost Frames — keep 30% so the slider still has
		// a visible identity on low-end GPUs.
		const trailBlurScale = performanceMode === 'low' ? 0.3 : 1;
		const blurPx = Math.max(
			0,
			(motionTrails * age * 1.8 + ghostFrames * 1.1) *
				blurQuality *
				trailBlurScale
		);
		// Each history frame was captured from the canvas, so it already holds
		// frame-space pixels: only the ghost's own drift may move it.
		blitInFrameSpace(ctx, frame => {
			frame.globalCompositeOperation =
				motionTrails > 0.001 ? 'lighter' : 'source-over';
			frame.globalAlpha = clamp(alpha, 0, 0.42);
			if (blurPx > 0.5) {
				frame.filter = `blur(${blurPx.toFixed(1)}px)`;
			}
			frame.translate(offsetX, offsetY);
			frame.drawImage(historyCanvas, 0, 0, width, height);
		});
	}
}

export function drawSpectrumEnergyBloom(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	settings: SpectrumSettings,
	energyNormalized: number,
	cx: number,
	cy: number,
	renderQuality: VisualQualityTier
): void {
	if (!settings.spectrumEnergyBloomEnabled) return;
	const bloomRaw = settings.spectrumEnergyBloom;
	const bloom = Number.isFinite(bloomRaw) ? clamp(bloomRaw, 0, 2) : 0;
	const intensity = bloom * spectrumEnergyBloomScale(renderQuality);
	if (!Number.isFinite(intensity) || intensity <= 0.001) return;

	const en = Number.isFinite(energyNormalized)
		? clamp(energyNormalized, 0, 1)
		: 0;

	const radiusRaw =
		Math.max(80, settings.spectrumInnerRadius * 0.9) +
		settings.spectrumMaxHeight * (0.7 + intensity * 0.18) +
		en * (90 + intensity * 36);
	const maxRadius = Math.max(canvas.width, canvas.height) * 4;
	const radius = Number.isFinite(radiusRaw)
		? Math.min(radiusRaw, maxRadius)
		: maxRadius;

	if (
		!Number.isFinite(cx) ||
		!Number.isFinite(cy) ||
		!Number.isFinite(radius) ||
		radius <= 0
	)
		return;

	const mixT = 0.35 + en * 0.25;
	const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
	const coreA = (0.05 + en * 0.12) * intensity;
	const midA = (0.03 + en * 0.06) * intensity;
	const edgeA = 0;
	gradient.addColorStop(
		0,
		rgbaMixHex(
			settings.spectrumPrimaryColor,
			settings.spectrumSecondaryColor,
			mixT,
			coreA
		)
	);
	gradient.addColorStop(
		0.38,
		rgbaMixHex(
			settings.spectrumPrimaryColor,
			settings.spectrumSecondaryColor,
			mixT * 0.85,
			midA
		)
	);
	gradient.addColorStop(
		0.62,
		rgbaFromHex(settings.spectrumSecondaryColor, midA * 0.65)
	);
	gradient.addColorStop(
		0.88,
		rgbaFromHex(settings.spectrumPrimaryColor, edgeA)
	);
	gradient.addColorStop(
		1,
		rgbaFromHex(settings.spectrumSecondaryColor, edgeA)
	);

	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.restore();
}

export function drawSpectrumPeakRibbons(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	runtime: SpectrumRuntimeState,
	settings: SpectrumSettings,
	cx: number,
	cy: number,
	renderQuality: VisualQualityTier
): void {
	if (!settings.spectrumPeakRibbonsEnabled) return;
	const ribbonScale = spectrumPeakRibbonScale(renderQuality);
	if (ribbonScale <= 0.001) return;
	const intensity = clamp(settings.spectrumPeakRibbons, 0, 1.5);
	if (intensity <= 0.001) return;

	const peaks = settings.spectrumPeakHold
		? runtime.pixelPeaks
		: runtime.pixelHeights;
	if (!peaks.length) return;

	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	ctx.globalAlpha = clamp(
		settings.spectrumOpacity * (0.16 + intensity * 0.28) * ribbonScale,
		0,
		0.72
	);
	ctx.lineWidth = Math.max(
		1,
		settings.spectrumBarWidth * (0.7 + intensity * 0.9)
	);
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.shadowColor = settings.spectrumSecondaryColor;
	ctx.shadowBlur =
		settings.spectrumShadowBlur *
		Math.max(0.25, 0.25 + intensity * 0.25) *
		ribbonScale;

	const radialLike =
		settings.spectrumFamily === 'tunnel' ||
		settings.spectrumFamily === 'orbital' ||
		settings.spectrumMode === 'radial';

	const ribbonAngleRad =
		((settings.spectrumPeakRibbonAngle ?? 0) * Math.PI) / 180;

	if (radialLike) {
		// Match radial bar/wave sampling: first bin at top (−π/2), same as radialRenderer.
		const radialSamplePhase =
			settings.spectrumMode === 'radial' ? -Math.PI / 2 : 0;
		const radialAngleRad = (settings.spectrumRadialAngle * Math.PI) / 180;
		ctx.strokeStyle = createWaveGradient(
			ctx,
			canvas,
			settings,
			'radial',
			cx,
			cy,
			settings.spectrumInnerRadius + settings.spectrumMaxHeight,
			runtime.rotation + radialSamplePhase
		);
		ctx.beginPath();
		for (let index = 0; index <= peaks.length; index += 1) {
			const safeIndex = index % peaks.length;
			const t = safeIndex / Math.max(peaks.length - 1, 1);
			const baseAngle =
				t * Math.PI * 2 + runtime.rotation + radialSamplePhase;
			const radius =
				getRadialBaseRadius(
					settings.spectrumRadialShape,
					settings.spectrumInnerRadius,
					baseAngle,
					radialAngleRad,
					0,
					resolveRadialSharpness(settings)
				) +
				peaks[safeIndex] +
				intensity * 4;
			const drawAngle = baseAngle + ribbonAngleRad;
			const x = cx + Math.cos(drawAngle) * radius;
			const y = cy + Math.sin(drawAngle) * radius;
			if (index === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.closePath();
		ctx.stroke();
		ctx.restore();
		return;
	}

	const { baseX, baseY, direction } = getLinearBase(canvas, settings);
	const { stride, totalLength } = getLinearMetrics(
		canvas,
		settings,
		peaks.length
	);
	const start =
		settings.spectrumLinearOrientation === 'vertical'
			? (canvas.height - totalLength) / 2
			: (canvas.width - totalLength) / 2;
	ctx.strokeStyle = createWaveGradient(
		ctx,
		canvas,
		settings,
		settings.spectrumLinearOrientation
	);

	const mainPoints: Array<[number, number]> = [];
	const mirrorPoints: Array<[number, number]> = [];

	for (let index = 0; index < peaks.length; index += 1) {
		const offset = start + index * stride + settings.spectrumBarWidth * 0.5;
		const peak = peaks[index] + intensity * 2.5;
		if (settings.spectrumLinearOrientation === 'vertical') {
			mainPoints.push([baseX + peak * direction, offset]);
			mirrorPoints.push([baseX - peak * direction, offset]);
		} else {
			mainPoints.push([offset, baseY + peak * direction]);
			mirrorPoints.push([offset, baseY - peak * direction]);
		}
	}

	if (Math.abs(ribbonAngleRad) > 0.0001) {
		if (settings.spectrumLinearOrientation === 'vertical') {
			const pivotY = start + totalLength / 2;
			ctx.translate(baseX, pivotY);
		} else {
			const pivotX = start + totalLength / 2;
			ctx.translate(pivotX, baseY);
		}
		ctx.rotate(ribbonAngleRad);
		if (settings.spectrumLinearOrientation === 'vertical') {
			const pivotY = start + totalLength / 2;
			ctx.translate(-baseX, -pivotY);
		} else {
			const pivotX = start + totalLength / 2;
			ctx.translate(-pivotX, -baseY);
		}
	}

	drawSmoothPath(ctx, mainPoints);
	if (settings.spectrumMirror) {
		drawSmoothPath(ctx, mirrorPoints);
	}
	ctx.restore();
}

export function updateSpectrumShockwavesAndDraw(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	runtime: SpectrumRuntimeState,
	settings: SpectrumSettings,
	dt: number,
	channelInstant: number,
	resolvedChannel: ResolvedAudioReactiveChannel,
	energyNormalized: number,
	cx: number,
	cy: number,
	performanceMode: PerformanceMode,
	renderQuality: VisualQualityTier
): void {
	if (!settings.spectrumBassShockwaveEnabled) return;
	const intensity = clamp(settings.spectrumBassShockwave, 0, 1.5);
	if (intensity <= 0.001) return;
	const opacityScale = clamp(settings.spectrumShockwaveOpacity ?? 1, 0, 1);
	if (opacityScale <= 0.001) return;
	const thicknessScale = clamp(
		settings.spectrumShockwaveThickness ?? 1,
		0,
		4
	);
	const blurScale = clamp(settings.spectrumShockwaveBlur ?? 1, 0, 3);
	const colorMode = settings.spectrumShockwaveColorMode ?? 'cycle';
	const shockShadowScale =
		renderQuality === 'full' ? 1 : renderQuality === 'reduced' ? 0.55 : 0;

	const shockwaves = runtime.shockwaves ?? [];
	runtime.shockwaves = shockwaves;

	const isLinear = settings.spectrumMode === 'linear';
	// Radial origin sits at the bar baseline (innerRadius). Linear origin is the
	// spectrum axis line (baseX/baseY), so the line must spawn exactly there.
	const initialRadius = isLinear
		? 0
		: Math.max(16, settings.spectrumInnerRadius);

	const calibration = SHOCKWAVE_BAND_CALIBRATION[resolvedChannel];
	const channelChanged =
		runtime.lastShockwaveResolvedChannel !== resolvedChannel;
	const adaptive = resolveAdaptiveShockwaveLevel(
		runtime,
		resolvedChannel,
		channelInstant
	);
	const lastTime = runtime.lastShockwaveTime ?? Number.NEGATIVE_INFINITY;
	const intensityNorm = Math.min(1, intensity / 1.5);
	const bandThreshold = getShockwaveBandThreshold(settings, resolvedChannel);
	const threshold = Math.max(0.12, bandThreshold - intensityNorm * 0.1);
	const edgeThreshold = Math.max(
		0.035,
		calibration.edge - intensityNorm * 0.025
	);
	const cooldown =
		(performanceMode === 'low'
			? Math.max(0.14, calibration.cooldown * 1.4)
			: calibration.cooldown) *
		(1 - intensityNorm * 0.22);

	if (
		adaptive.normalized > threshold &&
		(channelChanged || adaptive.risingEdge > edgeThreshold) &&
		runtime.idleTime - lastTime > cooldown
	) {
		const lineCount = getShockwaveLineCount(
			resolvedChannel,
			adaptive.normalized,
			energyNormalized,
			intensity,
			performanceMode
		);
		const burstPower = clamp(
			(adaptive.normalized - threshold) / Math.max(0.12, 1 - threshold),
			0,
			1
		);
		for (let line = 0; line < lineCount; line += 1) {
			const lineT = lineCount <= 1 ? 0 : line / (lineCount - 1);
			const radiusOffset = line * (isLinear ? 9 : 14);
			shockwaves.push({
				radius: initialRadius + radiusOffset,
				alpha: clamp(
					0.16 +
						intensity * 0.2 +
						energyNormalized * 0.12 +
						burstPower * 0.28 -
						lineT * 0.12,
					0,
					0.92
				),
				thickness:
					(2 + intensity * 5 + burstPower * 8) *
					calibration.thickness *
					(1 - lineT * 0.22),
				speed:
					(150 + intensity * 130 + burstPower * 120 + line * 18) *
					calibration.speed
			});
		}
		runtime.lastShockwaveTime = runtime.idleTime;
		const maxWaves = performanceMode === 'low' ? 4 : 8;
		if (shockwaves.length > maxWaves) {
			shockwaves.splice(0, shockwaves.length - maxWaves);
		}
	}

	runtime.lastShockwaveLevel = adaptive.normalized;
	runtime.lastShockwaveResolvedChannel = resolvedChannel;

	if (shockwaves.length === 0) return;

	// Spiral renders its own shockwave visualization (a highlight wave
	// travelling along the spine, not a concentric ring) — we still let
	// this function ADVANCE and CULL the wave state above so the
	// spawn/decay timing stays consistent across families, but we skip the
	// generic ring/contour pass below to avoid double-drawing.
	if (settings.spectrumFamily === 'spiral') {
		for (let index = shockwaves.length - 1; index >= 0; index -= 1) {
			const wave = shockwaves[index];
			wave.radius += wave.speed * dt;
			wave.alpha *= Math.exp(-dt * 2.8);
			const cullRadius = Math.max(canvas.width, canvas.height) * 1.1;
			if (wave.alpha <= 0.01 || wave.radius > cullRadius) {
				shockwaves.splice(index, 1);
			}
		}
		return;
	}

	// Linear culling distance — once the line reaches max bar height we can fade it.
	const linearMaxSpread = Math.max(
		settings.spectrumMaxHeight * 1.5,
		initialRadius + 24
	);

	// Draw-pass invariants — identical for every wave this frame, so resolve
	// them once instead of per wave (a kick can spawn up to 8 waves at once).
	let linBaseX = 0;
	let linBaseY = 0;
	let linDirection: 1 | -1 = 1;
	let linStart = 0;
	let linTotalSpan = 0;
	let linVertical = false;
	let radialSupportsShape = false;
	let radialAngleRad = 0;
	if (isLinear) {
		const barCount = Math.max(1, runtime.pixelHeights?.length ?? 1);
		const base = getLinearBase(canvas, settings);
		linBaseX = base.baseX;
		linBaseY = base.baseY;
		linDirection = base.direction;
		linTotalSpan = getLinearMetrics(canvas, settings, barCount).totalSpan;
		linVertical = settings.spectrumLinearOrientation === 'vertical';
		const spanAxis = linVertical ? canvas.height : canvas.width;
		linStart = (spanAxis - linTotalSpan) / 2;
	} else {
		radialSupportsShape = getSpectrumFamilyCapabilities(
			settings.spectrumFamily
		).supportsRadialShape;
		radialAngleRad = getSpectrumRadialAngleRad(
			settings.spectrumRadialAngle
		);
	}

	for (let index = shockwaves.length - 1; index >= 0; index -= 1) {
		const wave = shockwaves[index];
		wave.radius += wave.speed * dt;
		wave.alpha *= Math.exp(-dt * 2.8);
		const cullRadius = isLinear
			? linearMaxSpread
			: Math.max(canvas.width, canvas.height) * 1.1;
		if (wave.alpha <= 0.01 || wave.radius > cullRadius) {
			shockwaves.splice(index, 1);
			continue;
		}

		let color: string;
		if (colorMode === 'primary') {
			color = settings.spectrumPrimaryColor;
		} else if (colorMode === 'secondary') {
			color = settings.spectrumSecondaryColor;
		} else {
			color = getColor(
				settings,
				(runtime.idleTime * 0.07 + index * 0.14) % 1
			);
		}

		const renderThickness = Math.max(0.1, wave.thickness * thicknessScale);

		ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		ctx.globalAlpha = wave.alpha * opacityScale;
		ctx.lineWidth = renderThickness;
		ctx.strokeStyle = color;
		ctx.shadowColor = color;
		ctx.shadowBlur =
			(settings.spectrumShadowBlur * 0.45 + renderThickness * 1.4) *
			shockShadowScale *
			blurScale;
		ctx.beginPath();
		if (isLinear) {
			// Spread grows from 0 (axis baseline) outward so the line *emerges*
			// from the spectrum origin and travels through the bar heights. The
			// stroke uses totalSpan, not bar totalLength, so it covers the full
			// configured linear span instead of stopping one gap short.
			const spread = Math.min(wave.radius, linearMaxSpread);
			if (!linVertical) {
				const y = linBaseY + linDirection * spread;
				ctx.moveTo(linStart, y);
				ctx.lineTo(linStart + linTotalSpan, y);
			} else {
				const x = linBaseX + linDirection * spread;
				ctx.moveTo(x, linStart);
				ctx.lineTo(x, linStart + linTotalSpan);
			}
		} else if (radialSupportsShape) {
			// Spiral was handled earlier with its own spine-following
			// shockwave; here `settings.spectrumFamily` is already
			// narrowed to the non-spiral radial families, so the
			// global `spectrumRadialShape` describes the silhouette.
			traceRadialShapeContour(
				ctx,
				cx,
				cy,
				settings.spectrumRadialShape,
				wave.radius,
				radialAngleRad,
				{ sharpness: resolveRadialSharpness(settings) }
			);
		} else {
			ctx.arc(cx, cy, wave.radius, 0, Math.PI * 2);
		}
		ctx.stroke();
		ctx.restore();
	}
}

export function commitSpectrumFrameMemory(
	runtime: SpectrumRuntimeState,
	canvas: HTMLCanvasElement,
	settings: SpectrumSettings,
	renderQuality: VisualQualityTier
): void {
	if (!settings.spectrumFrameMemoryEnabled) return;
	const width = canvas.width;
	const height = canvas.height;
	const afterglowActive = settings.spectrumAfterglow > 0.001;
	const historyActive =
		settings.spectrumGhostFrames > 0.001 ||
		settings.spectrumMotionTrails > 0.001;

	if (afterglowActive) {
		runtime.feedbackCanvas = ensureSnapshotCanvas(
			runtime.feedbackCanvas ?? null,
			width,
			height
		);
		copyCanvas(canvas, runtime.feedbackCanvas ?? null);
	} else {
		// Drop the full-frame buffer when the effect is off. Main + clone can
		// otherwise keep two unused viewport-sized canvases alive indefinitely.
		runtime.feedbackCanvas = null;
	}

	if (!historyActive) {
		runtime.frameHistoryCanvases = [];
		runtime.frameHistoryIndex = 0;
		return;
	}

	const historyDepth = effectiveHistoryDepth(settings, renderQuality);
	const historyCanvases = ensureHistoryCanvases(
		runtime,
		width,
		height,
		historyDepth
	);
	if (historyCanvases.length === 0) return;
	const writeIndex = runtime.frameHistoryIndex ?? 0;
	copyCanvas(canvas, historyCanvases[writeIndex] ?? null);
	runtime.frameHistoryIndex = (writeIndex + 1) % historyCanvases.length;
}
