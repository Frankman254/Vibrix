import { LOGO_RANGES } from '@/config/ranges';

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
 * ellipse is a bounding approximation of the shaped ring anyway.
 */
export function spectrumAnnulusInImageSpace(params: {
	spectrumPositionX: number;
	spectrumPositionY: number;
	innerRadius: number;
	maxHeight: number;
	viewportWidth: number;
	viewportHeight: number;
	/** primary draw rect in canvas px (resolveImageTransform) */
	imageRect: { cx: number; cy: number; width: number; height: number };
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
	return {
		center: {
			x: (sx - left) / params.imageRect.width,
			y: (sy - top) / params.imageRect.height
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
