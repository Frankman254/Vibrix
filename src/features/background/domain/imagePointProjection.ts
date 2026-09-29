/**
 * Where a point that describes the PICTURE lands on screen, and back.
 *
 * The per-image annotations (the face, and where a mark can sit) are stored in
 * image space — `0..1` of the picture itself — while the preview and the
 * renderer draw that picture through a rect that may be scaled, rotated and
 * mirrored. These two functions are that rect's forward and inverse mapping, so
 * a dot sits on the pixels it describes and a click lands on the pixel it hit.
 */

/** The two per-image annotations the preview can show and place. */
export type ImageFocusPointKind = 'face' | 'logo';

/** The part of a draw rect the mapping needs. */
export type ImagePointRect = {
	cx: number;
	cy: number;
	width: number;
	height: number;
	rotation: number;
	mirror: boolean;
	/** Optional: the mirror-fill clones are the only rects that flip on Y. */
	mirrorY?: boolean;
};

/**
 * Where an image-space point (`0..1` of the picture) lands on the preview.
 *
 * It goes through the SAME rect the preview draws, mirror and rotation
 * included, so the dot sits on the pixels it describes instead of on a
 * plausible-looking guess.
 */
export function projectImagePoint(
	rect: ImagePointRect,
	x: number,
	y: number
): { left: number; top: number } {
	const u = rect.mirror ? 1 - x : x;
	const v = rect.mirrorY ? 1 - y : y;
	const localX = (u - 0.5) * rect.width;
	const localY = (v - 0.5) * rect.height;
	const radians = (rect.rotation * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return {
		left: rect.cx + localX * cos - localY * sin,
		top: rect.cy + localX * sin + localY * cos
	};
}

/** The inverse of `projectImagePoint`: a click on the preview as image space. */
export function unprojectImagePoint(
	rect: ImagePointRect,
	left: number,
	top: number
): { x: number; y: number } {
	const radians = (rect.rotation * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const dx = left - rect.cx;
	const dy = top - rect.cy;
	const localX = dx * cos + dy * sin;
	const localY = -dx * sin + dy * cos;
	const u = localX / Math.max(1, rect.width) + 0.5;
	const v = localY / Math.max(1, rect.height) + 0.5;
	const clamp = (value: number) => Math.min(1, Math.max(0, value));
	return {
		x: clamp(rect.mirror ? 1 - u : u),
		y: clamp(rect.mirrorY ? 1 - v : v)
	};
}
