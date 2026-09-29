import { afterEach, describe, expect, it } from 'vitest';
import {
	beginCameraDrawOffset,
	clearCameraDrawOffsets,
	publishCameraDrawOffset,
	readCameraDrawOffset
} from './cameraDrawOffset';

type Call = { kind: 'save' | 'translate'; x?: number; y?: number };

function fakeCtx() {
	const calls: Call[] = [];
	const ctx = {
		save: () => calls.push({ kind: 'save' }),
		translate: (x: number, y: number) =>
			calls.push({ kind: 'translate', x, y })
	} as unknown as CanvasRenderingContext2D;
	return { ctx, calls };
}

/** A canvas whose backing store is `ratio` device pixels per CSS pixel. */
function fakeCanvas(cssWidth: number, ratio: number) {
	return {
		width: cssWidth * ratio,
		height: cssWidth * ratio,
		clientWidth: cssWidth
	} as unknown as HTMLCanvasElement;
}

afterEach(() => clearCameraDrawOffsets());

describe('camera draw offsets', () => {
	it('is empty until the camera publishes one', () => {
		expect(readCameraDrawOffset('spectrum')).toBeNull();
		const { ctx, calls } = fakeCtx();
		expect(
			beginCameraDrawOffset(ctx, 'spectrum', fakeCanvas(1000, 2))
		).toBe(false);
		// A layer with no motion must not pay for a save/restore.
		expect(calls).toHaveLength(0);
	});

	it('keeps one offset per layer', () => {
		publishCameraDrawOffset('spectrum', { tx: 10, ty: -4 });
		publishCameraDrawOffset('logo', { tx: -2, ty: 6 });
		expect(readCameraDrawOffset('spectrum')).toEqual({ tx: 10, ty: -4 });
		expect(readCameraDrawOffset('logo')).toEqual({ tx: -2, ty: 6 });
		expect(readCameraDrawOffset('lyrics')).toBeNull();
	});

	it('forgets a layer that stops moving', () => {
		publishCameraDrawOffset('spectrum', { tx: 10, ty: -4 });
		publishCameraDrawOffset('spectrum', null);
		expect(readCameraDrawOffset('spectrum')).toBeNull();
		// A dead-still layer is the same as no layer: no transform, no cost.
		publishCameraDrawOffset('spectrum', { tx: 0, ty: 0 });
		expect(readCameraDrawOffset('spectrum')).toBeNull();
	});

	it('translates the drawing in backing-store pixels', () => {
		publishCameraDrawOffset('spectrum', { tx: 12, ty: -30 });
		const { ctx, calls } = fakeCtx();
		expect(
			beginCameraDrawOffset(ctx, 'spectrum', fakeCanvas(1000, 2))
		).toBe(true);
		expect(calls).toEqual([
			{ kind: 'save' },
			{ kind: 'translate', x: 24, y: -60 }
		]);
	});

	it('falls back to CSS pixels when the canvas is not laid out', () => {
		publishCameraDrawOffset('spectrum', { tx: 12, ty: -30 });
		const { ctx, calls } = fakeCtx();
		const canvas = {
			width: 0,
			height: 0,
			clientWidth: 0
		} as unknown as HTMLCanvasElement;
		expect(beginCameraDrawOffset(ctx, 'spectrum', canvas)).toBe(true);
		expect(calls[1]).toEqual({ kind: 'translate', x: 12, y: -30 });
	});

	it('clears every layer at once when the camera stops', () => {
		publishCameraDrawOffset('spectrum', { tx: 1, ty: 1 });
		publishCameraDrawOffset('logo', { tx: 1, ty: 1 });
		clearCameraDrawOffsets();
		expect(readCameraDrawOffset('spectrum')).toBeNull();
		expect(readCameraDrawOffset('logo')).toBeNull();
	});
});
