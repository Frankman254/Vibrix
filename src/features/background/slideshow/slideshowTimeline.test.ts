import { describe, it, expect } from 'vitest';
import { createBackgroundImageItem } from '../backgroundImages';
import { buildTimelineClips } from './slideshowTimeline';
import {
	resolveSlideshowPool,
	resolveEffectivePlaybackImageId
} from './slideshowPlayback';

const images = () =>
	Array.from({ length: 4 }, (_, i) => ({
		...createBackgroundImageItem(`img-${i}`, `virtual://${i}`, null),
		playbackSwitchAt: [null, 80, 20, 55][i]!
	}));

describe('timeline playback parity', () => {
	it('automatic mode ignores saved timestamps and disabled images', () => {
		const source = images();
		source[1].enabled = false;
		const pool = resolveSlideshowPool(source, [], null);
		const clips = buildTimelineClips(pool, 90, false);
		expect(
			clips.map(clip => [clip.start, clip.end, clip.isManual])
		).toEqual([
			[0, 30, false],
			[30, 60, false],
			[60, 90, false]
		]);
		for (const clip of clips) {
			expect(
				resolveEffectivePlaybackImageId({
					pool,
					duration: 90,
					currentTime: clip.start + 1,
					slideshowEnabled: true,
					manualTimestampsEnabled: false,
					currentActiveImageId: null
				}).resolvedId
			).toBe(clip.assetId);
		}
	});
	it('shows out-of-order marks chronologically instead of clamping them to fake times', () => {
		const pool = images();
		const clips = buildTimelineClips(pool, 100, true);
		expect(
			clips.map(clip => [clip.poolIndex, clip.start, clip.end])
		).toEqual([
			[0, 0, 20],
			[2, 20, 55],
			[3, 55, 80],
			[1, 80, 100]
		]);
		for (const clip of clips) {
			expect(
				resolveEffectivePlaybackImageId({
					pool,
					duration: 100,
					currentTime: clip.start + 1,
					slideshowEnabled: true,
					manualTimestampsEnabled: true,
					currentActiveImageId: null
				}).resolvedId
			).toBe(clip.assetId);
		}
	});
	it('a clean manual schedule starts with the same equal shares as automatic', () => {
		const pool = images().map(image => ({
			...image,
			playbackSwitchAt: null
		}));
		expect(buildTimelineClips(pool, 3588, true)).toEqual(
			buildTimelineClips(pool, 3588, false)
		);
	});
	it('honors setlist order and has no timeline without a finite audio duration', () => {
		const pool = resolveSlideshowPool(
			images(),
			[
				{
					id: 's',
					name: 's',
					imageAssetIds: ['img-3', 'img-0'],
					trackIds: [],
					createdAt: 0
				}
			],
			's'
		);
		expect(
			buildTimelineClips(pool, 60, false).map(clip => clip.assetId)
		).toEqual(['img-3', 'img-0']);
		expect(buildTimelineClips(pool, Infinity, false)).toEqual([]);
		expect(buildTimelineClips(pool, 0, true)).toEqual([]);
	});
});
