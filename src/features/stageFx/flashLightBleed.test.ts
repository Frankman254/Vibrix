import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '@/store/defaultState';
import { beginCameraDrawSpace, endCameraDrawSpace } from './cameraDrawOffset';
import type { FlashLightShape } from './stageFxConfig';
import type { FlashShapeCache } from './flashLightDraw';
import { createFlashLightRuntime, drawFlashLight } from './render';

type Rect = { x: number; y: number; w: number; h: number };

/** Records what the flash paints, with just enough canvas to run it. */
function recordingCtx() {
	const fills: Rect[] = [];
	const images: unknown[] = [];
	const gradient = { addColorStop() {} };
	const ctx = {
		canvas: { width: 0, height: 0 },
		globalAlpha: 1,
		globalCompositeOperation: 'source-over',
		shadowBlur: 0,
		fillStyle: '' as unknown,
		translate() {},
		scale() {},
		save() {},
		restore() {},
		createLinearGradient: () => gradient,
		createRadialGradient: () => gradient,
		fillRect(x: number, y: number, w: number, h: number) {
			fills.push({ x, y, w, h });
		},
		drawImage(image: unknown) {
			images.push(image);
		}
	};
	return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, images };
}

const SHAPES: FlashLightShape[] = [
	'full-screen',
	'edge-flash',
	'horizontal-blast',
	'vertical-blast',
	'circular-burst',
	'vignette-invert'
];

const W = 960;
const H = 540;
const BLEED = 120;

function covers(fills: Rect[], x: number, y: number): boolean {
	return fills.some(
		r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
	);
}

/**
 * A cache entry that already matches the call, so the cached branch can be
 * exercised without a DOM to build the frame-sized buffer in.
 */
function primedCache(shape: FlashLightShape): FlashShapeCache {
	return {
		canvas: { width: W, height: H } as unknown as HTMLCanvasElement,
		shape,
		width: W,
		height: H,
		color: '#ffffff',
		softness: 0.5,
		pixelScale: 1
	};
}

function paint(shape: FlashLightShape, bleed: number, offset = 0) {
	const recorder = recordingCtx();
	const runtime = createFlashLightRuntime();
	runtime.drive = 1;
	runtime.shapeCache = primedCache(shape);
	if (offset) {
		beginCameraDrawSpace(recorder.ctx, {
			tx: offset,
			ty: -offset,
			scale: 1,
			width: W,
			height: H
		});
	}
	drawFlashLight(
		recorder.ctx,
		W,
		H,
		{ ...DEFAULT_STATE, flashLightShape: shape, flashLightSoftness: 0.5 },
		runtime,
		'#ffffff',
		1,
		bleed
	);
	if (offset) endCameraDrawSpace(recorder.ctx);
	return recorder;
}

describe('drawFlashLight bleed', () => {
	it.each(SHAPES)('paints past every edge for %s', shape => {
		const { fills } = paint(shape, BLEED);
		// Just outside each edge: what Camera Motion brings into the frame.
		const outside: Array<[number, number]> = [
			[-BLEED / 2, H / 2],
			[W + BLEED / 2, H / 2],
			[W / 2, -BLEED / 2],
			[W / 2, H + BLEED / 2]
		];
		for (const [x, y] of outside) {
			expect(covers(fills, x, y), `${shape} at ${x},${y}`).toBe(true);
		}
	});

	it.each(SHAPES)('still covers the frame itself for %s', shape => {
		const { fills } = paint(shape, BLEED);
		for (const [x, y] of [
			[1, 1],
			[W - 1, H - 1]
		]) {
			expect(covers(fills, x, y)).toBe(true);
		}
	});

	it('never blits the frame-sized cache while it has a bleed to paint', () => {
		const moved = paint('circular-burst', BLEED);
		expect(moved.images).toHaveLength(0);
		expect(moved.fills.length).toBeGreaterThan(0);
	});

	it('keeps the cached blit when nothing moves the flash', () => {
		const still = paint('circular-burst', 0);
		expect(still.images).toHaveLength(1);
		expect(still.fills).toHaveLength(0);
	});
	it('extends for shake-only or a pose beyond the configured range', () => {
		for (const bleed of [0, 10]) {
			const { fills, images } = paint('full-screen', bleed, 60);
			expect(images).toHaveLength(0);
			expect(covers(fills, -60, H + 60)).toBe(true);
		}
	});
});
