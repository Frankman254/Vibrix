/**
 * Painting the intro / ending composition on a 2D canvas.
 *
 * One function, used by the live preview and by the offline export, so what the
 * editor shows is what the file gets. `introPlan` owns WHEN each piece is where
 * it is; this owns WHERE it lands, because laying out a title needs the font
 * metrics only a canvas can give.
 */
import {
	TRACK_TITLE_FONT_STACKS,
	TRACK_TITLE_FONT_WEIGHT
} from '@/lib/canvasText/trackFonts';
import type { TrackTitleFontStyle } from '@/types/wallpaper';
import type {
	IntroCard,
	IntroFrame,
	IntroSpectrumPlan,
	IntroTextPlan,
	IntroViewport
} from './introPlan';

/** What a card is drawn from — an `<img>` live, the same offline. */
export type IntroImageSource = CanvasImageSource & {
	width: number;
	height: number;
};

export type IntroPaintColors = {
	title: string;
	tagline: string;
	spectrum: string;
};

export type PaintIntroOptions = {
	ctx: CanvasRenderingContext2D;
	viewport: IntroViewport;
	frame: IntroFrame;
	/** Card index → its loaded image. A missing entry simply is not drawn. */
	images: ReadonlyMap<number, IntroImageSource>;
	logo: IntroImageSource | null;
	colors: IntroPaintColors;
	backdrop: string;
	titleFontStyle: TrackTitleFontStyle;
	taglineFontStyle: TrackTitleFontStyle;
};

/**
 * Draw `source` filling `width`×`height` centred on the origin, cropping the
 * overflow instead of squashing it: a montage card must never distort a frame.
 */
function drawCovered(
	ctx: CanvasRenderingContext2D,
	source: IntroImageSource,
	width: number,
	height: number
): void {
	const sw = source.width;
	const sh = source.height;
	if (!(sw > 0 && sh > 0 && width > 0 && height > 0)) return;
	const scale = Math.max(width / sw, height / sh);
	ctx.drawImage(
		source,
		(-sw * scale) / 2,
		(-sh * scale) / 2,
		sw * scale,
		sh * scale
	);
}

function paintCards(
	ctx: CanvasRenderingContext2D,
	cards: readonly IntroCard[],
	images: ReadonlyMap<number, IntroImageSource>,
	windowAlpha: number
): void {
	for (const card of cards) {
		if (card.alpha <= 0.001) continue;
		const source = images.get(card.index);
		if (!source) continue;
		const cardW = card.width * card.scale;
		const cardH = card.height * card.scale;
		if (cardW < 1 || cardH < 1) continue;
		ctx.save();
		ctx.globalAlpha = Math.min(1, card.alpha) * windowAlpha;
		ctx.translate(card.x, card.y);
		if (card.rotationRad !== 0) ctx.rotate(card.rotationRad);
		// The card clips to its own box, so a covered image never bleeds into
		// the neighbouring cell of a mosaic.
		ctx.beginPath();
		ctx.rect(-card.width / 2, -card.height / 2, card.width, card.height);
		ctx.clip();
		drawCovered(ctx, source, cardW, cardH);
		ctx.restore();
	}
}

function fontFor(
	style: TrackTitleFontStyle,
	sizePx: number
): { font: string; letterSpacing: number } {
	return {
		font: `${TRACK_TITLE_FONT_WEIGHT[style]} ${Math.max(1, Math.round(sizePx))}px ${TRACK_TITLE_FONT_STACKS[style]}`,
		letterSpacing: 0
	};
}

type MeasuredLine = {
	text: string;
	fullText: string;
	sizePx: number;
	width: number;
	fullWidth: number;
};

/**
 * Measure a line at its wanted size, shrinking it if the full string would run
 * past the safe width. The FULL string is what decides the size, so a
 * typewriter line does not resize itself as letters arrive.
 */
function measureLine(
	ctx: CanvasRenderingContext2D,
	plan: IntroTextPlan,
	style: TrackTitleFontStyle,
	viewport: IntroViewport
): MeasuredLine {
	const safeWidth = viewport.width * 0.86;
	let sizePx = (viewport.height * plan.sizePct) / 100;
	ctx.font = fontFor(style, sizePx).font;
	let fullWidth = ctx.measureText(plan.text).width;
	if (fullWidth > safeWidth && fullWidth > 0) {
		sizePx *= safeWidth / fullWidth;
		ctx.font = fontFor(style, sizePx).font;
		fullWidth = ctx.measureText(plan.text).width;
	}
	const text = plan.text.slice(
		0,
		Math.max(0, Math.min(plan.text.length, plan.frame.visibleChars))
	);
	return {
		text,
		fullText: plan.text,
		sizePx,
		width: ctx.measureText(text).width,
		fullWidth
	};
}

function paintLine(
	ctx: CanvasRenderingContext2D,
	line: MeasuredLine,
	plan: IntroTextPlan,
	style: TrackTitleFontStyle,
	color: string,
	centreX: number,
	baselineY: number,
	windowAlpha: number
): void {
	if (plan.frame.alpha <= 0.001 || line.text.length === 0) return;
	ctx.save();
	ctx.globalAlpha = Math.min(1, plan.frame.alpha) * windowAlpha;
	ctx.font = fontFor(style, line.sizePx).font;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.translate(centreX, baselineY + plan.frame.offsetEm * line.sizePx);
	if (plan.frame.scale !== 1) ctx.scale(plan.frame.scale, plan.frame.scale);
	if (plan.frame.wipePct < 1) {
		// The mask sweeps from the left over the FULL width, so a wipe reads
		// the same whatever the line says.
		const half = line.fullWidth / 2;
		ctx.beginPath();
		ctx.rect(
			-half,
			-line.sizePx * 1.2,
			line.fullWidth * plan.frame.wipePct,
			line.sizePx * 1.8
		);
		ctx.clip();
	}
	// A soft drop shadow is what keeps white text legible over any montage
	// without painting a slab behind it.
	ctx.shadowColor = 'rgba(0,0,0,0.55)';
	ctx.shadowBlur = line.sizePx * 0.28;
	ctx.fillStyle = color;
	ctx.fillText(line.text, 0, 0);
	ctx.restore();
}

function paintTitleFrame(
	ctx: CanvasRenderingContext2D,
	rect: { x: number; y: number; width: number; height: number },
	widthPct: number,
	alpha: number,
	color: string,
	windowAlpha: number
): void {
	if (alpha <= 0.001 || widthPct <= 0) return;
	const drawnWidth = rect.width * widthPct;
	ctx.save();
	ctx.globalAlpha = Math.min(1, alpha) * windowAlpha;
	ctx.strokeStyle = color;
	ctx.lineWidth = Math.max(1, rect.height * 0.035);
	// The box draws itself outwards from the centre of the title.
	ctx.strokeRect(
		rect.x + (rect.width - drawnWidth) / 2,
		rect.y,
		drawnWidth,
		rect.height
	);
	ctx.restore();
}

function paintSpectrum(
	ctx: CanvasRenderingContext2D,
	plan: IntroSpectrumPlan,
	viewport: IntroViewport,
	centreY: number,
	color: string,
	windowAlpha: number
): void {
	const bars = plan.bars;
	if (bars.length === 0 || plan.alpha <= 0.001) return;
	const reach = (viewport.height * plan.sizePct) / 100;
	ctx.save();
	ctx.globalAlpha = Math.min(1, plan.alpha) * windowAlpha;
	ctx.fillStyle = color;
	ctx.strokeStyle = color;

	if (plan.shape === 'ring') {
		const radius = reach * 0.9;
		const centreX = viewport.width / 2;
		const thickness = Math.max(
			1,
			((2 * Math.PI * radius) / bars.length) * 0.55
		);
		ctx.lineWidth = thickness;
		ctx.lineCap = 'round';
		for (let index = 0; index < bars.length; index += 1) {
			const level = bars[index] ?? 0;
			if (level <= 0.001) continue;
			const angle = (index / bars.length) * Math.PI * 2 - Math.PI / 2;
			const inner = radius;
			const outer = radius + level * reach * 0.6;
			ctx.beginPath();
			ctx.moveTo(
				centreX + Math.cos(angle) * inner,
				centreY + Math.sin(angle) * inner
			);
			ctx.lineTo(
				centreX + Math.cos(angle) * outer,
				centreY + Math.sin(angle) * outer
			);
			ctx.stroke();
		}
		ctx.restore();
		return;
	}

	if (plan.shape === 'wave') {
		ctx.lineWidth = Math.max(1.5, viewport.height * 0.004);
		ctx.lineJoin = 'round';
		ctx.beginPath();
		for (let index = 0; index < bars.length; index += 1) {
			const x = (index / (bars.length - 1 || 1)) * viewport.width;
			const y = centreY - ((bars[index] ?? 0) - 0.5) * reach;
			if (index === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
		ctx.restore();
		return;
	}

	const slot = viewport.width / bars.length;
	const barW = Math.max(1, slot * 0.6);
	for (let index = 0; index < bars.length; index += 1) {
		const level = bars[index] ?? 0;
		if (level <= 0.001) continue;
		const x = slot * (index + 0.5) - barW / 2;
		const tall = level * reach;
		if (plan.shape === 'mirror') {
			ctx.fillRect(x, centreY - tall / 2, barW, tall);
		} else {
			// `bars` stands on a baseline below the composition's centre.
			ctx.fillRect(x, centreY + reach / 2 - tall, barW, tall);
		}
	}
	ctx.restore();
}

export function paintIntro({
	ctx,
	viewport,
	frame,
	images,
	logo,
	colors,
	backdrop,
	titleFontStyle,
	taglineFontStyle
}: PaintIntroOptions): void {
	const { width, height } = viewport;
	if (!(width > 0 && height > 0)) return;
	const windowAlpha = Math.min(1, Math.max(0, frame.backdropAlpha));
	if (windowAlpha <= 0.001) return;

	ctx.save();
	ctx.globalAlpha = windowAlpha;
	ctx.fillStyle = backdrop;
	ctx.fillRect(0, 0, width, height);
	ctx.restore();

	paintCards(ctx, frame.cards, images, windowAlpha);

	if (frame.imageDim > 0.001) {
		ctx.save();
		ctx.globalAlpha = frame.imageDim * windowAlpha;
		ctx.fillStyle = backdrop;
		ctx.fillRect(0, 0, width, height);
		ctx.restore();
	}

	// --- Layout of the centred stack: logo, title (in its box), tagline.
	const titleLine = frame.title
		? measureLine(ctx, frame.title, titleFontStyle, viewport)
		: null;
	const taglineLine = frame.tagline
		? measureLine(ctx, frame.tagline, taglineFontStyle, viewport)
		: null;
	const logoH = frame.logo ? (height * frame.logo.sizePct) / 100 : 0;
	const titleH = titleLine ? titleLine.sizePx * 1.18 : 0;
	const taglineH = taglineLine ? taglineLine.sizePx * 1.5 : 0;
	const gap = height * 0.022;
	const stackH =
		logoH +
		titleH +
		taglineH +
		(logoH > 0 && titleH > 0 ? gap : 0) +
		(titleH > 0 && taglineH > 0 ? gap : 0);
	let cursorY = height / 2 - stackH / 2;
	const centreX = width / 2;

	if (frame.spectrum) {
		paintSpectrum(
			ctx,
			frame.spectrum,
			viewport,
			height / 2,
			colors.spectrum,
			windowAlpha
		);
	}

	if (frame.logo && logo && logoH > 0) {
		const scale = frame.logo.scale;
		const drawH = logoH * scale;
		const ratio = logo.width > 0 ? logo.height / logo.width : 1;
		const drawW = ratio > 0 ? drawH / ratio : drawH;
		ctx.save();
		ctx.globalAlpha = Math.min(1, frame.logo.alpha) * windowAlpha;
		ctx.drawImage(
			logo,
			centreX - drawW / 2,
			cursorY + logoH / 2 - drawH / 2,
			drawW,
			drawH
		);
		ctx.restore();
		cursorY += logoH + gap;
	} else if (frame.logo && logoH > 0) {
		cursorY += logoH + gap;
	}

	if (titleLine && frame.title) {
		const boxPadX = titleLine.sizePx * 0.5;
		const boxPadY = titleLine.sizePx * 0.26;
		if (frame.titleFrame) {
			paintTitleFrame(
				ctx,
				{
					x: centreX - titleLine.fullWidth / 2 - boxPadX,
					y: cursorY - boxPadY,
					width: titleLine.fullWidth + boxPadX * 2,
					height: titleH + boxPadY * 2
				},
				frame.titleFrame.widthPct,
				frame.titleFrame.alpha,
				colors.title,
				windowAlpha
			);
		}
		paintLine(
			ctx,
			titleLine,
			frame.title,
			titleFontStyle,
			colors.title,
			centreX,
			cursorY + titleLine.sizePx,
			windowAlpha
		);
		cursorY += titleH + gap;
	}

	if (taglineLine && frame.tagline) {
		paintLine(
			ctx,
			taglineLine,
			frame.tagline,
			taglineFontStyle,
			colors.tagline,
			centreX,
			cursorY + taglineLine.sizePx,
			windowAlpha
		);
	}
}
