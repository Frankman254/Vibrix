import { clamp } from '@/lib/math';

import type { SlideshowTransitionType } from '@/types/wallpaper';
import { TRANSITION_TYPES } from './transitionCatalog';
import { paintTransitionMask } from './transitionMasks';
import { paintTransitionMotion } from './transitionMotion';

export type CinematicTransition = SlideshowTransitionType;
export function isCinematicTransition(
	type: string
): type is CinematicTransition {
	return (TRANSITION_TYPES as readonly string[]).includes(type);
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
		for (let i = 0; i < 4; i++) {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) return null;
			set.push({ canvas, ctx });
		}
		surfaces.set(target, set);
	}
	for (const [index, { canvas, ctx }] of set.entries()) {
		const widthForSurface = index === 3 ? 192 : width;
		const heightForSurface = index === 3 ? 128 : height;
		if (canvas.width !== widthForSurface) canvas.width = widthForSurface;
		if (canvas.height !== heightForSurface)
			canvas.height = heightForSurface;
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
	const [from, to, mix, mask] = set;
	const p = clamp(progress, 0, 1);
	const force = clamp(intensity, 0, 3);
	drawFrom(from.ctx);
	drawTo(to.ctx);
	const out = mix.ctx;
	if (p === 0 || p === 1) {
		out.drawImage(p === 0 ? from.canvas : to.canvas, 0, 0);
	} else if (
		[
			'iris',
			'iris-close',
			'diagonal-wipe',
			'diagonal-wipe-reverse',
			'diamond',
			'diamond-close',
			'curtain',
			'curtain-close',
			'checkerboard',
			'mosaic',
			'wave',
			'bars-horizontal',
			'bars-vertical',
			'blur-dissolve',
			'wipe-left',
			'wipe-right',
			'wipe-up',
			'wipe-down'
		].includes(type)
	) {
		paintTransitionMask(mask.ctx, type, p, force, width / height);
		out.drawImage(from.canvas, 0, 0);
		out.globalCompositeOperation = 'destination-out';
		out.drawImage(mask.canvas, 0, 0, width, height);
		to.ctx.globalCompositeOperation = 'destination-in';
		to.ctx.drawImage(mask.canvas, 0, 0, width, height);
		out.globalCompositeOperation = 'lighter';
		out.drawImage(to.canvas, 0, 0);
	} else {
		paintTransitionMotion(out, from.canvas, to.canvas, type, p, force);
		if (type === 'rgb-shift') {
			// Split the composed frame into complementary channels, preserving alpha.
			for (const [surface, color] of [
				[from, '#ff0000'],
				[to, '#00ffff']
			] as const) {
				surface.ctx.clearRect(0, 0, width, height);
				surface.ctx.drawImage(mix.canvas, 0, 0);
				surface.ctx.globalCompositeOperation = 'multiply';
				surface.ctx.fillStyle = color;
				surface.ctx.fillRect(0, 0, width, height);
				surface.ctx.globalCompositeOperation = 'destination-in';
				surface.ctx.drawImage(mix.canvas, 0, 0);
			}
			out.clearRect(0, 0, width, height);
			out.globalAlpha = 0.5;
			const shift = Math.sin(Math.PI * p) * width * 0.022 * force;
			for (const [surface, direction] of [
				[from, -1],
				[to, 1]
			] as const) {
				for (const wrap of [-width, 0, width])
					out.drawImage(
						surface.canvas,
						Math.round(direction * shift) + wrap,
						0
					);
			}
		}
	}

	ctx.save();
	ctx.filter =
		type === 'rgb-shift' && p > 0 && p < 1 ? 'brightness(2)' : 'none';
	ctx.globalAlpha = clamp(opacity, 0, 1);
	ctx.drawImage(mix.canvas, 0, 0);
	ctx.restore();
	return true;
}
