import { describe, it, expect } from 'vitest';
import {
	AUTOZOOM_SEAM_OVERLAP,
	compositionCoversViewport,
	resolveAutoZoomScale
} from './autoZoom';
import { getImageBaseSize } from './resolveImageTransform';

// Portrait image in a landscape viewport, contain base: tile is
// vh * imageAspect wide and vh tall.
const VP = { viewportWidth: 1920, viewportHeight: 1080 };
const portraitContain = () => {
	const base = getImageBaseSize(1920, 1080, 1080, 1920, 'contain');
	return {
		tileWidthAtScaleOne: base.width,
		tileHeightAtScaleOne: base.height
	};
};

describe('resolveAutoZoomScale', () => {
	it('rotation 0, no clones: exact viewport/tile ratio on the binding axis', () => {
		const s = resolveAutoZoomScale({ ...VP, ...portraitContain() });
		// X is binding: 1920 / 607.5 > 1080 / 1080.
		expect(s).toBeCloseTo(1920 / 607.5, 9);
	});

	it('mirror fill lowers the X requirement by the strip formula', () => {
		const t = portraitContain();
		const one = resolveAutoZoomScale({ ...VP, ...t });
		const two = resolveAutoZoomScale({
			...VP,
			...t,
			mirrorFillCount: 2
		});
		// spanX = 3·tw·s − 2·O = vw  ⇒  s = (vw + 2·O) / (3·tw) > vh/th = 1,
		// so X still binds at this depth (at deeper counts Y takes over).
		expect(two).toBeCloseTo(
			(1920 + 2 * AUTOZOOM_SEAM_OVERLAP) / (3 * t.tileWidthAtScaleOne),
			9
		);
		expect(two).toBeLessThan(one);
	});

	it('seam overlap is additive in the numerator, not a multiplier', () => {
		const t = portraitContain();
		const tight = resolveAutoZoomScale({
			...VP,
			...t,
			mirrorFillCount: 2,
			seamOverlapPx: 0
		});
		const loose = resolveAutoZoomScale({
			...VP,
			...t,
			mirrorFillCount: 2,
			seamOverlapPx: 10
		});
		expect(loose - tight).toBeCloseTo(20 / (3 * t.tileWidthAtScaleOne), 12);
	});

	it('rotation != 0 uses the single-tile closed form on both axes', () => {
		const t = portraitContain();
		const r = (45 * Math.PI) / 180;
		const s = resolveAutoZoomScale({ ...VP, ...t, rotation: 45 });
		const scaleX =
			(1920 * Math.abs(Math.cos(r)) + 1080 * Math.abs(Math.sin(r))) /
			t.tileWidthAtScaleOne;
		const scaleY =
			(1920 * Math.abs(Math.sin(r)) + 1080 * Math.abs(Math.cos(r))) /
			t.tileHeightAtScaleOne;
		expect(s).toBeCloseTo(Math.max(scaleX, scaleY), 9);
	});

	it('rotation 180 costs exactly as much as rotation 0 (closed form is axis-symmetric in |cos|,|sin|)', () => {
		const t = portraitContain();
		expect(
			resolveAutoZoomScale({ ...VP, ...t, rotation: 180 })
		).toBeCloseTo(
			Math.max(
				1920 / t.tileWidthAtScaleOne,
				1080 / t.tileHeightAtScaleOne
			),
			9
		);
	});

	it('Y requirement is fitMode-independent for the same tile height', () => {
		// Landscape image, fit-width: tile is viewport-wide, shorter than vh.
		const base = getImageBaseSize(1920, 1080, 1920, 800, 'fit-width');
		const s = resolveAutoZoomScale({
			...VP,
			tileWidthAtScaleOne: base.width,
			tileHeightAtScaleOne: base.height
		});
		// Y binds: vh/th > vw/tw.
		expect(s).toBeCloseTo(1080 / base.height, 9);
	});

	it('sanitizes degenerate inputs to a positive finite scale', () => {
		const s = resolveAutoZoomScale({
			viewportWidth: -5,
			viewportHeight: 0,
			tileWidthAtScaleOne: 0,
			tileHeightAtScaleOne: Number.NaN,
			mirrorFillCount: 99.7,
			seamOverlapPx: -3,
			rotation: 0
		});
		expect(Number.isFinite(s)).toBe(true);
		expect(s).toBeGreaterThan(0);
	});

	it('mirrorFillCount beyond the renderer depth is clamped, not trusted', () => {
		const t = portraitContain();
		const clamped = resolveAutoZoomScale({
			...VP,
			...t,
			mirrorFillCount: 50
		});
		const atDepth = resolveAutoZoomScale({
			...VP,
			...t,
			mirrorFillCount: 5
		});
		expect(clamped).toBeCloseTo(atDepth, 12);
	});
});

describe('compositionCoversViewport', () => {
	it('is the exact inverse of the minimum at rotation 0', () => {
		const t = portraitContain();
		const min = resolveAutoZoomScale({ ...VP, ...t, mirrorFillCount: 3 });
		expect(
			compositionCoversViewport({
				...VP,
				...t,
				mirrorFillCount: 3,
				scale: min
			})
		).toBe(true);
		expect(
			compositionCoversViewport({
				...VP,
				...t,
				mirrorFillCount: 3,
				scale: min - 0.01
			})
		).toBe(false);
	});

	it('is monotone: covering at the minimum implies covering at every larger scale', () => {
		const t = portraitContain();
		const min = resolveAutoZoomScale({ ...VP, ...t });
		for (const scale of [min, min * 1.5, min * 3, min * 10]) {
			expect(compositionCoversViewport({ ...VP, ...t, scale })).toBe(
				true
			);
		}
	});
});
