import type {
	RenderFrameContext,
	RenderSubsystemId
} from './renderFrameContext';
import { getRenderSubsystem } from './renderSubsystem';
import { recordSyncFrame } from './debugRenderSync';
import {
	resolveSubsystemDrawOrder,
	resolveTransitionAlpha
} from './frameComposition';

/**
 * A canvas transform for one subsystem's layer, in output pixels: translate
 * by (`tx`, `ty`), then scale about the frame centre — the CSS
 * `translate3d(…) scale(…)` Camera FX puts on the live layer root.
 */
export type LayerTransform = { tx: number; ty: number; scale: number };

export type RenderFrameOptions = {
	includeHud?: boolean;
	/** Camera FX per layer; `null` leaves the layer where it is. */
	resolveLayerTransform?: (id: RenderSubsystemId) => LayerTransform | null;
};

export function renderFrameAt(
	ctx: RenderFrameContext,
	options: RenderFrameOptions = {}
): void {
	ctx.abortSignal?.throwIfAborted();

	const order = resolveSubsystemDrawOrder(ctx.state);
	// Effects other layers read (the flash drive behind Flash Edge) step
	// before anything paints, as the live rAF loops share them across layers.
	for (const id of order) {
		getRenderSubsystem(id)?.beginFrame?.(ctx);
	}

	const target = ctx.canvas.getContext('2d');
	const { width, height } = ctx.resolution;
	for (const id of order) {
		if (id === 'hud' && !options.includeHud) continue;
		const subsystem = getRenderSubsystem(id);
		if (!subsystem) continue;
		ctx.abortSignal?.throwIfAborted();

		const alpha = resolveTransitionAlpha(ctx.state, id, ctx.timeMs);
		if (alpha <= 0) continue;
		const transform = options.resolveLayerTransform?.(id) ?? null;
		if (!target || (alpha >= 1 && !transform)) {
			subsystem.render(ctx);
			continue;
		}
		// Subsystems composite with relative transforms and the current
		// alpha, so the layer's transform and fade wrap its whole draw.
		target.save();
		target.globalAlpha *= alpha;
		if (transform) {
			target.translate(
				width / 2 + transform.tx,
				height / 2 + transform.ty
			);
			target.scale(transform.scale, transform.scale);
			target.translate(-width / 2, -height / 2);
		}
		try {
			subsystem.render(ctx);
		} finally {
			target.restore();
		}
	}

	recordSyncFrame(ctx);
}
