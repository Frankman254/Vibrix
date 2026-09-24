/**
 * Store actions for the effect-layer stack.
 *
 * Every action starts by calling `syncActiveEffectLayer`: the active layer's
 * live values are the legacy `filter*` keys, so writing `effectLayers` without
 * folding those in first silently discards whatever the user had just dialled
 * in. See `features/filterLooks/effectLayers.ts` for the invariant.
 */
import type { StateCreator } from 'zustand';
import { extractFilterLookSettingsFromState } from '@/features/filterLooks/filterLooks';
import {
	createEffectLayerId,
	effectLayerToStatePatch,
	syncActiveEffectLayer,
	MAX_EFFECT_LAYER_COUNT
} from '@/features/filterLooks/effectLayers';
import type { EffectLayer } from '@/types/wallpaper';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];

export function createEffectLayerActions(set: WallpaperSet) {
	return {
		addEffectLayer: () =>
			set(state => {
				const layers = syncActiveEffectLayer(state);
				if (layers.length >= MAX_EFFECT_LAYER_COUNT) {
					return { effectLayers: layers };
				}
				// A new layer starts empty on purpose: it targets nothing, so
				// adding one never changes a single pixel until the user aims
				// it. Copying the current targets would steal them from the
				// layer that has them (first match wins).
				const created: EffectLayer = {
					id: createEffectLayerId(),
					name: '',
					enabled: true,
					targets: [],
					lookId: null,
					// The current dials, so becoming the active layer does not
					// move a single slider — only the target list changes.
					settings: extractFilterLookSettingsFromState(state)
				};
				return {
					effectLayers: [...layers, created],
					activeEffectLayerId: created.id,
					...effectLayerToStatePatch(created)
				};
			}),
		duplicateEffectLayer: id =>
			set(state => {
				const layers = syncActiveEffectLayer(state);
				const source = layers.find(layer => layer.id === id);
				if (!source || layers.length >= MAX_EFFECT_LAYER_COUNT) {
					return { effectLayers: layers };
				}
				// The copy keeps the values but drops the targets, for the same
				// reason `addEffectLayer` starts empty.
				const created: EffectLayer = {
					...source,
					id: createEffectLayerId(),
					name: source.name,
					targets: []
				};
				const index = layers.indexOf(source);
				return {
					effectLayers: [
						...layers.slice(0, index + 1),
						created,
						...layers.slice(index + 1)
					],
					activeEffectLayerId: created.id,
					...effectLayerToStatePatch(created)
				};
			}),
		removeEffectLayer: id =>
			set(state => {
				const layers = syncActiveEffectLayer(state);
				if (layers.length <= 1) return { effectLayers: layers };
				const next = layers.filter(layer => layer.id !== id);
				if (next.length === layers.length) {
					return { effectLayers: layers };
				}
				if (id !== state.activeEffectLayerId) {
					return { effectLayers: next };
				}
				// Removing the layer being edited hands the legacy keys over to
				// whichever layer takes its place, so the Looks tab is never
				// left editing something that no longer exists.
				return {
					effectLayers: next,
					activeEffectLayerId: next[0].id,
					...effectLayerToStatePatch(next[0])
				};
			}),
		selectEffectLayer: id =>
			set(state => {
				if (id === state.activeEffectLayerId) return state;
				const layers = syncActiveEffectLayer(state);
				const target = layers.find(layer => layer.id === id);
				if (!target) return { effectLayers: layers };
				return {
					effectLayers: layers,
					activeEffectLayerId: id,
					...effectLayerToStatePatch(target)
				};
			}),
		setEffectLayerEnabled: (id, enabled) =>
			set(state => ({
				effectLayers: syncActiveEffectLayer(state).map(layer =>
					layer.id === id ? { ...layer, enabled } : layer
				)
			})),
		renameEffectLayer: (id, name) =>
			set(state => ({
				effectLayers: syncActiveEffectLayer(state).map(layer =>
					layer.id === id ? { ...layer, name } : layer
				)
			})),
		moveEffectLayer: (id, direction) =>
			set(state => {
				const layers = syncActiveEffectLayer(state);
				const index = layers.findIndex(layer => layer.id === id);
				const nextIndex = direction === 'up' ? index - 1 : index + 1;
				if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) {
					return { effectLayers: layers };
				}
				const next = [...layers];
				[next[index], next[nextIndex]] = [next[nextIndex], next[index]];
				return { effectLayers: next };
			})
	} satisfies Partial<WallpaperStore>;
}
