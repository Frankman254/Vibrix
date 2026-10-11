import { describe, it, expect } from 'vitest';
import { PARTICLE_RANGES, RAIN_RANGES, SPECTRUM_RANGES } from '@/config/ranges';
import type { SliderRange } from '@/config/ranges';
import { compileIntent, COMPILER_VERSION } from './compileIntent';
import {
	LIGHTS_PRESETS,
	LOOKS_PRESETS,
	PARTICLES_PRESETS,
	RAIN_PRESETS,
	SPECTRUM_FAMILIES,
	SPECTRUM_MODES,
	SPECTRUM_SHAPES,
	defaultSceneIntent,
	type SceneIntent
} from './sceneIntent';

/**
 * The keys this compiler is allowed to emit as numbers, with the slider range
 * each must respect. Anything numeric NOT listed here is caught by the
 * "no unlisted numeric key" assertion below — so adding a knob to the compiler
 * forces adding its range here, which is the point.
 */
const NUMERIC_RANGES: Record<string, SliderRange> = {
	spectrumBarCount: SPECTRUM_RANGES.barCount,
	spectrumBarWidth: SPECTRUM_RANGES.barWidth,
	spectrumMaxHeight: SPECTRUM_RANGES.maxHeight,
	spectrumMinHeight: SPECTRUM_RANGES.minHeight,
	spectrumScale: SPECTRUM_RANGES.scale,
	spectrumSpan: SPECTRUM_RANGES.span,
	spectrumSmoothing: SPECTRUM_RANGES.smoothing,
	spectrumOpacity: SPECTRUM_RANGES.opacity,
	spectrumGlowIntensity: SPECTRUM_RANGES.glowIntensity,
	spectrumGlowReach: SPECTRUM_RANGES.glowReach,
	spectrumShadowBlur: SPECTRUM_RANGES.shadowBlur,
	spectrumRotationSpeed: SPECTRUM_RANGES.rotationSpeed,
	spectrumPixelateScale: SPECTRUM_RANGES.pixelateScale,
	spectrumEnvelopeAttack: { min: 0, max: 1, step: 0.01 },
	spectrumEnvelopeRelease: { min: 0, max: 1, step: 0.01 },

	particleCount: PARTICLE_RANGES.count,
	particleSpeed: PARTICLE_RANGES.speed,
	particleSizeMin: PARTICLE_RANGES.sizeMin,
	particleSizeMax: PARTICLE_RANGES.sizeMax,
	particleLifetime: PARTICLE_RANGES.lifetime,
	particleOpacity: PARTICLE_RANGES.opacity,
	particleGlowStrength: PARTICLE_RANGES.glowStrength,
	particleAudioSizeBoost: PARTICLE_RANGES.audioSizeBoost,

	rainIntensity: RAIN_RANGES.intensity,
	rainDropCount: RAIN_RANGES.dropCount,
	rainSpeed: RAIN_RANGES.speed,
	rainLength: RAIN_RANGES.length,
	rainAngle: RAIN_RANGES.angle,
	rainVariation: RAIN_RANGES.variation,

	// Unit-interval knobs without a dedicated slider range entry.
	filterVignette: { min: 0, max: 1, step: 0.01 },
	filterBloom: { min: 0, max: 1.5, step: 0.01 },
	filterLumaThreshold: { min: 0, max: 1, step: 0.01 },
	filterBrightness: { min: 0.4, max: 2, step: 0.01 },
	filterContrast: { min: 0.4, max: 2.5, step: 0.01 },
	filterSaturation: { min: 0, max: 3, step: 0.01 },
	rgbShift: { min: 0, max: 0.03, step: 0.001 },
	noiseIntensity: { min: 0, max: 0.8, step: 0.01 },
	scanlineIntensity: { min: 0, max: 1, step: 0.01 },
	scanlineSpacing: { min: 200, max: 1600, step: 25 },
	scanlineThickness: { min: 0.5, max: 6, step: 0.1 },

	stageLightsIntensity: { min: 0, max: 1, step: 0.01 },
	stageLightsMinBeamCount: { min: 1, max: 24, step: 1 },
	stageLightsMaxBeamCount: { min: 1, max: 24, step: 1 },
	stageLightsBeamWidth: { min: 0, max: 1, step: 0.01 },
	stageLightsSoftness: { min: 0, max: 1, step: 0.01 },
	stageLightsSpeed: { min: 0, max: 3, step: 0.01 },
	stageLightsOpacity: { min: 0, max: 1, step: 0.01 },
	stageLightsAudioAmount: { min: 0, max: 3, step: 0.01 },
	flashLightIntensity: { min: 0, max: 1, step: 0.01 },

	cameraMotionAmount: { min: 0, max: 1, step: 0.01 },
	cameraMotionSpeed: { min: 0, max: 1, step: 0.01 },
	cameraMotionAudioInfluence: { min: 0, max: 1, step: 0.01 },
	cameraShakeAmount: { min: 0, max: 1, step: 0.01 },
	cameraShakeThreshold: { min: 0, max: 1, step: 0.01 }
};

/** Every intent worth compiling: the enum cross-product × scalar extremes. */
function* allIntents(): Generator<SceneIntent> {
	const base = defaultSceneIntent();
	const scalars = [0, 0.25, 0.5, 0.75, 1];

	for (const spectrumFamily of SPECTRUM_FAMILIES) {
		for (const spectrumShape of SPECTRUM_SHAPES) {
			for (const spectrumMode of SPECTRUM_MODES) {
				yield { ...base, spectrumFamily, spectrumShape, spectrumMode };
			}
		}
	}
	for (const particles of PARTICLES_PRESETS) {
		for (const energy of scalars) {
			for (const motion of scalars) {
				yield { ...base, particles, energy, motion };
			}
		}
	}
	for (const rain of RAIN_PRESETS) yield { ...base, rain };
	for (const looks of LOOKS_PRESETS) {
		for (const energy of scalars) yield { ...base, looks, energy };
	}
	for (const lights of LIGHTS_PRESETS) {
		for (const energy of scalars) {
			for (const motion of scalars) {
				yield { ...base, lights, energy, motion };
			}
		}
	}
	for (const energy of scalars) {
		for (const weight of scalars) {
			for (const motion of scalars) {
				yield { ...base, energy, weight, motion };
			}
		}
	}
}

function familyEntries(compiled: ReturnType<typeof compileIntent>) {
	const { compilerVersion: _ignored, ...families } = compiled;
	return Object.entries(families).flatMap(([family, values]) =>
		Object.entries(values as Record<string, unknown>).map(
			([key, value]) => [family, key, value] as const
		)
	);
}

describe('compileIntent', () => {
	it('is pure and deterministic', () => {
		const intent = { ...defaultSceneIntent(), energy: 0.63, motion: 0.42 };
		expect(compileIntent(intent)).toEqual(compileIntent(intent));
	});

	it('stamps the compiler version so scenes can be recompiled later', () => {
		expect(compileIntent(defaultSceneIntent()).compilerVersion).toBe(
			COMPILER_VERSION
		);
	});

	it('never emits a numeric outside its slider range', () => {
		for (const intent of allIntents()) {
			for (const [family, key, value] of familyEntries(
				compileIntent(intent)
			)) {
				if (typeof value !== 'number') continue;
				const range = NUMERIC_RANGES[key];
				expect(
					range,
					`${family}.${key} is numeric but has no declared range in this test`
				).toBeDefined();
				expect(
					Number.isFinite(value),
					`${family}.${key} = ${value}`
				).toBe(true);
				expect(value, `${family}.${key}`).toBeGreaterThanOrEqual(
					range.min
				);
				expect(value, `${family}.${key}`).toBeLessThanOrEqual(
					range.max
				);
			}
		}
	});

	it('never emits undefined, null or NaN', () => {
		for (const intent of allIntents()) {
			for (const [family, key, value] of familyEntries(
				compileIntent(intent)
			)) {
				expect(value, `${family}.${key}`).not.toBeUndefined();
				expect(value, `${family}.${key}`).not.toBeNull();
				if (typeof value === 'number') {
					expect(Number.isNaN(value), `${family}.${key}`).toBe(false);
				}
			}
		}
	});

	it('emits colours only as #rrggbb', () => {
		for (const intent of allIntents()) {
			for (const [family, key, value] of familyEntries(
				compileIntent(intent)
			)) {
				if (
					typeof value !== 'string' ||
					!key.toLowerCase().includes('color')
				) {
					continue;
				}
				if (key.endsWith('Source') || key.endsWith('Mode')) continue;
				expect(value, `${family}.${key}`).toMatch(/^#[0-9a-f]{6}$/);
			}
		}
	});

	it('keeps particle size max above size min', () => {
		for (const intent of allIntents()) {
			const { particles } = compileIntent(intent);
			if (!particles.particlesEnabled) continue;
			expect(particles.particleSizeMax).toBeGreaterThan(
				particles.particleSizeMin as number
			);
		}
	});

	it('turns a subsystem off rather than emitting an inert config', () => {
		const off = compileIntent({
			...defaultSceneIntent(),
			particles: 'off',
			rain: 'off',
			lights: 'off',
			motion: 0,
			energy: 0
		});
		expect(off.particles).toEqual({ particlesEnabled: false });
		expect(off.rain).toEqual({ rainEnabled: false });
		expect(off.lights.stageLightsEnabled).toBe(false);
		expect(off.lights.flashLightEnabled).toBe(false);
		// Below the visibility threshold camera motion costs a transform per
		// frame for nothing, so it must be disabled, not set to ~0.
		expect(off.cameraFx.cameraMotionEnabled).toBe(false);
		expect(off.cameraFx.cameraMotionAmount).toBeUndefined();
	});

	it('maps energy onto reactivity monotonically', () => {
		const calm = compileIntent({ ...defaultSceneIntent(), energy: 0 });
		const loud = compileIntent({ ...defaultSceneIntent(), energy: 1 });

		// Calm = heavily smoothed; loud = transients get through.
		expect(calm.spectrum.spectrumSmoothing).toBeGreaterThan(
			loud.spectrum.spectrumSmoothing as number
		);
		expect(loud.spectrum.spectrumMaxHeight).toBeGreaterThan(
			calm.spectrum.spectrumMaxHeight as number
		);
		expect(loud.spectrum.spectrumGlowIntensity).toBeGreaterThan(
			calm.spectrum.spectrumGlowIntensity as number
		);
		expect(calm.spectrum.spectrumColorMode).toBe('solid');
		expect(loud.spectrum.spectrumColorMode).toBe('gradient');
	});

	it('maps weight onto fewer, wider bars', () => {
		const light = compileIntent({ ...defaultSceneIntent(), weight: 0 });
		const heavy = compileIntent({ ...defaultSceneIntent(), weight: 1 });
		expect(heavy.spectrum.spectrumBarCount).toBeLessThan(
			light.spectrum.spectrumBarCount as number
		);
		expect(heavy.spectrum.spectrumBarWidth).toBeGreaterThan(
			light.spectrum.spectrumBarWidth as number
		);
	});

	it('pixelates only for the pixel shape', () => {
		const pixel = compileIntent({
			...defaultSceneIntent(),
			spectrumShape: 'pixel'
		});
		const bars = compileIntent({
			...defaultSceneIntent(),
			spectrumShape: 'bars'
		});
		expect(pixel.spectrum.spectrumPixelate).toBe(true);
		expect(pixel.spectrum.spectrumPixelateScale).toBeDefined();
		expect(bars.spectrum.spectrumPixelate).toBe(false);
		expect(bars.spectrum.spectrumPixelateScale).toBeUndefined();
	});

	it('keeps shadow blur well under its ceiling even at full energy', () => {
		// Shadow blur is the documented spectrum bottleneck; taste must not buy
		// a frame-rate cliff.
		const loud = compileIntent({ ...defaultSceneIntent(), energy: 1 });
		expect(loud.spectrum.spectrumShadowBlur).toBeLessThanOrEqual(30);
	});
});
