/**
 * Which Looks stack applies to a given visual layer.
 *
 * Every renderer used to ask the same question inline —
 * `state.filterTargets.includes('spectrum')` — and then read the global
 * `filter*` keys straight off the state. That is why the Looks tab used to be
 * a choice between layers instead of a composition of them: the values were
 * shared, so aiming the treatment at the spectrum took it away from the
 * background.
 *
 * Now the answer comes from `effectLayers`: the first enabled layer that names
 * the target paints it, and each layer carries its own values. The active
 * layer is the exception every caller would get wrong on its own — its live
 * values are the legacy `filter*` keys, not its (stale) array entry — which is
 * the whole reason renderers go through here.
 */
import {
	FILTER_LOOK_PRESET_KEYS,
	type FilterLookSettings
} from '@/features/filterLooks/filterLooks';
import { findEffectLayerForTarget } from '@/features/filterLooks/effectLayers';
import type { FilterTarget, WallpaperState } from '@/types/wallpaper';

/** The state a caller must hand over to resolve a stack. */
export type FilterStackSource = Pick<
	WallpaperState,
	| 'effectLayers'
	| 'activeEffectLayerId'
	| 'filterTargets'
	| (typeof FILTER_LOOK_PRESET_KEYS)[number]
>;

function extractActiveStack(state: FilterStackSource): FilterLookSettings {
	const stack = {} as Record<string, unknown>;
	for (const key of FILTER_LOOK_PRESET_KEYS) stack[key] = state[key];
	return stack as FilterLookSettings;
}

/**
 * True when this layer is painted through some effect layer.
 *
 * Callers that only scale a single dial (rain intensity, particle opacity)
 * want this; callers that run the whole post-process want `resolveFilterStack`
 * so they read the winning layer's values rather than the active layer's.
 */
export function isFilterTargetActive(
	state: Pick<
		WallpaperState,
		'effectLayers' | 'activeEffectLayerId' | 'filterTargets'
	>,
	target: FilterTarget
): boolean {
	return findEffectLayerForTarget(state as WallpaperState, target) !== null;
}

/**
 * One Looks value for this layer, or `null` when nothing targets it.
 *
 * For renderers that scale a single dial (rain intensity, particle opacity)
 * and have no business picking up the other twenty-four keys just to satisfy
 * a type.
 */
export function resolveFilterValue<K extends keyof FilterLookSettings>(
	state: Pick<
		WallpaperState,
		'effectLayers' | 'activeEffectLayerId' | 'filterTargets'
	> &
		Pick<WallpaperState, K>,
	target: FilterTarget,
	key: K
): WallpaperState[K] | null {
	const layer = findEffectLayerForTarget(state as WallpaperState, target);
	if (!layer) return null;
	if (layer.id !== state.activeEffectLayerId) return layer.settings[key];
	const active: Pick<WallpaperState, K> = state;
	return active[key];
}

/**
 * The Looks values for this layer, or `null` when nothing targets it.
 *
 * Returns a fresh object for the active layer (its values live on the state)
 * and the layer's own settings otherwise. Callers must not write through it.
 */
export function resolveFilterStack(
	state: FilterStackSource,
	target: FilterTarget
): FilterLookSettings | null {
	const layer = findEffectLayerForTarget(state as WallpaperState, target);
	if (!layer) return null;
	return layer.id === state.activeEffectLayerId
		? extractActiveStack(state)
		: layer.settings;
}
