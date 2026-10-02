import { describe, expect, it } from 'vitest';
import {
	beginCameraDrawSpace,
	endCameraDrawSpace
} from '@/features/stageFx/render';
import { drawFrameTile } from './frameTile';

const FRAME = { width: 800, height: 600 };

/**
 * A 2D context that tracks the translate/scale it is given, so a test can ask
 * where a draw actually landed instead of asserting on call order.
 */
function fakeCtx(label: string, log: string[]) {
	const stack: Array<{ tx: number; ty: number; scale: number }> = [];
	let state = { tx: 0, ty: 0, scale: 1 };
	const ctx = {
		canvas: { width: FRAME.width, height: FRAME.height },
		save: () => {
			stack.push({ ...state });
		},
		restore: () => {
			state = stack.pop() ?? state;
		},
		translate: (x: number, y: number) => {
			state = {
				...state,
				tx: state.tx + x * state.scale,
				ty: state.ty + y * state.scale
			};
		},
		scale: (x: number) => {
			state = { ...state, scale: state.scale * x };
		},
		clearRect: (x: number, y: number, width: number, height: number) => {
			log.push(
				`${label} clear ${x},${y} ${width}x${height} @${state.tx},${state.ty}`
			);
		},
		drawImage: () => {
			log.push(
				`${label} drawImage @${state.tx},${state.ty} x${state.scale}`
			);
		}
	};
	return {
		ctx: ctx as unknown as CanvasRenderingContext2D,
		at: () => ({ ...state })
	};
}

describe('drawFrameTile', () => {
	it('paints the tile in the output camera space and blits with it cancelled', () => {
		const log: string[] = [];
		const output = fakeCtx('out', log);
		const tile = fakeCtx('tile', log);
		beginCameraDrawSpace(output.ctx, {
			tx: 40,
			ty: -25,
			scale: 1,
			...FRAME
		});

		let paintedAt = { tx: 0, ty: 0, scale: 1 };
		drawFrameTile(output.ctx, tile.ctx, FRAME, () => {
			paintedAt = tile.at();
		});
		endCameraDrawSpace(output.ctx);

		// The figure lands inside the tile exactly where it lands on the output,
		// so nothing it draws past the frame is clipped at the wrong place.
		expect(paintedAt).toEqual({ tx: 40, ty: -25, scale: 1 });
		// ...and the tile itself is composited on the frame's own origin.
		expect(log).toContain('out drawImage @0,0 x1');
	});

	it('clears the tile outside the camera space', () => {
		const log: string[] = [];
		const output = fakeCtx('out', log);
		const tile = fakeCtx('tile', log);
		beginCameraDrawSpace(output.ctx, {
			tx: 40,
			ty: -25,
			scale: 1,
			...FRAME
		});
		drawFrameTile(output.ctx, tile.ctx, FRAME, () => {});
		endCameraDrawSpace(output.ctx);

		// A clearRect through the camera clears a moved rectangle and leaves the
		// previous frame along one edge.
		expect(log[0]).toBe('tile clear 0,0 800x600 @0,0');
	});

	it('cancels a zoomed space as well', () => {
		const log: string[] = [];
		const output = fakeCtx('out', log);
		const tile = fakeCtx('tile', log);
		beginCameraDrawSpace(output.ctx, {
			tx: 12,
			ty: 8,
			scale: 1.25,
			...FRAME
		});
		let paintedAt = { tx: 0, ty: 0, scale: 1 };
		drawFrameTile(output.ctx, tile.ctx, FRAME, () => {
			paintedAt = tile.at();
		});
		endCameraDrawSpace(output.ctx);

		expect(paintedAt.scale).toBeCloseTo(1.25);
		expect(log).toContain('out drawImage @0,0 x1');
	});

	it('does not composite a tile whose paint reported nothing drawn', () => {
		const log: string[] = [];
		const output = fakeCtx('out', log);
		const tile = fakeCtx('tile', log);
		drawFrameTile(output.ctx, tile.ctx, FRAME, () => false);
		expect(log.some(entry => entry.includes('drawImage'))).toBe(false);
	});

	it('costs no transform when the layer does not move', () => {
		const log: string[] = [];
		const output = fakeCtx('out', log);
		const tile = fakeCtx('tile', log);
		let paintedAt = { tx: 0, ty: 0, scale: 1 };
		drawFrameTile(output.ctx, tile.ctx, FRAME, () => {
			paintedAt = tile.at();
		});
		expect(paintedAt).toEqual({ tx: 0, ty: 0, scale: 1 });
		expect(log).toContain('out drawImage @0,0 x1');
	});
});
