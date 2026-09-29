/**
 * How the screen is CUT UP between the montage's images.
 *
 * A montage used to mean "rectangles in a grid", because a card was a box and a
 * box is all a box can be. This module replaces that with a tiling: a pattern
 * and an angle produce N polygons that cover the whole viewport, and the painter
 * clips each image to its own polygon. That is what makes stripes, triangles,
 * diamonds, waves, a lightning cut or a starburst possible with the same images
 * and the same timing.
 *
 * Two rules every pattern obeys, and the tests enforce:
 *
 * 1. **The tiling covers the viewport.** No pattern may leave a hole, because a
 *    hole is the backdrop showing through, which is the black the user kept
 *    seeing.
 * 2. **It is deterministic.** Same inputs, same polygons, so the live preview
 *    and the exported file are cut identically — `irregular` included, which
 *    jitters from a hash of the cell index and never from `Math.random`.
 *
 * Polygon points are in pixels RELATIVE TO THE CELL CENTRE, which is what the
 * painter wants: it translates to the centre, clips, and draws the image
 * covering the cell's bounding box.
 */

import type { IntroDivisionPattern } from '@/types/wallpaper';

export type { IntroDivisionPattern };

export const INTRO_DIVISION_PATTERNS: readonly IntroDivisionPattern[] = [
	'grid',
	'columns',
	'rows',
	'diagonal',
	'triangles',
	'diamonds',
	'wave',
	'lightning',
	'starburst',
	'irregular'
];

/** Which patterns the tilt actually changes; the UI greys it out for the rest. */
export const INTRO_ANGLED_PATTERNS: readonly IntroDivisionPattern[] = [
	'columns',
	'rows',
	'diagonal',
	'wave',
	'lightning'
];

export const INTRO_DIVISION_ANGLE_RANGE = { min: -90, max: 90 } as const;

export type Point = { x: number; y: number };

export type IntroDivisionCell = {
	index: number;
	/** Centre of the cell's bounding box, in viewport pixels. */
	x: number;
	y: number;
	/** The bounding box the image is drawn to cover. */
	width: number;
	height: number;
	/** The clip outline, in pixels relative to (x, y). At least 3 points. */
	polygon: Point[];
};

export type IntroViewportSize = { width: number; height: number };

function boundsOf(points: readonly Point[]): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const point of points) {
		if (point.x < minX) minX = point.x;
		if (point.x > maxX) maxX = point.x;
		if (point.y < minY) minY = point.y;
		if (point.y > maxY) maxY = point.y;
	}
	return {
		x: (minX + maxX) / 2,
		y: (minY + maxY) / 2,
		width: Math.max(1, maxX - minX),
		height: Math.max(1, maxY - minY)
	};
}

/** Absolute polygon → a cell whose points are relative to its own centre. */
function toCell(index: number, points: readonly Point[]): IntroDivisionCell {
	const box = boundsOf(points);
	return {
		index,
		x: box.x,
		y: box.y,
		width: box.width,
		height: box.height,
		polygon: points.map(point => ({
			x: point.x - box.x,
			y: point.y - box.y
		}))
	};
}

/**
 * A deterministic 0..1 value from a pair of integers.
 *
 * `irregular` needs jitter that is stable across machines, processes and the
 * offline render, so it hashes instead of sampling a generator.
 */
function hash01(a: number, b: number): number {
	const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return n - Math.floor(n);
}

/** Rows × columns that stay as square as the aspect allows. */
function gridShape(
	count: number,
	viewport: IntroViewportSize
): { columns: number; rows: number } {
	const aspect = viewport.width / Math.max(1, viewport.height);
	let columns = Math.max(1, Math.round(Math.sqrt(count * aspect)));
	let rows = Math.ceil(count / columns);
	// Prefer filling the last row over leaving a ragged one.
	while (columns * rows - count >= rows && columns > 1) {
		columns -= 1;
		rows = Math.ceil(count / columns);
	}
	return { columns, rows };
}

/**
 * Bands across the screen, in a frame rotated by `angleDeg`.
 *
 * The band axis is long enough (the viewport's diagonal) that a rotated band
 * still runs past both edges, which is what keeps a tilted pattern from leaving
 * triangles of backdrop in the corners. `border` displaces the boundary between
 * two bands, so the same code produces straight stripes, a wave or a bolt.
 */
function bandCells(options: {
	count: number;
	viewport: IntroViewportSize;
	angleDeg: number;
	/** Boundary displacement along the band, as a share of the band's width. */
	border?: (t: number, boundary: number) => number;
	samples?: number;
}): IntroDivisionCell[] {
	const { count, viewport, angleDeg } = options;
	const samples = Math.max(2, options.samples ?? 2);
	const cx = viewport.width / 2;
	const cy = viewport.height / 2;
	// The bands must cover the rotated bounding box of the viewport, hence the
	// diagonal — plus a margin, because a displaced border wanders outwards.
	const reach = Math.hypot(viewport.width, viewport.height) * 0.62;
	const rad = (angleDeg * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const toViewport = (u: number, v: number): Point => ({
		x: cx + u * cos - v * sin,
		y: cy + u * sin + v * cos
	});
	const bandWidth = (reach * 2) / count;
	const displace = (t: number, boundary: number): number =>
		options.border ? options.border(t, boundary) * bandWidth : 0;

	const cells: IntroDivisionCell[] = [];
	for (let index = 0; index < count; index += 1) {
		const v0 = -reach + index * bandWidth;
		const v1 = v0 + bandWidth;
		const points: Point[] = [];
		// Down the leading edge...
		for (let s = 0; s < samples; s += 1) {
			const t = s / (samples - 1);
			const u = -reach + t * reach * 2;
			points.push(toViewport(u, v0 + displace(t, index)));
		}
		// ...and back up the trailing one, so the polygon closes cleanly.
		for (let s = samples - 1; s >= 0; s -= 1) {
			const t = s / (samples - 1);
			const u = -reach + t * reach * 2;
			points.push(toViewport(u, v1 + displace(t, index + 1)));
		}
		cells.push(toCell(index, points));
	}
	return cells;
}

/** Rectangles, the classic. */
function gridCells(
	count: number,
	viewport: IntroViewportSize
): IntroDivisionCell[] {
	const { columns, rows } = gridShape(count, viewport);
	const cellW = viewport.width / columns;
	const cellH = viewport.height / rows;
	const cells: IntroDivisionCell[] = [];
	for (let index = 0; index < count; index += 1) {
		const column = index % columns;
		const row = Math.floor(index / columns);
		// The last row spreads to fill the width so nothing is left uncovered.
		const isLastRow = row === rows - 1;
		const lastRowCount = count - (rows - 1) * columns;
		const spanW =
			isLastRow && lastRowCount > 0
				? viewport.width / lastRowCount
				: cellW;
		const spanColumn = isLastRow ? index - (rows - 1) * columns : column;
		const x0 = spanColumn * spanW;
		const y0 = row * cellH;
		cells.push(
			toCell(index, [
				{ x: x0, y: y0 },
				{ x: x0 + spanW, y: y0 },
				{ x: x0 + spanW, y: y0 + cellH },
				{ x: x0, y: y0 + cellH }
			])
		);
	}
	return cells;
}

/** Every grid rectangle cut along a diagonal, alternating direction. */
function triangleCells(
	count: number,
	viewport: IntroViewportSize
): IntroDivisionCell[] {
	// Two triangles per rectangle, so half as many rectangles are needed.
	const pairs = Math.max(1, Math.ceil(count / 2));
	const boxes = gridCells(pairs, viewport);
	const cells: IntroDivisionCell[] = [];
	for (let index = 0; index < count; index += 1) {
		const box = boxes[Math.floor(index / 2)];
		if (!box) break;
		const left = box.x - box.width / 2;
		const top = box.y - box.height / 2;
		const right = left + box.width;
		const bottom = top + box.height;
		const flipped = Math.floor(index / 2) % 2 === 1;
		const upper = index % 2 === 0;
		// An odd image count leaves one rectangle without a partner: it keeps
		// the whole rectangle, rather than half of it and a hole.
		if (upper && index + 1 >= count) {
			cells.push(
				toCell(index, [
					{ x: left, y: top },
					{ x: right, y: top },
					{ x: right, y: bottom },
					{ x: left, y: bottom }
				])
			);
			continue;
		}
		const corners: Point[] = flipped
			? upper
				? [
						{ x: left, y: bottom },
						{ x: left, y: top },
						{ x: right, y: top }
					]
				: [
						{ x: right, y: top },
						{ x: right, y: bottom },
						{ x: left, y: bottom }
					]
			: upper
				? [
						{ x: left, y: top },
						{ x: right, y: top },
						{ x: right, y: bottom }
					]
				: [
						{ x: left, y: top },
						{ x: right, y: bottom },
						{ x: left, y: bottom }
					];
		cells.push(toCell(index, corners));
	}
	return cells;
}

/**
 * The row layout a lattice pattern uses: full rows of `columns`, and a final
 * row that spreads its leftover cells across the whole width.
 *
 * The horizontal border ABOVE a row with a different column count is kept
 * straight (`sharedBorder` says so), because the two rows no longer agree on
 * where the vertical lattice lines are. A straight border still covers — both
 * rows run edge to edge along it — while a displaced one would tear open.
 */
function rowLayout(
	count: number,
	viewport: IntroViewportSize
): {
	rows: number;
	cellH: number;
	rowOf: (index: number) => number;
	columnsIn: (row: number) => number;
	firstIndexOf: (row: number) => number;
	sharedBorder: (row: number) => boolean;
} {
	const { columns, rows } = gridShape(count, viewport);
	const lastRowCount = count - (rows - 1) * columns;
	const columnsIn = (row: number) =>
		row >= rows - 1 ? Math.max(1, lastRowCount) : columns;
	return {
		rows,
		cellH: viewport.height / rows,
		rowOf: index => Math.min(rows - 1, Math.floor(index / columns)),
		columnsIn,
		firstIndexOf: row => row * columns,
		// Border `row` is the line between rows `row - 1` and `row`.
		sharedBorder: row =>
			row > 0 && row < rows && columnsIn(row - 1) === columnsIn(row)
	};
}

/**
 * Diamonds: a grid whose every shared border is pushed into a point.
 *
 * Built from a LATTICE — the grid's corners plus one displaced midpoint per
 * edge — and each cell is drawn from those shared lattice values. Two
 * neighbours therefore read exactly the same numbers for the border between
 * them, which makes the tiling gapless by construction instead of by luck.
 * Midpoints on the frame of the screen are never displaced, or the pattern
 * would peel away from the edge and show the backdrop.
 */
function diamondCells(
	count: number,
	viewport: IntroViewportSize
): IntroDivisionCell[] {
	const layout = rowLayout(count, viewport);
	const depth = 0.22;
	const cells: IntroDivisionCell[] = [];
	for (let index = 0; index < count; index += 1) {
		const r = layout.rowOf(index);
		const columns = layout.columnsIn(r);
		const cellW = viewport.width / columns;
		const c = index - layout.firstIndexOf(r);
		const top = r * layout.cellH;
		const bottom = top + layout.cellH;
		const left = c * cellW;
		const right = left + cellW;
		const hPush = (row: number, column: number): number =>
			layout.sharedBorder(row)
				? ((column + row) % 2 === 0 ? -1 : 1) * layout.cellH * depth
				: 0;
		const vPush = (column: number): number =>
			column === 0 || column === columns
				? 0
				: ((column + r) % 2 === 0 ? 1 : -1) * cellW * depth;
		cells.push(
			toCell(index, [
				{ x: left, y: top },
				{ x: (left + right) / 2, y: top + hPush(r, c) },
				{ x: right, y: top },
				{ x: right + vPush(c + 1), y: (top + bottom) / 2 },
				{ x: right, y: bottom },
				{ x: (left + right) / 2, y: bottom + hPush(r + 1, c) },
				{ x: left, y: bottom },
				{ x: left + vPush(c), y: (top + bottom) / 2 }
			])
		);
	}
	return cells;
}

/** Wedges from the centre with a spiky outer edge: the starburst. */
function starburstCells(
	count: number,
	viewport: IntroViewportSize
): IntroDivisionCell[] {
	// Under three images there is no wedge fan to speak of, and a single wedge
	// cannot close on itself: fall back to plain bands.
	if (count < 3) return gridCells(count, viewport);
	const cx = viewport.width / 2;
	const cy = viewport.height / 2;
	const reach = Math.hypot(viewport.width, viewport.height);
	const step = (Math.PI * 2) / count;
	const cells: IntroDivisionCell[] = [];
	for (let index = 0; index < count; index += 1) {
		const from = -Math.PI / 2 + index * step;
		const to = from + step;
		const mid = (from + to) / 2;
		// Long point, short shoulders: a star, not a pie chart. The wedge still
		// reaches past the corners, so the middle of the screen is covered.
		const points: Point[] = [
			{ x: cx, y: cy },
			{
				x: cx + Math.cos(from) * reach * 0.72,
				y: cy + Math.sin(from) * reach * 0.72
			},
			{ x: cx + Math.cos(mid) * reach, y: cy + Math.sin(mid) * reach },
			{
				x: cx + Math.cos(to) * reach * 0.72,
				y: cy + Math.sin(to) * reach * 0.72
			}
		];
		cells.push(toCell(index, points));
	}
	return cells;
}

/** A grid whose inner corners are pushed around: hand-torn, but repeatable. */
function irregularCells(
	count: number,
	viewport: IntroViewportSize
): IntroDivisionCell[] {
	const layout = rowLayout(count, viewport);
	const cells: IntroDivisionCell[] = [];
	for (let index = 0; index < count; index += 1) {
		const r = layout.rowOf(index);
		const columns = layout.columnsIn(r);
		const cellW = viewport.width / columns;
		const c = index - layout.firstIndexOf(r);
		/**
		 * A lattice corner. Both neighbours of a corner compute it from the
		 * same hash, so the tiling stays sealed; corners on the frame, and on a
		 * border two rows disagree about, never move.
		 */
		const corner = (column: number, row: number): Point => {
			const freeX = column > 0 && column < columns;
			const freeY = layout.sharedBorder(row);
			return {
				x:
					column * cellW +
					(freeX ? (hash01(column, row) - 0.5) * cellW * 0.3 : 0),
				y:
					row * layout.cellH +
					(freeY
						? (hash01(row + 97, column + 31) - 0.5) *
							layout.cellH *
							0.3
						: 0)
			};
		};
		cells.push(
			toCell(index, [
				corner(c, r),
				corner(c + 1, r),
				corner(c + 1, r + 1),
				corner(c, r + 1)
			])
		);
	}
	return cells;
}

/**
 * The tiling for one pattern.
 *
 * `count` cells, always: a pattern that cannot express the requested number
 * falls back to a shape that can, because "one image was dropped" is a bug the
 * user would see and never be told about.
 */
export function resolveIntroDivisions(options: {
	pattern: IntroDivisionPattern;
	count: number;
	viewport: IntroViewportSize;
	angleDeg?: number;
}): IntroDivisionCell[] {
	const count = Math.max(1, Math.round(options.count));
	const viewport = {
		width: Math.max(1, options.viewport.width),
		height: Math.max(1, options.viewport.height)
	};
	const angle = options.angleDeg ?? 0;
	switch (options.pattern) {
		case 'columns':
			return bandCells({ count, viewport, angleDeg: angle + 90 });
		case 'rows':
			return bandCells({ count, viewport, angleDeg: angle });
		case 'diagonal':
			return bandCells({ count, viewport, angleDeg: angle + 35 });
		case 'wave':
			return bandCells({
				count,
				viewport,
				angleDeg: angle,
				// A full sine along the band, a quarter of a band deep, offset
				// per boundary so neighbouring waves interlock instead of
				// sliding in parallel.
				border: (t, boundary) =>
					Math.sin(t * Math.PI * 2 + boundary * 0.7) * 0.25,
				samples: 28
			});
		case 'lightning':
			return bandCells({
				count,
				viewport,
				angleDeg: angle,
				// A triangle wave with a hard kink: the bolt.
				border: (t, boundary) => {
					const phase = (t * 3 + boundary * 0.37) % 1;
					const saw = phase < 0.5 ? phase * 2 : 2 - phase * 2;
					return (saw - 0.5) * 0.5;
				},
				samples: 13
			});
		case 'triangles':
			return triangleCells(count, viewport);
		case 'diamonds':
			return diamondCells(count, viewport);
		case 'starburst':
			return starburstCells(count, viewport);
		case 'irregular':
			return irregularCells(count, viewport);
		case 'grid':
		default:
			return gridCells(count, viewport);
	}
}

/** Whether a point is inside a polygon. Even-odd rule; used by the tests. */
export function polygonContains(
	polygon: readonly Point[],
	point: Point
): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
		const a = polygon[i];
		const b = polygon[j];
		if (!a || !b) continue;
		const straddles = a.y > point.y !== b.y > point.y;
		if (!straddles) continue;
		const x = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
		if (point.x < x) inside = !inside;
	}
	return inside;
}
