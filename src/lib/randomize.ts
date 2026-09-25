/**
 * Shared randomization helpers for the "Randomize as a starting point" buttons
 * (spectrum, looks, motion). The goal is *believable* presets: values stay
 * inside the real slider ranges and dependent pairs (min/max, etc.) keep a sane
 * relationship so a roll never produces an invisible or inert result.
 */

import type { SliderRange } from '@/config/ranges';

export function randomChoice<T>(options: readonly T[]): T {
	return options[Math.floor(Math.random() * options.length)];
}

export function randomFloat(min: number, max: number): number {
	return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** True with the given probability (0–1). `randomChance(0.7)` ≈ 70% true. */
export function randomChance(probability: number): boolean {
	return Math.random() < probability;
}

/** Round to the slider's step and clamp to its [min, max]. */
export function snapToRange(value: number, range: SliderRange): number {
	const clamped = Math.max(range.min, Math.min(range.max, value));
	if (range.step <= 0) return clamped;
	const stepped =
		Math.round((clamped - range.min) / range.step) * range.step + range.min;
	return Number(stepped.toFixed(6));
}

/** A float within the slider range, optionally restricted to a sub-window. */
export function randomInRange(
	range: SliderRange,
	window?: { min?: number; max?: number }
): number {
	const lo = Math.max(range.min, window?.min ?? range.min);
	const hi = Math.min(range.max, window?.max ?? range.max);
	return snapToRange(randomFloat(lo, hi), range);
}

/**
 * A vivid, readable HSL color. Saturation/lightness windows avoid the muddy
 * extremes (near-black, near-white, washed-out) so randomized palettes always
 * read on screen.
 */
export function randomVividColor(): string {
	const hue = randomInt(0, 360);
	const saturation = randomInt(65, 100);
	const lightness = randomInt(45, 62);
	return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
