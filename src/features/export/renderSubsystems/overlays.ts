/**
 * Offline render of overlay images. Live, each overlay is an `<img>` styled
 * with CSS (`OverlayImageLayerView`); here the same styling is replayed on a
 * scratch canvas per overlay, in CSS order — filter, clip-path, mask — and
 * the result is composited with the overlay's opacity and blend mode.
 *
 * The editor-only "advanced" Looks (RGB shift, scanlines, noise on the
 * selected overlay) are reproduced on a second scratch sized to the rotated
 * bounding box, mirroring the extra `<ImageLayerCanvas renderBaseImage={false}>`
 * the view mounts — passes clipped to the layer's shape, soft-edge faded,
 * then composited unrotated with blend mode `plan.composite` at alpha 1
 * (the pass alpha is baked in by `applyImagePostProcessPasses`).
 */
import {
	applyImagePostProcessPasses,
	applyOverlayShapeClip,
	applySoftEdgeMask
} from '@/lib/canvas/imageEffects';
import { resolveImagePostProcessQuality } from '@/lib/visual/performanceQuality';
import { createAudioChannelSelectionState } from '@/lib/audio/audioChannels';
import { createAudioEnvelope } from '@/utils/audioEnvelope';
import { getCurrentViewportResolution } from '@/features/layout/viewportMetrics';
import { buildOverlayLayers } from '@/lib/layers';
import { resolveFilterStack } from '@/features/filterLooks/filterStack';
import type { OverlayImageLayer } from '@/types/layers';
import type { WallpaperState } from '@/types/wallpaper';
import type { RenderFrameContext } from '../renderFrameContext';
import type { RenderSubsystem } from '../renderSubsystem';
import {
	resolveOverlayAdvancedEffects,
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
	let fxCanvas: HTMLCanvasElement | null = null;
	let fx: CanvasRenderingContext2D | null = null;
	// The Looks envelope is live across one export at a time; only the
	// selected overlay is ever targeted, so one envelope suffices.
	const freshFilterAudio = () => ({
		envelope: createAudioEnvelope(),
		channelSelection: createAudioChannelSelectionState()
	});
	let filterAudio = freshFilterAudio();

	const releaseCanvas = (
		canvas: HTMLCanvasElement | null
	): HTMLCanvasElement | null => {
		if (canvas) {
			canvas.width = 1;
			canvas.height = 1;
		}
		return null;
	};

	return {
		id: 'overlays',
		async prepare(state: Readonly<WallpaperState>) {
			images.clear();
			filterAudio = freshFilterAudio();
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

			// One resolution per frame: which effect layer paints overlays.
			const overlayLook = resolveFilterStack(
				ctx.state,
				'selected-overlay'
			);

			for (const layer of layers) {
				const image = images.get(layer.id);
				if (!image) continue;
				const look =
					ctx.state.selectedOverlayId === layer.id
						? overlayLook
						: null;
				const plan = resolveOverlayDrawPlan(
					layer,
					look,
					ctx.audio,
					ctx.resolution,
					sizeFactor
				);
				const width = Math.round(plan.width);
				const height = Math.round(plan.height);
				if (width < 1 || height < 1) continue;

				const advanced = resolveOverlayAdvancedEffects({
					layerOpacity: layer.opacity,
					look,
					state: ctx.state,
					audio: ctx.audio,
					channelSelection: filterAudio.channelSelection,
					envelope: filterAudio.envelope,
					dt: Math.min(ctx.deltaMs / 1000, 0.1),
					timeMs: ctx.timeMs,
					output: ctx.resolution,
					sizeFactor
				});

				if (plan.opacity > 0) {
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

				if (advanced) {
					// Axis-aligned bounding box of the rotated layer.
					const cos = Math.abs(Math.cos(plan.rotationRad));
					const sin = Math.abs(Math.sin(plan.rotationRad));
					const boxW = Math.ceil(width * cos + height * sin);
					const boxH = Math.ceil(width * sin + height * cos);
					if (!fxCanvas) {
						fxCanvas = document.createElement('canvas');
						fx = fxCanvas.getContext('2d');
					}
					if (!fx) return;
					if (fxCanvas.width !== boxW || fxCanvas.height !== boxH) {
						fxCanvas.width = boxW;
						fxCanvas.height = boxH;
					}
					fx.clearRect(0, 0, boxW, boxH);
					fx.save();
					fx.translate(boxW / 2, boxH / 2);
					fx.rotate(plan.rotationRad);
					applyOverlayShapeClip(fx, width, height, plan.cropShape);
					applyImagePostProcessPasses({
						ctx: fx,
						source: image,
						width,
						height,
						time: ctx.timeMs,
						opacity: advanced.passAlpha,
						colorFilter:
							'brightness(1) contrast(1) saturate(1) hue-rotate(0deg)',
						rgbShiftPixels: advanced.rgbShiftPixels,
						filmNoiseAmount: advanced.filmNoiseAmount,
						scanlineAmount: advanced.scanlineAmount,
						scanlineSpacing: advanced.scanlineSpacing,
						scanlineThickness: advanced.scanlineThickness,
						postQualityTier: resolveImagePostProcessQuality(
							ctx.state.performanceMode
						)
					});
					applySoftEdgeMask(fx, width, height, layer.edgeFade);
					fx.restore();

					// The pass alpha is baked into the scratch pixels; the
					// live advanced canvas blends over the accumulated page
					// with the layer's blend mode at alpha 1.
					target.save();
					target.globalCompositeOperation = plan.composite;
					target.translate(plan.centerX, plan.centerY);
					target.drawImage(fxCanvas, -boxW / 2, -boxH / 2);
					target.restore();
				}
			}
		},
		reset() {
			filterAudio = freshFilterAudio();
		},
		dispose() {
			images.clear();
			scratchCanvas = releaseCanvas(scratchCanvas);
			scratch = null;
			fxCanvas = releaseCanvas(fxCanvas);
			fx = null;
			filterAudio = freshFilterAudio();
		}
	};
}
