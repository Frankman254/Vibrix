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
const { createEmptySceneSlot } = await import('@/features/scenes/sceneSlot');
import type { SpectrumProfileSettings } from '@/types/wallpaper';

const store = () => useWallpaperStore.getState();

/** Two images that each force a different bar count when applied. */
function setup() {
	mem.clear();
	const first = createBackgroundImageItem('first', null, null, {
		spectrumOverride: {
			spectrumBarCount: 48
		} as unknown as SpectrumProfileSettings
	});
	const second = createBackgroundImageItem('second', null, null, {
		spectrumOverride: {
			spectrumBarCount: 96
		} as unknown as SpectrumProfileSettings
	});
	useWallpaperStore.setState({
		sceneSlots: [],
		defaultSceneSlotId: null,
		globalCompositionOverride: false,
		backgroundImages: [first, second],
		activeImageId: null
	});
}

describe('global composition mode', () => {
	beforeEach(setup);

	it('applies per-image overrides while it is off', () => {
		store().setActiveImageId('first');
		expect(store().spectrumBarCount).toBe(48);
		store().setActiveImageId('second');
		expect(store().spectrumBarCount).toBe(96);
	});

	it('ignores them while it is on, without erasing anything', () => {
		store().setActiveImageId('first');
		store().setGlobalCompositionOverride(true);
		store().setActiveImageId('second');
		// The picture changed; the composition did not.
		expect(store().activeImageId).toBe('second');
		expect(store().spectrumBarCount).toBe(48);
		// What the image had saved is untouched, so turning the mode off
		// brings it straight back.
		expect(store().backgroundImages[1].spectrumOverride).toBeTruthy();
		store().setGlobalCompositionOverride(false);
		store().setActiveImageId('first');
		store().setActiveImageId('second');
		expect(store().spectrumBarCount).toBe(96);
	});

	it('lets one image opt out of the mode', () => {
		store().setActiveImageId('second');
		store().setImageIgnoreGlobalOverride(true);
		store().setActiveImageId('first');
		store().setGlobalCompositionOverride(true);
		store().setActiveImageId('second');
		expect(store().spectrumBarCount).toBe(96);
	});

	it('ignores the scene too, not just the overrides', () => {
		const scene = { ...createEmptySceneSlot('Off'), spectrumSlotId: 'off' };
		useWallpaperStore.setState({
			sceneSlots: [scene],
			defaultSceneSlotId: scene.id,
			spectrumEnabled: true
		});
		store().setGlobalCompositionOverride(true);
		store().setActiveImageId('first');
		expect(store().spectrumEnabled).toBe(true);
		expect(store().activeSceneSlotId).not.toBe(scene.id);
	});

	it('writes the current composition into every image on demand', () => {
		store().setActiveImageId('first');
		store().setGlobalCompositionOverride(true);
		store().setSpectrumBarCount(31);
		store().captureCompositionToAllImages();

		for (const image of store().backgroundImages) {
			expect(image.spectrumOverride?.spectrumBarCount).toBe(31);
			expect(image.looksOverride).toBeTruthy();
		}
		// And now every image really does agree with the screen.
		store().setGlobalCompositionOverride(false);
		store().setActiveImageId('second');
		expect(store().spectrumBarCount).toBe(31);
	});
});
