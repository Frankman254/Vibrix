/**
 * The particle field's CPU half: seeding the buffers, the audio envelopes and
 * the per-frame motion (base drift, audio wind, depth flow, lifetimes, palette
 * rotation). Shared by the live `ParticleField` (R3F) and the offline video
 * export, which upload the same buffers and uniforms to the same shaders.
 *
 * No React, no store, no Three: callers pass the settings, the resolved
 * colours and the audio snapshot, and own the runtime between frames.
 */
import {
	createAudioChannelSelectionState,
	resolveAudioChannelValue,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';
import {
	completeRotatePalette,
	samplePaletteColor
} from '@/lib/backgroundPalette';
import { randomBetween } from '@/lib/math';
import { PARTICLE_LIMITS } from '@/store/defaultState';
import { createAudioEnvelope } from '@/utils/audioEnvelope';
import { resolveFilterValue } from '@/features/filterLooks/filterStack';
import type {
	ParticleDepthFlowDirection,
	ParticleDepthFlowMode,
	ParticleDepthFlowSpawnOrigin,
	ParticleRotationDirection,
	PerformanceMode,
	WallpaperState
} from '@/types/wallpaper';

export type ParticleSettings = Pick<
	WallpaperState,
	| 'particleCount'
	| 'particleSpeed'
	| 'particleColorSource'
	| 'particleColorMode'
	| 'particleShape'
	| 'particleSizeMin'
	| 'particleSizeMax'
	| 'particleOpacity'
	| 'particleGlow'
	| 'particleGlowStrength'
	| 'particleGlowReach'
	| 'particleGlowAudioAmount'
	| 'particleAudioReactive'
	| 'particleAudioSmoothing'
	| 'particleAudioSizeBoost'
	| 'particleAudioOpacityBoost'
	| 'particleAudioAttack'
	| 'particleAudioRelease'
	| 'particleAudioReactivitySpeed'
	| 'particleAudioPeakWindow'
	| 'particleAudioPeakFloor'
	| 'particleAudioPunch'
	| 'particleAudioDriftEnabled'
	| 'particleAudioDriftAngle'
	| 'particleAudioDriftAmount'
	| 'particleAudioDriftBase'
	| 'particleAudioDriftChannel'
	| 'particleAudioDriftThreshold'
	| 'particleAudioDriftRelease'
	| 'particleAudioDriftMode'
	| 'particleDepthFlowEnabled'
	| 'particleDepthFlowAmount'
	| 'particleDepthFlowDirection'
	| 'particleDepthFlowChannel'
	| 'particleDepthFlowThreshold'
	| 'particleDepthFlowSensitivity'
	| 'particleDepthFlowAttack'
	| 'particleDepthFlowRelease'
	| 'particleDepthFlowSpeed'
	| 'particleDepthFlowSpread'
	| 'particleDepthFlowFocusX'
	| 'particleDepthFlowFocusY'
	| 'particleDepthFlowMode'
	| 'particleDepthFlowSpawnOrigin'
	| 'particleDepthFlowInvertFocusOnLowEnergy'
	| 'particleDepthFlowInvertFocusAxis'
	| 'particleDepthFlowWindInfluence'
	| 'particleFadeInOut'
	| 'particleRotationIntensity'
	| 'particleRotationDirection'
	| 'particleLifetime'
	| 'particleAudioChannel'
	| 'performanceMode'
	| 'audioAutoKickThreshold'
	| 'audioAutoSwitchHoldMs'
	| 'effectLayers'
	| 'activeEffectLayerId'
	| 'filterTargets'
	| 'filterOpacity'
>;

/** Colours after resolving the colour source against the palettes. */
export type ParticleColors = {
	primaryColor: string;
	secondaryColor: string;
	rainbowColors: string[];
};

type Vec3 = [number, number, number];

const PARTICLE_SHAPE_INDEX: Record<string, number> = {
	circles: 0,
	squares: 1,
	triangles: 2,
	stars: 3,
	plus: 4,
	minus: 5,
	diamonds: 6,
	cross: 7,
	all: 8
};

const PARTICLE_ROTATION_DIRECTION_INDEX: Record<
	ParticleRotationDirection,
	number
> = {
	clockwise: 1,
	counterclockwise: -1
};

const PARTICLE_DEPTH_DIRECTION_SIGN: Record<
	ParticleDepthFlowDirection,
	number
> = {
	towardViewer: 1,
	awayFromViewer: -1
};

const PARTICLE_DEPTH_MODE_SCALE: Record<ParticleDepthFlowMode, number> = {
	pullToCamera: 1,
	pushFromFocus: 0.8,
	tunnelBurst: 1.45,
	snowRush: 0.65
};

const WORLD_HALF_WIDTH = 2;
const WORLD_HALF_HEIGHT = 1;
const WORLD_WRAP_X = 2.1;
const WORLD_WRAP_Y = 1.1;

/** Background particles sit just in front of the image plane. */
export const PARTICLE_BACKGROUND_Z = 0.02;
export const PARTICLE_FOREGROUND_Z = 0.5;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function hexToVec3(hex: string): Vec3 {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	return [r, g, b];
}

/** Per-performance-mode ceilings on the particle sliders. */
export function resolveParticleCaps(performanceMode: PerformanceMode) {
	const low = performanceMode === 'low';
	const medium = performanceMode === 'medium';
	return {
		countLimit: PARTICLE_LIMITS[performanceMode],
		maxSeedSize: low ? 14 : medium ? 22 : 30,
		maxPointSize: low ? 18 : medium ? 26 : 36,
		audioSizeBoost: low ? 2.5 : medium ? 5 : 8,
		glowStrength: low ? 0.45 : medium ? 0.85 : 1.2,
		glowReach: low ? 1.65 : medium ? 2.25 : 3,
		depthSpeed: low ? 0.75 : medium ? 1.4 : 2.1,
		depthSizeBoost: low ? 2 : medium ? 3.5 : 5,
		depthFrame: low ? 0.012 : medium ? 0.022 : 0.035,
		driftScale: low ? 0.45 : medium ? 0.7 : 1
	};
}

export function resolveParticleCount(
	settings: Pick<ParticleSettings, 'particleCount' | 'performanceMode'>
): number {
	return Math.min(
		settings.particleCount,
		resolveParticleCaps(settings.performanceMode).countLimit
	);
}

/** The inputs that reseed the buffers when they change. */
export type ParticleSeedSettings = Pick<
	ParticleSettings,
	| 'particleCount'
	| 'performanceMode'
	| 'particleSizeMin'
	| 'particleSizeMax'
	| 'particleColorMode'
	| 'particleColorSource'
>;

export type ParticleBuffers = {
	count: number;
	positions: Float32Array;
	velocities: Float32Array;
	sizes: Float32Array;
	colors: Float32Array;
	offsets: Float32Array;
	lives: Float32Array;
	lifeSpeeds: Float32Array;
};

export function createParticleBuffers(
	settings: ParticleSeedSettings,
	colors: ParticleColors,
	zPosition: number
): ParticleBuffers {
	const caps = resolveParticleCaps(settings.performanceMode);
	const count = resolveParticleCount(settings);
	// Defensive ordering: if the user drags sizeMin past sizeMax (or vice
	// versa) `randomBetween(sizeMin, sizeMax)` returns NaN for every
	// particle. Swap so we always have a valid range.
	const orderedSizeMin = Math.min(
		settings.particleSizeMin,
		settings.particleSizeMax
	);
	const orderedSizeMax = Math.max(
		settings.particleSizeMin,
		settings.particleSizeMax
	);
	const sizeLo = Math.min(orderedSizeMin, caps.maxSeedSize);
	const sizeHi = Math.min(Math.max(sizeLo, orderedSizeMax), caps.maxSeedSize);
	const colorMode = settings.particleColorMode;
	const colorSource = settings.particleColorSource;

	const positions = new Float32Array(count * 3);
	const velocities = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	const colorBuffer = new Float32Array(count * 3);
	const offsets = new Float32Array(count);
	const lives = new Float32Array(count);
	const lifeSpeeds = new Float32Array(count);
	const c1 = hexToVec3(colors.primaryColor);
	const c2 = hexToVec3(colors.secondaryColor);
	// `completeRotate` sweeps the rainbow PLUS pure black and white.
	const rainbowPalette =
		colorMode === 'completeRotate'
			? completeRotatePalette(colors.rainbowColors)
			: colors.rainbowColors;

	for (let i = 0; i < count; i++) {
		positions[i * 3] = randomBetween(-WORLD_HALF_WIDTH, WORLD_HALF_WIDTH);
		positions[i * 3 + 1] = randomBetween(
			-WORLD_HALF_HEIGHT,
			WORLD_HALF_HEIGHT
		);
		positions[i * 3 + 2] = zPosition;
		velocities[i * 3] = randomBetween(-0.0008, 0.0008);
		velocities[i * 3 + 1] = randomBetween(-0.0008, 0.0008);
		sizes[i] = randomBetween(sizeLo, sizeHi);
		offsets[i] = randomBetween(0, Math.PI * 2);
		lives[i] = randomBetween(0, 1);
		lifeSpeeds[i] = randomBetween(0.003, 0.012);

		let rgb: Vec3;
		if (colorMode === 'solid') {
			rgb = c1;
		} else if (
			colorMode === 'rotateRgb' ||
			colorMode === 'completeRotate'
		) {
			// Manual: the shader does the HSL cycle and ignores vColor, so a
			// neutral base is enough. Otherwise seed from the palette; the
			// frame step keeps cycling it.
			rgb =
				colorSource === 'manual'
					? [0.5, 0.5, 0.5]
					: hexToVec3(
							samplePaletteColor(
								rainbowPalette,
								offsets[i] / (Math.PI * 2)
							)
						);
		} else if (colorMode === 'rainbow') {
			// Spread across whichever palette the colour source produced.
			const t =
				i / Math.max(count, 1) + (offsets[i] / (Math.PI * 2)) * 0.4;
			rgb = hexToVec3(
				samplePaletteColor(rainbowPalette, t - Math.floor(t))
			);
		} else {
			// Gradient: a random point on the color1 → color2 ramp from the
			// seeded offset, so the mix looks even rather than two blobs.
			const t = offsets[i] / (Math.PI * 2);
			rgb = [
				c1[0] + (c2[0] - c1[0]) * t,
				c1[1] + (c2[1] - c1[1]) * t,
				c1[2] + (c2[2] - c1[2]) * t
			];
		}
		colorBuffer[i * 3] = rgb[0];
		colorBuffer[i * 3 + 1] = rgb[1];
		colorBuffer[i * 3 + 2] = rgb[2];
	}

	return {
		count,
		positions,
		velocities,
		sizes,
		colors: colorBuffer,
		offsets,
		lives,
		lifeSpeeds
	};
}

/**
 * The palette the CPU cycles through for theme/image `rotateRgb`, or `null`
 * when the shader cycles (manual) or nothing rotates.
 */
export function resolveParticleRotationPalette(
	settings: Pick<
		ParticleSettings,
		'particleColorMode' | 'particleColorSource'
	>,
	colors: ParticleColors
): Vec3[] | null {
	const rotates =
		settings.particleColorMode === 'rotateRgb' ||
		settings.particleColorMode === 'completeRotate';
	if (!rotates || settings.particleColorSource === 'manual') return null;
	return (
		settings.particleColorMode === 'completeRotate'
			? completeRotatePalette(colors.rainbowColors)
			: colors.rainbowColors
	).map(hexToVec3);
}

export type ParticleUniformValues = {
	uTime: number;
	uOpacity: number;
	uGlowStrength: number;
	uGlowReach: number;
	uAmplitude: number;
	uAudioSizeBoost: number;
	uMaxPointSize: number;
	uAudioOpacityBoost: number;
	uDepthAmplitude: number;
	uDepthSizeBoost: number;
	uAudioReactive: boolean;
	uFadeInOut: boolean;
	uShape: number;
	uRotationIntensity: number;
	uRotationDirection: number;
	uRotateRgb: number;
};

/** Uniform objects in the shape Three's `ShaderMaterial` expects. */
export function createParticleUniforms(): {
	[K in keyof ParticleUniformValues | 'uPixelScale']: {
		value: K extends keyof ParticleUniformValues
			? ParticleUniformValues[K]
			: number;
	};
} {
	return {
		uTime: { value: 0 },
		uOpacity: { value: 0 },
		uGlowStrength: { value: 0 },
		uGlowReach: { value: 1 },
		uAmplitude: { value: 0 },
		uAudioSizeBoost: { value: 0 },
		uMaxPointSize: { value: 36 },
		uAudioOpacityBoost: { value: 0 },
		uDepthAmplitude: { value: 0 },
		uDepthSizeBoost: { value: 0 },
		uAudioReactive: { value: false },
		uFadeInOut: { value: false },
		uShape: { value: 0 },
		uRotationIntensity: { value: 0 },
		uRotationDirection: { value: 1 },
		uRotateRgb: { value: 0 },
		// Output pixels per live device pixel: 1 live, scaled in the export.
		uPixelScale: { value: 1 }
	};
}

export function applyParticleUniforms(
	uniforms: Record<string, { value: unknown }>,
	values: ParticleUniformValues
): void {
	for (const key of Object.keys(values) as (keyof ParticleUniformValues)[]) {
		uniforms[key].value = values[key];
	}
}

/** State the field carries from one frame to the next. */
export type ParticleRuntime = {
	motionTime: number;
	channelSelection: ReturnType<typeof createAudioChannelSelectionState>;
	driftChannelSelection: ReturnType<typeof createAudioChannelSelectionState>;
	depthChannelSelection: ReturnType<typeof createAudioChannelSelectionState>;
	envelope: ReturnType<typeof createAudioEnvelope>;
	driftEnvelope: ReturnType<typeof createAudioEnvelope>;
	depthEnvelope: ReturnType<typeof createAudioEnvelope>;
	depthLowEnergyWasActive: boolean;
	depthFocusSign: { x: number; y: number };
};

export function createParticleRuntime(): ParticleRuntime {
	return {
		motionTime: 0,
		channelSelection: createAudioChannelSelectionState('instrumental'),
		driftChannelSelection: createAudioChannelSelectionState('kick'),
		depthChannelSelection: createAudioChannelSelectionState('kick'),
		envelope: createAudioEnvelope(),
		driftEnvelope: createAudioEnvelope(),
		depthEnvelope: createAudioEnvelope(),
		depthLowEnergyWasActive: false,
		depthFocusSign: { x: 1, y: 1 }
	};
}

function respawnParticlePosition(
	pos: Float32Array,
	idx: number,
	origin: ParticleDepthFlowSpawnOrigin,
	focusX: number,
	focusY: number,
	spread: number
) {
	const focusRadiusX = Math.min(0.55, 0.1 + spread * 0.08);
	const focusRadiusY = Math.min(0.3, 0.06 + spread * 0.05);
	switch (origin) {
		case 'fromFocus':
			pos[idx] = clamp(
				focusX + randomBetween(-focusRadiusX, focusRadiusX),
				-WORLD_HALF_WIDTH,
				WORLD_HALF_WIDTH
			);
			pos[idx + 1] = clamp(
				focusY + randomBetween(-focusRadiusY, focusRadiusY),
				-WORLD_HALF_HEIGHT,
				WORLD_HALF_HEIGHT
			);
			return;
		case 'fromEdges': {
			const edge = Math.floor(randomBetween(0, 4));
			if (edge === 0) {
				pos[idx] = -WORLD_WRAP_X;
				pos[idx + 1] = randomBetween(
					-WORLD_HALF_HEIGHT,
					WORLD_HALF_HEIGHT
				);
			} else if (edge === 1) {
				pos[idx] = WORLD_WRAP_X;
				pos[idx + 1] = randomBetween(
					-WORLD_HALF_HEIGHT,
					WORLD_HALF_HEIGHT
				);
			} else if (edge === 2) {
				pos[idx] = randomBetween(-WORLD_HALF_WIDTH, WORLD_HALF_WIDTH);
				pos[idx + 1] = WORLD_WRAP_Y;
			} else {
				pos[idx] = randomBetween(-WORLD_HALF_WIDTH, WORLD_HALF_WIDTH);
				pos[idx + 1] = -WORLD_WRAP_Y;
			}
			return;
		}
		case 'fromCenter':
			pos[idx] = randomBetween(-0.28, 0.28);
			pos[idx + 1] = randomBetween(-0.18, 0.18);
			return;
		case 'fromTop':
			pos[idx] = randomBetween(-WORLD_HALF_WIDTH, WORLD_HALF_WIDTH);
			pos[idx + 1] = WORLD_WRAP_Y;
			return;
		case 'fromBottom':
			pos[idx] = randomBetween(-WORLD_HALF_WIDTH, WORLD_HALF_WIDTH);
			pos[idx + 1] = -WORLD_WRAP_Y;
			return;
		case 'randomScreen':
		default:
			pos[idx] = randomBetween(-WORLD_HALF_WIDTH, WORLD_HALF_WIDTH);
			pos[idx + 1] = randomBetween(-WORLD_HALF_HEIGHT, WORLD_HALF_HEIGHT);
	}
}

export type ParticleStepResult = {
	uniforms: ParticleUniformValues;
	positionsChanged: boolean;
	colorsChanged: boolean;
};

/**
 * Advances the field by `dtSec` (already clamped by the caller) and writes
 * positions, lives and — for palette rotation — colours in place.
 */
export function stepParticles(
	runtime: ParticleRuntime,
	buffers: ParticleBuffers,
	settings: ParticleSettings,
	audio: AudioSnapshot,
	dtSec: number,
	rotationPalette: Vec3[] | null
): ParticleStepResult {
	const s = settings;
	const caps = resolveParticleCaps(s.performanceMode);
	const { count, velocities, offsets, lifeSpeeds } = buffers;
	const pos = buffers.positions;
	const lifeArr = buffers.lives;
	const safeDt = Math.min(dtSec, 0.1);
	const envelopeDt = Math.max(safeDt, 1 / 120);
	// Looks' "filter opacity" reaches particles from whichever effect layer
	// targets them — not necessarily the one the Looks tab is editing.
	const opacityMultiplier =
		resolveFilterValue(s, 'particles', 'filterOpacity') ?? 1;

	const { value: channelLevel } = resolveAudioChannelValue(
		audio.channels,
		s.particleAudioChannel,
		runtime.channelSelection,
		s.particleAudioSmoothing,
		s.audioAutoKickThreshold,
		s.audioAutoSwitchHoldMs,
		audio.timestampMs
	);
	// Envelope mapped to [0, 1]; the shader multiplies by the Size/Opacity
	// boosts separately, so `scaleIntensity` stays 1 here.
	const amplitude = runtime.envelope.tick(channelLevel, envelopeDt, {
		attack: s.particleAudioAttack,
		release: s.particleAudioRelease,
		responseSpeed: s.particleAudioReactivitySpeed * 2.4,
		peakWindow: s.particleAudioPeakWindow,
		peakFloor: s.particleAudioPeakFloor,
		punch: s.particleAudioPunch,
		scaleIntensity: 1,
		min: 0,
		max: 1
	}).value;

	const driftChannelLevel =
		s.particleAudioDriftChannel === s.particleAudioChannel
			? channelLevel
			: resolveAudioChannelValue(
					audio.channels,
					s.particleAudioDriftChannel,
					runtime.driftChannelSelection,
					s.particleAudioSmoothing,
					s.audioAutoKickThreshold,
					s.audioAutoSwitchHoldMs,
					audio.timestampMs
				).value;
	const driftInput =
		s.particleAudioDriftEnabled &&
		driftChannelLevel >= s.particleAudioDriftThreshold
			? driftChannelLevel
			: 0;
	const driftState = runtime.driftEnvelope.tick(driftInput, envelopeDt, {
		attack: 0.85,
		release: s.particleAudioDriftRelease,
		responseSpeed: 2.2,
		peakWindow: s.particleAudioPeakWindow,
		peakFloor: s.particleAudioPeakFloor,
		punch: s.particleAudioPunch,
		scaleIntensity: 1,
		min: 0,
		max: 1
	});
	const driftLevel =
		s.particleAudioDriftMode === 'burst'
			? Math.pow(driftState.value, 1.35)
			: driftState.value;
	const driftModeScale =
		s.particleAudioDriftMode === 'burst'
			? 1.65
			: s.particleAudioDriftMode === 'offset'
				? 0.45
				: 1;
	const driftSpeed = s.particleAudioDriftEnabled
		? Math.min(
				2.5,
				Math.max(
					0,
					s.particleAudioDriftBase +
						driftLevel * s.particleAudioDriftAmount
				)
			) *
			caps.driftScale *
			driftModeScale
		: 0;
	const driftAngleRad = (s.particleAudioDriftAngle * Math.PI) / 180;
	// With Depth Flow also active, attenuate wind so it layers on top of the
	// focal motion instead of overriding it.
	const driftAttenuation =
		s.particleDepthFlowEnabled && s.particleAudioDriftEnabled
			? clamp(s.particleDepthFlowWindInfluence, 0, 1)
			: 1;
	const driftX =
		Math.cos(driftAngleRad) * driftSpeed * safeDt * driftAttenuation;
	const driftY =
		Math.sin(driftAngleRad) * driftSpeed * safeDt * driftAttenuation;

	const depthChannelLevel =
		s.particleDepthFlowChannel === s.particleAudioChannel
			? channelLevel
			: s.particleDepthFlowChannel === s.particleAudioDriftChannel
				? driftChannelLevel
				: resolveAudioChannelValue(
						audio.channels,
						s.particleDepthFlowChannel,
						runtime.depthChannelSelection,
						s.particleAudioSmoothing,
						s.audioAutoKickThreshold,
						s.audioAutoSwitchHoldMs,
						audio.timestampMs
					).value;
	const depthInput =
		s.particleDepthFlowEnabled &&
		depthChannelLevel >= s.particleDepthFlowThreshold
			? depthChannelLevel
			: 0;
	const depthLowEnergy =
		s.particleDepthFlowEnabled &&
		depthChannelLevel < s.particleDepthFlowThreshold;
	if (
		!s.particleDepthFlowEnabled ||
		!s.particleDepthFlowInvertFocusOnLowEnergy
	) {
		runtime.depthLowEnergyWasActive = false;
		runtime.depthFocusSign.x = 1;
		runtime.depthFocusSign.y = 1;
	} else if (depthLowEnergy && !runtime.depthLowEnergyWasActive) {
		const axis = s.particleDepthFlowInvertFocusAxis;
		if (axis === 'x' || axis === 'both') runtime.depthFocusSign.x *= -1;
		if (axis === 'y' || axis === 'both') runtime.depthFocusSign.y *= -1;
		runtime.depthLowEnergyWasActive = true;
	} else if (!depthLowEnergy) {
		runtime.depthLowEnergyWasActive = false;
	}
	const depthState = runtime.depthEnvelope.tick(depthInput, envelopeDt, {
		attack: s.particleDepthFlowAttack,
		release: s.particleDepthFlowRelease,
		responseSpeed: 2.4,
		peakWindow: s.particleAudioPeakWindow,
		peakFloor: s.particleAudioPeakFloor,
		punch: s.particleAudioPunch,
		scaleIntensity: s.particleDepthFlowSensitivity,
		min: 0,
		max: 1
	});
	const depthModeScale =
		PARTICLE_DEPTH_MODE_SCALE[s.particleDepthFlowMode] ?? 1;
	const depthDirectionSign =
		PARTICLE_DEPTH_DIRECTION_SIGN[s.particleDepthFlowDirection] ?? 1;
	const depthDrive = s.particleDepthFlowEnabled
		? Math.min(1, Math.max(0, depthState.value * s.particleDepthFlowAmount))
		: 0;
	const depthSpeed = Math.min(
		caps.depthSpeed,
		Math.max(0, s.particleDepthFlowSpeed)
	);
	const depthFrameStep = Math.min(
		caps.depthFrame,
		depthDrive * depthSpeed * depthModeScale * safeDt
	);
	const depthSpread = Math.min(3, Math.max(0.2, s.particleDepthFlowSpread));
	const focusXNormalized = Math.min(
		1,
		Math.max(0, s.particleDepthFlowFocusX)
	);
	const focusYNormalized = Math.min(
		1,
		Math.max(0, s.particleDepthFlowFocusY)
	);
	const mirroredFocusX =
		runtime.depthFocusSign.x < 0 ? 1 - focusXNormalized : focusXNormalized;
	const mirroredFocusY =
		runtime.depthFocusSign.y < 0 ? 1 - focusYNormalized : focusYNormalized;
	const focusX = (mirroredFocusX - 0.5) * 4;
	const focusY = (0.5 - mirroredFocusY) * 2;
	const depthSnowRush = s.particleDepthFlowMode === 'snowRush';
	const depthSizeBoost = Math.min(
		caps.depthSizeBoost,
		depthDrive * depthSpeed * 2.4
	);

	runtime.motionTime += safeDt;
	const glowStrengthBase = s.particleGlow
		? Math.min(Math.max(0, s.particleGlowStrength), caps.glowStrength)
		: 0;
	const glowAudioBoost = s.particleAudioReactive
		? amplitude * Math.max(0, s.particleGlowAudioAmount)
		: 0;
	const uniforms: ParticleUniformValues = {
		uTime: runtime.motionTime,
		uOpacity: s.particleOpacity * opacityMultiplier,
		uGlowStrength: Math.min(
			caps.glowStrength * 2.4,
			glowStrengthBase + glowAudioBoost
		),
		uGlowReach: Math.min(caps.glowReach, Math.max(1, s.particleGlowReach)),
		uAmplitude: amplitude,
		uAudioSizeBoost: Math.min(
			Math.max(0, s.particleAudioSizeBoost),
			caps.audioSizeBoost
		),
		uMaxPointSize: caps.maxPointSize,
		uAudioOpacityBoost: s.particleAudioOpacityBoost,
		uDepthAmplitude: depthDrive,
		uDepthSizeBoost: depthSizeBoost,
		uAudioReactive: s.particleAudioReactive,
		uFadeInOut: s.particleFadeInOut,
		uShape: PARTICLE_SHAPE_INDEX[s.particleShape] ?? 0,
		uRotationIntensity: s.particleRotationIntensity,
		uRotationDirection:
			PARTICLE_ROTATION_DIRECTION_INDEX[s.particleRotationDirection] ?? 1,
		// The GPU HSL cycle overrides vColor, so only manual rotation uses it;
		// theme/image rotation writes palette colours on the CPU below.
		uRotateRgb:
			s.particleColorSource !== 'manual'
				? 0
				: s.particleColorMode === 'completeRotate'
					? 2
					: s.particleColorMode === 'rotateRgb'
						? 1
						: 0
	};

	let positionsChanged = false;
	if (
		s.particleSpeed > 0.001 ||
		driftSpeed > 0.0001 ||
		depthFrameStep > 0.00001
	) {
		const hasDepthFlow = depthFrameStep > 0.00001;
		for (let i = 0; i < count; i++) {
			const idx = i * 3;
			// Base motion only — drift is applied AFTER depth so it cannot
			// contaminate the focal-point direction vector.
			let nextX = pos[idx] + velocities[idx] * s.particleSpeed;
			let nextY = pos[idx + 1] + velocities[idx + 1] * s.particleSpeed;
			if (hasDepthFlow) {
				const dx = nextX - focusX;
				const dy = nextY - focusY;
				const radialDistance = Math.max(
					0.0001,
					Math.sqrt(dx * dx + dy * dy)
				);
				let radial = depthFrameStep * depthDirectionSign;
				if (s.particleDepthFlowMode === 'tunnelBurst') {
					radial *=
						0.65 + Math.min(1.8, radialDistance * depthSpread);
				} else if (depthSnowRush) {
					const dyAbs = Math.abs(nextY - focusY);
					radial *= 0.4 + Math.min(1.1, dyAbs * depthSpread * 0.85);
				} else {
					radial *=
						0.55 + Math.min(1.35, radialDistance * depthSpread);
				}
				nextX += (dx / radialDistance) * radial;
				nextY += (dy / radialDistance) * radial;
			}
			// Drift added as additive wind after depth — never shifts the focus.
			nextX += driftX;
			nextY += driftY;
			pos[idx] = nextX;
			pos[idx + 1] = nextY;
			if (hasDepthFlow) {
				const focusDx = nextX - focusX;
				const focusDy = nextY - focusY;
				const nearFocus =
					focusDx * focusDx + focusDy * focusDy < 0.035 * 0.035;
				const hitEdge =
					Math.abs(nextX) > WORLD_WRAP_X ||
					Math.abs(nextY) > WORLD_WRAP_Y;
				const shouldRespawn =
					(depthDirectionSign > 0 && hitEdge) ||
					(depthDirectionSign < 0 && nearFocus);
				if (shouldRespawn) {
					if (depthDirectionSign > 0) {
						respawnParticlePosition(
							pos,
							idx,
							s.particleDepthFlowSpawnOrigin,
							focusX,
							focusY,
							depthSpread
						);
					} else {
						pos[idx] = randomBetween(
							-WORLD_HALF_WIDTH,
							WORLD_HALF_WIDTH
						);
						pos[idx + 1] = randomBetween(
							-WORLD_HALF_HEIGHT,
							WORLD_HALF_HEIGHT
						);
					}
					lifeArr[i] = 0;
				}
			} else {
				if (pos[idx] > WORLD_WRAP_X) pos[idx] = -WORLD_WRAP_X;
				if (pos[idx] < -WORLD_WRAP_X) pos[idx] = WORLD_WRAP_X;
				if (pos[idx + 1] > WORLD_WRAP_Y) pos[idx + 1] = -WORLD_WRAP_Y;
				if (pos[idx + 1] < -WORLD_WRAP_Y) pos[idx + 1] = WORLD_WRAP_Y;
			}
		}
		positionsChanged = true;
	}

	// particleLifetime scales how long particles live: 1.0 = default,
	// 2.0 = twice as long. Longer lives give depth flow time to complete the
	// focus-to-edge journey.
	const lifeScaleInv = 1.0 / Math.max(0.1, s.particleLifetime);
	for (let i = 0; i < count; i++) {
		lifeArr[i] += lifeSpeeds[i] * (60 * safeDt) * lifeScaleInv;
		if (lifeArr[i] >= 1.0) {
			lifeArr[i] = 0;
			if (depthFrameStep > 0.00001) {
				respawnParticlePosition(
					pos,
					i * 3,
					s.particleDepthFlowSpawnOrigin,
					focusX,
					focusY,
					depthSpread
				);
			} else {
				pos[i * 3] = randomBetween(-WORLD_HALF_WIDTH, WORLD_HALF_WIDTH);
				pos[i * 3 + 1] = randomBetween(
					-WORLD_HALF_HEIGHT,
					WORLD_HALF_HEIGHT
				);
			}
			positionsChanged = true;
		}
	}

	// Palette-driven rotateRgb (theme/image): cycle each particle through the
	// resolved palette, staggered by its random offset.
	let colorsChanged = false;
	if (rotationPalette && rotationPalette.length > 0) {
		const colorArr = buffers.colors;
		const paletteLen = rotationPalette.length;
		const time = runtime.motionTime;
		for (let i = 0; i < count; i++) {
			// 0.16 keeps the cycle calm enough to read as rotation without
			// strobing — close in tempo to the GPU cycle.
			const tRaw = time * 0.16 + offsets[i] / (Math.PI * 2);
			const t = tRaw - Math.floor(tRaw);
			const scaled = t * paletteLen;
			const lower = Math.floor(scaled) % paletteLen;
			const upper = (lower + 1) % paletteLen;
			const alpha = scaled - Math.floor(scaled);
			const a = rotationPalette[lower];
			const b = rotationPalette[upper];
			colorArr[i * 3] = a[0] + (b[0] - a[0]) * alpha;
			colorArr[i * 3 + 1] = a[1] + (b[1] - a[1]) * alpha;
			colorArr[i * 3 + 2] = a[2] + (b[2] - a[2]) * alpha;
		}
		colorsChanged = true;
	}

	return { uniforms, positionsChanged, colorsChanged };
}

/** CSS filter the live particle canvas wrapper carries. */
export function resolveParticleCanvasFilter(
	settings: Pick<
		WallpaperState,
		| 'particleFilterBrightness'
		| 'particleFilterContrast'
		| 'particleFilterSaturation'
		| 'particleFilterBlur'
		| 'particleFilterHueRotate'
	>,
	blurScale = 1
): string {
	return `brightness(${settings.particleFilterBrightness}) contrast(${settings.particleFilterContrast}) saturate(${settings.particleFilterSaturation}) blur(${settings.particleFilterBlur * blurScale}px) hue-rotate(${settings.particleFilterHueRotate}deg)`;
}
