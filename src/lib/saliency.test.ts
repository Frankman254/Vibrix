import { describe, expect, it } from 'vitest';
import {
	computeSaliency,
	lowestMassBox,
	summarizeSaliency,
	weightedCentroid
} from './saliency';

/** Solid color RGBA buffer. */
function solid(
	width: number,
	height: number,
	[r, g, b]: [number, number, number]
) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = r;
		data[i + 1] = g;
		data[i + 2] = b;
		data[i + 3] = 255;
	}
	return data;
}

/** Uniform background with a bright square blob; blob center in 0..1 space. */
function blob(
	width: number,
	height: number,
	cx: number,
	cy: number,
	size = 0.25
) {
	const data = solid(width, height, [10, 10, 10]);
	const x0 = Math.floor((cx - size / 2) * width);
	const x1 = Math.ceil((cx + size / 2) * width);
	const y0 = Math.floor((cy - size / 2) * height);
	const y1 = Math.ceil((cy + size / 2) * height);
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			const i = (y * width + x) * 4;
			data[i] = 250;
			data[i + 1] = 240;
			data[i + 2] = 20;
		}
	}
	return data;
}

const SIZE = 64;

describe('computeSaliency', () => {
	it('is deterministic: identical pixels produce identical grids', () => {
		const a = computeSaliency(blob(SIZE, SIZE, 0.25, 0.3), SIZE, SIZE);
		const b = computeSaliency(blob(SIZE, SIZE, 0.25, 0.3), SIZE, SIZE);
		expect(Array.from(a.values)).toEqual(Array.from(b.values));
	});

	it('puts the focus on a bright blob, not the canvas center', () => {
		const grid = computeSaliency(blob(SIZE, SIZE, 0.25, 0.3), SIZE, SIZE);
		const focus = weightedCentroid(grid);
		expect(Math.abs(focus.x - 0.25)).toBeLessThan(0.12);
		expect(Math.abs(focus.y - 0.3)).toBeLessThan(0.12);
	});

	it('keeps values normalized (mean ≈ 1, non-negative)', () => {
		const grid = computeSaliency(
			solid(SIZE, SIZE, [40, 90, 200]),
			SIZE,
			SIZE
		);
		let sum = 0;
		for (const v of grid.values) {
			expect(v).toBeGreaterThanOrEqual(0);
			sum += v;
		}
		expect(sum / grid.values.length).toBeCloseTo(1, 0);
	});
});
describe('lowestMassBox', () => {
	it('picks a corner away from the subject', () => {
		// Subject bottom-left: the empty box must not overlap it.
		const grid = computeSaliency(blob(SIZE, SIZE, 0.15, 0.85), SIZE, SIZE);
		const box = lowestMassBox(grid, { width: 0.3, height: 0.2 });
		const overlapsSubject = box.x < 0.35 && box.y + box.height > 0.65;
		expect(overlapsSubject).toBe(false);
	});

	it('breaks ties by the fixed corner order', () => {
		// Uniform image: every corner has equal mass → first in order wins.
		const grid = computeSaliency(
			solid(SIZE, SIZE, [128, 128, 128]),
			SIZE,
			SIZE
		);
		const box = lowestMassBox(grid, { width: 0.25, height: 0.25 });
		expect(box).toEqual({ x: 0.75, y: 0, width: 0.25, height: 0.25 });
	});

	it('clamps an oversized box request to the whole image', () => {
		const grid = computeSaliency(solid(SIZE, SIZE, [7, 7, 7]), SIZE, SIZE);
		const box = lowestMassBox(grid, { width: 3, height: 5 });
		expect(box).toEqual({ x: 0, y: 0, width: 1, height: 1 });
	});
});

describe('summarizeSaliency', () => {
	it('finds the subject and the empty corner under gradient lighting', () => {
		// Diagonal gradient (global lighting) + a round warm subject at
		// (0.7, 0.3). The gradient must not fool focus or logo placement.
		const data = new Uint8ClampedArray(SIZE * SIZE * 4);
		for (let y = 0; y < SIZE; y++) {
			for (let x = 0; x < SIZE; x++) {
				const i = (y * SIZE + x) * 4;
				data[i] = (x / SIZE) * 255;
				data[i + 1] = (y / SIZE) * 255;
				data[i + 2] = 128;
				data[i + 3] = 255;
			}
		}
		for (let y = 0; y < SIZE; y++) {
			for (let x = 0; x < SIZE; x++) {
				const dx = x / SIZE - 0.7;
				const dy = y / SIZE - 0.3;
				if (dx * dx + dy * dy < 0.02) {
					const i = (y * SIZE + x) * 4;
					data[i] = 250;
					data[i + 1] = 20;
					data[i + 2] = 200;
				}
			}
		}
		const summary = summarizeSaliency(computeSaliency(data, SIZE, SIZE));
		expect(Math.abs(summary.focus.x - 0.7)).toBeLessThan(0.15);
		expect(Math.abs(summary.focus.y - 0.3)).toBeLessThan(0.15);
		// The subject sits top-right → the empty corner is elsewhere.
		expect(summary.lowMassBox.x + summary.lowMassBox.width < 0.55).toBe(
			true
		);
	});
});
