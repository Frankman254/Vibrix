import { clamp } from '@/lib/math';

export type CinematicTransition = 'cross-zoom' | 'diagonal-wipe' | 'iris';

export function isCinematicTransition(
	type: string
): type is CinematicTransition {
	return type === 'cross-zoom' || type === 'diagonal-wipe' || type === 'iris';
}

type Surface = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
// A separate scratch set per target keeps preview and export independent.
const surfaces = new WeakMap<CanvasRenderingContext2D, Surface[]>();

function getSurfaces(
	target: CanvasRenderingContext2D,
	width: number,
	height: number
) {
	let set = surfaces.get(target);
	if (!set) {
		if (typeof document === 'undefined') return null;
		set = [];
		for (let i = 0; i < 3; i++) {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) return null;
			set.push({ canvas, ctx });
		}
		surfaces.set(target, set);
	}
	for (const { canvas, ctx } of set) {
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.filter = 'none';
		ctx.clearRect(0, 0, width, height);
	}
	return set;
}

/** Original Canvas implementation inspired by the GL Transitions gallery.
 * Input images are framed/filtered once. All motion samples reuse those pixels.
 * Additive premultiplied blending preserves brightness and transparent layers.
 */
export function drawCinematicTransition({
	ctx,
	width,
	height,
	type,
	progress,
	intensity,
	opacity,
	drawFrom,
	drawTo
}: {
	ctx: CanvasRenderingContext2D;
	width: number;
	height: number;
	type: CinematicTransition;
	progress: number;
	intensity: number;
	opacity: number;
	drawFrom: (ctx: CanvasRenderingContext2D) => void;
	drawTo: (ctx: CanvasRenderingContext2D) => void;
}): boolean {
	const set = getSurfaces(ctx, width, height);
	if (!set) return false;
	const [from, to, mix] = set;
	const p = clamp(progress, 0, 1);
	const force = clamp(intensity, 0, 3);
	drawFrom(from.ctx);
	drawTo(to.ctx);
	const out = mix.ctx;
	if (p === 0 || p === 1) {
		out.drawImage(p === 0 ? from.canvas : to.canvas, 0, 0);
	} else if (type === 'cross-zoom') {
		const pulse = Math.sin(Math.PI * p);
		out.globalCompositeOperation = 'lighter';
		// Six weighted samples give a radial shutter trail at a bounded cost.
		for (let i = 0; i < 6; i++) {
			const trail = (i / 5) * 0.16 * force * pulse;
			for (const [source, weight, scale] of [
				[from.canvas, 1 - p, 1 + p * 0.3 * force + trail],
				[to.canvas, p, 1 + (1 - p) * 0.3 * force + trail]
			] as const) {
				out.globalAlpha = weight / 6;
				out.drawImage(
					source,
					(width * (1 - scale)) / 2,
					(height * (1 - scale)) / 2,
					width * scale,
					height * scale
				);
			}
		}
	} else {
		// Mask the outgoing pixels away before adding the incoming image.
		// This also handles PNG transparency without leaving the old image below.
		const feather = 0.025 + force * 0.035;
		const edge = -feather + p * (1 + 2 * feather);
		const mask =
			type === 'iris'
				? out.createRadialGradient(
						width / 2,
						height / 2,
						0,
						width / 2,
						height / 2,
						Math.hypot(width, height) / 2
					)
				: out.createLinearGradient(0, 0, width, height);
		mask.addColorStop(clamp(edge - feather, 0, 1), 'rgba(0,0,0,1)');
		mask.addColorStop(clamp(edge + feather, 0, 1), 'rgba(0,0,0,0)');
		out.drawImage(from.canvas, 0, 0);
		out.globalCompositeOperation = 'destination-out';
		out.fillStyle = mask;
		out.fillRect(0, 0, width, height);
		to.ctx.globalCompositeOperation = 'destination-in';
		to.ctx.fillStyle = mask;
		to.ctx.fillRect(0, 0, width, height);
		out.globalCompositeOperation = 'lighter';
		out.drawImage(to.canvas, 0, 0);
	}
	ctx.save();
	ctx.filter = 'none';
	ctx.globalAlpha = clamp(opacity, 0, 1);
	ctx.drawImage(mix.canvas, 0, 0);
	ctx.restore();
	return true;
}
