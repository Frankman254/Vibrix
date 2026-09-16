/**
 * AutoZoom — the Keep Screen Covered minimum scale.
 *
 * Deep module: one question, one answer. "What is the MINIMUM project scale
 * from which the static composition — primary tile + Mirror Fill clones at
 * the current fitMode base size, with NO reactive boost and NO parallax —
 * always covers the viewport, for some valid composition position?"
 *
 * Interface facts callers must know:
 * - `tileWidthAtScaleOne` / `tileHeightAtScaleOne` are the STATIC tile base
 *   sizes (e.g. `getImageBaseSize(viewport, natural, currentFitMode)`). The
 *   returned scale is in the SAME units as the stored `imageScale` (a
 *   multiplier on that base). This module never reads or picks `fitMode` —
 *   passing the base only converts units, it does not select a framing.
 * - Inputs are strictly STATIC geometry. Audio, bass boost, parallax and
 *   animation state are deliberately not parameters: the minimum can never
 *   fluctuate with them.
 * - `mirrorFillCount` is total mirrored clones (renderer semantics, 0–5);
 *   `mirrorFillInvert` is NOT an input: it shifts the composition's center of
 *   symmetry but never its total width (the clone dx range always spans
 *   exactly `count` steps), so it cannot change the required scale.
 * - Rotation 0 is the exact closed form: the composition is a contiguous
 *   strip (step = tile − overlap ⇒ tiles always overlap), so covering is
 *   possible iff the strip spans the viewport; invert is irrelevant there.
 * - Rotation ≠ 0 uses the SINGLE-TILE guarantee, which is exact for a
 *   rotated rect covering an axis-aligned rect (both convex ⇒ corner test
 *   iff containment ⇒ closed form on projections). The mirror UNION is not
 *   used to lower the minimum because a spreading rotated composition is
 *   not monotonically covering in scale: a smaller scale that happens to
 *   cover at one spacing does not stay covered as the scale grows. The
 *   single-tile bound is the largest scale from which coverage ALWAYS holds
 *   for every larger scale — which is the interface promise.
 * - Bounding boxes are never used as a coverage proof.
 *
 * Seam note: the renderer-side clamp (`resolveImageTransform`'s
 * `minScaleForCoverage`) and the store-side AutoZoom action both call THIS
 * function. One source of truth: the UI minimum and the render clamp can
 * never disagree.
 */

/** Renderer seam overlap between adjacent mirror-fill tiles (px). */
export const AUTOZOOM_SEAM_OVERLAP = 3;

/** Max mirror clones, mirroring `MIRROR_FILL_MAX_DEPTH`. */
const MAX_MIRROR_FILL_COUNT = 5;

export type AutoZoomInput = {
	viewportWidth: number;
	viewportHeight: number;
	/** Tile width at scale 1 for the CURRENT fitMode (static base). */
	tileWidthAtScaleOne: number;
	/** Tile height at scale 1 for the CURRENT fitMode (static base). */
	tileHeightAtScaleOne: number;
	/** Total mirrored clones around the primary tile (0 = Mirror Fill off). */
	mirrorFillCount?: number;
	/** Seam overlap in px; default {@link AUTOZOOM_SEAM_OVERLAP}. */
	seamOverlapPx?: number;
	/** Tile rotation in degrees; default 0. */
	rotation?: number;
};

function sanitizeCount(count: number | undefined): number {
	if (!Number.isFinite(count ?? 0)) return 0;
	return Math.max(0, Math.min(MAX_MIRROR_FILL_COUNT, Math.round(count ?? 0)));
}

/**
 * The minimum AutoZoom scale (project-scale units, same as `imageScale`).
 * Pure: same inputs always return the same number; no audio, no parallax,
 * no fitMode selection, no side effects.
 */
export function resolveAutoZoomScale({
	viewportWidth,
	viewportHeight,
	tileWidthAtScaleOne,
	tileHeightAtScaleOne,
	mirrorFillCount = 0,
	seamOverlapPx = AUTOZOOM_SEAM_OVERLAP,
	rotation = 0
}: AutoZoomInput): number {
	const vw = Math.max(1, viewportWidth);
	const vh = Math.max(1, viewportHeight);
	// Math.max propagates NaN from any argument — guard explicitly so
	// degenerate dimensions sanitize instead of poisoning the result.
	const tw = Number.isFinite(tileWidthAtScaleOne)
		? Math.max(0.001, tileWidthAtScaleOne)
		: 0.001;
	const th = Number.isFinite(tileHeightAtScaleOne)
		? Math.max(0.001, tileHeightAtScaleOne)
		: 0.001;
	const n = sanitizeCount(mirrorFillCount);

	if (rotation !== 0) {
		// Single-tile guarantee, exact closed form (see module docs).
		const radians = (rotation * Math.PI) / 180;
		const cos = Math.abs(Math.cos(radians));
		const sin = Math.abs(Math.sin(radians));
		const scaleX = (vw * cos + vh * sin) / tw;
		const scaleY = (vw * sin + vh * cos) / th;
		return Math.max(scaleX, scaleY);
	}

	// Rotation 0: X coverage comes from the contiguous clone strip. With
	// step = tw·s − O the span of 1 primary + n clones is
	//   spanX(s) = (n + 1)·tw·s − n·O,
	// monotone in s ⇒ the minimum is where spanX = vw:
	//   scaleX = (vw + n·O) / ((n + 1)·tw).
	// Y has no tiling: one row must reach vh ⇒ scaleY = vh / th.
	const overlap = Math.max(0, seamOverlapPx);
	const scaleX = (vw + n * overlap) / ((n + 1) * tw);
	const scaleY = vh / th;
	return Math.max(scaleX, scaleY);
}

export type AutoZoomCoverageCheck = AutoZoomInput & { scale: number };

/**
 * Strict coverage predicate used by tests and the debug overlay: does the
 * composition at `scale` cover the viewport for SOME valid position?
 *
 * - Rotation 0: exact (contiguous strip).
 * - Rotation ≠ 0: the same sufficient guarantee `resolveAutoZoomScale`
 *   commits to (single tile alone covers the viewport). A union-only cover
 *   at a rotated scale is NOT reported here — it cannot be guaranteed for
 *   every larger scale.
 */
export function compositionCoversViewport({
	scale,
	rotation = 0,
	...input
}: AutoZoomCoverageCheck): boolean {
	const required = resolveAutoZoomScale({ ...input, rotation });
	return scale >= required - 1e-9;
}
