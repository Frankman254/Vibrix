import { getColor, createWaveGradient } from '../../color/spectrumColor';
import {
	normalizeAngle,
	getRadialBaseRadius
} from '../../geometry/radialGeometry';
import {
	addLedCellPath,
	computeClassicGlowBlur,
	createClassicCoreGlowRuns,
	createClassicGlowHaloRuns,
	createCrispFillRuns,
	drawClassicGlowHaloPass,
	quantizeGlowPhase,
	resolveBarGlowColors
} from '../linear/linearRenderer';
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
import { drawRadialRgbSplitPass } from '../../effects/rgbSplitPass';
import { drawPeakSparksPass } from '../../effects/peakSparksPass';
import {
	drawNeonCorePass,
	resolveNeonCoreStrokeStyle
} from '../../effects/neonCorePass';
import { resolveGradientFlowPhase } from '../../effects/gradientFlow';
import type {
	SpectrumScope,
	SpectrumSettings
} from '../../runtime/spectrumRuntime';

export type RadialWaveFrameContext = {
	audioEnergy?: number;
	dt?: number;
	/** Scope whose gradient-flow phase this draw advances. Defaults to live. */
	scope?: SpectrumScope;
};

export function drawPeakMarker(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number
) {
	ctx.fillStyle = '#ffffff';
	ctx.shadowBlur = 0;
	ctx.fillRect(x, y, width, height);
}

export function drawRadialBars(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	heights: Float32Array,
	peaks: Float32Array,
	barCount: number,
	settings: SpectrumSettings,
	rotationOffset: number,
	radialAngle: number
) {
	const {
		spectrumBarWidth,
		spectrumMinHeight,
		spectrumPeakHold,
		spectrumInnerRadius
	} = settings;
	const safeRadius = resolveLogoSafeRadius(
		settings,
		spectrumViewportFrom(ctx, cx, cy)
	);
	const sharpness = resolveRadialSharpness(settings);
	const glowBlur = computeClassicGlowBlur(settings, barCount);

	const barAngle = (i: number) =>
		(i / barCount) * Math.PI * 2 + rotationOffset - Math.PI / 2;
	const barBaseRadius = (angle: number) =>
		getRadialBaseRadius(
			settings.spectrumRadialShape,
			spectrumInnerRadius,
			angle,
			radialAngle,
			safeRadius,
			sharpness
		);
	const barColorPhase = (angle: number) =>
		normalizeAngle(angle + radialAngle + Math.PI / 2) / (Math.PI * 2);

	// One geometry for all three passes: `expansion = 0` reproduces the core bar exactly; the path bakes the CTM per rect so all bars share one fill.
	const addBarPath = (index: number, expansion: number) => {
		const angle = barAngle(index);
		ctx.save();
		const baseRadius = barBaseRadius(angle);
		ctx.translate(
			cx + Math.cos(angle) * baseRadius,
			cy + Math.sin(angle) * baseRadius
		);
		ctx.rotate(angle);
		ctx.rect(
			0,
			-(spectrumBarWidth + expansion) / 2,
			heights[index] + expansion,
			spectrumBarWidth + expansion
		);
		ctx.restore();
	};
	const glowColorAt = (index: number) =>
		resolveManualGlow(
			settings,
			quantizeGlowPhase(index / barCount),
			getColor(
				settings,
				quantizeGlowPhase(barColorPhase(barAngle(index)))
			)
		);

	// Pass 1 — halos, batched into one blurred fill per colour run.
	const halo = createClassicGlowHaloRuns(ctx, settings, barCount);
	for (let i = 0; i < barCount; i++) {
		halo.add(glowColorAt(i).halo, expansion => addBarPath(i, expansion));
	}
	halo.flush();

	// Pass 2 — core glow, batched by quantized colour.
	const coreGlow = createClassicCoreGlowRuns(ctx, glowBlur);
	for (let i = 0; i < barCount; i++) {
		coreGlow.add(glowColorAt(i).core, () => addBarPath(i, 0));
	}
	coreGlow.flush();

	// Pass 3 — crisp fills and peak markers, exact colour, no shadow.
	ctx.shadowBlur = 0;
	ctx.shadowColor = 'rgba(0,0,0,0)';
	const fills = createCrispFillRuns(ctx);
	for (let i = 0; i < barCount; i++) {
		const angle = barAngle(i);
		fills.add(getColor(settings, barColorPhase(angle)), () =>
			addBarPath(i, 0)
		);
	}
	fills.flush();

	for (let i = 0; i < barCount; i++) {
		if (!spectrumPeakHold || peaks[i] <= spectrumMinHeight + 1) continue;
		const angle = barAngle(i);
		const t = i / barCount;
		const color = getColor(settings, barColorPhase(angle));
		ctx.save();
		const baseRadius = barBaseRadius(angle);
		ctx.translate(
			cx + Math.cos(angle) * baseRadius,
			cy + Math.sin(angle) * baseRadius
		);
		ctx.rotate(angle);
		ctx.fillStyle = resolveManualGlow(settings, t, color).peak ?? '#ffffff';
		ctx.fillRect(peaks[i], -spectrumBarWidth / 2, 2, spectrumBarWidth);
		ctx.restore();
	}
}

export function drawRadialBlocks(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	heights: Float32Array,
	barCount: number,
	settings: SpectrumSettings,
	rotationOffset: number,
	radialAngle: number
) {
	const { spectrumBarWidth, spectrumInnerRadius } = settings;
	const baseSegmentLength = Math.max(10, spectrumBarWidth * 3.6);
	const baseSegmentGap = Math.max(2, spectrumBarWidth * 0.75);
	const maxSegmentsPerBar = barCount > 180 ? 4 : barCount > 120 ? 5 : 6;
	const shadowBlur = computeClassicGlowBlur(settings, barCount, {
		lowDensityCap: 10,
		highDensityCap: 6
	});
	const safeRadius = resolveLogoSafeRadius(
		settings,
		spectrumViewportFrom(ctx, cx, cy)
	);
	const sharpness = resolveRadialSharpness(settings);

	const barAngle = (i: number) =>
		(i / barCount) * Math.PI * 2 + rotationOffset - Math.PI / 2;
	const barBaseRadius = (angle: number) =>
		getRadialBaseRadius(
			settings.spectrumRadialShape,
			spectrumInnerRadius,
			angle,
			radialAngle,
			safeRadius,
			sharpness
		);
	const barColorPhase = (angle: number) =>
		normalizeAngle(angle + radialAngle + Math.PI / 2) / (Math.PI * 2);
	/** Segment layout for one bar — identical in both passes. */
	const barSegments = (h: number) => {
		const estimatedSegments = Math.max(
			1,
			Math.round(
				(h + baseSegmentGap) / (baseSegmentLength + baseSegmentGap)
			)
		);
		const segments = Math.min(maxSegmentsPerBar, estimatedSegments);
		const segmentGap = Math.min(baseSegmentGap, h * 0.18);
		const segmentLength = Math.max(
			baseSegmentLength,
			(h - Math.max(0, segments - 1) * segmentGap) / segments
		);
		return { segments, segmentGap, segmentLength };
	};

	// One geometry for all three passes: `expansion = 0` reproduces the core segments exactly; segments never overlap, so one path + one fill is pixel-identical.
	const addBarPath = (index: number, expansion: number) => {
		const angle = barAngle(index);
		const h = heights[index];
		const { segments, segmentGap, segmentLength } = barSegments(h);
		ctx.save();
		const baseRadius = barBaseRadius(angle);
		ctx.translate(
			cx + Math.cos(angle) * baseRadius,
			cy + Math.sin(angle) * baseRadius
		);
		ctx.rotate(angle);
		for (let segment = 0; segment < segments; segment++) {
			const offset = segment * (segmentLength + segmentGap);
			if (offset > h) break;
			ctx.rect(
				offset,
				-(spectrumBarWidth + expansion) / 2,
				Math.min(segmentLength, h - offset) + expansion * 0.35,
				spectrumBarWidth + expansion
			);
		}
		ctx.restore();
	};
	const glowColorAt = (index: number) =>
		resolveBarGlowColors(
			settings,
			quantizeGlowPhase(barColorPhase(barAngle(index)))
		);

	// Pass 1 — halos, batched into one blurred fill per colour run.
	const halo = createClassicGlowHaloRuns(ctx, settings, barCount);
	for (let i = 0; i < barCount; i++) {
		halo.add(glowColorAt(i).halo, expansion => addBarPath(i, expansion));
	}
	halo.flush();

	// Pass 2 — core glow, batched by quantized colour.
	const coreGlow = createClassicCoreGlowRuns(ctx, shadowBlur);
	for (let i = 0; i < barCount; i++) {
		coreGlow.add(glowColorAt(i).core, () => addBarPath(i, 0));
	}
	coreGlow.flush();

	// Pass 3 — crisp fills, each bar keeping its exact colour, no shadow.
	ctx.shadowBlur = 0;
	ctx.shadowColor = 'rgba(0,0,0,0)';
	const fills = createCrispFillRuns(ctx);
	for (let i = 0; i < barCount; i++) {
		fills.add(getColor(settings, barColorPhase(barAngle(i))), () =>
			addBarPath(i, 0)
		);
	}
	fills.flush();
}

export function drawRadialPixel(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	heights: Float32Array,
	barCount: number,
	settings: SpectrumSettings,
	rotationOffset: number,
	radialAngle: number
) {
	const safeRadius = resolveLogoSafeRadius(
		settings,
		spectrumViewportFrom(ctx, cx, cy)
	);
	const sharpness = resolveRadialSharpness(settings);
	const cellSize = Math.max(
		2,
		settings.spectrumBarWidth *
			Math.max(0.35, Math.min(4, settings.spectrumLedCellSize ?? 1))
	);
	const cellGap = Math.max(
		0,
		cellSize * Math.max(0, Math.min(2, settings.spectrumLedCellGap ?? 0.28))
	);
	const cellPitch = Math.max(1, cellSize + cellGap);
	const maxCells = barCount > 180 ? 20 : barCount > 120 ? 28 : 40;
	const glowBlur = computeClassicGlowBlur(settings, barCount, {
		lowDensityCap: 12,
		highDensityCap: 8
	});
	const ledAngle = ((settings.spectrumLedAngle ?? 0) * Math.PI) / 180;

	const barGeometry = (i: number) => {
		const angle =
			(i / barCount) * Math.PI * 2 + rotationOffset - Math.PI / 2;
		return {
			angle,
			baseRadius: getRadialBaseRadius(
				settings.spectrumRadialShape,
				settings.spectrumInnerRadius,
				angle,
				radialAngle,
				safeRadius,
				sharpness
			),
			litCells: Math.min(maxCells, Math.floor(heights[i] / cellPitch)),
			cellRotation: angle + ledAngle
		};
	};
	/** Adds one bar's lit column to the current path. Does not fill. */
	const addColumnPath = (
		angle: number,
		baseRadius: number,
		litCells: number,
		cellRotation: number,
		size: number
	) => {
		for (let cell = 0; cell < litCells; cell++) {
			const radius = baseRadius + cellSize / 2 + cell * cellPitch;
			addLedCellPath(
				ctx,
				settings.spectrumLedShape,
				cx + Math.cos(angle) * radius,
				cy + Math.sin(angle) * radius,
				size,
				cellRotation
			);
		}
	};

	/**
	 * BLURRED-pass glow shape only: when the blur far exceeds the cell gap (`6x`,
	 * where glow has merged anyway) one rotated column rect replaces the cells.
	 * SHADOW-ONLY: built off-canvas, shadow offset back, so the fill never lands.
	 */
	const glowUsesColumnHull = glowBlur >= cellGap * 6;
	const HULL_SHADOW_OFFSET = 1e5;
	const addHullPath = (
		angle: number,
		baseRadius: number,
		litCells: number
	) => {
		const span = (litCells - 1) * cellPitch + cellSize;
		const midRadius = baseRadius + span / 2;
		ctx.save();
		ctx.translate(
			cx + Math.cos(angle) * midRadius - HULL_SHADOW_OFFSET,
			cy + Math.sin(angle) * midRadius
		);
		ctx.rotate(angle);
		ctx.rect(-span / 2, -cellSize / 2, span, cellSize);
		ctx.restore();
	};

	if (!glowUsesColumnHull) {
		// Original single pass: bars sharing a fill AND a glow colour merge into
		// one shadowed fill; splitting only pays off when the hull can shrink the
		// blurred geometry.
		let runColor: string | null = null;
		let runGlow: string | null = null;
		let runOpen = false;
		const flushRun = () => {
			if (!runOpen) return;
			runOpen = false;
			ctx.fillStyle = runColor as string;
			ctx.shadowColor = runGlow as string;
			ctx.shadowBlur = glowBlur;
			ctx.fill();
		};
		for (let i = 0; i < barCount; i++) {
			const { angle, baseRadius, litCells, cellRotation } =
				barGeometry(i);
			if (litCells <= 0) continue;
			const color = getColor(
				settings,
				normalizeAngle(angle + radialAngle + Math.PI / 2) /
					(Math.PI * 2)
			);
			// `color` stays the fallback: with manual glow OFF the glow is
			// byte-for-byte the fill colour, so runs merge maximally.
			const glow = resolveManualGlow(
				settings,
				quantizeGlowPhase(i / barCount),
				color
			).core;
			if (!runOpen || color !== runColor || glow !== runGlow) {
				flushRun();
				ctx.beginPath();
				runColor = color;
				runGlow = glow;
				runOpen = true;
			}
			addColumnPath(angle, baseRadius, litCells, cellRotation, cellSize);
		}
		flushRun();
	} else {
		ctx.shadowOffsetX = HULL_SHADOW_OFFSET;
		const coreGlow = createClassicCoreGlowRuns(ctx, glowBlur);
		for (let i = 0; i < barCount; i++) {
			const { angle, baseRadius, litCells } = barGeometry(i);
			if (litCells <= 0) continue;
			const color = getColor(
				settings,
				quantizeGlowPhase(
					normalizeAngle(angle + radialAngle + Math.PI / 2) /
						(Math.PI * 2)
				)
			);
			const glow = resolveManualGlow(
				settings,
				quantizeGlowPhase(i / barCount),
				color
			).core;
			coreGlow.add(glow, () => addHullPath(angle, baseRadius, litCells));
		}
		coreGlow.flush();
		ctx.shadowOffsetX = 0;

		ctx.shadowBlur = 0;
		ctx.shadowColor = 'rgba(0,0,0,0)';
		const fills = createCrispFillRuns(ctx);
		for (let i = 0; i < barCount; i++) {
			const { angle, baseRadius, litCells, cellRotation } =
				barGeometry(i);
			if (litCells <= 0) continue;
			const color = getColor(
				settings,
				normalizeAngle(angle + radialAngle + Math.PI / 2) /
					(Math.PI * 2)
			);
			fills.add(color, () =>
				addColumnPath(
					angle,
					baseRadius,
					litCells,
					cellRotation,
					cellSize
				)
			);
		}
		fills.flush();
	}

	// The core colour does not vary per bar: one unshadowed fill for all cores.
	if (settings.spectrumNeonCore) {
		const coreSize =
			cellSize *
			Math.max(0.15, Math.min(0.8, settings.spectrumNeonCoreWidth));
		ctx.save();
		ctx.fillStyle = resolveNeonCoreStrokeStyle(
			settings,
			settings.spectrumNeonCoreIntensity
		);
		ctx.shadowBlur = 0;
		ctx.globalAlpha *=
			0.55 + Math.max(0, settings.spectrumNeonCoreIntensity) * 0.25;
		ctx.beginPath();
		let anyCore = false;
		for (let i = 0; i < barCount; i++) {
			const { angle, baseRadius, litCells, cellRotation } =
				barGeometry(i);
			if (litCells <= 0) continue;
			anyCore = true;
			addColumnPath(angle, baseRadius, litCells, cellRotation, coreSize);
		}
		if (anyCore) ctx.fill();
		ctx.restore();
	}

	// Peak markers: one blurred fill for the whole spectrum, not one per bar.
	if (
		settings.spectrumManualGlow &&
		settings.spectrumManualGlowMode === 'peaks'
	) {
		let peakRunColor: string | null = null;
		let peakRunGlow: string | null = null;
		let peakRunOpen = false;
		const flushPeakRun = () => {
			if (!peakRunOpen) return;
			peakRunOpen = false;
			ctx.fillStyle = peakRunColor as string;
			ctx.shadowColor = peakRunGlow as string;
			ctx.shadowBlur = glowBlur;
			ctx.fill();
		};
		for (let i = 0; i < barCount; i++) {
			const { angle, baseRadius, litCells, cellRotation } =
				barGeometry(i);
			if (litCells <= 0) continue;
			const glow = resolveManualGlow(
				settings,
				quantizeGlowPhase(i / barCount),
				getColor(
					settings,
					normalizeAngle(angle + radialAngle + Math.PI / 2) /
						(Math.PI * 2)
				)
			);
			const fill = glow.peak ?? glow.halo;
			if (
				!peakRunOpen ||
				fill !== peakRunColor ||
				glow.halo !== peakRunGlow
			) {
				flushPeakRun();
				ctx.beginPath();
				peakRunColor = fill;
				peakRunGlow = glow.halo;
				peakRunOpen = true;
			}
			const radius = baseRadius + Math.max(0, litCells - 1) * cellPitch;
			addLedCellPath(
				ctx,
				settings.spectrumLedShape,
				cx + Math.cos(angle) * radius,
				cy + Math.sin(angle) * radius,
				cellSize,
				cellRotation
			);
		}
		flushPeakRun();
	}

	drawPeakSparksPass(ctx, heights, barCount, settings, (index, size) => {
		const t = index / barCount;
		const angle = t * Math.PI * 2 + rotationOffset - Math.PI / 2;
		const baseRadius = getRadialBaseRadius(
			settings.spectrumRadialShape,
			settings.spectrumInnerRadius,
			angle,
			radialAngle,
			safeRadius,
			sharpness
		);
		const radius = baseRadius + heights[index];
		ctx.beginPath();
		ctx.arc(
			cx + Math.cos(angle) * radius,
			cy + Math.sin(angle) * radius,
			size * 0.45,
			0,
			Math.PI * 2
		);
		ctx.fill();
	});
}

export function drawRadialWave(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	cx: number,
	cy: number,
	heights: Float32Array,
	barCount: number,
	settings: SpectrumSettings,
	rotationOffset: number,
	radialAngle: number,
	frame: RadialWaveFrameContext = {}
) {
	const { audioEnergy = 0, dt = 1 / 60, scope } = frame;
	const gradientPhase = resolveGradientFlowPhase(
		settings,
		audioEnergy,
		dt,
		scope
	);
	const gradient = createWaveGradient(
		ctx,
		canvas,
		settings,
		'radial',
		cx,
		cy,
		settings.spectrumInnerRadius + settings.spectrumMaxHeight,
		rotationOffset + radialAngle,
		gradientPhase
	);
	const safeRadius = resolveLogoSafeRadius(
		settings,
		spectrumViewportFrom(ctx, cx, cy)
	);
	const sharpness = resolveRadialSharpness(settings);
	const referencePx = Math.min(canvas.width, canvas.height);

	const traceRadialWave = (radiusOffset: number) => {
		ctx.beginPath();
		for (let i = 0; i <= barCount; i++) {
			const t = (i % barCount) / barCount;
			const angle = t * Math.PI * 2 + rotationOffset - Math.PI / 2;
			const baseRadius = getRadialBaseRadius(
				settings.spectrumRadialShape,
				settings.spectrumInnerRadius,
				angle,
				radialAngle,
				safeRadius,
				sharpness
			);
			const radius = baseRadius + heights[i % barCount] + radiusOffset;
			const x = cx + Math.cos(angle) * radius;
			const y = cy + Math.sin(angle) * radius;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.closePath();
	};

	traceRadialWave(0);
	ctx.fillStyle = gradient;
	ctx.save();
	ctx.globalAlpha *= settings.spectrumWaveFillOpacity;
	ctx.fill();
	ctx.restore();

	traceRadialWave(0);
	const waveGlow = resolveManualGlow(
		settings,
		0.5,
		settings.spectrumPrimaryColor
	);

	// A sweeping glow paints the halo with a conic gradient so the first colour
	// runs into the second along the whole contour.
	const waveGlowSweep = glowUsesColorSweep(settings)
		? createGlowGradient(
				ctx,
				canvas,
				settings,
				'radial',
				cx,
				cy,
				settings.spectrumInnerRadius + settings.spectrumMaxHeight,
				rotationOffset + radialAngle
			)
		: null;

	drawClassicGlowHaloPass(
		ctx,
		waveGlow.halo,
		settings,
		barCount,
		expansion => {
			traceRadialWave(0);
			ctx.lineWidth = settings.spectrumBarWidth + expansion * 1.2;
			ctx.stroke();
		},
		{
			alphaBoost: 0.22,
			expansionMultiplier: 1.25,
			sweepStyle: waveGlowSweep
		}
	);

	drawRadialRgbSplitPass(
		ctx,
		settings,
		referencePx,
		barCount,
		settings.spectrumBarWidth,
		traceRadialWave
	);

	traceRadialWave(0);
	ctx.strokeStyle = gradient;
	ctx.lineWidth = settings.spectrumBarWidth;
	ctx.shadowColor = waveGlow.core;
	ctx.shadowBlur = computeClassicGlowBlur(settings, barCount);
	ctx.save();
	ctx.stroke();
	ctx.restore();
	ctx.shadowBlur = 0;
	ctx.shadowColor = 'transparent';

	if (settings.spectrumNeonCore) {
		traceRadialWave(0);
		drawNeonCorePass(
			ctx,
			settings.spectrumBarWidth,
			settings.spectrumNeonCoreIntensity,
			settings.spectrumNeonCoreWidth,
			resolveNeonCoreStrokeStyle(
				settings,
				settings.spectrumNeonCoreIntensity
			)
		);
	}

	drawPeakSparksPass(ctx, heights, barCount, settings, (index, size) => {
		const t = index / barCount;
		const angle = t * Math.PI * 2 + rotationOffset - Math.PI / 2;
		const baseRadius = getRadialBaseRadius(
			settings.spectrumRadialShape,
			settings.spectrumInnerRadius,
			angle,
			radialAngle,
			safeRadius,
			sharpness
		);
		const radius = baseRadius + heights[index];
		const x = cx + Math.cos(angle) * radius;
		const y = cy + Math.sin(angle) * radius;
		ctx.beginPath();
		ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
		ctx.fill();
	});
}

export function drawRadialDots(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	heights: Float32Array,
	barCount: number,
	settings: SpectrumSettings,
	rotationOffset: number,
	radialAngle: number
) {
	const dotRadius = Math.max(settings.spectrumBarWidth * 0.8, 1.5);
	const safeRadius = resolveLogoSafeRadius(
		settings,
		spectrumViewportFrom(ctx, cx, cy)
	);
	const sharpness = resolveRadialSharpness(settings);
	const glowBlur = computeClassicGlowBlur(settings, barCount);

	const barAngle = (i: number) =>
		(i / barCount) * Math.PI * 2 + rotationOffset - Math.PI / 2;
	const dotCenter = (i: number, angle: number) => {
		const baseRadius = getRadialBaseRadius(
			settings.spectrumRadialShape,
			settings.spectrumInnerRadius,
			angle,
			radialAngle,
			safeRadius,
			sharpness
		);
		const radius = baseRadius + heights[i];
		return {
			x: cx + Math.cos(angle) * radius,
			y: cy + Math.sin(angle) * radius
		};
	};
	const barColorPhase = (angle: number) =>
		normalizeAngle(angle + radialAngle + Math.PI / 2) / (Math.PI * 2);

	// One geometry for all three passes: `expansion = 0` reproduces the core dot exactly.
	const addDotPath = (index: number, expansion: number) => {
		const angle = barAngle(index);
		const { x, y } = dotCenter(index, angle);
		const r = dotRadius + expansion * 0.45;
		// Each arc needs its own `moveTo` or it joins the previous dot with a stray line.
		ctx.moveTo(x + r, y);
		ctx.arc(x, y, r, 0, Math.PI * 2);
	};
	const glowColorAt = (index: number) =>
		resolveBarGlowColors(
			settings,
			quantizeGlowPhase(barColorPhase(barAngle(index)))
		);

	// Pass 1 — halos, batched into one blurred fill per colour run.
	const halo = createClassicGlowHaloRuns(ctx, settings, barCount);
	for (let i = 0; i < barCount; i++) {
		halo.add(glowColorAt(i).halo, expansion => addDotPath(i, expansion));
	}
	halo.flush();

	// Pass 2 — core glow, batched by quantized colour.
	const coreGlow = createClassicCoreGlowRuns(ctx, glowBlur);
	for (let i = 0; i < barCount; i++) {
		coreGlow.add(glowColorAt(i).core, () => addDotPath(i, 0));
	}
	coreGlow.flush();

	// Pass 3 — crisp fills, each dot keeping its exact colour, no shadow.
	ctx.shadowBlur = 0;
	ctx.shadowColor = 'rgba(0,0,0,0)';
	const fills = createCrispFillRuns(ctx);
	for (let i = 0; i < barCount; i++) {
		fills.add(getColor(settings, barColorPhase(barAngle(i))), () =>
			addDotPath(i, 0)
		);
	}
	fills.flush();
}
