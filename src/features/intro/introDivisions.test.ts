import { describe, expect, it } from 'vitest';
import {
	INTRO_DIVISION_PATTERNS,
	polygonContains,
	resolveIntroDivisions,
	type IntroDivisionCell
} from './introDivisions';

const VIEWPORT = { width: 1920, height: 1080 };

/** The absolute outline of a cell, for containment tests. */
function absolute(cell: IntroDivisionCell) {
	return cell.polygon.map(point => ({
		x: point.x + cell.x,
		y: point.y + cell.y
	}));
}

describe('resolveIntroDivisions', () => {
	it('covers the whole viewport with every pattern', () => {
		// The black the user kept seeing was a hole in the tiling, so this is the
		// test that matters: a grid of sample points, every one of them inside
		// at least one cell.
		for (const pattern of INTRO_DIVISION_PATTERNS) {
			for (const count of [1, 2, 5, 9, 12]) {
				const cells = resolveIntroDivisions({
					pattern,
					count,
					viewport: VIEWPORT,
					angleDeg: 18
				}).map(absolute);
				let uncovered = 0;
				for (let sy = 1; sy < 20; sy += 1) {
					for (let sx = 1; sx < 20; sx += 1) {
						// Offset off the round fractions: a sample landing exactly
						// on the shared edge of two cells is a property of the
						// even-odd rule, not a hole in the tiling.
						const point = {
							x: ((sx + 0.37) / 20) * VIEWPORT.width,
							y: ((sy + 0.19) / 20) * VIEWPORT.height
						};
						if (!cells.some(cell => polygonContains(cell, point))) {
							uncovered += 1;
						}
					}
				}
				expect(
					uncovered,
					`${pattern} with ${count} images left ${uncovered} points uncovered`
				).toBe(0);
			}
		}
	});

	it('returns exactly as many cells as there are images', () => {
		for (const pattern of INTRO_DIVISION_PATTERNS) {
			for (const count of [1, 3, 7, 16]) {
				expect(
					resolveIntroDivisions({
						pattern,
						count,
						viewport: VIEWPORT
					}),
					`${pattern} with ${count}`
				).toHaveLength(count);
			}
		}
	});

	it('gives every cell a usable box and at least a triangle', () => {
		for (const pattern of INTRO_DIVISION_PATTERNS) {
			for (const cell of resolveIntroDivisions({
				pattern,
				count: 6,
				viewport: VIEWPORT,
				angleDeg: -40
			})) {
				expect(cell.polygon.length).toBeGreaterThanOrEqual(3);
				expect(cell.width).toBeGreaterThan(0);
				expect(cell.height).toBeGreaterThan(0);
				expect(Number.isFinite(cell.x)).toBe(true);
				expect(Number.isFinite(cell.y)).toBe(true);
			}
		}
	});

	it('is deterministic, irregular included', () => {
		const once = resolveIntroDivisions({
			pattern: 'irregular',
			count: 9,
			viewport: VIEWPORT
		});
		const twice = resolveIntroDivisions({
			pattern: 'irregular',
			count: 9,
			viewport: VIEWPORT
		});
		expect(twice).toEqual(once);
	});

	it('actually tilts the patterns that take an angle', () => {
		const flat = resolveIntroDivisions({
			pattern: 'columns',
			count: 4,
			viewport: VIEWPORT,
			angleDeg: 0
		});
		const tilted = resolveIntroDivisions({
			pattern: 'columns',
			count: 4,
			viewport: VIEWPORT,
			angleDeg: 30
		});
		expect(tilted[1]?.polygon).not.toEqual(flat[1]?.polygon);
		// A straight column sits upright; a tilted one leans, so its bounding
		// box is wider than the column itself.
		expect(tilted[1]?.width).toBeGreaterThan(flat[1]?.width ?? 0);
	});
});
