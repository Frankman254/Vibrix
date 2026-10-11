/**
 * Deterministic expansion of a ~15-field `SceneIntent` into the feature-slot
 * values the store actually stores.
 *
 * This is the load-bearing half of the AI Director. The model contributes
 * taste; this file contributes correctness. Consequences of that split:
 *
 *  - Testable with no API call, because it is a pure function.
 *  - Safe, because every number is snapped through `src/config/ranges.ts` and
 *    every enum comes from a validated `SceneIntent` — a model can never place
 *    an unknown key or an out-of-range float into persisted state.
 *  - Re-runnable: improving the mapping and bumping `COMPILER_VERSION`
 *    regenerates every scene in the pool without re-asking the model.
 *
 * Output is a PARTIAL per family — a delta from the factory defaults, not a
 * full config. Callers merge it over `extract*ProfileSettings(DEFAULT_STATE)`.
 * Emitting only what the intent actually implies keeps the mapping readable
 * and leaves every untouched knob at its audited default.
 */
import { PARTICLE_RANGES, RAIN_RANGES, SPECTRUM_RANGES } from '@/config/ranges';
import { snapToRange } from '@/lib/randomize';
import type { SliderRange } from '@/config/ranges';
import type {
	CameraFxProfileSettings,
	LightsProfileSettings,
	LooksProfileSettings,
	ParticlesProfileSettings,
	RainProfileSettings
} from '@/store/featureProfiles';
import type {
	ParticleShape,
	SpectrumInstanceSettings
} from '@/types/wallpaper';
import { makeReadable } from './colorMath';
import type { SceneIntent } from './sceneIntent';

/** Bump when any mapping below changes. Cached/stored scenes can then be
 *  recompiled from their stored intent without another model call. */
export const COMPILER_VERSION = 1;

export type CompiledScene = {
	spectrum: Partial<SpectrumInstanceSettings>;
	particles: Partial<ParticlesProfileSettings>;
	rain: Partial<RainProfileSettings>;
	looks: Partial<LooksProfileSettings>;
	lights: Partial<LightsProfileSettings>;
	cameraFx: Partial<CameraFxProfileSettings>;
	compilerVersion: number;
};

/** Linear interpolation, `t` assumed 0..1 (the intent scalars are clamped). */
function lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t;
}

/** Interpolate then snap to the slider's step/bounds. Every numeric emitted by
 *  this module goes through here — that is the whole out-of-range guarantee. */
function ramp(range: SliderRange, from: number, to: number, t: number): number {
	return snapToRange(lerp(from, to, t), range);
}

// ─── Spectrum ────────────────────────────────────────────────────────────────

function compileSpectrum(
	intent: SceneIntent
): Partial<SpectrumInstanceSettings> {
	const { energy, weight, motion } = intent;
	const primary = makeReadable(intent.palette.primary);
	const secondary = makeReadable(intent.palette.secondary);

	// Heavy looks want few, wide bars; light looks want many thin ones. Driving
	// both from `weight` keeps total ink roughly constant across the range.
	const barCount = ramp(SPECTRUM_RANGES.barCount, 160, 40, weight);
	const barWidth = ramp(SPECTRUM_RANGES.barWidth, 2.5, 11, weight);

	const isPixel = intent.spectrumShape === 'pixel';

	return {
		spectrumFamily: intent.spectrumFamily,
		spectrumMode: intent.spectrumMode,
		spectrumShape: intent.spectrumShape,

		spectrumPrimaryColor: primary,
		spectrumSecondaryColor: secondary,
		spectrumColorSource: 'manual',
		// A single flat colour reads as "calm"; a gradient adds motion even when
		// nothing is moving, so reserve it for the energetic half.
		spectrumColorMode: energy < 0.35 ? 'solid' : 'gradient',

		spectrumBarCount: barCount,
		spectrumBarWidth: barWidth,
		spectrumMaxHeight: ramp(SPECTRUM_RANGES.maxHeight, 140, 420, energy),
		spectrumMinHeight: ramp(SPECTRUM_RANGES.minHeight, 0, 8, weight),
		spectrumScale: ramp(SPECTRUM_RANGES.scale, 0.85, 1.25, weight),
		spectrumSpan: ramp(SPECTRUM_RANGES.span, 0.7, 1, weight),

		// Smoothing is the main "calm vs punchy" lever: a high value averages
		// away transients, a low one lets every hit through.
		spectrumSmoothing: ramp(SPECTRUM_RANGES.smoothing, 0.88, 0.45, energy),
		spectrumOpacity: ramp(SPECTRUM_RANGES.opacity, 0.85, 1, energy),

		spectrumGlowIntensity: ramp(
			SPECTRUM_RANGES.glowIntensity,
			0.2,
			1.6,
			energy
		),
		spectrumGlowReach: ramp(SPECTRUM_RANGES.glowReach, 1.1, 2.2, energy),
		// Shadow blur is the single most expensive spectrum knob (it is the
		// documented bottleneck), so it stays well under its 60 ceiling even at
		// full energy. Taste is not worth a frame-rate cliff.
		spectrumShadowBlur: ramp(SPECTRUM_RANGES.shadowBlur, 0, 26, energy),

		spectrumRotationSpeed: ramp(
			SPECTRUM_RANGES.rotationSpeed,
			0,
			0.6,
			motion
		),

		// Fast attack + short release = percussive. Slow both = breathing.
		spectrumEnvelopeAttack: ramp(
			{ min: 0, max: 1, step: 0.01 },
			0.75,
			0.3,
			energy
		),
		spectrumEnvelopeRelease: ramp(
			{ min: 0, max: 1, step: 0.01 },
			0.3,
			0.08,
			energy
		),

		// The 'pixel' shape is a grid of cells; pixelating the whole instance is
		// what makes it read as retro rather than as chunky bars.
		spectrumPixelate: isPixel,
		...(isPixel
			? {
					spectrumPixelateScale: ramp(
						SPECTRUM_RANGES.pixelateScale,
						3,
						8,
						weight
					)
				}
			: {})
	};
}

// ─── Particles ───────────────────────────────────────────────────────────────

type ParticlesPresetSpec = {
	shape: ParticleShape;
	count: [number, number];
	speed: [number, number];
	size: [number, number];
	lifetime: [number, number];
	opacity: number;
	glow: boolean;
};

/** Character per preset; `energy`/`motion` pick a point inside each span. */
const PARTICLES_PRESET_SPECS: Record<
	Exclude<SceneIntent['particles'], 'off'>,
	ParticlesPresetSpec
> = {
	dust: {
		shape: 'circles',
		count: [40, 90],
		speed: [0.2, 0.8],
		size: [1.5, 4],
		lifetime: [2.5, 4],
		opacity: 0.45,
		glow: false
	},
	embers: {
		shape: 'circles',
		count: [30, 80],
		speed: [0.4, 1.6],
		size: [2, 6],
		lifetime: [1.5, 3],
		opacity: 0.8,
		glow: true
	},
	snow: {
		shape: 'circles',
		count: [60, 140],
		speed: [0.3, 1],
		size: [2, 5],
		lifetime: [3, 4],
		opacity: 0.7,
		glow: false
	},
	sparks: {
		shape: 'stars',
		count: [25, 70],
		speed: [1, 3.5],
		size: [1.5, 4.5],
		lifetime: [0.5, 1.5],
		opacity: 0.95,
		glow: true
	}
};

function compileParticles(
	intent: SceneIntent
): Partial<ParticlesProfileSettings> {
	if (intent.particles === 'off') return { particlesEnabled: false };

	const spec = PARTICLES_PRESET_SPECS[intent.particles];
	const { energy, motion } = intent;
	const accent = makeReadable(intent.palette.accent);
	const sizeMin = ramp(
		PARTICLE_RANGES.sizeMin,
		spec.size[0],
		spec.size[1],
		energy
	);

	return {
		particlesEnabled: true,
		particleShape: spec.shape,
		particleColor1: accent,
		particleColor2: makeReadable(intent.palette.primary),
		particleColorSource: 'manual',
		particleColorMode: 'gradient',
		particleCount: ramp(
			PARTICLE_RANGES.count,
			spec.count[0],
			spec.count[1],
			energy
		),
		particleSpeed: ramp(
			PARTICLE_RANGES.speed,
			spec.speed[0],
			spec.speed[1],
			motion
		),
		particleSizeMin: sizeMin,
		// Keep max strictly above min so the size range never collapses to a
		// single value (which reads as a dead, uniform field).
		particleSizeMax: snapToRange(sizeMin * 2.2, PARTICLE_RANGES.sizeMax),
		particleLifetime: ramp(
			PARTICLE_RANGES.lifetime,
			spec.lifetime[0],
			spec.lifetime[1],
			1 - motion
		),
		particleOpacity: snapToRange(spec.opacity, PARTICLE_RANGES.opacity),
		particleGlow: spec.glow,
		particleGlowStrength: spec.glow
			? ramp(PARTICLE_RANGES.glowStrength, 0.3, 1.1, energy)
			: 0,
		particleAudioReactive: energy > 0.3,
		particleAudioSizeBoost: ramp(
			PARTICLE_RANGES.audioSizeBoost,
			0,
			3.5,
			energy
		)
	};
}

// ─── Rain ────────────────────────────────────────────────────────────────────

function compileRain(intent: SceneIntent): Partial<RainProfileSettings> {
	if (intent.rain === 'off') return { rainEnabled: false };
	const heavy = intent.rain === 'heavy';
	const t = heavy ? 1 : 0;

	return {
		rainEnabled: true,
		rainColor: makeReadable(intent.palette.secondary, {
			minSaturation: 0.2
		}),
		rainColorSource: 'manual',
		rainParticleType: 'lines',
		rainIntensity: ramp(RAIN_RANGES.intensity, 0.35, 0.85, t),
		rainDropCount: ramp(RAIN_RANGES.dropCount, 25, 80, t),
		rainSpeed: ramp(RAIN_RANGES.speed, 1.2, 3.4, t),
		rainLength: ramp(RAIN_RANGES.length, 0.06, 0.16, t),
		// A little slant always looks better than perfectly vertical rain; more
		// wind on the heavy preset.
		rainAngle: ramp(RAIN_RANGES.angle, 8, 18, t),
		rainVariation: ramp(RAIN_RANGES.variation, 0.3, 0.6, t)
	};
}

// ─── Looks ───────────────────────────────────────────────────────────────────

function compileLooks(intent: SceneIntent): Partial<LooksProfileSettings> {
	const { energy } = intent;
	// Common base: a touch of vignette focuses the frame at any preset.
	const base: Partial<LooksProfileSettings> = {
		filterVignette: 0.25,
		scanlinesEnabled: false,
		rgbShift: 0,
		noiseIntensity: 0
	};

	switch (intent.looks) {
		case 'crt':
			return {
				...base,
				scanlinesEnabled: true,
				scanlineIntensity: 0.35,
				scanlineMode: 'always',
				scanlineSpacing: 600,
				scanlineThickness: 1.5,
				noiseIntensity: 0.08,
				filterContrast: 1.12,
				filterSaturation: 1.1
			};
		case 'bloom':
			return {
				...base,
				filterBloom: lerp(0.3, 0.9, energy),
				filterLumaThreshold: 0.6,
				filterBrightness: 1.05,
				filterSaturation: 1.15,
				filterVignette: 0.35
			};
		case 'glitch':
			return {
				...base,
				rgbShift: lerp(0.004, 0.014, energy),
				noiseIntensity: lerp(0.1, 0.3, energy),
				scanlinesEnabled: true,
				scanlineIntensity: 0.2,
				scanlineMode: 'beat',
				filterContrast: 1.2,
				filterSaturation: 1.2
			};
		case 'clean':
		default:
			return base;
	}
}

// ─── Lights ──────────────────────────────────────────────────────────────────

function compileLights(intent: SceneIntent): Partial<LightsProfileSettings> {
	if (intent.lights === 'off') {
		return { stageLightsEnabled: false, flashLightEnabled: false };
	}
	const concert = intent.lights === 'concert';
	const color = makeReadable(intent.palette.accent);

	return {
		stageLightsEnabled: true,
		stageLightsColor: color,
		stageLightsColorSource: 'manual',
		stageLightsIntensity: concert ? 0.8 : 0.4,
		stageLightsMinBeamCount: concert ? 4 : 2,
		stageLightsMaxBeamCount: concert ? 8 : 4,
		stageLightsBeamWidth: concert ? 0.12 : 0.2,
		stageLightsSoftness: concert ? 0.5 : 0.8,
		stageLightsSpeed: lerp(0.2, 0.9, intent.motion),
		stageLightsOpacity: concert ? 0.7 : 0.4,
		stageLightsAudioReactive: true,
		stageLightsAudioAmount: concert ? 0.8 : 0.35,
		// Peak flashes are the difference between "lit" and "a show". Ambient
		// keeps them off so a calm scene never strobes.
		flashLightEnabled: concert && intent.energy > 0.6,
		flashLightColor: color,
		flashLightColorSource: 'manual',
		flashLightIntensity: 0.5,
		flashLightShape: 'center-bloom'
	};
}

// ─── Camera FX ───────────────────────────────────────────────────────────────

function compileCameraFx(
	intent: SceneIntent
): Partial<CameraFxProfileSettings> {
	const { motion, energy } = intent;
	// Below this the effect is invisible but still costs a per-frame transform,
	// so turn the subsystem off rather than emitting a no-op amount.
	const wantsMotion = motion > 0.25;
	const wantsShake = energy > 0.65;

	return {
		cameraMotionEnabled: wantsMotion,
		...(wantsMotion
			? {
					cameraMotionMode: motion > 0.7 ? 'figure-eight' : 'drift',
					cameraMotionAmount: lerp(0.15, 0.6, motion),
					cameraMotionSpeed: lerp(0.2, 0.8, motion),
					cameraMotionDrive: 'fixed-audio',
					cameraMotionAudioInfluence: lerp(0.2, 0.7, energy)
				}
			: {}),
		cameraShakeEnabled: wantsShake,
		...(wantsShake
			? {
					cameraShakeMode: 'punch',
					cameraShakeAmount: lerp(0.1, 0.4, energy),
					cameraShakeThreshold: 0.65
				}
			: {})
	};
}

/**
 * Expand an intent into per-family partial settings. Pure and total: any valid
 * `SceneIntent` produces a valid, in-range result.
 */
export function compileIntent(intent: SceneIntent): CompiledScene {
	return {
		spectrum: compileSpectrum(intent),
		particles: compileParticles(intent),
		rain: compileRain(intent),
		looks: compileLooks(intent),
		lights: compileLights(intent),
		cameraFx: compileCameraFx(intent),
		compilerVersion: COMPILER_VERSION
	};
}
