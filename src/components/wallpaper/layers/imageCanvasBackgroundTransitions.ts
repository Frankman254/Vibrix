import { clamp, lerp } from '@/lib/math';
import { drawRgbShift, seededRandom } from '@/lib/canvas/imageEffects';
import type { BackgroundImageSnapshot } from '@/features/background/imageLayerGeometry';
import {
	getBackgroundDrawRectsFromSnapshot,
	getBackgroundRectFromSnapshot
} from '@/features/background/imageLayerGeometry';
import type {
	BgDrawContext,
	BgTransitionCtx
} from './imageCanvasBackgroundRenderTypes';

let mirrorFillCompositeCanvas: HTMLCanvasElement | null = null;
let mirrorFillCompositeCtx: CanvasRenderingContext2D | null = null;

function getMirrorFillCompositeContext(
	width: number,
	height: number
): CanvasRenderingContext2D | null {
	if (typeof document === 'undefined') return null;
	if (!mirrorFillCompositeCanvas) {
		mirrorFillCompositeCanvas = document.createElement('canvas');
		mirrorFillCompositeCtx = mirrorFillCompositeCanvas.getContext('2d');
	}
	if (!mirrorFillCompositeCtx || !mirrorFillCompositeCanvas) return null;
	if (
		mirrorFillCompositeCanvas.width !== width ||
		mirrorFillCompositeCanvas.height !== height
	) {
		mirrorFillCompositeCanvas.width = width;
		mirrorFillCompositeCanvas.height = height;
	}
	return mirrorFillCompositeCtx;
}

function drawRectImage(
	ctx: CanvasRenderingContext2D,
	sourceImage: HTMLImageElement,
	rect: ReturnType<typeof getBackgroundDrawRectsFromSnapshot>[number]
) {
	ctx.save();
	ctx.translate(rect.cx, rect.cy);
	if (rect.rotation) {
		ctx.rotate((rect.rotation * Math.PI) / 180);
	}
	const scaleX = rect.mirror ? -1 : 1;
	const scaleY = rect.mirrorY ? -1 : 1;
	if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
	ctx.drawImage(
		sourceImage,
		-rect.width / 2,
		-rect.height / 2,
		rect.width,
		rect.height
	);
	ctx.restore();
}

function drawBgImage(
	dc: BgDrawContext,
	sourceImage: HTMLImageElement,
	snapshot: BackgroundImageSnapshot,
	alpha: number,
	transitionOffsetX = 0,
	transitionOffsetY = 0,
	scaleMultiplier = 1,
	blurBoost = 0
): void {
	const rects = getBackgroundDrawRectsFromSnapshot(
		dc.canvasWidth,
		dc.canvasHeight,
		sourceImage,
		{ ...snapshot, scale: snapshot.scale * scaleMultiplier },
		dc.bassBoost,
		dc.parallaxX + transitionOffsetX,
		-dc.parallaxY + transitionOffsetY,
		{
			layoutResponsiveEnabled: dc.layoutResponsiveEnabled,
			layoutBackgroundReframeEnabled: dc.layoutBackgroundReframeEnabled,
			layoutReferenceWidth: dc.layoutReferenceWidth,
			layoutReferenceHeight: dc.layoutReferenceHeight
		}
	);

	const filter =
		blurBoost > 0
			? `${dc.baseFilter} blur(${dc.blur + blurBoost}px)`
			: dc.baseFilter;

	if (snapshot.mirrorFill && rects.length > 1) {
		const compositeCtx = getMirrorFillCompositeContext(
			dc.canvasWidth,
			dc.canvasHeight
		);
		const compositeCanvas = mirrorFillCompositeCanvas;
		if (compositeCtx && compositeCanvas) {
			compositeCtx.save();
			compositeCtx.setTransform(1, 0, 0, 1, 0, 0);
			compositeCtx.clearRect(0, 0, dc.canvasWidth, dc.canvasHeight);
			compositeCtx.globalAlpha = 1;
			compositeCtx.filter = 'none';
			for (const rect of rects) {
				drawRectImage(compositeCtx, sourceImage, rect);
			}
			compositeCtx.restore();

			dc.ctx.save();
			dc.ctx.globalAlpha = clamp(alpha * dc.layerOpacity, 0, 1);
			dc.ctx.filter = filter;
			dc.ctx.drawImage(compositeCanvas, 0, 0);
			dc.ctx.restore();
			return;
		}
	}

	for (const rect of rects) {
		dc.ctx.save();
		dc.ctx.globalAlpha = clamp(alpha * dc.layerOpacity, 0, 1);
		dc.ctx.filter = filter;
		drawRectImage(dc.ctx, sourceImage, rect);
		dc.ctx.restore();
	}
}

let transitionSourceCanvas: HTMLCanvasElement | null = null;
let transitionSourceCtx: CanvasRenderingContext2D | null = null;

function getTransitionSourceContext(
	width: number,
	height: number
): CanvasRenderingContext2D | null {
	if (typeof document === 'undefined') return null;
	if (!transitionSourceCanvas) {
		transitionSourceCanvas = document.createElement('canvas');
		transitionSourceCtx = transitionSourceCanvas.getContext('2d');
	}
	if (!transitionSourceCtx || !transitionSourceCanvas) return null;
	if (
		transitionSourceCanvas.width !== width ||
		transitionSourceCanvas.height !== height
	) {
		transitionSourceCanvas.width = width;
		transitionSourceCanvas.height = height;
	}
	return transitionSourceCtx;
}

/**
 * The incoming image composed once, full canvas, ready to be sampled.
 *
 * The tiled transitions used to redraw the whole image — filters and all —
 * inside every tile's clip: ~190 full-screen draws per frame for Dissolve, each
 * one with a `blur()` on it. That is the lag. Now the image is composed once
 * and each tile copies the pixels it needs.
 */
function renderTransitionSource(
	dc: BgDrawContext,
	sourceImage: HTMLImageElement,
	snapshot: BackgroundImageSnapshot
): HTMLCanvasElement | null {
	const ctx = getTransitionSourceContext(dc.canvasWidth, dc.canvasHeight);
	if (!ctx || !transitionSourceCanvas) return null;
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
	ctx.filter = 'none';
	ctx.clearRect(0, 0, dc.canvasWidth, dc.canvasHeight);
	ctx.restore();
	// Layer opacity is applied when the tiles land on the real canvas, so the
	// source stays at full strength and a tile can still fade in on its own.
	drawBgImage({ ...dc, ctx, layerOpacity: 1 }, sourceImage, snapshot, 1);
	return transitionSourceCanvas;
}

/**
 * One tile of the composed source, displaced by the transition's warp.
 *
 * `offsetX/offsetY` mean what they meant when the tile redrew the image: the
 * content moves by that much, so the pixels come from the opposite side.
 */
function blitTransitionTile(
	dc: BgDrawContext,
	source: HTMLCanvasElement,
	clipX: number,
	clipY: number,
	clipWidth: number,
	clipHeight: number,
	alpha: number,
	offsetX = 0,
	offsetY = 0,
	blurBoost = 0
): void {
	if (clipWidth <= 0 || clipHeight <= 0) return;
	// The base filter already carries `blur(dc.blur)`, and the old code
	// appended a second blur on top of it. Same chain here, applied to the
	// copy instead of to a fresh full-image draw.
	const blurPx = blurBoost > 0 ? dc.blur + blurBoost : 0;
	// Sample beyond the tile so the blur has real neighbours to pull from;
	// blurring a bare tile would leave a visible seam on all four edges.
	const pad = blurPx > 0 ? Math.ceil(blurPx * 3) : 0;
	dc.ctx.save();
	dc.ctx.beginPath();
	dc.ctx.rect(clipX, clipY, clipWidth, clipHeight);
	dc.ctx.clip();
	dc.ctx.globalAlpha = clamp(alpha * dc.layerOpacity, 0, 1);
	dc.ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
	dc.ctx.drawImage(
		source,
		clipX - offsetX - pad,
		clipY - offsetY - pad,
		clipWidth + pad * 2,
		clipHeight + pad * 2,
		clipX - pad,
		clipY - pad,
		clipWidth + pad * 2,
		clipHeight + pad * 2
	);
	dc.ctx.restore();
}

function drawBarsTransition(
	tc: BgTransitionCtx,
	axis: 'horizontal' | 'vertical',
	source: HTMLCanvasElement,
	revealProgress: number
): void {
	const segments = Math.max(
		8,
		Math.floor(
			axis === 'horizontal'
				? 10 + tc.transitionForceNorm * 5
				: 12 + tc.transitionForceNorm * 6
		)
	);
	const bandLength =
		axis === 'horizontal'
			? tc.canvasHeight / segments
			: tc.canvasWidth / segments;

	for (let index = 0; index < segments; index++) {
		const delay = seededRandom(index * 17.3 + 9.1) * 0.48;
		const local = clamp(
			(revealProgress - delay) / Math.max(0.18, 1 - delay),
			0,
			1
		);
		if (local <= 0.001) continue;

		const offsetSeed =
			seededRandom(Math.floor(tc.time * 0.03) * 23.1 + index * 7.7) - 0.5;
		const jitter =
			offsetSeed *
			(axis === 'horizontal' ? tc.canvasWidth : tc.canvasHeight) *
			0.09 *
			tc.transitionForce *
			(1 - local);

		if (axis === 'horizontal') {
			blitTransitionTile(
				tc,
				source,
				0,
				index * bandLength,
				tc.canvasWidth,
				Math.ceil(bandLength + 1),
				local,
				jitter,
				0
			);
		} else {
			blitTransitionTile(
				tc,
				source,
				index * bandLength,
				0,
				Math.ceil(bandLength + 1),
				tc.canvasHeight,
				local,
				0,
				jitter
			);
		}
	}
}

function drawDissolveTransition(
	tc: BgTransitionCtx,
	source: HTMLCanvasElement,
	revealProgress: number
): void {
	const cols = Math.max(10, Math.floor(12 + tc.transitionForceNorm * 5));
	const rows = Math.max(6, Math.floor(7 + tc.transitionForceNorm * 4));
	const tileWidth = tc.canvasWidth / cols;
	const tileHeight = tc.canvasHeight / rows;

	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const delay = seededRandom(x * 13.1 + y * 17.7 + 4.3) * 0.52;
			const local = clamp(
				(revealProgress - delay) / Math.max(0.18, 1 - delay),
				0,
				1
			);
			if (local <= 0.001) continue;

			const warpX =
				(seededRandom(x * 3.7 + y * 11.3 + Math.floor(tc.time * 0.01)) -
					0.5) *
				tileWidth *
				0.75 *
				tc.transitionForce *
				(1 - local);
			const warpY =
				(seededRandom(x * 7.9 + y * 5.1 + Math.floor(tc.time * 0.012)) -
					0.5) *
				tileHeight *
				0.5 *
				tc.transitionForce *
				(1 - local);

			blitTransitionTile(
				tc,
				source,
				x * tileWidth,
				y * tileHeight,
				Math.ceil(tileWidth + 1),
				Math.ceil(tileHeight + 1),
				local,
				warpX,
				warpY,
				(1 - local) * (4 + tc.transitionForce * 2)
			);
		}
	}
}

export function runBackgroundTransitionPass({
	dc,
	tc,
	type,
	easedProgress,
	activeImage,
	activeSnapshot,
	previousBackgroundImage,
	previousBackgroundParams,
	colorFilter
}: {
	dc: BgDrawContext;
	tc: BgTransitionCtx;
	type: string;
	easedProgress: number;
	activeImage: HTMLImageElement | null;
	activeSnapshot: BackgroundImageSnapshot;
	previousBackgroundImage: HTMLImageElement;
	previousBackgroundParams: BackgroundImageSnapshot;
	colorFilter: string;
}) {
	const slideDistance = dc.canvasWidth;

	if (type === 'slide-left') {
		drawBgImage(
			dc,
			previousBackgroundImage,
			previousBackgroundParams,
			1,
			-easedProgress *
				slideDistance *
				lerp(0.92, 1.18, tc.transitionForceNorm)
		);
		if (activeImage) {
			drawBgImage(
				dc,
				activeImage,
				activeSnapshot,
				1,
				(1 - easedProgress) *
					slideDistance *
					lerp(0.92, 1.18, tc.transitionForceNorm)
			);
		}
		return;
	}

	if (type === 'slide-right') {
		drawBgImage(
			dc,
			previousBackgroundImage,
			previousBackgroundParams,
			1,
			easedProgress *
				slideDistance *
				lerp(0.92, 1.18, tc.transitionForceNorm)
		);
		if (activeImage) {
			drawBgImage(
				dc,
				activeImage,
				activeSnapshot,
				1,
				-(1 - easedProgress) *
					slideDistance *
					lerp(0.92, 1.18, tc.transitionForceNorm)
			);
		}
		return;
	}

	if (type === 'zoom-in') {
		drawBgImage(
			dc,
			previousBackgroundImage,
			previousBackgroundParams,
			1 - easedProgress
		);
		if (activeImage) {
			drawBgImage(
				dc,
				activeImage,
				activeSnapshot,
				easedProgress,
				0,
				0,
				lerp(
					Math.max(0.2, 0.6 - tc.transitionForce * 0.14),
					1,
					easedProgress
				)
			);
		}
		return;
	}

	if (type === 'blur-dissolve') {
		drawBgImage(
			dc,
			previousBackgroundImage,
			previousBackgroundParams,
			1,
			0,
			0,
			1,
			easedProgress * (4 + tc.transitionForce * 1.8)
		);
		if (activeImage) {
			const source = renderTransitionSource(
				dc,
				activeImage,
				activeSnapshot
			);
			if (source) {
				drawDissolveTransition(tc, source, easedProgress);
			} else {
				// No offscreen canvas available (non-DOM host): a plain fade is
				// wrong-looking but cheap, and it never drops the new image.
				drawBgImage(dc, activeImage, activeSnapshot, easedProgress);
			}
		}
		return;
	}

	if (type === 'bars-horizontal') {
		drawBgImage(
			dc,
			previousBackgroundImage,
			previousBackgroundParams,
			1 - easedProgress * 0.45
		);
		if (activeImage) {
			const source = renderTransitionSource(
				dc,
				activeImage,
				activeSnapshot
			);
			if (source) {
				drawBarsTransition(tc, 'horizontal', source, easedProgress);
			} else {
				drawBgImage(dc, activeImage, activeSnapshot, easedProgress);
			}
		}
		return;
	}

	if (type === 'bars-vertical') {
		drawBgImage(
			dc,
			previousBackgroundImage,
			previousBackgroundParams,
			1 - easedProgress * 0.45
		);
		if (activeImage) {
			const source = renderTransitionSource(
				dc,
				activeImage,
				activeSnapshot
			);
			if (source) {
				drawBarsTransition(tc, 'vertical', source, easedProgress);
			} else {
				drawBgImage(dc, activeImage, activeSnapshot, easedProgress);
			}
		}
		return;
	}

	if (type === 'rgb-shift') {
		drawBgImage(
			dc,
			previousBackgroundImage,
			previousBackgroundParams,
			1 - easedProgress
		);
		if (activeImage) {
			const jitter =
				Math.sin(tc.time * 0.015) *
				dc.canvasWidth *
				0.035 *
				tc.transitionForce *
				(1 - easedProgress);
			drawBgImage(dc, activeImage, activeSnapshot, easedProgress, jitter);
			dc.ctx.save();
			const rgbBoost = Math.max(
				8,
				dc.canvasWidth * 0.02 * tc.transitionForce * (1 - easedProgress)
			);
			const rectForRgb = getBackgroundRectFromSnapshot(
				dc.canvasWidth,
				dc.canvasHeight,
				activeImage,
				activeSnapshot,
				dc.bassBoost,
				dc.parallaxX + jitter,
				-dc.parallaxY,
				{
					layoutResponsiveEnabled: dc.layoutResponsiveEnabled,
					layoutBackgroundReframeEnabled:
						dc.layoutBackgroundReframeEnabled,
					layoutReferenceWidth: dc.layoutReferenceWidth,
					layoutReferenceHeight: dc.layoutReferenceHeight
				}
			);
			dc.ctx.translate(rectForRgb.cx, rectForRgb.cy);
			const rotDeg = activeSnapshot.rotation ?? 0;
			if (rotDeg) {
				dc.ctx.rotate((rotDeg * Math.PI) / 180);
			}
			if (activeSnapshot.mirror) {
				dc.ctx.scale(-1, 1);
			}
			drawRgbShift(
				dc.ctx,
				activeImage,
				rectForRgb.width,
				rectForRgb.height,
				rgbBoost,
				colorFilter,
				tc.time,
				easedProgress,
				false
			);
			dc.ctx.restore();
		}
		return;
	}

	if (type === 'distortion') {
		drawBgImage(
			dc,
			previousBackgroundImage,
			previousBackgroundParams,
			1 - easedProgress * 0.6
		);
		if (activeImage) {
			const segments = Math.max(
				10,
				Math.floor(14 + tc.transitionForce * 5)
			);
			const sliceHeight = dc.canvasHeight / segments;
			const source = renderTransitionSource(
				dc,
				activeImage,
				activeSnapshot
			);
			if (!source) {
				drawBgImage(dc, activeImage, activeSnapshot, easedProgress);
				return;
			}
			for (let index = 0; index < segments; index++) {
				const wave =
					Math.sin(tc.time * 0.01 + index * 0.85) *
					dc.canvasWidth *
					0.05 *
					tc.transitionForce *
					(1 - easedProgress);
				blitTransitionTile(
					dc,
					source,
					0,
					index * sliceHeight,
					dc.canvasWidth,
					Math.ceil(sliceHeight + 1),
					easedProgress,
					wave,
					0
				);
			}
		}
		return;
	}

	drawBgImage(
		dc,
		previousBackgroundImage,
		previousBackgroundParams,
		1 - easedProgress
	);
	if (activeImage) {
		drawBgImage(dc, activeImage, activeSnapshot, easedProgress);
	}
}

export function drawBackgroundImageDirect(
	dc: BgDrawContext,
	image: HTMLImageElement,
	snapshot: BackgroundImageSnapshot,
	alpha: number
) {
	drawBgImage(dc, image, snapshot, alpha);
}
