/**
 * Which Looks stack applies to a given visual layer.
 *
 * Every renderer used to ask the same question inline —
 * `state.filterTargets.includes('spectrum')` — and then read the global
 * `filter*` keys straight off the state. That works while there is exactly one
 * look in the app, but it is why a user cannot keep a CRT treatment on the
 * background while the spectrum gets its own: the values are shared, so the
 * target list is a choice between layers rather than a composition of them.
 *
 * Routing every consumer through this module puts that decision in one place.
 * The behaviour here is still one stack for every target; the seam is what
 * lets the stack become per-layer without touching eight renderers again.
 */
import {
	FILTER_LOOK_PRESET_KEYS,
	type FilterLookSettings
} from '@/features/filterLooks/filterLooks';
import type { FilterTarget, WallpaperState } from '@/types/wallpaper';

/** The state a caller must hand over to resolve a stack. */
export type FilterStackSource = Pick<
	WallpaperState,
	'filterTargets' | (typeof FILTER_LOOK_PRESET_KEYS)[number]
>;

/**
 * True when this layer is painted through the Looks stack.
 *
 * Callers that only scale a single dial (rain intensity, particle opacity)
 * want this; callers that run the whole post-process want `resolveFilterStack`.
 */
export function isFilterTargetActive(
	state: Pick<WallpaperState, 'filterTargets'>,
	target: FilterTarget
): boolean {
	return state.filterTargets.includes(target);
}

/**
 * The Looks values for this layer, or `null` when the layer is untouched.
 *
 * Returns a copy: callers must not write through it, and a future per-layer
 * stack will not have a single object to hand back.
 */
export function resolveFilterStack(
	state: FilterStackSource,
	target: FilterTarget
): FilterLookSettings | null {
	if (!isFilterTargetActive(state, target)) return null;
	const stack = {} as Record<string, unknown>;
	for (const key of FILTER_LOOK_PRESET_KEYS) stack[key] = state[key];
	return stack as FilterLookSettings;
}
