/**
 * Motion layers: several Camera Motion movements alive at once, each with its
 * own values and its own set of target layers.
 *
 * This is `features/filterLooks/effectLayers.ts` applied to Camera Motion, and
 * it carries the same one rule: **the active layer's live values are the flat
 * `cameraMotion*` keys on the state, not its entry in `motionLayers`.** Every
 * setter in the Motion tab, the Camera FX profile slots, scenes and presets
 * write those keys and kept working untouched when layers landed. The entry in
 * the array is a snapshot refreshed whenever the layer stops being active —
 * that is what `syncActiveMotionLayer` does, and why nothing outside this
 * module should index the array to read values.
 *
 * Why it exists: before layers there was a single movement plus a target list,
 * so a drifting background and an orbiting logo were an impossible request —
 * the list chose between them. Values never blend across layers: two movements
 * multiplied into one transform is not something a user can predict, so the
 * first layer that names a target owns it, top-down.
 */
import type {
	MotionLayer,
	MotionLayerSettings,
	WallpaperState
} from '@/types/wallpaper';

export type { MotionLayerSettings };

export const DEFAULT_MOTION_LAYER_ID = 'motion-layer-1';

/**
 * A layer is a transform, not a canvas, so this ceiling is about a readable
 * list rather than the frame budget — mirrors `MAX_EFFECT_LAYER_COUNT`.
 */
export const MAX_MOTION_LAYER_COUNT = 6;

export type MotionLayerStateSource = Pick<
	WallpaperState,
	| keyof MotionLayerSettings
	| 'motionLayers'
	| 'activeMotionLayerId'
	| 'cameraMotionTargets'
>;

/**
 * The minimum a caller needs to answer "who moves this target?", so the Motion
 * tab does not have to subscribe to the whole store to draw the owner chips.
 */
export type MotionLayerTargetSource = Pick<
	WallpaperState,
	'motionLayers' | 'activeMotionLayerId' | 'cameraMotionTargets'
>;

export function createMotionLayerId(): string {
	return `motion-layer-${Math.random().toString(36).slice(2, 10)}`;
}

export function extractMotionLayerSettingsFromState(
	state: MotionLayerSettings
): MotionLayerSettings {
	return {
		cameraMotionMode: state.cameraMotionMode,
		cameraMotionAmount: state.cameraMotionAmount,
		cameraMotionSpeed: state.cameraMotionSpeed,
		cameraMotionDrive: state.cameraMotionDrive,
		cameraMotionAudioInfluence: state.cameraMotionAudioInfluence,
		cameraMotionAudioChannel: state.cameraMotionAudioChannel,
		cameraMotionDirection: state.cameraMotionDirection
	};
}

/** The layer every project starts with: the legacy single movement. */
export function createDefaultMotionLayer(
	settings: MotionLayerSettings,
	targets: MotionLayer['targets']
): MotionLayer {
	return {
		id: DEFAULT_MOTION_LAYER_ID,
		name: '',
		enabled: true,
		targets,
		settings
	};
}

/**
 * The array with the active layer's snapshot brought up to date.
 *
 * Call it before writing `motionLayers` for any reason — adding, removing,
 * reordering, switching — or the dials the user just moved are silently lost.
 */
export function syncActiveMotionLayer(
	state: MotionLayerStateSource
): MotionLayer[] {
	const settings = extractMotionLayerSettingsFromState(state);
	return state.motionLayers.map(layer =>
		layer.id === state.activeMotionLayerId
			? { ...layer, targets: [...state.cameraMotionTargets], settings }
			: layer
	);
}

/** The flat keys that must follow when a different layer becomes active. */
export function motionLayerToStatePatch(
	layer: MotionLayer
): MotionLayerSettings &
	Pick<WallpaperState, 'cameraMotionTargets' | 'cameraMotionTarget'> {
	return {
		...layer.settings,
		cameraMotionTargets: [...layer.targets],
		// Kept in step with the array for the deprecated scalar readers.
		cameraMotionTarget: layer.targets[0] ?? 'background'
	};
}

/**
 * The target list to judge a layer by: for the active layer that is
 * `state.cameraMotionTargets`, not its snapshot, because presets, scenes and
 * project imports write the flat key and a stale snapshot would make those
 * writes look like they did nothing until the user switched layers.
 */
export function motionLayerTargets(
	state: MotionLayerTargetSource,
	layer: MotionLayer
): MotionLayer['targets'] {
	return layer.id === state.activeMotionLayerId
		? state.cameraMotionTargets
		: layer.targets;
}

/**
 * The layer that moves `target`, or null when nothing does. First match wins:
 * layers are ordered top-down and never blend, so turning one off falls
 * through to the next that names the target.
 */
export function findMotionLayerForTarget(
	state: MotionLayerTargetSource,
	target: MotionLayer['targets'][number]
): MotionLayer | null {
	for (const layer of state.motionLayers) {
		if (!layer.enabled) continue;
		if (motionLayerTargets(state, layer).includes(target)) return layer;
	}
	return null;
}

/**
 * The layers a frame has to step, top-down, with the active layer's snapshot
 * replaced by its live flat keys. Layers that are off, aimed at nothing or set
 * to `none` are dropped here so the stepper never allocates for them.
 */
export function resolveMotionLayerStack(state: MotionLayerStateSource): Array<{
	id: string;
	targets: MotionLayer['targets'];
	settings: MotionLayerSettings;
}> {
	const live = extractMotionLayerSettingsFromState(state);
	const stack: Array<{
		id: string;
		targets: MotionLayer['targets'];
		settings: MotionLayerSettings;
	}> = [];
	for (const layer of state.motionLayers) {
		if (!layer.enabled) continue;
		const isActive = layer.id === state.activeMotionLayerId;
		const settings = isActive ? live : layer.settings;
		const targets = isActive ? state.cameraMotionTargets : layer.targets;
		if (targets.length === 0) continue;
		if (settings.cameraMotionMode === 'none') continue;
		stack.push({ id: layer.id, targets, settings });
	}
	return stack;
}
