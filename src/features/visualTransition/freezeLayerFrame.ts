import { drawCinematicTransition } from '@/features/background/render';
import type { LinkedImageTransition } from '@/types/wallpaper';
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
	composite?: HTMLCanvasElement;
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

/** Applies the same pixel transition as the image to the two layer frames. */
export function applyLinkedImageTransition(
	frame: FrozenLayerFrame,
	settings: LinkedImageTransition,
	progress: number,
	intensity: number
) {
	if (!frame.composite) {
		frame.composite = document.createElement('canvas');
		frame.composite.style.cssText = frame.frozen.style.cssText;
		frame.composite.setAttribute('aria-hidden', 'true');
		frame.frozen.parentElement?.appendChild(frame.composite);
	}
	const output = frame.composite;
	const width = frame.live.width,
		height = frame.live.height;
	if (output.width !== width) output.width = width;
	if (output.height !== height) output.height = height;
	const ctx = output.getContext('2d');
	if (!ctx) {
		applyCrossfade(frame, progress);
		return;
	}
	ctx.clearRect(0, 0, width, height);
	drawCinematicTransition({
		ctx,
		width,
		height,
		type: settings.transitionType,
		progress,
		intensity,
		opacity: 1,
		drawFrom: target => target.drawImage(frame.frozen, 0, 0, width, height),
		drawTo: target => target.drawImage(frame.live, 0, 0)
	});
	frame.live.style.opacity = '0';
	frame.frozen.style.opacity = '0';
}

export function releaseFrozenFrame(frame: FrozenLayerFrame | null) {
	if (!frame) return;
	frame.live.style.opacity = '';
	if (frame.composite) {
		frame.composite.remove();
		frame.composite.width = 0;
		frame.composite.height = 0;
	}
	frame.frozen.remove();
	// Drop the backing store right away instead of waiting for the GC.
	frame.frozen.width = 0;
	frame.frozen.height = 0;
}
