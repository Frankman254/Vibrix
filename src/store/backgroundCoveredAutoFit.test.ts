import { describe, it, expect, vi, beforeEach } from 'vitest';

// The persist middleware touches localStorage at module load time; the shim
// must exist before the store import, so these imports stay dynamic on purpose.
const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
	value: {
		getItem: (k: string) => mem.get(k) ?? null,
		setItem: (k: string, v: string) => void mem.set(k, v),
		removeItem: (k: string) => void mem.delete(k)
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
		...overrides.itemSettings
	});
	useWallpaperStore.setState({
		backgroundImages: [item],
		activeImageId: 'img-a',
		imageFitMode: 'contain',
		imageScale: 3.5,
		imagePositionX: 0.4,
		imagePositionY: 0.3,
		imageFocusX: 0.2,
		imageFocusY: 0.9,
		imageRotation: 0,
		imageMirrorFill: false,
		imageMirrorFillCount: 0,
		imageFramingManualEnabled: false,
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

	it('never machine-overwrites a hand-tuned framing', async () => {
		setup();
		useWallpaperStore.getState().setActiveImageFramingEdited(true);

		await useWallpaperStore.getState().autoFitCoveredActiveImage();

		expect(loadImageDimensionsMock).not.toHaveBeenCalled();
		expect(useWallpaperStore.getState().imageScale).toBe(3.5);
		expect(useWallpaperStore.getState().imagePositionX).toBe(0.4);
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

	it('re-fits the newly active image for the current viewport', async () => {
		// A previously-active image can still be sub-minimum for this
		// viewport (it was composed elsewhere). Selecting it passive-refits.
		const dirty = createBackgroundImageItem('img-b', 'b.png', null, {
			fitMode: 'contain',
			scale: 1.2
		});
		const other = {
			...createBackgroundImageItem('img-c', 'c.png', null),
			coverageFramingEdited: true
		};
		useWallpaperStore.setState({
			backgroundImages: [dirty, other],
			activeImageId: 'img-c',
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

	it('does not passive-refit a hand-tuned image on selection', async () => {
		const handTuned = {
			...createBackgroundImageItem('img-b', 'b.png', null),
			coverageFramingEdited: true
		};
		useWallpaperStore.setState({
			backgroundImages: [handTuned],
			activeImageId: null,
			imageFitMode: 'contain',
			imageScale: 3.5,
			imageMirrorFill: false,
			imageMirrorFillCount: 0
		});

		useWallpaperStore.getState().setActiveImageId('img-b');
		await Promise.resolve();
		await Promise.resolve();

		// The selection mirrors the item's sub-minimum scale (1) and NO
		// passive refit runs: a hand-tuned image keeps its framing.
		expect(useWallpaperStore.getState().imageScale).toBe(1);
	});
});

describe('autoCoverFitActiveImage', () => {
	it('sets the exact covered framing over a hand-tuned composition and clears provenance', async () => {
		setup();
		useWallpaperStore.getState().setActiveImageFramingEdited(true);

		await useWallpaperStore.getState().autoCoverFitActiveImage();

		// Explicit fit is a full recalculation: scale lands EXACTLY on the
		// coverage minimum (it may shrink from the hand-tuned 3.5), and the
		// composition is clamped into coverage bounds at that scale.
		const s = useWallpaperStore.getState();
		expect(s.imageFitMode).toBe('contain');
		expect(s.imageFocusX).toBe(0.2);
		expect(s.imageFocusY).toBe(0.9);
		expect(s.imageScale).toBeCloseTo(COVER_MIN, 6);
		// At exactly the covering scale the only authored X that keeps
		// focusX=0.2 centered is -(0.5-0.2)*2 = -0.6 (focus is user intent:
		// the fit lands on it, never recenters it).
		expect(s.imagePositionX).toBeCloseTo(-0.6, 6);
		const a = s.backgroundImages.find(i => i.assetId === 'img-a');
		expect(a?.coverageFramingEdited).toBe(false);
		expect(a?.scale).toBeCloseTo(COVER_MIN, 6);
	});

	it('clears the hand-tuned guard even when the framing already matches', async () => {
		setup({
			itemSettings: { scale: COVER_MIN, positionX: -0.6, positionY: 0.3 },
			state: { imageScale: COVER_MIN, imagePositionX: -0.6 }
		});
		useWallpaperStore.getState().setActiveImageFramingEdited(true);
		expect(
			useWallpaperStore
				.getState()
				.backgroundImages.find(i => i.assetId === 'img-a')
				?.coverageFramingEdited
		).toBe(true);

		await useWallpaperStore.getState().autoCoverFitActiveImage();

		expect(
			useWallpaperStore
				.getState()
				.backgroundImages.find(i => i.assetId === 'img-a')
				?.coverageFramingEdited
		).toBe(false);
		expect(useWallpaperStore.getState().imagePositionX).toBeCloseTo(
			-0.6,
			6
		);
	});

	it('fits every image whose dimensions loaded, keeping the rest', async () => {
		const a = {
			...createBackgroundImageItem('img-a', 'a.png', null, {
				fitMode: 'contain',
				scale: 1
			}),
			coverageFramingEdited: true
		};
		const b = createBackgroundImageItem('img-b', 'b.png', null, {
			fitMode: 'contain',
			scale: 1
		});
		useWallpaperStore.setState({
			backgroundImages: [a, b],
			activeImageId: 'img-a',
			imageFitMode: 'contain',
			imageScale: 1,
			imagePositionX: 0,
			imagePositionY: 0,
			imageFocusX: null,
			imageFocusY: null,
			imageMirrorFill: false,
			imageMirrorFillCount: 0
		});
		loadImageDimensionsMock.mockImplementation((url: string) =>
			url === 'b.png'
				? Promise.reject(new Error('decode failed'))
				: Promise.resolve({ width: 1080, height: 1920 })
		);

		await useWallpaperStore.getState().autoCoverFitAllImages();

		const s = useWallpaperStore.getState();
		const fittedA = s.backgroundImages.find(i => i.assetId === 'img-a');
		const keptB = s.backgroundImages.find(i => i.assetId === 'img-b');
		// Explicit fit-all outranks the hand-tuned guard and exact-fits the
		// item with dims; the broken item keeps its framing.
		expect(fittedA?.scale).toBeCloseTo(COVER_MIN, 6);
		expect(fittedA?.coverageFramingEdited).toBe(false);
		expect(keptB?.scale).toBe(1);
		expect(keptB?.coverageFramingEdited).toBe(false);
	});
});

describe('setImageFramingManualEnabled', () => {
	it('stops the passive refit while manual framing is on', async () => {
		setup({
			itemSettings: { scale: 1.5 },
			state: { imageScale: 1.5, imagePositionX: 0.5 }
		});
		useWallpaperStore.getState().setImageFramingManualEnabled(true);

		await useWallpaperStore.getState().autoFitCoveredActiveImage();

		const s = useWallpaperStore.getState();
		expect(loadImageDimensionsMock).not.toHaveBeenCalled();
		// The sub-minimum scale the user asked for survives untouched.
		expect(s.imageScale).toBe(1.5);
		expect(s.imagePositionX).toBe(0.5);
	});

	it('refits the active image as soon as manual framing is turned off', async () => {
		setup({
			// No focus point: the exact fit then lands dead centre, so the
			// assertion below is about coverage and nothing else.
			itemSettings: { scale: 1.5, focusX: null, focusY: null },
			state: {
				imageScale: 1.5,
				imagePositionX: 0.5,
				imageFocusX: null,
				imageFocusY: null,
				imageFramingManualEnabled: true
			}
		});

		useWallpaperStore.getState().setActiveImageFramingEdited(true);

		useWallpaperStore.getState().setImageFramingManualEnabled(false);
		// The refit loads the image dimensions, so let its promise settle.
		await vi.waitFor(() => {
			expect(useWallpaperStore.getState().imageScale).not.toBe(1.5);
		});

		const s = useWallpaperStore.getState();
		expect(s.imageFramingManualEnabled).toBe(false);
		expect(s.imageScale).toBeCloseTo(COVER_MIN, 6);
		expect(s.imagePositionX).toBeCloseTo(0, 6);
		// Cover Fit is a machine framing again.
		const a = s.backgroundImages.find(i => i.assetId === 'img-a');
		expect(a?.coverageFramingEdited).toBe(false);
	});
});
