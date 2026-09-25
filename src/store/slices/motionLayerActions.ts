/**
 * Store actions for the motion-layer stack.
 *
 * Every action starts by calling `syncActiveMotionLayer`: the active layer's
 * live values are the flat `cameraMotion*` keys, so writing `motionLayers`
 * without folding those in first silently discards whatever the user had just
 * dialled in. See `features/stageFx/motionLayers.ts` for the invariant.
 */
import type { StateCreator } from 'zustand';
import {
	createMotionLayerId,
	extractMotionLayerSettingsFromState,
	motionLayerToStatePatch,
	syncActiveMotionLayer,
	MAX_MOTION_LAYER_COUNT
} from '@/features/stageFx/motionLayers';
import type { MotionLayer } from '@/types/wallpaper';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];

export function createMotionLayerActions(set: WallpaperSet) {
	return {
		addMotionLayer: () =>
			set(state => {
				const layers = syncActiveMotionLayer(state);
				if (layers.length >= MAX_MOTION_LAYER_COUNT) {
					return { motionLayers: layers };
				}
				// A new layer starts empty on purpose: it moves nothing until
				// the user aims it. Copying the current targets would steal
				// them from the layer that has them (first match wins).
				const created: MotionLayer = {
					id: createMotionLayerId(),
					name: '',
					enabled: true,
					targets: [],
					// The current dials, so becoming the active layer does not
					// move a single slider — only the target list changes.
					settings: extractMotionLayerSettingsFromState(state)
				};
				return {
					motionLayers: [...layers, created],
					activeMotionLayerId: created.id,
					...motionLayerToStatePatch(created)
				};
			}),
		duplicateMotionLayer: id =>
			set(state => {
				const layers = syncActiveMotionLayer(state);
				const source = layers.find(layer => layer.id === id);
				if (!source || layers.length >= MAX_MOTION_LAYER_COUNT) {
					return { motionLayers: layers };
				}
				// The copy keeps the values but drops the targets, for the same
				// reason `addMotionLayer` starts empty.
				const created: MotionLayer = {
					...source,
					id: createMotionLayerId(),
					targets: []
				};
				const index = layers.indexOf(source);
				return {
					motionLayers: [
						...layers.slice(0, index + 1),
						created,
						...layers.slice(index + 1)
					],
					activeMotionLayerId: created.id,
					...motionLayerToStatePatch(created)
				};
			}),
		removeMotionLayer: id =>
			set(state => {
				const layers = syncActiveMotionLayer(state);
				if (layers.length <= 1) return { motionLayers: layers };
				const next = layers.filter(layer => layer.id !== id);
				if (next.length === layers.length) {
					return { motionLayers: layers };
				}
				if (id !== state.activeMotionLayerId) {
					return { motionLayers: next };
				}
				// Removing the layer being edited hands the flat keys over to
				// whichever layer takes its place, so the Motion tab is never
				// left editing something that no longer exists.
				return {
					motionLayers: next,
					activeMotionLayerId: next[0].id,
					...motionLayerToStatePatch(next[0])
				};
			}),
		selectMotionLayer: id =>
			set(state => {
				if (id === state.activeMotionLayerId) return state;
				const layers = syncActiveMotionLayer(state);
				const target = layers.find(layer => layer.id === id);
				if (!target) return { motionLayers: layers };
				return {
					motionLayers: layers,
					activeMotionLayerId: id,
					...motionLayerToStatePatch(target)
				};
			}),
		setMotionLayerEnabled: (id, enabled) =>
			set(state => ({
				motionLayers: syncActiveMotionLayer(state).map(layer =>
					layer.id === id ? { ...layer, enabled } : layer
				)
			})),
		renameMotionLayer: (id, name) =>
			set(state => ({
				motionLayers: syncActiveMotionLayer(state).map(layer =>
					layer.id === id ? { ...layer, name } : layer
				)
			})),
		claimMotionTarget: target =>
			set(state => {
				const layers = syncActiveMotionLayer(state);
				// One target, one owner. The chip the user pressed belongs to
				// another layer, so hand it over instead of letting both name
				// it and having the top one silently mask the other.
				const targets = state.cameraMotionTargets.includes(target)
					? state.cameraMotionTargets
					: [...state.cameraMotionTargets, target];
				return {
					motionLayers: layers.map(layer =>
						layer.id === state.activeMotionLayerId
							? { ...layer, targets }
							: {
									...layer,
									targets: layer.targets.filter(
										item => item !== target
									)
								}
					),
					cameraMotionTargets: targets,
					cameraMotionTarget: targets[0] ?? 'background'
				};
			}),
		moveMotionLayer: (id, direction) =>
			set(state => {
				const layers = syncActiveMotionLayer(state);
				const index = layers.findIndex(layer => layer.id === id);
				const nextIndex = direction === 'up' ? index - 1 : index + 1;
				if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) {
					return { motionLayers: layers };
				}
				const next = [...layers];
				[next[index], next[nextIndex]] = [next[nextIndex], next[index]];
				return { motionLayers: next };
			})
	} satisfies Partial<WallpaperStore>;
}
