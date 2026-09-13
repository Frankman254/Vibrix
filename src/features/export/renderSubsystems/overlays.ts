/**
 * Offline render of overlay images. Live, each overlay is an `<img>` styled
 * with CSS (`OverlayImageLayerView`); here the same styling is replayed on a
 * scratch canvas per overlay, in CSS order — filter, clip-path, mask — and
 * the result is composited with the overlay's opacity and blend mode.
 *
 * The editor-only "advanced" filter effects (RGB shift, scanlines, noise on
 * the selected overlay) are not reproduced.
 */
import { getCurrentViewportResolution } from '@/features/layout/viewportMetrics';
import { buildOverlayLayers } from '@/lib/layers';
import type { OverlayImageLayer } from '@/types/layers';
import type { WallpaperState } from '@/types/wallpaper';
import type { RenderFrameContext } from '../renderFrameContext';
import type { RenderSubsystem } from '../renderSubsystem';
import {
	resolveOverlayDrawPlan,
	resolveOverlaySizeFactor,
	type OverlayDrawPlan
} from './overlayImageDraw';

function isDrawableOverlay(
	layer: ReturnType<typeof buildOverlayLayers>[number]
): layer is OverlayImageLayer {
	return (
		layer.type === 'overlay-image' &&
		layer.enabled &&
		Boolean(layer.imageUrl)
	);
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
	const image = new Image();
	image.decoding = 'async';
	image.src = url;
	try {
		await image.decode();
		return image;
	} catch {
		return null;
	}
}

function traceCrop(
	ctx: CanvasRenderingContext2D,
	plan: OverlayDrawPlan,
	width: number,
	height: number
): boolean {
	switch (plan.cropShape) {
		case 'circle': {
			// CSS `circle(50%)` resolves against sqrt(w² + h²) / sqrt(2).
			const radius = (0.5 * Math.hypot(width, height)) / Math.SQRT2;
			ctx.beginPath();
			ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
			return true;
		}
		case 'rounded':
			ctx.beginPath();
			ctx.roundRect(0, 0, width, height, plan.cornerRadius);
			return true;
		case 'diamond':
			ctx.beginPath();
			ctx.moveTo(width / 2, 0);
			ctx.lineTo(width, height / 2);
			ctx.lineTo(width / 2, height);
			ctx.lineTo(0, height / 2);
			ctx.closePath();
			return true;
		default:
			return false;
	}
}

function paintOverlay(
	scratch: CanvasRenderingContext2D,
	image: HTMLImageElement,
	plan: OverlayDrawPlan,
	width: number,
	height: number
): void {
	scratch.save();
	scratch.clearRect(0, 0, width, height);
	scratch.filter = plan.filter;
	scratch.drawImage(image, 0, 0, width, height);
	scratch.filter = 'none';

	scratch.globalCompositeOperation = 'destination-in';
	if (traceCrop(scratch, plan, width, height)) {
		scratch.fillStyle = '#000';
		scratch.fill();
	}

	// `radial-gradient(ellipse at center, …)` sizes to the farthest corner:
	// an ellipse with the box's aspect ratio whose radius is √2 × half-size.
	scratch.translate(width / 2, height / 2);
	scratch.scale((width / 2) * Math.SQRT2, (height / 2) * Math.SQRT2);
	const mask = scratch.createRadialGradient(0, 0, 0, 0, 0, 1);
	mask.addColorStop(Math.min(plan.fadeStart, 1), 'rgba(0,0,0,1)');
	mask.addColorStop(1, 'rgba(0,0,0,0)');
	scratch.fillStyle = mask;
	scratch.fillRect(-1, -1, 2, 2);
	scratch.restore();
}

export function createOverlaysSubsystem(): RenderSubsystem {
	const images = new Map<string, HTMLImageElement>();
	let liveViewport = { width: 1920, height: 1080 };
	let scratchCanvas: HTMLCanvasElement | null = null;
	let scratch: CanvasRenderingContext2D | null = null;

	return {
		id: 'overlays',
		async prepare(state: Readonly<WallpaperState>) {
			images.clear();
			liveViewport = getCurrentViewportResolution();
			const layers = buildOverlayLayers(state).filter(isDrawableOverlay);
			await Promise.all(
				layers.map(async layer => {
					const image = await loadImage(layer.imageUrl as string);
					if (image) images.set(layer.id, image);
				})
			);
		},
		render(ctx: RenderFrameContext) {
			if (!ctx.audio || images.size === 0) return;
			const target = ctx.canvas.getContext('2d');
			if (!target) return;

			const sizeFactor = resolveOverlaySizeFactor(
				ctx.state,
				liveViewport,
				ctx.resolution
			);
			const layers = buildOverlayLayers(ctx.state)
				.filter(isDrawableOverlay)
				.sort((a, b) => a.zIndex - b.zIndex);

			for (const layer of layers) {
				const image = images.get(layer.id);
				if (!image) continue;
				const plan = resolveOverlayDrawPlan(
					layer,
					ctx.state,
					ctx.audio,
					ctx.resolution,
					sizeFactor
				);
				const width = Math.round(plan.width);
				const height = Math.round(plan.height);
				if (width < 1 || height < 1 || plan.opacity <= 0) continue;

				if (!scratchCanvas) {
					scratchCanvas = document.createElement('canvas');
					scratch = scratchCanvas.getContext('2d');
				}
				if (!scratch) return;
				if (
					scratchCanvas.width !== width ||
					scratchCanvas.height !== height
				) {
					scratchCanvas.width = width;
					scratchCanvas.height = height;
				}
				paintOverlay(scratch, image, plan, width, height);

				target.save();
				target.globalAlpha = Math.min(1, plan.opacity);
				target.globalCompositeOperation = plan.composite;
				target.translate(plan.centerX, plan.centerY);
				target.rotate(plan.rotationRad);
				target.drawImage(scratchCanvas, -width / 2, -height / 2);
				target.restore();
			}
		},
		dispose() {
			images.clear();
			if (scratchCanvas) {
				scratchCanvas.width = 1;
				scratchCanvas.height = 1;
			}
			scratchCanvas = null;
			scratch = null;
		}
	};
}
