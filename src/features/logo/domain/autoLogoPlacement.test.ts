import { describe, it, expect } from 'vitest';
import {
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
