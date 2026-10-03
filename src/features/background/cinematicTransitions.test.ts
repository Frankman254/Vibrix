import { TRANSITION_TYPES } from './transitionCatalog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	drawCinematicTransition,
	type CinematicTransition
} from './cinematicTransitions';

function context() {
	return {
		setTransform: vi.fn(),
		translate: vi.fn(),
		rotate: vi.fn(),
		scale: vi.fn(),
		clearRect: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		drawImage: vi.fn(),
		fillRect: vi.fn(),
		createLinearGradient: () => ({ addColorStop: vi.fn() }),
		createRadialGradient: () => ({ addColorStop: vi.fn() })
	} as unknown as CanvasRenderingContext2D;
}

function setup() {
	const created: Array<{
		width: number;
		height: number;
		ctx: CanvasRenderingContext2D;
	}> = [];
	vi.stubGlobal('document', {
		createElement: () => {
			const ctx = context();
			const canvas = { width: 0, height: 0, ctx, getContext: () => ctx };
			created.push(canvas);
			return canvas;
		}
	});
	const args = {
		ctx: context(),
		width: 1920,
		height: 1080,
		type: 'cross-zoom' as CinematicTransition,
		progress: 0.5,
		intensity: 1,
		opacity: 0.4,
		drawFrom: vi.fn(),
		drawTo: vi.fn()
	};
	return { created, args };
}

afterEach(() => vi.unstubAllGlobals());

describe('cinematic transition rendering', () => {
	it('composes each source once, reuses scratch buffers and isolates export targets', () => {
		const { args, created } = setup();
		drawCinematicTransition(args);
		expect(args.drawFrom).toHaveBeenCalledTimes(1);
		expect(args.drawTo).toHaveBeenCalledTimes(1);
		expect(created[2].ctx.drawImage).toHaveBeenCalledTimes(12);
		drawCinematicTransition({ ...args, width: 1080, height: 1920 });
		expect(created).toHaveLength(4);
		expect(
			created
				.slice(0, 3)
				.every(c => c.width === 1080 && c.height === 1920)
		).toBe(true);
		drawCinematicTransition({ ...args, ctx: context() });
		expect(created).toHaveLength(8);
		expect(args.ctx.save).toHaveBeenCalledTimes(2);
		expect(args.ctx.restore).toHaveBeenCalledTimes(2);
	});

	it.each(TRANSITION_TYPES)(
		'%s draws exact endpoints without effect residue',
		type => {
			const { args, created } = setup();
			for (const progress of [0, 1]) {
				drawCinematicTransition({ ...args, type, progress });
				expect(created[2].ctx.drawImage).toHaveBeenLastCalledWith(
					created[progress],
					0,
					0
				);
			}
			expect(created[2].ctx.drawImage).toHaveBeenCalledTimes(2);
		}
	);

	it('falls back cleanly when a canvas context is unavailable', () => {
		const { args } = setup();
		vi.stubGlobal('document', {
			createElement: () => ({ getContext: () => null })
		});
		expect(drawCinematicTransition(args)).toBe(false);
		expect(args.drawFrom).not.toHaveBeenCalled();
	});
});
