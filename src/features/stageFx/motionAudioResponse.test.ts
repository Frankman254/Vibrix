import { describe, expect, it } from 'vitest';
import {
	createMotionAudioFollower,
	resolveMotionRate,
	stepMotionAudioFollower
} from './motionAudioResponse';

const DT = 1 / 60;

/** Feeds a constant level for `seconds` and returns the last shaped value. */
function settle(
	level: number,
	seconds: number,
	follower = createMotionAudioFollower()
) {
	let last = 0;
	for (let i = 0; i < Math.round(seconds / DT); i++) {
		last = stepMotionAudioFollower(follower, level, DT);
	}
	return { last, follower };
}

describe('stepMotionAudioFollower', () => {
	it('settles at zero on a level that never changes', () => {
		// The complaint that started this: a mastered mix sits near 0.7 for
		// minutes, and a raw multiply turns that into a constant speed.
		expect(settle(0.7, 6).last).toBeLessThan(0.05);
	});

	it('opens up when the level jumps above the track floor', () => {
		const { follower } = settle(0.3, 3);
		let shaped = 0;
		for (let i = 0; i < 12; i++) {
			shaped = stepMotionAudioFollower(follower, 0.95, DT);
		}
		expect(shaped).toBeGreaterThan(0.3);
	});

	it('brakes to a dead stop when the channel drops out', () => {
		const { follower } = settle(0.3, 3);
		for (let i = 0; i < 20; i++)
			stepMotionAudioFollower(follower, 0.95, DT);
		let shaped = 1;
		for (let i = 0; i < 30; i++) {
			shaped = stepMotionAudioFollower(follower, 0, DT);
		}
		expect(shaped).toBe(0);
	});

	it('falls faster than it rises', () => {
		const rising = createMotionAudioFollower();
		settle(0.2, 2, rising);
		const up: number[] = [];
		for (let i = 0; i < 6; i++)
			up.push(stepMotionAudioFollower(rising, 1, DT));
		const down: number[] = [];
		for (let i = 0; i < 6; i++)
			down.push(stepMotionAudioFollower(rising, 0, DT));
		const riseStep = up[1]! - up[0]!;
		const fallStep = down[0]! - down[1]!;
		// Rising is smoothed over more frames than falling is.
		expect(fallStep / Math.max(riseStep, 1e-6)).toBeGreaterThan(0.5);
		expect(down.at(-1)!).toBeLessThan(up.at(-1)!);
	});

	it('survives a broken level or dt without producing NaN', () => {
		const follower = createMotionAudioFollower();
		expect(stepMotionAudioFollower(follower, Number.NaN, Number.NaN)).toBe(
			0
		);
		expect(stepMotionAudioFollower(follower, -5, DT)).toBe(0);
	});
});

describe('resolveMotionRate', () => {
	it('ignores the audio entirely in fixed', () => {
		expect(resolveMotionRate('fixed', 2, 3, 1)).toBe(2);
		expect(resolveMotionRate('fixed', 2, 3, 0)).toBe(2);
	});

	it('stops dead in audio when the shaped level is zero', () => {
		expect(resolveMotionRate('audio', 2, 3, 0)).toBe(0);
	});

	it('treats speed as a ceiling in audio', () => {
		// influence 3 x shaped 1 saturates, so the dial is the top speed and
		// not a multiplier that runs away.
		expect(resolveMotionRate('audio', 2, 3, 1)).toBe(2);
		expect(resolveMotionRate('audio', 2, 1, 0.5)).toBe(1);
	});

	it('treats speed as a floor in fixed-audio', () => {
		expect(resolveMotionRate('fixed-audio', 2, 3, 0)).toBe(2);
		expect(resolveMotionRate('fixed-audio', 2, 1, 1)).toBe(4);
	});

	it('never returns a negative rate', () => {
		expect(resolveMotionRate('audio', -2, -3, 1)).toBe(0);
	});
});
