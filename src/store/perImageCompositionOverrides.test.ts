import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => void mem.set(k, v),
	removeItem: (k: string) => void mem.delete(k),
	clear: () => void mem.clear()
};

const { useWallpaperStore } = await import('@/store/wallpaperStore');
const { createBackgroundImageItem } =
	await import('@/features/background/backgroundImages');
const { buildActiveImageSelectionPatch } =
	await import('@/store/activeImageSelection');

/** Two images so "only the active one" is actually testable. */
function seedImages() {
	useWallpaperStore.setState({
		backgroundImages: [
			createBackgroundImageItem('img-1', 'one.png'),
			createBackgroundImageItem('img-2', 'two.png')
		],
		activeImageId: 'img-1',
		sceneSlots: [],
		defaultSceneSlotId: null,
		globalCompositionOverride: false
	});
}

const active = () => {
	const state = useWallpaperStore.getState();
	return state.backgroundImages.find(
		img => img.assetId === state.activeImageId
	)!;
};

describe('per-image Camera FX / Lights / Track Title overrides', () => {
	beforeEach(seedImages);

	it('start empty on a fresh image', () => {
		expect(active().cameraFxOverride).toBeNull();
		expect(active().lightsOverride).toBeNull();
		expect(active().trackTitleOverride).toBeNull();
	});

	it('capture writes the live composition onto the ACTIVE image only', () => {
		useWallpaperStore.setState({
			cameraMotionEnabled: true,
			cameraMotionAmount: 0.77
		});
		useWallpaperStore.getState().captureImageCameraFxOverride();

		expect(active().cameraFxOverride?.cameraMotionAmount).toBe(0.77);
		const other = useWallpaperStore
			.getState()
			.backgroundImages.find(img => img.assetId === 'img-2')!;
		expect(other.cameraFxOverride).toBeNull();
	});

	it('capture then clear leaves the image exactly as it was', () => {
		useWallpaperStore.getState().captureImageLightsOverride();
		expect(active().lightsOverride).not.toBeNull();
		useWallpaperStore.getState().setImageLightsOverride(null);
		expect(active().lightsOverride).toBeNull();
	});

	it('selecting the image applies the stored Camera FX, enable flag included', () => {
		useWallpaperStore.setState({
			cameraMotionEnabled: true,
			cameraMotionAmount: 0.4
		});
		useWallpaperStore.getState().captureImageCameraFxOverride();
		// Now the live state disagrees with what the image carries.
		useWallpaperStore.setState({
			cameraMotionEnabled: false,
			cameraMotionAmount: 0.1
		});

		const { patch } = buildActiveImageSelectionPatch(
			useWallpaperStore.getState(),
			'img-1'
		);
		// Unlike logo/spectrum, Camera FX carries its own switch on purpose: a
		// stored composition is allowed to say "and movement ON here".
		expect(patch.cameraMotionEnabled).toBe(true);
		expect(patch.cameraMotionAmount).toBe(0.4);
	});

	it('global composition mode ignores the stored override entirely', () => {
		useWallpaperStore.setState({ cameraMotionAmount: 0.9 });
		useWallpaperStore.getState().captureImageCameraFxOverride();
		useWallpaperStore.setState({
			globalCompositionOverride: true,
			cameraMotionAmount: 0.2
		});

		const { patch } = buildActiveImageSelectionPatch(
			useWallpaperStore.getState(),
			'img-1'
		);
		expect(patch.cameraMotionAmount).toBeUndefined();
		// And nothing stored was touched.
		expect(active().cameraFxOverride?.cameraMotionAmount).toBe(0.9);
	});

	it('captureCompositionToAllImages includes the three new subsystems', () => {
		useWallpaperStore.getState().captureCompositionToAllImages();
		for (const img of useWallpaperStore.getState().backgroundImages) {
			expect(img.cameraFxOverride).not.toBeNull();
			expect(img.lightsOverride).not.toBeNull();
			expect(img.trackTitleOverride).not.toBeNull();
		}
	});
});
