import type { SpectrumSettings } from '@/features/spectrum/runtime/spectrumRuntime';
import type { SpectrumRuntimeState } from '@/features/spectrum/runtime/spectrumRuntime';
import { createWaveGradient } from '@/features/spectrum/color/spectrumColor';
import {
	getShapedRadiusAtAngle,
	getSpectrumRadialAngleRad,
	RADIAL_SHAPE_SAMPLE_PHASE
} from '@/features/spectrum/geometry/radialGeometry';
import {
	createGlowGradient,
	glowUsesColorSweep,
	resolveManualGlow
} from '../../effects/manualGlow';
import {
	resolveLogoSafeRadius,
	resolveRadialSharpness,
	spectrumViewportFrom
} from '../../runtime/spectrumPlacement';
import {
	drawNeonCorePass,
	resolveNeonCoreStrokeStyle
} from '../../effects/neonCorePass';
import {
	drawClassicGlowHaloPass,
	resolveGlowPerfScale,
	resolveGlowReach
} from '@/features/spectrum/renderers/linear/linearRenderer';

/** Core-pass blur for the scope trace (0 when manual glow is off). */
function computeOscilloscopeGlowBlur(settings: SpectrumSettings): number {
	if (!settings.spectrumManualGlow) return 0;
	const reach = resolveGlowReach(settings);
	const requested =
		settings.spectrumShadowBlur *
		Math.max(0.4, settings.spectrumGlowIntensity) *
		reach;
	// Cap grows with reach (the slider was inert past ~30px before) and shrinks
	// on medium/low performance modes, like every other family.
	return Math.min(
		requested,
		30 * (0.7 + reach * 0.4) * resolveGlowPerfScale(settings)
	);
}

/**
 * Manual glow for the oscilloscope trace. The scope has no bloom by default
 * (flat look); when the manual glow toggle is on, give the whole trace a
 * shadow glow in the manual core color (decoupled from the fill gradient).
 * No-op when the toggle is off, so existing presets are untouched.
 */
function applyOscilloscopeManualGlow(
	ctx: CanvasRenderingContext2D,
	settings: SpectrumSettings
): void {
	if (!settings.spectrumManualGlow) return;
	const glow = resolveManualGlow(
		settings,
		0.5,
		settings.spectrumPrimaryColor
	);
	ctx.shadowColor = glow.core;
	ctx.shadowBlur = computeOscilloscopeGlowBlur(settings);
}

/**
 * Expanded bloom halo under the scope trace — same pass Classic Wave and
 * Liquid use, so "manual glow" means the same thing in every family instead of
 * a thin shadowBlur-only edge here and a real halo there. Opt-in with the
 * manual glow toggle, so presets that never enabled it are untouched.
 */
function drawOscilloscopeGlowHalo(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	settings: SpectrumSettings,
	lineWidth: number,
	cx: number,
	cy: number,
	trace: () => void
): void {
	if (!settings.spectrumManualGlow) return;
	const coreBlur = computeOscilloscopeGlowBlur(settings);
	if (coreBlur <= 0.001) return;
	const glow = resolveManualGlow(
		settings,
		0.5,
		settings.spectrumPrimaryColor
	);
	const isRadial = settings.spectrumMode === 'radial';
	drawClassicGlowHaloPass(
		ctx,
		glow.halo,
		settings,
		1,
		expansion => {
			trace();
			ctx.lineWidth = lineWidth + expansion * 0.9;
			ctx.stroke();
		},
		{
			baseBlur: coreBlur,
			alphaBoost: 0.14,
			sweepStyle: glowUsesColorSweep(settings)
				? createGlowGradient(
						ctx,
						canvas,
						settings,
						isRadial
							? 'radial'
							: settings.spectrumLinearOrientation,
						cx,
						cy,
						settings.spectrumInnerRadius +
							settings.spectrumMaxHeight
					)
				: null
		}
	);
}

// Scratch for the radial mirror fold — one shared buffer, no per-frame alloc
// (primary and clone instances fold sequentially within a frame).
let radialMirrorScratch = new Uint8Array(0);

/**
 * Fold the trace samples into a figure symmetric across the vertical axis,
 * mirroring `applyRadialMirrorFold` (which does the same for the per-bin
 * families). The scope reads the time domain instead of `pixelHeights`, so it
 * never went through that shared fold — which is why the Mirror toggle did
 * nothing at all in radial scope while being offered in the panel.
 */
function foldRadialMirrorSamples(samples: Uint8Array): Uint8Array {
	const n = samples.length;
	if (n < 2) return samples;
	if (radialMirrorScratch.length !== n)
		radialMirrorScratch = new Uint8Array(n);
	const out = radialMirrorScratch;
	const half = Math.floor(n / 2);
	const lastIndex = n - 1;
	for (let i = 0; i <= half; i++) {
		const source =
			half === 0
				? 0
				: Math.min(lastIndex, Math.round((i / half) * lastIndex));
		const value = samples[source]!;
		out[i] = value;
		out[(n - i) % n] = value;
	}
	return out;
}

function applyOscilloscopeNeonCore(
	ctx: CanvasRenderingContext2D,
	settings: SpectrumSettings,
	lineWidth: number
): void {
	if (!settings.spectrumNeonCore) return;
	drawNeonCorePass(
		ctx,
		lineWidth,
		settings.spectrumNeonCoreIntensity,
		settings.spectrumNeonCoreWidth,
		resolveNeonCoreStrokeStyle(settings, settings.spectrumNeonCoreIntensity)
	);
}

/**
 * Map the user-facing trace response (`spectrumOscilloscopeScrollSpeed`, 1..4) to a
 * frame-to-frame lerp factor.
 *
 * Curve is exponential, not linear: most of the perceptual "slow scope"
 * feel lives between alpha ~0.01 and ~0.3, and a linear mapping spends half
 * the slider range above 0.5 where the wave already snaps. The cubic curve
 * concentrates resolution in the low-alpha region the user actually cares
 * about.
 *
 * Values are calibrated at 60 FPS; `getSmoothedTimeDomain` rescales them to
 * the real frame time.
 *
 * speed=1  → alpha≈0.008 (cinematic, ~2 s to track new content at 60 fps)
 * speed=2  → alpha≈0.045 (smooth)
 * speed=3  → alpha≈0.30 (responsive)
 * speed=4  → alpha=1.00 (snap = raw PCM each frame)
 */
function getScopeSmoothingAlpha(scrollSpeed: number): number {
	const clamped = Math.max(1, Math.min(4, scrollSpeed));
	const t = (clamped - 1) / 3;
	return 0.008 + Math.pow(t, 3) * 0.992;
}

/**
 * Downsample the raw PCM (length = fftSize, typically 2048) into a
 * `barCount`-sized buffer AND apply temporal smoothing in the same pass.
 *
 * Why fused: the renderer plots one canvas segment per output sample, so the
 * dominant cost is the segment count, not the source PCM length. Mapping
 * `spectrumBarCount` to the effective sample count lets the user trade
 * detail for perf (the slider already exists in the UI but did nothing for
 * the scope before this slice). Doing the downsample inside the smoothing
 * loop avoids two passes and lets the persistent Float32 buffer track
 * exactly the points we'll draw.
 */
function getSmoothedTimeDomain(
	runtime: SpectrumRuntimeState,
	live: Uint8Array,
	scrollSpeed: number,
	barCount: number,
	dtSeconds: number
): Uint8Array {
	if (live.length === 0) return live;
	const targetLength = Math.max(
		2,
		Math.min(Math.round(barCount), live.length)
	);
	let buffer = runtime.oscilloscopeSmoothedSamples;
	if (!buffer || buffer.length !== targetLength) {
		buffer = new Float32Array(targetLength).fill(128);
		runtime.oscilloscopeSmoothedSamples = buffer;
	}
	const stride = live.length / targetLength;
	// The slider is calibrated at 60 fps; rescale to the real frame time so a
	// 120 Hz display doesn't make the trace twice as quick. `1-(1-a)^(dt/16.7ms)`
	// keeps the same per-second convergence regardless of frame rate.
	const baseAlpha = getScopeSmoothingAlpha(scrollSpeed);
	const alpha =
		baseAlpha >= 0.999
			? 1
			: 1 -
				Math.pow(
					1 - baseAlpha,
					Math.min(0.1, Math.max(0.001, dtSeconds)) * 60
				);
	let out = runtime.oscilloscopeDisplaySamples;
	if (!out || out.length !== targetLength) {
		out = new Uint8Array(targetLength);
		runtime.oscilloscopeDisplaySamples = out;
	}
	const snap = alpha >= 0.999;
	let livePeak = 0;
	let smoothedPeak = 0;
	for (let i = 0; i < targetLength; i++) {
		const srcIndex = Math.min(live.length - 1, Math.floor(i * stride));
		const liveSample = live[srcIndex];
		livePeak = Math.max(livePeak, Math.abs(liveSample - 128));
		if (snap) {
			buffer[i] = liveSample;
		} else {
			const blended = buffer[i] + (liveSample - buffer[i]) * alpha;
			buffer[i] = blended;
		}
		smoothedPeak = Math.max(smoothedPeak, Math.abs(buffer[i] - 128));
	}

	// The PCM phase is not stable from frame to frame. If we lerp samples by
	// index directly, low response values average the wave back toward 128 and
	// the "speed" control also behaves like a hidden height control. Preserve
	// the current live peak when smoothing would only shrink the trace, while
	// still allowing slow response to leave a visible trailing waveform.
	const amplitudeCompensation =
		livePeak > smoothedPeak && smoothedPeak > 1
			? Math.min(4, livePeak / smoothedPeak)
			: 1;
	for (let i = 0; i < targetLength; i++) {
		const value = 128 + (buffer[i] - 128) * amplitudeCompensation;
		out[i] = Math.max(0, Math.min(255, Math.round(value)));
	}
	return out;
}

/**
 * Draw a real time-domain oscilloscope.
 *
 * `timeDomain` is the raw PCM waveform from AnalyserNode (0–255 with 128 =
 * silence). When empty (paused / remote replica) we render a flat baseline
 * so the visual stays consistent instead of disappearing.
 */
export function drawOscilloscope(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	runtime: SpectrumRuntimeState,
	settings: SpectrumSettings,
	timeDomain: Uint8Array,
	dt: number
): void {
	const isRadial = settings.spectrumMode === 'radial';
	const cx =
		canvas.width / 2 +
		(settings.spectrumPositionX ?? 0) * canvas.width * 0.5;
	const cy =
		canvas.height / 2 -
		(settings.spectrumPositionY ?? 0) * canvas.height * 0.5;
	const displayedTimeDomain = getSmoothedTimeDomain(
		runtime,
		timeDomain,
		settings.spectrumOscilloscopeScrollSpeed,
		settings.spectrumBarCount,
		dt
	);

	// Phosphor afterglow — fade-trail buffer. We render onto an offscreen
	// canvas, blit it back to the main ctx, then darken the offscreen so the
	// old trace fades over the next few frames (CRT-style persistence).
	const usePhosphor = settings.spectrumOscilloscopePhosphor;
	const phosphor = usePhosphor
		? ensurePhosphorCanvas(runtime, canvas.width, canvas.height)
		: null;
	const renderCtx = phosphor ? phosphor.getContext('2d') : null;
	const drawCtx = phosphor && renderCtx ? renderCtx : ctx;

	if (phosphor && renderCtx) {
		// Decay: paint a transparent black over the phosphor at (1 - decay)
		// alpha so previous strokes get darker each frame instead of holding
		// forever. Higher `decay` → quicker fade. Clamped so a misconfigured
		// 0 doesn't freeze the trail on screen forever.
		const decay = Math.max(
			0.02,
			Math.min(0.6, settings.spectrumOscilloscopePhosphorDecay)
		);
		renderCtx.save();
		renderCtx.globalCompositeOperation = 'destination-out';
		renderCtx.fillStyle = `rgba(0,0,0,${decay})`;
		renderCtx.fillRect(0, 0, canvas.width, canvas.height);
		renderCtx.restore();
	}

	drawCtx.save();
	drawCtx.lineCap = 'round';
	drawCtx.lineJoin = 'round';

	if (settings.spectrumOscilloscopeGrid) {
		drawScopeGrid(drawCtx, canvas, settings, cx, cy, isRadial);
	}

	if (isRadial) {
		drawRadialTrace(
			drawCtx,
			canvas,
			runtime,
			settings,
			displayedTimeDomain,
			cx,
			cy
		);
	} else {
		drawLinearTrace(drawCtx, canvas, settings, displayedTimeDomain, cx, cy);
	}

	drawCtx.restore();

	if (phosphor) {
		ctx.drawImage(phosphor, 0, 0);
	}
}

function ensurePhosphorCanvas(
	runtime: SpectrumRuntimeState,
	width: number,
	height: number
): HTMLCanvasElement | null {
	if (typeof document === 'undefined') return null;
	let canvas = runtime.oscilloscopePhosphorCanvas ?? null;
	if (!canvas) {
		canvas = document.createElement('canvas');
		runtime.oscilloscopePhosphorCanvas = canvas;
	}
	if (canvas.width !== width) canvas.width = width;
	if (canvas.height !== height) canvas.height = height;
	return canvas;
}

function getReactiveLineWidth(
	timeDomain: Uint8Array,
	settings: SpectrumSettings
): number {
	const baseLineWidth = settings.spectrumOscilloscopeLineWidth;
	if (
		!settings.spectrumOscilloscopeReactiveWidth ||
		timeDomain.length === 0
	) {
		return baseLineWidth;
	}
	let peak = 0;
	for (let i = 0; i < timeDomain.length; i++) {
		const offset = Math.abs((timeDomain[i] ?? 128) - 128);
		if (offset > peak) peak = offset;
	}
	const peakNorm = Math.min(1, peak / 128);
	return baseLineWidth * (1 + peakNorm * 2);
}

function drawLinearTrace(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	settings: SpectrumSettings,
	timeDomain: Uint8Array,
	cx: number,
	cy: number
): void {
	const w = canvas.width;
	const h = canvas.height;
	const isVertical = settings.spectrumLinearOrientation === 'vertical';
	const span = settings.spectrumSpan ?? 1;
	const maxAmplitude = settings.spectrumMaxHeight;
	const fillOpacity = settings.spectrumWaveFillOpacity;

	const strokeGradient = createWaveGradient(
		ctx,
		canvas,
		settings,
		isVertical ? 'vertical' : 'horizontal'
	);
	ctx.strokeStyle = strokeGradient;
	ctx.lineWidth = getReactiveLineWidth(timeDomain, settings);
	applyOscilloscopeManualGlow(ctx, settings);

	// When no audio is captured (paused/remote replica) draw a flat baseline
	// so the scope keeps a visual presence instead of disappearing.
	const N = timeDomain.length;
	if (N === 0) {
		ctx.beginPath();
		if (isVertical) {
			ctx.moveTo(cx, cy - (h * span) / 2);
			ctx.lineTo(cx, cy + (h * span) / 2);
		} else {
			ctx.moveTo(cx - (w * span) / 2, cy);
			ctx.lineTo(cx + (w * span) / 2, cy);
		}
		ctx.stroke();
		return;
	}

	if (!isVertical) {
		const spanW = w * span;
		const startX = cx - spanW / 2;
		const stepX = spanW / Math.max(N - 1, 1);

		if (fillOpacity > 0.01) {
			ctx.save();
			ctx.globalAlpha *= fillOpacity;
			ctx.fillStyle = strokeGradient;
			ctx.beginPath();
			ctx.moveTo(startX, cy);
			for (let i = 0; i < N; i++) {
				const amp = ((timeDomain[i] - 128) / 128) * maxAmplitude;
				ctx.lineTo(startX + i * stepX, cy - amp);
			}
			ctx.lineTo(startX + (N - 1) * stepX, cy);
			ctx.closePath();
			ctx.fill();
			ctx.restore();
		}

		const traceHorizontal = (sign: number) => {
			ctx.beginPath();
			for (let i = 0; i < N; i++) {
				const amp = ((timeDomain[i] - 128) / 128) * maxAmplitude;
				const x = startX + i * stepX;
				const y = cy - amp * sign;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
		};

		const lineWidth = getReactiveLineWidth(timeDomain, settings);
		drawOscilloscopeGlowHalo(ctx, canvas, settings, lineWidth, cx, cy, () =>
			traceHorizontal(1)
		);
		traceHorizontal(1);
		ctx.stroke();
		applyOscilloscopeNeonCore(ctx, settings, lineWidth);

		if (settings.spectrumMirror) {
			drawOscilloscopeGlowHalo(
				ctx,
				canvas,
				settings,
				lineWidth,
				cx,
				cy,
				() => traceHorizontal(-1)
			);
			traceHorizontal(-1);
			ctx.stroke();
		}
		return;
	}

	const spanH = h * span;
	const startY = cy - spanH / 2;
	const stepY = spanH / Math.max(N - 1, 1);

	if (fillOpacity > 0.01) {
		ctx.save();
		ctx.globalAlpha *= fillOpacity;
		ctx.fillStyle = strokeGradient;
		ctx.beginPath();
		ctx.moveTo(cx, startY);
		for (let i = 0; i < N; i++) {
			const amp = ((timeDomain[i] - 128) / 128) * maxAmplitude;
			ctx.lineTo(cx + amp, startY + i * stepY);
		}
		ctx.lineTo(cx, startY + (N - 1) * stepY);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}

	const traceVertical = (sign: number) => {
		ctx.beginPath();
		for (let i = 0; i < N; i++) {
			const amp = ((timeDomain[i] - 128) / 128) * maxAmplitude;
			const x = cx + amp * sign;
			const y = startY + i * stepY;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
	};

	const verticalLineWidth = getReactiveLineWidth(timeDomain, settings);
	drawOscilloscopeGlowHalo(
		ctx,
		canvas,
		settings,
		verticalLineWidth,
		cx,
		cy,
		() => traceVertical(1)
	);
	traceVertical(1);
	ctx.stroke();
	applyOscilloscopeNeonCore(ctx, settings, verticalLineWidth);

	if (settings.spectrumMirror) {
		drawOscilloscopeGlowHalo(
			ctx,
			canvas,
			settings,
			verticalLineWidth,
			cx,
			cy,
			() => traceVertical(-1)
		);
		traceVertical(-1);
		ctx.stroke();
	}
}

function drawRadialTrace(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	runtime: SpectrumRuntimeState,
	settings: SpectrumSettings,
	timeDomain: Uint8Array,
	cx: number,
	cy: number
): void {
	const maxAmplitude = settings.spectrumMaxHeight;
	const innerR = settings.spectrumInnerRadius;
	const rotOffset = runtime.rotation;
	const radialAngleRad = getSpectrumRadialAngleRad(
		settings.spectrumRadialAngle
	);
	const safeRadius = resolveLogoSafeRadius(
		settings,
		spectrumViewportFrom(ctx, cx, cy)
	);
	const sharpness = resolveRadialSharpness(settings);

	// Stroke and fill share identical radial gradient parameters — build it
	// once and reuse for both passes instead of allocating it twice per frame.
	const traceGradient = createWaveGradient(
		ctx,
		canvas,
		settings,
		'radial',
		cx,
		cy,
		innerR + maxAmplitude,
		rotOffset
	);
	const lineWidth = getReactiveLineWidth(timeDomain, settings);
	ctx.strokeStyle = traceGradient;
	ctx.lineWidth = lineWidth;
	applyOscilloscopeManualGlow(ctx, settings);

	const N = timeDomain.length;
	if (N === 0) {
		// Draw a base ring at innerR so the user still sees something when
		// audio is paused.
		ctx.beginPath();
		ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
		ctx.stroke();
		return;
	}

	// Radial mirror folds the samples into a vertically-symmetric figure, the
	// same contract the per-bin families get from `applyRadialMirrorFold`.
	const samples = settings.spectrumMirror
		? foldRadialMirrorSamples(timeDomain)
		: timeDomain;

	const traceRadial = () => {
		ctx.beginPath();
		for (let i = 0; i < N; i++) {
			const t = i / N;
			const angle =
				RADIAL_SHAPE_SAMPLE_PHASE + t * Math.PI * 2 + rotOffset;
			const amp = ((samples[i]! - 128) / 128) * maxAmplitude;
			const r = getShapedRadiusAtAngle(
				settings.spectrumRadialShape,
				innerR + amp,
				angle,
				radialAngleRad,
				safeRadius,
				sharpness
			);
			const x = cx + Math.cos(angle) * r;
			const y = cy + Math.sin(angle) * r;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.closePath();
	};

	// Back → front: fill, halo, trace, neon core. The fill used to be painted
	// LAST, washing over the stroke and the neon core — the linear trace below
	// already had the correct order.
	if (settings.spectrumWaveFillOpacity > 0.01) {
		traceRadial();
		ctx.save();
		ctx.globalAlpha *= settings.spectrumWaveFillOpacity;
		ctx.shadowBlur = 0;
		ctx.fillStyle = traceGradient;
		ctx.fill();
		ctx.restore();
	}

	drawOscilloscopeGlowHalo(
		ctx,
		canvas,
		settings,
		lineWidth,
		cx,
		cy,
		traceRadial
	);

	traceRadial();
	ctx.stroke();
	applyOscilloscopeNeonCore(ctx, settings, lineWidth);
}

function drawScopeGrid(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	settings: SpectrumSettings,
	cx: number,
	cy: number,
	isRadial: boolean
): void {
	const divisions = Math.max(
		3,
		Math.min(16, settings.spectrumOscilloscopeGridDivisions)
	);
	ctx.save();
	ctx.strokeStyle = 'rgba(120, 140, 130, 0.18)';
	ctx.lineWidth = 1;

	if (isRadial) {
		const maxR = settings.spectrumInnerRadius + settings.spectrumMaxHeight;
		for (let i = 1; i <= divisions; i++) {
			const r = (i / divisions) * maxR;
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.stroke();
		}
		for (let i = 0; i < divisions; i++) {
			const angle = (i / divisions) * Math.PI * 2;
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.lineTo(
				cx + Math.cos(angle) * maxR,
				cy + Math.sin(angle) * maxR
			);
			ctx.stroke();
		}
		ctx.restore();
		return;
	}

	const w = canvas.width;
	const h = canvas.height;
	const span = settings.spectrumSpan ?? 1;
	const maxAmplitude = settings.spectrumMaxHeight;
	const isVertical = settings.spectrumLinearOrientation === 'vertical';

	if (!isVertical) {
		const spanW = w * span;
		const startX = cx - spanW / 2;
		for (let i = 0; i <= divisions; i++) {
			const x = startX + (i / divisions) * spanW;
			ctx.beginPath();
			ctx.moveTo(x, cy - maxAmplitude);
			ctx.lineTo(x, cy + maxAmplitude);
			ctx.stroke();
		}
		const halfDiv = Math.max(2, Math.round(divisions * 0.5));
		for (let i = -halfDiv; i <= halfDiv; i++) {
			const y = cy + (i / halfDiv) * maxAmplitude;
			ctx.beginPath();
			ctx.moveTo(startX, y);
			ctx.lineTo(startX + spanW, y);
			ctx.stroke();
		}
	} else {
		const spanH = h * span;
		const startY = cy - spanH / 2;
		for (let i = 0; i <= divisions; i++) {
			const y = startY + (i / divisions) * spanH;
			ctx.beginPath();
			ctx.moveTo(cx - maxAmplitude, y);
			ctx.lineTo(cx + maxAmplitude, y);
			ctx.stroke();
		}
		const halfDiv = Math.max(2, Math.round(divisions * 0.5));
		for (let i = -halfDiv; i <= halfDiv; i++) {
			const x = cx + (i / halfDiv) * maxAmplitude;
			ctx.beginPath();
			ctx.moveTo(x, startY);
			ctx.lineTo(x, startY + spanH);
			ctx.stroke();
		}
	}

	ctx.restore();
}
