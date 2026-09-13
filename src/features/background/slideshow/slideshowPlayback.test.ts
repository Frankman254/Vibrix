import { describe, it, expect } from 'vitest';
import {
	resolveEffectivePlaybackImageId,
	resolveEffectiveImageForPlayback,
	resolveSlideshowImageIdAtTime,
	resolveSlideshowPool,
	PLAYBACK_ZERO_EPSILON,
	type SlideshowTimelineSettings
} from './slideshowPlayback';
import type { BackgroundImageItem, Setlist } from '@/types/wallpaper';

// ── Helpers ────────────────────────────────────────────────────────────────

function img(
	id: string,
	opts: Partial<
		Pick<BackgroundImageItem, 'enabled' | 'url' | 'playbackSwitchAt'>
	> = {}
): BackgroundImageItem {
	return {
		assetId: id,
		url: opts.url ?? `virtual://img/${id}`,
		enabled: opts.enabled ?? true,
		name: id,
		playbackSwitchAt: opts.playbackSwitchAt ?? null,
		sceneSlotId: null
		// The remaining fields are not needed by the resolver.
	} as unknown as BackgroundImageItem;
}

const NO_SETLISTS: Setlist[] = [];

function pool(ids: string[]): BackgroundImageItem[] {
	return ids.map(id => img(id));
}

// ── resolveSlideshowPool ───────────────────────────────────────────────────

describe('resolveSlideshowPool', () => {
	it('excludes images without a URL', () => {
		const images = [img('a'), img('b', { url: '' }), img('c')];
		const result = resolveSlideshowPool(images, NO_SETLISTS, null);
		expect(result.map(i => i.assetId)).toEqual(['a', 'c']);
	});

	it('excludes explicitly disabled images', () => {
		const images = [img('a'), img('b', { enabled: false }), img('c')];
		const result = resolveSlideshowPool(images, NO_SETLISTS, null);
		expect(result.map(i => i.assetId)).toEqual(['a', 'c']);
	});

	it('respects active setlist order', () => {
		const images = [img('a'), img('b'), img('c')];
		const setlist: Setlist = {
			id: 'sl1',
			name: 'My list',
			imageAssetIds: ['c', 'a'],
			trackIds: [],
			createdAt: 0
		};
		const result = resolveSlideshowPool(images, [setlist], 'sl1');
		expect(result.map(i => i.assetId)).toEqual(['c', 'a']);
	});
});

// ── resolveEffectivePlaybackImageId ───────────────────────────────────────

describe('resolveEffectivePlaybackImageId — auto OFF', () => {
	it('keeps persisted activeImageId when still in pool', () => {
		const p = pool(['a', 'b', 'c']);
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: 120,
			duration: 300,
			slideshowEnabled: false,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'c'
		});
		expect(res.resolvedId).toBe('c');
		expect(res.index).toBe(2);
	});

	it('falls back to pool[0] when persisted id is no longer in pool', () => {
		const p = pool(['a', 'b']);
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: false,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'gone'
		});
		expect(res.resolvedId).toBe('a');
		expect(res.index).toBe(0);
	});
});

describe('resolveEffectivePlaybackImageId — auto ON, currentTime ≈ 0', () => {
	it('returns image 1/N when currentTime is exactly 0', () => {
		const p = pool(['a', 'b', 'c']);
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'c'
		});
		expect(res.resolvedId).toBe('a');
		expect(res.index).toBe(0);
		expect(res.poolSize).toBe(3);
	});

	it('returns image 1/N when currentTime is within epsilon', () => {
		const p = pool(['a', 'b', 'c']);
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: PLAYBACK_ZERO_EPSILON,
			duration: 240,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'b'
		});
		expect(res.resolvedId).toBe('a');
	});

	it('returns image 1/N even when duration is 0 (audio not yet loaded)', () => {
		const p = pool(['a', 'b', 'c']);
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'c'
		});
		expect(res.resolvedId).toBe('a');
	});
});

describe('resolveEffectivePlaybackImageId — auto ON, checkpoint mode', () => {
	it('maps progress proportionally to pool index', () => {
		const p = pool(['a', 'b', 'c']);
		// 3 images in 300s → 100s each
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: 150, // 50% through → index 1
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'a'
		});
		expect(res.resolvedId).toBe('b');
		expect(res.index).toBe(1);
	});

	it('stays at last image near end of track', () => {
		const p = pool(['a', 'b', 'c']);
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: 299,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'a'
		});
		expect(res.resolvedId).toBe('c');
	});

	it('scrub back to 0 returns first image', () => {
		const p = pool(['a', 'b', 'c']);
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: 0,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'c'
		});
		expect(res.resolvedId).toBe('a');
	});

	it('falls back to first image when duration unknown and position > epsilon', () => {
		const p = pool(['a', 'b', 'c']);
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: 10,
			duration: 0,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'x-not-in-pool'
		});
		expect(res.resolvedId).toBe('a');
	});
});

describe('resolveEffectivePlaybackImageId — manual timestamps', () => {
	it('selects first image at time 0 even with timestamps', () => {
		const images = [
			img('a', { playbackSwitchAt: 0 }),
			img('b', { playbackSwitchAt: 60 }),
			img('c', { playbackSwitchAt: 120 })
		];
		const res = resolveEffectivePlaybackImageId({
			pool: images,
			currentTime: 0,
			duration: 180,
			slideshowEnabled: true,
			manualTimestampsEnabled: true,
			currentActiveImageId: 'c'
		});
		// currentTime=0 ≤ EPSILON → always first image regardless of timestamps
		expect(res.resolvedId).toBe('a');
	});

	it('picks correct image for mid-track time', () => {
		const images = [
			img('a', { playbackSwitchAt: 0 }),
			img('b', { playbackSwitchAt: 60 }),
			img('c', { playbackSwitchAt: 120 })
		];
		const res = resolveEffectivePlaybackImageId({
			pool: images,
			currentTime: 90,
			duration: 180,
			slideshowEnabled: true,
			manualTimestampsEnabled: true,
			currentActiveImageId: 'a'
		});
		expect(res.resolvedId).toBe('b');
	});

	it('scrub back past a checkpoint goes to prior image', () => {
		const images = [
			img('a', { playbackSwitchAt: 0 }),
			img('b', { playbackSwitchAt: 60 })
		];
		const res = resolveEffectivePlaybackImageId({
			pool: images,
			currentTime: 30,
			duration: 120,
			slideshowEnabled: true,
			manualTimestampsEnabled: true,
			currentActiveImageId: 'b'
		});
		expect(res.resolvedId).toBe('a');
	});
});

describe('resolveEffectivePlaybackImageId — edge cases', () => {
	it('returns null when pool is empty', () => {
		const res = resolveEffectivePlaybackImageId({
			pool: [],
			currentTime: 0,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'a'
		});
		expect(res.resolvedId).toBeNull();
		expect(res.index).toBe(-1);
		expect(res.poolSize).toBe(0);
	});

	it('handles single-image pool without errors', () => {
		const p = pool(['a']);
		const res = resolveEffectivePlaybackImageId({
			pool: p,
			currentTime: 150,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			currentActiveImageId: 'a'
		});
		expect(res.resolvedId).toBe('a');
		expect(res.index).toBe(0);
	});

	it('pool factor produces finite values for all progress points', () => {
		const p = pool(['a', 'b', 'c', 'd']);
		const duration = 240;
		for (let t = 0; t <= duration; t += 10) {
			const res = resolveEffectivePlaybackImageId({
				pool: p,
				currentTime: t,
				duration,
				slideshowEnabled: true,
				manualTimestampsEnabled: false,
				currentActiveImageId: null
			});
			expect(res.resolvedId).not.toBeNull();
			expect(res.index).toBeGreaterThanOrEqual(0);
			expect(res.index).toBeLessThan(p.length);
		}
	});
});

// ── resolveEffectiveImageForPlayback ──────────────────────────────────────────

describe('resolveEffectiveImageForPlayback — forceApply at position zero', () => {
	it('forceApply=true + target=1/N at currentTime=0 even when lastAutoTargetId is already first image', () => {
		// Covers: reload auto ON, persisted activeImageId was last image, no audio.
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'c'
		});
		expect(res.targetImageId).toBe('a');
		expect(res.targetIndex).toBe(0);
		expect(res.total).toBe(3);
		expect(res.forceApply).toBe(true);
		expect(res.shouldApply).toBe(true);
		expect(res.reason).toBe('position-zero');
	});

	it('forceApply=true at position-zero even when lastAutoTargetId already matches first', () => {
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'a'
		});
		expect(res.targetImageId).toBe('a');
		expect(res.forceApply).toBe(true);
		expect(res.shouldApply).toBe(true);
		expect(res.reason).toBe('position-zero');
	});

	it('position-zero applies even when duration is unknown', () => {
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: null
		});
		expect(res.targetImageId).toBe('a');
		expect(res.forceApply).toBe(true);
	});

	it('scrub back to 0 returns first image with forceApply', () => {
		// Covers: currentTime was at image C, user scrubs back to 0.
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'c'
		});
		expect(res.targetImageId).toBe('a');
		expect(res.forceApply).toBe(true);
		expect(res.reason).toBe('position-zero');
	});
});

describe('resolveEffectiveImageForPlayback — shouldApply / manual nav guard', () => {
	it('shouldApply=false when target matches lastAutoTargetId — manual selection preserved', () => {
		// Auto ON, user is in the first checkpoint (t=50s of 300s, target='a').
		// lastAutoTargetId='a' means we already committed 'a'. User manually moved
		// to 'b'. Next tick: target still 'a', should NOT apply (return false)
		// so the manual selection at 'b' is preserved.
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 50,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'a'
		});
		expect(res.targetImageId).toBe('a');
		expect(res.shouldApply).toBe(false);
		expect(res.forceApply).toBe(false);
		expect(res.reason).toBe('no-change');
	});

	it('shouldApply=true when checkpoint advances past manual selection', () => {
		// Same setup but now time has advanced into second checkpoint → target='b'.
		// lastAutoTargetId='a', so checkpoint changed → must apply.
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 150,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'a'
		});
		expect(res.targetImageId).toBe('b');
		expect(res.shouldApply).toBe(true);
		expect(res.forceApply).toBe(false);
		expect(res.reason).toBe('checkpoint-boundary');
	});

	it('first commit (lastAutoTargetId=null) always applies', () => {
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 50,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: null
		});
		expect(res.targetImageId).toBe('a');
		expect(res.shouldApply).toBe(true);
		expect(res.reason).toBe('checkpoint-boundary');
	});
});

describe('resolveEffectiveImageForPlayback — manual timestamps reason', () => {
	it('reason=timestamp-boundary when manualTimestampsEnabled and target changes', () => {
		const images = [
			img('a', { playbackSwitchAt: 0 }),
			img('b', { playbackSwitchAt: 60 })
		];
		const res = resolveEffectiveImageForPlayback({
			images,
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 90,
			duration: 180,
			slideshowEnabled: true,
			manualTimestampsEnabled: true,
			lastAutoTargetId: 'a'
		});
		expect(res.targetImageId).toBe('b');
		expect(res.shouldApply).toBe(true);
		expect(res.reason).toBe('timestamp-boundary');
	});
});

describe('resolveEffectiveImageForPlayback — setlist isolation', () => {
	it('target is 1/N of the active setlist, not global pool', () => {
		// Global pool: [a, b, c]. Setlist: [b, c]. At position 0, target = b (1/2).
		const images = pool(['a', 'b', 'c']);
		const setlist: Setlist = {
			id: 'sl1',
			name: 'Subset',
			imageAssetIds: ['b', 'c'],
			trackIds: [],
			createdAt: 0
		};
		const res = resolveEffectiveImageForPlayback({
			images,
			setlists: [setlist],
			activeSetlistId: 'sl1',
			currentTime: 0,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: null
		});
		expect(res.targetImageId).toBe('b');
		expect(res.total).toBe(2);
		expect(res.forceApply).toBe(true);
	});

	it('image outside active setlist is not targeted', () => {
		const images = pool(['a', 'b', 'c']);
		const setlist: Setlist = {
			id: 'sl1',
			name: 'Subset',
			imageAssetIds: ['b', 'c'],
			trackIds: [],
			createdAt: 0
		};
		const res = resolveEffectiveImageForPlayback({
			images,
			setlists: [setlist],
			activeSetlistId: 'sl1',
			currentTime: 0,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'a'
		});
		// 'a' is outside the setlist — target resets to 'b' (1/2 of setlist).
		expect(res.targetImageId).toBe('b');
		expect(res.targetImageId).not.toBe('a');
	});
});

describe('resolveEffectiveImageForPlayback — disabled / no url', () => {
	it('disabled image is excluded from pool and never targeted', () => {
		const images = [img('a', { enabled: false }), img('b'), img('c')];
		const res = resolveEffectiveImageForPlayback({
			images,
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: null
		});
		expect(res.targetImageId).not.toBe('a');
		expect(res.targetImageId).toBe('b');
		expect(res.total).toBe(2);
	});

	it('image without url is excluded from pool and never targeted', () => {
		const images = [img('a', { url: '' }), img('b'), img('c')];
		const res = resolveEffectiveImageForPlayback({
			images,
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: null
		});
		expect(res.targetImageId).not.toBe('a');
		expect(res.targetImageId).toBe('b');
	});
});

describe('resolveEffectiveImageForPlayback — auto OFF', () => {
	it('auto OFF: reason=auto-off, shouldApply reflects whether id changed', () => {
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: false,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'c'
		});
		expect(res.reason).toBe('auto-off');
		// auto OFF keeps lastAutoTargetId ('c') if in pool
		expect(res.targetImageId).toBe('c');
	});

	it('auto OFF: falls back to pool[0] when lastAutoTargetId not in pool', () => {
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: false,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'gone'
		});
		expect(res.targetImageId).toBe('a');
		expect(res.reason).toBe('auto-off');
	});
});

describe('resolveEffectiveImageForPlayback — empty pool', () => {
	it('returns empty-pool result with shouldApply=false', () => {
		const res = resolveEffectiveImageForPlayback({
			images: [],
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: null
		});
		expect(res.targetImageId).toBeNull();
		expect(res.total).toBe(0);
		expect(res.shouldApply).toBe(false);
		expect(res.forceApply).toBe(false);
		expect(res.reason).toBe('empty-pool');
	});
});

// ── Critical runtime integration case ────────────────────────────────────────
// These tests document the scenario that the SlideshowManager runtime MUST
// handle correctly: the resolver is called inside the polling tick with the
// lastCheckpointIdRef value as lastAutoTargetId.

describe('resolveEffectiveImageForPlayback — forceApply overrides no-change guard', () => {
	it('scrub-to-zero: ref===target but visual is elsewhere — forceApply forces apply', () => {
		// Scenario: user loaded, zero-position reset primed ref='a', then user
		// manually moved to 'c' (activeImageId='c', ref='a' unchanged).
		// User scrubs playhead back to 0.
		// The tick calls resolver with lastAutoTargetId='a'.
		// Without forceApply: changed = ('a' !== 'a') = false → shouldApply=false.
		// With forceApply: shouldApply=true (position-zero always resets to 1/N).
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 300,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'a'
		});
		expect(res.targetImageId).toBe('a');
		expect(res.forceApply).toBe(true);
		expect(res.shouldApply).toBe(true);
		// Confirm that without forceApply the guard would have blocked apply:
		// changed = 'a' !== 'a' = false, so only forceApply saves it.
		const changed = res.targetImageId !== 'a';
		expect(changed).toBe(false); // proves forceApply is the reason shouldApply=true
	});

	it('scrub-to-zero: same scenario with duration=0 (audio not loaded)', () => {
		// Same critical case but before the audio file has loaded duration.
		const res = resolveEffectiveImageForPlayback({
			images: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 0,
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: 'a'
		});
		expect(res.targetImageId).toBe('a');
		expect(res.forceApply).toBe(true);
		expect(res.shouldApply).toBe(true);
	});

	it('scrub-to-zero manual-timestamps: ref===target, forceApply overrides', () => {
		// Same scenario for manual timestamps mode.
		const images = [
			img('a', { playbackSwitchAt: 0 }),
			img('b', { playbackSwitchAt: 60 }),
			img('c', { playbackSwitchAt: 120 })
		];
		// lastAutoTargetId='a' (primed at startup), user moved to 'c' manually.
		// Scrub to 0 — forceApply must re-apply 'a'.
		const res = resolveEffectiveImageForPlayback({
			images,
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			currentTime: 0,
			duration: 180,
			slideshowEnabled: true,
			manualTimestampsEnabled: true,
			lastAutoTargetId: 'a'
		});
		// currentTime=0 ≤ epsilon → forceApply, target=first image regardless
		expect(res.targetImageId).toBe('a');
		expect(res.forceApply).toBe(true);
		expect(res.shouldApply).toBe(true);
	});
});

// ── MediaDock canNavigateImages semantics ─────────────────────────────────────
// These tests verify the pool-size logic that drives canNavigateImages in the
// view model.  Prev/Next are shown iff pool.length >= 2, regardless of
// slideshowEnabled.

describe('MediaDock canNavigateImages — pool-size semantics', () => {
	it('single enabled image → canNavigate=false', () => {
		const p = resolveSlideshowPool([img('a')], NO_SETLISTS, null);
		expect(p.length >= 2).toBe(false);
	});

	it('two enabled images → canNavigate=true', () => {
		const p = resolveSlideshowPool([img('a'), img('b')], NO_SETLISTS, null);
		expect(p.length >= 2).toBe(true);
	});

	it('two images but one disabled → canNavigate=false', () => {
		const images = [img('a'), img('b', { enabled: false })];
		const p = resolveSlideshowPool(images, NO_SETLISTS, null);
		expect(p.length >= 2).toBe(false);
	});

	it('two images but one has no url → canNavigate=false', () => {
		const images = [img('a'), img('b', { url: '' })];
		const p = resolveSlideshowPool(images, NO_SETLISTS, null);
		expect(p.length >= 2).toBe(false);
	});

	it('slideshowEnabled has no effect on navigation availability', () => {
		// With auto ON and ≥2 images, Prev/Next must be visible.
		// canNavigateImages is based on pool.length only — not slideshowEnabled.
		const images = [img('a'), img('b'), img('c')];
		const p = resolveSlideshowPool(images, NO_SETLISTS, null);
		// Same pool regardless of slideshowEnabled (that flag is not passed here)
		expect(p.length >= 2).toBe(true);
	});

	it('setlist with 2 members → canNavigate=true even if global pool is larger', () => {
		const images = [img('a'), img('b'), img('c')];
		const setlist: Setlist = {
			id: 'sl1',
			name: 'Pair',
			imageAssetIds: ['a', 'b'],
			trackIds: [],
			createdAt: 0
		};
		const p = resolveSlideshowPool(images, [setlist], 'sl1');
		expect(p.length).toBe(2);
		expect(p.length >= 2).toBe(true);
	});

	it('setlist with 1 member → canNavigate=false', () => {
		const images = [img('a'), img('b'), img('c')];
		const setlist: Setlist = {
			id: 'sl1',
			name: 'Solo',
			imageAssetIds: ['a'],
			trackIds: [],
			createdAt: 0
		};
		const p = resolveSlideshowPool(images, [setlist], 'sl1');
		expect(p.length >= 2).toBe(false);
	});
});

// ── resolveSlideshowImageIdAtTime ──────────────────────────────────────────

describe('resolveSlideshowImageIdAtTime', () => {
	function settings(
		overrides: Partial<SlideshowTimelineSettings> = {}
	): SlideshowTimelineSettings {
		return {
			backgroundImages: pool(['a', 'b', 'c']),
			setlists: NO_SETLISTS,
			activeSetlistId: null,
			activeImageId: 'b',
			slideshowEnabled: true,
			slideshowInterval: 10,
			slideshowAudioCheckpointsEnabled: false,
			slideshowManualTimestampsEnabled: false,
			slideshowTrackChangeSyncEnabled: false,
			...overrides
		};
	}

	it('keeps the active image when the slideshow is off', () => {
		const off = settings({ slideshowEnabled: false });
		expect(resolveSlideshowImageIdAtTime(off, 0, 60)).toBe('b');
		expect(resolveSlideshowImageIdAtTime(off, 45, 60)).toBe('b');
	});

	it('timer mode starts at image 1/N and advances every interval', () => {
		const timer = settings();
		expect(resolveSlideshowImageIdAtTime(timer, 0, 60)).toBe('a');
		expect(resolveSlideshowImageIdAtTime(timer, 9.99, 60)).toBe('a');
		expect(resolveSlideshowImageIdAtTime(timer, 10, 60)).toBe('b');
		expect(resolveSlideshowImageIdAtTime(timer, 25, 60)).toBe('c');
		expect(resolveSlideshowImageIdAtTime(timer, 30, 60)).toBe('a');
	});

	it('timer mode clamps the interval to one second', () => {
		const fast = settings({ slideshowInterval: 0 });
		expect(resolveSlideshowImageIdAtTime(fast, 1, 60)).toBe('b');
	});

	it('audio checkpoints split the track evenly', () => {
		const checkpoints = settings({
			slideshowAudioCheckpointsEnabled: true
		});
		expect(resolveSlideshowImageIdAtTime(checkpoints, 0, 90)).toBe('a');
		expect(resolveSlideshowImageIdAtTime(checkpoints, 31, 90)).toBe('b');
		expect(resolveSlideshowImageIdAtTime(checkpoints, 89, 90)).toBe('c');
	});

	it('manual timestamps win over checkpoints', () => {
		const manual = settings({
			backgroundImages: [
				img('a', { playbackSwitchAt: 0 }),
				img('b', { playbackSwitchAt: 50 }),
				img('c', { playbackSwitchAt: 5 })
			],
			slideshowAudioCheckpointsEnabled: true,
			slideshowManualTimestampsEnabled: true
		});
		expect(resolveSlideshowImageIdAtTime(manual, 4, 90)).toBe('a');
		expect(resolveSlideshowImageIdAtTime(manual, 20, 90)).toBe('c');
		expect(resolveSlideshowImageIdAtTime(manual, 60, 90)).toBe('b');
	});

	it('track-change sync keeps the active image on a single track', () => {
		const sync = settings({ slideshowTrackChangeSyncEnabled: true });
		expect(resolveSlideshowImageIdAtTime(sync, 45, 60)).toBe('b');
	});

	it('follows the active setlist, in its order', () => {
		const setlist = {
			id: 'set',
			imageAssetIds: ['c', 'a'],
			trackIds: []
		} as unknown as Setlist;
		const filtered = settings({
			setlists: [setlist],
			activeSetlistId: 'set'
		});
		expect(resolveSlideshowImageIdAtTime(filtered, 0, 60)).toBe('c');
		expect(resolveSlideshowImageIdAtTime(filtered, 10, 60)).toBe('a');
		expect(resolveSlideshowImageIdAtTime(filtered, 20, 60)).toBe('c');
	});
});
