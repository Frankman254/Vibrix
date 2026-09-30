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
 *
 * ## The rule for effects that paint through a scratch canvas
 *
 * Several spectrum effects paint into an intermediate canvas the size of the
 * whole frame — retro pixelate, the oscilloscope phosphor, the liquid per-layer
 * pixelate, the afterglow feedback buffer, the ghost/trail history, the
 * mode-transition snapshot — and blit it back. That tile has a border of its
 * own, so it has to follow one rule:
 *
 * - the tile is PAINTED in the same camera space as its output
 *   (`paintIntoCameraTile`), or it already holds frame-space pixels because it
 *   was captured from the canvas;
 * - the tile is BLITTED with the camera space cancelled (`blitInFrameSpace`).
 *
 * Break it and the tile is moved twice: its straight bitmap edge crosses into
 * the picture and the figure is cut along it — exactly the «límites del canvas»
 * the draw-offset model exists to remove, and the reason a scratch canvas must
 * never be blitted through a camera transform.
 *
 * The same applies to a fill that is supposed to cover the whole frame rather
 * than the figure — the Looks stack's film grain and scanlines — because a
 * camera-space fill of exactly frame size leaves an uncovered band on the side
 * it came from.
 *
 * `mirrorCameraDrawSpace` / `unapplyCameraDrawSpace` are the primitives behind
 * the two helpers, for effects that paint incrementally and cannot hand a
 * callback. In dev, `beginCameraDrawSpace` installs a tripwire that warns the
 * first time a frame-sized canvas is blitted through a camera transform, so
 * breaking the rule is noisy instead of silent.
 */
import type { CameraMotionLayer } from './stageFxConfig';

/** Translation in CSS pixels, as the camera resolved it for this layer. */
export type CameraDrawOffset = { tx: number; ty: number };

const offsets = new Map<CameraMotionLayer, CameraDrawOffset>();

/**
 * The camera transform as a drawing context carries it.
 *
 * `scale` is the edge-cover zoom about the frame centre. The live preview keeps
 * the zoom on the element (CSS) and only translates the drawing, so it passes
 * `scale: 1`; the video export has no element and bakes both into the output
 * context. One shape covers both, which is what lets the tile helpers below be
 * written once for the preview and the export.
 */
export type CameraDrawSpace = {
	tx: number;
	ty: number;
	scale: number;
	/** Frame size in the same pixels — the zoom's origin. */
	width: number;
	height: number;
};

const appliedSpaces = new WeakMap<CanvasRenderingContext2D, CameraDrawSpace>();

function isNeutralSpace(space: CameraDrawSpace): boolean {
	return space.tx === 0 && space.ty === 0 && space.scale === 1;
}

/** The same matrix the export composes: translate, then zoom about the centre. */
function applyCameraDrawSpace(
	ctx: CanvasRenderingContext2D,
	space: CameraDrawSpace
): void {
	if (space.scale === 1) {
		// The live preview's case, run every frame: one call, no centre maths.
		ctx.translate(space.tx, space.ty);
		return;
	}
	const cx = space.width / 2;
	const cy = space.height / 2;
	ctx.translate(cx + space.tx, cy + space.ty);
	ctx.scale(space.scale, space.scale);
	ctx.translate(-cx, -cy);
}

/**
 * Push this camera space on `ctx` and remember it there.
 *
 * Remembering is the point: an effect that paints through an intermediate
 * full-viewport canvas (pixelate, phosphor, afterglow, the ghost/trail history)
 * needs to know how far its own context has been moved, because that tile's
 * bitmap border is exactly the border the user must never see.
 *
 * Returns whether a transform was pushed — the caller ends only then, so a
 * layer with no motion pays nothing.
 */
export function beginCameraDrawSpace(
	ctx: CanvasRenderingContext2D,
	space: CameraDrawSpace
): boolean {
	if (isNeutralSpace(space)) return false;
	ctx.save();
	applyCameraDrawSpace(ctx, space);
	appliedSpaces.set(ctx, space);
	if (import.meta.env?.DEV) guardFrameTileBlits(ctx);
	return true;
}

/** Undo `beginCameraDrawSpace`: forget the space, then restore the transform. */
export function endCameraDrawSpace(ctx: CanvasRenderingContext2D): void {
	appliedSpaces.delete(ctx);
	mirroredTiles.delete(ctx);
	ctx.restore();
}

/** The camera space currently baked into this context, if any. */
export function readCameraDrawSpace(
	ctx: CanvasRenderingContext2D
): CameraDrawSpace | null {
	return appliedSpaces.get(ctx) ?? null;
}

/**
 * Give an intermediate canvas the same camera space as the context it will be
 * blitted onto, so the effect paints the MOVED figure inside the tile.
 *
 * Both canvases are the size of the same frame in the same pixels (every
 * scratch here is created from `canvas.width/height`), so the space transfers
 * as-is.
 */
export function mirrorCameraDrawSpace(
	target: CanvasRenderingContext2D,
	source: CanvasRenderingContext2D
): boolean {
	const space = appliedSpaces.get(source);
	if (!space) return false;
	const mirrored = beginCameraDrawSpace(target, space);
	if (mirrored) mirroredTiles.add(target);
	return mirrored;
}

/**
 * Cancel the camera space on an already-saved context so the next draw lands in
 * SCREEN space.
 *
 * This is how a full-viewport tile is composited: its pixels are already in
 * screen space (the figure inside it moved, or it was captured from the canvas),
 * so drawing it through the camera transform would move it a second time and
 * slide its straight bitmap edge into the frame — «se ven los límites del
 * canvas». Must run inside a `save()`/`restore()` the caller owns.
 */
export function unapplyCameraDrawSpace(ctx: CanvasRenderingContext2D): boolean {
	const space = appliedSpaces.get(ctx);
	if (!space) return false;
	if (space.scale === 1) {
		ctx.translate(-space.tx, -space.ty);
		return true;
	}
	const cx = space.width / 2;
	const cy = space.height / 2;
	ctx.translate(cx, cy);
	ctx.scale(1 / space.scale, 1 / space.scale);
	ctx.translate(-cx - space.tx, -cy - space.ty);
	return true;
}

/**
 * Paint a full-frame scratch tile in the same camera space as the context it
 * will be blitted onto.
 *
 * This is the first half of the tile rule, and it is a function rather than a
 * comment so no effect can do only half of it: whatever `paint` draws lands at
 * the same place inside the tile as it would have landed on the output, so the
 * tile can then be composited without moving anything a second time.
 *
 * Clear the tile OUTSIDE this call: a `clearRect` inside the camera space
 * clears a moved rectangle and leaves the previous frame along one edge.
 */
export function paintIntoCameraTile(
	tileCtx: CanvasRenderingContext2D,
	outputCtx: CanvasRenderingContext2D,
	paint: (ctx: CanvasRenderingContext2D) => void
): void {
	const mirrored = mirrorCameraDrawSpace(tileCtx, outputCtx);
	try {
		paint(tileCtx);
	} finally {
		if (mirrored) endCameraDrawSpace(tileCtx);
	}
}

/**
 * Composite pixels that are already in frame space — a full-frame tile, or a
 * fill that must cover the real frame such as film grain or scanlines.
 *
 * The second half of the tile rule. Inside `blit` the camera is cancelled, so a
 * draw at (0, 0) lands on the frame's own origin and the tile's straight bitmap
 * edge stays on the frame's edge instead of sliding into the picture. The
 * context is saved around the call, so the caller's alpha, filter and composite
 * mode survive it.
 */
export function blitInFrameSpace(
	ctx: CanvasRenderingContext2D,
	blit: (ctx: CanvasRenderingContext2D) => void
): void {
	ctx.save();
	const cancelled = unapplyCameraDrawSpace(ctx);
	if (cancelled) cancelledDepth.set(ctx, (cancelledDepth.get(ctx) ?? 0) + 1);
	try {
		blit(ctx);
	} finally {
		if (cancelled) {
			const depth = (cancelledDepth.get(ctx) ?? 1) - 1;
			if (depth > 0) cancelledDepth.set(ctx, depth);
			else cancelledDepth.delete(ctx);
		}
		ctx.restore();
	}
}

/** How many `blitInFrameSpace` calls are open on a context right now. */
const cancelledDepth = new WeakMap<CanvasRenderingContext2D, number>();

const guardedContexts = new WeakSet<CanvasRenderingContext2D>();

/** Contexts whose camera space was mirrored from an output: scratch tiles. */
const mirroredTiles = new WeakSet<CanvasRenderingContext2D>();

/**
 * Dev-only tripwire for the tile rule.
 *
 * Every regression of this bug looks the same from the outside — a straight
 * edge crossing the picture — and the same from the inside: a frame-sized
 * canvas blitted while a camera space is still applied. So instead of trusting
 * the next author to read the rule, the registry watches for it: in dev, a
 * context that takes a camera space gets its `drawImage` wrapped once and warns
 * the first time a frame-sized source goes through the camera transform.
 *
 * Painting is untouched (the original call always runs), and production never
 * installs the wrapper.
 */
function guardFrameTileBlits(ctx: CanvasRenderingContext2D): void {
	if (guardedContexts.has(ctx)) return;
	guardedContexts.add(ctx);
	guardFrameTileFills(ctx);
	const original = ctx.drawImage;
	if (typeof original !== 'function') return;
	let warned = false;
	ctx.drawImage = function patchedDrawImage(
		this: CanvasRenderingContext2D,
		...args: Parameters<CanvasRenderingContext2D['drawImage']>
	) {
		const space = appliedSpaces.get(ctx);
		const source = args[0] as { width?: number; height?: number };
		if (
			!warned &&
			space !== undefined &&
			(cancelledDepth.get(ctx) ?? 0) === 0 &&
			source?.width === space.width &&
			source?.height === space.height
		) {
			warned = true;
			console.warn(
				'[cameraDrawOffset] a frame-sized canvas was blitted through the camera transform: its bitmap edge will cross the picture. Wrap the composite in blitInFrameSpace().'
			);
		}
		return (original as CanvasRenderingContext2D['drawImage']).apply(
			this,
			args
		);
	} as CanvasRenderingContext2D['drawImage'];
}

/**
 * The other half of the tripwire: a tile's own MAINTENANCE — the clear, or the
 * phosphor's per-frame decay — painted inside the camera space.
 *
 * It fails differently from a bad blit and is easier to miss: the rectangle is
 * translated with everything else, so a strip as wide as the camera offset is
 * never cleared. Whatever was there stays at full brightness and the
 * rectangle's own border shows up in the picture as a straight line that
 * breathes with the movement. Only scratch tiles are watched: a full-frame fill
 * on the OUTPUT inside the camera space is legitimate (film grain, scanlines,
 * the energy bloom), which is why `blitInFrameSpace` exists for the ones that
 * must cover the real frame.
 */
function guardFrameTileFills(ctx: CanvasRenderingContext2D): void {
	let warned = false;
	const watch = (name: 'fillRect' | 'clearRect') => {
		const original = ctx[name];
		if (typeof original !== 'function') return;
		ctx[name] = function patchedRect(
			this: CanvasRenderingContext2D,
			x: number,
			y: number,
			width: number,
			height: number
		) {
			const space = appliedSpaces.get(ctx);
			if (
				!warned &&
				space !== undefined &&
				mirroredTiles.has(ctx) &&
				(cancelledDepth.get(ctx) ?? 0) === 0 &&
				x <= 0 &&
				y <= 0 &&
				width >= space.width &&
				height >= space.height
			) {
				warned = true;
				console.warn(
					`[cameraDrawOffset] ${name} covered a whole scratch tile inside the camera transform: the rectangle moves too, so a strip as wide as the camera offset is never cleared. Do the clear or decay BEFORE mirroring the space.`
				);
			}
			return (original as CanvasRenderingContext2D['fillRect']).call(
				this,
				x,
				y,
				width,
				height
			);
		} as CanvasRenderingContext2D['fillRect'];
	};
	watch('fillRect');
	watch('clearRect');
}

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
 * Push this layer's camera offset onto `ctx`, converting CSS pixels to the
 * canvas' own backing-store pixels (retina, and the export render scale).
 *
 * End it with `endCameraDrawOffset`, not a bare `ctx.restore()`: the offset is
 * remembered on the context so the tile helpers above can find it.
 *
 * Returns whether a transform was pushed: the caller ends only then, so a layer
 * with no motion pays nothing.
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
	return beginCameraDrawSpace(ctx, {
		tx: offset.tx * backingRatio,
		ty: offset.ty * backingRatio,
		// The live preview keeps the zoom on the element; only the drawing moves.
		scale: 1,
		width: canvas.width,
		height: canvas.height
	});
}

/** Pair of `beginCameraDrawOffset`, for when it returned `true`. */
export function endCameraDrawOffset(ctx: CanvasRenderingContext2D): void {
	endCameraDrawSpace(ctx);
}
