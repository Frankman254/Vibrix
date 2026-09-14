/**
 * Offline render of Stage FX: the Stage Lights beams (over the background
 * image, under particles) and the Flash Light impact (over the overlays).
 * Each steps and draws through the same functions as the live
 * `StageLightsCanvas` / `FlashLightCanvas`, on the export clock and the
 * analysed audio, onto a scratch canvas composited into the frame.
 *
 * The flash steps in `beginFrame`, before any layer paints, and publishes
 * its drive to the Flash Edge singleton the background and logo read — the
 * same hand-off the live `FlashLightCanvas` makes every rAF.
 */
import { getEditorThemePalette } from '@/lib/backgroundPalette';
import { getCurrentViewportResolution } from '@/features/layout/viewportMetrics';
import {
	createFlashLightRuntime,
	createStageLightsRuntime,
	drawFlashLight,
	drawStageLights,
	resolveFlashLightColor,
	stepFlashLight,
	stepStageLights
} from '@/features/stageFx/render';
import { updateFlashEdgeDrive } from '@/features/stageFx/flashEdgeDrive';
import type { RenderFrameContext } from '../renderFrameContext';
import type { RenderSubsystem } from '../renderSubsystem';

/** Delta above this is a seek or first frame, not a step (matches live). */
const MAX_STEP_SEC = 0.1;

/**
 * The live canvases size their pixel constants (blur, core width, edge depth)
 * for the viewport; scale them to the export resolution.
 */
function resolvePixelScale(
	resolution: RenderFrameContext['resolution'],
	viewportMin: number
): number {
	const outputMin = Math.min(resolution.width, resolution.height);
	return viewportMin > 0 ? outputMin / viewportMin : 1;
}

function createScratch() {
	let canvas: HTMLCanvasElement | null = null;
	let context: CanvasRenderingContext2D | null = null;
	return {
		get(width: number, height: number): CanvasRenderingContext2D | null {
			if (!canvas) {
				canvas = document.createElement('canvas');
				context = canvas.getContext('2d');
			}
			if (canvas.width !== width) canvas.width = width;
			if (canvas.height !== height) canvas.height = height;
			return context;
		},
		dispose() {
			if (canvas) {
				canvas.width = 1;
				canvas.height = 1;
			}
			canvas = null;
			context = null;
		}
	};
}

function readViewportMin(): number {
	const viewport = getCurrentViewportResolution();
	return Math.min(viewport.width, viewport.height);
}

export function createStageLightsSubsystem(): RenderSubsystem {
	const scratch = createScratch();
	let runtime = createStageLightsRuntime();
	let viewportMin = 0;

	return {
		id: 'stageLights',
		async prepare() {
			viewportMin = readViewportMin();
		},
		render(ctx: RenderFrameContext) {
			if (!ctx.audio || !ctx.state.stageLightsEnabled) return;
			const target = ctx.canvas.getContext('2d');
			const { width, height } = ctx.resolution;
			const scratchCtx = scratch.get(width, height);
			if (!target || !scratchCtx) return;

			const response = stepStageLights(
				runtime,
				ctx.state,
				ctx.audio,
				ctx.timeMs,
				Math.min(ctx.deltaMs / 1000, MAX_STEP_SEC),
				ctx.state.motionPaused
			);
			const result = drawStageLights(
				scratchCtx,
				width,
				height,
				ctx.state,
				runtime,
				response,
				{
					background: ctx.palette,
					theme: getEditorThemePalette(ctx.state.editorTheme)
				},
				resolvePixelScale(ctx.resolution, viewportMin)
			);
			if (result.drawn) target.drawImage(scratchCtx.canvas, 0, 0);
		},
		reset() {
			runtime = createStageLightsRuntime();
		},
		dispose() {
			scratch.dispose();
		}
	};
}

export function createFlashLightSubsystem(): RenderSubsystem {
	const scratch = createScratch();
	let runtime = createFlashLightRuntime();
	let viewportMin = 0;
	let color = '#ffffff';

	return {
		id: 'flashLight',
		async prepare() {
			viewportMin = readViewportMin();
		},
		beginFrame(ctx: RenderFrameContext) {
			// Live, Flash Edge only moves while the Flash Light canvas is
			// mounted, i.e. while Flash Light is on.
			if (!ctx.audio || !ctx.state.flashLightEnabled) {
				runtime.drive = 0;
				updateFlashEdgeDrive(0, color);
				return;
			}
			stepFlashLight(
				runtime,
				ctx.state,
				ctx.audio,
				ctx.timeMs,
				Math.min(ctx.deltaMs / 1000, MAX_STEP_SEC)
			);
			color = resolveFlashLightColor(ctx.state, {
				background: ctx.palette,
				theme: getEditorThemePalette(ctx.state.editorTheme)
			});
			updateFlashEdgeDrive(runtime.drive, color);
		},
		render(ctx: RenderFrameContext) {
			if (!ctx.audio || !ctx.state.flashLightEnabled) return;
			if (runtime.drive <= 0.001) return;
			const target = ctx.canvas.getContext('2d');
			const { width, height } = ctx.resolution;
			const scratchCtx = scratch.get(width, height);
			if (!target || !scratchCtx) return;

			scratchCtx.clearRect(0, 0, width, height);
			drawFlashLight(
				scratchCtx,
				width,
				height,
				ctx.state,
				runtime,
				color,
				resolvePixelScale(ctx.resolution, viewportMin)
			);
			target.drawImage(scratchCtx.canvas, 0, 0);
		},
		reset() {
			runtime = createFlashLightRuntime();
		},
		dispose() {
			scratch.dispose();
			runtime.shapeCache = null;
		}
	};
}
