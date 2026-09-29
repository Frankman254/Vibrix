import { afterEach, describe, expect, it } from 'vitest';
import {
	beginCameraDrawOffset,
	beginCameraDrawSpace,
	clearCameraDrawOffsets,
	endCameraDrawSpace,
	mirrorCameraDrawSpace,
	publishCameraDrawOffset,
	readCameraDrawOffset,
	readCameraDrawSpace,
	unapplyCameraDrawSpace
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

/** A ctx that records the transform calls a tile helper makes on it. */
function fakeSpaceCtx() {
	const calls: string[] = [];
	const ctx = {
		save: () => calls.push('save'),
		restore: () => calls.push('restore'),
		translate: (x: number, y: number) => calls.push(`translate ${x} ${y}`),
		scale: (x: number, y: number) => calls.push(`scale ${x} ${y}`)
	} as unknown as CanvasRenderingContext2D;
	return { ctx, calls };
}

const FRAME = { width: 800, height: 600 };

describe('camera draw space on a context', () => {
	it('remembers the space it pushed and forgets it on end', () => {
		const { ctx } = fakeSpaceCtx();
		expect(readCameraDrawSpace(ctx)).toBeNull();
		expect(
			beginCameraDrawSpace(ctx, { tx: 5, ty: -7, scale: 1, ...FRAME })
		).toBe(true);
		expect(readCameraDrawSpace(ctx)).toEqual({
			tx: 5,
			ty: -7,
			scale: 1,
			...FRAME
		});
		endCameraDrawSpace(ctx);
		expect(readCameraDrawSpace(ctx)).toBeNull();
	});

	it('costs nothing when the camera is not moving that layer', () => {
		const { ctx, calls } = fakeSpaceCtx();
		expect(
			beginCameraDrawSpace(ctx, { tx: 0, ty: 0, scale: 1, ...FRAME })
		).toBe(false);
		expect(calls).toEqual([]);
		expect(readCameraDrawSpace(ctx)).toBeNull();
	});

	it('gives a scratch canvas the same space as its output', () => {
		const output = fakeSpaceCtx();
		const scratch = fakeSpaceCtx();
		beginCameraDrawSpace(output.ctx, {
			tx: 12,
			ty: -30,
			scale: 1,
			...FRAME
		});
		expect(mirrorCameraDrawSpace(scratch.ctx, output.ctx)).toBe(true);
		// The figure is painted MOVED inside the tile, same as the output.
		expect(scratch.calls).toEqual(['save', 'translate 12 -30']);
	});

	it('mirrors nothing when the output carries no camera space', () => {
		const output = fakeSpaceCtx();
		const scratch = fakeSpaceCtx();
		expect(mirrorCameraDrawSpace(scratch.ctx, output.ctx)).toBe(false);
		expect(scratch.calls).toEqual([]);
	});

	it('cancels the translation so a tile blits in frame space', () => {
		const { ctx, calls } = fakeSpaceCtx();
		beginCameraDrawSpace(ctx, { tx: 12, ty: -30, scale: 1, ...FRAME });
		calls.length = 0;
		expect(unapplyCameraDrawSpace(ctx)).toBe(true);
		// Net transform back to identity: the tile's border stays on the frame's.
		expect(calls).toEqual(['translate -12 30']);
	});

	it('cancels the export zoom about the frame centre too', () => {
		const { ctx, calls } = fakeSpaceCtx();
		beginCameraDrawSpace(ctx, { tx: 10, ty: 20, scale: 2, ...FRAME });
		expect(calls).toEqual([
			'save',
			'translate 410 320',
			'scale 2 2',
			'translate -400 -300'
		]);
		calls.length = 0;
		expect(unapplyCameraDrawSpace(ctx)).toBe(true);
		expect(calls).toEqual([
			'translate 400 300',
			'scale 0.5 0.5',
			'translate -410 -320'
		]);
	});

	it('does nothing on a context the camera never touched', () => {
		const { ctx, calls } = fakeSpaceCtx();
		expect(unapplyCameraDrawSpace(ctx)).toBe(false);
		expect(calls).toEqual([]);
	});
});
