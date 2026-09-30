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

const store = () => useWallpaperStore.getState();

/**
 * A Camera FX slot is the WHOLE motion stack, and the active layer's live
 * values are the flat `cameraMotion*` keys — its entry in `motionLayers` is a
 * stale snapshot by design. Saving the array raw stores whatever that layer
 * looked like the last time the user switched away from it.
 */
describe('Camera FX slots capture the live motion layer', () => {
	beforeEach(() => {
		useWallpaperStore.setState({
			...DEFAULT_STATE,
			cameraFxProfileSlots: [
				{ id: 'cam-1', name: 'Camera 1', values: null }
			]
		});
	});

	it('saves the dials the user just moved, not the stale snapshot', () => {
		// Two layers, so the first one's entry is a real snapshot that can go
		// stale while the user edits it.
		store().addMotionLayer();
		const [first] = store().motionLayers;
		store().selectMotionLayer(first!.id);

		useWallpaperStore.setState({
			cameraMotionEnabled: true,
			cameraMotionMode: 'orbit',
			cameraMotionAmount: 1.75,
			cameraMotionSpeed: 0.42
		});
		store().saveCameraFxProfileSlot(0);

		const saved = store().cameraFxProfileSlots[0]!.values!;
		const activeId = store().activeMotionLayerId;
		const savedActive = saved.motionLayers.find(
			layer => layer.id === activeId
		)!;
		expect(savedActive.settings.cameraMotionMode).toBe('orbit');
		expect(savedActive.settings.cameraMotionAmount).toBeCloseTo(1.75);
		expect(savedActive.settings.cameraMotionSpeed).toBeCloseTo(0.42);
	});

	it('round-trips the stack through a slot', () => {
		store().addMotionLayer();
		useWallpaperStore.setState({
			cameraMotionEnabled: true,
			cameraMotionMode: 'pendulum',
			cameraMotionAmount: 1.25
		});
		store().saveCameraFxProfileSlot(0);

		useWallpaperStore.setState({
			cameraMotionMode: 'none',
			cameraMotionAmount: 0.1
		});
		store().loadCameraFxProfileSlot(0);

		const after = store();
		const active = after.motionLayers.find(
			layer => layer.id === after.activeMotionLayerId
		)!;
		expect(active.settings.cameraMotionMode).toBe('pendulum');
		expect(active.settings.cameraMotionAmount).toBeCloseTo(1.25);
	});
});
