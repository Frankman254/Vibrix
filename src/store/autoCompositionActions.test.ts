import { describe, it, expect, vi } from 'vitest';
import type { BackgroundImageItem } from '@/types/wallpaper';
import { suggestBackgroundAutoFit } from '@/features/background';

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
const loadImageDimensionsMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/background', async importOriginal => ({
	...(await importOriginal<Record<string, unknown>>()),
	analyzeImageUrlSaliency: analyzeMock,
	loadImageDimensions: loadImageDimensionsMock
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
	loadImageDimensionsMock.mockReset();
	loadImageDimensionsMock.mockResolvedValue({ width: 1920, height: 1080 });
	useWallpaperStore.setState({
		backgroundImages: images,
		activeImageId: images[0]?.assetId ?? null,
		imageFocusX: 0.5,
		imageFocusY: 0.5,
		logoPositionX: 0,
		logoPositionY: 0,
		logoBaseSize: 80,
		spectrumFollowLogo: true,
		activeSetlistId: null
	});
}

/** Flat grid: no subject anywhere; only geometry/bias drives placement. */
function flatAnalysis() {
	const width = 32;
	const height = 32;
	return {
		grid: { width, height, values: new Float32Array(width * height) },
		focus: { x: 0.5, y: 0.5 },
		lowMassBox: { x: 0, y: 0, width: 0.5, height: 0.5 }
	};
}
/** Mass concentrated around the dead center: a subject of `radius` (0–1). */
function centerBlobAnalysis(radius = 0.02) {
	const width = 32;
	const height = 32;
	const values = new Float32Array(width * height);
	for (let gy = 0; gy < height; gy++) {
		for (let gx = 0; gx < width; gx++) {
			const dx = (gx + 0.5) / width - 0.5;
			const dy = (gy + 0.5) / height - 0.5;
			if (Math.hypot(dx, dy) <= radius) values[gy * width + gx] = 1;
		}
	}
	return {
		grid: { width, height, values },
		focus: { x: 0.5, y: 0.5 },
		lowMassBox: { x: 0, y: 0, width: 0.5, height: 0.5 }
	};
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

describe('autoFrameActiveImage', () => {
	it('applies the fit suggestion AND the saliency focus, and syncs the globals', async () => {
		setup([createBackgroundImageItem('img-a', 'a.png', null)]);
		analyzeMock.mockResolvedValue(fakeAnalysis());

		await useWallpaperStore.getState().autoFrameActiveImage();

		const s = useWallpaperStore.getState();
		const stored = s.backgroundImages.find(i => i.assetId === 'img-a')!;
		// Fit half: the real suggestBackgroundAutoFit against the mocked
		// 1920x1080 dimensions and the store's headless viewport fallback.
		const suggestion = suggestBackgroundAutoFit(1920, 1080, 1920, 1080);
		expect(stored.fitMode).toBe(suggestion.fitMode);
		expect(stored.scale).toBeCloseTo(suggestion.scale, 5);
		expect(stored.positionX).toBeCloseTo(suggestion.positionX, 5);
		expect(stored.positionY).toBeCloseTo(suggestion.positionY, 5);
		// Focus half: saliency point.
		expect(stored.focusX).toBeCloseTo(0.125, 5);
		expect(stored.focusY).toBeCloseTo(0.875, 5);
		// The runtime patch mirrors the active image into the globals.
		expect(s.imageScale).toBeCloseTo(suggestion.scale, 5);
		expect(s.imageFocusX).toBeCloseTo(0.125, 5);
		expect(s.imageFocusY).toBeCloseTo(0.875, 5);
		// Framing is machine-derived but includes focus intent: covered
		// auto-fit must not recenter it later.
		expect(stored.coverageFramingEdited).toBe(true);
	});

	it('keeps a saliency-only result when dimension loading fails', async () => {
		setup([createBackgroundImageItem('img-a', 'a.png', null)]);
		// Portrait dimensions: a successful fit could never leave scale at
		// its default in a landscape fallback viewport.
		loadImageDimensionsMock.mockRejectedValue(new Error('no-decode'));
		analyzeMock.mockResolvedValue(fakeAnalysis());

		await useWallpaperStore.getState().autoFrameActiveImage();

		const s = useWallpaperStore.getState();
		const stored = s.backgroundImages.find(i => i.assetId === 'img-a')!;
		expect(stored.focusX).toBeCloseTo(0.125, 5);
		expect(stored.scale).toBe(1);
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

		await useWallpaperStore.getState().autoFrameActiveImage();

		const s = useWallpaperStore.getState();
		const a = s.backgroundImages.find(i => i.assetId === 'img-a')!;
		expect(a.focusX).toBeNull();
		expect(a.coverageFramingEdited).not.toBe(true);
	});
});

describe('autoFrameAllImages', () => {
	it('reframes every image and syncs the active globals', async () => {
		setup([
			createBackgroundImageItem('img-a', 'a.png', null),
			createBackgroundImageItem('img-b', 'b.png', null)
		]);
		analyzeMock.mockResolvedValue(fakeAnalysis());

		await useWallpaperStore.getState().autoFrameAllImages();

		const s = useWallpaperStore.getState();
		for (const image of s.backgroundImages) {
			expect(image.focusX).toBeCloseTo(0.125, 5);
			expect(image.focusY).toBeCloseTo(0.875, 5);
			// Bulk framing is machine-owned but focus-bearing: a viewport
			// resize must never erase the computed focus.
			expect(image.coverageFramingEdited).toBe(true);
		}
		expect(s.imageFocusX).toBeCloseTo(0.125, 5);
	});

	it('only reframes images inside the active setlist scope', async () => {
		setup([
			createBackgroundImageItem('img-a', 'a.png', null),
			createBackgroundImageItem('img-b', 'b.png', null)
		]);
		useWallpaperStore.setState({
			activeSetlistId: 'set-1',
			setlists: [
				{
					id: 'set-1',
					name: 'Scope',
					imageAssetIds: ['img-a']
				} as never
			]
		});
		analyzeMock.mockResolvedValue(fakeAnalysis());

		await useWallpaperStore.getState().autoFrameAllImages();

		const s = useWallpaperStore.getState();
		const a = s.backgroundImages.find(i => i.assetId === 'img-a')!;
		const b = s.backgroundImages.find(i => i.assetId === 'img-b')!;
		expect(a.focusX).toBeCloseTo(0.125, 5);
		expect(b.focusX).toBeNull();
		expect(b.coverageFramingEdited).not.toBe(true);
		expect(analyzeMock).toHaveBeenCalledTimes(1);
	});
});

describe('autoPlaceLogoForActiveImage', () => {
	it('centers the logo on a featureless image (center bias, follow-logo ring is skipped)', async () => {
		setup([createBackgroundImageItem('img-a', 'a.png', null)]);
		// Follow-Logo is effective by default: the ring is drawn wherever the
		// logo goes, so it is NOT an exclusion zone. With a flat image the
		// center bias decides: the logo lands dead center.
		analyzeMock.mockResolvedValue(flatAnalysis());

		await useWallpaperStore.getState().autoPlaceLogoForActiveImage();

		const s = useWallpaperStore.getState();
		expect(Math.abs(s.logoPositionX)).toBeLessThan(0.05);
		expect(Math.abs(s.logoPositionY)).toBeLessThan(0.05);
	});

	it('dodges a centered subject even with no exclusion region', async () => {
		setup([createBackgroundImageItem('img-a', 'a.png', null)]);
		analyzeMock.mockResolvedValue(centerBlobAnalysis(0.15));

		await useWallpaperStore.getState().autoPlaceLogoForActiveImage();

		const s = useWallpaperStore.getState();
		// The blob occupies the central cells; the search slides the box the
		// minimum distance off it (the sub-cell box clears the round subject
		// on the cheapest flank) instead of throwing it to a corner.
		expect(Math.abs(s.logoPositionX)).toBeGreaterThan(0.05);
		expect(Math.abs(s.logoPositionX)).toBeLessThan(0.3);
		expect(Math.abs(s.logoPositionY)).toBeGreaterThan(0.05);
		expect(Math.abs(s.logoPositionY)).toBeLessThan(0.3);
	});

	it('pushes the logo out of the spectrum figure when it is a solid disk', async () => {
		setup([createBackgroundImageItem('img-a', 'a.png', null)]);
		// Follow-Logo off + zero inner radius: the figure is a solid disk of
		// radius (innerRadius=0 + maxHeight=120)px over spectrumPositionX/Y=0 —
		// even on a flat image the logo must not overlap it.
		useWallpaperStore.setState({
			spectrumFollowLogo: false,
			spectrumInnerRadius: 0
		});
		analyzeMock.mockResolvedValue(flatAnalysis());

		await useWallpaperStore.getState().autoPlaceLogoForActiveImage();

		const s = useWallpaperStore.getState();
		// The box escapes the figure along its cheaper axis (in image space the
		// disk is taller than wide, so sideways) and stays near the middle of
		// the frame — off-center, but nowhere near a corner.
		expect(Math.hypot(s.logoPositionX, s.logoPositionY)).toBeGreaterThan(
			0.3
		);
		expect(Math.abs(s.logoPositionX)).toBeLessThan(0.75);
		expect(Math.abs(s.logoPositionY)).toBeLessThan(0.75);
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
