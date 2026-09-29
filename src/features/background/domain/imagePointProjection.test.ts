import { describe, expect, it } from 'vitest';
import {
	projectImagePoint,
	unprojectImagePoint,
	type ImagePointRect
} from './imagePointProjection';

/**
 * The face / mark annotations are drawn on the editor preview and placed by
 * clicking it, so the two mappings have to be each other's inverse through
 * every rect the preview can draw — rotated, mirrored, off-centre.
 */

const RECTS: Record<string, ImagePointRect> = {
	plain: {
		cx: 200,
		cy: 100,
		width: 400,
		height: 200,
		rotation: 0,
		mirror: false,
		mirrorY: false
	},
	mirrored: {
		cx: 200,
		cy: 100,
		width: 400,
		height: 200,
		rotation: 0,
		mirror: true,
		mirrorY: false
	},
	rotated: {
		cx: 320,
		cy: 180,
		width: 400,
		height: 200,
		rotation: 37,
		mirror: false,
		mirrorY: false
	},
	flipped: {
		cx: 320,
		cy: 180,
		width: 400,
		height: 200,
		rotation: -18,
		mirror: true,
		mirrorY: true
	}
};

describe('image point projection', () => {
	it('puts the centre of the picture at the centre of the rect', () => {
		for (const rect of Object.values(RECTS)) {
			const at = projectImagePoint(rect, 0.5, 0.5);
			expect(at.left).toBeCloseTo(rect.cx);
			expect(at.top).toBeCloseTo(rect.cy);
		}
	});

	it('round-trips every point through both mappings', () => {
		for (const [name, rect] of Object.entries(RECTS)) {
			for (const [x, y] of [
				[0, 0],
				[1, 1],
				[0.25, 0.75],
				[0.9, 0.1]
			]) {
				const at = projectImagePoint(rect, x, y);
				const back = unprojectImagePoint(rect, at.left, at.top);
				expect(back.x, `${name} x`).toBeCloseTo(x, 5);
				expect(back.y, `${name} y`).toBeCloseTo(y, 5);
			}
		}
	});

	it('mirrors horizontally, so the left of the picture draws on the right', () => {
		expect(projectImagePoint(RECTS.plain!, 0, 0.5).left).toBeCloseTo(0);
		expect(projectImagePoint(RECTS.mirrored!, 0, 0.5).left).toBeCloseTo(
			400
		);
	});

	it('clamps a click outside the picture to its edge', () => {
		const point = unprojectImagePoint(RECTS.plain!, -500, 900);
		expect(point.x).toBe(0);
		expect(point.y).toBe(1);
	});
});
