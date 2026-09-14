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
	motionTime: number;
	shakeTime: number;
	shakeEnergy: number;
	lastShakeLevel: number;
	lastShakeTriggerMs: number;
	snapDirection: 1 | -1;
};

export function createCameraFxRuntime(): CameraFxRuntime {
	return {
		motionTime: 0,
		shakeTime: 0,
		shakeEnergy: 0,
		lastShakeLevel: 0,
		lastShakeTriggerMs: -Infinity,
		snapDirection: 1
	};
}

export type CameraOffset = { tx: number; ty: number; scale: number };

/** One frame of Camera FX, in CSS pixels of the viewport it was stepped for. */
export type CameraFxFrame = {
	motionActive: boolean;
	shakeActive: boolean;
	motion: CameraOffset;
	shake: CameraOffset;
};

function clamp(value: number, limit: number): number {
	return Math.max(-limit, Math.min(limit, value));
}

export function isCameraFxActive(settings: CameraFxSettings): boolean {
	return settings.cameraMotionEnabled || settings.cameraShakeEnabled;
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
	const motionActive =
		state.cameraMotionEnabled && state.cameraMotionMode !== 'none';
	const motionNeedsAudio =
		motionActive &&
		(state.cameraMotionDrive === 'audio' ||
			state.cameraMotionDrive === 'fixed-audio');
	const snapshot =
		motionNeedsAudio || state.cameraShakeEnabled ? readAudio() : null;
	const motionMax = motionActive
		? Math.min(1.5, Math.max(0, state.cameraMotionAmount)) *
			CAMERA_FX_CAPS.maxMotionPx
		: 0;
	const shakeMax = state.cameraShakeEnabled
		? Math.min(3, Math.max(0, state.cameraShakeAmount)) *
			CAMERA_FX_CAPS.maxShakePx
		: 0;
	const motionScale = Math.min(
		CAMERA_FX_CAPS.maxScale,
		Math.max(1, 1 + motionMax / minDim)
	);
	const shakeScale = Math.min(
		CAMERA_FX_CAPS.maxScale,
		Math.max(1, 1 + shakeMax / minDim)
	);
	const motionSlackX = ((motionScale - 1) * w) / 2;
	const motionSlackY = ((motionScale - 1) * h) / 2;
	const shakeSlackX = ((shakeScale - 1) * w) / 2;
	const shakeSlackY = ((shakeScale - 1) * h) / 2;

	runtime.shakeTime += dtSec;

	let txMotion = 0;
	let tyMotion = 0;
	if (motionActive) {
		const level = snapshot
			? Math.max(
					0,
					readFxChannel(snapshot, state.cameraMotionAudioChannel)
				)
			: 0;
		const fixedRate =
			state.cameraMotionDrive === 'fixed' ||
			state.cameraMotionDrive === 'fixed-audio'
				? 1
				: 0;
		const audioRate =
			state.cameraMotionDrive === 'audio' ||
			state.cameraMotionDrive === 'fixed-audio'
				? Math.max(0, state.cameraMotionAudioInfluence) * level
				: 0;
		if (!state.motionPaused) {
			runtime.motionTime +=
				dtSec *
				Math.max(0, state.cameraMotionSpeed) *
				(fixedRate + audioRate);
		}
		const amp = motionMax;
		const direction = state.cameraMotionDirection === 'ccw' ? -1 : 1;
		const p = runtime.motionTime * direction;
		switch (state.cameraMotionMode) {
			case 'drift':
				txMotion = Math.sin(p) * amp;
				tyMotion = Math.cos(p * 0.7) * amp;
				break;
			case 'circle':
				txMotion = Math.cos(p) * amp;
				tyMotion = Math.sin(p) * amp;
				break;
			case 'semicircle':
				txMotion = Math.cos(p) * amp;
				tyMotion = -Math.abs(Math.sin(p)) * amp;
				break;
			case 'figure-eight':
				txMotion = Math.sin(p) * amp;
				tyMotion = Math.sin(p * 2) * amp * 0.5;
				break;
			case 'orbit':
				txMotion = Math.cos(p) * amp;
				tyMotion = Math.sin(p) * amp * 0.58;
				break;
			case 'pendulum':
				txMotion = Math.sin(p) * amp;
				tyMotion = Math.abs(Math.cos(p)) * amp * 0.22;
				break;
			default:
				break;
		}
	}
	txMotion = clamp(txMotion, motionSlackX);
	tyMotion = clamp(tyMotion, motionSlackY);

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
		motionActive,
		shakeActive: state.cameraShakeEnabled,
		motion: { tx: txMotion, ty: tyMotion, scale: motionScale },
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
	settings: Pick<
		CameraFxSettings,
		'cameraMotionTargets' | 'cameraShakeTargets'
	>,
	layer: CameraMotionLayer
): CameraOffset | null {
	const motionApplies =
		frame.motionActive &&
		cameraMotionTargetIncludes(settings.cameraMotionTargets, layer);
	const shakeApplies =
		frame.shakeActive &&
		cameraMotionTargetIncludes(settings.cameraShakeTargets, layer);
	if (!motionApplies && !shakeApplies) return null;
	return {
		tx:
			(motionApplies ? frame.motion.tx : 0) +
			(shakeApplies ? frame.shake.tx : 0),
		ty:
			(motionApplies ? frame.motion.ty : 0) +
			(shakeApplies ? frame.shake.ty : 0),
		scale:
			(motionApplies ? frame.motion.scale : 1) *
			(shakeApplies ? frame.shake.scale : 1)
	};
}
