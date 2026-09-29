/**
 * The SHAPE of the box around the intro's title.
 *
 * It used to be one stroked rectangle, because that is the first thing a box is.
 * The user asked for «múltiples formas y animaciones para eso y también poder
 * cambiarle el color», so the geometry lives here, as pure math: a shape is a
 * list of sub-paths of plain points, which the painter strokes and fills. Curves
 * are sampled into points on purpose — a polyline is testable without a canvas,
 * and at video resolution a 7-point corner is indistinguishable from an arc.
 */
import type { IntroTitleFrameShape } from '@/types/wallpaper';

export type FramePoint = { x: number; y: number };

export type FrameRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/** One stretch of outline. `closed` ones can be filled; open ones only drawn. */
export type FrameSubpath = {
	points: FramePoint[];
	closed: boolean;
};

export const INTRO_TITLE_FRAME_SHAPES: readonly IntroTitleFrameShape[] = [
	'rect',
	'rounded',
	'pill',
	'underline',
	'brackets',
	'ribbon',
	'diamond',
	'hexagon'
];

/** How many points one rounded corner is sampled with. */
const CORNER_SAMPLES = 7;

function corner(
	cx: number,
	cy: number,
	radius: number,
	fromRad: number,
	toRad: number
): FramePoint[] {
	const points: FramePoint[] = [];
	for (let i = 0; i <= CORNER_SAMPLES; i += 1) {
		const angle = fromRad + ((toRad - fromRad) * i) / CORNER_SAMPLES;
		points.push({
			x: cx + Math.cos(angle) * radius,
			y: cy + Math.sin(angle) * radius
		});
	}
	return points;
}

function roundedRect(rect: FrameRect, radius: number): FrameSubpath {
	const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
	const right = rect.x + rect.width;
	const bottom = rect.y + rect.height;
	const half = Math.PI / 2;
	return {
		closed: true,
		points: [
			...corner(rect.x + r, rect.y + r, r, Math.PI, Math.PI * 1.5),
			...corner(right - r, rect.y + r, r, -half, 0),
			...corner(right - r, bottom - r, r, 0, half),
			...corner(rect.x + r, bottom - r, r, half, Math.PI)
		]
	};
}

/**
 * The outline of one shape around `rect`.
 *
 * `rect` is the box the title needs; a shape that has to be wider than the text
 * to look right (the diamond, the hexagon) grows sideways rather than squeezing
 * the title, because the title is the message.
 */
export function resolveTitleFrameShape(
	shape: IntroTitleFrameShape,
	rect: FrameRect
): FrameSubpath[] {
	const { x, y, width, height } = rect;
	const right = x + width;
	const bottom = y + height;
	const midY = y + height / 2;
	const midX = x + width / 2;
	switch (shape) {
		case 'rounded':
			return [roundedRect(rect, height * 0.24)];
		case 'pill':
			return [roundedRect(rect, height / 2)];
		case 'underline': {
			// A rule under the title, as thick as the box's own bottom band.
			const thickness = height * 0.12;
			return [
				{
					closed: true,
					points: [
						{ x, y: bottom - thickness },
						{ x: right, y: bottom - thickness },
						{ x: right, y: bottom },
						{ x, y: bottom }
					]
				}
			];
		}
		case 'brackets': {
			// Two corner brackets, left and right: open paths, never filled.
			const reach = Math.min(width * 0.18, height * 0.9);
			return [
				{
					closed: false,
					points: [
						{ x: x + reach, y },
						{ x, y },
						{ x, y: bottom },
						{ x: x + reach, y: bottom }
					]
				},
				{
					closed: false,
					points: [
						{ x: right - reach, y },
						{ x: right, y },
						{ x: right, y: bottom },
						{ x: right - reach, y: bottom }
					]
				}
			];
		}
		case 'ribbon': {
			// A banner with notched ends.
			const notch = height * 0.34;
			return [
				{
					closed: true,
					points: [
						{ x: x - notch, y },
						{ x: right + notch, y },
						{ x: right, y: midY },
						{ x: right + notch, y: bottom },
						{ x: x - notch, y: bottom },
						{ x, y: midY }
					]
				}
			];
		}
		case 'diamond': {
			// The corners have to clear the text, so the box grows sideways.
			const reach = height * 0.9;
			return [
				{
					closed: true,
					points: [
						{ x: midX, y: y - height * 0.32 },
						{ x: right + reach, y: midY },
						{ x: midX, y: bottom + height * 0.32 },
						{ x: x - reach, y: midY }
					]
				}
			];
		}
		case 'hexagon': {
			const slant = height * 0.5;
			return [
				{
					closed: true,
					points: [
						{ x: x + slant * 0.3, y },
						{ x: right - slant * 0.3, y },
						{ x: right + slant * 0.7, y: midY },
						{ x: right - slant * 0.3, y: bottom },
						{ x: x + slant * 0.3, y: bottom },
						{ x: x - slant * 0.7, y: midY }
					]
				}
			];
		}
		case 'rect':
		default:
			return [
				{
					closed: true,
					points: [
						{ x, y },
						{ x: right, y },
						{ x: right, y: bottom },
						{ x, y: bottom }
					]
				}
			];
	}
}

/** The outline's total length, so a partial draw can be dashed exactly. */
export function outlineLength(subpaths: readonly FrameSubpath[]): number {
	let total = 0;
	for (const subpath of subpaths) {
		const points = subpath.points;
		for (let i = 1; i < points.length; i += 1) {
			const a = points[i - 1];
			const b = points[i];
			if (!a || !b) continue;
			total += Math.hypot(b.x - a.x, b.y - a.y);
		}
		if (subpath.closed && points.length > 1) {
			const first = points[0];
			const last = points[points.length - 1];
			if (first && last) {
				total += Math.hypot(first.x - last.x, first.y - last.y);
			}
		}
	}
	return total;
}

/**
 * The box the shape needs around a text box: a shape with pointed ends sticks
 * out, and the layout has to know so the title stack stays centred.
 */
export function titleFrameBounds(subpaths: readonly FrameSubpath[]): FrameRect {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const subpath of subpaths) {
		for (const point of subpath.points) {
			minX = Math.min(minX, point.x);
			minY = Math.min(minY, point.y);
			maxX = Math.max(maxX, point.x);
			maxY = Math.max(maxY, point.y);
		}
	}
	if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
