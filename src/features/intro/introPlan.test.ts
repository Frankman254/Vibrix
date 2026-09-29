import { describe, expect, it } from 'vitest';
import {
	INTRO_LOGO_OFFSET_RANGE,
	INTRO_LOGO_STRETCH_RANGE,
	INTRO_MOUNT_ORDER,
	createDefaultIntroSequence,
	pickIntroImages,
	resolveIntroBackdropAlpha,
	resolveIntroCards,
	resolveIntroFrame,
	resolveIntroTextFrame,
	resolveIntroWindow,
	resolveIntroPhases,
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

	it('draws the hand-picked list in the picked order', () => {
		expect(
			pickIntroImages(
				pool,
				settings('intro', {
					imageSourceMode: 'manual',
					imageAssetIds: ['d', 'a', 'c'],
					// Neither of these applies to a hand-picked list.
					imageCount: 2,
					order: 'setlist-reverse'
				})
			)
		).toEqual(['d', 'a', 'c']);
	});

	it('drops hand-picked ids that are no longer in the collection', () => {
		expect(
			pickIntroImages(
				pool,
				settings('intro', {
					imageSourceMode: 'manual',
					imageAssetIds: ['a', 'gone', 'b']
				})
			)
		).toEqual(['a', 'b']);
	});
});

describe('resolveSlotMount', () => {
	// 3 s of the 10 s window each way, so the build ends exactly at 0.3.
	const s = settings('intro', {
		durationSec: 10,
		buildSec: 3,
		releaseSec: 3
	});

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

describe('resolveIntroPhases', () => {
	it('gives the hold whatever the two ends leave over', () => {
		const phases = resolveIntroPhases(
			settings('intro', { durationSec: 6, buildSec: 2, releaseSec: 1 })
		);
		expect(phases.holdSec).toBeCloseTo(3);
		expect(phases.buildPct).toBeCloseTo(2 / 6);
	});

	it('shrinks both ends proportionally instead of clipping one', () => {
		const phases = resolveIntroPhases(
			settings('intro', { durationSec: 4, buildSec: 6, releaseSec: 2 })
		);
		expect(phases.buildSec).toBeCloseTo(3);
		expect(phases.releaseSec).toBeCloseTo(1);
		expect(phases.holdSec).toBeCloseTo(0);
	});

	it('honours the window duration it is handed over the configured one', () => {
		const s = settings('intro', {
			durationSec: 10,
			buildSec: 2,
			releaseSec: 2
		});
		expect(resolveIntroPhases(s, 4).buildPct).toBeCloseTo(0.5);
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

describe('resolveIntroCards — divisions', () => {
	it("gives the tiled montages the pattern's polygons", () => {
		for (const montage of [
			'mosaic-grid',
			'mosaic-burst',
			'shutter-wipe'
		] as const) {
			const cards = resolveIntroCards({
				montage,
				pattern: 'triangles',
				count: 6,
				viewport: VIEWPORT,
				mount: 1,
				progress: 0.5
			});
			expect(cards).toHaveLength(6);
			for (const card of cards) {
				expect(card.polygon?.length ?? 0).toBeGreaterThanOrEqual(3);
			}
		}
	});

	it('never shrinks a tiled card below its cell', () => {
		// A card smaller than its polygon uncovers the backdrop: that is the
		// black the user reported.
		for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
			for (const mount of [0, 0.4, 1]) {
				const cards = resolveIntroCards({
					montage: 'mosaic-burst',
					pattern: 'grid',
					count: 9,
					viewport: VIEWPORT,
					mount,
					progress
				});
				for (const card of cards) {
					expect(card.scale).toBeGreaterThanOrEqual(1);
				}
			}
		}
	});

	it('wipes the shutter inside its cell instead of moving it', () => {
		const cards = resolveIntroCards({
			montage: 'shutter-wipe',
			pattern: 'columns',
			count: 4,
			viewport: VIEWPORT,
			mount: 0.5,
			progress: 0.5
		});
		// Every panel sits where the tiling put it, and what animates is the
		// share of the cell that is uncovered.
		expect(cards.every(card => card.y === VIEWPORT.height / 2)).toBe(true);
		expect(cards.some(card => (card.reveal?.pct ?? 1) < 1)).toBe(true);
		const full = resolveIntroCards({
			montage: 'shutter-wipe',
			pattern: 'columns',
			count: 4,
			viewport: VIEWPORT,
			mount: 1,
			progress: 0.5
		});
		expect(full.every(card => card.reveal?.pct === 1)).toBe(true);
	});

	it('never lets a variant shift the image past what its scale bought', () => {
		// The invariant that keeps a pan from uncovering the backdrop inside a
		// tiled cell: the shift can never exceed the margin the scale gained.
		for (const move of [
			'still',
			'zoom-in',
			'zoom-out',
			'pan',
			'pulse'
		] as const) {
			for (const montage of [
				'mosaic-grid',
				'mosaic-burst',
				'shutter-wipe'
			] as const) {
				for (const progress of [0, 0.3, 0.5, 0.8, 1]) {
					const cards = resolveIntroCards({
						montage,
						pattern: 'grid',
						move,
						count: 6,
						viewport: VIEWPORT,
						mount: 1,
						progress
					});
					for (const card of cards) {
						expect(card.scale).toBeGreaterThanOrEqual(1);
						const marginX = ((card.scale - 1) * card.width) / 2;
						const marginY = ((card.scale - 1) * card.height) / 2;
						expect(Math.abs(card.shiftX ?? 0)).toBeLessThanOrEqual(
							marginX + 0.0001
						);
						expect(Math.abs(card.shiftY ?? 0)).toBeLessThanOrEqual(
							marginY + 0.0001
						);
					}
				}
			}
		}
	});

	it('only reorders the cells when the arrival changes', () => {
		// An arrival order is a permutation: the geometry stays put.
		const boxes = (arrival: 'auto' | 'random' | 'edges-in') =>
			resolveIntroCards({
				montage: 'mosaic-burst',
				pattern: 'grid',
				arrival,
				count: 9,
				viewport: VIEWPORT,
				mount: 0.5,
				progress: 0.5
			})
				.slice()
				.sort((a, b) => a.index - b.index)
				.map(card => `${card.index}:${card.x}:${card.y}`);
		expect(boxes('random')).toEqual(boxes('auto'));
		expect(boxes('edges-in')).toEqual(boxes('auto'));
		// …but the order they arrive in does change.
		const alphas = (arrival: 'auto' | 'edges-in') =>
			resolveIntroCards({
				montage: 'mosaic-burst',
				pattern: 'grid',
				arrival,
				count: 9,
				viewport: VIEWPORT,
				mount: 0.5,
				progress: 0.5
			})
				.slice()
				.sort((a, b) => a.index - b.index)
				.map(card => card.alpha);
		expect(alphas('edges-in')).not.toEqual(alphas('auto'));
	});

	it('leaves the non-tiled montages without a polygon', () => {
		for (const montage of [
			'fade-stack',
			'film-strip',
			'ken-burns',
			'glitch-cut'
		] as const) {
			const cards = resolveIntroCards({
				montage,
				pattern: 'triangles',
				count: 5,
				viewport: VIEWPORT,
				mount: 1,
				progress: 0.4
			});
			expect(cards.every(card => card.polygon === undefined)).toBe(true);
		}
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

	it('makes the film strip a BIG carousel, not a contact sheet', () => {
		const cards = resolveIntroCards({
			montage: 'film-strip',
			count: 9,
			viewport: VIEWPORT,
			mount: 1,
			progress: 0.5
		});
		expect(cards).toHaveLength(9);
		// Each card fills most of the height, so barely two are on screen.
		expect(cards[0]?.height).toBeGreaterThan(VIEWPORT.height * 0.5);
		expect(cards[0]?.width).toBeGreaterThan(VIEWPORT.width * 0.4);
		// And the strip travels: the middle card is centred at the halfway
		// point and somewhere else earlier.
		const later = resolveIntroCards({
			montage: 'film-strip',
			count: 9,
			viewport: VIEWPORT,
			mount: 1,
			progress: 0.9
		});
		expect(later[4]?.x).not.toBeCloseTo(cards[4]?.x ?? 0);
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
			// Sequential montages only return the image whose turn it is (and
			// the one handing over to it), so the count is a ceiling.
			expect(cards.length).toBeGreaterThan(0);
			expect(cards.length).toBeLessThanOrEqual(6);
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

	it('spreads a sequential montage over the whole window, not the build', () => {
		// The complaint this fixes: nine images cycling inside the mount
		// envelope lasted a sixth of a second each. Each image must now own its
		// own slice of the window, so which one is on screen depends on where in
		// the window we are.
		const at = (progress: number) =>
			resolveIntroCards({
				montage: 'fade-stack',
				count: 6,
				viewport: VIEWPORT,
				mount: 1,
				progress
			})
				.filter(card => card.alpha > 0.5)
				.map(card => card.index);
		expect(at(0.08)).toEqual([0]);
		expect(at(0.55)).toEqual([3]);
		expect(at(0.95)).toEqual([5]);
	});

	it('covers the whole screen with the film strip at every moment', () => {
		for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
			const cards = resolveIntroCards({
				montage: 'film-strip',
				count: 5,
				viewport: VIEWPORT,
				mount: 1,
				progress
			});
			// No black: the strip is screen-tall and its cards touch, and the
			// run of them always spans the viewport.
			for (const card of cards) {
				expect(card.height).toBe(VIEWPORT.height);
			}
			const left = Math.min(...cards.map(c => c.x - c.width / 2));
			const right = Math.max(...cards.map(c => c.x + c.width / 2));
			expect(left).toBeLessThanOrEqual(0.001);
			expect(right).toBeGreaterThanOrEqual(VIEWPORT.width - 0.001);
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
				spectrumPrimaryEnabled: false,
				spectrumSecondEnabled: false
			}),
			progress: 0.5,
			viewport: VIEWPORT,
			cardCount: 4
		});
		expect(frame.title).toBeNull();
		expect(frame.tagline).toBeNull();
		expect(frame.titleFrame).toBeNull();
		expect(frame.logo).toBeNull();
		expect(frame.spectrums).toEqual([]);
		expect(frame.cards).toHaveLength(4);
	});

	it('mounts the whole composition through the hold', () => {
		const frame = resolveIntroFrame({
			kind: 'intro',
			settings: settings('intro', {
				titleText: 'CLUBLioNx',
				taglineText: 'For you and your waifu',
				logoSource: 'vibrix',
				spectrumPrimaryEnabled: true,
				spectrumPrimarySlotId: 'slot-a',
				spectrumSecondEnabled: true,
				spectrumSecondSlotId: 'slot-b'
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
		// Both figures at once, each from its own bank, in bank order.
		expect(frame.spectrums.map(plan => plan.bank)).toEqual([
			'primary',
			'second'
		]);
		expect(frame.spectrums.map(plan => plan.slotId)).toEqual([
			'slot-a',
			'slot-b'
		]);
		expect(frame.spectrums[0]?.centered).toBe(true);
		expect(frame.spectrums[0]?.mount).toBe(1);
		expect(frame.spectrums[0]?.alpha).toBe(1);
		expect(frame.backdropAlpha).toBe(1);
	});

	it('leaves nothing on screen at the very end of an intro', () => {
		const frame = resolveIntroFrame({
			kind: 'intro',
			settings: settings('intro', {
				titleText: 'CLUBLioNx',
				taglineText: 'For you and your waifu',
				logoSource: 'vibrix',
				spectrumPrimaryEnabled: true,
				spectrumPrimarySlotId: 'slot-a'
			}),
			progress: 1,
			viewport: VIEWPORT,
			cardCount: 9
		});
		expect(frame.backdropAlpha).toBeCloseTo(0);
		expect(frame.title?.frame.alpha).toBe(0);
		expect(frame.tagline?.frame.visibleChars).toBe(0);
		expect(frame.logo).toBeNull();
		expect(frame.spectrums).toEqual([]);
		expect(frame.cards.every(card => card.alpha === 0)).toBe(true);
	});
});

describe('the intro logo', () => {
	function logoPlan(patch: Partial<IntroSequenceSettings>) {
		return resolveIntroFrame({
			kind: 'intro',
			settings: settings('intro', { logoSource: 'vibrix', ...patch }),
			progress: 0.5,
			viewport: VIEWPORT,
			cardCount: 4
		}).logo;
	}

	it('carries the placement and the offsets to the painter', () => {
		const plan = logoPlan({
			logoPlacement: 'free',
			logoOffsetX: -0.3,
			logoOffsetY: 0.25,
			logoStretch: 1.4
		});
		expect(plan?.placement).toBe('free');
		expect(plan?.offsetX).toBeCloseTo(-0.3);
		expect(plan?.offsetY).toBeCloseTo(0.25);
		expect(plan?.stretch).toBeCloseTo(1.4);
	});

	it('clamps offsets and stretch to their ranges', () => {
		const plan = logoPlan({
			logoOffsetX: -4,
			logoOffsetY: 9,
			logoStretch: 40
		});
		expect(plan?.offsetX).toBe(INTRO_LOGO_OFFSET_RANGE.min);
		expect(plan?.offsetY).toBe(INTRO_LOGO_OFFSET_RANGE.max);
		expect(plan?.stretch).toBe(INTRO_LOGO_STRETCH_RANGE.max);
	});

	it('scales the mount alpha by the configured opacity', () => {
		// Fully mounted at mid-window: the only thing left to cut the alpha is
		// the user's own opacity.
		expect(logoPlan({ logoOpacity: 0.4 })?.alpha).toBeCloseTo(0.4);
		expect(logoPlan({})?.alpha).toBe(1);
	});
});
