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
const { isReplaceableImageAssetId } =
	await import('@/features/background/controls/backgroundImageReplace');

const image = (id: string) =>
	useWallpaperStore
		.getState()
		.backgroundImages.find(img => img.assetId === id)!;

function seed() {
	useWallpaperStore.setState({
		backgroundImages: [
			{
				...createBackgroundImageItem('img-1', 'one.png', 'one-thumb', {
					originalFileName: 'one.png'
				}),
				scale: 1.42,
				positionX: -0.3,
				rotation: 7,
				playbackSwitchAt: 31,
				sceneSlotId: 'scene-a',
				coverageFramingEdited: true,
				faceFocusX: 0.2,
				faceFocusY: 0.2,
				faceFocusSource: 'manual',
				logoFocusX: 0.9,
				logoFocusY: 0.9,
				logoFocusSource: 'auto'
			},
			createBackgroundImageItem('img-2', 'two.png')
		],
		setlists: [
			{
				id: 'set-1',
				name: 'Set',
				imageAssetIds: ['img-1', 'img-2'],
				trackIds: [],
				createdAt: 0
			}
		],
		activeSetlistId: null,
		activeImageId: 'img-1'
	});
}

/**
 * The pool entry is a box: the picture is its contents, everything else on it
 * is what the user built. Replacing the file must not look like deleting the
 * image and adding another one.
 */
describe('replaceImageEntryAsset', () => {
	beforeEach(seed);

	it('keeps the entry, its position in the pool and every preset on it', () => {
		useWallpaperStore
			.getState()
			.replaceImageEntryAsset('img-1', 'new.png', null, 'new.png');

		const replaced = image('img-1');
		expect(useWallpaperStore.getState().backgroundImages).toHaveLength(2);
		expect(useWallpaperStore.getState().backgroundImages[0]!.assetId).toBe(
			'img-1'
		);
		expect(replaced.url).toBe('new.png');
		expect(replaced.originalFileName).toBe('new.png');
		expect(replaced.scale).toBe(1.42);
		expect(replaced.positionX).toBe(-0.3);
		expect(replaced.rotation).toBe(7);
		expect(replaced.playbackSwitchAt).toBe(31);
		expect(replaced.sceneSlotId).toBe('scene-a');
		expect(replaced.coverageFramingEdited).toBe(true);
	});

	it('leaves every reference to the asset id untouched', () => {
		useWallpaperStore.getState().replaceImageEntryAsset('img-1', 'new.png');

		expect(useWallpaperStore.getState().setlists[0]!.imageAssetIds).toEqual(
			['img-1', 'img-2']
		);
		expect(useWallpaperStore.getState().activeImageId).toBe('img-1');
		expect(useWallpaperStore.getState().imageIds).toEqual([
			'img-1',
			'img-2'
		]);
	});

	it('drops the stale thumbnail so the card cannot show the old picture', () => {
		useWallpaperStore.getState().replaceImageEntryAsset('img-1', 'new.png');
		expect(image('img-1').thumbnailUrl).toBeNull();
	});

	it('forgets measured focus points but keeps hand-placed ones', () => {
		useWallpaperStore.getState().replaceImageEntryAsset('img-1', 'new.png');

		const replaced = image('img-1');
		// Placed by hand on purpose: intent, not a measurement.
		expect(replaced.faceFocusX).toBe(0.2);
		expect(replaced.faceFocusSource).toBe('manual');
		// Estimated from pixels that are gone.
		expect(replaced.logoFocusX).toBeNull();
		expect(replaced.logoFocusY).toBeNull();
	});

	it('mirrors the new url into the active-image runtime keys', () => {
		useWallpaperStore.getState().replaceImageEntryAsset('img-1', 'new.png');
		expect(useWallpaperStore.getState().imageUrl).toBe('new.png');
		expect(useWallpaperStore.getState().imageUrls).toContain('new.png');
	});

	it('ignores an asset id that is not in the pool', () => {
		const before = useWallpaperStore.getState().backgroundImages;
		useWallpaperStore
			.getState()
			.replaceImageEntryAsset('img-missing', 'new.png');
		expect(useWallpaperStore.getState().backgroundImages).toBe(before);
	});

	it('refuses local-folder entries, whose bytes are not ours to overwrite', () => {
		expect(isReplaceableImageAssetId('img-1')).toBe(true);
		expect(isReplaceableImageAssetId('virtual://image/one.png')).toBe(
			false
		);
	});
});
