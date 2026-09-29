import { describe, it, expect } from 'vitest';
import {
	getImageBaseSize,
	getRotatedHalfExtents,
	resolveImageTransform,
	resolveMinimumCoverScale,
	MIRROR_FILL_MAX_DEPTH,
	type ResolveImageTransformParams
} from './resolveImageTransform';

function params(
	overrides: Partial<ResolveImageTransformParams> = {}
): ResolveImageTransformParams {
	return {
		viewportWidth: 1920,
		viewportHeight: 1080,
		imageWidth: 1920,
		imageHeight: 1080,
		fitMode: 'cover',
		scale: 1,
		positionX: 0,
		positionY: 0,
		rotation: 0,
		mirror: false,
		keepCovered: false,
		...overrides
	};
}

describe('getImageBaseSize', () => {
	it('stretch fills the viewport exactly', () => {
		const s = getImageBaseSize(800, 600, 1920, 1080, 'stretch');
		expect(s).toEqual({ width: 800, height: 600 });
	});

	it('fit-width pins the width to the viewport', () => {
		const s = getImageBaseSize(800, 600, 1000, 500, 'fit-width');
		expect(s.width).toBe(800);
		expect(s.height).toBeCloseTo(400, 5); // aspect 2:1
	});

	it('fit-height pins the height to the viewport', () => {
		const s = getImageBaseSize(800, 600, 1000, 500, 'fit-height');
		expect(s.height).toBe(600);
		expect(s.width).toBeCloseTo(1200, 5);
	});

	it('cover overflows on the axis that would otherwise leave gaps', () => {
		// Viewport wider than image → cover pins width, overflows height.
		const s = getImageBaseSize(1600, 900, 1000, 1000, 'cover');
		expect(s.width).toBe(1600);
		expect(s.height).toBeGreaterThanOrEqual(900);
	});

	it('contain fits entirely inside the viewport', () => {
		const s = getImageBaseSize(1600, 900, 1000, 1000, 'contain');
		expect(s.width).toBeLessThanOrEqual(1600);
		expect(s.height).toBeLessThanOrEqual(900);
	});
});

describe('getRotatedHalfExtents', () => {
	it('returns the plain half dimensions at 0 degrees', () => {
		const e = getRotatedHalfExtents(200, 100, 0);
		expect(e.halfW).toBeCloseTo(100, 6);
		expect(e.halfH).toBeCloseTo(50, 6);
	});

	it('swaps the extents at 90 degrees', () => {
		const e = getRotatedHalfExtents(200, 100, 90);
		expect(e.halfW).toBeCloseTo(50, 6);
		expect(e.halfH).toBeCloseTo(100, 6);
	});

	it('is symmetric at 180 degrees', () => {
		const e = getRotatedHalfExtents(200, 100, 180);
		expect(e.halfW).toBeCloseTo(100, 6);
		expect(e.halfH).toBeCloseTo(50, 6);
	});
});

describe('resolveMinimumCoverScale', () => {
	it('needs ~1x when the cover base already fills the viewport', () => {
		const s = resolveMinimumCoverScale(1920, 1080, 1920, 1080, 'cover');
		expect(s).toBeGreaterThan(0.9);
		expect(s).toBeLessThan(1.1);
	});

	it('requires a larger scale for contain bases', () => {
		const cover = resolveMinimumCoverScale(1600, 900, 1000, 1000, 'cover');
		const contain = resolveMinimumCoverScale(
			1600,
			900,
			1000,
			1000,
			'contain'
		);
		expect(contain).toBeGreaterThan(cover);
	});
});

describe('resolveImageTransform', () => {
	it('produces a single primary rect by default', () => {
		const r = resolveImageTransform(params());
		expect(r.drawRects).toHaveLength(1);
		expect(r.drawRects[0].kind).toBe('primary');
		expect(r.effectiveScale).toBeCloseTo(1, 6);
		expect(r.warnings).toEqual([]);
	});

	it('centers the primary rect in the viewport at default position', () => {
		const r = resolveImageTransform(params());
		expect(r.centerX).toBeCloseTo(960, 0);
		expect(r.centerY).toBeCloseTo(540, 0);
	});

	it('raises scale and warns when keepCovered needs more than authored', () => {
		const r = resolveImageTransform(
			params({ fitMode: 'contain', scale: 0.5, keepCovered: true })
		);
		expect(r.effectiveScale).toBeGreaterThanOrEqual(r.minScaleForCoverage);
		expect(r.warnings).toContain('scale-raised-for-coverage');
	});

	it('clamps an out-of-range position and warns when covered', () => {
		const r = resolveImageTransform(
			params({ keepCovered: true, positionX: 5 })
		);
		expect(r.effectivePositionX).toBeLessThanOrEqual(r.bounds.maxX);
		expect(r.effectivePositionX).toBeGreaterThanOrEqual(r.bounds.minX);
		expect(r.warnings).toContain('position-clamped-for-coverage');
	});

	it('adds one mirror-fill tile per depth step', () => {
		const depth1 = resolveImageTransform(
			params({ mirrorFill: true, mirrorFillCount: 1 })
		);
		const depth2 = resolveImageTransform(
			params({ mirrorFill: true, mirrorFillCount: 2 })
		);
		expect(depth1.drawRects).toHaveLength(2);
		expect(depth2.drawRects).toHaveLength(3);
		expect(
			depth2.drawRects.filter(r => r.kind === 'mirror-fill')
		).toHaveLength(2);
	});

	it('caps mirror-fill tiles at the documented maximum depth', () => {
		const r = resolveImageTransform(
			params({ mirrorFill: true, mirrorFillCount: 999 })
		);
		expect(r.drawRects).toHaveLength(1 + MIRROR_FILL_MAX_DEPTH);
	});

	it('survives degenerate zero-sized inputs without throwing', () => {
		expect(() =>
			resolveImageTransform(
				params({
					viewportWidth: 0,
					viewportHeight: 0,
					imageWidth: 0,
					imageHeight: 0
				})
			)
		).not.toThrow();
	});

	// ── keepCovered + contain: ultrawide viewport / ultrawide image ──────────

	it('keepCovered+contain covers both axes on an ultrawide viewport (16:9 image on 21:9 screen)', () => {
		// Standard landscape image on an ultrawide monitor → contain would
		// leave black bars on the sides.  keepCovered must raise the scale
		// until both width and height fill the viewport.
		const r = resolveImageTransform(
			params({
				viewportWidth: 3440,
				viewportHeight: 1440,
				imageWidth: 1920,
				imageHeight: 1080,
				fitMode: 'contain',
				scale: 1,
				keepCovered: true
			})
		);
		// The drawn rect must cover the full viewport in both dimensions.
		expect(r.drawRects[0].width).toBeGreaterThanOrEqual(3440);
		expect(r.drawRects[0].height).toBeGreaterThanOrEqual(1440);
		// minScaleForCoverage must be > 1 (image needs to be enlarged).
		expect(r.minScaleForCoverage).toBeGreaterThan(1.0);
	});

	it('keepCovered+contain covers both axes for an ultrawide image on a standard screen', () => {
		// Ultrawide (21:9) panoramic image on a 16:9 monitor → contain
		// would letterbox with bars on top and bottom.
		const r = resolveImageTransform(
			params({
				viewportWidth: 1920,
				viewportHeight: 1080,
				imageWidth: 3440,
				imageHeight: 1440,
				fitMode: 'contain',
				scale: 1,
				keepCovered: true
			})
		);
		expect(r.drawRects[0].width).toBeGreaterThanOrEqual(1920);
		expect(r.drawRects[0].height).toBeGreaterThanOrEqual(1080);
		expect(r.minScaleForCoverage).toBeGreaterThan(1.0);
	});

	it('keepCovered+contain still works when image and viewport share the same aspect', () => {
		// When the aspects match, contain fills at scale=1; keepCovered
		// should not over-scale.
		const r = resolveImageTransform(
			params({
				viewportWidth: 1920,
				viewportHeight: 1080,
				imageWidth: 3840,
				imageHeight: 2160,
				fitMode: 'contain',
				scale: 1,
				keepCovered: true
			})
		);
		expect(r.drawRects[0].width).toBeGreaterThanOrEqual(1920);
		expect(r.drawRects[0].height).toBeGreaterThanOrEqual(1080);
		// Scale should stay close to 1 — no inflation needed.
		expect(r.minScaleForCoverage).toBeCloseTo(1.0, 1);
	});
});

describe('minAuthoredScaleForCoverage (background reframe)', () => {
	// The reported bug: a project authored on a 3440x1440 ultrawide, reopened
	// in a 1512x860 window. The reframe multiplies the authored scale, so
	// storing the DRAWN minimum leaves the image over-zoomed.
	const reframed = {
		viewportWidth: 1512,
		viewportHeight: 860,
		imageWidth: 1920,
		imageHeight: 1080,
		fitMode: 'contain' as const,
		keepCovered: true,
		layout: {
			layoutResponsiveEnabled: true,
			layoutBackgroundReframeEnabled: true,
			layoutReferenceWidth: 3440,
			layoutReferenceHeight: 1440
		}
	};

	it('is the drawn minimum divided by the reframe factor', () => {
		const r = resolveImageTransform(params({ ...reframed, scale: 1 }));
		expect(r.reframeScaleFactor).toBeGreaterThan(1);
		expect(
			r.minAuthoredScaleForCoverage * r.reframeScaleFactor
		).toBeCloseTo(r.minScaleForCoverage, 6);
	});

	it('draws exactly at the coverage minimum when stored', () => {
		const probe = resolveImageTransform(params({ ...reframed, scale: 1 }));
		const exact = resolveImageTransform(
			params({ ...reframed, scale: probe.minAuthoredScaleForCoverage })
		);
		// No extra zoom: the drawn scale IS the minimum, not above it.
		expect(exact.effectiveScale).toBeCloseTo(exact.minScaleForCoverage, 6);
		expect(exact.warnings).not.toContain('scale-raised-for-coverage');
	});

	it('over-zooms when the drawn minimum is stored instead', () => {
		const probe = resolveImageTransform(params({ ...reframed, scale: 1 }));
		const naive = resolveImageTransform(
			params({ ...reframed, scale: probe.minScaleForCoverage })
		);
		expect(naive.effectiveScale).toBeGreaterThan(naive.minScaleForCoverage);
	});

	it('is the drawn minimum when the reframe is off', () => {
		const r = resolveImageTransform(
			params({
				...reframed,
				scale: 1,
				layout: {
					...reframed.layout,
					layoutBackgroundReframeEnabled: false
				}
			})
		);
		expect(r.reframeScaleFactor).toBe(1);
		expect(r.minAuthoredScaleForCoverage).toBeCloseTo(
			r.minScaleForCoverage,
			6
		);
	});
});
