import { clamp } from '@/lib/math';
import type { SlideshowTransitionType } from '@/types/wallpaper';

const hash = (x: number, y: number) => {
	const n = Math.sin(x * 127.1 + y * 311.7 + 19.19) * 43758.5453;
	return n - Math.floor(n);
};
const smooth = (x: number) => {
	const t = clamp(x, 0, 1);
	return t * t * (3 - 2 * t);
};

/** Stable spatial fields: no clock noise, so scrubbing and export match. */
export function transitionMaskAlpha(
	type: SlideshowTransitionType,
	x: number,
	y: number,
	p: number,
	force: number,
	aspect: number
): number {
	if (p <= 0) return 0;
	if (p >= 1) return 1;
	let field = x;
	let reverse = false;
	const feather = 0.025 + force * 0.025;
	switch (type) {
		case 'iris-close':
			reverse = true; // falls through
		case 'iris':
			field =
				Math.hypot((x - 0.5) * aspect, y - 0.5) /
				(Math.hypot(aspect, 1) / 2);
			break;
		case 'diamond-close':
			reverse = true; // falls through
		case 'diamond':
			field = Math.abs(x - 0.5) + Math.abs(y - 0.5);
			break;
		case 'curtain-close':
			reverse = true; // falls through
		case 'curtain':
			field = Math.abs(x - 0.5) * 2;
			break;
		case 'diagonal-wipe-reverse':
			reverse = true; // falls through
		case 'diagonal-wipe':
			field = (x + y) / 2;
			break;
		case 'wipe-left':
			field = 1 - x;
			break;
		case 'wipe-up':
			field = 1 - y;
			break;
		case 'wipe-down':
			field = y;
			break;
		case 'bars-horizontal':
			field = x * 0.65 + hash(0, Math.floor(y * 12)) * 0.35;
			break;
		case 'bars-vertical':
			field = y * 0.65 + hash(Math.floor(x * 16), 0) * 0.35;
			break;
		case 'checkerboard':
			field =
				((Math.floor(x * 12) + Math.floor(y * 8)) % 2) * 0.45 +
				((x * 12) % 1) * 0.55;
			break;
		case 'mosaic':
			field =
				hash(Math.floor(x * 18), Math.floor(y * 12)) * 0.8 +
				((y * 12) % 1) * 0.2;
			break;
		case 'blur-dissolve':
			field = (hash(Math.floor(x * 48), Math.floor(y * 32)) + x + y) / 3;
			break;
		case 'wave':
			field =
				x * 0.8 +
				0.1 +
				Math.sin(y * Math.PI * 4 + p * Math.PI * 2) *
					0.1 *
					Math.min(force, 1);
			break;
	}
	if (reverse) field = 1 - field;
	return smooth((p * (1 + 2 * feather) - field) / (2 * feather));
}

/** Small alpha texture, smoothly upsampled; the images remain full resolution. */
export function paintTransitionMask(
	ctx: CanvasRenderingContext2D,
	type: SlideshowTransitionType,
	p: number,
	force: number,
	aspect: number
) {
	const { width, height } = ctx.canvas;
	const data = ctx.createImageData(width, height);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			data.data[(y * width + x) * 4 + 3] = Math.round(
				255 *
					transitionMaskAlpha(
						type,
						x / (width - 1),
						y / (height - 1),
						p,
						force,
						aspect
					)
			);
		}
	ctx.putImageData(data, 0, 0);
}
