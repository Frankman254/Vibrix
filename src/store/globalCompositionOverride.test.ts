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
const { createDefaultGlobalCompositionSlots } =
	await import('@/store/featureProfiles');
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
		globalCompositionSlots: createDefaultGlobalCompositionSlots(),
		activeGlobalCompositionSlotId: null,
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

	it('applies the selected global slot over every image', () => {
		store().setActiveImageId('first');
		store().setSpectrumBarCount(31);
		store().captureGlobalCompositionSlot(0);
		store().setGlobalCompositionOverride(true);
		// Back to a value neither image has stored, to prove the slot is what
		// gets applied and not simply whatever was on screen.
		store().setSpectrumBarCount(12);
		store().setActiveImageId('second');
		expect(store().spectrumBarCount).toBe(31);
	});

	it('never touches what an image has saved', () => {
		store().setActiveImageId('first');
		store().setSpectrumBarCount(31);
		store().captureGlobalCompositionSlot(0);
		store().setGlobalCompositionOverride(true);
		store().setActiveImageId('second');
		expect(store().backgroundImages[0].spectrumOverride).toMatchObject({
			spectrumBarCount: 48
		});
		expect(store().backgroundImages[1].spectrumOverride).toMatchObject({
			spectrumBarCount: 96
		});
		// And turning the mode off brings each image's own composition back.
		store().setGlobalCompositionOverride(false);
		store().setActiveImageId('first');
		expect(store().spectrumBarCount).toBe(48);
		store().setActiveImageId('second');
		expect(store().spectrumBarCount).toBe(96);
	});

	it('falls back to freezing the screen when no slot is selected', () => {
		store().setActiveImageId('first');
		store().captureGlobalCompositionSlot(0);
		store().setActiveGlobalCompositionSlotId(null);
		store().setGlobalCompositionOverride(true);
		store().setSpectrumBarCount(12);
		store().setActiveImageId('second');
		expect(store().spectrumBarCount).toBe(12);
	});

	it('deleting a global slot deletes only the slot', () => {
		store().setActiveImageId('first');
		store().captureGlobalCompositionSlot(0);
		store().deleteGlobalCompositionSlot(0);
		expect(store().activeGlobalCompositionSlotId).toBeNull();
		expect(store().backgroundImages[0].spectrumOverride).toMatchObject({
			spectrumBarCount: 48
		});
	});
});
