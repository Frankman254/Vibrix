import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	beginCameraDrawOffset,
	beginCameraDrawSpace,
	blitInFrameSpace,
	clearCameraDrawOffsets,
	endCameraDrawSpace,
	mirrorCameraDrawSpace,
	paintIntoCameraTile,
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

describe('the tile rule as one shared calculation', () => {
	it("paints a tile in its output's space and leaves it clean", () => {
		const output = fakeSpaceCtx();
		const tile = fakeSpaceCtx();
		beginCameraDrawSpace(output.ctx, {
			tx: 12,
			ty: -30,
			scale: 1,
			...FRAME
		});
		paintIntoCameraTile(tile.ctx, output.ctx, ctx => ctx.translate(1, 2));
		expect(tile.calls).toEqual([
			'save',
			'translate 12 -30',
			'translate 1 2',
			'restore'
		]);
		// The space must not outlive the paint, or the next frame stacks another.
		expect(readCameraDrawSpace(tile.ctx)).toBeNull();
	});

	it('paints straight through when the camera is still', () => {
		const output = fakeSpaceCtx();
		const tile = fakeSpaceCtx();
		paintIntoCameraTile(tile.ctx, output.ctx, ctx => ctx.translate(1, 2));
		// No motion, no save/restore: a still layer pays nothing for the rule.
		expect(tile.calls).toEqual(['translate 1 2']);
	});

	it('blits with the camera cancelled and restores it after', () => {
		const { ctx, calls } = fakeSpaceCtx();
		beginCameraDrawSpace(ctx, { tx: 12, ty: -30, scale: 1, ...FRAME });
		calls.length = 0;
		blitInFrameSpace(ctx, frame => frame.translate(5, 5));
		expect(calls).toEqual([
			'save',
			'translate -12 30',
			'translate 5 5',
			'restore'
		]);
		// Still inside the camera space for whatever the effect draws next.
		expect(readCameraDrawSpace(ctx)).toEqual({
			tx: 12,
			ty: -30,
			scale: 1,
			...FRAME
		});
	});

	it('restores the context even when the blit throws', () => {
		const { ctx, calls } = fakeSpaceCtx();
		beginCameraDrawSpace(ctx, { tx: 4, ty: 4, scale: 1, ...FRAME });
		calls.length = 0;
		expect(() =>
			blitInFrameSpace(ctx, () => {
				throw new Error('boom');
			})
		).toThrow('boom');
		expect(calls).toEqual(['save', 'translate -4 -4', 'restore']);
	});

	it('still saves and restores when there is no camera to cancel', () => {
		const { ctx, calls } = fakeSpaceCtx();
		blitInFrameSpace(ctx, frame => frame.translate(5, 5));
		expect(calls).toEqual(['save', 'translate 5 5', 'restore']);
	});
});

/** A ctx that also records blits, so the dev tripwire can be exercised. */
function fakeBlitCtx() {
	const blits: unknown[] = [];
	const ctx = {
		save: () => {},
		restore: () => {},
		translate: () => {},
		scale: () => {},
		drawImage: (image: unknown) => blits.push(image)
	} as unknown as CanvasRenderingContext2D;
	return { ctx, blits };
}

describe('the dev tripwire for the tile rule', () => {
	it('warns when a frame-sized tile goes through the camera', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { ctx, blits } = fakeBlitCtx();
		beginCameraDrawSpace(ctx, { tx: 9, ty: 9, scale: 1, ...FRAME });
		const tile = { width: FRAME.width, height: FRAME.height };
		ctx.drawImage(tile as unknown as HTMLCanvasElement, 0, 0);
		expect(warn).toHaveBeenCalledOnce();
		// The tripwire only watches: the blit itself still happens.
		expect(blits).toEqual([tile]);
		warn.mockRestore();
	});

	it('stays quiet for a correct blit and for a smaller source', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { ctx } = fakeBlitCtx();
		beginCameraDrawSpace(ctx, { tx: 9, ty: 9, scale: 1, ...FRAME });
		const tile = { width: FRAME.width, height: FRAME.height };
		blitInFrameSpace(ctx, frame =>
			frame.drawImage(tile as unknown as HTMLCanvasElement, 0, 0)
		);
		ctx.drawImage(
			{ width: 32, height: 32 } as unknown as HTMLCanvasElement,
			0,
			0
		);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
