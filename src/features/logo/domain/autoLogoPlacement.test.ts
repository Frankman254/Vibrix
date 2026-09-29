import { describe, it, expect } from 'vitest';
import {
	imagePointToLogoPosition,
	lowMassBoxToLogoPosition,
	logoBoxSizeForViewport
} from './autoLogoPlacement';

describe('lowMassBoxToLogoPosition', () => {
	it('maps a box center through the renderer placement math (y+ = up)', () => {
		// Top-right quadrant box: logo sits right and up.
		expect(
			lowMassBoxToLogoPosition({ x: 0.5, y: 0, width: 0.5, height: 0.5 })
		).toEqual({ x: 0.5, y: 0.5 });
		// Top-left corner box: logo sits left and up.
		expect(
			lowMassBoxToLogoPosition({ x: 0, y: 0, width: 0.2, height: 0.2 })
		).toEqual({ x: -0.8, y: 0.8 });
		// Bottom-center box: logo sits centered horizontally, down.
		expect(
			lowMassBoxToLogoPosition({
				x: 0.4,
				y: 0.8,
				width: 0.2,
				height: 0.2
			})
		).toEqual({ x: 0, y: -0.8 });
	});

	it('clamps to the logo slider range so an edge box never exits the screen', () => {
		expect(
			lowMassBoxToLogoPosition({ x: 0, y: 0, width: 0.01, height: 0.01 })
		).toEqual({ x: -0.9, y: 0.9 });
		expect(
			lowMassBoxToLogoPosition({
				x: 0.99,
				y: 0.99,
				width: 0.01,
				height: 0.01
			})
		).toEqual({ x: 0.9, y: -0.9 });
	});
});

describe('logoBoxSizeForViewport', () => {
	it('normalizes the base size by the viewport', () => {
		expect(logoBoxSizeForViewport(80, 1920, 1080)).toEqual({
			width: 80 / 1920,
			height: 80 / 1080
		});
	});

	it('stays inside 0..1 for degenerate viewports', () => {
		const box = logoBoxSizeForViewport(100, 0, 0);
		expect(box.width).toBeGreaterThan(0);
		expect(box.width).toBeLessThanOrEqual(1);
		expect(box.height).toBeGreaterThan(0);
		expect(box.height).toBeLessThanOrEqual(1);
	});
});

describe('imagePointToLogoPosition', () => {
	const viewport = { viewportWidth: 1000, viewportHeight: 500 };
	const upright = { rotation: 0, mirror: false };

	it('maps the middle of a full-screen image to the middle of the screen', () => {
		expect(
			imagePointToLogoPosition({
				point: { x: 0.5, y: 0.5 },
				imageRect: {
					cx: 500,
					cy: 250,
					width: 1000,
					height: 500,
					...upright
				},
				...viewport
			})
		).toEqual({ x: 0, y: 0 });
	});

	it('follows the image when the image is zoomed and panned', () => {
		// A 2× image whose centre sits left of the screen centre: the same
		// image point now lands somewhere else entirely.
		const placed = imagePointToLogoPosition({
			point: { x: 0.75, y: 0.25 },
			imageRect: {
				cx: 300,
				cy: 250,
				width: 2000,
				height: 1000,
				...upright
			},
			...viewport
		});
		expect(placed.x).toBeCloseTo(0.6, 5);
		// Clamped to the logo's own position range, which stops short of 1.
		expect(placed.y).toBeCloseTo(0.9, 5);
	});

	it('clamps a focus point that falls off the screen', () => {
		const placed = imagePointToLogoPosition({
			point: { x: 1, y: 1 },
			imageRect: {
				cx: 500,
				cy: 250,
				width: 6000,
				height: 3000,
				...upright
			},
			...viewport
		});
		expect(placed.x).toBeLessThanOrEqual(0.9);
		expect(placed.y).toBeGreaterThanOrEqual(-0.9);
	});

	// The bug: a mirrored picture draws image space backwards, so a mark on the
	// left of the PICTURE is on the right of the SCREEN. Mapping the rect as if
	// it were upright put the logo on the subject instead of beside it.
	it('mirrors the mark with the picture', () => {
		const rect = {
			cx: 500,
			cy: 250,
			width: 1000,
			height: 500,
			rotation: 0
		};
		const mirrored = imagePointToLogoPosition({
			point: { x: 0.3, y: 0.42 },
			imageRect: { ...rect, mirror: true },
			...viewport
		});
		const opposite = imagePointToLogoPosition({
			point: { x: 0.7, y: 0.42 },
			imageRect: { ...rect, mirror: false },
			...viewport
		});
		expect(mirrored).toEqual(opposite);
		// And it really moved: the unmirrored mark is on the other side.
		expect(mirrored.x).toBeCloseTo(0.4, 5);
	});

	it('flips on Y for a mirror-fill clone and follows a rotation', () => {
		const rect = { cx: 500, cy: 250, width: 1000, height: 500 };
		expect(
			imagePointToLogoPosition({
				point: { x: 0.5, y: 0.25 },
				imageRect: {
					...rect,
					rotation: 0,
					mirror: false,
					mirrorY: true
				},
				...viewport
			}).y
		).toBeCloseTo(
			-imagePointToLogoPosition({
				point: { x: 0.5, y: 0.25 },
				imageRect: { ...rect, rotation: 0, mirror: false },
				...viewport
			}).y,
			5
		);
		// A quarter turn sends a point that was to the right downwards.
		const turned = imagePointToLogoPosition({
			point: { x: 1, y: 0.5 },
			imageRect: { ...rect, rotation: 90, mirror: false },
			...viewport
		});
		expect(turned.x).toBeCloseTo(0, 5);
		expect(turned.y).toBeCloseTo(-0.9, 5);
	});
});
