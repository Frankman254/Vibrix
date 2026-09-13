/**
 * Offline render of the global background — the image behind every other
 * layer. Draws through `drawGlobalBackgroundFrame`, the same function the live
 * `GlobalBackgroundView` calls, on a scratch canvas that is then composited
 * under the background image (first in `RENDER_SUBSYSTEM_ORDER`).
 */
import { drawGlobalBackgroundFrame } from '@/features/background/render';
import type { RenderFrameContext } from '../renderFrameContext';
import type { RenderSubsystem } from '../renderSubsystem';

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

export function createGlobalBackgroundSubsystem(): RenderSubsystem {
	let image: HTMLImageElement | null = null;
	let scratchCanvas: HTMLCanvasElement | null = null;
	let scratch: CanvasRenderingContext2D | null = null;

	return {
		id: 'globalBackground',
		async prepare(state) {
			image =
				state.globalBackgroundEnabled && state.globalBackgroundUrl
					? await loadImage(state.globalBackgroundUrl)
					: null;
		},
		render(ctx: RenderFrameContext) {
			if (!image || !ctx.state.globalBackgroundEnabled) return;
			const target = ctx.canvas.getContext('2d');
			if (!target) return;

			const { width, height } = ctx.resolution;
			if (!scratchCanvas) {
				scratchCanvas = document.createElement('canvas');
				scratch = scratchCanvas.getContext('2d');
			}
			if (!scratch) return;
			if (scratchCanvas.width !== width) scratchCanvas.width = width;
			if (scratchCanvas.height !== height) scratchCanvas.height = height;

			drawGlobalBackgroundFrame(
				scratch,
				image,
				ctx.state,
				ctx.timeMs,
				ctx.audio?.amplitude ?? 0
			);
			target.drawImage(scratchCanvas, 0, 0);
		},
		dispose() {
			image = null;
			if (scratchCanvas) {
				scratchCanvas.width = 1;
				scratchCanvas.height = 1;
			}
			scratchCanvas = null;
			scratch = null;
		}
	};
}
