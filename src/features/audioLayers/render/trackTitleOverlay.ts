import type { WallpaperState } from '@/types/wallpaper';
import {
	TRACK_TITLE_FONT_STACKS,
	TRACK_TITLE_FONT_WEIGHT,
	TRACK_TITLE_STYLE_SPACING_BONUS
} from '@/lib/canvasText/trackFonts';
import {
	drawNowPlayingWidget,
	type NowPlayingData,
	type NowPlayingWidgetSettings
} from '@/features/audioLayers/render/nowPlayingWidget';
import {
	createOffscreenCanvas,
	getTextRenderScale
} from '@/lib/canvasText/textRenderCache';
import {
	LIVE_TRACK_TITLE_SCOPE,
	resetTrackTextRuntime,
	type TrackTextRuntime,
	type TrackTitleScope
} from '@/features/audioLayers/render/trackTitleScope';

export type { NowPlayingData };

type SharedTrackDetailsSettings = Pick<
	WallpaperState,
	| 'audioTrackTitleLayoutMode'
	| 'audioTrackTitleUppercase'
	| 'audioTrackTitlePositionX'
	| 'audioTrackTitlePositionY'
	| 'audioTrackTitleWidth'
	| 'audioTrackTitleScrollSpeed'
	| 'audioTrackTitleBackdropEnabled'
	| 'audioTrackTitleBackdropColor'
	| 'audioTrackTitleBackdropOpacity'
	| 'audioTrackTitleBackdropPadding'
	| 'audioTrackTimeWidth'
>;

type TextLineSettings = {
	fontStyle: WallpaperState['audioTrackTitleFontStyle'];
	fontSize: number;
	letterSpacing: number;
	opacity: number;
	rgbShift: number;
	textColor: string;
	strokeColor: string;
	strokeWidth: number;
	glowColor: string;
	glowBlur: number;
	glowReach: number;
	filterBrightness: number;
	filterContrast: number;
	filterSaturation: number;
	filterBlur: number;
	filterHueRotate: number;
};

type TrackTitleSettings = SharedTrackDetailsSettings &
	NowPlayingWidgetSettings &
	Pick<
		WallpaperState,
		| 'nowPlayingMode'
		| 'audioTrackTitleEnabled'
		| 'audioTrackTitleFontStyle'
		| 'audioTrackTitleFontSize'
		| 'audioTrackTitleLetterSpacing'
		| 'audioTrackTitleOpacity'
		| 'audioTrackTitleRgbShift'
		| 'audioTrackTitleTextColor'
		| 'audioTrackTitleStrokeColor'
		| 'audioTrackTitleStrokeWidth'
		| 'audioTrackTitleGlowColor'
		| 'audioTrackTitleGlowBlur'
		| 'audioTrackTitleGlowReach'
		| 'audioTrackTitleFilterBrightness'
		| 'audioTrackTitleFilterContrast'
		| 'audioTrackTitleFilterSaturation'
		| 'audioTrackTitleFilterBlur'
		| 'audioTrackTitleFilterHueRotate'
		| 'audioTrackTimeEnabled'
		| 'audioTrackTimePositionX'
		| 'audioTrackTimePositionY'
		| 'audioTrackTimeFontStyle'
		| 'audioTrackTimeFontSize'
		| 'audioTrackTimeLetterSpacing'
		| 'audioTrackTimeOpacity'
		| 'audioTrackTimeRgbShift'
		| 'audioTrackTimeTextColor'
		| 'audioTrackTimeStrokeColor'
		| 'audioTrackTimeStrokeWidth'
		| 'audioTrackTimeGlowColor'
		| 'audioTrackTimeGlowBlur'
		| 'audioTrackTimeGlowReach'
		| 'audioTrackTimeFilterBrightness'
		| 'audioTrackTimeFilterContrast'
		| 'audioTrackTimeFilterSaturation'
		| 'audioTrackTimeFilterBlur'
		| 'audioTrackTimeFilterHueRotate'
	>;

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

function formatPlaybackTime(currentTime: number, duration: number): string {
	const hasCurrent = Number.isFinite(currentTime) && currentTime >= 0;
	const hasDuration = Number.isFinite(duration) && duration > 0;
	if (!hasCurrent && !hasDuration) return '';

	const current = formatClock(hasCurrent ? currentTime : 0);
	if (!hasDuration) return current;
	return `${current} / ${formatClock(duration)}`;
}

function applyRoundedRectPath(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
) {
	const safeRadius = clamp(radius, 0, Math.min(width, height) / 2);
	ctx.beginPath();
	ctx.moveTo(x + safeRadius, y);
	ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
	ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
	ctx.arcTo(x, y + height, x, y, safeRadius);
	ctx.arcTo(x, y, x + width, y, safeRadius);
	ctx.closePath();
}

function buildFilterString(settings: TextLineSettings): string {
	return [
		`brightness(${settings.filterBrightness})`,
		`contrast(${settings.filterContrast})`,
		`saturate(${settings.filterSaturation})`,
		`blur(${settings.filterBlur}px)`,
		`hue-rotate(${settings.filterHueRotate}deg)`
	].join(' ');
}

function resolveHorizontalCenter(
	canvas: HTMLCanvasElement,
	settings: SharedTrackDetailsSettings,
	boxWidth: number,
	padding: number
): number {
	switch (settings.audioTrackTitleLayoutMode) {
		case 'left-dock':
			return boxWidth / 2 + padding + 16;
		case 'right-dock':
			return canvas.width - (boxWidth / 2 + padding + 16);
		case 'centered':
			return canvas.width / 2;
		case 'free':
		default:
			return (
				canvas.width / 2 +
				settings.audioTrackTitlePositionX * canvas.width * 0.5
			);
	}
}

function getEffectiveLetterSpacing(settings: TextLineSettings): number {
	return clamp(
		settings.letterSpacing +
			TRACK_TITLE_STYLE_SPACING_BONUS[settings.fontStyle],
		0,
		settings.fontSize * 0.4
	);
}

function getFont(settings: TextLineSettings): string {
	return `${TRACK_TITLE_FONT_WEIGHT[settings.fontStyle]} ${settings.fontSize}px ${TRACK_TITLE_FONT_STACKS[settings.fontStyle]}`;
}

function getGlowReach(settings: TextLineSettings): number {
	return clamp(settings.glowReach ?? 1, 1, 3);
}

function getHaloGlowBlur(settings: TextLineSettings): number {
	return settings.glowBlur * getGlowReach(settings);
}

function drawTextRun(
	ctx: CanvasRenderingContext2D,
	text: string,
	anchorX: number,
	centerY: number,
	rgbShift: number,
	lineSettings: TextLineSettings,
	letterSpacing: number
) {
	const drawSpacedText = (
		offsetX: number,
		color: string,
		strokeColor?: string,
		strokeWidth?: number
	) => {
		ctx.save();
		ctx.fillStyle = color;
		ctx.lineJoin = 'round';
		ctx.miterLimit = 2;
		ctx.lineWidth = Math.max(0, strokeWidth ?? 0);
		if (strokeColor && (strokeWidth ?? 0) > 0) {
			ctx.strokeStyle = strokeColor;
		}
		let cursor = anchorX + offsetX;
		for (const char of text) {
			if (strokeColor && (strokeWidth ?? 0) > 0) {
				ctx.strokeText(char, cursor, centerY);
			}
			ctx.fillText(char, cursor, centerY);
			cursor += ctx.measureText(char).width + letterSpacing;
		}
		ctx.restore();
	};

	if (rgbShift > 0) {
		ctx.save();
		ctx.shadowBlur = 0;
		drawSpacedText(-rgbShift, 'rgba(255, 70, 120, 0.55)');
		drawSpacedText(rgbShift, 'rgba(0, 234, 255, 0.55)');
		ctx.restore();
	}

	if (lineSettings.glowBlur > 0.01) {
		const glowReach = getGlowReach(lineSettings);
		ctx.save();
		ctx.shadowColor = lineSettings.glowColor;
		ctx.shadowBlur = getHaloGlowBlur(lineSettings);
		ctx.globalAlpha *= Math.min(1, 0.32 + (glowReach - 1) * 0.14);
		drawSpacedText(0, lineSettings.glowColor);
		ctx.restore();
	}

	ctx.save();
	ctx.shadowColor = lineSettings.glowColor;
	ctx.shadowBlur = Math.max(0, lineSettings.glowBlur * 0.35);
	drawSpacedText(
		0,
		lineSettings.textColor,
		lineSettings.strokeColor,
		lineSettings.strokeWidth
	);
	ctx.restore();
}

function buildTextRenderKey(
	text: string,
	font: string,
	letterSpacing: number,
	rgbShiftPx: number,
	settings: TextLineSettings
): string {
	return [
		text,
		font,
		letterSpacing.toFixed(3),
		rgbShiftPx.toFixed(2),
		settings.textColor,
		settings.strokeColor,
		settings.strokeWidth.toFixed(2),
		settings.glowColor,
		settings.glowBlur.toFixed(2),
		settings.glowReach.toFixed(2),
		settings.filterBrightness.toFixed(3),
		settings.filterContrast.toFixed(3),
		settings.filterSaturation.toFixed(3),
		settings.filterBlur.toFixed(2),
		settings.filterHueRotate.toFixed(1)
	].join('|');
}

function renderTextToCache(
	text: string,
	font: string,
	lineSettings: TextLineSettings,
	letterSpacing: number,
	rgbShiftPx: number,
	runtime: TrackTextRuntime
) {
	const glyphs = Array.from(text);
	const measureCanvas = createOffscreenCanvas(8, 8);
	const measureCtx = measureCanvas?.getContext('2d');
	if (!measureCtx) return;

	measureCtx.font = font;
	measureCtx.textBaseline = 'middle';

	const glyphWidths = glyphs.map(char => measureCtx.measureText(char).width);
	const measuredWidth = glyphWidths.reduce(
		(sum, width, index) =>
			sum + width + (index < glyphWidths.length - 1 ? letterSpacing : 0),
		0
	);

	const padX = Math.ceil(
		12 +
			Math.max(
				rgbShiftPx,
				getHaloGlowBlur(lineSettings),
				lineSettings.strokeWidth * 2
			)
	);
	const padY = Math.ceil(
		lineSettings.fontSize * 0.9 +
			getHaloGlowBlur(lineSettings) +
			lineSettings.filterBlur * 2 +
			lineSettings.strokeWidth * 2
	);
	const renderScale = getTextRenderScale();
	const logicalWidth = measuredWidth + padX * 2;
	const logicalHeight = lineSettings.fontSize * 2.8 + padY * 2;
	const renderCanvas = createOffscreenCanvas(
		logicalWidth * renderScale,
		logicalHeight * renderScale
	);
	const renderCtx = renderCanvas?.getContext('2d');
	if (!renderCanvas || !renderCtx) return;

	renderCtx.scale(renderScale, renderScale);
	renderCtx.font = font;
	renderCtx.textBaseline = 'middle';
	renderCtx.textAlign = 'left';
	renderCtx.filter = buildFilterString(lineSettings);
	renderCtx.lineJoin = 'round';
	renderCtx.miterLimit = 2;

	const baselineY = logicalHeight / 2;
	const drawSpacedText = (
		offsetX: number,
		color: string,
		strokeColor?: string,
		strokeWidth?: number
	) => {
		renderCtx.save();
		renderCtx.fillStyle = color;
		renderCtx.lineWidth = Math.max(0, strokeWidth ?? 0);
		if (strokeColor && (strokeWidth ?? 0) > 0) {
			renderCtx.strokeStyle = strokeColor;
		}
		let cursor = padX + offsetX;
		for (let index = 0; index < glyphs.length; index++) {
			if (strokeColor && (strokeWidth ?? 0) > 0) {
				renderCtx.strokeText(glyphs[index], cursor, baselineY);
			}
			renderCtx.fillText(glyphs[index], cursor, baselineY);
			cursor +=
				glyphWidths[index] +
				(index < glyphs.length - 1 ? letterSpacing : 0);
		}
		renderCtx.restore();
	};

	if (rgbShiftPx > 0) {
		renderCtx.save();
		renderCtx.shadowBlur = 0;
		drawSpacedText(-rgbShiftPx, 'rgba(255, 70, 120, 0.55)');
		drawSpacedText(rgbShiftPx, 'rgba(0, 234, 255, 0.55)');
		renderCtx.restore();
	}

	if (lineSettings.glowBlur > 0.01) {
		const glowReach = getGlowReach(lineSettings);
		renderCtx.save();
		renderCtx.shadowColor = lineSettings.glowColor;
		renderCtx.shadowBlur = getHaloGlowBlur(lineSettings);
		renderCtx.globalAlpha = Math.min(1, 0.32 + (glowReach - 1) * 0.14);
		drawSpacedText(0, lineSettings.glowColor);
		renderCtx.restore();
	}

	renderCtx.save();
	renderCtx.shadowColor = lineSettings.glowColor;
	renderCtx.shadowBlur = Math.max(0, lineSettings.glowBlur * 0.35);
	drawSpacedText(
		0,
		lineSettings.textColor,
		lineSettings.strokeColor,
		lineSettings.strokeWidth
	);
	renderCtx.restore();

	runtime.renderedCanvas = renderCanvas;
	runtime.measuredWidth = measuredWidth;
	runtime.canvasPaddingX = padX;
	runtime.logicalCanvasWidth = logicalWidth;
	runtime.logicalCanvasHeight = logicalHeight;
}

function roundCanvasPosition(value: number): number {
	return Math.round(value * 2) / 2;
}

function drawLineBackdrop({
	ctx,
	left,
	top,
	boxWidth,
	lineHeight,
	padding,
	fontSize,
	backdropColor,
	backdropOpacity
}: {
	ctx: CanvasRenderingContext2D;
	left: number;
	top: number;
	boxWidth: number;
	lineHeight: number;
	padding: number;
	fontSize: number;
	backdropColor: string;
	backdropOpacity: number;
}) {
	ctx.save();
	ctx.fillStyle = backdropColor;
	ctx.globalAlpha *= clamp(backdropOpacity, 0, 1);
	applyRoundedRectPath(
		ctx,
		left - padding,
		top - padding * 0.65,
		boxWidth + padding * 2,
		lineHeight + padding * 1.3,
		Math.max(10, fontSize * 0.45)
	);
	ctx.fill();
	ctx.restore();
}

function drawTextLine({
	ctx,
	canvas,
	text,
	runtime,
	settings,
	centerX,
	centerY,
	left,
	boxWidth,
	lineTop,
	lineHeight,
	dt,
	scrollSpeed
}: {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	text: string;
	runtime: TrackTextRuntime;
	settings: TextLineSettings;
	centerX: number;
	centerY: number;
	left: number;
	boxWidth: number;
	lineTop: number;
	lineHeight: number;
	dt: number;
	scrollSpeed: number;
}) {
	const font = getFont(settings);
	const rgbShiftPx = clamp(settings.rgbShift, 0, 0.03) * canvas.width;
	const effectiveLetterSpacing = getEffectiveLetterSpacing(settings);
	const cacheKey = buildTextRenderKey(
		text,
		font,
		effectiveLetterSpacing,
		rgbShiftPx,
		settings
	);

	if (runtime.lastText !== text) {
		runtime.lastText = text;
		runtime.offset = 0;
	}

	if (runtime.cacheKey !== cacheKey || !runtime.renderedCanvas) {
		runtime.cacheKey = cacheKey;
		renderTextToCache(
			text,
			font,
			settings,
			effectiveLetterSpacing,
			rgbShiftPx,
			runtime
		);
	}

	ctx.save();
	ctx.globalAlpha *= clamp(settings.opacity, 0, 1);
	ctx.font = font;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';

	const gap = settings.fontSize * 1.6;
	const measuredWidth = runtime.measuredWidth;
	const shouldScroll = measuredWidth > boxWidth && scrollSpeed > 0;
	if (shouldScroll) {
		const cycle = measuredWidth + gap;
		runtime.offset = (runtime.offset + scrollSpeed * dt) % cycle;
	} else {
		runtime.offset = 0;
	}

	ctx.save();
	applyRoundedRectPath(
		ctx,
		left,
		lineTop,
		boxWidth,
		lineHeight,
		Math.max(8, settings.fontSize * 0.35)
	);
	ctx.clip();
	ctx.filter = 'none';
	ctx.shadowBlur = 0;

	const renderedCanvas = runtime.renderedCanvas;
	if (renderedCanvas && shouldScroll) {
		const cycle = measuredWidth + gap;
		const anchorX = left - runtime.offset;
		const drawX = roundCanvasPosition(anchorX - runtime.canvasPaddingX);
		const drawY = roundCanvasPosition(
			centerY - runtime.logicalCanvasHeight / 2
		);
		ctx.drawImage(
			renderedCanvas,
			drawX,
			drawY,
			runtime.logicalCanvasWidth,
			runtime.logicalCanvasHeight
		);
		ctx.drawImage(
			renderedCanvas,
			drawX + cycle,
			drawY,
			runtime.logicalCanvasWidth,
			runtime.logicalCanvasHeight
		);
	} else if (renderedCanvas) {
		const drawX = roundCanvasPosition(
			centerX - measuredWidth / 2 - runtime.canvasPaddingX
		);
		const drawY = roundCanvasPosition(
			centerY - runtime.logicalCanvasHeight / 2
		);
		ctx.drawImage(
			renderedCanvas,
			drawX,
			drawY,
			runtime.logicalCanvasWidth,
			runtime.logicalCanvasHeight
		);
	} else if (shouldScroll) {
		const cycle = measuredWidth + gap;
		const anchorX = left - runtime.offset;
		drawTextRun(
			ctx,
			text,
			anchorX,
			centerY,
			rgbShiftPx,
			settings,
			effectiveLetterSpacing
		);
		drawTextRun(
			ctx,
			text,
			anchorX + cycle,
			centerY,
			rgbShiftPx,
			settings,
			effectiveLetterSpacing
		);
	} else {
		drawTextRun(
			ctx,
			text,
			centerX - measuredWidth / 2,
			centerY,
			rgbShiftPx,
			settings,
			effectiveLetterSpacing
		);
	}

	ctx.restore();
	ctx.restore();
}

function getTitleLineSettings(settings: TrackTitleSettings): TextLineSettings {
	return {
		fontStyle: settings.audioTrackTitleFontStyle,
		fontSize: clamp(settings.audioTrackTitleFontSize, 12, 160),
		letterSpacing: settings.audioTrackTitleLetterSpacing,
		opacity: settings.audioTrackTitleOpacity,
		rgbShift: settings.audioTrackTitleRgbShift,
		textColor: settings.audioTrackTitleTextColor,
		strokeColor: settings.audioTrackTitleStrokeColor,
		strokeWidth: clamp(settings.audioTrackTitleStrokeWidth, 0, 8),
		glowColor: settings.audioTrackTitleGlowColor,
		glowBlur: settings.audioTrackTitleGlowBlur,
		glowReach: settings.audioTrackTitleGlowReach,
		filterBrightness: settings.audioTrackTitleFilterBrightness,
		filterContrast: settings.audioTrackTitleFilterContrast,
		filterSaturation: settings.audioTrackTitleFilterSaturation,
		filterBlur: settings.audioTrackTitleFilterBlur,
		filterHueRotate: settings.audioTrackTitleFilterHueRotate
	};
}

function getTimeLineSettings(settings: TrackTitleSettings): TextLineSettings {
	return {
		fontStyle: settings.audioTrackTimeFontStyle,
		fontSize: clamp(settings.audioTrackTimeFontSize, 10, 120),
		letterSpacing: settings.audioTrackTimeLetterSpacing,
		opacity: settings.audioTrackTimeOpacity,
		rgbShift: settings.audioTrackTimeRgbShift,
		textColor: settings.audioTrackTimeTextColor,
		strokeColor: settings.audioTrackTimeStrokeColor,
		strokeWidth: clamp(settings.audioTrackTimeStrokeWidth, 0, 8),
		glowColor: settings.audioTrackTimeGlowColor,
		glowBlur: settings.audioTrackTimeGlowBlur,
		glowReach: settings.audioTrackTimeGlowReach,
		filterBrightness: settings.audioTrackTimeFilterBrightness,
		filterContrast: settings.audioTrackTimeFilterContrast,
		filterSaturation: settings.audioTrackTimeFilterSaturation,
		filterBlur: settings.audioTrackTimeFilterBlur,
		filterHueRotate: settings.audioTrackTimeFilterHueRotate
	};
}

export function drawTrackTitleOverlay(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	nowPlaying: NowPlayingData,
	currentTime: number,
	duration: number,
	dt: number,
	settings: TrackTitleSettings,
	scope: TrackTitleScope = LIVE_TRACK_TITLE_SCOPE
): void {
	if (settings.nowPlayingMode === 'widget') {
		resetTrackTextRuntime(scope.overlayTitle);
		resetTrackTextRuntime(scope.overlayTime);
		drawNowPlayingWidget(
			ctx,
			canvas,
			nowPlaying,
			currentTime,
			duration,
			dt,
			settings,
			scope
		);
		return;
	}

	// Free (legacy) mode: a single title line built from artist + title plus an
	// independent clock line. The clock line keeps its own positioning.
	const combined = nowPlaying.artist
		? `${nowPlaying.artist} — ${nowPlaying.title}`
		: nowPlaying.title;
	const title = combined;
	const cleanTitle = (
		settings.audioTrackTitleUppercase ? title.toUpperCase() : title
	).trim();
	const timeText = settings.audioTrackTimeEnabled
		? formatPlaybackTime(currentTime, duration)
		: '';
	const showTitle = settings.audioTrackTitleEnabled && cleanTitle.length > 0;
	const showTime = settings.audioTrackTimeEnabled && timeText.length > 0;

	if (!showTitle) resetTrackTextRuntime(scope.overlayTitle);
	if (!showTime) resetTrackTextRuntime(scope.overlayTime);
	if (!showTitle && !showTime) return;

	const titleWidthRatio = clamp(settings.audioTrackTitleWidth, 0.2, 1);
	const timeWidthRatio = clamp(settings.audioTrackTimeWidth, 0.2, 1);
	const boxWidth = canvas.width * titleWidthRatio;
	const timeBoxWidth = canvas.width * timeWidthRatio;
	const padding = clamp(settings.audioTrackTitleBackdropPadding, 0, 48);
	const titleCenterX = resolveHorizontalCenter(
		canvas,
		settings,
		boxWidth,
		padding
	);
	const timeCenterX =
		canvas.width / 2 +
		settings.audioTrackTimePositionX * canvas.width * 0.5;

	const titleLineSettings = getTitleLineSettings(settings);
	const timeLineSettings = getTimeLineSettings(settings);
	const titleHeight = showTitle ? titleLineSettings.fontSize * 1.55 : 0;
	const timeHeight = showTime ? timeLineSettings.fontSize * 1.35 : 0;
	const titleCenterY =
		canvas.height / 2 -
		settings.audioTrackTitlePositionY * canvas.height * 0.5;
	const timeCenterY =
		canvas.height / 2 -
		settings.audioTrackTimePositionY * canvas.height * 0.5;
	const titleLeft = titleCenterX - boxWidth / 2;
	const titleTop = titleCenterY - titleHeight / 2;
	const timeLeft = timeCenterX - timeBoxWidth / 2;
	const timeTop = timeCenterY - timeHeight / 2;

	ctx.save();
	if (settings.audioTrackTitleBackdropEnabled) {
		if (showTitle) {
			drawLineBackdrop({
				ctx,
				left: titleLeft,
				top: titleTop,
				boxWidth,
				lineHeight: titleHeight,
				padding,
				fontSize: titleLineSettings.fontSize,
				backdropColor: settings.audioTrackTitleBackdropColor,
				backdropOpacity: settings.audioTrackTitleBackdropOpacity
			});
		}
		if (showTime) {
			drawLineBackdrop({
				ctx,
				left: timeLeft,
				top: timeTop,
				boxWidth: timeBoxWidth,
				lineHeight: timeHeight,
				padding,
				fontSize: timeLineSettings.fontSize,
				backdropColor: settings.audioTrackTitleBackdropColor,
				backdropOpacity: settings.audioTrackTitleBackdropOpacity
			});
		}
	}

	if (showTitle) {
		drawTextLine({
			ctx,
			canvas,
			text: cleanTitle,
			runtime: scope.overlayTitle,
			settings: titleLineSettings,
			centerX: titleCenterX,
			centerY: titleCenterY,
			left: titleLeft,
			boxWidth,
			lineTop: titleTop,
			lineHeight: titleHeight,
			dt,
			scrollSpeed: settings.audioTrackTitleScrollSpeed
		});
	}

	if (showTime) {
		drawTextLine({
			ctx,
			canvas,
			text: timeText,
			runtime: scope.overlayTime,
			settings: timeLineSettings,
			centerX: timeCenterX,
			centerY: timeCenterY,
			left: timeLeft,
			boxWidth: timeBoxWidth,
			lineTop: timeTop,
			lineHeight: timeHeight,
			dt,
			scrollSpeed: 0
		});
	}

	ctx.restore();
}
