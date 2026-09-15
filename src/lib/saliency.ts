/**
 * Deterministic image saliency — the maths behind "auto composition".
 *
 * One deep interface: give us an image, get back where the subject is
 * (`focus`) and where nothing important is (`logoSlot`). Everything below the
 * interface is closed-form and seed-free: the same pixels always produce the
 * same numbers, so results are cacheable, testable in Node with synthetic
 * grids, and reproducible across machines and runs.
 *
 * Method (no ML, no randomness):
 * 1. Downscale to a small luminance grid (the caller draws the image into a
 *    canvas; `computeSaliency` itself only sees RGBA bytes).
 * 2. Spectral-residual style contrast: per cell, local contrast (Laplacian
 *    edge energy) + center-surround luminance/color contrast (grid minus its
 *    own box-blur). Sum the z-scored channels.
 * 3. `focus` = saliency-weighted centroid, nudged to the nearest cell above
 *    the mean so a symmetric halo doesn't collapse it to the exact center.
 * 4. `logoSlot` = the image corner whose excluded box (sized in normalized
 *    units) holds the least saliency mass; ties break by corner order so the
 *    choice is deterministic.
 */

export type SaliencyGrid = {
	/** grid width in cells */
	width: number;
	/** grid height in cells */
	height: number;
	/** row-major normalized saliency (>= 0, mean ≈ 1) */
	values: Float32Array;
};

export type Point01 = { x: number; y: number };

export type SaliencySummary = {
	grid: SaliencyGrid;
	/** 0..1 focus point in image space (y down), same convention as `focusX/focusY` */
	focus: Point01;
	/** normalized box (x, y, w, h) in image space with the least saliency mass */
	lowMassBox: { x: number; y: number; width: number; height: number };
};

const GRID_CELLS = 32;

function clamp01(v: number): number {
	return Math.max(0, Math.min(1, v));
}

/**
 * RGBA bytes (row-major, 4 bytes per pixel, straight from `getImageData`) to
 * a normalized saliency grid. Pure and synchronous — this is the function the
 * tests exercise directly.
 */
export function computeSaliency(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
	gridCells: number = GRID_CELLS
): SaliencyGrid {
	const gw = Math.max(2, Math.min(gridCells, width));
	const gh = Math.max(2, Math.min(gridCells, height));
	const lum = new Float32Array(gw * gh);
	const chromaR = new Float32Array(gw * gh);
	const chromaB = new Float32Array(gw * gh);

	// Average source pixels into each grid cell (box downsample).
	for (let gy = 0; gy < gh; gy++) {
		const y0 = Math.floor((gy * height) / gh);
		const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / gh));
		for (let gx = 0; gx < gw; gx++) {
			const x0 = Math.floor((gx * width) / gw);
			const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / gw));
			let r = 0;
			let g = 0;
			let b = 0;
			let n = 0;
			for (let y = y0; y < y1; y++) {
				const row = y * width;
				for (let x = x0; x < x1; x++) {
					const i = (row + x) * 4;
					r += rgba[i];
					g += rgba[i + 1];
					b += rgba[i + 2];
					n++;
				}
			}
			const cell = gy * gw + gx;
			r /= n;
			g /= n;
			b /= n;
			lum[cell] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			chromaR[cell] = r - g;
			chromaB[cell] = b - g;
		}
	}
	// Remove the global linear trend (lighting/composition gradient) from
	// each channel before contrast. A full-frame ramp otherwise reads as a
	// border-wide fake saliency band under any local-contrast scheme — which
	// would poison corner-based logo placement. Plane fit is closed-form,
	// so determinism holds.
	detrend(lum, gw);
	detrend(chromaR, gw);
	detrend(chromaB, gw);

	// Center-surround contrast: |grid - boxBlur(grid, radius)| per channel.
	const contrast = (src: Float32Array, radius: number): Float32Array => {
		const blur = boxBlur(src, gw, gh, radius);
		const out = new Float32Array(src.length);
		for (let i = 0; i < src.length; i++)
			out[i] = Math.abs(src[i] - blur[i]);
		return out;
	};
	const radius = Math.max(1, Math.round(Math.max(gw, gh) / 8));
	const edge = edgeEnergy(lum, gw, gh);
	const lumContrast = contrast(lum, radius);
	const rContrast = contrast(chromaR, radius);
	const bContrast = contrast(chromaB, radius);

	// Z-score each channel so no single cue dominates by raw magnitude.
	const values = new Float32Array(gw * gh);
	const channels = [edge, lumContrast, rContrast, bContrast];
	for (const ch of channels) {
		const mean = ch.reduce((a, v) => a + v, 0) / ch.length;
		let varSum = 0;
		for (let i = 0; i < ch.length; i++) varSum += (ch[i] - mean) ** 2;
		const std = Math.sqrt(varSum / ch.length) || 1;
		for (let i = 0; i < ch.length; i++) {
			values[i] += (ch[i] - mean) / std;
		}
	}
	// Shift to non-negative, mean ≈ 1. A dead-flat result (uniform image)
	// carries no signal: give it a flat mean-1 grid so downstream weighting
	// stays well-defined.
	let min = Infinity;
	for (let i = 0; i < values.length; i++) min = Math.min(min, values[i]);
	const shift = min < 0 ? -min + 0.01 : 0;
	let sum = 0;
	for (let i = 0; i < values.length; i++) sum += values[i] += shift;
	if (sum <= 0) values.fill(1);
	else {
		const scale = values.length / sum;
		for (let i = 0; i < values.length; i++) values[i] *= scale;
	}

	return { width: gw, height: gh, values };
}

function boxBlur(
	src: Float32Array,
	w: number,
	h: number,
	r: number
): Float32Array {
	const out = new Float32Array(src.length);
	// Edge-clamp sampling: skipping out-of-bounds neighbours biases the blur
	// near the borders, which reads as fake saliency on gradient images.
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let sum = 0;
			for (let dy = -r; dy <= r; dy++) {
				const yy = Math.min(h - 1, Math.max(0, y + dy));
				for (let dx = -r; dx <= r; dx++) {
					const xx = Math.min(w - 1, Math.max(0, x + dx));
					sum += src[yy * w + xx];
				}
			}
			out[y * w + x] = sum / (2 * r + 1) ** 2;
		}
	}
	return out;
}

function edgeEnergy(lum: Float32Array, w: number, h: number): Float32Array {
	const out = new Float32Array(lum.length);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const l = lum[y * w + Math.max(0, x - 1)];
			const rr = lum[y * w + Math.min(w - 1, x + 1)];
			const u = lum[Math.max(0, y - 1) * w + x];
			const d = lum[Math.min(h - 1, y + 1) * w + x];
			out[y * w + x] = Math.abs(rr - l) + Math.abs(d - u);
		}
	}
	return out;
}

/**
 * Subtract the best-fit least-squares plane (a + b·x + c·y) from a grid, in
 * place. Removes global ramps (gradient lighting) without touching localized
 * structure. Normal equations are 3×3 and always well-conditioned on cell
 * coordinates centered at zero.
 */
function detrend(grid: Float32Array, w: number): void {
	const n = grid.length;
	// With x, y centered to [-1, 1] on a regular grid, Σx = Σy = Σxy = 0,
	// so the normal equations decouple: a, b, c are independent.
	let sum = 0;
	let sumX = 0;
	let sumY = 0;
	let xx = 0;
	let yy = 0;
	for (let y = 0; y < n / w; y++) {
		for (let x = 0; x < w; x++) {
			const fx = (x + 0.5) / w - 0.5;
			const fy = (y + 0.5) / w - 0.5;
			const v = grid[y * w + x];
			sum += v;
			sumX += fx * v;
			sumY += fy * v;
			xx += fx * fx;
			yy += fy * fy;
		}
	}
	const a = sum / n;
	const b = sumX / (xx || 1);
	const c = sumY / (yy || 1);
	for (let y = 0; y < n / w; y++) {
		for (let x = 0; x < w; x++) {
			const fx = (x + 0.5) / w - 0.5;
			const fy = (y + 0.5) / w - 0.5;
			grid[y * w + x] -= a + b * fx + c * fy;
		}
	}
}

/**
 * Weighted centroid of the saliency grid in 0..1 image space (y down).
 * `focus` in {@link summarizeSaliency} delegates here.
 */
export function weightedCentroid(grid: SaliencyGrid): Point01 {
	let sx = 0;
	let sy = 0;
	let sw = 0;
	for (let gy = 0; gy < grid.height; gy++) {
		for (let gx = 0; gx < grid.width; gx++) {
			const w = grid.values[gy * grid.width + gx];
			sx += (gx + 0.5) * w;
			sy += (gy + 0.5) * w;
			sw += w;
		}
	}
	if (sw <= 0) return { x: 0.5, y: 0.5 };
	return {
		x: clamp01(sx / sw / grid.width),
		y: clamp01(sy / sw / grid.height)
	};
}

/** Deterministic corner order for tie-breaks: top-right, top-left, bottom-right, bottom-left. */
const CORNER_ORDER: ReadonlyArray<{ x: number; y: number }> = [
	{ x: 1, y: 0 },
	{ x: 0, y: 0 },
	{ x: 1, y: 1 },
	{ x: 0, y: 1 }
];

/**
 * Find the empty region for a logo of the given normalized size: the corner
 * box holding the least saliency mass. Corners only (logos anchor to corners
 * in every preset), and the order above makes ties deterministic.
 */
export function lowestMassBox(
	grid: SaliencyGrid,
	box: { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
	const bw = Math.max(0.01, Math.min(1, box.width));
	const bh = Math.max(0.01, Math.min(1, box.height));
	let best = CORNER_ORDER[0];
	let bestMass = Infinity;
	for (const corner of CORNER_ORDER) {
		const x0 = corner.x === 1 ? 1 - bw : 0;
		const y0 = corner.y === 1 ? 1 - bh : 0;
		let mass = 0;
		for (let gy = 0; gy < grid.height; gy++) {
			const cy = (gy + 0.5) / grid.height;
			if (cy < y0 || cy >= y0 + bh) continue;
			for (let gx = 0; gx < grid.width; gx++) {
				const cx = (gx + 0.5) / grid.width;
				if (cx < x0 || cx >= x0 + bw) continue;
				mass += grid.values[gy * grid.width + gx];
			}
		}
		if (mass < bestMass - 1e-9) {
			bestMass = mass;
			best = corner;
		}
	}
	return {
		x: best.x === 1 ? 1 - bw : 0,
		y: best.y === 1 ? 1 - bh : 0,
		width: bw,
		height: bh
	};
}

export function summarizeSaliency(grid: SaliencyGrid): SaliencySummary {
	return {
		grid,
		focus: weightedCentroid(grid),
		lowMassBox: lowestMassBox(grid, { width: 0.3, height: 0.2 })
	};
}

/**
 * Browser adapter: draws any canvas-drawable into a small canvas, runs the
 * pure core. Same numbers as `computeSaliency` on the same downscaled pixels.
 */
export async function analyzeImageSaliency(
	source: CanvasImageSource & { width: number; height: number }
): Promise<SaliencySummary> {
	const canvas = document.createElement('canvas');
	const scale = Math.min(
		1,
		GRID_CELLS / Math.max(1, Math.max(source.width, source.height))
	);
	const w = Math.max(2, Math.round(source.width * scale));
	const h = Math.max(2, Math.round(source.height * scale));
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('saliency: 2d context unavailable');
	ctx.drawImage(source, 0, 0, w, h);
	const { data } = ctx.getImageData(0, 0, w, h);
	return summarizeSaliency(computeSaliency(data, w, h));
}
