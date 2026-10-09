/**
 * "The mark follows the picture", without the store.
 *
 * The switch does not make the renderer read the mark — it moves the LOGO's
 * base position, once, whenever the active image changes. That makes it a side
 * effect of selecting an image, and side effects are exactly what the offline
 * export has to replicate by hand: `setActiveImageId` applies the scene patch,
 * refits Keep Covered and then re-applies the mark, and a render that only
 * replicates the first two restores the logo slot's stored position and leaves
 * the logo wherever that slot parked it — on the face the mark exists to avoid.
 *
 * So the mapping lives here, pure, and both callers use it: the store action
 * and `prepareSlideshowSegments`.
 */
import { resolveImageTransform } from '@/features/background';
import { imagePointToLogoPosition } from '@/features/logo';
import type { BackgroundImageItem, WallpaperState } from '@/types/wallpaper';

/** The responsive-layout keys `resolveImageTransform` reads. */
export type LogoFocusLayout = Pick<
	WallpaperState,
	| 'layoutResponsiveEnabled'
	| 'layoutBackgroundReframeEnabled'
	| 'layoutReferenceWidth'
	| 'layoutReferenceHeight'
>;

/**
 * Where the logo goes for one image, or null when that image has no mark.
 *
 * The stored point is in IMAGE space, so it has to travel through the image's
 * own draw rect: the same point means a different place on screen once the
 * picture is zoomed, panned, mirrored or turned.
 */
export function resolveImageLogoPosition(params: {
	image: BackgroundImageItem;
	imageSize: { width: number; height: number };
	viewport: { width: number; height: number };
	layout: LogoFocusLayout;
}): { x: number; y: number } | null {
	const { image, imageSize, viewport, layout } = params;
	const { logoFocusX: x, logoFocusY: y } = image;
	if (typeof x !== 'number' || typeof y !== 'number') return null;
	const primary = resolveImageTransform({
		viewportWidth: viewport.width,
		viewportHeight: viewport.height,
		imageWidth: imageSize.width,
		imageHeight: imageSize.height,
		fitMode: image.fitMode,
		scale: image.scale,
		positionX: image.positionX,
		positionY: image.positionY,
		rotation: image.rotation,
		mirror: image.mirror,
		// Same rect the renderer draws: manual framing means no coverage raise,
		// and a mark mapped through a rect nobody draws lands next to the thing
		// it was pointing at.
		keepCovered: !image.framingManual,
		focusX: image.focusX,
		focusY: image.focusY,
		mirrorFill: image.mirrorFill,
		mirrorFillInvert: image.mirrorFillInvert,
		mirrorFillCount: image.mirrorFillCount,
		layout
	}).drawRects[0];
	if (!primary) return null;
	return imagePointToLogoPosition({
		point: { x, y },
		imageRect: primary,
		viewportWidth: viewport.width,
		viewportHeight: viewport.height
	});
}
