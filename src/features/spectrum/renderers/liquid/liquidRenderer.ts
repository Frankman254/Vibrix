import type { SpectrumSettings } from '@/features/spectrum/runtime/spectrumRuntime';
import type { SpectrumRuntimeState } from '@/features/spectrum/runtime/spectrumRuntime';
import { ensureSnapshotCanvas } from '@/features/spectrum/runtime/spectrumRuntime';
import {
	blitPixelated,
	computePixelateSmallSize,
	isPixelatePostProcessActive,
	normalizePixelateScale
} from '@/features/spectrum/domain/pixelArtHelpers';
import { getColor } from '@/features/spectrum/color/spectrumColor';
import {
	blitInFrameSpace,
	endCameraDrawSpace,
	mirrorCameraDrawSpace
} from '@/features/stageFx/render';
import {
	createGlowGradient,
	glowUsesColorSweep
} from '@/features/spectrum/effects/manualGlow';
import {
	drawClassicGlowHaloPass,
	getLinearBase,
	resolveGlowPerfScale,
	resolveGlowReach,
	resolveManualGlow
} from '@/features/spectrum/renderers/linear/linearRenderer';
import {
	getRadialShapeDefinition,
	getShapedRadiusAtAngle,
	getSpectrumRadialAngleRad,
	RADIAL_SHAPE_SAMPLE_PHASE
} from '@/features/spectrum/geometry/radialGeometry';
import {
	resolveLogoSafeRadius,
	resolveRadialSharpness
} from '@/features/spectrum/runtime/spectrumPlacement';
import {
	anyLiquidLayerRigid,
	getSpectrumLiquidLayerParams,
	SPECTRUM_LIQUID_LAYER_COUNT,
	type SpectrumLiquidLayerIndex
} from '@/features/spectrum/presets/spectrumLiquidLayers';

// Halved from 128/120. Liquid contours are smooth blobs (no sharp vertices
// like star), so 64 samples is visually indistinguishable from 128 at
// typical viewport sizes — pure perf win for the layered shadow stack.
const RADIAL_STEPS = 64;
const LINEAR_STEPS = 64;
const RIGID_RADIAL_STEP_MULTIPLIER = 3;

/**
 * Shared glow-blur cap for the 3 liquid layers.
 *
 * Each layer draws a shadowed stroke + an optional shadowed fill = up to 6
 * shadow passes per frame. The original code multiplied `shadowBlur ×
 * glowIntensity × (1 - layer * 0.18)` with no upper bound — at max
 * settings (60 × 3 = 180), even the dimmest layer ran 110px blur per pass.
 * Caps modeled after Classic's helper but stricter because liquid stacks
 * full-canvas filled blobs, not stroke outlines.
 */
export function computeLiquidGlowBlur(
	settings: SpectrumSettings,
	layerDepthFactor: number,
	rigidShape = false,
	activeLayerCount = 1
): number {
	// The user's three dials own the requested value outright — attenuating it
	// by the layer stack (as this used to) is what made Shadow Blur and Glow
	// Reach feel dead: at defaults a 3-layer stack asked for ~8px and any
	// slider move disappeared inside the cap. The stack relief now applies to
	// the CEILING only, so the sliders keep their full authority below it.
	const requested =
		settings.spectrumShadowBlur *
		settings.spectrumGlowIntensity *
		resolveGlowReach(settings) *
		layerDepthFactor;
	// Every visible layer adds a shadowed pass (and the second spectrum stacks
	// more onto the same canvas), so the ceiling tightens as the stack grows:
	// 1 layer → 100%, 2 → ~89%, 3 → ~84%.
	const stackRelief = 0.62 + 0.38 / Math.sqrt(Math.max(1, activeLayerCount));
	// Reach widens the ceiling as well, otherwise the cap swallows the slider.
	// Rigid contours are thin strokes, fluid blobs are large filled areas —
	// hence the lower rigid ceiling. Perf scaling matches Classic.
	const cap =
		(rigidShape ? 26 : 44) *
		(0.7 + resolveGlowReach(settings) * 0.45) *
		stackRelief *
		resolveGlowPerfScale(settings);
	return Math.min(requested, cap);
}

/**
 * Bloom halo for one liquid layer — the same recipe Classic Wave uses, traced
 * over the layer's OWN contour so the glow follows each layer's shape (and
 * each layer's rigid/fluid deformation) instead of a single shared blob.
 *
 * Before this, liquid only set `shadowBlur` on the main stroke: capped at 28px
 * and with no expanded halo pass, so Glow / Glow Reach were visually inert
 * compared to Classic Radial Wave.
 */
function drawLiquidLayerHalo(
	ctx: CanvasRenderingContext2D,
	settings: SpectrumSettings,
	haloColor: string,
	baseLineWidth: number,
	coreBlur: number,
	activeLayerCount: number,
	layerAlpha: number,
	sweepStyle: CanvasGradient | string | null,
	traceContour: () => void
): void {
	if (settings.spectrumGlowIntensity <= 0.001 || coreBlur <= 0.001) return;
	// A halo under ~2% opacity costs a full blurred stroke and shows nothing.
	if (layerAlpha <= 0.02) return;
	// One extra shadowed stroke per visible layer. The expansion keeps most of
	// its size as the stack grows (a heavily attenuated halo is what made Glow
	// Reach unreadable on liquid); only the tail end is relieved.
	const stackRelief = 0.7 + 0.3 / Math.sqrt(Math.max(1, activeLayerCount));
	drawClassicGlowHaloPass(
		ctx,
		haloColor,
		settings,
		1,
		expansion => {
			traceContour();
			ctx.lineWidth = baseLineWidth + expansion * 1.4;
			ctx.stroke();
		},
		{
			baseBlur: coreBlur,
			alphaBoost: 0.18,
			expansionMultiplier: 1.25 * stackRelief,
			alphaScale: layerAlpha,
			sweepStyle
		}
	);
}

type LiquidLayerTarget = {
	/** Where this layer must draw. */
	ctx: CanvasRenderingContext2D;
	/** Blits the scratch buffer back (no-op when drawing straight to canvas). */
	commit: () => void;
};

const DIRECT_TARGET = (ctx: CanvasRenderingContext2D): LiquidLayerTarget => ({
	ctx,
	commit: () => {}
});

/**
 * Routes ONE liquid layer through a pixelate scratch canvas when that layer
 * asked for it, so a single layer can read as chunky pixel art while its
 * neighbours stay smooth. The spectrum-wide `spectrumPixelate` already
 * pixelates the whole scene upstream, so per-layer work is skipped then —
 * running both would just quantize twice for no visual gain.
 */
function beginLiquidLayer(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	runtime: SpectrumRuntimeState,
	settings: SpectrumSettings,
	pixelate: boolean
): LiquidLayerTarget {
	if (!pixelate || isPixelatePostProcessActive(settings)) {
		return DIRECT_TARGET(ctx);
	}
	const scale = normalizePixelateScale(settings.spectrumPixelateScale);
	if (scale <= 1) return DIRECT_TARGET(ctx);

	const scratch = ensureSnapshotCanvas(
		runtime.liquidLayerPixelateCanvas ?? null,
		canvas.width,
		canvas.height
	);
	const scratchCtx = scratch?.getContext('2d') ?? null;
	if (!scratch || !scratchCtx) return DIRECT_TARGET(ctx);
	runtime.liquidLayerPixelateCanvas = scratch;
	scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
	// Full-viewport scratch: paint it in the output's camera space and blit it
	// back untranslated, so the scratch border never enters the frame.
	const spaceMirrored = mirrorCameraDrawSpace(scratchCtx, ctx);

	return {
		ctx: scratchCtx,
		commit: () => {
			if (spaceMirrored) endCameraDrawSpace(scratchCtx);
			const { width: sw, height: sh } = computePixelateSmallSize(
				canvas.width,
				canvas.height,
				scale
			);
			runtime.pixelateSmallCanvas = ensureSnapshotCanvas(
				runtime.pixelateSmallCanvas ?? null,
				sw,
				sh
			);
			blitInFrameSpace(ctx, frame => {
				// The layer baked its own opacity into the scratch; blitting
				// under the outer spectrum alpha again would darken it twice.
				frame.globalAlpha = 1;
				frame.shadowBlur = 0;
				frame.shadowColor = 'rgba(0,0,0,0)';
				blitPixelated(
					frame,
					scratch,
					runtime.pixelateSmallCanvas ?? null
				);
			});
		}
	};
}

/** Count liquid layers that will actually draw (alpha above the cull threshold). */
function countActiveLiquidLayers(settings: SpectrumSettings): number {
	let count = 0;
	for (let layer = 0; layer < SPECTRUM_LIQUID_LAYER_COUNT; layer++) {
		const params = getSpectrumLiquidLayerParams(
			settings,
			layer as SpectrumLiquidLayerIndex
		);
		if (settings.spectrumOpacity * params.opacity > 0.001) count++;
	}
	return Math.max(1, count);
}

/**
 * Draw layered liquid/fluid waves that deform with audio frequency data.
 * Each layer has its own opacity, amplitude, fill, and wobble speed.
 */
export function drawLiquid(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	runtime: SpectrumRuntimeState,
	settings: SpectrumSettings
): void {
	if (settings.spectrumOpacity <= 0.001) return;
	const w = canvas.width;
	const h = canvas.height;
	const barCount = Math.max(runtime.pixelHeights.length, 1);
	const t = runtime.idleTime;
	const isRadial = settings.spectrumMode === 'radial';

	ctx.save();

	if (isRadial) {
		_drawRadialLiquid(ctx, canvas, runtime, settings, t, barCount);
	} else {
		_drawLinearLiquid(ctx, canvas, runtime, settings, t, barCount, w, h);
	}

	ctx.restore();
}

function _drawLinearLiquid(
	outerCtx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	runtime: SpectrumRuntimeState,
	settings: SpectrumSettings,
	t: number,
	barCount: number,
	w: number,
	h: number
): void {
	const pixelHeights = runtime.pixelHeights;
	const { baseX, baseY, direction } = getLinearBase(canvas, settings);
	const isVertical = settings.spectrumLinearOrientation === 'vertical';
	const spanF = Math.max(0.2, Math.min(1, settings.spectrumSpan ?? 1));
	const totalSpan = (isVertical ? h : w) * spanF;
	const axisStart = isVertical ? (h - totalSpan) / 2 : (w - totalSpan) / 2;
	const maxH = settings.spectrumMaxHeight;
	const activeLayerCount = countActiveLiquidLayers(settings);

	for (let layer = 0; layer < SPECTRUM_LIQUID_LAYER_COUNT; layer++) {
		const layerIndex = layer as SpectrumLiquidLayerIndex;
		const params = getSpectrumLiquidLayerParams(settings, layerIndex);
		const phaseOffset =
			(layer / Math.max(SPECTRUM_LIQUID_LAYER_COUNT - 1, 1)) *
			Math.PI *
			0.66;
		const alpha = settings.spectrumOpacity * params.opacity;
		if (alpha <= 0.001) continue;
		const layerColor = getColor(
			settings,
			layer / SPECTRUM_LIQUID_LAYER_COUNT +
				t * 0.05 +
				phaseOffset / (Math.PI * 2)
		);
		const target = beginLiquidLayer(
			outerCtx,
			canvas,
			runtime,
			settings,
			params.pixelate
		);
		const ctx = target.ctx;

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = layerColor;
		ctx.fillStyle = layerColor;
		ctx.lineWidth =
			settings.spectrumBarWidth *
			(1.5 - layer * 0.2) *
			(0.65 + params.amp * 0.35);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.miterLimit = 2;
		const layerGlow = resolveManualGlow(
			settings,
			layer / Math.max(SPECTRUM_LIQUID_LAYER_COUNT - 1, 1),
			layerColor
		);
		const coreBlur = computeLiquidGlowBlur(
			settings,
			1 - layer * 0.18,
			false,
			activeLayerCount
		);
		ctx.shadowColor = layerGlow.core;
		ctx.shadowBlur = coreBlur;
		// Axis gradient for the sweeping glow modes, built only when the halo
		// will actually draw.
		const layerSweep =
			glowUsesColorSweep(settings) && coreBlur > 0.001
				? createGlowGradient(
						ctx,
						canvas,
						settings,
						settings.spectrumLinearOrientation
					)
				: null;

		const pointCount = LINEAR_STEPS + 1;
		ensureContourCapacity(linearContour, pointCount);
		for (let step = 0; step < pointCount; step++) {
			const frac = step / LINEAR_STEPS;
			const binIdx = Math.floor(frac * (barCount - 1));
			const rawH = (pixelHeights[binIdx] ?? 0) / Math.max(maxH, 1);
			const waveSin =
				Math.sin(
					frac * Math.PI * 6 + t * params.speed * 1.2 + phaseOffset
				) * 0.15;
			const amp = (rawH * params.amp + waveSin) * maxH;

			if (isVertical) {
				linearContour.ys[step] = axisStart + frac * totalSpan;
				linearContour.xs[step] = baseX + direction * amp;
			} else {
				linearContour.xs[step] = axisStart + frac * totalSpan;
				linearContour.ys[step] = baseY + direction * amp;
			}
		}
		linearContour.count = pointCount;

		const tracePoints = (
			reflect: { x?: number; y?: number } | null = null
		) => {
			ctx.beginPath();
			replayLinearContour(ctx, linearContour, reflect);
		};
		const mirrorReflect = isVertical ? { x: baseX } : { y: baseY };

		// Halo first (back → front), then the crisp stroke over it.
		drawLiquidLayerHalo(
			ctx,
			settings,
			layerGlow.halo,
			ctx.lineWidth,
			coreBlur,
			activeLayerCount,
			alpha,
			layerSweep,
			() => tracePoints()
		);

		tracePoints();
		ctx.stroke();

		const layerFill = settings.spectrumWaveFillOpacity * params.fill;
		if (layerFill > 0.01) {
			if (isVertical) {
				ctx.lineTo(baseX, axisStart + totalSpan);
				ctx.lineTo(baseX, axisStart);
			} else {
				ctx.lineTo(axisStart + totalSpan, baseY);
				ctx.lineTo(axisStart, baseY);
			}
			ctx.closePath();
			ctx.save();
			ctx.globalAlpha *= layerFill;
			// Fill area glow is largely hidden behind the stroke's glow but
			// costs a full shadowed pass over a large region — skip it.
			ctx.shadowBlur = 0;
			ctx.fill();
			ctx.restore();
		}

		if (settings.spectrumMirror) {
			// The mirrored half is the same layer — same halo, and the points
			// are reflected on replay instead of copied into a second array.
			drawLiquidLayerHalo(
				ctx,
				settings,
				layerGlow.halo,
				ctx.lineWidth,
				coreBlur,
				activeLayerCount,
				alpha,
				layerSweep,
				() => tracePoints(mirrorReflect)
			);
			tracePoints(mirrorReflect);
			ctx.stroke();

			// Mirror the wave fill too — previously only the stroke was cloned,
			// so the mirrored side showed a thin outline (bar width) with no
			// filled body even when Wave Fill was on. Close the mirrored
			// contour back to the baseline and fill it the same way as the
			// main side.
			if (layerFill > 0.01) {
				if (isVertical) {
					ctx.lineTo(baseX, axisStart + totalSpan);
					ctx.lineTo(baseX, axisStart);
				} else {
					ctx.lineTo(axisStart + totalSpan, baseY);
					ctx.lineTo(axisStart, baseY);
				}
				ctx.closePath();
				ctx.save();
				ctx.globalAlpha *= layerFill;
				ctx.shadowBlur = 0;
				ctx.fill();
				ctx.restore();
			}
		}

		ctx.restore();
		target.commit();
	}
}

/**
 * Reusable point buffers for one liquid contour.
 *
 * Each contour used to be re-evaluated from scratch every time it was drawn —
 * halo, stroke and fill meant running the same sin/cos + shape math three
 * times per layer (and a rigid star traces 192 points), plus the linear path
 * allocated ~65 `[x, y]` tuples per layer per frame. A layer is built, drawn
 * and finished before the next one starts (instances also render
 * sequentially), so module-level buffers are safe and allocation-free.
 */
type ContourBuffer = { xs: Float32Array; ys: Float32Array; count: number };

function createContourBuffer(): ContourBuffer {
	return { xs: new Float32Array(0), ys: new Float32Array(0), count: 0 };
}

const outerContour = createContourBuffer();
const innerContour = createContourBuffer();
const linearContour = createContourBuffer();

function ensureContourCapacity(buffer: ContourBuffer, size: number): void {
	if (buffer.xs.length < size) {
		buffer.xs = new Float32Array(size);
		buffer.ys = new Float32Array(size);
	}
}

/** Samples a closed radial contour once; replay it as many times as needed. */
function buildRadialContour(
	buffer: ContourBuffer,
	cx: number,
	cy: number,
	radiusAtAngle: (angle: number) => number,
	steps: number
): void {
	ensureContourCapacity(buffer, steps);
	for (let i = 0; i < steps; i++) {
		const angle = RADIAL_SHAPE_SAMPLE_PHASE + (i / steps) * Math.PI * 2;
		const r = radiusAtAngle(angle);
		buffer.xs[i] = cx + Math.cos(angle) * r;
		buffer.ys[i] = cy + Math.sin(angle) * r;
	}
	buffer.count = steps;
}

function replayContour(
	ctx: CanvasRenderingContext2D,
	buffer: ContourBuffer,
	reverse = false
): void {
	const n = buffer.count;
	if (n === 0) return;
	if (reverse) {
		ctx.moveTo(buffer.xs[n - 1]!, buffer.ys[n - 1]!);
		for (let i = n - 2; i >= 0; i--)
			ctx.lineTo(buffer.xs[i]!, buffer.ys[i]!);
		return;
	}
	ctx.moveTo(buffer.xs[0]!, buffer.ys[0]!);
	for (let i = 1; i < n; i++) ctx.lineTo(buffer.xs[i]!, buffer.ys[i]!);
}

/**
 * Replays the linear contour, optionally reflected across the baseline — the
 * mirrored half no longer needs its own mapped copy of the point list.
 */
function replayLinearContour(
	ctx: CanvasRenderingContext2D,
	buffer: ContourBuffer,
	reflect: { x?: number; y?: number } | null = null
): void {
	const n = buffer.count;
	if (n === 0) return;
	const rx = reflect?.x;
	const ry = reflect?.y;
	const px = (i: number) =>
		rx === undefined ? buffer.xs[i]! : 2 * rx - buffer.xs[i]!;
	const py = (i: number) =>
		ry === undefined ? buffer.ys[i]! : 2 * ry - buffer.ys[i]!;
	ctx.moveTo(px(0), py(0));
	for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(i));
}

function _drawRadialLiquid(
	outerCtx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	runtime: SpectrumRuntimeState,
	settings: SpectrumSettings,
	t: number,
	barCount: number
): void {
	const cx =
		canvas.width / 2 +
		(settings.spectrumPositionX ?? 0) * canvas.width * 0.5;
	const cy =
		canvas.height / 2 -
		(settings.spectrumPositionY ?? 0) * canvas.height * 0.5;
	const pixelHeights = runtime.pixelHeights;
	const maxH = settings.spectrumMaxHeight;
	const baseR = settings.spectrumInnerRadius;
	const rotation = runtime.rotation;
	const radialAngleRad = getSpectrumRadialAngleRad(
		settings.spectrumRadialAngle
	);
	const shape = settings.spectrumRadialShape;
	// "Fit around logo" — keeps inward vertices (star / polygons) from cutting
	// through the logo, exactly like Classic radial.
	const safeRadius = resolveLogoSafeRadius(settings, {
		width: canvas.width,
		height: canvas.height,
		cx,
		cy
	});
	const sharpness = resolveRadialSharpness(settings);
	const activeLayerCount = countActiveLiquidLayers(settings);
	let meanEnergyNorm = 0;
	if (anyLiquidLayerRigid(settings)) {
		for (let i = 0; i < barCount; i++) {
			meanEnergyNorm += (pixelHeights[i] ?? 0) / Math.max(maxH, 1);
		}
		meanEnergyNorm = Math.min(1, meanEnergyNorm / Math.max(barCount, 1));
	}

	for (let layer = 0; layer < SPECTRUM_LIQUID_LAYER_COUNT; layer++) {
		const layerIndex = layer as SpectrumLiquidLayerIndex;
		const params = getSpectrumLiquidLayerParams(settings, layerIndex);
		const alpha = settings.spectrumOpacity * params.opacity;
		if (alpha <= 0.001) continue;
		const rigidShape = params.rigidShape;
		const phaseOffset =
			(layer / Math.max(SPECTRUM_LIQUID_LAYER_COUNT - 1, 1)) *
			Math.PI *
			0.5;
		const layerRadialAngleRad =
			radialAngleRad + (rigidShape ? t * params.rotationSpeed : 0);
		const shapedRadius = (nominal: number, angle: number) =>
			getShapedRadiusAtAngle(
				params.shape ?? shape,
				nominal,
				angle,
				layerRadialAngleRad,
				safeRadius,
				sharpness
			);
		const layerColor = getColor(
			settings,
			layer / SPECTRUM_LIQUID_LAYER_COUNT +
				rotation / (Math.PI * 2) +
				phaseOffset / (Math.PI * 2)
		);
		const target = beginLiquidLayer(
			outerCtx,
			canvas,
			runtime,
			settings,
			params.pixelate
		);
		const ctx = target.ctx;

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = layerColor;
		ctx.fillStyle = layerColor;
		ctx.lineWidth =
			settings.spectrumBarWidth *
			(1.5 - layer * 0.2) *
			(0.65 + params.amp * 0.35);
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.miterLimit = 2;
		const layerGlow = resolveManualGlow(
			settings,
			layer / Math.max(SPECTRUM_LIQUID_LAYER_COUNT - 1, 1),
			layerColor
		);
		const coreBlur = computeLiquidGlowBlur(
			settings,
			1 - layer * 0.18,
			rigidShape,
			activeLayerCount
		);
		ctx.shadowColor = layerGlow.core;
		ctx.shadowBlur = coreBlur;
		// Sweeping glow modes paint this layer's halo with a conic gradient
		// centred on the figure, so the color runs around the whole contour.
		// Built only when the halo will actually draw — a gradient plus its
		// colour stops per layer per frame is pure waste with the glow off.
		const layerSweep =
			glowUsesColorSweep(settings) && coreBlur > 0.001
				? createGlowGradient(
						ctx,
						canvas,
						settings,
						'radial',
						cx,
						cy,
						baseR + maxH,
						layerRadialAngleRad + rotation
					)
				: null;
		const contourSteps = rigidShape
			? Math.max(
					RADIAL_STEPS * RIGID_RADIAL_STEP_MULTIPLIER,
					getRadialShapeDefinition(params.shape ?? shape)
						.tunnelSegments * RIGID_RADIAL_STEP_MULTIPLIER
				)
			: RADIAL_STEPS;

		const outerRadiusAt = (angle: number) => {
			if (rigidShape) {
				const amp = meanEnergyNorm * params.amp * maxH * 0.5;
				return shapedRadius(baseR + amp, angle);
			}
			const sampleAngle = angle + rotation + phaseOffset;
			let frac =
				(sampleAngle - RADIAL_SHAPE_SAMPLE_PHASE) / (Math.PI * 2);
			frac = frac - Math.floor(frac);
			const binIdx = Math.floor(frac * (barCount - 1));
			const rawH = (pixelHeights[binIdx] ?? 0) / Math.max(maxH, 1);
			const waveSin =
				Math.sin(frac * Math.PI * 4 + t * params.speed + phaseOffset) *
				0.12;
			const amp = (rawH * params.amp + waveSin) * maxH * 0.5;
			return shapedRadius(baseR + amp, angle);
		};

		const innerRadiusAt = (angle: number) =>
			shapedRadius(baseR * (0.92 + layer * 0.02), angle);

		// Sampled ONCE per layer, then replayed for the halo, the stroke and the
		// fill. Closed paths must not duplicate the first point before
		// closePath() — that creates a brighter shadow/glow seam at the radial
		// split, especially on rigid angular shapes.
		buildRadialContour(outerContour, cx, cy, outerRadiusAt, contourSteps);
		const traceOuterContour = () => {
			ctx.beginPath();
			replayContour(ctx, outerContour);
			ctx.closePath();
		};

		// Bloom halo around THIS layer's contour — same recipe as Classic
		// Radial Wave, so the glow tracks each layer's own shape (circle, star,
		// polygon…) and its rigid/fluid deformation.
		drawLiquidLayerHalo(
			ctx,
			settings,
			layerGlow.halo,
			ctx.lineWidth,
			coreBlur,
			activeLayerCount,
			alpha,
			layerSweep,
			traceOuterContour
		);

		traceOuterContour();
		ctx.stroke();

		const layerFill = settings.spectrumWaveFillOpacity * params.fill;
		if (layerFill > 0.01) {
			ctx.beginPath();
			// Non-rigid liquid is an annulus. Keep outer/inner contours as
			// separate closed subpaths and fill with even-odd; connecting them
			// with a radial line creates the visible "cut" through the layer.
			replayContour(ctx, outerContour);
			ctx.closePath();
			if (!rigidShape) {
				buildRadialContour(
					innerContour,
					cx,
					cy,
					innerRadiusAt,
					contourSteps
				);
				replayContour(ctx, innerContour, true);
				ctx.closePath();
			}
			ctx.save();
			ctx.globalAlpha *= layerFill;
			// Fill area glow is largely hidden behind the stroke's glow but
			// costs a full shadowed pass over a large region — skip it for
			// both rigid and fluid layers.
			ctx.shadowBlur = 0;
			ctx.fill(rigidShape ? 'nonzero' : 'evenodd');
			ctx.restore();
		}

		ctx.restore();
		target.commit();
	}
}
