/**
 * DOM side of the real crossfade: copies a layer's current frame into a plain
 * 2D canvas laid over the live one, so the old look can be faded out while the
 * new one fades in.
 *
 * The copy MUST be taken synchronously, the moment the transition snapshot is
 * published — the store patch has already landed but no rAF has run yet, so the
 * canvas still holds the outgoing frame. One frame later it is gone.
 *
 * WebGL layers need `preserveDrawingBuffer: true` on their context, otherwise
 * the drawing buffer is already cleared by the time we read it and the freeze
 * silently copies nothing. `SceneLayerCanvas` sets it for exactly this reason.
 */
import {
	canFreezeFrame,
	crossfadeOpacities
} from '@/features/visualTransition/visualTransitionCrossfade';

export type FrozenLayerFrame = {
	/** The live canvas, whose opacity carries the incoming look. */
	live: HTMLCanvasElement;
	/** The frozen copy of the outgoing look, on top of it. */
	frozen: HTMLCanvasElement;
};

export function freezeLayerFrame(
	wrapper: HTMLElement | null
): FrozenLayerFrame | null {
	if (!wrapper) return null;
	const live = wrapper.querySelector('canvas');
	if (!(live instanceof HTMLCanvasElement)) return null;
	if (!canFreezeFrame(live.width, live.height)) return null;
	const frozen = document.createElement('canvas');
	frozen.width = live.width;
	frozen.height = live.height;
	const ctx = frozen.getContext('2d');
	if (!ctx) return null;
	try {
		ctx.drawImage(live, 0, 0);
	} catch {
		// A tainted or zero-sized source throws instead of returning null.
		return null;
	}
	frozen.dataset.visualTransitionFreeze = 'true';
	frozen.setAttribute('aria-hidden', 'true');
	// Mirrors how both faded layers style their own canvas, so the copy lands
	// exactly on top of the original.
	frozen.style.position = 'absolute';
	frozen.style.inset = '0';
	frozen.style.width = '100%';
	frozen.style.height = '100%';
	frozen.style.pointerEvents = 'none';
	wrapper.appendChild(frozen);
	return { live, frozen };
}

export function applyCrossfade(frame: FrozenLayerFrame, progress: number) {
	const { incoming, outgoing } = crossfadeOpacities(progress);
	frame.live.style.opacity = String(incoming);
	frame.frozen.style.opacity = String(outgoing);
}

export function releaseFrozenFrame(frame: FrozenLayerFrame | null) {
	if (!frame) return;
	frame.live.style.opacity = '';
	frame.frozen.remove();
	// Drop the backing store right away instead of waiting for the GC.
	frame.frozen.width = 0;
	frame.frozen.height = 0;
}
