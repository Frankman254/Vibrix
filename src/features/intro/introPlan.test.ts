import { describe, expect, it } from 'vitest';
import {
	INTRO_MOUNT_ORDER,
	createDefaultIntroSequence,
	pickIntroImages,
	resolveIntroBackdropAlpha,
	resolveIntroCards,
	resolveIntroFrame,
	resolveIntroTextFrame,
	resolveIntroWindow,
	resolveSlotMount,
	type IntroSequenceState
} from './introPlan';
import type { IntroSequenceSettings } from '@/types/wallpaper';

const VIEWPORT = { width: 1920, height: 1080 };

function settings(
	kind: 'intro' | 'outro',
	patch: Partial<IntroSequenceSettings> = {}
): IntroSequenceSettings {
	return { ...createDefaultIntroSequence(kind), enabled: true, ...patch };
}

function state(
	intro: Partial<IntroSequenceSettings>,
	outro: Partial<IntroSequenceSettings> = {}
): IntroSequenceState {
	return {
		introSequence: settings('intro', intro),
		outroSequence: { ...createDefaultIntroSequence('outro'), ...outro }
	};
}

describe('resolveIntroWindow', () => {
	it('gives the project the middle of the timeline', () => {
		const s = state({ durationSec: 4 }, { enabled: true, durationSec: 5 });
		expect(resolveIntroWindow(s, 0, 60)?.kind).toBe('intro');
		expect(resolveIntroWindow(s, 3.9, 60)?.progress).toBeCloseTo(0.975);
		expect(resolveIntroWindow(s, 30, 60)).toBeNull();
		expect(resolveIntroWindow(s, 56, 60)?.kind).toBe('outro');
		expect(resolveIntroWindow(s, 60, 60)?.progress).toBeCloseTo(1);
	});

	it('never lets the two windows overlap on a short track', () => {
		const s = state(
			{ durationSec: 20 },
			{ enabled: true, durationSec: 20 }
		);
		// Ten seconds of track: each window is capped at half of it.
		expect(resolveIntroWindow(s, 4.9, 10)?.kind).toBe('intro');
		expect(resolveIntroWindow(s, 5.1, 10)?.kind).toBe('outro');
		expect(resolveIntroWindow(s, 5, 10)?.kind).toBe('outro');
	});

	it('is null when both windows are off, or the track has no length', () => {
		expect(
			resolveIntroWindow(
				{
					introSequence: createDefaultIntroSequence('intro'),
					outroSequence: createDefaultIntroSequence('outro')
				},
				0,
				60
			)
		).toBeNull();
		expect(resolveIntroWindow(state({}), 0, 0)).toBeNull();
	});
});

describe('pickIntroImages', () => {
	const pool = ['a', 'b', 'c', 'd', 'e'].map(assetId => ({ assetId }));

	it('takes the head of the setlist in order', () => {
		expect(
			pickIntroImages(pool, settings('intro', { imageCount: 3 }))
		).toEqual(['a', 'b', 'c']);
	});

	it('closes on the tail of the setlist, reversed', () => {
		expect(
			pickIntroImages(
				pool,
				settings('outro', {
					imageCount: 3,
					order: 'setlist-reverse'
				})
			)
		).toEqual(['e', 'd', 'c']);
	});

	it('uses what there is when the setlist is shorter than asked', () => {
		expect(
			pickIntroImages(pool, settings('intro', { imageCount: 16 }))
		).toHaveLength(5);
		expect(pickIntroImages([], settings('intro'))).toEqual([]);
	});
});

describe('resolveSlotMount', () => {
	const s = settings('intro', { buildPct: 0.3, releasePct: 0.3 });

	it('holds everything mounted through the middle of the window', () => {
		for (const slot of INTRO_MOUNT_ORDER) {
			expect(resolveSlotMount(s, 0.5, slot)).toBe(1);
		}
	});

	it('mounts in order and dismounts in the reverse order', () => {
		// Early in the build the first slot leads the last one.
		expect(resolveSlotMount(s, 0.06, 'cards')).toBeGreaterThan(
			resolveSlotMount(s, 0.06, 'tagline')
		);
		// Early in the release the LAST slot is the one already going.
		expect(resolveSlotMount(s, 0.94, 'tagline')).toBeLessThan(
			resolveSlotMount(s, 0.94, 'cards')
		);
	});

	it('finishes mounting exactly when the build ends, and ends at zero', () => {
		for (const slot of INTRO_MOUNT_ORDER) {
			expect(resolveSlotMount(s, 0.3, slot)).toBe(1);
			expect(resolveSlotMount(s, 1, slot)).toBe(0);
			expect(resolveSlotMount(s, 0, slot)).toBe(0);
		}
	});
});

describe('resolveIntroBackdropAlpha', () => {
	it('owns the screen from the first frame of an intro and hands it back', () => {
		const s = settings('intro');
		expect(resolveIntroBackdropAlpha('intro', s, 0)).toBe(1);
		expect(resolveIntroBackdropAlpha('intro', s, 0.5)).toBe(1);
		expect(resolveIntroBackdropAlpha('intro', s, 1)).toBeCloseTo(0);
	});

	it('rises out of the project for an ending and then keeps the screen', () => {
		const s = settings('outro');
		expect(resolveIntroBackdropAlpha('outro', s, 0)).toBeCloseTo(0);
		expect(resolveIntroBackdropAlpha('outro', s, 0.5)).toBe(1);
		expect(resolveIntroBackdropAlpha('outro', s, 1)).toBe(1);
	});
});

describe('resolveIntroCards', () => {
	it('brings the whole mosaic in at once', () => {
		const cards = resolveIntroCards({
			montage: 'mosaic-grid',
			count: 9,
			viewport: VIEWPORT,
			mount: 0.4,
			progress: 0.12
		});
		expect(cards).toHaveLength(9);
		const alphas = new Set(cards.map(card => card.alpha.toFixed(6)));
		expect(alphas.size).toBe(1);
		expect(cards[0]?.alpha).toBeGreaterThan(0);
	});

	it('lands the burst from the centre outwards', () => {
		const cards = resolveIntroCards({
			montage: 'mosaic-burst',
			count: 9,
			viewport: VIEWPORT,
			mount: 0.35,
			progress: 0.1
		});
		// Index 4 is the middle cell of a 3×3 grid; index 0 is a corner.
		expect(cards[4]?.alpha).toBeGreaterThan(cards[0]?.alpha ?? 1);
	});

	it('keeps every montage inside the viewport and fully mounted at hold', () => {
		const modes = [
			'mosaic-grid',
			'mosaic-burst',
			'fade-stack',
			'film-strip',
			'shutter-wipe',
			'ken-burns',
			'glitch-cut'
		] as const;
		for (const montage of modes) {
			const cards = resolveIntroCards({
				montage,
				count: 6,
				viewport: VIEWPORT,
				mount: 1,
				progress: 0.5
			});
			expect(cards).toHaveLength(6);
			const visible = cards.filter(card => card.alpha > 0.01);
			expect(visible.length).toBeGreaterThan(0);
			for (const card of cards) {
				expect(card.width).toBeGreaterThan(0);
				expect(card.height).toBeGreaterThan(0);
				expect(Number.isFinite(card.x)).toBe(true);
				expect(Number.isFinite(card.y)).toBe(true);
			}
		}
	});

	it('shows nothing at all before anything has mounted', () => {
		const cards = resolveIntroCards({
			montage: 'mosaic-grid',
			count: 4,
			viewport: VIEWPORT,
			mount: 0,
			progress: 0
		});
		expect(cards.every(card => card.alpha === 0)).toBe(true);
	});
});

describe('resolveIntroTextFrame', () => {
	it('types the line out one letter at a time and takes it back the same way', () => {
		expect(resolveIntroTextFrame('typewriter', 0, 10).visibleChars).toBe(0);
		expect(resolveIntroTextFrame('typewriter', 0.5, 10).visibleChars).toBe(
			5
		);
		expect(resolveIntroTextFrame('typewriter', 1, 10).visibleChars).toBe(
			10
		);
		// Coming down the other side removes them again.
		expect(resolveIntroTextFrame('typewriter', 0.2, 10).visibleChars).toBe(
			2
		);
	});

	it('keeps the whole line for the reveals that move it as a block', () => {
		for (const reveal of ['fade', 'rise', 'pop', 'wipe'] as const) {
			expect(resolveIntroTextFrame(reveal, 0.5, 8).visibleChars).toBe(8);
		}
		expect(resolveIntroTextFrame('wipe', 0.5, 8).wipePct).toBeCloseTo(0.5);
		expect(resolveIntroTextFrame('fade', 0.25, 8).alpha).toBeCloseTo(0.25);
		expect(resolveIntroTextFrame('rise', 0, 8).offsetEm).toBeCloseTo(0.7);
	});
});

describe('resolveIntroFrame', () => {
	it('drops the pieces that are switched off or empty', () => {
		const frame = resolveIntroFrame({
			kind: 'intro',
			settings: settings('intro', {
				titleText: '',
				taglineText: '',
				logoSource: 'none',
				spectrumSource: 'none'
			}),
			progress: 0.5,
			viewport: VIEWPORT,
			cardCount: 4
		});
		expect(frame.title).toBeNull();
		expect(frame.tagline).toBeNull();
		expect(frame.titleFrame).toBeNull();
		expect(frame.logo).toBeNull();
		expect(frame.spectrum).toBeNull();
		expect(frame.cards).toHaveLength(4);
	});

	it('mounts the whole composition through the hold', () => {
		const frame = resolveIntroFrame({
			kind: 'intro',
			settings: settings('intro', {
				titleText: 'CLUBLioNx',
				taglineText: 'For you and your waifu',
				logoSource: 'vibrix',
				spectrumSource: 'slot'
			}),
			progress: 0.5,
			viewport: VIEWPORT,
			cardCount: 9
		});
		expect(frame.title?.frame.visibleChars).toBe('CLUBLioNx'.length);
		expect(frame.tagline?.frame.visibleChars).toBe(
			'For you and your waifu'.length
		);
		expect(frame.titleFrame?.widthPct).toBe(1);
		expect(frame.logo?.alpha).toBe(1);
		expect(frame.spectrum?.slotIndex).toBe(0);
		expect(frame.spectrum?.centered).toBe(true);
		expect(frame.spectrum?.mount).toBe(1);
		expect(frame.spectrum?.alpha).toBe(1);
		expect(frame.backdropAlpha).toBe(1);
	});

	it('leaves nothing on screen at the very end of an intro', () => {
		const frame = resolveIntroFrame({
			kind: 'intro',
			settings: settings('intro', {
				titleText: 'CLUBLioNx',
				taglineText: 'For you and your waifu',
				logoSource: 'vibrix',
				spectrumSource: 'slot'
			}),
			progress: 1,
			viewport: VIEWPORT,
			cardCount: 9
		});
		expect(frame.backdropAlpha).toBeCloseTo(0);
		expect(frame.title?.frame.alpha).toBe(0);
		expect(frame.tagline?.frame.visibleChars).toBe(0);
		expect(frame.logo).toBeNull();
		expect(frame.spectrum).toBeNull();
		expect(frame.cards.every(card => card.alpha === 0)).toBe(true);
	});
});
