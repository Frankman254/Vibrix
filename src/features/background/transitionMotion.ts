import type { SlideshowTransitionType } from '@/types/wallpaper';

const atlases = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/** A mirrored repeating atlas avoids antialiased seams between separate tiles. */
function mirrorPattern(
	ctx: CanvasRenderingContext2D,
	source: HTMLCanvasElement
) {
	let atlas = atlases.get(source);
	if (!atlas) {
		atlas = document.createElement('canvas');
		atlases.set(source, atlas);
	}
	const ratio = Math.min(1, 1024 / Math.max(source.width, source.height));
	const w = Math.max(1, Math.round(source.width * ratio)),
		h = Math.max(1, Math.round(source.height * ratio));
	if (atlas.width !== w * 2) atlas.width = w * 2;
	if (atlas.height !== h * 2) atlas.height = h * 2;
	const target = atlas.getContext('2d');
	if (!target) return null;
	target.clearRect(0, 0, atlas.width, atlas.height);
	for (let y = 0; y < 2; y++)
		for (let x = 0; x < 2; x++) {
			target.save();
			target.translate(x ? w * 2 : 0, y ? h * 2 : 0);
			target.scale(x ? -1 : 1, y ? -1 : 1);
			target.drawImage(source, 0, 0, w, h);
			target.restore();
		}
	const pattern = ctx.createPattern(atlas, 'repeat');
	pattern?.setTransform(
		new DOMMatrix().scale(source.width / w, source.height / h)
	);
	return pattern;
}

function lens(
	ctx: CanvasRenderingContext2D,
	source: HTMLCanvasElement,
	scaleX: number,
	scaleY: number,
	rotation: number,
	patterns: Map<HTMLCanvasElement, CanvasPattern | null>
) {
	const { width: w, height: h } = source;
	ctx.save();
	ctx.translate(w / 2, h / 2);
	ctx.rotate(rotation);
	ctx.scale(scaleX, scaleY);
	if (scaleX < 1 || scaleY < 1 || rotation !== 0) {
		if (!patterns.has(source))
			patterns.set(source, mirrorPattern(ctx, source));
		const pattern = patterns.get(source);
		if (pattern) {
			ctx.translate(-w / 2, -h / 2);
			ctx.fillStyle = pattern;
			ctx.fillRect(-w * 3, -h * 3, w * 7, h * 7);
		} else ctx.drawImage(source, -w / 2, -h / 2);
	} else ctx.drawImage(source, -w / 2, -h / 2);
	ctx.restore();
}

export function paintTransitionMotion(
	ctx: CanvasRenderingContext2D,
	from: HTMLCanvasElement,
	to: HTMLCanvasElement,
	type: SlideshowTransitionType,
	p: number,
	force: number
) {
	const w = from.width,
		h = from.height;
	const pulse = Math.sin(Math.PI * p);
	const patterns = new Map<HTMLCanvasElement, CanvasPattern | null>();
	ctx.globalCompositeOperation = 'lighter';
	if (type.startsWith('slide-')) {
		const vertical = type === 'slide-up' || type === 'slide-down';
		const sign = type === 'slide-right' || type === 'slide-down' ? 1 : -1;
		const distance = vertical ? h : w;
		// A single continuous push: both edges travel exactly one viewport.
		for (const [source, offset] of [
			[from, Math.round(p * distance) * sign],
			[to, (Math.round(p * distance) - distance) * sign]
		] as const) {
			ctx.drawImage(source, vertical ? 0 : offset, vertical ? offset : 0);
		}
		return;
	}
	if (type === 'ripple') {
		const cols = 32,
			rows = 24;
		for (let y = 0; y < rows; y++)
			for (let x = 0; x < cols; x++) {
				const dx = (x + 0.5) / cols - 0.5,
					dy = (y + 0.5) / rows - 0.5;
				const radius = Math.hypot(dx, dy);
				const wave =
					Math.sin(radius * 30 - p * Math.PI * 8) *
					pulse *
					0.018 *
					force;
				const tx = Math.floor((x * w) / cols),
					ty = Math.floor((y * h) / rows);
				const tw = Math.floor(((x + 1) * w) / cols) - tx,
					th = Math.floor(((y + 1) * h) / rows) - ty;
				for (const [source, weight, sign] of [
					[from, 1 - p, 1],
					[to, p, -1]
				] as const) {
					ctx.globalAlpha = weight;
					// Clamp sampling to image edges; every output tile remains fully covered.
					const sx = Math.max(
						0,
						Math.min(w - tw, tx + dx * wave * w * sign)
					);
					const sy = Math.max(
						0,
						Math.min(h - th, ty + dy * wave * h * sign)
					);
					ctx.drawImage(source, sx, sy, tw, th, tx, ty, tw, th);
				}
			}
		return;
	}
	if (type === 'distortion') {
		const strips = 64;
		for (let i = 0; i < strips; i++) {
			const y = Math.floor((i * h) / strips),
				end = Math.floor(((i + 1) * h) / strips);
			const wave =
				Math.sin(i * 0.28 - p * Math.PI * 4) *
				pulse *
				w *
				0.035 *
				force;
			for (const [source, weight, direction] of [
				[from, 1 - p, 1],
				[to, p, -1]
			] as const) {
				ctx.globalAlpha = weight;
				for (const wrap of [-w, 0, w])
					ctx.drawImage(
						source,
						0,
						y,
						w,
						end - y,
						Math.round(wave * direction) + wrap,
						y,
						w,
						end - y
					);
			}
		}
		return;
	}
	const trail = type === 'cross-zoom' || type === 'cross-zoom-out';
	const spin = type === 'spin-left' || type === 'spin-right';
	const count = trail || spin ? 6 : 1;
	for (let i = 0; i < count; i++) {
		const smear = (i / 5) * pulse * 0.16 * force;
		for (const [source, weight, phase] of [
			[from, 1 - p, p],
			[to, p, 1 - p]
		] as const) {
			ctx.globalAlpha = weight / count;
			let scale = 1,
				sx = 1,
				sy = 1,
				rotation = 0;
			if (trail || type === 'zoom-in' || type === 'zoom-out') {
				scale = 1 + phase * 0.3 * force + (trail ? smear : 0);
				if (type === 'zoom-out' || type === 'cross-zoom-out')
					scale = 1 / scale;
			}
			if (spin) {
				rotation =
					(type === 'spin-left' ? -1 : 1) *
						(source === from ? p : p - 1) *
						0.5 *
						force +
					smear * 0.3;
				scale = 1 + pulse * 0.15 * force;
			}
			if (type === 'squeeze-horizontal') sx = 1 / (1 + phase * force);
			if (type === 'squeeze-vertical') sy = 1 / (1 + phase * force);
			lens(ctx, source, scale * sx, scale * sy, rotation, patterns);
		}
	}
}
