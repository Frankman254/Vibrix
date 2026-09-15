import { describe, it, expect, vi } from 'vitest';
import type { BackgroundImageSettings } from '@/features/background/backgroundImages';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => void mem.set(k, v),
	removeItem: (k: string) => void mem.delete(k),
	clear: () => void mem.clear()
};

// Persist middleware touches localStorage at module-load time; the shim must
// exist before the store import (same pattern as sceneFirst.test.ts).
const loadImageDimensionsMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/background', async importOriginal => ({
	...(await importOriginal<Record<string, unknown>>()),
	loadImageDimensions: loadImageDimensionsMock
}));

const { useWallpaperStore } = await import('@/store/wallpaperStore');
const { createBackgroundImageItem } =
	await import('@/features/background/backgroundImages');

function setup(imageOverrides: Partial<BackgroundImageSettings> = {}) {
	mem.clear();
	loadImageDimensionsMock.mockReset();
	const image = createBackgroundImageItem('img-a', 'a.png', null, {
		coverageLockEnabled: true,
		...imageOverrides
	});
	useWallpaperStore.setState({
		backgroundImages: [image],
		activeImageId: 'img-a',
		imageCoverageLockEnabled: true,
		imageFitMode: 'contain',
		imageScale: 3.5,
		imagePositionX: 0.4,
		imagePositionY: 0.3,
		imageFocusX: 0.2,
		imageFocusY: 0.9
	});
}

describe('autoFitCoveredActiveImage', () => {
	it('rewrites the active composition to the honest cover fit', async () => {
		setup();
		loadImageDimensionsMock.mockResolvedValue({
			width: 1080,
			height: 1920
		});

		await useWallpaperStore.getState().autoFitCoveredActiveImage();

		const s = useWallpaperStore.getState();
		expect(loadImageDimensionsMock).toHaveBeenCalledWith('a.png');
		expect(s.imageFitMode).toBe('cover');
		expect(s.imagePositionX).toBe(0);
		expect(s.imagePositionY).toBe(0);
		expect(s.imageFocusX).toBe(0.5);
		expect(s.imageFocusY).toBe(0.5);
		expect(s.imageScale).toBeCloseTo(1.0, 5);
		// And the per-image copy keeps the composition for the next switch.
		const stored = s.backgroundImages.find(i => i.assetId === 'img-a')!;
		expect(stored.fitMode).toBe('cover');
		expect(stored.coverageLockEnabled).toBe(true);
	});

	it('does nothing while the coverage lock is off', async () => {
		setup();
		useWallpaperStore.setState({ imageCoverageLockEnabled: false });
		loadImageDimensionsMock.mockResolvedValue({
			width: 1080,
			height: 1920
		});

		await useWallpaperStore.getState().autoFitCoveredActiveImage();

		expect(loadImageDimensionsMock).not.toHaveBeenCalled();
		expect(useWallpaperStore.getState().imageFitMode).toBe('contain');
		expect(useWallpaperStore.getState().imageScale).toBe(3.5);
	});

	it('leaves the composition untouched when dimensions fail to load', async () => {
		setup();
		loadImageDimensionsMock.mockRejectedValue(
			new Error('image-dimensions-failed')
		);

		await useWallpaperStore.getState().autoFitCoveredActiveImage();

		expect(useWallpaperStore.getState().imageFitMode).toBe('contain');
		expect(useWallpaperStore.getState().imageScale).toBe(3.5);
	});

	it('aborts the write if the active image changed while dimensions loaded', async () => {
		setup();
		let resolveDims: (d: { width: number; height: number }) => void = () =>
			void 0;
		const promise = new Promise<{ width: number; height: number }>(
			r => (resolveDims = r)
		);
		loadImageDimensionsMock.mockReturnValue(promise);

		const pending = useWallpaperStore
			.getState()
			.autoFitCoveredActiveImage();
		// Race: user switches to a url-less image mid-load.
		const bare = createBackgroundImageItem('img-b', null);
		useWallpaperStore.setState({
			backgroundImages: [
				...useWallpaperStore.getState().backgroundImages,
				bare
			],
			activeImageId: 'img-b'
		});
		resolveDims({ width: 1080, height: 1920 });
		await pending;

		// The stale suggestion must not clobber the new active image's state.
		expect(useWallpaperStore.getState().imageFitMode).toBe('contain');
		expect(useWallpaperStore.getState().imageScale).toBe(3.5);
	});
});

describe('coverage lock switch ON = full recalculation', () => {
	/** The provenance flag is not importable; mark the active image by hand. */
	function markHandTuned() {
		useWallpaperStore.getState().setActiveImageFramingEdited(true);
	}

	it('refits a hand-tuned composition when the lock is enabled', async () => {
		setup();
		markHandTuned();
		useWallpaperStore.setState({ imageCoverageLockEnabled: false });
		loadImageDimensionsMock.mockResolvedValue({
			width: 1080,
			height: 1920
		});

		useWallpaperStore.getState().setImageCoverageLockEnabled(true);

		// Turning the switch ON is explicit user intent: the hand-tuned
		// provenance must not block the recalculation.
		await vi.waitFor(() =>
			expect(useWallpaperStore.getState().imageFitMode).toBe('cover')
		);
		const s = useWallpaperStore.getState();
		expect(s.imageScale).toBeCloseTo(1.0, 5);
		expect(s.imagePositionX).toBe(0);
		expect(s.imagePositionY).toBe(0);
		// The recomputed composition is machine-owned again: later viewport
		// changes keep re-fitting it (otherwise the bug returns on resize).
		const stored = s.backgroundImages.find(i => i.assetId === 'img-a')!;
		expect(stored.coverageFramingEdited).toBe(false);
	});

	it('clears the hand-tuned guard even when the fit already matches', async () => {
		setup();
		useWallpaperStore.setState({ imageCoverageLockEnabled: false });
		loadImageDimensionsMock.mockResolvedValue({
			width: 1080,
			height: 1920
		});
		// First ON: real refit lands the cover suggestion.
		useWallpaperStore.getState().setImageCoverageLockEnabled(true);
		await vi.waitFor(() =>
			expect(useWallpaperStore.getState().imageFitMode).toBe('cover')
		);
		// Simulate a hand-tweak that changes nothing numerically: the fit
		// already matches, so the patch is a no-op — but turning the switch
		// ON again must still clear the guard, or the next resize skips the
		// refit and the stale-framing bug returns.
		useWallpaperStore.getState().setImageCoverageLockEnabled(false);
		useWallpaperStore.getState().setActiveImageFramingEdited(true);
		useWallpaperStore.getState().setImageCoverageLockEnabled(true);
		await vi.waitFor(() =>
			expect(
				useWallpaperStore
					.getState()
					.backgroundImages.find(i => i.assetId === 'img-a')!
					.coverageFramingEdited
			).toBe(false)
		);
	});

	it('passive refits still respect the hand-tuned guard', async () => {
		setup();
		markHandTuned();
		loadImageDimensionsMock.mockResolvedValue({
			width: 1080,
			height: 1920
		});

		await useWallpaperStore.getState().autoFitCoveredActiveImage();

		// Image-switch / viewport refits must never overwrite hand framing.
		expect(loadImageDimensionsMock).not.toHaveBeenCalled();
		expect(useWallpaperStore.getState().imageFitMode).toBe('contain');
	});
});

describe('setActiveImageId keep-covered re-fit', () => {
	it('re-fits the newly active locked image for the current viewport', async () => {
		mem.clear();
		loadImageDimensionsMock.mockReset();
		const lockedDirty = createBackgroundImageItem('img-a', 'a.png', null, {
			coverageLockEnabled: true,
			fitMode: 'contain',
			scale: 3.5
		});
		useWallpaperStore.setState({
			backgroundImages: [lockedDirty],
			activeImageId: null,
			imageCoverageLockEnabled: false,
			imageFitMode: 'fit-width',
			imageScale: 1.2,
			imagePositionX: 0.5,
			imagePositionY: 0.5
		});
		loadImageDimensionsMock.mockResolvedValue({
			width: 1080,
			height: 1920
		});

		useWallpaperStore.getState().setActiveImageId('img-a');

		// The item's own lock restores the global synchronously...
		expect(useWallpaperStore.getState().imageCoverageLockEnabled).toBe(
			true
		);
		// ...and the fire-and-forget re-fit lands once dimensions resolve.
		await vi.waitFor(() =>
			expect(useWallpaperStore.getState().imageFitMode).toBe('cover')
		);
		const s = useWallpaperStore.getState();
		expect(s.imageScale).toBeCloseTo(1.0, 5);
		expect(s.imagePositionX).toBe(0);
	});

	it('does not re-fit an image without its own coverage lock', () => {
		mem.clear();
		loadImageDimensionsMock.mockReset();
		const unlocked = createBackgroundImageItem('img-c', 'c.png', null, {
			coverageLockEnabled: false
		});
		useWallpaperStore.setState({
			backgroundImages: [unlocked],
			activeImageId: null,
			imageCoverageLockEnabled: false,
			imageFitMode: 'fit-width',
			imageScale: 1.2
		});
		loadImageDimensionsMock.mockResolvedValue({
			width: 1080,
			height: 1920
		});

		useWallpaperStore.getState().setActiveImageId('img-c');

		// Switching mirrors the item's own stored composition…
		expect(useWallpaperStore.getState().imageFitMode).toBe(
			unlocked.fitMode
		);
		// …but the guard bails before any await: no re-fit for unlocked images.
		expect(loadImageDimensionsMock).not.toHaveBeenCalled();
	});
});
