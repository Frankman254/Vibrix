import {
	drawCinematicTransition,
	isCinematicTransition
} from '@/features/background/render';
import { clamp } from '@/lib/math';
import type { BackgroundImageSnapshot } from '@/features/background/imageLayerGeometry';
import { getBackgroundDrawRectsFromSnapshot } from '@/features/background/imageLayerGeometry';
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

export function runBackgroundTransitionPass({
	dc,
	tc,
	type,
	easedProgress,
	activeImage,
	activeSnapshot,
	previousBackgroundImage,
	previousBackgroundParams
}: {
	dc: BgDrawContext;
	tc: BgTransitionCtx;
	type: string;
	easedProgress: number;
	activeImage: HTMLImageElement | null;
	activeSnapshot: BackgroundImageSnapshot;
	previousBackgroundImage: HTMLImageElement;
	previousBackgroundParams: BackgroundImageSnapshot;
}) {
	if (activeImage && isCinematicTransition(type)) {
		const rendered = drawCinematicTransition({
			ctx: dc.ctx,
			width: dc.canvasWidth,
			height: dc.canvasHeight,
			type,
			progress: easedProgress,
			intensity: tc.transitionForce,
			opacity: dc.layerOpacity,
			drawFrom: ctx =>
				drawBgImage(
					{ ...dc, ctx, layerOpacity: 1 },
					previousBackgroundImage,
					previousBackgroundParams,
					1
				),
			drawTo: ctx =>
				drawBgImage(
					{ ...dc, ctx, layerOpacity: 1 },
					activeImage,
					activeSnapshot,
					1
				)
		});
		if (rendered) return;
	}
	// A non-DOM host can still show the incoming image without an effect.
	drawBgImage(dc, previousBackgroundImage, previousBackgroundParams, 1);
	if (activeImage)
		drawBgImage(dc, activeImage, activeSnapshot, easedProgress);
}

export function drawBackgroundImageDirect(
	dc: BgDrawContext,
	image: HTMLImageElement,
	snapshot: BackgroundImageSnapshot,
	alpha: number
) {
	drawBgImage(dc, image, snapshot, alpha);
}
