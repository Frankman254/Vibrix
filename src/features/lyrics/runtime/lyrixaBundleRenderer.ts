import { resolveLyricsLaneCenters } from '../domain/lyricsLaneLayout';
import type {
	LyrixaLyricClip,
	LyrixaLyricLayer
} from '@/features/lyrics/domain/lyrixaBundleTypes';
import type {
	LyrixaLayerOverride,
	LyrixaLayerOverrideMap
} from '@/features/lyrics/domain/types';
import type {
	LyrixaClipPositionPreset,
	LyrixaLyricsBundleEnvelope,
	LyrixaLyricVisualStyle
} from '@/features/lyrics/domain/lyrixaBundleTypes';
import { DEFAULT_LYRIXA_LYRIC_STYLE } from '@/features/lyrics/domain/lyrixaBundleTypes';
import {
	mergeLyrixaVisualStyle,
	resolveClipCoords
} from '@/features/lyrics/domain/lyrixaBundle';
import {
	createLyricsHorizontalPaint,
	isMultiColorLyricsMode,
	resolveLyricsColorSlot,
	resolveLyricsRotationStep,
	rotationStepToPhase
} from '@/features/lyrics/domain/lyricsColorModes';
import type { LyricsPalettes } from '@/features/lyrics/domain/lyricsColorModes';

type Anchor = {
	x: number;
	y: number;
	align: CanvasTextAlign;
};

type RenderableBundleLine = {
	text: string;
	style: LyrixaLyricVisualStyle;
	anchor: Anchor;
	zIndex: number;
	/** Kept alongside the merged style: the color MODES live on the override
	 *  only, they have no equivalent in the bundle's own style config. */
	override?: LyrixaLayerOverride;
};

type LyrixaLyricsBundleRenderOptions = {
	layerOverrides?: LyrixaLayerOverrideMap;
	/** Palettes the per-layer image/theme color sources sample from. */
	palettes?: LyricsPalettes;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function parseCssNumber(
	value: string | number | undefined,
	fontSizePx = 16
): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value !== 'string') return 0;
	const trimmed = value.trim();
	if (!trimmed) return 0;
	if (trimmed.endsWith('rem')) {
		return Number.parseFloat(trimmed) * 16;
	}
	if (trimmed.endsWith('em')) {
		return Number.parseFloat(trimmed) * fontSizePx;
	}
	if (trimmed.endsWith('px')) {
		return Number.parseFloat(trimmed);
	}
	return Number.parseFloat(trimmed);
}

function resolveAnchorFromPreset(
	preset: LyrixaClipPositionPreset,
	canvas: HTMLCanvasElement
): Anchor {
	const marginX = canvas.width * 0.08;
	const marginY = canvas.height * 0.12;
	switch (preset) {
		case 'top':
			return { x: canvas.width / 2, y: marginY, align: 'center' };
		case 'bottom':
			return {
				x: canvas.width / 2,
				y: canvas.height - marginY,
				align: 'center'
			};
		case 'top-left':
			return { x: marginX, y: marginY, align: 'left' };
		case 'top-right':
			return {
				x: canvas.width - marginX,
				y: marginY,
				align: 'right'
			};
		case 'bottom-left':
			return {
				x: marginX,
				y: canvas.height - marginY,
				align: 'left'
			};
		case 'bottom-right':
			return {
				x: canvas.width - marginX,
				y: canvas.height - marginY,
				align: 'right'
			};
		case 'center':
		default:
			return {
				x: canvas.width / 2,
				y: canvas.height / 2,
				align: 'center'
			};
	}
}

function resolveTextTransform(
	text: string,
	transform: LyrixaLyricVisualStyle['textTransform']
): string {
	if (transform === 'uppercase') return text.toUpperCase();
	if (transform === 'lowercase') return text.toLowerCase();
	return text;
}

function resolveLineAnchor(
	layer: LyrixaLyricLayer,
	clip: LyrixaLyricClip,
	canvas: HTMLCanvasElement,
	indexInLayer: number,
	lineHeightPx: number
): Anchor {
	const coords = resolveClipCoords(clip);
	if (coords) {
		return {
			x: coords.x * canvas.width,
			y: coords.y * canvas.height + indexInLayer * lineHeightPx,
			align: 'center'
		};
	}

	const preset =
		clip.position && clip.position !== 'center'
			? clip.position
			: (layer.renderSettings?.positionPreset ?? 'center');
	const anchor = resolveAnchorFromPreset(preset, canvas);
	const textAlign = layer.renderSettings?.textAlign;
	const baselineOffset = indexInLayer * lineHeightPx;
	return {
		x: anchor.x,
		y: anchor.y + baselineOffset,
		align:
			textAlign === 'left' ||
			textAlign === 'right' ||
			textAlign === 'center'
				? textAlign
				: anchor.align
	};
}

function applyAnchorOverride(
	anchor: Anchor,
	override: LyrixaLayerOverride | undefined,
	canvas: HTMLCanvasElement
): Anchor {
	if (!override) return anchor;
	const offsetX = clamp(override.positionOffsetX ?? 0, -2, 2);
	const offsetY = clamp(override.positionOffsetY ?? 0, -2, 2);
	return {
		...anchor,
		x: anchor.x + offsetX * canvas.width,
		y: anchor.y - offsetY * canvas.height
	};
}

function applyLayerStyleOverride(
	style: LyrixaLyricVisualStyle,
	override: LyrixaLayerOverride | undefined
): LyrixaLyricVisualStyle {
	if (!override) return style;
	const next: LyrixaLyricVisualStyle = { ...style };
	if (override.textColor) {
		next.textColor = override.textColor;
		next.activeTextColor = override.textColor;
	}
	if (override.glowColor) next.glowColor = override.glowColor;
	if (override.glowIntensity !== undefined) {
		next.glowIntensity = clamp(override.glowIntensity, 0, 4);
	}
	if (override.blurAmount !== undefined) {
		next.blurAmount = clamp(override.blurAmount, 0, 80);
	}
	if (override.opacity !== undefined) {
		next.opacity = clamp(override.opacity, 0, 1);
	}
	if (override.scale !== undefined) {
		const baseFontSize = Math.max(
			12,
			parseCssNumber(next.fontSize ?? DEFAULT_LYRIXA_LYRIC_STYLE.fontSize)
		);
		next.fontSize = `${baseFontSize * clamp(override.scale, 0.2, 4)}px`;
	}
	return next;
}

/** Horizontal extent of the drawn text run, given the anchor's alignment. */
function resolveTextRunBounds(
	ctx: CanvasRenderingContext2D,
	text: string,
	anchor: Anchor
): { left: number; right: number; width: number } {
	const width = Math.max(1, ctx.measureText(text).width);
	const left =
		anchor.align === 'left'
			? anchor.x
			: anchor.align === 'right'
				? anchor.x - width
				: anchor.x - width / 2;
	return { left, right: left + width, width };
}

function resolveCanvasFillStyle(
	ctx: CanvasRenderingContext2D,
	text: string,
	anchor: Anchor,
	style: LyrixaLyricVisualStyle,
	fontSizePx: number,
	override?: LyrixaLayerOverride,
	palettes?: LyricsPalettes
): string | CanvasGradient {
	const fill = style.textFill;
	const solidFallback =
		override?.textColor ??
		fill?.solidColor ??
		style.textColor ??
		DEFAULT_LYRIXA_LYRIC_STYLE.textColor;
	// Anything chosen for THIS layer outranks the bundle's own textFill —
	// including a plain solid, which a bundle-level `textFill.solidColor` or
	// gradient would otherwise keep overriding.
	if (
		override?.textColor !== undefined ||
		override?.textColorMode !== undefined ||
		override?.textColorSource !== undefined
	) {
		const bounds = resolveTextRunBounds(ctx, text, anchor);
		const slot = resolveLyricsColorSlot(
			{
				source: override?.textColorSource,
				mode: override?.textColorMode,
				primary: override?.textColor ?? solidFallback,
				secondary: override?.textColorSecondary
			},
			palettes
		);
		return createLyricsHorizontalPaint(
			ctx,
			slot,
			bounds.left,
			bounds.right,
			rotationStepToPhase(resolveLyricsRotationStep(slot))
		);
	}
	if (fill?.type === 'gradient' && fill.gradient) {
		const bounds = resolveTextRunBounds(ctx, text, anchor);
		const height = Math.max(1, fontSizePx);
		const cx = bounds.left + bounds.width / 2;
		const cy = anchor.y;
		const angleRad = ((fill.gradient.angle ?? 0) * Math.PI) / 180;
		const radius = Math.max(bounds.width, height) / 2;
		const dx = Math.cos(angleRad) * radius;
		const dy = Math.sin(angleRad) * radius;
		const gradient = ctx.createLinearGradient(
			cx - dx,
			cy - dy,
			cx + dx,
			cy + dy
		);
		gradient.addColorStop(0, fill.gradient.colorA);
		gradient.addColorStop(1, fill.gradient.colorB);
		return gradient;
	}
	// image-texture: requires loading the asset's objectUrl into an Image
	// and masking it against the text — out of scope for now. Fall back to solid.
	return solidFallback;
}

function strokeAndFillText(
	ctx: CanvasRenderingContext2D,
	text: string,
	anchor: Anchor,
	style: LyrixaLyricVisualStyle,
	fontSizePx: number,
	override?: LyrixaLayerOverride,
	palettes?: LyricsPalettes
) {
	const strokeWidth = Math.max(
		0,
		override?.strokeWidth ?? style.strokeWidth ?? 0
	);
	if (strokeWidth > 0) {
		ctx.lineJoin = 'round';
		ctx.lineWidth = strokeWidth;
		const strokeBase =
			override?.strokeColor ??
			style.strokeColor ??
			DEFAULT_LYRIXA_LYRIC_STYLE.strokeColor;
		const strokeNeedsPaint =
			isMultiColorLyricsMode(override?.strokeColorMode) ||
			(override?.strokeColorSource !== undefined &&
				override.strokeColorSource !== 'manual');
		if (strokeNeedsPaint) {
			// strokeStyle takes a CanvasGradient just like fillStyle, so the
			// border needs no extra pass — unlike the glow, see below.
			const bounds = resolveTextRunBounds(ctx, text, anchor);
			const slot = resolveLyricsColorSlot(
				{
					source: override?.strokeColorSource,
					mode: override?.strokeColorMode,
					primary: strokeBase,
					secondary: override?.strokeColorSecondary
				},
				palettes
			);
			ctx.strokeStyle = createLyricsHorizontalPaint(
				ctx,
				slot,
				bounds.left,
				bounds.right,
				rotationStepToPhase(resolveLyricsRotationStep(slot))
			);
		} else {
			ctx.strokeStyle = strokeBase;
		}
		ctx.strokeText(text, anchor.x, anchor.y);
	}
	ctx.fillStyle = resolveCanvasFillStyle(
		ctx,
		text,
		anchor,
		style,
		fontSizePx,
		override,
		palettes
	);
	ctx.fillText(text, anchor.x, anchor.y);
}

/**
 * Scratch surface for the multicolor halo. One per module: the halo is drawn,
 * tinted and blitted within a single call, so it never needs to persist.
 */
let haloScratch: HTMLCanvasElement | null = null;

function acquireHaloScratch(
	width: number,
	height: number
): CanvasRenderingContext2D | null {
	if (typeof document === 'undefined') return null;
	const pixelWidth = Math.max(1, Math.ceil(width));
	const pixelHeight = Math.max(1, Math.ceil(height));
	if (!haloScratch) haloScratch = document.createElement('canvas');
	if (
		haloScratch.width !== pixelWidth ||
		haloScratch.height !== pixelHeight
	) {
		haloScratch.width = pixelWidth;
		haloScratch.height = pixelHeight;
	}
	const ctx = haloScratch.getContext('2d');
	if (!ctx) return null;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, pixelWidth, pixelHeight);
	ctx.globalCompositeOperation = 'source-over';
	ctx.filter = 'none';
	return ctx;
}

/**
 * Multicolor halo.
 *
 * `ctx.shadowColor` only accepts a CSS color, never a CanvasGradient. Stacking
 * blurred gradient copies of the text did produce a multicolor halo, but at
 * five full-canvas blurred draws PER FRAME it was far too expensive. Instead
 * the halo is built once on a scratch canvas the size of the text — one
 * `shadowBlur` pass, exactly the shape the solid halo has — and then tinted
 * through `source-in`, which replaces its color while keeping its alpha.
 */
function drawMultiColorGlowPass(
	ctx: CanvasRenderingContext2D,
	text: string,
	anchor: Anchor,
	style: LyrixaLyricVisualStyle,
	override: LyrixaLayerOverride,
	glowIntensity: number,
	fontSizePx: number,
	font: string,
	palettes?: LyricsPalettes
) {
	if (glowIntensity <= 0.01) return;
	const slot = resolveLyricsColorSlot(
		{
			source: override.glowColorSource,
			mode: override.glowColorMode,
			primary:
				override.glowColor ??
				style.glowColor ??
				DEFAULT_LYRIXA_LYRIC_STYLE.glowColor,
			secondary: override.glowColorSecondary
		},
		palettes
	);
	const bounds = resolveTextRunBounds(ctx, text, anchor);
	const haloBlur = glowIntensity * 16;
	const padding = Math.ceil(haloBlur + fontSizePx * 0.6);
	const width = bounds.width + padding * 2;
	const height = fontSizePx * 2.4 + padding * 2;
	const scratch = acquireHaloScratch(width, height);
	if (!scratch) return;

	scratch.translate(padding, height / 2);
	scratch.font = font;
	scratch.textBaseline = 'middle';
	scratch.textAlign = 'left';
	scratch.fillStyle = '#ffffff';
	scratch.shadowColor = '#ffffff';
	scratch.shadowBlur = haloBlur;
	scratch.fillText(text, 0, 0);
	scratch.shadowColor = 'transparent';
	scratch.shadowBlur = 0;
	scratch.globalCompositeOperation = 'source-in';
	scratch.fillStyle = createLyricsHorizontalPaint(
		scratch,
		slot,
		0,
		bounds.width,
		rotationStepToPhase(resolveLyricsRotationStep(slot))
	);
	scratch.fillRect(-padding, -height / 2, width, height);
	scratch.globalCompositeOperation = 'source-over';

	ctx.drawImage(
		haloScratch!,
		bounds.left - padding,
		anchor.y - height / 2,
		width,
		height
	);
}

function drawBackgroundPill(
	ctx: CanvasRenderingContext2D,
	text: string,
	anchor: Anchor,
	style: LyrixaLyricVisualStyle,
	fontSizePx: number
) {
	if (!style.backgroundPill && !style.backgroundEmphasis) return;
	const metrics = ctx.measureText(text);
	const width = metrics.width + fontSizePx * 0.8;
	const height = fontSizePx * 1.35;
	const x =
		anchor.align === 'left'
			? anchor.x - fontSizePx * 0.25
			: anchor.align === 'right'
				? anchor.x - width + fontSizePx * 0.25
				: anchor.x - width / 2;
	const y = anchor.y - height / 2;
	const radius = height / 2;

	ctx.save();
	ctx.globalAlpha = clamp(
		style.backgroundOpacity ?? DEFAULT_LYRIXA_LYRIC_STYLE.backgroundOpacity,
		0,
		1
	);
	ctx.fillStyle =
		style.backgroundColor ?? DEFAULT_LYRIXA_LYRIC_STYLE.backgroundColor;
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + width, y, x + width, y + height, radius);
	ctx.arcTo(x + width, y + height, x, y + height, radius);
	ctx.arcTo(x, y + height, x, y, radius);
	ctx.arcTo(x, y, x + width, y, radius);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

function collectRenderableLines(
	envelope: LyrixaLyricsBundleEnvelope,
	canvas: HTMLCanvasElement,
	currentTimeSec: number,
	options: LyrixaLyricsBundleRenderOptions = {}
): RenderableBundleLine[] {
	const layerOverrides = options.layerOverrides ?? {};
	const layers = [...envelope.project.layers]
		.filter(
			layer =>
				layer.visible !== false ||
				layerOverrides[layer.id]?.visible === true
		)
		.sort((a, b) => a.order - b.order);
	const lines: RenderableBundleLine[] = [];
	const laneCenters = resolveLyricsLaneCenters(
		envelope,
		currentTimeSec,
		layerOverrides
	);

	layers.forEach(layer => {
		const layerOverride = layerOverrides[layer.id];
		if (layerOverride?.visible === false) return;
		const layerClips = envelope.project.clips
			.filter(
				clip =>
					clip.layerId === layer.id &&
					clip.text.trim().length > 0 &&
					!clip.muted &&
					(!layer.renderSettings?.suppressClipText ||
						clip.forceTextRender) &&
					currentTimeSec >= clip.startTime &&
					currentTimeSec <= clip.endTime
			)
			.sort((a, b) => a.startTime - b.startTime);
		layerClips.forEach((clip, index) => {
			const style = applyLayerStyleOverride(
				mergeLyrixaVisualStyle(
					envelope.project.styleConfig,
					layer.styleDefaults,
					clip.styleOverride
				),
				layerOverride
			);
			const fontSizePx = Math.max(
				12,
				parseCssNumber(
					style.fontSize ?? DEFAULT_LYRIXA_LYRIC_STYLE.fontSize
				)
			);
			const lineHeightMultiplier = Math.max(
				0.8,
				parseCssNumber(
					style.lineHeight ?? DEFAULT_LYRIXA_LYRIC_STYLE.lineHeight,
					fontSizePx
				)
			);
			const laneCenter = laneCenters.get(layer.id);
			const anchor = applyAnchorOverride(
				laneCenter !== undefined
					? {
							x: canvas.width / 2,
							y:
								laneCenter * canvas.height +
								(index - (layerClips.length - 1) / 2) *
									fontSizePx *
									lineHeightMultiplier,
							align: 'center'
						}
					: resolveLineAnchor(
							layer,
							clip,
							canvas,
							index,
							fontSizePx * lineHeightMultiplier
						),
				layerOverride,
				canvas
			);
			lines.push({
				text: resolveTextTransform(
					clip.text,
					style.textTransform ??
						DEFAULT_LYRIXA_LYRIC_STYLE.textTransform
				),
				style,
				anchor,
				zIndex: layer.renderSettings?.zIndex ?? layer.order,
				override: layerOverride
			});
		});
	});

	return lines.sort((a, b) => a.zIndex - b.zIndex);
}

export function drawLyrixaLyricsBundle(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	envelope: LyrixaLyricsBundleEnvelope,
	currentTimeSec: number,
	options: LyrixaLyricsBundleRenderOptions = {}
) {
	const lines = collectRenderableLines(
		envelope,
		canvas,
		currentTimeSec,
		options
	);
	if (lines.length === 0) return;

	ctx.save();
	ctx.textBaseline = 'middle';

	lines.forEach(line => {
		const style = line.style;
		const fontSizePx = Math.max(
			12,
			parseCssNumber(
				style.fontSize ?? DEFAULT_LYRIXA_LYRIC_STYLE.fontSize
			)
		);
		const fontWeight =
			style.fontWeight ?? DEFAULT_LYRIXA_LYRIC_STYLE.fontWeight;
		const fontFamily =
			style.fontFamily && style.fontFamily !== 'inherit'
				? style.fontFamily
				: '"Inter", "Segoe UI", Arial, sans-serif';
		const blurPx = Math.max(
			0,
			parseCssNumber(
				style.blurAmount ?? DEFAULT_LYRIXA_LYRIC_STYLE.blurAmount
			)
		);
		const glowIntensity = clamp(
			style.glowIntensity ?? DEFAULT_LYRIXA_LYRIC_STYLE.glowIntensity,
			0,
			4
		);
		const alpha = clamp(
			style.opacity ?? DEFAULT_LYRIXA_LYRIC_STYLE.opacity,
			0,
			1
		);

		const glowIsMultiColor =
			isMultiColorLyricsMode(line.override?.glowColorMode) ||
			(line.override?.glowColorSource !== undefined &&
				line.override.glowColorSource !== 'manual');

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.textAlign = line.anchor.align;
		ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
		if (glowIsMultiColor) {
			// The shadow would otherwise stack a single-color halo on top of
			// the gradient one drawn below.
			ctx.shadowColor = 'transparent';
			ctx.shadowBlur = 0;
		} else {
			ctx.shadowColor =
				style.glowColor ?? DEFAULT_LYRIXA_LYRIC_STYLE.glowColor;
			ctx.shadowBlur = glowIntensity * 16;
		}
		ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';

		drawBackgroundPill(ctx, line.text, line.anchor, style, fontSizePx);
		// Between pill and text, mirroring where the solid halo lands.
		if (glowIsMultiColor && line.override) {
			drawMultiColorGlowPass(
				ctx,
				line.text,
				line.anchor,
				style,
				line.override,
				glowIntensity,
				fontSizePx,
				`${fontWeight} ${fontSizePx}px ${fontFamily}`,
				options.palettes
			);
		}
		strokeAndFillText(
			ctx,
			line.text,
			line.anchor,
			style,
			fontSizePx,
			line.override,
			options.palettes
		);
		ctx.restore();
	});

	ctx.restore();
}
