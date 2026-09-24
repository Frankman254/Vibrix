import { describe, expect, it } from 'vitest';
import {
	createDefaultEffectLayer,
	effectLayerToStatePatch,
	findEffectLayerForTarget,
	syncActiveEffectLayer
} from '@/features/filterLooks/effectLayers';
import { resolveFilterStack } from '@/features/filterLooks/filterStack';
import { extractFilterLookSettingsFromState } from '@/features/filterLooks/filterLooks';
import type { EffectLayer, WallpaperState } from '@/types/wallpaper';
import { DEFAULT_STATE } from '@/store/defaultState';

function layer(overrides: Partial<EffectLayer> = {}): EffectLayer {
	return {
		id: 'layer-b',
		name: 'B',
		enabled: true,
		targets: [],
		lookId: null,
		settings: {
			...extractFilterLookSettingsFromState(DEFAULT_STATE),
			filterSaturation: 0.25
		},
		...overrides
	};
}

function stateWith(
	layers: EffectLayer[],
	overrides: Partial<WallpaperState> = {}
): WallpaperState {
	return {
		...DEFAULT_STATE,
		effectLayers: layers,
		activeEffectLayerId: layers[0]?.id ?? '',
		...overrides
	};
}

describe('findEffectLayerForTarget', () => {
	it('gives the target to the topmost layer that names it', () => {
		const top = layer({ id: 'top', targets: ['logo'] });
		const bottom = layer({ id: 'bottom', targets: ['logo'] });
		const state = stateWith([top, bottom], {
			activeEffectLayerId: 'none',
			filterTargets: []
		});
		expect(findEffectLayerForTarget(state, 'logo')).toBe(top);
	});

	it('falls through to the next layer when the top one is off', () => {
		const top = layer({ id: 'top', targets: ['logo'], enabled: false });
		const bottom = layer({ id: 'bottom', targets: ['logo'] });
		const state = stateWith([top, bottom], {
			activeEffectLayerId: 'none',
			filterTargets: []
		});
		expect(findEffectLayerForTarget(state, 'logo')).toBe(bottom);
	});

	it('judges the active layer by the live targets, not its snapshot', () => {
		// The target checkboxes, presets, scenes and project imports all write
		// `filterTargets`; a stale snapshot would make those look inert.
		const active = layer({ id: 'active', targets: [] });
		const state = stateWith([active], {
			activeEffectLayerId: 'active',
			filterTargets: ['spectrum']
		});
		expect(findEffectLayerForTarget(state, 'spectrum')).toBe(active);
	});
});

describe('resolveFilterStack across layers', () => {
	it('reads the live values for the active layer and the snapshot below', () => {
		const active = layer({ id: 'active', targets: [] });
		const below = layer({ id: 'below', targets: ['logo'] });
		const state = stateWith([active, below], {
			activeEffectLayerId: 'active',
			filterTargets: ['spectrum'],
			filterSaturation: 1.9
		});
		expect(resolveFilterStack(state, 'spectrum')?.filterSaturation).toBe(
			1.9
		);
		expect(resolveFilterStack(state, 'logo')?.filterSaturation).toBe(0.25);
	});
});

describe('syncActiveEffectLayer', () => {
	it('folds the live values into the active entry and leaves the rest', () => {
		const active = layer({ id: 'active', targets: ['logo'] });
		const other = layer({ id: 'other', targets: ['rain'] });
		const state = stateWith([active, other], {
			activeEffectLayerId: 'active',
			filterTargets: ['spectrum'],
			filterBlur: 12,
			activeFilterLookId: null
		});
		const [synced, untouched] = syncActiveEffectLayer(state);
		expect(synced.targets).toEqual(['spectrum']);
		expect(synced.settings.filterBlur).toBe(12);
		expect(untouched).toBe(other);
	});
});

describe('effectLayerToStatePatch', () => {
	it('round-trips a layer through the legacy keys', () => {
		const base = createDefaultEffectLayer(
			extractFilterLookSettingsFromState(DEFAULT_STATE),
			['background', 'logo'],
			null
		);
		const patch = effectLayerToStatePatch(base);
		expect(patch.filterTargets).toEqual(['background', 'logo']);
		expect(patch.filterTargets).not.toBe(base.targets);
		expect(patch.activeFilterLookId).toBe(null);
	});
});
