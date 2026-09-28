/**
 * Painting the intro / ending montage on a 2D canvas.
 *
 * One function, used by the live preview and by the offline export, so what the
 * editor shows is what the file gets. Everything about WHERE a card goes is in
 * `stingerPlan`; this only draws.
 */
import type { StingerCard, StingerViewport } from './stingerPlan';

/** What a card is drawn from — an `<img>` live, the same offline. */
export type StingerImageSource = CanvasImageSource & {
	width: number;
	height: number;
};

export type PaintStingerOptions = {
	ctx: CanvasRenderingContext2D;
	viewport: StingerViewport;
	cards: readonly StingerCard[];
	/** Card index → its loaded image. A missing entry simply is not drawn. */
	images: ReadonlyMap<number, StingerImageSource>;
	/** Opacity of the backdrop that hides the project behind the montage. */
	backdropAlpha: number;
	/** Backdrop colour — the project's own black, not a theme colour. */
	backdrop?: string;
};

/**
 * Draw `source` filling `width`×`height` centred on the origin, cropping the
 * overflow instead of squashing it: a montage card must never distort a frame.
 */
function drawCovered(
	ctx: CanvasRenderingContext2D,
	source: StingerImageSource,
	width: number,
	height: number
): void {
	const sw = source.width;
	const sh = source.height;
	if (!(sw > 0 && sh > 0 && width > 0 && height > 0)) return;
	const scale = Math.max(width / sw, height / sh);
	const drawW = sw * scale;
	const drawH = sh * scale;
	ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
}

export function paintStinger({
	ctx,
	viewport,
	cards,
	images,
	backdropAlpha,
	backdrop = '#000000'
}: PaintStingerOptions): void {
	const { width, height } = viewport;
	if (!(width > 0 && height > 0)) return;

	if (backdropAlpha > 0) {
		ctx.save();
		ctx.globalAlpha = Math.min(1, backdropAlpha);
		ctx.fillStyle = backdrop;
		ctx.fillRect(0, 0, width, height);
		ctx.restore();
	}

	for (const card of cards) {
		if (card.alpha <= 0.001) continue;
		const source = images.get(card.index);
		if (!source) continue;
		const cardW = card.width * card.scale;
		const cardH = card.height * card.scale;
		if (cardW < 1 || cardH < 1) continue;
		ctx.save();
		// The card clips to its own box, so a covered image never bleeds into
		// the neighbouring cell of a grid.
		ctx.globalAlpha = Math.min(1, card.alpha) * Math.min(1, backdropAlpha);
		ctx.translate(card.x, card.y);
		if (card.rotationRad !== 0) ctx.rotate(card.rotationRad);
		ctx.beginPath();
		ctx.rect(-cardW / 2, -cardH / 2, cardW, cardH);
		ctx.clip();
		drawCovered(ctx, source, cardW, cardH);
		ctx.restore();
	}
}
