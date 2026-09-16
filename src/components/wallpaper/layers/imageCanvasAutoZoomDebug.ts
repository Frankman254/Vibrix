import { resolveImageTransform } from '@/features/background/domain/resolveImageTransform';

import type { BackgroundImageSnapshot } from '@/features/background/imageLayerGeometry';
import type { WallpaperState } from '@/types/wallpaper';
/**
 * Debug overlay: draws the Keep-Covered (AutoZoom) machinery on top of the
 * live background canvas so the coverage clamp is visible while authoring.
 *
 * Two frames per tile composition, both in canvas pixels:
 *
 *   - amber dashed = what the user AUTHORED (authored scale, no coverage
 *     lock, no reactive boost)
 *   - solid green  = what is actually DRAWN (effective scale + clamp)
 *
 * Plus a text row: authored / minimum-for-coverage / effective scales and the
 * transform warnings (`scale-raised-for-coverage`,
 * `position-clamped-for-coverage`). When AutoZoom is off or nothing is
 * clamped the two frames coincide and the text confirms it — the overlay
 * never hides the difference it exists to show.
 *
 * Deep by design: the caller hands it the same inputs the renderer already
 * has; the double `resolveImageTransform` (authored vs effective) is this
 * module's private business.
 */
export type AutoZoomDebugOverlayParams = {
	ctx: CanvasRenderingContext2D;
	viewportWidth: number;
	viewportHeight: number;
	imageWidth: number;
	imageHeight: number;
	snapshot: BackgroundImageSnapshot;
	reactiveScaleBoost: number;
	parallaxX: number;
	parallaxY: number;
	layout?: Pick<
		WallpaperState,
		| 'layoutResponsiveEnabled'
		| 'layoutBackgroundReframeEnabled'
		| 'layoutReferenceWidth'
		| 'layoutReferenceHeight'
	>;
};

const COLOR_AUTHORED = 'rgba(255, 176, 0, 0.9)';
const COLOR_EFFECTIVE = 'rgba(0, 255, 140, 0.9)';
const COLOR_TEXT = 'rgba(255, 255, 255, 0.95)';

function strokeRect(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	width: number,
	height: number,
	rotationDeg: number
): void {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate((rotationDeg * Math.PI) / 180);
	ctx.strokeRect(-width / 2, -height / 2, width, height);
	ctx.restore();
}

function strokeRectSet(
	ctx: CanvasRenderingContext2D,
	rects: ReturnType<typeof resolveImageTransform>['drawRects']
): void {
	for (const rect of rects) {
		strokeRect(
			ctx,
			rect.cx,
			rect.cy,
			rect.width,
			rect.height,
			rect.rotation
		);
	}
}

function unionBounds(
	rects: ReturnType<typeof resolveImageTransform>['drawRects']
): { minX: number; maxX: number; minY: number; maxY: number } | null {
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const rect of rects) {
		// Axis-aligned union of the rotated tiles: enough to frame the whole
		// composition; per-tile outlines are drawn separately.
		const rad = (rect.rotation * Math.PI) / 180;
		const cos = Math.abs(Math.cos(rad));
		const sin = Math.abs(Math.sin(rad));
		const halfW = (rect.width * cos + rect.height * sin) / 2;
		const halfH = (rect.width * sin + rect.height * cos) / 2;
		minX = Math.min(minX, rect.cx - halfW);
		maxX = Math.max(maxX, rect.cx + halfW);
		minY = Math.min(minY, rect.cy - halfH);
		maxY = Math.max(maxY, rect.cy + halfH);
	}
	if (!Number.isFinite(minX)) return null;
	return { minX, maxX, minY, maxY };
}

export function drawAutoZoomDebugOverlay({
	ctx,
	viewportWidth,
	viewportHeight,
	imageWidth,
	imageHeight,
	snapshot,
	reactiveScaleBoost,
	parallaxX,
	parallaxY,
	layout
}: AutoZoomDebugOverlayParams): void {
	const common = {
		viewportWidth,
		viewportHeight,
		imageWidth,
		imageHeight,
		fitMode: snapshot.fitMode,
		positionX: snapshot.positionX,
		positionY: snapshot.positionY,
		rotation: snapshot.rotation,
		mirror: snapshot.mirror,
		focusX: snapshot.focusX,
		focusY: snapshot.focusY,
		mirrorFill: snapshot.mirrorFill,
		mirrorFillInvert: snapshot.mirrorFillInvert,
		mirrorFillCount: snapshot.mirrorFillCount,
		parallaxX,
		parallaxY,
		layout
	};
	const effective = resolveImageTransform({
		...common,
		scale: snapshot.scale,
		keepCovered: snapshot.coverageLockEnabled,
		reactiveScaleBoost
	});
	const authored = resolveImageTransform({
		...common,
		scale: snapshot.scale,
		keepCovered: false,
		reactiveScaleBoost: 0
	});

	const font = Math.max(11, Math.round(viewportHeight * 0.016));
	ctx.save();
	ctx.lineWidth = Math.max(2, Math.round(viewportHeight / 400));

	// Authored composition: dashed amber, per tile.
	ctx.strokeStyle = COLOR_AUTHORED;
	ctx.setLineDash([font * 0.6, font * 0.35]);
	strokeRectSet(ctx, authored.drawRects);

	// Effective (drawn) composition: solid green, per tile + union frame.
	ctx.setLineDash([]);
	ctx.strokeStyle = COLOR_EFFECTIVE;
	strokeRectSet(ctx, effective.drawRects);
	const union = unionBounds(effective.drawRects);
	if (union) {
		ctx.lineWidth = Math.max(1, ctx.lineWidth / 2);
		ctx.strokeRect(
			union.minX,
			union.minY,
			union.maxX - union.minX,
			union.maxY - union.minY
		);
	}

	// Text readout bottom-left.
	ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, monospace`;
	ctx.textBaseline = 'bottom';
	ctx.fillStyle = COLOR_TEXT;
	const rows = [
		`authored ${authored.effectiveScale.toFixed(3)}   min ${effective.minScaleForCoverage.toFixed(3)}   drawn ${effective.effectiveScale.toFixed(3)}`,
		...(effective.warnings.length > 0
			? [effective.warnings.join(' · ')]
			: ['no clamp — drawn == authored'])
	];
	rows.forEach((row, index) => {
		const y =
			viewportHeight -
			font * 1.2 -
			(rows.length - 1 - index) * font * 1.3;
		const metrics = ctx.measureText(row);
		ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
		ctx.fillRect(
			font * 0.4,
			y - font * 1.15,
			metrics.width + font * 0.8,
			font * 1.3
		);
		ctx.fillStyle = index === 0 ? COLOR_TEXT : COLOR_AUTHORED;
		ctx.fillText(row, font * 0.8, y);
	});
	ctx.restore();
}
