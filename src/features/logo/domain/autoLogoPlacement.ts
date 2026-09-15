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
