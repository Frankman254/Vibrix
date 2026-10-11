import { SPECTRUM_RANGES, type SliderRange } from '@/config/ranges';
import { clamp } from '@/lib/math';
import type {
	ResolvedAudioReactiveChannel,
	SpectrumProfileSettings
} from '@/types/wallpaper';
import { RADIAL_SHAPE_IDS } from '../geometry/radialGeometry';
import {
	DEFAULT_SHOCKWAVE_BAND_THRESHOLDS,
	SHOCKWAVE_THRESHOLD_CHANNELS
} from './shockwaveCalibration';

/**
 * Retired radial shapes and what they become.
 *
 * All six went in v106 for the same underlying reason: a polar radius r(θ) can
 * only describe shapes that are star-shaped around their centre, and each of
 * these needs something it cannot express — a true cusp (`cardioid`, `drop`,
 * `heart`, `shield`) or a concave bite the ray crosses twice (`moon`, `wings`).
 * Every version of them was either a blob wearing the wrong name or a silhouette
 * that broke as soon as "fit around logo" scaled it. They map to the nearest
 * honest shape so saved presets still open with something sensible.
 */
const RETIRED_RADIAL_SHAPES: Readonly<Record<string, string>> = Object.freeze({
	cardioid: 'oval',
	drop: 'oval',
	heart: 'oval',
	shield: 'oval',
	moon: 'oval',
	wings: 'lens'
});

function clampToRange(value: number, range: SliderRange): number {
	return clamp(value, range.min, range.max);
}

function snapToRange(value: number, range: SliderRange): number {
	const clamped = clampToRange(value, range);
	if (range.step <= 0) return clamped;
	const stepped =
		Math.round((clamped - range.min) / range.step) * range.step + range.min;
	return Number(stepped.toFixed(6));
}

function normalizeShockwaveBandThresholds(
	value:
		| SpectrumProfileSettings['spectrumShockwaveBandThresholds']
		| undefined
): Record<ResolvedAudioReactiveChannel, number> {
	const next = { ...DEFAULT_SHOCKWAVE_BAND_THRESHOLDS };
	for (const channel of SHOCKWAVE_THRESHOLD_CHANNELS) {
		const candidate = value?.[channel];
		if (typeof candidate === 'number' && Number.isFinite(candidate)) {
			next[channel] = snapToRange(
				candidate,
				SPECTRUM_RANGES.shockwaveBandThreshold
			);
		}
	}
	return next;
}

export function normalizeSpectrumSettings<
	T extends Partial<SpectrumProfileSettings>
>(values: T): T {
	const next = { ...values };
	if (next.spectrumShockwaveBandThresholds) {
		next.spectrumShockwaveBandThresholds = normalizeShockwaveBandThresholds(
			next.spectrumShockwaveBandThresholds
		) as T['spectrumShockwaveBandThresholds'];
	}

	const normalize = <K extends keyof SpectrumProfileSettings>(
		key: K,
		range: SliderRange,
		options?: {
			snap?: boolean;
		}
	) => {
		const current = next[key];
		// A non-finite value reaching a slider renders a broken control, and a
		// NaN survives JSON as `null`. Corrupted or hand-edited saves are the
		// realistic source, so fall back to the range floor instead of leaving
		// the garbage in place.
		if (typeof current !== 'number' || !Number.isFinite(current)) {
			if (current !== undefined) {
				next[key] = range.min as T[K];
			}
			return;
		}
		next[key] = (
			options?.snap === false
				? clampToRange(current, range)
				: snapToRange(current, range)
		) as T[K];
	};

	normalize('spectrumBarCount', SPECTRUM_RANGES.barCount);
	normalize('spectrumBarWidth', SPECTRUM_RANGES.barWidth, { snap: false });
	normalize('spectrumMinHeight', SPECTRUM_RANGES.minHeight, { snap: false });
	normalize('spectrumMaxHeight', SPECTRUM_RANGES.maxHeight, { snap: false });
	normalize('spectrumScale', SPECTRUM_RANGES.scale, { snap: false });
	normalize('spectrumWaveFillOpacity', SPECTRUM_RANGES.waveFillOpacity, {
		snap: false
	});
	normalize('spectrumInnerRadius', SPECTRUM_RANGES.innerRadius, {
		snap: false
	});
	normalize('spectrumRadialAngle', SPECTRUM_RANGES.radialAngle, {
		snap: false
	});
	normalize('spectrumRadialSharpness', SPECTRUM_RANGES.radialSharpness, {
		snap: false
	});
	// Every spectrum settings bag (root state, each instance, each profile slot)
	// funnels through here, so resolving retired shape ids in one place is what
	// keeps a stale `cardioid` from surviving anywhere in a saved project.
	if (typeof next.spectrumRadialShape === 'string') {
		const shape = next.spectrumRadialShape as string;
		if (!(RADIAL_SHAPE_IDS as readonly string[]).includes(shape)) {
			next.spectrumRadialShape = (RETIRED_RADIAL_SHAPES[shape] ??
				'circle') as T['spectrumRadialShape'];
		}
	}
	normalize('spectrumRotationSpeed', SPECTRUM_RANGES.rotationSpeed, {
		snap: false
	});
	if (typeof next.spectrumRotationSpeed === 'number') {
		next.spectrumRotationSpeed = Math.abs(
			next.spectrumRotationSpeed
		) as T['spectrumRotationSpeed'];
	}
	if (typeof next.spectrumRotationAudioAmount === 'number') {
		next.spectrumRotationAudioAmount = clamp(
			next.spectrumRotationAudioAmount,
			0,
			4
		) as T['spectrumRotationAudioAmount'];
	}
	if (typeof next.spectrumRotationSmoothing === 'number') {
		next.spectrumRotationSmoothing = clamp(
			next.spectrumRotationSmoothing,
			0,
			0.98
		) as T['spectrumRotationSmoothing'];
	}
	if (typeof next.spectrumRotationInvertThreshold === 'number') {
		next.spectrumRotationInvertThreshold = clamp(
			next.spectrumRotationInvertThreshold,
			SPECTRUM_RANGES.rotationInvertThreshold.min,
			SPECTRUM_RANGES.rotationInvertThreshold.max
		) as T['spectrumRotationInvertThreshold'];
	}
	if (typeof next.spectrumRotationInvertHoldMs === 'number') {
		next.spectrumRotationInvertHoldMs = clamp(
			next.spectrumRotationInvertHoldMs,
			SPECTRUM_RANGES.rotationInvertHoldMs.min,
			SPECTRUM_RANGES.rotationInvertHoldMs.max
		) as T['spectrumRotationInvertHoldMs'];
	}
	normalize('spectrumFigureRotationSpeed', SPECTRUM_RANGES.rotationSpeed, {
		snap: false
	});
	normalize('spectrumSmoothing', SPECTRUM_RANGES.smoothing, { snap: false });
	normalize('spectrumOpacity', SPECTRUM_RANGES.opacity, { snap: false });
	normalize('spectrumGlowIntensity', SPECTRUM_RANGES.glowIntensity, {
		snap: false
	});
	normalize('spectrumGlowReach', SPECTRUM_RANGES.glowReach, {
		snap: false
	});
	normalize('spectrumGlowAudioAmount', SPECTRUM_RANGES.glowAudioAmount, {
		snap: false
	});
	normalize('spectrumShadowBlur', SPECTRUM_RANGES.shadowBlur, {
		snap: false
	});
	normalize('spectrumPeakDecay', SPECTRUM_RANGES.peakDecay, { snap: false });
	normalize('spectrumPositionX', SPECTRUM_RANGES.positionX, {
		snap: false
	});
	normalize('spectrumPositionY', SPECTRUM_RANGES.positionY, {
		snap: false
	});
	normalize('spectrumLogoGap', SPECTRUM_RANGES.logoGap, { snap: false });
	normalize('spectrumSpan', SPECTRUM_RANGES.span, { snap: false });
	normalize('spectrumAfterglow', SPECTRUM_RANGES.afterglow, { snap: false });
	normalize('spectrumMotionTrails', SPECTRUM_RANGES.motionTrails, {
		snap: false
	});
	normalize('spectrumGhostFrames', SPECTRUM_RANGES.ghostFrames, {
		snap: false
	});
	normalize('spectrumPeakRibbons', SPECTRUM_RANGES.peakRibbons, {
		snap: false
	});
	normalize('spectrumBassShockwave', SPECTRUM_RANGES.bassShockwave, {
		snap: false
	});
	normalize(
		'spectrumShockwaveThickness',
		SPECTRUM_RANGES.shockwaveThickness,
		{
			snap: false
		}
	);
	normalize('spectrumShockwaveOpacity', SPECTRUM_RANGES.shockwaveOpacity, {
		snap: false
	});
	normalize('spectrumShockwaveBlur', SPECTRUM_RANGES.shockwaveBlur, {
		snap: false
	});
	normalize('spectrumEnergyBloom', SPECTRUM_RANGES.energyBloom, {
		snap: false
	});
	normalize('spectrumPeakRibbonAngle', SPECTRUM_RANGES.peakRibbonAngle, {
		snap: false
	});
	normalize('spectrumTunnelRingCount', SPECTRUM_RANGES.tunnelRingCount);
	normalize('spectrumTunnelDepthFalloff', SPECTRUM_RANGES.tunnelDepthFalloff);
	normalize('spectrumTunnelRingSpacing', SPECTRUM_RANGES.tunnelRingSpacing);
	normalize('spectrumTunnelWallOpacity', SPECTRUM_RANGES.tunnelWallOpacity);
	normalize(
		'spectrumTunnelPulseStrength',
		SPECTRUM_RANGES.tunnelPulseStrength
	);
	normalize(
		'spectrumLiquidLayer1Opacity',
		SPECTRUM_RANGES.liquidLayerOpacity
	);
	normalize(
		'spectrumLiquidLayer2Opacity',
		SPECTRUM_RANGES.liquidLayerOpacity
	);
	normalize(
		'spectrumLiquidLayer3Opacity',
		SPECTRUM_RANGES.liquidLayerOpacity
	);
	normalize('spectrumLiquidLayer1Amp', SPECTRUM_RANGES.liquidLayerAmp);
	normalize('spectrumLiquidLayer2Amp', SPECTRUM_RANGES.liquidLayerAmp);
	normalize('spectrumLiquidLayer3Amp', SPECTRUM_RANGES.liquidLayerAmp);
	normalize('spectrumLiquidLayer1Fill', SPECTRUM_RANGES.liquidLayerFill);
	normalize('spectrumLiquidLayer2Fill', SPECTRUM_RANGES.liquidLayerFill);
	normalize('spectrumLiquidLayer3Fill', SPECTRUM_RANGES.liquidLayerFill);
	normalize('spectrumLiquidLayer1Speed', SPECTRUM_RANGES.liquidLayerSpeed);
	normalize('spectrumLiquidLayer2Speed', SPECTRUM_RANGES.liquidLayerSpeed);
	normalize('spectrumLiquidLayer3Speed', SPECTRUM_RANGES.liquidLayerSpeed);
	normalize(
		'spectrumLiquidLayer1RotationSpeed',
		SPECTRUM_RANGES.rotationSpeed,
		{
			snap: false
		}
	);
	normalize(
		'spectrumLiquidLayer2RotationSpeed',
		SPECTRUM_RANGES.rotationSpeed,
		{
			snap: false
		}
	);
	normalize(
		'spectrumLiquidLayer3RotationSpeed',
		SPECTRUM_RANGES.rotationSpeed,
		{
			snap: false
		}
	);
	normalize('spectrumSpiralTurns', SPECTRUM_RANGES.spiralTurns);
	normalize('spectrumSpiralOuterRadius', SPECTRUM_RANGES.spiralOuterRadius, {
		snap: false
	});
	normalize('spectrumSpiralTightness', SPECTRUM_RANGES.spiralTightness, {
		snap: false
	});
	normalize('spectrumSpiralArms', SPECTRUM_RANGES.spiralArms);
	normalize('spectrumSpiralAudioTurns', SPECTRUM_RANGES.spiralAudioTurns, {
		snap: false
	});
	normalize('spectrumSpiralStrokeWidth', SPECTRUM_RANGES.spiralStrokeWidth, {
		snap: false
	});
	normalize('spectrumOscilloscopeLineWidth', SPECTRUM_RANGES.barWidth, {
		snap: false
	});
	normalize(
		'spectrumOscilloscopeScrollSpeed',
		SPECTRUM_RANGES.oscilloscopeScrollSpeed,
		{
			snap: false
		}
	);
	normalize(
		'spectrumOscilloscopePhosphorDecay',
		SPECTRUM_RANGES.oscilloscopePhosphorDecay,
		{
			snap: false
		}
	);
	normalize(
		'spectrumOscilloscopeGridDivisions',
		SPECTRUM_RANGES.oscilloscopeGridDivisions
	);

	if (
		typeof next.spectrumMinHeight === 'number' &&
		typeof next.spectrumMaxHeight === 'number' &&
		next.spectrumMaxHeight < next.spectrumMinHeight
	) {
		next.spectrumMaxHeight =
			next.spectrumMinHeight as T['spectrumMaxHeight'];
	}

	// Extra instances share the main key names, so each one re-enters this
	// same normalizer (instances carry no nested spectrumInstances).
	if (Array.isArray(next.spectrumInstances)) {
		next.spectrumInstances = next.spectrumInstances.map(instance =>
			normalizeSpectrumSettings(instance)
		) as T['spectrumInstances'];
	}

	return next;
}
