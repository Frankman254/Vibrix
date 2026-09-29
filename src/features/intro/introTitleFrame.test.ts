import { describe, expect, it } from 'vitest';
import {
	INTRO_TITLE_FRAME_SHAPES,
	outlineLength,
	resolveTitleFrameShape,
	titleFrameBounds
} from './introTitleFrame';
import { resolveTitleFramePlan } from './introPlan';

const RECT = { x: 100, y: 200, width: 600, height: 120 };

describe('resolveTitleFrameShape', () => {
	it('gives every shape a usable outline', () => {
		for (const shape of INTRO_TITLE_FRAME_SHAPES) {
			const subpaths = resolveTitleFrameShape(shape, RECT);
			expect(subpaths.length).toBeGreaterThan(0);
			for (const subpath of subpaths) {
				expect(subpath.points.length).toBeGreaterThanOrEqual(3);
			}
			expect(outlineLength(subpaths)).toBeGreaterThan(RECT.width);
		}
	});

	it('never clips the title box, except where the shape is a rule', () => {
		// Every shape has to reach the title's own box, so the text sits inside
		// it — the underline is the one that lives at the bottom by design.
		for (const shape of INTRO_TITLE_FRAME_SHAPES) {
			if (shape === 'underline') continue;
			const bounds = titleFrameBounds(
				resolveTitleFrameShape(shape, RECT)
			);
			expect(bounds.x).toBeLessThanOrEqual(RECT.x + 0.001);
			expect(bounds.y).toBeLessThanOrEqual(RECT.y + 0.001);
			expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(
				RECT.x + RECT.width - 0.001
			);
			expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(
				RECT.y + RECT.height - 0.001
			);
		}
	});

	it('keeps the brackets open and everything else closed', () => {
		expect(
			resolveTitleFrameShape('brackets', RECT).every(
				subpath => !subpath.closed
			)
		).toBe(true);
		expect(
			resolveTitleFrameShape('hexagon', RECT).every(
				subpath => subpath.closed
			)
		).toBe(true);
	});
});

describe('resolveTitleFramePlan', () => {
	it('is fully mounted at 1 and gone at 0, whatever the animation', () => {
		for (const animation of [
			'draw',
			'expand',
			'grow',
			'fade',
			'sweep'
		] as const) {
			const full = resolveTitleFramePlan(animation, 1);
			expect(full).toEqual({
				alpha: 1,
				widthPct: 1,
				heightPct: 1,
				drawPct: 1,
				fillPct: 1
			});
			const none = resolveTitleFramePlan(animation, 0);
			// Nothing is painted at zero: either it is transparent or it has no
			// size, no outline and no fill.
			expect(
				none.alpha === 0 ||
					none.widthPct === 0 ||
					(none.drawPct === 0 && none.fillPct === 0)
			).toBe(true);
		}
	});

	it('animates the one thing its name promises', () => {
		expect(resolveTitleFramePlan('expand', 0.5).heightPct).toBe(1);
		expect(resolveTitleFramePlan('expand', 0.5).widthPct).toBeLessThan(1);
		expect(resolveTitleFramePlan('grow', 0.5).heightPct).toBeLessThan(1);
		expect(resolveTitleFramePlan('fade', 0.5).alpha).toBeCloseTo(0.5);
		expect(resolveTitleFramePlan('sweep', 0.5).fillPct).toBeLessThan(1);
		expect(resolveTitleFramePlan('sweep', 0.5).drawPct).toBe(1);
		expect(resolveTitleFramePlan('draw', 0.5).drawPct).toBeLessThan(1);
	});
});
