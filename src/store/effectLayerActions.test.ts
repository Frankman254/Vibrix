import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => void mem.set(k, v),
	removeItem: (k: string) => void mem.delete(k),
	clear: () => void mem.clear()
};

const { useWallpaperStore } = await import('@/store/wallpaperStore');
const { DEFAULT_STATE } = await import('@/store/defaultState');
const { MAX_EFFECT_LAYER_COUNT } =
	await import('@/features/filterLooks/effectLayers');
const { resolveFilterStack } =
	await import('@/features/filterLooks/filterStack');

const store = () => useWallpaperStore.getState();

/** A fresh copy each run, so one test's layer edits cannot leak into the next. */
function structuredCloneState() {
	return {
		...DEFAULT_STATE,
		filterTargets: [...DEFAULT_STATE.filterTargets],
		effectLayers: DEFAULT_STATE.effectLayers.map(layer => ({
			...layer,
			targets: [...layer.targets],
			settings: { ...layer.settings }
		}))
	};
}

describe('effect layer actions', () => {
	beforeEach(() => {
		// Merge, not replace: a replace would drop the actions themselves.
		useWallpaperStore.setState(structuredCloneState());
	});

	it('starts with a single layer holding the legacy stack', () => {
		expect(store().effectLayers).toHaveLength(1);
		expect(store().activeEffectLayerId).toBe(store().effectLayers[0].id);
	});

	it('adds an empty layer without moving a single slider', () => {
		store().setFilterTargets(['background']);
		store().setFilterBlur(9);
		store().addEffectLayer();

		expect(store().effectLayers).toHaveLength(2);
		// The new layer is the one being edited, and it targets nothing yet.
		expect(store().activeEffectLayerId).toBe(store().effectLayers[1].id);
		expect(store().filterTargets).toEqual([]);
		expect(store().filterBlur).toBe(9);
		// The background keeps the first layer's treatment.
		expect(resolveFilterStack(store(), 'background')?.filterBlur).toBe(9);
	});

	it('keeps each layer value set when switching between them', () => {
		const first = store().effectLayers[0].id;
		store().setFilterTargets(['background']);
		store().setFilterBlur(4);
		store().addEffectLayer();
		const second = store().activeEffectLayerId;
		store().setFilterTargets(['spectrum']);
		store().setFilterBlur(18);

		store().selectEffectLayer(first);
		expect(store().filterBlur).toBe(4);
		expect(store().filterTargets).toEqual(['background']);

		store().selectEffectLayer(second);
		expect(store().filterBlur).toBe(18);
		expect(store().filterTargets).toEqual(['spectrum']);
	});

	it('lets two layers treat different subsystems at once', () => {
		store().setFilterTargets(['background']);
		store().setFilterSaturation(0.2);
		store().addEffectLayer();
		store().setFilterTargets(['spectrum']);
		store().setFilterSaturation(1.8);

		expect(
			resolveFilterStack(store(), 'background')?.filterSaturation
		).toBe(0.2);
		expect(resolveFilterStack(store(), 'spectrum')?.filterSaturation).toBe(
			1.8
		);
	});

	it('duplicates values but not targets', () => {
		store().setFilterTargets(['logo']);
		store().setFilterContrast(1.4);
		store().duplicateEffectLayer(store().effectLayers[0].id);

		expect(store().effectLayers).toHaveLength(2);
		expect(store().filterContrast).toBe(1.4);
		expect(store().filterTargets).toEqual([]);
		// The original still owns the logo — first match wins, and the copy
		// must not race it for the same target.
		expect(resolveFilterStack(store(), 'logo')?.filterContrast).toBe(1.4);
	});

	it('never removes the last layer', () => {
		store().removeEffectLayer(store().effectLayers[0].id);
		expect(store().effectLayers).toHaveLength(1);
	});

	it('hands the editor to a surviving layer when the active one goes', () => {
		store().setFilterTargets(['background']);
		store().setFilterBlur(3);
		store().addEffectLayer();
		const second = store().activeEffectLayerId;
		store().setFilterBlur(21);

		store().removeEffectLayer(second);
		expect(store().effectLayers).toHaveLength(1);
		expect(store().activeEffectLayerId).toBe(store().effectLayers[0].id);
		expect(store().filterBlur).toBe(3);
		expect(store().filterTargets).toEqual(['background']);
	});

	it('turning a layer off falls through to the one beneath', () => {
		store().setFilterTargets(['logo']);
		store().setFilterBlur(2);
		store().addEffectLayer();
		store().moveEffectLayer(store().effectLayers[1].id, 'up');
		store().selectEffectLayer(store().effectLayers[0].id);
		store().setFilterTargets(['logo']);
		store().setFilterBlur(30);

		expect(resolveFilterStack(store(), 'logo')?.filterBlur).toBe(30);
		store().setEffectLayerEnabled(store().effectLayers[0].id, false);
		expect(resolveFilterStack(store(), 'logo')?.filterBlur).toBe(2);
	});

	it('stops adding layers at the ceiling', () => {
		for (let i = 0; i < MAX_EFFECT_LAYER_COUNT + 3; i += 1) {
			store().addEffectLayer();
		}
		expect(store().effectLayers).toHaveLength(MAX_EFFECT_LAYER_COUNT);
	});

	it('renames a layer without touching its values', () => {
		const id = store().effectLayers[0].id;
		store().setFilterBlur(7);
		store().renameEffectLayer(id, 'Fondo frío');
		expect(store().effectLayers[0].name).toBe('Fondo frío');
		expect(store().effectLayers[0].settings.filterBlur).toBe(7);
	});
});
