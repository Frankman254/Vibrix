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
const { resolveSlideshowPool } =
	await import('@/features/background/slideshow/slideshowPlayback');

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
		slideshowManualTimestampsEnabled: false,
		slideshowAudioCheckpointsEnabled: true,
		slideshowTrackChangeSyncEnabled: false
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

	it('stores crossed marks as slot boundaries without reordering images', () => {
		const images = store().backgroundImages;
		useWallpaperStore.setState({ activeImageId: images[1]!.assetId });
		expect(store().markNextImageSwitchAt(90).reordered).toBe(false);

		useWallpaperStore.setState({ activeImageId: images[0]!.assetId });
		const result = store().markNextImageSwitchAt(120);
		expect(result.reordered).toBe(false);
		// The raw slot accepts the mark; schedule resolution keeps occupants in
		// pool order and orders the boundaries instead of the images.
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
		// Image 3 occupies slot 2 while image 2 is disabled, so the mark is
		// stored in slot 2's carrier and image 2 can reclaim it when re-enabled.
		expect(switchTimes()).toEqual([null, 30, null]);
	});
});

describe('slideshow timing modes and reset', () => {
	beforeEach(() => setup());
	it('switches to automatic timing without silently deleting saved marks', () => {
		store().markNextImageSwitchAt(42);
		store().setSlideshowAudioCheckpointsEnabled(true);
		expect(store().slideshowManualTimestampsEnabled).toBe(false);
		expect(store().slideshowAudioCheckpointsEnabled).toBe(true);
		expect(switchTimes()).toEqual([null, 42, null]);
	});
	it('manual and track-sync modes disable competing modes, including mark here', () => {
		store().setSlideshowManualTimestampsEnabled(true);
		expect(store().slideshowAudioCheckpointsEnabled).toBe(false);
		store().setSlideshowTrackChangeSyncEnabled(true);
		expect(store().slideshowManualTimestampsEnabled).toBe(false);
		store().markNextImageSwitchAt(20);
		expect(store().slideshowTrackChangeSyncEnabled).toBe(false);
		expect(store().slideshowAudioCheckpointsEnabled).toBe(false);
		expect(store().slideshowManualTimestampsEnabled).toBe(true);
	});
	it('reset clears only the requested setlist images and returns to equal audio shares', () => {
		const images = store().backgroundImages;
		images.forEach((image, index) =>
			store().setBackgroundImagePlaybackSwitchAt(
				image.assetId,
				index * 23
			)
		);
		store().setSlideshowManualTimestampsEnabled(true);
		store().resetAllManualTimestamps([
			images[0].assetId,
			images[2].assetId
		]);
		expect(switchTimes()).toEqual([null, 23, null]);
		expect(store().slideshowAudioCheckpointsEnabled).toBe(true);
		expect(store().slideshowManualTimestampsEnabled).toBe(false);
		expect(store().slideshowEnabled).toBe(true);
		store().setSlideshowManualTimestampsEnabled(true);
		expect(switchTimes()).toEqual([null, 23, null]);
	});
	it('global reset clears all marks, even when cycling was off', () => {
		store().markNextImageSwitchAt(17);
		store().setSlideshowEnabled(false);
		store().resetAllManualTimestamps();
		expect(switchTimes()).toEqual([null, null, null]);
		expect(store().slideshowEnabled).toBe(true);
		expect(store().slideshowTrackChangeSyncEnabled).toBe(false);
	});
});

describe('pool order uses positional timing slots', () => {
	beforeEach(() => setup(4));

	function seedSlotTimes() {
		store().backgroundImages.forEach((image, index) =>
			store().setBackgroundImagePlaybackSwitchAt(
				image.assetId,
				index * 10
			)
		);
	}

	it('moves an image without moving the timing slots', () => {
		seedSlotTimes();
		store().moveImageEntryToIndex('img-3', 0);
		expect(store().backgroundImages.map(image => image.assetId)).toEqual([
			'img-3',
			'img-0',
			'img-1',
			'img-2'
		]);
		expect(switchTimes()).toEqual([0, 10, 20, 30]);
	});

	it('compacts over a disabled slot and restores it when re-enabled', () => {
		seedSlotTimes();
		store().setBackgroundImageEntryEnabled('img-1', false);
		let pool = resolveSlideshowPool(
			store().backgroundImages,
			store().setlists,
			store().activeSetlistId
		);
		expect(pool.map(image => image.assetId)).toEqual([
			'img-0',
			'img-2',
			'img-3'
		]);
		expect(pool.map(image => image.playbackSwitchAt)).toEqual([0, 10, 20]);

		store().setBackgroundImageEntryEnabled('img-1', true);
		pool = resolveSlideshowPool(
			store().backgroundImages,
			store().setlists,
			store().activeSetlistId
		);
		expect(pool.map(image => image.assetId)).toEqual([
			'img-0',
			'img-1',
			'img-2',
			'img-3'
		]);
		expect(pool.map(image => image.playbackSwitchAt)).toEqual([
			0, 10, 20, 30
		]);
	});
});
