import { describe, expect, it } from 'vitest';
import { createBackgroundImageItem } from '@/features/background/backgroundImages';
import { createEmptySceneSlot } from '@/features/scenes/sceneSlot';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { WallpaperState } from '@/types/wallpaper';
import {
	buildSlideshowSegments,
	findSlideshowSegmentAt
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
