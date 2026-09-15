import { describe, it, expect, vi } from 'vitest';
import type { BackgroundImageItem } from '@/types/wallpaper';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => void mem.set(k, v),
	removeItem: (k: string) => void mem.delete(k),
	clear: () => void mem.clear()
};

// Persist middleware touches localStorage at module-load time; the shim must
// exist before the store import, so these imports stay dynamic on purpose
// (same pattern as backgroundCoveredAutoFit.test.ts).
const analyzeMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/background', async importOriginal => ({
	...(await importOriginal<Record<string, unknown>>()),
	analyzeImageUrlSaliency: analyzeMock
}));

const { useWallpaperStore } = await import('@/store/wallpaperStore');
const { createBackgroundImageItem } =
	await import('@/features/background/backgroundImages');

/**
 * Fake analysis: focus point bottom-left, and a 32x32 grid whose only saliency
 * mass sits in the top-right corner cell — the one corner a small logo box
 * could never pick, forcing lowestMassBox to answer top-left.
 */
function fakeAnalysis() {
	const width = 32;
	const height = 32;
	const values = new Float32Array(width * height);
	values[width - 1] = 1;
	return {
		grid: { width, height, values },
		focus: { x: 0.125, y: 0.875 },
		lowMassBox: { x: 0, y: 0, width: 0.5, height: 0.5 }
	};
}

function setup(images: BackgroundImageItem[]) {
	mem.clear();
	analyzeMock.mockReset();
	useWallpaperStore.setState({
		backgroundImages: images,
		activeImageId: images[0]?.assetId ?? null,
		imageFocusX: 0.5,
		imageFocusY: 0.5,
		logoPositionX: 0,
		logoPositionY: 0,
		logoBaseSize: 80,
		activeSetlistId: null
	});
}

describe('autoFocusActiveImage', () => {
	it('sets the focus point from saliency and syncs the globals', async () => {
		const image = createBackgroundImageItem('img-a', 'a.png', null, {
			focusX: 0.5,
			focusY: 0.5
		});
		setup([image]);
		analyzeMock.mockResolvedValue(fakeAnalysis());

		await useWallpaperStore.getState().autoFocusActiveImage();

		expect(analyzeMock).toHaveBeenCalledWith('a.png');
		const s = useWallpaperStore.getState();
		const stored = s.backgroundImages.find(i => i.assetId === 'img-a')!;
		expect(stored.focusX).toBeCloseTo(0.125, 5);
		expect(stored.focusY).toBeCloseTo(0.875, 5);
		// The runtime patch mirrors the active image into the globals.
		expect(s.imageFocusX).toBeCloseTo(0.125, 5);
		expect(s.imageFocusY).toBeCloseTo(0.875, 5);
		// Focus is user intent: covered auto-fit must not recenter it later.
		expect(stored.coverageFramingEdited).toBe(true);
	});

	it('leaves the composition untouched when the image fails to load', async () => {
		setup([createBackgroundImageItem('img-a', 'a.png', null)]);
		analyzeMock.mockRejectedValue(new Error('image-load-failed'));

		await useWallpaperStore.getState().autoFocusActiveImage();

		const s = useWallpaperStore.getState();
		expect(s.imageFocusX).toBe(0.5);
		expect(s.imageFocusY).toBe(0.5);
	});

	it('drops a stale result when the active image changed while analyzing', async () => {
		setup([
			createBackgroundImageItem('img-a', 'a.png', null),
			createBackgroundImageItem('img-b', 'b.png', null)
		]);
		analyzeMock.mockImplementation(async () => {
			// User switched images mid-analysis.
			useWallpaperStore.setState({ activeImageId: 'img-b' });
			return fakeAnalysis();
		});

		await useWallpaperStore.getState().autoFocusActiveImage();

		const s = useWallpaperStore.getState();
		const a = s.backgroundImages.find(i => i.assetId === 'img-a')!;
		expect(a.focusX).toBeNull();
		expect(a.coverageFramingEdited).not.toBe(true);
	});
});

describe('autoFocusAllImages', () => {
	it('rewrites focus for every image and syncs the active globals', async () => {
		setup([
			createBackgroundImageItem('img-a', 'a.png', null),
			createBackgroundImageItem('img-b', 'b.png', null)
		]);
		analyzeMock.mockResolvedValue(fakeAnalysis());

		await useWallpaperStore.getState().autoFocusAllImages();

		const s = useWallpaperStore.getState();
		for (const image of s.backgroundImages) {
			expect(image.focusX).toBeCloseTo(0.125, 5);
			expect(image.focusY).toBeCloseTo(0.875, 5);
			// Focus is user intent even in bulk: framing stays hand-owned so a
			// later viewport resize never erases the computed focus.
			expect(image.coverageFramingEdited).toBe(true);
		}
		expect(s.imageFocusX).toBeCloseTo(0.125, 5);
	});
});

describe('autoPlaceLogoForActiveImage', () => {
	it('places the logo at the low-mass corner of the active image', async () => {
		setup([createBackgroundImageItem('img-a', 'a.png', null)]);
		// All mass top-right → empty corner is top-left: logo left (x-) and
		// up (logo position space has y+ = up).
		analyzeMock.mockResolvedValue(fakeAnalysis());

		await useWallpaperStore.getState().autoPlaceLogoForActiveImage();

		const s = useWallpaperStore.getState();
		expect(s.logoPositionX).toBeLessThan(0);
		expect(s.logoPositionY).toBeGreaterThan(0);
	});

	it('keeps the placement when no background image is loaded', async () => {
		setup([]);
		useWallpaperStore.setState({
			logoPositionX: 0.4,
			logoPositionY: -0.2
		});

		await useWallpaperStore.getState().autoPlaceLogoForActiveImage();

		expect(analyzeMock).not.toHaveBeenCalled();
		expect(useWallpaperStore.getState().logoPositionX).toBe(0.4);
	});
});
