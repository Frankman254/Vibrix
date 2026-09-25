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
const { MAX_MOTION_LAYER_COUNT, findMotionLayerForTarget } =
	await import('@/features/stageFx/motionLayers');

const store = () => useWallpaperStore.getState();

/** A fresh copy each run, so one test's layer edits cannot leak into the next. */
function freshState() {
	return {
		...DEFAULT_STATE,
		cameraMotionTargets: [...DEFAULT_STATE.cameraMotionTargets],
		motionLayers: DEFAULT_STATE.motionLayers.map(layer => ({
			...layer,
			targets: [...layer.targets],
			settings: { ...layer.settings }
		}))
	};
}

describe('motion layer actions', () => {
	beforeEach(() => {
		// Merge, not replace: a replace would drop the actions themselves.
		useWallpaperStore.setState(freshState());
	});

	it('starts with a single layer holding the legacy movement', () => {
		expect(store().motionLayers).toHaveLength(1);
		expect(store().activeMotionLayerId).toBe(store().motionLayers[0].id);
	});

	it('adds an empty layer without moving a single dial', () => {
		store().setCameraMotionMode('circle');
		store().setCameraMotionAmount(0.42);
		store().addMotionLayer();
		expect(store().motionLayers).toHaveLength(2);
		// The new layer is the one being edited, targets nothing yet, and the
		// dials read exactly what they read before adding it.
		expect(store().activeMotionLayerId).toBe(store().motionLayers[1].id);
		expect(store().cameraMotionTargets).toEqual([]);
		expect(store().cameraMotionMode).toBe('circle');
		expect(store().cameraMotionAmount).toBe(0.42);
	});

	it('keeps the first layer values when the second one is dialled', () => {
		store().setCameraMotionMode('circle');
		store().setCameraMotionAmount(0.4);
		const first = store().motionLayers[0].id;
		store().addMotionLayer();
		store().setCameraMotionMode('pendulum');
		store().setCameraMotionAmount(0.9);
		store().selectMotionLayer(first);
		expect(store().cameraMotionMode).toBe('circle');
		expect(store().cameraMotionAmount).toBe(0.4);
		expect(store().motionLayers[1].settings.cameraMotionAmount).toBe(0.9);
	});

	it('hands a claimed target over instead of letting two layers name it', () => {
		store().setCameraMotionTargets(['background', 'logo']);
		const first = store().motionLayers[0].id;
		store().addMotionLayer();
		store().claimMotionTarget('logo');
		expect(store().cameraMotionTargets).toEqual(['logo']);
		expect(
			store().motionLayers.find(layer => layer.id === first)?.targets
		).toEqual(['background']);
		expect(findMotionLayerForTarget(store(), 'logo')?.id).toBe(
			store().activeMotionLayerId
		);
	});

	it('gives the flat keys to the layer that takes over on delete', () => {
		store().setCameraMotionAmount(0.25);
		store().addMotionLayer();
		store().setCameraMotionAmount(0.75);
		store().removeMotionLayer(store().activeMotionLayerId);
		expect(store().motionLayers).toHaveLength(1);
		expect(store().activeMotionLayerId).toBe(store().motionLayers[0].id);
		expect(store().cameraMotionAmount).toBe(0.25);
	});

	it('never deletes the last layer', () => {
		store().removeMotionLayer(store().motionLayers[0].id);
		expect(store().motionLayers).toHaveLength(1);
	});

	it('duplicates values but not targets, and stops at the ceiling', () => {
		store().setCameraMotionTargets(['spectrum']);
		store().setCameraMotionAmount(0.6);
		store().duplicateMotionLayer(store().motionLayers[0].id);
		expect(store().motionLayers[1].settings.cameraMotionAmount).toBe(0.6);
		expect(store().cameraMotionTargets).toEqual([]);
		while (store().motionLayers.length < MAX_MOTION_LAYER_COUNT) {
			store().addMotionLayer();
		}
		store().addMotionLayer();
		expect(store().motionLayers).toHaveLength(MAX_MOTION_LAYER_COUNT);
	});

	it('reorders without losing the dials of the layer being edited', () => {
		store().setCameraMotionAmount(0.3);
		store().addMotionLayer();
		store().setCameraMotionAmount(0.8);
		const active = store().activeMotionLayerId;
		store().moveMotionLayer(active, 'up');
		expect(store().motionLayers[0].id).toBe(active);
		expect(store().cameraMotionAmount).toBe(0.8);
		expect(store().motionLayers[1].settings.cameraMotionAmount).toBe(0.3);
	});
});
