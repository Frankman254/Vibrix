/**
 * Camera FX: Camera Motion (a slow path) and Screen Shake (audio-peak kicks).
 * The step (`stepCameraFx`) is shared by the live `CameraFxStage`, which
 * writes the result as CSS transforms on the marked layer roots, and the
 * offline video export, which applies it as a canvas transform per layer.
 *
 * No React, no store: callers pass the settings, the clock, the viewport size
 * (CSS pixels) and a lazy audio read, and own the runtime between frames.
 */
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { WallpaperState } from '@/types/wallpaper';
import {
	resolveMotionLayerStack,
	type MotionLayerSettings
} from './motionLayers';
import {
	CAMERA_FX_CAPS,
	cameraMotionTargetIncludes,
	readFxChannel,
	resolveFxThreshold,
	shouldTriggerFxPeak,
	type CameraMotionLayer
} from './stageFxConfig';

export type CameraFxSettings = Pick<
	WallpaperState,
	| 'cameraMotionEnabled'
	| 'cameraMotionMode'
	| 'cameraMotionDrive'
	| 'cameraMotionAmount'
	| 'cameraMotionSpeed'
	| 'cameraMotionDirection'
	| 'cameraMotionAudioChannel'
	| 'cameraMotionAudioInfluence'
	| 'cameraMotionTargets'
	| 'motionLayers'
	| 'activeMotionLayerId'
	| 'cameraShakeEnabled'
	| 'cameraShakeAmount'
	| 'cameraShakeChannel'
	| 'cameraShakeBandThresholds'
	| 'cameraShakeThreshold'
	| 'cameraShakeRetriggerMs'
	| 'cameraShakeSensitivity'
	| 'cameraShakeDecay'
	| 'cameraShakeFrequency'
	| 'cameraShakeRoughness'
	| 'cameraShakeMode'
	| 'cameraShakeTargets'
	| 'motionPaused'
>;

/** State Camera FX carries from one frame to the next. */
export type CameraFxRuntime = {
	/**
	 * Phase per motion layer. Each layer advances at its own speed and audio
	 * drive, so one clock for all of them would make adding a layer jump the
	 * others; layers that disappear simply stop being read.
	 */
	motionTimes: Record<string, number>;
	shakeTime: number;
	shakeEnergy: number;
	lastShakeLevel: number;
	lastShakeTriggerMs: number;
	snapDirection: 1 | -1;
};

export function createCameraFxRuntime(): CameraFxRuntime {
	return {
		motionTimes: {},
		shakeTime: 0,
		shakeEnergy: 0,
		lastShakeLevel: 0,
		lastShakeTriggerMs: -Infinity,
		snapDirection: 1
	};
}

export type CameraOffset = { tx: number; ty: number; scale: number };

/** One motion layer's contribution this frame, in the same order as the stack. */
export type CameraMotionFrameEntry = {
	layerId: string;
	targets: CameraMotionLayer[];
	offset: CameraOffset;
};

/** One frame of Camera FX, in CSS pixels of the viewport it was stepped for. */
export type CameraFxFrame = {
	motionActive: boolean;
	shakeActive: boolean;
	/**
	 * Every motion layer that moves something this frame, top-down. First match
	 * wins in `resolveCameraLayerOffset`: layers never blend.
	 */
	motions: CameraMotionFrameEntry[];
	/**
	 * The top-most layer's offset, kept for callers (and diagnostics) that only
	 * ask "how much is the camera moving" without caring about which layer.
	 */
	motion: CameraOffset;
	shake: CameraOffset;
};

const IDENTITY_OFFSET: CameraOffset = { tx: 0, ty: 0, scale: 1 };

function clamp(value: number, limit: number): number {
	return Math.max(-limit, Math.min(limit, value));
}

export function isCameraFxActive(settings: CameraFxSettings): boolean {
	return settings.cameraMotionEnabled || settings.cameraShakeEnabled;
}

/** The path shape, as an offset in pixels for a phase and amplitude. */
function motionOffsetForMode(
	mode: MotionLayerSettings['cameraMotionMode'],
	phase: number,
	amp: number
): { tx: number; ty: number } {
	switch (mode) {
		case 'drift':
			return {
				tx: Math.sin(phase) * amp,
				ty: Math.cos(phase * 0.7) * amp
			};
		case 'circle':
			return { tx: Math.cos(phase) * amp, ty: Math.sin(phase) * amp };
		case 'semicircle':
			return {
				tx: Math.cos(phase) * amp,
				ty: -Math.abs(Math.sin(phase)) * amp
			};
		case 'figure-eight':
			return {
				tx: Math.sin(phase) * amp,
				ty: Math.sin(phase * 2) * amp * 0.5
			};
		case 'orbit':
			return {
				tx: Math.cos(phase) * amp,
				ty: Math.sin(phase) * amp * 0.58
			};
		case 'pendulum':
			return {
				tx: Math.sin(phase) * amp,
				ty: Math.abs(Math.cos(phase)) * amp * 0.22
			};
		default:
			return { tx: 0, ty: 0 };
	}
}

/**
 * One motion layer stepped and turned into an offset.
 *
 * The zoom slack is per layer because the amplitude is: a layer that moves 96px
 * needs the scale that hides the edge it would otherwise expose, and a quieter
 * layer must not pay for it.
 */
function stepMotionLayer(
	runtime: CameraFxRuntime,
	settings: MotionLayerSettings,
	layerId: string,
	snapshot: AudioSnapshot | null,
	dtSec: number,
	paused: boolean,
	viewport: { width: number; height: number }
): CameraOffset {
	const minDim = Math.max(1, Math.min(viewport.width, viewport.height));
	const amp =
		Math.min(1.5, Math.max(0, settings.cameraMotionAmount)) *
		CAMERA_FX_CAPS.maxMotionPx;
	const scale = Math.min(
		CAMERA_FX_CAPS.maxScale,
		Math.max(1, 1 + amp / minDim)
	);
	const level = snapshot
		? Math.max(
				0,
				readFxChannel(snapshot, settings.cameraMotionAudioChannel)
			)
		: 0;
	const fixedRate =
		settings.cameraMotionDrive === 'fixed' ||
		settings.cameraMotionDrive === 'fixed-audio'
			? 1
			: 0;
	const audioRate =
		settings.cameraMotionDrive === 'audio' ||
		settings.cameraMotionDrive === 'fixed-audio'
			? Math.max(0, settings.cameraMotionAudioInfluence) * level
			: 0;
	const previous = runtime.motionTimes[layerId] ?? 0;
	const time = paused
		? previous
		: previous +
			dtSec *
				Math.max(0, settings.cameraMotionSpeed) *
				(fixedRate + audioRate);
	runtime.motionTimes[layerId] = time;
	const direction = settings.cameraMotionDirection === 'ccw' ? -1 : 1;
	const offset = motionOffsetForMode(
		settings.cameraMotionMode,
		time * direction,
		amp
	);
	const slackX = ((scale - 1) * viewport.width) / 2;
	const slackY = ((scale - 1) * viewport.height) / 2;
	return {
		tx: clamp(offset.tx, slackX),
		ty: clamp(offset.ty, slackY),
		scale
	};
}

export function stepCameraFx(
	runtime: CameraFxRuntime,
	state: CameraFxSettings,
	readAudio: () => AudioSnapshot | null,
	nowMs: number,
	dtSec: number,
	viewport: { width: number; height: number },
	random: () => number = Math.random
): CameraFxFrame {
	const w = viewport.width;
	const h = viewport.height;
	const minDim = Math.max(1, Math.min(w, h));
	// The stack already drops layers that are off, aimed at nothing or set to
	// `none`; the master switch gates the whole subsystem.
	const stack = state.cameraMotionEnabled
		? resolveMotionLayerStack(state)
		: [];
	const motionNeedsAudio = stack.some(
		layer =>
			layer.settings.cameraMotionDrive === 'audio' ||
			layer.settings.cameraMotionDrive === 'fixed-audio'
	);
	const snapshot =
		motionNeedsAudio || state.cameraShakeEnabled ? readAudio() : null;
	const shakeMax = state.cameraShakeEnabled
		? Math.min(3, Math.max(0, state.cameraShakeAmount)) *
			CAMERA_FX_CAPS.maxShakePx
		: 0;
	const shakeScale = Math.min(
		CAMERA_FX_CAPS.maxScale,
		Math.max(1, 1 + shakeMax / minDim)
	);
	const shakeSlackX = ((shakeScale - 1) * w) / 2;
	const shakeSlackY = ((shakeScale - 1) * h) / 2;

	runtime.shakeTime += dtSec;

	const motions: CameraMotionFrameEntry[] = stack.map(layer => ({
		layerId: layer.id,
		targets: layer.targets,
		offset: stepMotionLayer(
			runtime,
			layer.settings,
			layer.id,
			snapshot,
			dtSec,
			state.motionPaused,
			viewport
		)
	}));

	let txShake = 0;
	let tyShake = 0;
	if (state.cameraShakeEnabled && snapshot) {
		const level = Math.max(
			0,
			readFxChannel(snapshot, state.cameraShakeChannel)
		);
		const threshold = resolveFxThreshold(
			state.cameraShakeBandThresholds,
			state.cameraShakeChannel,
			state.cameraShakeThreshold
		);
		if (
			snapshot.bins.length > 0 &&
			shouldTriggerFxPeak({
				level,
				previousLevel: runtime.lastShakeLevel,
				threshold,
				nowMs,
				lastTriggerMs: runtime.lastShakeTriggerMs,
				retriggerMs: Math.max(20, state.cameraShakeRetriggerMs),
				minRise: 0.015
			})
		) {
			runtime.shakeEnergy = Math.max(
				runtime.shakeEnergy,
				Math.min(
					1,
					((level - threshold) / (1 - threshold)) *
						Math.max(0, state.cameraShakeSensitivity)
				)
			);
			runtime.lastShakeTriggerMs = nowMs;
			runtime.snapDirection = runtime.snapDirection === 1 ? -1 : 1;
		}
		runtime.lastShakeLevel = level;
		if (snapshot.bins.length === 0) {
			runtime.shakeEnergy = 0;
		} else {
			const decay = Math.min(
				0.999,
				Math.max(0.01, state.cameraShakeDecay)
			);
			runtime.shakeEnergy *= Math.pow(decay, dtSec * 60);
		}
		if (runtime.shakeEnergy < 0.001) runtime.shakeEnergy = 0;

		const mag = runtime.shakeEnergy * shakeMax;
		const phase =
			runtime.shakeTime *
			Math.max(1, state.cameraShakeFrequency) *
			Math.PI *
			2;
		const roughness = Math.max(0, Math.min(1, state.cameraShakeRoughness));
		const wave = Math.sin(phase);
		const noiseX = (random() * 2 - 1) * roughness;
		const noiseY = (random() * 2 - 1) * roughness;
		switch (state.cameraShakeMode) {
			case 'horizontal':
				txShake = (wave * (1 - roughness) + noiseX) * mag;
				break;
			case 'vertical':
				tyShake = (wave * (1 - roughness) + noiseY) * mag;
				break;
			case 'punch':
				tyShake = -Math.abs(wave) * mag;
				break;
			case 'jitter':
				txShake = noiseX * mag;
				tyShake = noiseY * mag;
				break;
			case 'kick-snap':
				txShake = runtime.snapDirection * mag;
				tyShake = -mag * 0.24;
				break;
			default:
				txShake = (wave * (1 - roughness) + noiseX) * mag;
				tyShake =
					(Math.cos(phase * 1.17) * (1 - roughness) + noiseY) * mag;
				break;
		}
	}

	return {
		motionActive: motions.length > 0,
		shakeActive: state.cameraShakeEnabled,
		motions,
		motion: motions[0]?.offset ?? IDENTITY_OFFSET,
		shake: {
			tx: clamp(txShake, shakeSlackX),
			ty: clamp(tyShake, shakeSlackY),
			scale: shakeScale
		}
	};
}

/**
 * The offset a layer gets this frame (translate, then scale about the
 * centre), or `null` when neither motion nor shake targets it.
 */
export function resolveCameraLayerOffset(
	frame: CameraFxFrame,
	settings: Pick<CameraFxSettings, 'cameraShakeTargets'>,
	layer: CameraMotionLayer
): CameraOffset | null {
	// First match wins, top-down: motion layers never blend, so the layer under
	// one that already claimed this target contributes nothing to it.
	const motion =
		frame.motions.find(entry =>
			cameraMotionTargetIncludes(entry.targets, layer)
		)?.offset ?? null;
	const shakeApplies =
		frame.shakeActive &&
		cameraMotionTargetIncludes(settings.cameraShakeTargets, layer);
	if (!motion && !shakeApplies) return null;
	return {
		tx: (motion?.tx ?? 0) + (shakeApplies ? frame.shake.tx : 0),
		ty: (motion?.ty ?? 0) + (shakeApplies ? frame.shake.ty : 0),
		scale: (motion?.scale ?? 1) * (shakeApplies ? frame.shake.scale : 1)
	};
}
