import type { WallpaperState } from '@/types/wallpaper';
import { buildTrackFont } from '@/lib/canvasText/trackFonts';
import { applyTextTreatment } from '@/lib/canvasText/trackTextTreatment';
import {
	LIVE_TRACK_TITLE_SCOPE,
	type MarqueeLineRuntime,
	type TrackTitleScope
} from '@/features/audioLayers/render/trackTitleScope';

/** Resolved now-playing payload handed to the renderer each frame. */
export type NowPlayingData = {
	artist: string;
	title: string;
	coverImage: HTMLImageElement | null;
};

/** Settings the cohesive widget reads. Typography/colors/backdrop are reused
 *  from the existing track-title fields so there is no duplicate control set;
 *  the artist line reuses the "time" color as its secondary tone. */
export type NowPlayingWidgetSettings = Pick<
	WallpaperState,
	| 'nowPlayingCoverEnabled'
	| 'nowPlayingArtistEnabled'
	| 'nowPlayingProgressEnabled'
	| 'nowPlayingScale'
	| 'nowPlayingAccentColor'
	| 'nowPlayingTextTreatment'
	| 'performanceMode'
	| 'audioTrackTitleUppercase'
	| 'audioTrackTitleFontStyle'
	| 'audioTrackTitleFontSize'
	| 'audioTrackTitleLetterSpacing'
	| 'audioTrackTitleScrollSpeed'
	| 'audioTrackTitleTextColor'
	| 'audioTrackTitleStrokeColor'
	| 'audioTrackTitleStrokeWidth'
	| 'audioTrackTitleGlowColor'
	| 'audioTrackTitleGlowBlur'
	| 'audioTrackTitleOpacity'
	| 'audioTrackTitlePositionX'
	| 'audioTrackTitlePositionY'
	| 'audioTrackTitleWidth'
	| 'audioTrackTitleBackdropEnabled'
	| 'audioTrackTitleBackdropColor'
	| 'audioTrackTitleBackdropOpacity'
	| 'audioTrackTitleBackdropPadding'
	| 'audioTrackTimeTextColor'
>;

type LineRuntime = MarqueeLineRuntime;

const MARQUEE_GAP_FACTOR = 1.6;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function formatClock(totalSeconds: number): string {
	const seconds = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainder = seconds % 60;
	if (hours > 0) {
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
	}
	return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function roundedRectPath(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	const radius = clamp(r, 0, Math.min(w, h) / 2);
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + w, y, x + w, y + h, radius);
	ctx.arcTo(x + w, y + h, x, y + h, radius);
	ctx.arcTo(x, y + h, x, y, radius);
	ctx.arcTo(x, y, x + w, y, radius);
	ctx.closePath();
}

function measureSpaced(
	ctx: CanvasRenderingContext2D,
	text: string,
	letterSpacing: number
): number {
	if (!text) return 0;
	let width = 0;
	const glyphs = Array.from(text);
	for (let i = 0; i < glyphs.length; i++) {
		width += ctx.measureText(glyphs[i]).width;
		if (i < glyphs.length - 1) width += letterSpacing;
	}
	return width;
}

function drawSpacedRun(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	letterSpacing: number,
	strokeColor?: string,
	strokeWidth?: number
): void {
	let cursor = x;
	const hasStroke = !!strokeColor && (strokeWidth ?? 0) > 0;
	for (const char of text) {
		if (hasStroke) {
			ctx.lineWidth = strokeWidth as number;
			ctx.strokeStyle = strokeColor as string;
			ctx.strokeText(char, cursor, y);
		}
		ctx.fillText(char, cursor, y);
		cursor += ctx.measureText(char).width + letterSpacing;
	}
}

function ellipsizeSpaced(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	letterSpacing: number
): string {
	if (maxWidth <= 0) return '';
	if (measureSpaced(ctx, text, letterSpacing) <= maxWidth) return text;
	const ellipsis = '…';
	const glyphs = Array.from(text);
	let lo = 0;
	let hi = glyphs.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		const candidate = glyphs.slice(0, mid).join('').trimEnd() + ellipsis;
		if (measureSpaced(ctx, candidate, letterSpacing) <= maxWidth) lo = mid;
		else hi = mid - 1;
	}
	return lo > 0
		? glyphs.slice(0, lo).join('').trimEnd() + ellipsis
		: ellipsis;
}

/**
 * Draws one text line that scrolls (marquee) when it overflows the column and
 * a scroll speed is set, otherwise ellipsizes. Mirrors the free-mode marquee
 * behavior so overflowing titles are never silently truncated.
 */
function drawLine(args: {
	ctx: CanvasRenderingContext2D;
	text: string;
	runtime: LineRuntime;
	x: number;
	y: number;
	columnWidth: number;
	lineHeight: number;
	letterSpacing: number;
	scrollSpeed: number;
	dt: number;
	color: string;
	treatment: NowPlayingWidgetSettings['nowPlayingTextTreatment'];
	secondaryColor: string;
	userStrokeColor?: string;
	userStrokeWidth?: number;
}): void {
	const {
		ctx,
		text,
		runtime,
		x,
		y,
		columnWidth,
		lineHeight,
		letterSpacing,
		scrollSpeed,
		dt,
		color,
		treatment,
		secondaryColor,
		userStrokeColor,
		userStrokeWidth
	} = args;

	const measured = measureSpaced(ctx, text, letterSpacing);
	const overflow = measured > columnWidth;
	const shouldScroll = overflow && scrollSpeed > 0;

	if (runtime.text !== text) {
		runtime.text = text;
		runtime.offset = 0;
	}

	const stroke = applyTextTreatment(ctx, treatment, {
		top: y,
		height: lineHeight,
		baseColor: color,
		secondaryColor,
		userStrokeColor: userStrokeColor ?? '',
		userStrokeWidth: userStrokeWidth ?? 0
	});
	const strokeColor = stroke?.color;
	const strokeWidth = stroke?.width;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	const centerY = y + lineHeight / 2;

	if (!shouldScroll) {
		const drawText = overflow
			? ellipsizeSpaced(ctx, text, columnWidth, letterSpacing)
			: text;
		drawSpacedRun(
			ctx,
			drawText,
			x,
			centerY,
			letterSpacing,
			strokeColor,
			strokeWidth
		);
		return;
	}

	const gap = lineHeight * MARQUEE_GAP_FACTOR;
	const cycle = measured + gap;
	runtime.offset = (runtime.offset + scrollSpeed * dt) % cycle;

	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y - lineHeight, columnWidth, lineHeight * 3);
	ctx.clip();
	const anchorX = x - runtime.offset;
	drawSpacedRun(
		ctx,
		text,
		anchorX,
		centerY,
		letterSpacing,
		strokeColor,
		strokeWidth
	);
	drawSpacedRun(
		ctx,
		text,
		anchorX + cycle,
		centerY,
		letterSpacing,
		strokeColor,
		strokeWidth
	);
	ctx.restore();
}

/**
 * Draws the cohesive Now Playing card: optional cover, artist + title lines
 * (with marquee on overflow), and a progress bar with elapsed/total time — all
 * inside one glass backdrop, positioned and scaled as a single unit.
 */
export function drawNowPlayingWidget(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	nowPlaying: NowPlayingData,
	currentTime: number,
	duration: number,
	dt: number,
	settings: NowPlayingWidgetSettings,
	scope: TrackTitleScope = LIVE_TRACK_TITLE_SCOPE
): void {
	const title = (
		settings.audioTrackTitleUppercase
			? nowPlaying.title.toUpperCase()
			: nowPlaying.title
	).trim();
	if (!title) return;

	const opacity = clamp(settings.audioTrackTitleOpacity, 0, 1);
	if (opacity <= 0.001) return;

	const scale = clamp(settings.nowPlayingScale, 0.5, 2.5);
	const titleFontSize =
		clamp(settings.audioTrackTitleFontSize, 12, 160) * scale;
	const artistFontSize = titleFontSize * 0.55;
	const timeFontSize = titleFontSize * 0.5;
	const letterSpacing = settings.audioTrackTitleLetterSpacing * scale;
	const scrollSpeed = settings.audioTrackTitleScrollSpeed * scale;

	const showArtist =
		settings.nowPlayingArtistEnabled && nowPlaying.artist.trim().length > 0;
	const artist = settings.audioTrackTitleUppercase
		? nowPlaying.artist.trim().toUpperCase()
		: nowPlaying.artist.trim();
	const hasDuration = Number.isFinite(duration) && duration > 0;
	const showProgress = settings.nowPlayingProgressEnabled && hasDuration;
	const showCover =
		settings.nowPlayingCoverEnabled && nowPlaying.coverImage !== null;

	const pad =
		clamp(settings.audioTrackTitleBackdropPadding, 8, 48) * scale + 6;
	const titleFont = buildTrackFont(
		settings.audioTrackTitleFontStyle,
		titleFontSize
	);
	// Use each font's bundled weight (custom weights may not be loaded for
	// canvas, which would silently fall back to a system font).
	const artistFont = buildTrackFont(
		settings.audioTrackTitleFontStyle,
		artistFontSize
	);
	const timeFont = buildTrackFont('mono', timeFontSize);

	const lineGap = titleFontSize * 0.28;
	const artistH = showArtist ? artistFontSize * 1.15 : 0;
	const titleH = titleFontSize * 1.15;
	const progressH = showProgress ? timeFontSize * 1.5 : 0;
	const textBlockH =
		artistH +
		titleH +
		progressH +
		(showArtist ? lineGap : 0) +
		(showProgress ? lineGap : 0);

	const coverSize = showCover ? textBlockH : 0;
	const coverGap = showCover ? pad * 0.7 : 0;

	const cardMaxWidth =
		canvas.width * clamp(settings.audioTrackTitleWidth, 0.2, 1);
	const maxTextWidth = Math.max(
		40,
		cardMaxWidth - pad * 2 - coverSize - coverGap
	);
	ctx.font = titleFont;
	const titleMeasured = measureSpaced(ctx, title, letterSpacing);
	ctx.font = artistFont;
	const artistMeasured = showArtist
		? measureSpaced(ctx, artist, letterSpacing)
		: 0;
	const minTextWidth = showProgress ? timeFontSize * 9 : 0;
	const textWidth = clamp(
		Math.max(titleMeasured, artistMeasured, minTextWidth),
		Math.min(maxTextWidth, timeFontSize * 6),
		maxTextWidth
	);

	const cardWidth = pad * 2 + coverSize + coverGap + textWidth;
	const cardHeight = textBlockH + pad * 2;

	const centerX =
		canvas.width / 2 +
		settings.audioTrackTitlePositionX * canvas.width * 0.5;
	const centerY =
		canvas.height / 2 -
		settings.audioTrackTitlePositionY * canvas.height * 0.5;
	const cardLeft = Math.round(centerX - cardWidth / 2);
	const cardTop = Math.round(centerY - cardHeight / 2);
	const cardRadius = Math.max(12, titleFontSize * 0.4);

	ctx.save();
	ctx.globalAlpha *= opacity;

	if (settings.audioTrackTitleBackdropEnabled) {
		ctx.save();
		ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
		ctx.shadowBlur = 30 * scale;
		ctx.shadowOffsetY = 10 * scale;
		ctx.fillStyle = settings.audioTrackTitleBackdropColor;
		ctx.globalAlpha *= clamp(settings.audioTrackTitleBackdropOpacity, 0, 1);
		roundedRectPath(
			ctx,
			cardLeft,
			cardTop,
			cardWidth,
			cardHeight,
			cardRadius
		);
		ctx.fill();
		ctx.restore();

		const highlight = ctx.createLinearGradient(
			0,
			cardTop,
			0,
			cardTop + cardHeight
		);
		highlight.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
		highlight.addColorStop(0.4, 'rgba(255, 255, 255, 0.02)');
		highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
		ctx.save();
		ctx.fillStyle = highlight;
		roundedRectPath(
			ctx,
			cardLeft,
			cardTop,
			cardWidth,
			cardHeight,
			cardRadius
		);
		ctx.fill();
		ctx.restore();

		ctx.save();
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
		roundedRectPath(
			ctx,
			cardLeft + 0.5,
			cardTop + 0.5,
			cardWidth - 1,
			cardHeight - 1,
			cardRadius
		);
		ctx.stroke();
		ctx.restore();
	}

	const contentLeft = cardLeft + pad;
	const contentTop = cardTop + pad;

	if (showCover && nowPlaying.coverImage) {
		const img = nowPlaying.coverImage;
		ctx.save();
		roundedRectPath(
			ctx,
			contentLeft,
			contentTop,
			coverSize,
			coverSize,
			Math.max(8, coverSize * 0.12)
		);
		ctx.clip();
		const iw = img.naturalWidth || 1;
		const ih = img.naturalHeight || 1;
		const ratio = Math.max(coverSize / iw, coverSize / ih);
		const dw = iw * ratio;
		const dh = ih * ratio;
		ctx.drawImage(
			img,
			contentLeft + (coverSize - dw) / 2,
			contentTop + (coverSize - dh) / 2,
			dw,
			dh
		);
		ctx.restore();
		ctx.save();
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
		roundedRectPath(
			ctx,
			contentLeft + 0.5,
			contentTop + 0.5,
			coverSize - 1,
			coverSize - 1,
			Math.max(8, coverSize * 0.12)
		);
		ctx.stroke();
		ctx.restore();
	}

	const textLeft = contentLeft + coverSize + coverGap;
	let cursorY = contentTop;

	if (showArtist) {
		ctx.save();
		ctx.font = artistFont;
		ctx.globalAlpha *= 0.85;
		drawLine({
			ctx,
			text: artist,
			runtime: scope.widgetArtist,
			x: textLeft,
			y: cursorY,
			columnWidth: textWidth,
			lineHeight: artistH,
			letterSpacing,
			scrollSpeed,
			dt,
			color: settings.audioTrackTimeTextColor,
			treatment: settings.nowPlayingTextTreatment,
			secondaryColor: settings.audioTrackTitleGlowColor
		});
		ctx.restore();
		cursorY += artistH + lineGap;
	}

	ctx.save();
	ctx.font = titleFont;
	if (settings.audioTrackTitleGlowBlur > 0.01) {
		ctx.shadowColor = settings.audioTrackTitleGlowColor;
		ctx.shadowBlur = settings.audioTrackTitleGlowBlur * scale;
	}
	ctx.lineJoin = 'round';
	drawLine({
		ctx,
		text: title,
		runtime: scope.widgetTitle,
		x: textLeft,
		y: cursorY,
		columnWidth: textWidth,
		lineHeight: titleH,
		letterSpacing,
		scrollSpeed,
		dt,
		color: settings.audioTrackTitleTextColor,
		treatment: settings.nowPlayingTextTreatment,
		secondaryColor: settings.audioTrackTitleGlowColor,
		userStrokeColor: settings.audioTrackTitleStrokeColor,
		userStrokeWidth:
			clamp(settings.audioTrackTitleStrokeWidth, 0, 8) * scale
	});
	ctx.restore();
	cursorY += titleH;

	if (showProgress) {
		cursorY += lineGap;
		const barH = Math.max(3, timeFontSize * 0.32);
		const barY = cursorY + (progressH - barH) / 2 - timeFontSize * 0.1;
		const fraction = clamp(currentTime / duration, 0, 1);
		const timeText = `${formatClock(currentTime)} / ${formatClock(duration)}`;
		ctx.save();
		ctx.font = timeFont;
		const timeWidth = ctx.measureText(timeText).width;
		const barWidth = Math.max(
			0,
			textWidth - timeWidth - timeFontSize * 0.8
		);

		ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
		roundedRectPath(ctx, textLeft, barY, barWidth, barH, barH / 2);
		ctx.fill();
		if (fraction > 0 && barWidth > 0) {
			ctx.fillStyle = settings.nowPlayingAccentColor;
			roundedRectPath(
				ctx,
				textLeft,
				barY,
				Math.max(barH, barWidth * fraction),
				barH,
				barH / 2
			);
			ctx.fill();
		}
		ctx.fillStyle = settings.audioTrackTimeTextColor;
		ctx.globalAlpha *= 0.9;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		ctx.fillText(timeText, textLeft + textWidth, barY + barH / 2);
		ctx.restore();
	}

	ctx.restore();
}
