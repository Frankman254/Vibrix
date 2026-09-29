import { LOGO_RANGES } from '@/config/ranges';
import {
	projectImagePoint,
	type ImagePointRect
} from '@/features/background/domain/imagePointProjection';

/**
 * Pure mapping from a saliency low-mass box (0..1 image space, y down — see
 * `@/lib/saliency`) to the logo's normalized position. The renderer places the
 * logo center at `x = w/2 + posX·w/2`, `y = h/2 − posY·h/2` (y+ = up, see
 * `ReactiveLogo`), so the box center maps straight onto the position axes with
 * the y sign flipped. Result is clamped to the same range the Logo sliders use,
 * so an edge-corner box never lands the logo off-screen.
 */
export function lowMassBoxToLogoPosition(box: {
	x: number;
	y: number;
	width: number;
	height: number;
}): { x: number; y: number } {
	const clamp = (value: number) =>
		Math.min(
			LOGO_RANGES.positionX.max,
			Math.max(LOGO_RANGES.positionX.min, value)
		);
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	return { x: clamp((cx - 0.5) * 2), y: clamp((0.5 - cy) * 2) };
}

/**
 * The logo's footprint in 0..1 canvas space, derived from the same proxy
 * viewport the background auto-fit uses. `logoBaseSize` is the undriven draw
 * size in px; the audio scale modulates around it and is not guessed here.
 */
export function logoBoxSizeForViewport(
	logoBaseSizePx: number,
	viewportWidth: number,
	viewportHeight: number
): { width: number; height: number } {
	const clamp01 = (value: number) => Math.max(0.01, Math.min(1, value));
	return {
		width: clamp01(logoBaseSizePx / Math.max(1, viewportWidth)),
		height: clamp01(logoBaseSizePx / Math.max(1, viewportHeight))
	};
}

/**
 * The radial spectrum figure (ring contour + spike tips) as an exclusion
 * region in 0..1 image space, for `bestPlacementBox`.
 *
 * The renderer draws it at canvas px around
 * `cx = w/2 + posX·w/2, cy = h/2 − posY·h/2` with radii
 * `[innerRadius, innerRadius + maxHeight]` (post-`spectrumScale`, and
 * post-Follow-Logo when that is effective — callers pass the resolved
 * placement). Mapping canvas px into image space goes through the primary
 * draw rect from `resolveImageTransform`, which already accounts for
 * fit/crop/scale/position/focus. Rotation is ignored: it is rare, and the
 * ellipse is a bounding approximation of the shaped ring anyway; mirroring is
 * NOT, because a flipped picture puts the whole subject on the other side and
 * an exclusion zone on the wrong half is worse than none.
 */
export function spectrumAnnulusInImageSpace(params: {
	spectrumPositionX: number;
	spectrumPositionY: number;
	innerRadius: number;
	maxHeight: number;
	viewportWidth: number;
	viewportHeight: number;
	/** primary draw rect in canvas px (resolveImageTransform) */
	imageRect: {
		cx: number;
		cy: number;
		width: number;
		height: number;
		mirror?: boolean;
		mirrorY?: boolean;
	};
}): {
	center: { x: number; y: number };
	innerRadii: { x: number; y: number };
	outerRadii: { x: number; y: number };
} | null {
	if (params.imageRect.width <= 0 || params.imageRect.height <= 0)
		return null;
	const sx =
		params.viewportWidth / 2 +
		params.spectrumPositionX * params.viewportWidth * 0.5;
	const sy =
		params.viewportHeight / 2 -
		params.spectrumPositionY * params.viewportHeight * 0.5;
	const left = params.imageRect.cx - params.imageRect.width / 2;
	const top = params.imageRect.cy - params.imageRect.height / 2;
	const inner = Math.max(0, params.innerRadius);
	const outer = Math.max(
		inner,
		params.innerRadius + Math.max(0, params.maxHeight)
	);
	// A mirrored rect draws image space backwards, so the screen point maps to
	// the opposite fraction of the picture. The flips are applied here instead
	// of through `unprojectImagePoint` because this centre is allowed to fall
	// outside `0..1` (the ring can sit off the picture) and that helper clamps.
	const rawX = (sx - left) / params.imageRect.width;
	const rawY = (sy - top) / params.imageRect.height;
	return {
		center: {
			x: params.imageRect.mirror ? 1 - rawX : rawX,
			y: params.imageRect.mirrorY ? 1 - rawY : rawY
		},
		innerRadii: {
			x: inner / params.imageRect.width,
			y: inner / params.imageRect.height
		},
		outerRadii: {
			x: outer / params.imageRect.width,
			y: outer / params.imageRect.height
		}
	};
}

/**
 * A point on the IMAGE turned into a logo position.
 *
 * The inverse of `spectrumAnnulusInImageSpace`: a stored per-image logo focus
 * lives in image space (0..1 over the picture), so it has to be pushed through
 * the image's own draw rect before it means anything on screen. That is what
 * makes "the logo goes where THIS image can spare the room" survive a zoom, a
 * pan or a different aspect ratio.
 *
 * The result is clamped to the logo's position range, so a focus point on an
 * off-screen part of the image still yields a usable placement.
 */
export function imagePointToLogoPosition(params: {
	point: { x: number; y: number };
	/** Primary draw rect in canvas px, from `resolveImageTransform`. */
	imageRect: ImagePointRect;
	viewportWidth: number;
	viewportHeight: number;
}): { x: number; y: number } {
	const { point, imageRect, viewportWidth, viewportHeight } = params;
	if (
		!(
			imageRect.width > 0 &&
			imageRect.height > 0 &&
			viewportWidth > 0 &&
			viewportHeight > 0
		)
	) {
		return { x: 0, y: 0 };
	}
	// The SAME mapping the preview's dot uses, mirror and rotation included: a
	// flipped or turned picture moves the spot the mark describes, so mapping
	// the rect as if it were upright lands the logo on the subject's face.
	const { left: sx, top: sy } = projectImagePoint(
		imageRect,
		point.x,
		point.y
	);
	const clamp = (value: number) =>
		Math.min(
			LOGO_RANGES.positionX.max,
			Math.max(LOGO_RANGES.positionX.min, value)
		);
	return {
		x: clamp((sx / viewportWidth - 0.5) * 2),
		y: clamp((0.5 - sy / viewportHeight) * 2)
	};
}
