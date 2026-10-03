/**
 * The tile rule for the offline renderer.
 *
 * Several subsystems paint into a scratch canvas the size of the whole frame
 * and then composite it onto the output in one `drawImage`. Offline that output
 * carries the layer's Camera Motion transform (`renderFrameAt` pushes it with
 * `beginCameraDrawSpace`), so blitting the tile at (0, 0) moves the tile's
 * BITMAP instead of the figure inside it: whatever the figure had outside the
 * frame was already clipped away at the tile's border, and after the move that
 * border lands inside the picture as a straight cut — the artefact the user
 * reported at the top and right of an exported video while the live viewport,
 * which offsets the drawing inside a fixed canvas, looked correct.
 *
 * So the tile is painted in the SAME camera space as the output and composited
 * with that space cancelled: the figure moves, the tile does not. The clear
 * happens outside the space on purpose — a `clearRect` through the camera
 * clears a moved rectangle and leaves the previous frame along one edge.
 */
import {
	blitInFrameSpace,
	clearCameraTile,
	paintIntoCameraTile
} from '@/features/stageFx/render';

export type FrameTileSize = { width: number; height: number };

/**
 * Paint `tile` for this frame and composite it onto `target`.
 *
 * `paint` returning `false` means the tile has nothing worth compositing (a
 * stage-lights frame that drew nothing), and then no blit happens at all.
 */
export function drawFrameTile(
	target: CanvasRenderingContext2D,
	tile: CanvasRenderingContext2D,
	size: FrameTileSize,
	paint: (ctx: CanvasRenderingContext2D) => boolean | void,
	composite?: (canvas: HTMLCanvasElement) => HTMLCanvasElement
): void {
	clearCameraTile(tile, size.width, size.height);
	let drawn = true;
	paintIntoCameraTile(tile, target, ctx => {
		drawn = paint(ctx) !== false;
	});
	if (!drawn) return;
	const rendered = composite ? composite(tile.canvas) : tile.canvas;
	blitInFrameSpace(target, frame => frame.drawImage(rendered, 0, 0));
}
