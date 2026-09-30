/**
 * «Invert on low energy» for Camera Motion: the movement retraces its path
 * while the music is quiet, the direct analogue of the spectrum's radial
 * rotation invert.
 *
 * The two properties worth protecting are the debounce (a transient must not
 * flip the sign) and the fact that the flip is smooth — it is applied to the
 * clock, not to the position read from it, so the layer turns around instead of
 * teleporting to the mirrored point of the path.
 */
import { describe, expect, it } from 'vitest';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { WallpaperState } from '@/types/wallpaper';
import { createCameraFxRuntime, stepCameraFx } from './cameraFxDraw';
import { createDefaultMotionLayer } from './motionLayers';

const VIEWPORT = { width: 1920, height: 1080 };
const DT = 1 / 60;

function snapshotAt(amplitude: number): AudioSnapshot {
	return {
		bins: new Uint8Array(8),
		amplitude,
		peak: amplitude,
		channels: {} as AudioSnapshot['channels'],
		timestampMs: 0
	};
}

function stateFor(patch: Partial<WallpaperState>): WallpaperState {
	const settings = {
		...DEFAULT_STATE,
		cameraMotionMode: 'circle' as const,
		cameraMotionAmount: 1,
		cameraMotionRange: 1,
		cameraMotionSpeed: 2,
		cameraMotionDrive: 'fixed' as const,
		cameraMotionAudioInfluence: 0,
		cameraMotionAmplitudeAudio: 0,
		cameraMotionAudioChannel: 'full' as const,
		cameraMotionDirection: 'cw' as const,
		cameraMotionInvertOnLowEnergy: true,
		cameraMotionInvertThreshold: 0.08,
		cameraMotionInvertHoldMs: 180,
		cameraMotionEdgeZoom: 0,
		cameraMotionSmoothing: 0,
		cameraMotionTrail: 0,
		cameraMotionTrailColor: '#ffffff',
		...patch
	};
	return {
		...settings,
		cameraMotionEnabled: true,
		cameraShakeEnabled: false,
		motionPaused: patch.motionPaused ?? false,
		cameraMotionTargets: ['logo'],
		motionLayers: [createDefaultMotionLayer(settings, ['logo'])]
	} as WallpaperState;
}

/**
 * Runs `levels` one frame each and returns the horizontal position after every
 * frame. A loud stretch first: the follower normalises against the track's own
 * range, so the movement has to have heard something loud before silence means
 * anything.
 */
function walk(patch: Partial<WallpaperState>, levels: readonly number[]) {
	const state = stateFor(patch);
	const runtime = createCameraFxRuntime();
	const path: number[] = [];
	levels.forEach((level, index) => {
		const frame = stepCameraFx(
			runtime,
			state,
			() => snapshotAt(level),
			index * 1000 * DT,
			DT,
			VIEWPORT
		);
		path.push(frame.motion.tx);
	});
	return path;
}

const LOUD = Array.from({ length: 60 }, () => 1);
const QUIET = Array.from({ length: 120 }, () => 0);

describe('camera motion invert on low energy', () => {
	it('keeps going forward while the toggle is off', () => {
		const path = walk({ cameraMotionInvertOnLowEnergy: false }, [
			...LOUD,
			...QUIET
		]);
		// A circle read forward never repeats a position twice in a row at the
		// same point going the other way: the total travel keeps growing.
		const forward = path.slice(LOUD.length + 40);
		const turns = forward.filter(
			(tx, i) =>
				i > 1 &&
				Math.sign(tx - forward[i - 1]) !==
					Math.sign(forward[i - 1] - forward[i - 2])
		).length;
		// A plain circle turns twice per lap, no more.
		expect(turns).toBeLessThanOrEqual(2);
	});

	it('retraces the path once the quiet has held', () => {
		const path = walk({}, [...LOUD, ...QUIET]);
		// Right after the flip the layer is walking back towards where it came
		// from, so the position it reaches is one it already visited.
		const flipped = path.slice(LOUD.length + 30, LOUD.length + 60);
		const before = path.slice(LOUD.length - 30, LOUD.length);
		const closest = Math.min(
			...flipped.map(tx => Math.min(...before.map(b => Math.abs(tx - b))))
		);
		expect(closest).toBeLessThan(1);
	});

	it('does not flip on a transient shorter than the hold', () => {
		// One frame of silence in the middle of a loud stretch: 16 ms against a
		// 180 ms hold, so nothing may turn around.
		const withBlip = [...LOUD, 0, ...LOUD];
		const straight = [...LOUD, 1, ...LOUD];
		expect(walk({}, withBlip).at(-1)).toBeCloseTo(
			walk({ cameraMotionInvertOnLowEnergy: false }, straight).at(-1) ??
				0,
			5
		);
	});

	it('flips immediately when the hold is zero', () => {
		const held = walk({}, [...LOUD, ...QUIET]);
		const instant = walk({ cameraMotionInvertHoldMs: 0 }, [
			...LOUD,
			...QUIET
		]);
		// Same audio, same path: the only difference is when the turn happened,
		// so the two positions must not agree after the quiet starts.
		expect(instant.at(-1)).not.toBeCloseTo(held.at(-1) ?? 0, 3);
	});

	it('never moves while the movement is paused', () => {
		const path = walk({ motionPaused: true }, [...LOUD, ...QUIET]);
		expect(new Set(path.map(tx => tx.toFixed(6))).size).toBe(1);
	});
});
