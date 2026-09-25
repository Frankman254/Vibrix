/**
 * The arithmetic and the guards of the real crossfade, kept pure so they can be
 * unit-tested (the test runner has no DOM).
 *
 * FASE 0 faded the incoming layer from 0 → 1 while the store already held the
 * new values, so the old look was never cross-faded — it was simply gone on the
 * first frame and grew back. A real crossfade needs both looks on screen at
 * once; rendering two live spectrums is far too expensive, so we freeze the
 * outgoing frame into a plain 2D canvas and fade that out against the live
 * layer fading in. See `freezeLayerFrame` for the DOM side.
 */

/**
 * Upper bound for a frozen frame's backing store (3840×2160). A full-screen
 * layer on a 5K display with dpr 2 would otherwise allocate a canvas of tens of
 * megabytes for half a second; above this we skip the freeze and fall back to
 * the plain fade instead of hitching the machine mid-transition.
 */
export const FREEZE_MAX_PIXELS = 3840 * 2160;

/** A frame is worth freezing only if it has pixels and is not absurdly large. */
export function canFreezeFrame(width: number, height: number): boolean {
	if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
	if (width <= 0 || height <= 0) return false;
	return width * height <= FREEZE_MAX_PIXELS;
}

export type CrossfadeOpacities = {
	/** The live layer, carrying the new look. */
	incoming: number;
	/** The frozen frame of the old look, painted above it. */
	outgoing: number;
};

/**
 * Complementary opacities. These layers draw over the background with additive
 * glow, so a straight cross dissolve reads correctly; holding the old frame at
 * 1 until the end would instead pop it away on the last frame.
 */
export function crossfadeOpacities(progress: number): CrossfadeOpacities {
	const p = Number.isFinite(progress)
		? Math.max(0, Math.min(1, progress))
		: 1;
	return { incoming: p, outgoing: 1 - p };
}
