import { beforeEach, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (key: string) => mem.get(key) ?? null,
	setItem: (key: string, value: string) => void mem.set(key, value),
	removeItem: (key: string) => void mem.delete(key),
	clear: () => void mem.clear()
};

const { useWallpaperStore } = await import('@/store/wallpaperStore');
const { createBackgroundImageItem } =
	await import('@/features/background/backgroundImages');

function seed() {
	useWallpaperStore.setState({
		backgroundImages: [
			createBackgroundImageItem('img-1', 'one.png'),
			createBackgroundImageItem('img-2', 'two.png')
		],
		activeImageId: 'img-1'
	});
}

describe('image transition controls', () => {
	beforeEach(seed);

	it('edits only the active image and preserves its style and duration', () => {
		const before = useWallpaperStore.getState();
		before.setImageTransitionLayerTargets(['spectrum2', 'logo']);
		const after = useWallpaperStore.getState();
		expect(after.backgroundImages[0].transitionLayerTargets).toEqual([
			'spectrum2',
			'logo'
		]);
		expect(after.backgroundImages[1]).toBe(before.backgroundImages[1]);
		expect(after.backgroundImages[0].transitionDuration).toBe(
			before.backgroundImages[0].transitionDuration
		);
		expect(after.backgroundImages[0].transitionType).toBe(
			before.backgroundImages[0].transitionType
		);
	});

	it('can apply the active image transition to every supported extra layer', () => {
		useWallpaperStore
			.getState()
			.setImageTransitionLayerTargets(['spectrum', 'spectrum2', 'logo']);
		expect(
			useWallpaperStore.getState().backgroundImages[0]
				.transitionLayerTargets
		).toEqual(['spectrum', 'spectrum2', 'logo']);
	});
});

describe('batch transition action', () => {
	beforeEach(seed);

	it('writes atomically, keeps duration and updates only active mirrors', async () => {
		const { planTransitionBatch } =
			await import('@/features/background/transitionBatch');
		const state = useWallpaperStore.getState();
		const plan = planTransitionBatch(
			state.backgroundImages,
			['iris', 'cross-zoom'],
			{ transitionIntensity: 1.8 }
		)!;
		expect(
			state.applyTransitionBatch(
				plan,
				state.backgroundImages,
				state.setlists
			)
		).toBe(true);
		const after = useWallpaperStore.getState();
		expect(after.slideshowTransitionType).toBe(
			after.backgroundImages[0].transitionType
		);
		expect(after.slideshowTransitionIntensity).toBe(1.8);
		expect(after.slideshowTransitionDuration).toBe(
			state.slideshowTransitionDuration
		);
		expect(after.backgroundImages.map(i => i.transitionDuration)).toEqual(
			state.backgroundImages.map(i => i.transitionDuration)
		);
		expect(
			after.applyTransitionBatch(
				plan,
				state.backgroundImages,
				state.setlists
			)
		).toBe(false);
	});

	it('rejects a confirmation whose setlist changed', async () => {
		const { planTransitionBatch } =
			await import('@/features/background/transitionBatch');
		const state = useWallpaperStore.getState();
		const plan = planTransitionBatch(state.backgroundImages, [
			'iris',
			'cross-zoom'
		])!;
		useWallpaperStore.setState({ setlists: [...state.setlists] });
		expect(
			state.applyTransitionBatch(
				plan,
				state.backgroundImages,
				state.setlists
			)
		).toBe(false);
		expect(useWallpaperStore.getState().backgroundImages).toBe(
			state.backgroundImages
		);
	});
});
