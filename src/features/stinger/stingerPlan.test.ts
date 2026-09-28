import { describe, expect, it } from 'vitest';
import {
	createDefaultStinger,
	pickStingerImages,
	resolveStingerBackdropAlpha,
	resolveStingerCards,
	resolveStingerWindow,
	type StingerState
} from './stingerPlan';

const VIEWPORT = { width: 1920, height: 1080 };

function state(
	intro: Partial<ReturnType<typeof createDefaultStinger>> = {},
	outro: Partial<ReturnType<typeof createDefaultStinger>> = {}
): StingerState {
	return {
		introStinger: { ...createDefaultStinger('intro'), ...intro },
		outroStinger: { ...createDefaultStinger('outro'), ...outro }
	};
}

const pool = Array.from({ length: 8 }, (_, i) => ({ assetId: `img-${i + 1}` }));

describe('stinger windows', () => {
	it('is off until something is enabled', () => {
		expect(resolveStingerWindow(state(), 0, 180)).toBeNull();
		expect(resolveStingerWindow(state(), 179, 180)).toBeNull();
	});

	it('owns the head of the timeline for the intro', () => {
		const s = state({ enabled: true, durationSec: 4 });
		expect(resolveStingerWindow(s, 0, 180)).toEqual({
			kind: 'intro',
			progress: 0
		});
		expect(resolveStingerWindow(s, 2, 180)?.progress).toBeCloseTo(0.5);
		// The first frame past the window is the project, not the intro.
		expect(resolveStingerWindow(s, 4, 180)).toBeNull();
	});

	it('owns the tail for the ending', () => {
		const s = state({}, { enabled: true, durationSec: 5 });
		expect(resolveStingerWindow(s, 174, 180)).toBeNull();
		expect(resolveStingerWindow(s, 175, 180)).toEqual({
			kind: 'outro',
			progress: 0
		});
		expect(resolveStingerWindow(s, 180, 180)?.progress).toBe(1);
	});

	it('never lets the two windows overlap on a short track', () => {
		const s = state(
			{ enabled: true, durationSec: 20 },
			{ enabled: true, durationSec: 20 }
		);
		// 10 s of video: each window is capped at half and they meet exactly.
		expect(resolveStingerWindow(s, 4.9, 10)?.kind).toBe('intro');
		expect(resolveStingerWindow(s, 5, 10)?.kind).toBe('outro');
		expect(resolveStingerWindow(s, 5, 10)?.progress).toBe(0);
	});

	it('has no window without a duration to place it in', () => {
		const s = state({ enabled: true });
		expect(resolveStingerWindow(s, 0, 0)).toBeNull();
	});
});

describe('stinger image picking', () => {
	it('takes the front of the setlist, in setlist order', () => {
		expect(
			pickStingerImages(pool, {
				...createDefaultStinger('intro'),
				imageCount: 3,
				order: 'setlist'
			})
		).toEqual(['img-1', 'img-2', 'img-3']);
	});

	it('closes on the end of the setlist, backwards', () => {
		expect(
			pickStingerImages(pool, {
				...createDefaultStinger('outro'),
				imageCount: 3,
				order: 'setlist-reverse'
			})
		).toEqual(['img-8', 'img-7', 'img-6']);
	});

	it('asks for no more than the setlist has', () => {
		const picked = pickStingerImages(pool.slice(0, 2), {
			...createDefaultStinger('intro'),
			imageCount: 12
		});
		expect(picked).toEqual(['img-1', 'img-2']);
	});

	it('is empty with an empty pool', () => {
		expect(pickStingerImages([], createDefaultStinger('intro'))).toEqual(
			[]
		);
	});
});

describe('stinger backdrop', () => {
	it('opens the intro opaque and hands the project back at the end', () => {
		expect(resolveStingerBackdropAlpha('intro', 0)).toBe(1);
		expect(resolveStingerBackdropAlpha('intro', 0.5)).toBe(1);
		expect(resolveStingerBackdropAlpha('intro', 1)).toBe(0);
	});

	it('fades the ending up out of the project and keeps it', () => {
		expect(resolveStingerBackdropAlpha('outro', 0)).toBe(0);
		expect(resolveStingerBackdropAlpha('outro', 1)).toBe(1);
		expect(resolveStingerBackdropAlpha('outro', 0.5)).toBe(1);
	});
});

describe('stinger layouts', () => {
	it('fade-stack shows one card at a time and ends on the last', () => {
		const first = resolveStingerCards(
			'intro',
			'fade-stack',
			0.02,
			4,
			VIEWPORT
		);
		expect(first[0].alpha).toBeGreaterThan(0);
		expect(first[3].alpha).toBe(0);
		const end = resolveStingerCards('intro', 'fade-stack', 1, 4, VIEWPORT);
		expect(end[3].alpha).toBe(1);
		expect(end[0].alpha).toBe(0);
		// Full-bleed cards, centred.
		expect(end[3].width).toBe(VIEWPORT.width);
		expect(end[3].x).toBe(VIEWPORT.width / 2);
	});

	it('grid-reveal lays a grid that covers the viewport', () => {
		const cards = resolveStingerCards(
			'intro',
			'grid-reveal',
			1,
			4,
			VIEWPORT
		);
		expect(cards).toHaveLength(4);
		expect(cards[0].width).toBe(VIEWPORT.width / 2);
		expect(cards[0].height).toBe(VIEWPORT.height / 2);
		// Every cell is filled by the end of the window.
		for (const card of cards) expect(card.alpha).toBe(1);
	});

	it('slide-strip crosses the screen from right to left', () => {
		const start = resolveStingerCards(
			'intro',
			'slide-strip',
			0,
			3,
			VIEWPORT
		);
		const end = resolveStingerCards('intro', 'slide-strip', 1, 3, VIEWPORT);
		expect(start[0].x).toBeGreaterThan(VIEWPORT.width);
		expect(end[0].x).toBeLessThan(0);
		// 16:9 cards, so a frame is never distorted.
		expect(end[0].height / end[0].width).toBeCloseTo(9 / 16);
	});

	it('the ending runs the same layout backwards', () => {
		const introEnd = resolveStingerCards(
			'intro',
			'grid-reveal',
			1,
			4,
			VIEWPORT
		);
		const outroStart = resolveStingerCards(
			'outro',
			'grid-reveal',
			0,
			4,
			VIEWPORT
		);
		expect(outroStart.map(c => c.alpha)).toEqual(
			introEnd.map(c => c.alpha)
		);
	});
});
