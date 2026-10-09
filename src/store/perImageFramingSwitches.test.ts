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

function seedImages() {
	useWallpaperStore.setState({
		backgroundImages: [
			createBackgroundImageItem('img-1', 'one.png'),
			createBackgroundImageItem('img-2', 'two.png')
		],
		activeImageId: 'img-1',
		imageFramingManualEnabled: false,
		logoFollowImageFocus: false,
		sceneSlots: [],
		defaultSceneSlotId: null,
		globalCompositionOverride: false
	});
}

const image = (id: string) =>
	useWallpaperStore
		.getState()
		.backgroundImages.find(img => img.assetId === id)!;

/**
 * Manual Framing and "the mark follows the picture" are decisions about ONE
 * picture. As globals they leaked: turning either on for a portrait changed
 * every other image in the pool.
 */
describe('per-image framing switches', () => {
	beforeEach(seedImages);

	it('writes Manual Framing onto the ACTIVE image only', () => {
		useWallpaperStore.getState().setImageFramingManualEnabled(true);
		expect(image('img-1').framingManual).toBe(true);
		expect(image('img-2').framingManual).toBe(false);
	});

	it('writes the mark-follows switch onto the ACTIVE image only', () => {
		useWallpaperStore.getState().setLogoFollowImageFocus(true);
		expect(image('img-1').logoFollowsFocus).toBe(true);
		expect(image('img-2').logoFollowsFocus).toBe(false);
	});

	it('restores both switches when the active image changes', () => {
		useWallpaperStore.getState().setImageFramingManualEnabled(true);
		useWallpaperStore.getState().setLogoFollowImageFocus(true);

		useWallpaperStore.getState().setActiveImageId('img-2');
		expect(useWallpaperStore.getState().imageFramingManualEnabled).toBe(
			false
		);
		expect(useWallpaperStore.getState().logoFollowImageFocus).toBe(false);

		useWallpaperStore.getState().setActiveImageId('img-1');
		expect(useWallpaperStore.getState().imageFramingManualEnabled).toBe(
			true
		);
		expect(useWallpaperStore.getState().logoFollowImageFocus).toBe(true);
	});
});

/**
 * Turning the switch ON moves the logo at once. Turning it OFF used to do
 * nothing at all, so the logo stayed on the mark and the switch read as dead —
 * the position only came back when the user cycled to another image and
 * returned, which is the moment the selection patch re-applies the composition
 * that owns it.
 */
describe('turning "the mark follows the picture" off', () => {
	beforeEach(seedImages);

	it("puts the logo back where the image's own composition says", async () => {
		const { extractLogoProfileSettings } =
			await import('@/store/featureProfiles');
		const authored = {
			...extractLogoProfileSettings(useWallpaperStore.getState()),
			logoPositionX: 0.42,
			logoPositionY: -0.3
		};
		useWallpaperStore.setState(state => ({
			backgroundImages: state.backgroundImages.map(img =>
				img.assetId === 'img-1'
					? { ...img, logoOverride: authored }
					: img
			)
		}));
		// Where the mark had parked it.
		useWallpaperStore.setState({
			logoPositionX: -0.9,
			logoPositionY: 0.8,
			logoFollowImageFocus: true
		});

		useWallpaperStore.getState().setLogoFollowImageFocus(false);

		expect(useWallpaperStore.getState().logoPositionX).toBe(0.42);
		expect(useWallpaperStore.getState().logoPositionY).toBe(-0.3);
	});

	it('leaves the logo alone when the image carries no composition', () => {
		useWallpaperStore.setState({
			logoPositionX: -0.9,
			logoPositionY: 0.8,
			logoFollowImageFocus: true
		});

		useWallpaperStore.getState().setLogoFollowImageFocus(false);

		expect(useWallpaperStore.getState().logoPositionX).toBe(-0.9);
		expect(useWallpaperStore.getState().logoPositionY).toBe(0.8);
	});
});
