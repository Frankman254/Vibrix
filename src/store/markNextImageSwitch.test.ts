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

const store = () => useWallpaperStore.getState();

function setup(count = 3) {
	mem.clear();
	const images = Array.from({ length: count }, (_, index) =>
		createBackgroundImageItem(
			`img-${index}`,
			`virtual://img/${index}`,
			null
		)
	);
	useWallpaperStore.setState({
		backgroundImages: images,
		setlists: [],
		activeSetlistId: null,
		activeImageId: images[0]!.assetId,
		slideshowManualTimestampsEnabled: false
	});
	return images;
}

function switchTimes() {
	return store().backgroundImages.map(image => image.playbackSwitchAt);
}

describe('markNextImageSwitchAt — the "mark here" gesture', () => {
	beforeEach(() => setup());

	it('writes the time on the image AFTER the active one', () => {
		const result = store().markNextImageSwitchAt(42.5);
		expect(result.marked).toBe(true);
		expect(result.poolPosition).toBe(2);
		expect(switchTimes()).toEqual([null, 42.5, null]);
	});

	it('turns manual timestamps on the first time it is used', () => {
		expect(store().slideshowManualTimestampsEnabled).toBe(false);
		const first = store().markNextImageSwitchAt(10);
		expect(first.enabledManualMode).toBe(true);
		expect(store().slideshowManualTimestampsEnabled).toBe(true);

		store().setActiveImageId(store().backgroundImages[1]!.assetId);
		expect(store().markNextImageSwitchAt(20).enabledManualMode).toBe(false);
	});

	it('marks the last image of the pool as nothing to do', () => {
		const images = store().backgroundImages;
		useWallpaperStore.setState({ activeImageId: images[2]!.assetId });
		const result = store().markNextImageSwitchAt(60);
		expect(result).toMatchObject({ marked: false, imageId: null });
		expect(switchTimes()).toEqual([null, null, null]);
		// Nothing marked, so the mode must not flip either.
		expect(store().slideshowManualTimestampsEnabled).toBe(false);
	});

	it('reports a mark that breaks the pool order without refusing it', () => {
		const images = store().backgroundImages;
		useWallpaperStore.setState({ activeImageId: images[1]!.assetId });
		expect(store().markNextImageSwitchAt(90).reordered).toBe(false);

		useWallpaperStore.setState({ activeImageId: images[0]!.assetId });
		const result = store().markNextImageSwitchAt(120);
		expect(result.reordered).toBe(true);
		// The edit still lands: the resolver sorts by time, so this is a
		// different playing order, not corruption.
		expect(switchTimes()).toEqual([null, 120, 90]);
	});

	it('never writes a negative timestamp', () => {
		expect(store().markNextImageSwitchAt(-5).markedAt).toBe(0);
		expect(switchTimes()[1]).toBe(0);
	});

	it('skips images the slideshow does not play', () => {
		const images = store().backgroundImages;
		useWallpaperStore.setState({
			backgroundImages: images.map((image, index) =>
				index === 1 ? { ...image, enabled: false } : image
			)
		});
		const result = store().markNextImageSwitchAt(30);
		expect(result.imageId).toBe(images[2]!.assetId);
		expect(switchTimes()).toEqual([null, null, 30]);
	});
});
