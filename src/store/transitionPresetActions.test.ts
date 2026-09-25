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
const { createDefaultTransitionPresets, resolveImageTransitionPresetId } =
	await import('@/features/background/transitionPresets');
const { DEFAULT_STATE } = await import('@/store/defaultState');

function seed() {
	useWallpaperStore.setState({
		backgroundImages: [
			createBackgroundImageItem('img-1', 'one.png'),
			createBackgroundImageItem('img-2', 'two.png')
		],
		activeImageId: 'img-1',
		transitionPresets: createDefaultTransitionPresets(),
		// A fresh image carries the DEFAULT_STATE dials, so the live mirror has
		// to start there too or "image matches preset" compares two eras.
		slideshowTransitionType: DEFAULT_STATE.slideshowTransitionType,
		slideshowTransitionDuration: DEFAULT_STATE.slideshowTransitionDuration,
		slideshowTransitionIntensity:
			DEFAULT_STATE.slideshowTransitionIntensity,
		slideshowTransitionAudioDrive:
			DEFAULT_STATE.slideshowTransitionAudioDrive,
		slideshowTransitionAudioChannel:
			DEFAULT_STATE.slideshowTransitionAudioChannel
	});
}

const active = () => {
	const state = useWallpaperStore.getState();
	return state.backgroundImages.find(
		img => img.assetId === state.activeImageId
	)!;
};

describe('transition presets in the store', () => {
	beforeEach(seed);

	it('applying a preset writes the five values and the name', () => {
		const store = useWallpaperStore.getState();
		const preset = store.transitionPresets[2]!;
		store.applyTransitionPreset(preset.id);
		const image = active();
		expect(image.transitionPresetId).toBe(preset.id);
		expect(image.transitionType).toBe(preset.settings.transitionType);
		expect(image.transitionDuration).toBe(
			preset.settings.transitionDuration
		);
		// The live mirror the renderer reads follows too.
		expect(useWallpaperStore.getState().slideshowTransitionType).toBe(
			preset.settings.transitionType
		);
	});

	it('only the active image is touched', () => {
		const store = useWallpaperStore.getState();
		store.applyTransitionPreset(store.transitionPresets[1]!.id);
		const other = useWallpaperStore
			.getState()
			.backgroundImages.find(img => img.assetId === 'img-2')!;
		expect(other.transitionPresetId).toBeNull();
	});

	it('moving a dial drops the image back to Custom', () => {
		const store = useWallpaperStore.getState();
		store.applyTransitionPreset(store.transitionPresets[1]!.id);
		useWallpaperStore.getState().setSlideshowTransitionDuration(2.9);
		expect(active().transitionPresetId).toBeNull();
		expect(active().transitionDuration).toBe(2.9);
	});

	it('saving captures the live values under a free name', () => {
		useWallpaperStore.getState().setSlideshowTransitionIntensity(1.35);
		useWallpaperStore.getState().saveTransitionPreset('Mine');
		const state = useWallpaperStore.getState();
		const saved = state.transitionPresets.find(p => p.name === 'Mine')!;
		expect(saved.builtIn).toBe(false);
		expect(saved.settings.transitionIntensity).toBe(1.35);
		expect(active().transitionPresetId).toBe(saved.id);
		expect(
			resolveImageTransitionPresetId(active(), state.transitionPresets)
		).toBe(saved.id);
	});

	it('a factory preset cannot be deleted', () => {
		const store = useWallpaperStore.getState();
		const builtIn = store.transitionPresets[0]!;
		store.deleteTransitionPreset(builtIn.id);
		expect(
			useWallpaperStore
				.getState()
				.transitionPresets.some(p => p.id === builtIn.id)
		).toBe(true);
	});

	it('deleting a user preset leaves the images looking the same', () => {
		useWallpaperStore.getState().saveTransitionPreset('Mine');
		const saved = useWallpaperStore
			.getState()
			.transitionPresets.find(p => p.name === 'Mine')!;
		const before = active().transitionDuration;
		useWallpaperStore.getState().deleteTransitionPreset(saved.id);
		expect(active().transitionPresetId).toBeNull();
		expect(active().transitionDuration).toBe(before);
	});

	it('renaming never produces two presets with one name', () => {
		const store = useWallpaperStore.getState();
		store.saveTransitionPreset('Mine');
		const saved = useWallpaperStore
			.getState()
			.transitionPresets.find(p => p.name === 'Mine')!;
		const taken = useWallpaperStore.getState().transitionPresets[0]!;
		useWallpaperStore
			.getState()
			.renameTransitionPreset(saved.id, taken.name);
		const names = useWallpaperStore
			.getState()
			.transitionPresets.map(p => p.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
