/**
 * Estimating WHERE the interesting part of an image is.
 *
 * Two points per image, both normalised 0..1 over the image itself:
 *
 * - the **face focus**: where the subject's face is, so anything that has to
 *   crop or centre an image can keep the face in frame instead of slicing it;
 * - the **logo focus**: the calmest place to drop the mark and its spectrum, so
 *   they stop landing on top of that face.
 *
 * There is no face-detection model here on purpose: shipping one would mean
 * megabytes of weights and a load step for something the user can correct with
 * two sliders. What this does is a colour + detail heuristic tuned for anime
 * art, which is what this app is full of: anime faces are large, pale, warm and
 * low-saturation, and they sit in a region of high local detail (eyes, mouth,
 * hair edges). The estimate is explicitly an estimate — it reports a confidence
 * and the user can always override it by hand.
 *
 * The scoring works on a small grid of cells, never on the full image, so the
 * whole analysis is a few thousand operations regardless of resolution.
 */

/** A normalised point on the image, plus how much the estimate is trusted. */
export type ImageFocusPoint = {
	x: number;
	y: number;
	/** 0 = "this is just the default", 1 = "unmistakable". */
	confidence: number;
};

export type ImageFocusEstimate = {
	face: ImageFocusPoint;
	logo: ImageFocusPoint;
};

/** How many cells across the analysis grid is. Square, whatever the aspect. */
export const FOCUS_GRID = 24;

/** Where a face is assumed to be when nothing can be measured: upper middle. */
export const FOCUS_FALLBACK_FACE = { x: 0.5, y: 0.38 } as const;

/** And where a mark goes when nothing can be measured: lower middle. */
export const FOCUS_FALLBACK_LOGO = { x: 0.5, y: 0.76 } as const;

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Per-cell measurements of one image. Kept as plain arrays of `FOCUS_GRID²`
 * numbers so the scoring is testable without a canvas.
 */
export type FocusGrid = {
	/** How much of the cell looks like skin, 0..1. */
	skin: Float32Array;
	/** How much luminance detail the cell holds, 0..1 (normalised). */
	detail: Float32Array;
};

function toHsv(
	r: number,
	g: number,
	b: number
): { hue: number; sat: number; val: number } {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const val = max / 255;
	const delta = max - min;
	const sat = max === 0 ? 0 : delta / max;
	let hue = 0;
	if (delta !== 0) {
		if (max === r) hue = ((g - b) / delta) % 6;
		else if (max === g) hue = (b - r) / delta + 2;
		else hue = (r - g) / delta + 4;
		hue /= 6;
		if (hue < 0) hue += 1;
	}
	return { hue, sat, val };
}

/**
 * How much one pixel looks like anime skin, 0..1.
 *
 * Warm hue, moderate saturation, bright. The bands are generous because anime
 * skin is stylised and shaded; a hard rule would miss every character drawn in
 * a warm or cold light.
 */
export function skinLikeness(r: number, g: number, b: number): number {
	const { hue, sat, val } = toHsv(r, g, b);
	if (val < 0.42) return 0;
	// 0.01..0.13 of the wheel is roughly red-orange through yellow.
	const hueScore =
		hue <= 0.14 ? 1 - Math.abs(hue - 0.065) / 0.075 : hue >= 0.96 ? 0.6 : 0;
	if (hueScore <= 0) return 0;
	const satScore =
		sat < 0.06
			? sat / 0.06
			: sat <= 0.55
				? 1
				: Math.max(0, (0.8 - sat) / 0.25);
	if (satScore <= 0) return 0;
	const valScore = val >= 0.6 ? 1 : (val - 0.42) / 0.18;
	return clamp01(hueScore) * clamp01(satScore) * clamp01(valScore);
}

/**
 * The best window of the grid for a given score, as a normalised point.
 *
 * A single hot cell is noise — a cheek, a hand, one bright pixel. What matters
 * is a RUN of them, so the scan sums a square window and then takes the
 * score-weighted centroid inside the winner, which lands the point on the
 * middle of the blob instead of the middle of the window.
 */
export function pickFocusWindow(
	score: Float32Array,
	windowCells: number,
	grid = FOCUS_GRID
): ImageFocusPoint {
	const span = Math.max(1, Math.min(grid, Math.round(windowCells)));
	let bestSum = -1;
	let bestX = 0;
	let bestY = 0;
	for (let y = 0; y + span <= grid; y += 1) {
		for (let x = 0; x + span <= grid; x += 1) {
			let sum = 0;
			for (let dy = 0; dy < span; dy += 1) {
				for (let dx = 0; dx < span; dx += 1) {
					sum += score[(y + dy) * grid + (x + dx)] ?? 0;
				}
			}
			if (sum > bestSum) {
				bestSum = sum;
				bestX = x;
				bestY = y;
			}
		}
	}
	let weight = 0;
	let cx = 0;
	let cy = 0;
	for (let dy = 0; dy < span; dy += 1) {
		for (let dx = 0; dx < span; dx += 1) {
			const w = score[(bestY + dy) * grid + (bestX + dx)] ?? 0;
			weight += w;
			cx += w * (bestX + dx + 0.5);
			cy += w * (bestY + dy + 0.5);
		}
	}
	if (weight <= 0) {
		return {
			x: (bestX + span / 2) / grid,
			y: (bestY + span / 2) / grid,
			confidence: 0
		};
	}
	return {
		x: clamp01(cx / weight / grid),
		y: clamp01(cy / weight / grid),
		// Average score inside the window: a window of solid skin scores 1.
		confidence: clamp01(bestSum / (span * span))
	};
}

/**
 * Turn a grid of measurements into the two points.
 *
 * The face is where skin and detail agree. The mark goes where NEITHER of them
 * is — a calm, faceless area — and, all else equal, as far from the face as the
 * image allows, which is what stops a logo from sitting on a chin.
 */
export function resolveFocusFromGrid(
	measurements: FocusGrid,
	grid = FOCUS_GRID
): ImageFocusEstimate {
	const cells = grid * grid;
	const faceScore = new Float32Array(cells);
	for (let i = 0; i < cells; i += 1) {
		const skin = measurements.skin[i] ?? 0;
		const detail = measurements.detail[i] ?? 0;
		// Skin leads; detail only confirms. A flat wall of skin tone (a beach,
		// a sunset) must not outscore an actual face.
		faceScore[i] = skin * (0.55 + 0.45 * detail);
	}
	const face = pickFocusWindow(faceScore, Math.round(grid * 0.3), grid);
	const usableFace = face.confidence >= 0.06;
	const anchor = usableFace ? face : FOCUS_FALLBACK_FACE;

	const logoScore = new Float32Array(cells);
	for (let i = 0; i < cells; i += 1) {
		const x = (i % grid) + 0.5;
		const y = Math.floor(i / grid) + 0.5;
		const distance = Math.hypot(x / grid - anchor.x, y / grid - anchor.y);
		const calm =
			(1 - (measurements.skin[i] ?? 0)) *
			(1 - (measurements.detail[i] ?? 0));
		logoScore[i] = calm * (0.4 + 0.6 * clamp01(distance / 0.6));
	}
	const logo = pickFocusWindow(logoScore, Math.round(grid * 0.28), grid);

	return {
		face: usableFace
			? face
			: { ...FOCUS_FALLBACK_FACE, confidence: face.confidence },
		logo:
			logo.confidence > 0
				? logo
				: { ...FOCUS_FALLBACK_LOGO, confidence: 0 }
	};
}

/** Build the grid from raw RGBA pixels of a `width`×`height` sample. */
export function measureFocusGrid(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	grid = FOCUS_GRID
): FocusGrid {
	const cells = grid * grid;
	const skin = new Float32Array(cells);
	const detail = new Float32Array(cells);
	const counts = new Uint32Array(cells);
	const luma = new Float32Array(width * height);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const p = (y * width + x) * 4;
			const r = pixels[p] ?? 0;
			const g = pixels[p + 1] ?? 0;
			const b = pixels[p + 2] ?? 0;
			const alpha = (pixels[p + 3] ?? 255) / 255;
			luma[y * width + x] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
			const cell =
				Math.min(grid - 1, Math.floor((y / height) * grid)) * grid +
				Math.min(grid - 1, Math.floor((x / width) * grid));
			counts[cell] = (counts[cell] ?? 0) + 1;
			skin[cell] = (skin[cell] ?? 0) + skinLikeness(r, g, b) * alpha;
		}
	}
	// Detail = mean absolute luminance gradient inside the cell. Cheap, and it
	// is exactly what "there are eyes and a mouth here" looks like numerically.
	let maxDetail = 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const here = luma[y * width + x] ?? 0;
			const right = luma[y * width + Math.min(width - 1, x + 1)] ?? here;
			const down = luma[Math.min(height - 1, y + 1) * width + x] ?? here;
			const cell =
				Math.min(grid - 1, Math.floor((y / height) * grid)) * grid +
				Math.min(grid - 1, Math.floor((x / width) * grid));
			const value =
				(detail[cell] ?? 0) +
				Math.abs(here - right) +
				Math.abs(here - down);
			detail[cell] = value;
		}
	}
	for (let i = 0; i < cells; i += 1) {
		const count = counts[i] ?? 0;
		if (count > 0) {
			skin[i] = (skin[i] ?? 0) / count;
			detail[i] = (detail[i] ?? 0) / count;
		}
		maxDetail = Math.max(maxDetail, detail[i] ?? 0);
	}
	if (maxDetail > 0) {
		for (let i = 0; i < cells; i += 1)
			detail[i] = (detail[i] ?? 0) / maxDetail;
	}
	return { skin, detail };
}

/** What a focus estimate can be read from — an `<img>` live, a bitmap offline. */
export type FocusImageSource = CanvasImageSource & {
	width: number;
	height: number;
};

/**
 * Estimate both focus points of a loaded image.
 *
 * Returns the fallbacks (confidence 0) when the pixels cannot be read, which
 * happens for a cross-origin image: an estimate the user can nudge beats an
 * exception in the middle of a slideshow.
 */
export function estimateImageFocus(
	source: FocusImageSource,
	sampleSize = 64
): ImageFocusEstimate {
	const sw = source.width;
	const sh = source.height;
	if (!(sw > 0 && sh > 0)) {
		return {
			face: { ...FOCUS_FALLBACK_FACE, confidence: 0 },
			logo: { ...FOCUS_FALLBACK_LOGO, confidence: 0 }
		};
	}
	const width = Math.max(8, Math.min(sampleSize, Math.round(sampleSize)));
	const height = Math.max(
		8,
		Math.round((width * sh) / Math.max(1, sw)) || width
	);
	try {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) throw new Error('no 2d context');
		ctx.drawImage(source, 0, 0, width, height);
		const pixels = ctx.getImageData(0, 0, width, height).data;
		return resolveFocusFromGrid(measureFocusGrid(pixels, width, height));
	} catch {
		return {
			face: { ...FOCUS_FALLBACK_FACE, confidence: 0 },
			logo: { ...FOCUS_FALLBACK_LOGO, confidence: 0 }
		};
	}
}
