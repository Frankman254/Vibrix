import { describe, expect, it } from 'vitest';
import {
	FOCUS_FALLBACK_FACE,
	FOCUS_GRID,
	measureFocusGrid,
	pickFocusWindow,
	resolveFocusFromGrid,
	resolveMarkX,
	skinLikeness,
	LOGO_EDGE_MARGIN,
	LOGO_FACE_GAP
} from './imageFocus';

/** A synthetic image: dark blue everywhere, one pale warm patch = a "face". */
function synthetic(
	width: number,
	height: number,
	patch: { x0: number; y0: number; x1: number; y1: number }
): Uint8ClampedArray {
	const pixels = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const p = (y * width + x) * 4;
			const inPatch =
				x >= patch.x0 * width &&
				x < patch.x1 * width &&
				y >= patch.y0 * height &&
				y < patch.y1 * height;
			if (inPatch) {
				// Anime skin plus a little texture, so the cell has detail too.
				const texture = (x + y) % 3 === 0 ? 24 : 0;
				pixels[p] = 246 - texture;
				pixels[p + 1] = 214 - texture;
				pixels[p + 2] = 190 - texture;
			} else {
				pixels[p] = 18;
				pixels[p + 1] = 22;
				pixels[p + 2] = 56;
			}
			pixels[p + 3] = 255;
		}
	}
	return pixels;
}

describe('skinLikeness', () => {
	it('recognises pale warm anime skin and rejects everything else', () => {
		expect(skinLikeness(246, 214, 190)).toBeGreaterThan(0.6);
		expect(skinLikeness(255, 226, 205)).toBeGreaterThan(0.5);
		// Night sky, grass, pure red and black are not skin.
		expect(skinLikeness(18, 22, 56)).toBe(0);
		expect(skinLikeness(40, 160, 60)).toBe(0);
		expect(skinLikeness(255, 0, 0)).toBe(0);
		expect(skinLikeness(0, 0, 0)).toBe(0);
	});
});

describe('pickFocusWindow', () => {
	it('lands on the run of hot cells, not on a single stray one', () => {
		const grid = 8;
		const score = new Float32Array(grid * grid);
		// A stray maximum in a corner...
		score[0] = 1;
		// ...and a solid 2×2 block on the right, which is what should win.
		for (const index of [
			2 * grid + 5,
			2 * grid + 6,
			3 * grid + 5,
			3 * grid + 6
		]) {
			score[index] = 0.8;
		}
		const point = pickFocusWindow(score, 2, grid);
		expect(point.x).toBeGreaterThan(0.6);
		expect(point.y).toBeGreaterThan(0.25);
		expect(point.y).toBeLessThan(0.6);
		expect(point.confidence).toBeCloseTo(0.8, 1);
	});
});

describe('resolveFocusFromGrid', () => {
	it('finds the face patch and keeps the logo away from it', () => {
		const pixels = synthetic(64, 64, {
			x0: 0.55,
			y0: 0.1,
			x1: 0.85,
			y1: 0.4
		});
		const estimate = resolveFocusFromGrid(measureFocusGrid(pixels, 64, 64));
		expect(estimate.face.x).toBeGreaterThan(0.5);
		expect(estimate.face.y).toBeLessThan(0.45);
		expect(estimate.face.confidence).toBeGreaterThan(0.2);
		// The mark goes somewhere else entirely.
		expect(
			Math.hypot(
				estimate.logo.x - estimate.face.x,
				estimate.logo.y - estimate.face.y
			)
		).toBeGreaterThan(0.3);
	});

	it('falls back to the upper middle when there is no face at all', () => {
		const flat = new Uint8ClampedArray(32 * 32 * 4);
		for (let i = 0; i < flat.length; i += 4) {
			flat[i] = 20;
			flat[i + 1] = 24;
			flat[i + 2] = 60;
			flat[i + 3] = 255;
		}
		const estimate = resolveFocusFromGrid(measureFocusGrid(flat, 32, 32));
		expect(estimate.face.x).toBeCloseTo(FOCUS_FALLBACK_FACE.x);
		expect(estimate.face.y).toBeCloseTo(FOCUS_FALLBACK_FACE.y);
		expect(estimate.face.confidence).toBeLessThan(0.06);
	});

	it('measures a grid of the documented size', () => {
		const grid = measureFocusGrid(
			synthetic(48, 48, { x0: 0, y0: 0, x1: 0.2, y1: 0.2 }),
			48,
			48
		);
		expect(grid.skin).toHaveLength(FOCUS_GRID * FOCUS_GRID);
		expect(grid.detail).toHaveLength(FOCUS_GRID * FOCUS_GRID);
	});
});

describe('resolveMarkX', () => {
	it('sits as close to the middle as the face allows, on the roomier side', () => {
		// Face well to the right: the left band is the roomy one, and the mark
		// lands in the middle of the frame, not against the left edge.
		expect(resolveMarkX(0.78)).toBeCloseTo(0.5, 5);
		// Face well to the left: same, from the other side.
		expect(resolveMarkX(0.22)).toBeCloseTo(0.5, 5);
	});

	it('gives way to the face when the face is near the middle', () => {
		// Face just right of centre: the left band is still the roomier one, so
		// the mark steps left of the face by exactly the gap.
		const x = resolveMarkX(0.56);
		expect(x).toBeCloseTo(0.56 - LOGO_FACE_GAP, 5);
		expect(Math.abs(x - 0.56)).toBeGreaterThanOrEqual(LOGO_FACE_GAP - 1e-9);
		// Face just LEFT of centre: the right band wins and the mark mirrors.
		expect(resolveMarkX(0.44)).toBeCloseTo(0.44 + LOGO_FACE_GAP, 5);
	});

	it('prefers the LEFT side when both sides have the same room', () => {
		expect(resolveMarkX(0.5)).toBeCloseTo(0.5 - LOGO_FACE_GAP, 5);
	});

	it('never leaves the safe margin, even for a face that fills the frame', () => {
		for (const faceX of [0, 0.05, 0.5, 0.95, 1]) {
			const x = resolveMarkX(faceX);
			expect(x).toBeGreaterThanOrEqual(LOGO_EDGE_MARGIN);
			expect(x).toBeLessThanOrEqual(1 - LOGO_EDGE_MARGIN);
		}
	});
});
