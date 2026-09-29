/**
 * Camera Motion applied to the DRAWING instead of to the canvas element.
 *
 * A subsystem canvas is the size of the viewport. Translating that element
 * slides its own bitmap border into the frame, and everything the subsystem
 * painted near the edge is cut along a straight line — «se ve cortado». The
 * zoom that used to hide the border made the figure bigger, which is the thing
 * the user does not want.
 *
 * The video export never had the bug: `renderFrameAt` translates the output
 * context and lets the subsystem paint into the whole frame, so the drawing
 * moves and only the real frame edge clips it. This registry brings the live
 * preview to that same model: `CameraFxStage` publishes the translation per
 * layer, and a canvas that opted in (`data-camera-motion-draw`) translates its
 * context before painting and keeps its element exactly where it is.
 *
 * Layers whose content is a full-canvas FILL (stage lights, flash, particles,
 * the background image) gain nothing from this — moving the fill exposes the
 * same band either way — so they stay on the element transform and on the
 * edge-cover zoom.
 */
import type { CameraMotionLayer } from './stageFxConfig';

/** Translation in CSS pixels, as the camera resolved it for this layer. */
export type CameraDrawOffset = { tx: number; ty: number };

const offsets = new Map<CameraMotionLayer, CameraDrawOffset>();

export function publishCameraDrawOffset(
	layer: CameraMotionLayer,
	offset: CameraDrawOffset | null
): void {
	if (!offset || (offset.tx === 0 && offset.ty === 0)) {
		offsets.delete(layer);
		return;
	}
	offsets.set(layer, offset);
}

export function readCameraDrawOffset(
	layer: CameraMotionLayer
): CameraDrawOffset | null {
	return offsets.get(layer) ?? null;
}

export function clearCameraDrawOffsets(): void {
	offsets.clear();
}

/**
 * Translate `ctx` by this layer's camera offset, converting CSS pixels to the
 * canvas' own backing-store pixels (retina, and the export render scale).
 *
 * Returns whether a transform was pushed: the caller restores only then, so a
 * layer with no motion pays nothing.
 */
export function beginCameraDrawOffset(
	ctx: CanvasRenderingContext2D,
	layer: CameraMotionLayer,
	canvas: HTMLCanvasElement
): boolean {
	const offset = offsets.get(layer);
	if (!offset) return false;
	const cssWidth = canvas.clientWidth;
	const backingRatio = cssWidth > 0 ? canvas.width / cssWidth : 1;
	ctx.save();
	ctx.translate(offset.tx * backingRatio, offset.ty * backingRatio);
	return true;
}
