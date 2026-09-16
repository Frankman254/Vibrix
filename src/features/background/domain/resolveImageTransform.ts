import {
	getLayoutReferenceResolution,
	resolveResponsiveBackgroundTransform
} from '@/features/layout/responsiveLayout';
import { AUTOZOOM_SEAM_OVERLAP, resolveAutoZoomScale } from './autoZoom';
import type { ImageFitMode, WallpaperState } from '@/types/wallpaper';

export type ImageDrawRect = {
	cx: number;
	cy: number;
	width: number;
	height: number;
	rotation: number;
	mirror: boolean;
	mirrorY?: boolean;
	kind: 'primary' | 'mirror-fill';
};

export type ImageTransformBounds = {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
};

export type ResolvedImageTransform = {
	drawRects: ImageDrawRect[];
	effectiveScale: number;
	effectivePositionX: number;
	effectivePositionY: number;
	effectiveRotation: number;
	minScaleForCoverage: number;
	bounds: ImageTransformBounds;
	warnings: string[];
	baseWidth: number;
	baseHeight: number;
	centerX: number;
	centerY: number;
	/**
	 * Geometric extents of the full mirror-fill composition (all tiles
	 * unioned) relative to the primary's drawn center. Pure geometry — no
	 * focus, no parallax. `compositionWidth/Height = maxX-minX, maxY-minY`.
	 *
	 * UI surfaces that need composition-space math (Pick Focus, marker
	 * position) read these to translate viewport pixel coordinates into a
	 * composition-relative fraction.
	 */
	compositionMinX: number;
	compositionMaxX: number;
	compositionMinY: number;
	compositionMaxY: number;
	compositionWidth: number;
	compositionHeight: number;
};

export type ResolveImageTransformParams = {
	viewportWidth: number;
	viewportHeight: number;
	imageWidth: number;
	imageHeight: number;
	fitMode: ImageFitMode;
	scale: number;
	positionX: number;
	positionY: number;
	rotation: number;
	mirror: boolean;
	keepCovered: boolean;
	focusX?: number | null;
	focusY?: number | null;
	mirrorFill?: boolean;
	mirrorFillInvert?: boolean;
	/**
	 * Mirror Fill Depth — total mirrored copies added around the primary tile.
	 *
	 *   depth=0 → [ original ]                         (1 tile)
	 *   depth=1 → [ original ][ mirror ]               (2 tiles)
	 *   depth=2 → [ mirror-L ][ original ][ mirror-R ] (3 tiles)
	 *
	 * The field is named `mirrorFillCount` on the wire only for persistence
	 * compatibility — the semantics are total mirrored copies.
	 */
	mirrorFillCount?: number;
	reactiveScaleBoost?: number;
	parallaxX?: number;
	parallaxY?: number;
	freeBound?: number;
	layout?: Pick<
		WallpaperState,
		| 'layoutResponsiveEnabled'
		| 'layoutBackgroundReframeEnabled'
		| 'layoutReferenceWidth'
		| 'layoutReferenceHeight'
	>;
};

const MIRROR_FILL_SEAM_OVERLAP = AUTOZOOM_SEAM_OVERLAP;

function clamp(value: number, min: number, max: number): number {
	if (max < min) return (min + max) / 2;
	return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
	return clamp(value, 0, 1);
}

export function getImageBaseSize(
	viewportWidth: number,
	viewportHeight: number,
	imageWidth: number,
	imageHeight: number,
	fitMode: ImageFitMode
): { width: number; height: number } {
	const imageAspect = imageWidth / Math.max(imageHeight, 1);
	const viewportAspect = viewportWidth / Math.max(viewportHeight, 1);

	if (fitMode === 'stretch') {
		return { width: viewportWidth, height: viewportHeight };
	}
	if (fitMode === 'fit-width') {
		return {
			width: viewportWidth,
			height: viewportWidth / Math.max(imageAspect, 0.001)
		};
	}
	if (fitMode === 'fit-height') {
		return { width: viewportHeight * imageAspect, height: viewportHeight };
	}
	if (fitMode === 'contain') {
		if (viewportAspect > imageAspect) {
			return {
				width: viewportHeight * imageAspect,
				height: viewportHeight
			};
		}
		return {
			width: viewportWidth,
			height: viewportWidth / Math.max(imageAspect, 0.001)
		};
	}
	if (viewportAspect > imageAspect) {
		return {
			width: viewportWidth,
			height: viewportWidth / Math.max(imageAspect, 0.001)
		};
	}
	return { width: viewportHeight * imageAspect, height: viewportHeight };
}

export function getRotatedHalfExtents(
	width: number,
	height: number,
	rotationDeg: number
): { halfW: number; halfH: number } {
	const radians = (rotationDeg * Math.PI) / 180;
	const cos = Math.abs(Math.cos(radians));
	const sin = Math.abs(Math.sin(radians));
	const halfW = width / 2;
	const halfH = height / 2;
	return {
		halfW: halfW * cos + halfH * sin,
		halfH: halfW * sin + halfH * cos
	};
}

/** Maximum Mirror Fill mirrored copies. Total tiles = 1 + count. */
export const MIRROR_FILL_MAX_DEPTH = 5;

function sanitizeMirrorFillCopyCount(count: number): number {
	return Math.max(0, Math.min(MIRROR_FILL_MAX_DEPTH, Math.round(count)));
}

function getMirrorFillStepXForWidth(width: number): number {
	return Math.max(1, width - MIRROR_FILL_SEAM_OVERLAP);
}

/**
 * Returns integer-step offsets for every mirror clone. The UI value is the
 * total number of mirrored copies, not "copies per side":
 *
 *   depth=0 → []
 *   depth=1 → [+1] or [-1] when inverted
 *   depth=2 → [-1, +1]
 *   depth=3 → [-1, +1, +2] or [-2, -1, +1] when inverted
 *
 * Even counts stay symmetric around the primary. Odd counts put the extra
 * extension on the side selected by Mirror Fill Invert. Center Focus still
 * centers the whole visible composition via the union bounds.
 */
function getMirrorFillCloneDxs(count: number, invert = false): number[] {
	const safe = sanitizeMirrorFillCopyCount(count);
	const offsets: number[] = [];
	const pairs = Math.floor(safe / 2);
	const extra = safe % 2;
	for (let i = pairs; i >= 1; i--) {
		offsets.push(-i);
	}
	for (let i = 1; i <= pairs; i++) {
		offsets.push(i);
	}
	if (extra > 0) {
		if (invert) offsets.unshift(-(pairs + 1));
		else offsets.push(pairs + 1);
	}
	return offsets;
}

function getMirrorFillRelativeCenterXs(
	width: number,
	count: number,
	invert = false
): number[] {
	const stepX = getMirrorFillStepXForWidth(width);
	return [0, ...getMirrorFillCloneDxs(count, invert).map(dx => dx * stepX)];
}

/**
 * Returns the geometric extents of the full mirror-fill composition (primary
 * + all clones) relative to the primary's center, in pixel space. Pure
 * geometry — no focus, no parallax. Because Mirror Fill is symmetric
 * depth-per-side, `minX === -maxX` and the primary tile is always the exact
 * geometric center of the union.
 */
function getCompositeUnion({
	width,
	height,
	rotation,
	count,
	invert = false
}: {
	width: number;
	height: number;
	rotation: number;
	count: number;
	invert?: boolean;
}): { minX: number; maxX: number; minY: number; maxY: number } {
	const { halfW, halfH } = getRotatedHalfExtents(width, height, rotation);
	const centers = getMirrorFillRelativeCenterXs(width, count, invert);
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const centerX of centers) {
		minX = Math.min(minX, centerX - halfW);
		maxX = Math.max(maxX, centerX + halfW);
		minY = Math.min(minY, -halfH);
		maxY = Math.max(maxY, halfH);
	}

	return { minX, maxX, minY, maxY };
}

function getCoverageBoundsFromUnion(
	viewportWidth: number,
	viewportHeight: number,
	union: { minX: number; maxX: number; minY: number; maxY: number }
): ImageTransformBounds {
	const minTargetX = viewportWidth - union.maxX;
	const maxTargetX = -union.minX;
	const minTargetY = viewportHeight - union.maxY;
	const maxTargetY = -union.minY;

	const minX = (minTargetX - viewportWidth / 2) / (viewportWidth * 0.5);
	const maxX = (maxTargetX - viewportWidth / 2) / (viewportWidth * 0.5);
	const yA = (viewportHeight / 2 - maxTargetY) / (viewportHeight * 0.5);
	const yB = (viewportHeight / 2 - minTargetY) / (viewportHeight * 0.5);

	return {
		minX: Math.min(minX, maxX),
		maxX: Math.max(minX, maxX),
		minY: Math.min(yA, yB),
		maxY: Math.max(yA, yB)
	};
}

/**
 * Renderer-side coverage minimum. Delegates to `resolveAutoZoomScale` — the
 * SAME function the store's AutoZoom action and the UI sliders clamp
 * against. One source of truth: the UI minimum and this render clamp can
 * never disagree. Inputs are the STATIC composition only (tile base at the
 * current fitMode, mirror-fill depth, rotation); reactive boost and parallax
 * are layered on top of the clamp, never inside it.
 */
export function resolveMinimumCoverScale(
	viewportWidth: number,
	viewportHeight: number,
	imageWidth: number,
	imageHeight: number,
	fitMode: ImageFitMode = 'cover',
	rotation = 0,
	mirrorFillDepth = 0
): number {
	const base = getImageBaseSize(
		viewportWidth,
		viewportHeight,
		Math.max(1, imageWidth),
		Math.max(1, imageHeight),
		fitMode
	);
	return clamp(
		resolveAutoZoomScale({
			viewportWidth,
			viewportHeight,
			tileWidthAtScaleOne: base.width,
			tileHeightAtScaleOne: base.height,
			mirrorFillCount: mirrorFillDepth,
			rotation
		}),
		0.01,
		100
	);
}

/**
 * Free-mode bounds derived from the full mirror-fill composition (not just
 * the primary tile). Small images still get the standard `freeBound`
 * headroom for drag-off-screen; larger compositions get at least the
 * composition overflow so panning can bring any mirror clone into view.
 * The largest absolute extent keeps the free-drag bound symmetric in
 * normalized space.
 */
function getCompositionFreeBounds(
	viewportWidth: number,
	viewportHeight: number,
	union: { minX: number; maxX: number; minY: number; maxY: number },
	freeBound: number
): ImageTransformBounds {
	const maxAbsX = Math.max(Math.abs(union.minX), Math.abs(union.maxX));
	const maxAbsY = Math.max(Math.abs(union.minY), Math.abs(union.maxY));
	const overflowX = Math.max(0, maxAbsX - viewportWidth / 2);
	const overflowY = Math.max(0, maxAbsY - viewportHeight / 2);
	const maxNormX = overflowX / (viewportWidth * 0.5);
	const maxNormY = overflowY / (viewportHeight * 0.5);
	const freeBoundX = Math.max(freeBound, maxNormX);
	const freeBoundY = Math.max(freeBound, maxNormY);
	return {
		minX: -freeBoundX,
		maxX: freeBoundX,
		minY: -freeBoundY,
		maxY: freeBoundY
	};
}

/**
 * Composition-space focus offset.
 *
 * `focusX/focusY` ∈ [0,1] address a point on the FULL mirror-fill composition
 * (primary + all clones), NOT only the source primary tile. (0.5, 0.5) is the
 * geometric center of the symmetric composition. Null focus is treated as
 * (0.5, 0.5), so Center Focus and default framing center the whole visible
 * composition while keeping the original tile as the logical center.
 *
 * Returned value is the pixel-space delta from primary center to the chosen
 * focus point in unrotated composition space, rotated into rendered space.
 * Renderer uses `centerX = targetX − focus.x` so the focus pixel lands AT
 * `targetX` regardless of where in the composition it is.
 *
 * Mirror flag from the primary tile is intentionally NOT consulted: focus is
 * a geometric position on what the user SEES; flipping the primary's source
 * content is a separate concern from where the zoom anchors visually.
 */
function getFocusOffset(
	union: { minX: number; maxX: number; minY: number; maxY: number },
	rotation: number,
	focusX: number | null,
	focusY: number | null
): { x: number; y: number } {
	const fX = focusX != null ? clamp01(focusX) : 0.5;
	const fY = focusY != null ? clamp01(focusY) : 0.5;
	const focusLocalX = union.minX + fX * (union.maxX - union.minX);
	const focusLocalY = union.minY + fY * (union.maxY - union.minY);
	const radians = (rotation * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);

	return {
		x: focusLocalX * cos - focusLocalY * sin,
		y: focusLocalX * sin + focusLocalY * cos
	};
}

function pushMirrorFillRects(
	drawRects: ImageDrawRect[],
	primary: ImageDrawRect,
	depth: number,
	invert: boolean
) {
	if (depth <= 0) return;
	const stepX = getMirrorFillStepXForWidth(primary.width);
	for (const dx of getMirrorFillCloneDxs(depth, invert)) {
		const flipX = Math.abs(dx) % 2 === 1;
		const mirrorX = primary.mirror !== flipX;
		drawRects.push({
			...primary,
			cx: Math.round(primary.cx + dx * stepX),
			cy: Math.round(primary.cy),
			width: primary.width,
			height: primary.height,
			mirror: invert ? !mirrorX : mirrorX,
			mirrorY: false,
			kind: 'mirror-fill'
		});
	}
}

export function resolveImageTransform({
	viewportWidth,
	viewportHeight,
	imageWidth,
	imageHeight,
	fitMode,
	scale,
	positionX,
	positionY,
	rotation,
	mirror,
	keepCovered,
	focusX = null,
	focusY = null,
	mirrorFill = false,
	mirrorFillInvert = false,
	mirrorFillCount = 1,
	reactiveScaleBoost = 0,
	parallaxX = 0,
	parallaxY = 0,
	freeBound = 1,
	layout
}: ResolveImageTransformParams): ResolvedImageTransform {
	const warnings: string[] = [];
	const safeViewportWidth = Math.max(1, viewportWidth);
	const safeViewportHeight = Math.max(1, viewportHeight);
	const safeImageWidth = Math.max(1, imageWidth);
	const safeImageHeight = Math.max(1, imageHeight);
	const base = getImageBaseSize(
		safeViewportWidth,
		safeViewportHeight,
		safeImageWidth,
		safeImageHeight,
		fitMode
	);
	const authoredBaseScale = Math.max(0.01, scale);
	const authoredScale = authoredBaseScale + Math.max(0, reactiveScaleBoost);
	let responsiveBaseScale = authoredBaseScale;
	let resolvedScale = authoredScale;
	let resolvedPositionX = positionX;
	let resolvedPositionY = positionY;
	const sanitizedMirrorFillDepth =
		mirrorFill && mirrorFillCount > 0
			? sanitizeMirrorFillCopyCount(mirrorFillCount)
			: 0;

	if (
		layout?.layoutResponsiveEnabled &&
		layout.layoutBackgroundReframeEnabled
	) {
		const reference = getLayoutReferenceResolution(layout);
		const referenceBase = getImageBaseSize(
			reference.width,
			reference.height,
			safeImageWidth,
			safeImageHeight,
			fitMode
		);
		const responsive = resolveResponsiveBackgroundTransform({
			...layout,
			authoredScale,
			authoredPositionX: positionX,
			authoredPositionY: positionY,
			mirror,
			currentViewport: {
				width: safeViewportWidth,
				height: safeViewportHeight
			},
			currentBaseWidth: base.width,
			currentBaseHeight: base.height,
			referenceBaseWidth: referenceBase.width,
			referenceBaseHeight: referenceBase.height
		});
		resolvedScale = responsive.scale;
		resolvedPositionX = responsive.positionX;
		resolvedPositionY = responsive.positionY;
		responsiveBaseScale = resolvedScale - Math.max(0, reactiveScaleBoost);
	}

	const minScaleForCoverage = resolveMinimumCoverScale(
		safeViewportWidth,
		safeViewportHeight,
		safeImageWidth,
		safeImageHeight,
		fitMode,
		rotation,
		sanitizedMirrorFillDepth
	);
	const coverageActive = keepCovered;
	const coveredBaseScale = coverageActive
		? Math.max(responsiveBaseScale, minScaleForCoverage)
		: responsiveBaseScale;
	const visibleReactiveBoost = Math.max(
		0,
		resolvedScale - responsiveBaseScale
	);
	const effectiveScale = coverageActive
		? coveredBaseScale + visibleReactiveBoost
		: resolvedScale;
	const clampScale = coverageActive ? coveredBaseScale : effectiveScale;
	const drawnWidth = base.width * effectiveScale;
	const drawnHeight = base.height * effectiveScale;
	const clampDrawnWidth = base.width * clampScale;
	const clampDrawnHeight = base.height * clampScale;

	// Composition extents at the clamp scale (no reactive boost), built from
	// the symmetric mirror-fill composition at the resolved depth. Used to
	// compute coverage bounds + the conservative focus offset for clamping
	// the stored position. The clamp union is pure geometry; focus is
	// applied as a composition-level offset OUTSIDE the union.
	const clampUnion = getCompositeUnion({
		width: clampDrawnWidth,
		height: clampDrawnHeight,
		rotation,
		count: sanitizedMirrorFillDepth,
		invert: mirrorFillInvert
	});
	const clampFocusOffset = getFocusOffset(
		clampUnion,
		rotation,
		focusX,
		focusY
	);
	const bounds = coverageActive
		? getCoverageBoundsFromUnion(safeViewportWidth, safeViewportHeight, {
				minX: clampUnion.minX - clampFocusOffset.x,
				maxX: clampUnion.maxX - clampFocusOffset.x,
				minY: clampUnion.minY - clampFocusOffset.y,
				maxY: clampUnion.maxY - clampFocusOffset.y
			})
		: getCompositionFreeBounds(
				safeViewportWidth,
				safeViewportHeight,
				clampUnion,
				freeBound
			);
	const effectivePositionX = clamp(
		resolvedPositionX,
		bounds.minX,
		bounds.maxX
	);
	const effectivePositionY = clamp(
		resolvedPositionY,
		bounds.minY,
		bounds.maxY
	);
	if (
		coverageActive &&
		(effectivePositionX !== resolvedPositionX ||
			effectivePositionY !== resolvedPositionY)
	) {
		warnings.push('position-clamped-for-coverage');
	}
	if (coverageActive && authoredBaseScale < minScaleForCoverage) {
		warnings.push('scale-raised-for-coverage');
	}

	// Composition extents at the actual drawn scale (with reactive boost),
	// built from the symmetric mirror-fill composition at the resolved depth.
	// Used for the final pixel-space clamp (parallax + bass-grown image gets
	// more room). Focus offset scales with composition so the focus point
	// stays anchored on screen as the image breathes.
	const renderedUnion = getCompositeUnion({
		width: drawnWidth,
		height: drawnHeight,
		rotation,
		count: sanitizedMirrorFillDepth,
		invert: mirrorFillInvert
	});
	const compositionWidth = renderedUnion.maxX - renderedUnion.minX;
	const compositionHeight = renderedUnion.maxY - renderedUnion.minY;
	const focusOffset = getFocusOffset(renderedUnion, rotation, focusX, focusY);

	const targetX =
		safeViewportWidth / 2 + effectivePositionX * safeViewportWidth * 0.5;
	const targetY =
		safeViewportHeight / 2 - effectivePositionY * safeViewportHeight * 0.5;
	let rawCenterX = targetX - focusOffset.x + parallaxX;
	let rawCenterY = targetY - focusOffset.y + parallaxY;
	// Keep Covered: the composition (whose extents in pixel space are
	// centerX+union.minX..centerX+union.maxX, regardless of focus) must always
	// reach both viewport edges. centerX already absorbed the focus offset, so
	// the clamp is in pure pixel space against the geometric union.
	if (coverageActive) {
		const minCenterX = safeViewportWidth - renderedUnion.maxX;
		const maxCenterX = -renderedUnion.minX;
		const minCenterY = safeViewportHeight - renderedUnion.maxY;
		const maxCenterY = -renderedUnion.minY;
		rawCenterX = clamp(
			rawCenterX,
			Math.min(minCenterX, maxCenterX),
			Math.max(minCenterX, maxCenterX)
		);
		rawCenterY = clamp(
			rawCenterY,
			Math.min(minCenterY, maxCenterY),
			Math.max(minCenterY, maxCenterY)
		);
	}
	const centerX =
		mirrorFill && sanitizedMirrorFillDepth > 0
			? Math.round(rawCenterX)
			: rawCenterX;
	const centerY =
		mirrorFill && sanitizedMirrorFillDepth > 0
			? Math.round(rawCenterY)
			: rawCenterY;
	// Snap width/height to even integers when mirror fill is on so adjacent
	// tile edges land on the same integer pixel grid and the AA hairline at
	// the seam disappears.
	const rectWidth =
		mirrorFill && sanitizedMirrorFillDepth > 0
			? 2 * Math.round(drawnWidth / 2)
			: drawnWidth;
	const rectHeight =
		mirrorFill && sanitizedMirrorFillDepth > 0
			? 2 * Math.round(drawnHeight / 2)
			: drawnHeight;
	const primary: ImageDrawRect = {
		cx: centerX,
		cy: centerY,
		width: rectWidth,
		height: rectHeight,
		rotation,
		mirror,
		kind: 'primary'
	};
	const drawRects = [primary];
	if (mirrorFill && sanitizedMirrorFillDepth > 0) {
		pushMirrorFillRects(
			drawRects,
			primary,
			sanitizedMirrorFillDepth,
			mirrorFillInvert
		);
	}

	return {
		drawRects,
		effectiveScale,
		effectivePositionX,
		effectivePositionY,
		effectiveRotation: rotation,
		minScaleForCoverage,
		bounds,
		warnings,
		baseWidth: base.width,
		baseHeight: base.height,
		centerX,
		centerY,
		compositionMinX: renderedUnion.minX,
		compositionMaxX: renderedUnion.maxX,
		compositionMinY: renderedUnion.minY,
		compositionMaxY: renderedUnion.maxY,
		compositionWidth,
		compositionHeight
	};
}
