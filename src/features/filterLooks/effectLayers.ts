/**
 * Effect layers: several Looks treatments alive at once, each with its own
 * values and its own target layers.
 *
 * The one rule worth knowing before reading anything here: **the active
 * layer's live values are the legacy `filter*` keys on the state, not its
 * entry in `effectLayers`.** Every setter in the Looks tab, every factory
 * look, the randomizer, the looks profile slots, presets and scenes all write
 * those keys, and they kept working untouched when layers landed. The entry in
 * the array is a snapshot refreshed whenever the layer stops being active —
 * which is what `syncActiveEffectLayer` does, and why nothing outside this
 * module should index the array to read values.
 */
import {
	extractFilterLookSettingsFromState,
	type FilterLookSettings
} from '@/features/filterLooks/filterLooks';
import type { EffectLayer, WallpaperState } from '@/types/wallpaper';

export const DEFAULT_EFFECT_LAYER_ID = 'effect-layer-1';

/**
 * Each active layer costs a full-screen offscreen canvas per targeted
 * subsystem, so this is a performance ceiling, not a licence check.
 */
export const MAX_EFFECT_LAYER_COUNT = 6;

export type EffectLayerStateSource = WallpaperState;

export function createEffectLayerId(): string {
	return `effect-layer-${Math.random().toString(36).slice(2, 10)}`;
}

/** The layer every project starts with: the legacy single stack. */
export function createDefaultEffectLayer(
	settings: FilterLookSettings,
	targets: EffectLayer['targets'],
	lookId: string | null
): EffectLayer {
	return {
		id: DEFAULT_EFFECT_LAYER_ID,
		name: '',
		enabled: true,
		targets,
		lookId,
		settings
	};
}

/**
 * The array with the active layer's snapshot brought up to date.
 *
 * Call it before writing `effectLayers` for any reason — adding, removing,
 * reordering, switching — or the edits the user just made to the active layer
 * are silently dropped.
 */
export function syncActiveEffectLayer(
	state: EffectLayerStateSource
): EffectLayer[] {
	const settings = extractFilterLookSettingsFromState(state);
	return state.effectLayers.map(layer =>
		layer.id === state.activeEffectLayerId
			? {
					...layer,
					targets: [...state.filterTargets],
					lookId: state.activeFilterLookId,
					settings
				}
			: layer
	);
}

/** The legacy keys that must follow when a different layer becomes active. */
export function effectLayerToStatePatch(
	layer: EffectLayer
): FilterLookSettings &
	Pick<WallpaperState, 'filterTargets' | 'activeFilterLookId'> {
	return {
		...layer.settings,
		filterTargets: [...layer.targets],
		activeFilterLookId: layer.lookId
	};
}

/**
 * The target list to judge a layer by.
 *
 * For the active layer that is `state.filterTargets`, not its snapshot: the
 * target checkboxes, every preset, scene and project import write the legacy
 * key, and a stale snapshot would make those writes look like they did nothing
 * until the user switched layers.
 */
function layerTargets(
	state: EffectLayerStateSource,
	layer: EffectLayer
): EffectLayer['targets'] {
	return layer.id === state.activeEffectLayerId
		? state.filterTargets
		: layer.targets;
}

/**
 * The layer that paints `target`, or null when nothing does.
 *
 * First match wins: layers are ordered top-down and never blend. Turning a
 * layer off falls through to the next one that names the target, the way
 * hiding a layer in an image editor reveals what is under it.
 */
export function findEffectLayerForTarget(
	state: EffectLayerStateSource,
	target: EffectLayer['targets'][number]
): EffectLayer | null {
	for (const layer of state.effectLayers) {
		if (!layer.enabled) continue;
		if (layerTargets(state, layer).includes(target)) return layer;
	}
	return null;
}
