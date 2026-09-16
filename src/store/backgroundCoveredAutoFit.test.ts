import { describe, it, expect, vi, beforeEach } from 'vitest';

// The persist middleware touches localStorage at module load time; the shim
// must exist before the store import, so these imports stay dynamic on purpose.
const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
	value: {
		getItem: (k: string) => mem.get(k) ?? null,
		setItem: (k: string, v: string) => void mem.set(k, v),
		removeItem: (k: string) => void mem.delete(k),
		clear: () => mem.clear()
	},
	configurable: true
});

const loadImageDimensionsMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/background', async importOriginal => ({
	...(await importOriginal<Record<string, unknown>>()),
	loadImageDimensions: loadImageDimensionsMock
}));

const { useWallpaperStore } = await import('@/store/wallpaperStore');
const { createBackgroundImageItem } =
	await import('@/features/background/backgroundImages');

function setup(overrides: Partial<WallpaperOverrides> = {}) {
	const item = createBackgroundImageItem('img-a', 'a.png', null, {
		fitMode: 'contain',
		scale: 3.5,
		positionX: 0.4,
		positionY: 0.3,
		focusX: 0.2,
		focusY: 0.9,
		coverageLockEnabled: true,
		...overrides.itemSettings
	});
	useWallpaperStore.setState({
		backgroundImages: [item],
		activeImageId: 'img-a',
		imageCoverageLockEnabled: true,
		imageFitMode: 'contain',
		imageScale: 3.5,
		imagePositionX: 0.4,
		imagePositionY: 0.3,
		imageFocusX: 0.2,
		imageFocusY: 0.9,
		imageRotation: 0,
		imageMirrorFill: false,
		imageMirrorFillCount: 0,
		...overrides.state
	});
	return item;
}

type WallpaperOverrides = {
	itemSettings?: Partial<Parameters<typeof createBackgroundImageItem>[3]>;
	state?: Record<string, unknown>;
};

/**
 * Portrait image in a landscape viewport, contain: base tile is 607.5 x 1080,
 * so the coverage minimum scale is 1920/607.5 = 3.1605 and the only X that
 * covers at exactly that scale is 0.
 */
const COVER_MIN = 1920 / 607.5; // 3.160493827160494

beforeEach(() => {
	loadImageDimensionsMock.mockReset();
	loadImageDimensionsMock.mockResolvedValue({ width: 1080, height: 1920 });
});

describe('autoFitCoveredActiveImage', () => {
	it('raises a sub-minimum scale to the coverage minimum and clamps the center into bounds', async () => {
		setup({
			itemSettings: { scale: 1.5 },
			state: { imageScale: 1.5, imagePositionX: 0.5 }
		});

		await useWallpaperStore.getState().autoFitCoveredActiveImage();

		const s = useWallpaperStore.getState();
		// fitMode and focus are NOT the action's business anymore.
		expect(s.imageFitMode).toBe('contain');
		expect(s.imageFocusX).toBe(0.2);
		expect(s.imageFocusY).toBe(0.9);
		// Scale raised to the minimum, center clamped to the only X that
		// covers at exactly that scale (drawn width equals viewport width).
		expect(s.imageScale).toBeCloseTo(COVER_MIN, 6);
		expect(s.imagePositionX).toBeCloseTo(0, 6);
		expect(s.imagePositionY).toBeCloseTo(0.3, 6);
		// And the store copy reflects it.
		const a = s.backgroundImages.find(i => i.assetId === 'img-a');
		expect(a?.scale).toBeCloseTo(COVER_MIN, 6);
	});

	it('does nothing while the coverage lock is off', async () => {
		setup({ state: { imageCoverageLockEnabled: false } });

		await useWallpaperStore.getState().autoFitCoveredActiveImage();

		expect(loadImageDimensionsMock).not.toHaveBeenCalled();
		expect(useWallpaperStore.getState().imageScale).toBe(3.5);
	});

	it('leaves the composition untouched when dimensions fail to load', async () => {
		setup();
		loadImageDimensionsMock.mockRejectedValue(new Error('decode failed'));

		await useWallpaperStore.getState().autoFitCoveredActiveImage();

		const s = useWallpaperStore.getState();
		expect(s.imageFitMode).toBe('contain');
		expect(s.imageScale).toBe(3.5);
		expect(s.imagePositionX).toBe(0.4);
	});

	it('aborts the write if the active image changed while dimensions loaded', async () => {
		setup();
		let release!: (v: { width: number; height: number }) => void;
		loadImageDimensionsMock.mockReturnValue(
			new Promise(res => (release = res))
		);

		const run = useWallpaperStore.getState().autoFitCoveredActiveImage();
		useWallpaperStore.setState({ activeImageId: null });
		release({ width: 1080, height: 1920 });
		await run;

		expect(useWallpaperStore.getState().imageScale).toBe(3.5);
	});

	it('refits a hand-tuned composition when the lock is enabled', async () => {
		setup();
		useWallpaperStore.getState().setActiveImageFramingEdited(true);
		// Turning the lock ON clears the provenance flag, then the refit
		// runs — explicit intent outranks the hand-tuned guard.
		useWallpaperStore.getState().setImageCoverageLockEnabled(true);

		// 0.4 exceeds the covered X bound at scale 3.5 (±0.107...): clamped.
		await vi.waitFor(() =>
			expect(useWallpaperStore.getState().imagePositionX).toBeCloseTo(
				0.107421875,
				6
			)
		);

		const s = useWallpaperStore.getState();
		expect(s.imageFitMode).toBe('contain');
		expect(s.imageScale).toBe(3.5); // already above the minimum
		expect(s.imageFocusX).toBe(0.2);
		expect(s.imagePositionY).toBe(0.3); // within bounds, kept
		expect(s.imageCoverageLockEnabled).toBe(true);
		expect(
			s.backgroundImages.find(i => i.assetId === 'img-a')
				?.coverageFramingEdited
		).toBe(false);
	});

	it('clears the hand-tuned guard even when the fit already matches', async () => {
		// Position already inside bounds at the current scale: the patch is
		// already-fitted, but the guard must still clear on lock-on.
		setup({ state: { imagePositionX: 0.05 } });
		useWallpaperStore.getState().setActiveImageFramingEdited(true);
		expect(
			useWallpaperStore
				.getState()
				.backgroundImages.find(i => i.assetId === 'img-a')
				?.coverageFramingEdited
		).toBe(true);

		useWallpaperStore.getState().setImageCoverageLockEnabled(true);

		await vi.waitFor(() =>
			expect(
				useWallpaperStore
					.getState()
					.backgroundImages.find(i => i.assetId === 'img-a')
					?.coverageFramingEdited
			).toBe(false)
		);
		expect(useWallpaperStore.getState().imagePositionX).toBe(0.05);
	});

	it('re-fits the newly active locked image for the current viewport', async () => {
		// A previously-active image can be locked and still sub-minimum for
		// this viewport (it was composed elsewhere). The other image is NOT
		// locked, so it never gets a passive refit.
		const lockedDirty = createBackgroundImageItem('img-b', 'b.png', null, {
			fitMode: 'contain',
			scale: 1.2,
			coverageLockEnabled: true
		});
		const other = createBackgroundImageItem('img-c', 'c.png', null, {
			coverageLockEnabled: false
		});
		useWallpaperStore.setState({
			backgroundImages: [lockedDirty, other],
			activeImageId: 'img-c',
			imageCoverageLockEnabled: false,
			imageFitMode: 'contain',
			imageScale: 1,
			imagePositionX: 0,
			imagePositionY: 0,
			imageFocusX: null,
			imageFocusY: null,
			imageMirrorFill: false,
			imageMirrorFillCount: 0
		});

		useWallpaperStore.getState().setActiveImageId('img-b');

		// The selection mirrors img-b's sub-minimum scale, then the covered
		// refit raises it to the viewport minimum.
		await vi.waitFor(() =>
			expect(loadImageDimensionsMock).toHaveBeenCalledWith('b.png')
		);
		await vi.waitFor(() =>
			expect(useWallpaperStore.getState().imageScale).toBeCloseTo(
				COVER_MIN,
				6
			)
		);
		expect(useWallpaperStore.getState().imageFitMode).toBe('contain');
		expect(
			useWallpaperStore
				.getState()
				.backgroundImages.find(i => i.assetId === 'img-b')?.scale
		).toBeCloseTo(COVER_MIN, 6);
	});

	it('does not re-fit an image without its own coverage lock', async () => {
		const unlocked = createBackgroundImageItem('img-b', 'b.png', null, {
			coverageLockEnabled: false
		});
		useWallpaperStore.setState({
			backgroundImages: [unlocked],
			activeImageId: null,
			imageCoverageLockEnabled: false,
			imageFitMode: 'contain',
			imageScale: 3.5,
			imageMirrorFill: false,
			imageMirrorFillCount: 0
		});

		useWallpaperStore.getState().setActiveImageId('img-b');
		await Promise.resolve();
		await Promise.resolve();

		// The selection mirrors the item's sub-minimum scale (1) and NO
		// passive refit runs: an unlocked image keeps its framing.
		expect(useWallpaperStore.getState().imageScale).toBe(1);
	});
});
