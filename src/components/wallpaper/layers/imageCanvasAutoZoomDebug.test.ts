import { describe, expect, it } from 'vitest';
import { drawAutoZoomDebugOverlay } from './imageCanvasAutoZoomDebug';

type Call = { op: string; args: unknown[] };

function mockCtx(calls: Call[]) {
	const record =
		(op: string) =>
		(...args: unknown[]) => {
			calls.push({ op, args });
		};
	return {
		save: record('save'),
		restore: record('restore'),
		translate: record('translate'),
		rotate: record('rotate'),
		strokeRect: record('strokeRect'),
		setLineDash: record('setLineDash'),
		fillRect: record('fillRect'),
		fillText: record('fillText'),
		measureText: () => ({ width: 10 }),
		strokeStyle: '',
		fillStyle: '',
		lineWidth: 1,
		font: '',
		textBaseline: ''
	} as unknown as CanvasRenderingContext2D;
}

const baseSnapshot = {
	scale: 1,
	positionX: 0,
	positionY: 0,
	fitMode: 'cover' as const,
	focusX: null,
	focusY: null,
	coverageLockEnabled: true,
	mirror: false,
	mirrorFill: false,
	mirrorFillInvert: false,
	mirrorFillCount: 0,
	rotation: 0
};

describe('drawAutoZoomDebugOverlay ', () => {
	it('draws authored (dashed) and effective (solid) frames when clamp lifts scale', () => {
		const calls: Call[] = [];
		// 'contain' fit on a wide image in a square viewport at scale 1 leaves
		// gaps -> Keep-Covered must lift the drawn scale above authored.
		drawAutoZoomDebugOverlay({
			ctx: mockCtx(calls),
			viewportWidth: 800,
			viewportHeight: 800,
			imageWidth: 1600,
			imageHeight: 600,
			snapshot: { ...baseSnapshot, fitMode: 'contain' },
			reactiveScaleBoost: 0,
			parallaxX: 0,
			parallaxY: 0
		});
		const dashes = calls.filter(c => c.op === 'setLineDash');
		expect(dashes.length).toBeGreaterThanOrEqual(2);
		expect(dashes[0].args[0]).not.toEqual([]);
		expect(dashes[1].args[0]).toEqual([]);
		const text = calls
			.filter(c => c.op === 'fillText')
			.map(c => String(c.args[0]));
		expect(
			text.some(line => line.includes('scale-raised-for-coverage'))
		).toBe(true);
	});

	it('reports no clamp when authored already covers', () => {
		const calls: Call[] = [];
		drawAutoZoomDebugOverlay({
			ctx: mockCtx(calls),
			viewportWidth: 800,
			viewportHeight: 800,
			imageWidth: 800,
			imageHeight: 800,
			snapshot: { ...baseSnapshot, scale: 2 },
			reactiveScaleBoost: 0,
			parallaxX: 0,
			parallaxY: 0
		});
		const text = calls
			.filter(c => c.op === 'fillText')
			.map(c => String(c.args[0]));
		expect(text.some(line => line.includes('no clamp'))).toBe(true);
	});

	it('coverageLock off never lifts scale', () => {
		const calls: Call[] = [];
		drawAutoZoomDebugOverlay({
			ctx: mockCtx(calls),
			viewportWidth: 800,
			viewportHeight: 800,
			imageWidth: 1600,
			imageHeight: 600,
			snapshot: { ...baseSnapshot, coverageLockEnabled: false },
			reactiveScaleBoost: 0,
			parallaxX: 0,
			parallaxY: 0
		});
		const text = calls
			.filter(c => c.op === 'fillText')
			.map(c => String(c.args[0]));
		expect(text[0]).toMatch(/authored ([\d.]+)\s+min [\d.]+\s+drawn \1/);
	});
});
