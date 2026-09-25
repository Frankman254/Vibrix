/**
 * How a Camera Motion layer turns "the music" into speed.
 *
 * The naive version — rate = speed × influence × level — reads as a constant
 * on real material: a mastered mix sits between 0.55 and 0.8 almost all the
 * time, so the movement never visibly accelerates and never stops. The three
 * drive modes then feel identical, which is exactly what they were not
 * supposed to be.
 *
 * So the level is shaped before it drives anything:
 *   1. **Normalised against the track itself** with a slow peak follower and a
 *      slow floor follower, so a quiet track and a loud one both use the whole
 *      range without the user touching a dial.
 *   2. **Gated**: below the gate the result is exactly 0. This is what makes a
 *      drop-out read as a brake instead of a slow sag.
 *   3. **Expanded** with a power curve, so only the hits accelerate.
 *   4. **Slewed asymmetrically**: rising is smoothed (no jerk), falling is
 *      nearly instant (the brake the user asked for).
 *
 * Everything here is pure arithmetic over a mutable follower, so the live
 * preview and the offline export — which step the same code from frame 0 —
 * produce the same motion.
 */
import type { CameraMotionDrive } from './stageFxConfig';

export type MotionAudioFollower = {
	/** Slow-release maximum of the channel: the loud end of this track. */
	peak: number;
	/** Slow-rise minimum: the quiet end of this track. */
	floor: number;
	/** Last shaped output, for the asymmetric slew. */
	value: number;
};

export function createMotionAudioFollower(): MotionAudioFollower {
	return { peak: 0, floor: 0, value: 0 };
}

/** Below this much of the track's own range, the movement stops dead. */
export const MOTION_AUDIO_GATE = 0.18;
/** How fast the remembered peak decays, in units of level per second. */
const PEAK_RELEASE_PER_SEC = 0.35;
/** How fast the remembered floor climbs back up. */
const FLOOR_RISE_PER_SEC = 0.25;
/** Never divide by a range narrower than this (silence, or a limiter wall). */
const MIN_RANGE = 0.08;
/** > 1 pushes the quiet part down and leaves the hits up top. */
const EXPANSION = 1.8;
/** Rising smoothing, in 1/seconds. Higher = snappier attack. */
const ATTACK_PER_SEC = 20;
/** Falling smoothing. Much faster than the attack: this is the brake. */
const RELEASE_PER_SEC = 14;

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Advances the follower and returns the shaped 0..1 drive for this frame.
 * Mutates `follower`, like the rest of the Camera FX runtime.
 */
export function stepMotionAudioFollower(
	follower: MotionAudioFollower,
	level: number,
	dtSec: number
): number {
	const safeLevel = Number.isFinite(level) ? Math.max(0, level) : 0;
	const dt = Number.isFinite(dtSec) ? Math.max(0, dtSec) : 0;

	follower.peak = Math.max(
		safeLevel,
		follower.peak - dt * PEAK_RELEASE_PER_SEC
	);
	follower.floor = Math.min(
		safeLevel,
		follower.floor + dt * FLOOR_RISE_PER_SEC
	);

	const range = Math.max(MIN_RANGE, follower.peak - follower.floor);
	const normalised = clamp01((safeLevel - follower.floor) / range);
	// The gate is re-mapped rather than subtracted, so the first frame above it
	// starts from 0 and climbs: no visible jump at the threshold.
	const gated =
		normalised <= MOTION_AUDIO_GATE
			? 0
			: (normalised - MOTION_AUDIO_GATE) / (1 - MOTION_AUDIO_GATE);
	const target = Math.pow(gated, EXPANSION);

	const rate = target > follower.value ? ATTACK_PER_SEC : RELEASE_PER_SEC;
	const step = Math.min(1, dt * rate);
	follower.value = follower.value + (target - follower.value) * step;
	// Snap the tail so a stopped movement is actually stopped.
	if (target === 0 && follower.value < 0.01) follower.value = 0;
	return follower.value;
}

/**
 * Phase advance per second for a layer, in the same units the motion modes
 * expect. The three drives are genuinely different shapes, which is the point:
 *
 * | Drive         | What `speed` means | At silence      |
 * | ------------- | ------------------ | --------------- |
 * | `fixed`       | the speed          | keeps moving    |
 * | `audio`       | the **ceiling**    | **stopped**     |
 * | `fixed-audio` | the **floor**      | keeps moving    |
 */
export function resolveMotionRate(
	drive: CameraMotionDrive,
	speed: number,
	audioInfluence: number,
	shapedLevel: number
): number {
	const safeSpeed = Math.max(0, Number.isFinite(speed) ? speed : 0);
	const influence = Math.max(
		0,
		Number.isFinite(audioInfluence) ? audioInfluence : 0
	);
	const shaped = clamp01(shapedLevel);
	if (drive === 'audio') return safeSpeed * clamp01(influence * shaped);
	if (drive === 'fixed-audio') return safeSpeed * (1 + influence * shaped);
	return safeSpeed;
}
