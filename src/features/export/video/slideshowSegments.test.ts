import { describe, expect, it, vi } from 'vitest';

// Real `resolveImageTransform` maths, fake image loading: jsdom has no decoder,
// and every assertion here is about geometry, not about file IO.
vi.mock('@/features/background', async importOriginal => ({
	...(await importOriginal<typeof import('@/features/background')>()),
	loadImageDimensions: vi.fn(async () => ({ width: 1600, height: 900 }))
}));
vi.mock('@/lib/backgroundPalette', async importOriginal => ({
	...(await importOriginal<typeof import('@/lib/backgroundPalette')>()),
	getBackgroundPalette: vi.fn(async () => ({
		dominant: '#ffffff',
		accent: '#ffffff',
		muted: '#ffffff',
		colors: ['#ffffff']
	}))
}));
import { createBackgroundImageItem } from '@/features/background/backgroundImages';
import { createEmptySceneSlot } from '@/features/scenes/sceneSlot';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { WallpaperState } from '@/types/wallpaper';
import {
	buildSlideshowSegments,
	findSlideshowSegmentAt,
	prepareSlideshowSegments
} from './slideshowSegments';

function projectState(overrides: Partial<WallpaperState> = {}): WallpaperState {
	const images = ['a', 'b', 'c'].map(id =>
		createBackgroundImageItem(id, `virtual://img/${id}`)
	);
	return {
		...(DEFAULT_STATE as WallpaperState),
		backgroundImages: images,
		activeImageId: 'a',
		imageUrl: 'virtual://img/a',
		slideshowEnabled: true,
		slideshowInterval: 10,
		slideshowAudioCheckpointsEnabled: false,
		slideshowManualTimestampsEnabled: false,
		slideshowTrackChangeSyncEnabled: false,
		...overrides
	};
}

describe('buildSlideshowSegments', () => {
	it('keeps the captured state untouched without a slideshow', () => {
		const state = projectState({ slideshowEnabled: false });
		const segments = buildSlideshowSegments(state, 30_000, 30);
		expect(segments).toHaveLength(1);
		expect(segments[0].state).toBe(state);
	});

	it('opens one segment per image switch, on the frame it happens', () => {
		const state = projectState();
		const segments = buildSlideshowSegments(state, 35_000, 30);
		expect(segments.map(s => [s.startMs, s.imageId])).toEqual([
			[0, 'a'],
			[10_000, 'b'],
			[20_000, 'c'],
			[30_000, 'a']
		]);
		expect(segments[0].state).toBe(state);
		expect(segments[1].state.imageUrl).toBe('virtual://img/b');
		expect(segments[1].state.activeImageId).toBe('b');
		expect(segments[3].state.imageUrl).toBe('virtual://img/a');
	});

	it('selects image 1/N on frame 0 when another image is active', () => {
		const state = projectState({
			activeImageId: 'b',
			imageUrl: 'virtual://img/b'
		});
		const [first] = buildSlideshowSegments(state, 5_000, 30);
		expect(first.imageId).toBe('a');
		expect(first.state.imageUrl).toBe('virtual://img/a');
	});

	it("applies each image's scene, as selecting it in the editor does", () => {
		const scene = {
			...createEmptySceneSlot('Dark'),
			spectrumSlotId: 'off' as const
		};
		const base = projectState({
			spectrumEnabled: true,
			sceneSlots: [scene]
		});
		const state = {
			...base,
			backgroundImages: base.backgroundImages.map(image =>
				image.assetId === 'b'
					? { ...image, sceneSlotId: scene.id }
					: image
			)
		};
		const segments = buildSlideshowSegments(state, 15_000, 30);
		expect(segments[0].state.spectrumEnabled).toBe(true);
		expect(segments[1].state.spectrumEnabled).toBe(false);
		expect(segments[1].state.activeSceneSlotId).toBe(scene.id);
		// The scene fade starts with the segment, on the video clock.
		expect(segments[1].state.visualTransition).toMatchObject({
			startedAtMs: segments[1].startMs
		});
		expect(segments[1].state.visualTransition?.subsystems).toContain(
			'spectrum'
		);
	});
});

describe('findSlideshowSegmentAt', () => {
	it('returns the segment that covers a time', () => {
		const segments = buildSlideshowSegments(projectState(), 35_000, 30);
		expect(findSlideshowSegmentAt(segments, 0).imageId).toBe('a');
		expect(findSlideshowSegmentAt(segments, 9_999).imageId).toBe('a');
		expect(findSlideshowSegmentAt(segments, 10_000).imageId).toBe('b');
		expect(findSlideshowSegmentAt(segments, 34_000).imageId).toBe('a');
	});
});

describe('prepareSlideshowSegments', () => {
	/**
	 * The regression this guards: the logo (and the spectrum that follows it)
	 * landing on the subject's face for a whole video while the editor shows it
	 * correctly placed. The selection patch restores `logoPositionX/Y` from the
	 * image's logo slot, so the export has to re-apply the mark exactly like
	 * `setActiveImageId` does — otherwise every segment wears slot 1's position.
	 */
	it("re-applies each image's mark, as selecting it in the editor does", async () => {
		const images = ['a', 'b'].map(id =>
			createBackgroundImageItem(id, `virtual://img/${id}`)
		);
		// Marks on opposite sides, so a missing re-apply is unmistakable.
		// "The mark follows the picture" is PER IMAGE, so every picture that
		// should follow has to say so — selecting one syncs the flat key from
		// the image, exactly as the editor does.
		images[0].logoFocusX = 0.2;
		images[0].logoFocusY = 0.5;
		images[0].logoFollowsFocus = true;
		images[1].logoFocusX = 0.8;
		images[1].logoFocusY = 0.5;
		images[1].logoFollowsFocus = true;
		const state = projectState({
			backgroundImages: images,
			logoFollowImageFocus: true,
			// What the editor had on screen for image 'a'.
			logoPositionX: -0.6,
			logoPositionY: 0
		});
		const segments = buildSlideshowSegments(state, 15_000, 30);
		const prepared = await prepareSlideshowSegments(segments, state);
		expect(prepared).toHaveLength(2);
		// The captured segment is the editor's live state: left untouched.
		expect(prepared[0].state.logoPositionX).toBe(-0.6);
		// Image 'b' marks the RIGHT half, so the logo has to move there.
		expect(prepared[1].state.imageUrl).toBe('virtual://img/b');
		expect(prepared[1].state.logoPositionX).toBeGreaterThan(0);
	});

	it('leaves the logo alone when the mark does not follow the picture', async () => {
		const images = ['a', 'b'].map(id =>
			createBackgroundImageItem(id, `virtual://img/${id}`)
		);
		images[1].logoFocusX = 0.8;
		images[1].logoFocusY = 0.5;
		images[1].logoFollowsFocus = false;
		const state = projectState({
			backgroundImages: images,
			logoFollowImageFocus: false,
			logoPositionX: -0.6,
			logoPositionY: 0
		});
		const prepared = await prepareSlideshowSegments(
			buildSlideshowSegments(state, 15_000, 30),
			state
		);
		expect(prepared[1].state.logoPositionX).toBe(-0.6);
	});

	it('leaves the logo alone for an image that has no mark', async () => {
		const images = ['a', 'b'].map(id =>
			createBackgroundImageItem(id, `virtual://img/${id}`)
		);
		images[1].logoFollowsFocus = true;
		const state = projectState({
			backgroundImages: images,
			logoFollowImageFocus: true,
			logoPositionX: -0.6,
			logoPositionY: 0
		});
		const prepared = await prepareSlideshowSegments(
			buildSlideshowSegments(state, 15_000, 30),
			state
		);
		expect(prepared[1].state.logoPositionX).toBe(-0.6);
	});
});
