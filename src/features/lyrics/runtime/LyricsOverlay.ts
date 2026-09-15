import type { WallpaperState } from '@/types/wallpaper';
import { getCachedLyricsDocument } from '@/features/lyrics/domain/cache';
import { findActiveLyricsLineIndex } from '@/features/lyrics/domain/parser';
import { resolveClipCoords } from '@/features/lyrics/domain/lyrixaBundle';
import {
	hasRenderableLyrixaBundle,
	translationLayerIds
} from '@/features/lyrics/domain/lyrixaBundle';
import { drawLyrixaLyricsBundle } from './lyrixaBundleRenderer';
import { buildTrackFont } from '@/lib/canvasText/trackFonts';
import { applyTextTreatment } from '@/lib/canvasText/trackTextTreatment';
import {
	createOffscreenCanvas,
	getTextRenderScale
} from '@/lib/canvasText/textRenderCache';
import {
	createLyricsHorizontalPaint,
	lyricsColorSlotCacheKey,
	resolveLyricStyleSlots,
	resolveLyricsRotationStep,
	rotationStepToPhase
} from '@/features/lyrics/domain/lyricsColorModes';
import type {
	LyricsPalettes,
	ResolvedLyricsColorSlot
} from '@/features/lyrics/domain/lyricsColorModes';
import type {
	LyrixaClipPositionPreset,
	LyrixaLyricCoordinates,
	LyrixaLyricLayer,
	LyrixaLyricsBundleEnvelope
} from '@/features/lyrics/domain/lyrixaBundleTypes';
import type { LyrixaLayerOverrideMap } from '@/features/lyrics/domain/types';
import type {
	LyricsActiveAnimation,
	LyricsTextTransition
} from '@/types/wallpaper';

/** Shared empty map: avoids allocating one per animation frame. */
const EMPTY_OVERRIDES: LyrixaLayerOverrideMap = {};

/**
 * Memoizes the last resolved override map. `drawLyricsOverlay` runs every
 * frame, and all three inputs are stable references between frames, so
 * without this the hidden-translation path would allocate a Set and an object
 * sixty times a second for a result that never changes.
 */
let overrideCache: {
	bundle: LyrixaLyricsBundleEnvelope | null;
	overrides: LyrixaLayerOverrideMap | undefined;
	showTranslation: boolean;
	result: LyrixaLayerOverrideMap;
} | null = null;

/**
 * Hiding the translation is expressed as a layer override, so both render
 * paths honour it through the machinery they already have.
 *
 * An explicit per-layer `visible: true` set in the Bundle Layers panel wins:
 * turning that one layer back on by hand is a more specific instruction than
 * the global preference.
 */
function resolveLayerOverrides(
	bundle: LyrixaLyricsBundleEnvelope | null,
	overrides: LyrixaLayerOverrideMap | undefined,
	showTranslation: boolean
): LyrixaLayerOverrideMap {
	if (
		overrideCache &&
		overrideCache.bundle === bundle &&
		overrideCache.overrides === overrides &&
		overrideCache.showTranslation === showTranslation
	) {
		return overrideCache.result;
	}

	const base = overrides ?? EMPTY_OVERRIDES;
	let result = base;
	if (!showTranslation) {
		const hidden = [...translationLayerIds(bundle)].filter(
			id => base[id]?.visible !== true
		);
		if (hidden.length > 0) {
			result = { ...base };
			for (const id of hidden) {
				result[id] = { ...(base[id] ?? {}), visible: false };
			}
		}
	}
	overrideCache = { bundle, overrides, showTranslation, result };
	return result;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Matches the factory default of the global Glow Blur slider. */
const LAYER_GLOW_FALLBACK_BLUR = 20;

function getFont(state: WallpaperState): string {
	return buildTrackFont(
		state.audioLyricsFontStyle,
		state.audioLyricsFontSize
	);
}

function measureSpacedTextWidth(
	ctx: CanvasRenderingContext2D,
	text: string,
	letterSpacing: number
): number {
	if (!text) return 0;
	return (
		ctx.measureText(text).width +
		Math.max(0, text.length - 1) * Math.max(0, letterSpacing)
	);
}

function wrapText(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	letterSpacing: number
): string[] {
	// A collapsed layout (0-width) would otherwise emit untruncated words.
	if (maxWidth <= 1) return [''];
	if (!text.trim()) return [''];
	if (measureSpacedTextWidth(ctx, text, letterSpacing) <= maxWidth) {
		return [text];
	}

	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [''];

	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (measureSpacedTextWidth(ctx, next, letterSpacing) <= maxWidth) {
			current = next;
			continue;
		}
		if (current) lines.push(current);
		current = word;
	}
	if (current) lines.push(current);
	return lines;
}

// ── Caches ───────────────────────────────────────────────────────────────
// Wrapping re-measured every word every frame even when nothing changed;
// memoize per {text, width, spacing, font}.
const WRAP_CACHE_MAX = 128;
const wrapCache = new Map<string, string[]>();

function wrapTextCached(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	letterSpacing: number,
	font: string
): string[] {
	const key = `${text}|${Math.round(maxWidth)}|${letterSpacing.toFixed(2)}|${font}`;
	const cached = wrapCache.get(key);
	if (cached) {
		wrapCache.delete(key);
		wrapCache.set(key, cached);
		return cached;
	}
	const wrapped = wrapText(ctx, text, maxWidth, letterSpacing);
	wrapCache.set(key, wrapped);
	if (wrapCache.size > WRAP_CACHE_MAX) {
		const oldest = wrapCache.keys().next().value;
		if (oldest !== undefined) wrapCache.delete(oldest);
	}
	return wrapped;
}

// Drawing glow via ctx.shadowBlur per glyph per frame was the single most
// expensive path in the audio layer: a full blur kernel (up to glowBlur×reach
// px) rasterized per glyph, per line, per frame. Mirroring the cache
// TrackTitleOverlay already uses, each unique styled line is rendered ONCE to
// two offscreen canvases (halo + fill) and blitted per frame. Pulse
// animations modulate the halo's ALPHA instead of its blur radius, so they
// never invalidate the cache mid-song.

type LyricLineStyle = {
	text: string;
	font: string;
	fontSize: number;
	letterSpacing: number;
	color: string;
	secondaryColor: string;
	glowColor: string;
	glowBlurBase: number;
	glowReach: number;
	treatment: WallpaperState['audioLyricsTextTreatment'];
	strokeColor: string;
	strokeWidth: number;
	/**
	 * Per-layer paints (bundle layers only). Plain lyrics resolve to a solid
	 * slot built from the global colors, i.e. the original behaviour.
	 */
	fillSlot: ResolvedLyricsColorSlot;
	strokeSlot: ResolvedLyricsColorSlot;
	glowSlot: ResolvedLyricsColorSlot;
	/**
	 * True when the layer panel set this slot explicitly. Treatments like
	 * `glass` / `metallic` / `neon` paint their own fill and ignore the base
	 * color, so without this a per-layer solid color silently rendered as the
	 * treatment's white ramp.
	 */
	fillIsExplicit?: boolean;
	/** Quantized rotation step, or `null` when the style does not animate. */
	rotationStep: number | null;
};

type LyricLineRenderEntry = {
	glowCanvas: HTMLCanvasElement | null;
	textCanvas: HTMLCanvasElement;
	/** Rotation step baked into these canvases; `null` for static styles. */
	rotationStep: number | null;
	measuredWidth: number;
	paddingX: number;
	logicalWidth: number;
	logicalHeight: number;
	haloAlphaBase: number;
};

const LINE_RENDER_CACHE_MAX = 64;
const lineRenderCache = new Map<string, LyricLineRenderEntry>();

function buildLineRenderKey(
	style: LyricLineStyle,
	renderScale: number
): string {
	return [
		style.text,
		style.font,
		style.letterSpacing.toFixed(2),
		style.color,
		style.secondaryColor,
		style.glowColor,
		style.glowBlurBase.toFixed(2),
		style.glowReach.toFixed(2),
		style.treatment,
		style.strokeColor,
		style.strokeWidth.toFixed(2),
		// Gradient/rainbow bake into the cached canvases, so they must key it.
		style.fillSlot.mode,
		style.fillIsExplicit ? 'explicit' : 'inherit',
		lyricsColorSlotCacheKey(style.fillSlot),
		style.strokeSlot.mode,
		lyricsColorSlotCacheKey(style.strokeSlot),
		style.glowSlot.mode,
		lyricsColorSlotCacheKey(style.glowSlot),
		renderScale.toFixed(2)
	].join('|');
}

function drawSpacedGlyphs(
	ctx: CanvasRenderingContext2D,
	glyphs: string[],
	glyphWidths: number[],
	startX: number,
	y: number,
	letterSpacing: number,
	stroke?: { color: string | CanvasGradient; width: number }
) {
	let cursorX = startX;
	for (let index = 0; index < glyphs.length; index += 1) {
		if (stroke && stroke.width > 0) {
			ctx.lineJoin = 'round';
			ctx.lineWidth = stroke.width;
			ctx.strokeStyle = stroke.color;
			ctx.strokeText(glyphs[index]!, cursorX, y);
		}
		ctx.fillText(glyphs[index]!, cursorX, y);
		cursorX += glyphWidths[index]! + letterSpacing;
	}
}

/**
 * Reuses a cached canvas when the geometry is unchanged. Rotating lines re-bake
 * several times a second, and these canvases are megabytes each — reallocating
 * them would hand the GC a constant stream of large buffers.
 */
function acquireCanvas(
	reuse: HTMLCanvasElement | null | undefined,
	width: number,
	height: number
): HTMLCanvasElement | null {
	const pixelWidth = Math.max(1, Math.ceil(width));
	const pixelHeight = Math.max(1, Math.ceil(height));
	if (reuse && reuse.width === pixelWidth && reuse.height === pixelHeight) {
		const context = reuse.getContext('2d');
		if (context) {
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.clearRect(0, 0, pixelWidth, pixelHeight);
			context.filter = 'none';
			context.globalCompositeOperation = 'source-over';
			context.globalAlpha = 1;
			context.shadowColor = 'transparent';
			context.shadowBlur = 0;
			context.shadowOffsetX = 0;
			context.shadowOffsetY = 0;
			return reuse;
		}
	}
	return createOffscreenCanvas(pixelWidth, pixelHeight);
}

function renderLineToCache(
	style: LyricLineStyle,
	reuse?: LyricLineRenderEntry | null
): LyricLineRenderEntry | null {
	const rotationPhase = rotationStepToPhase(style.rotationStep);
	const measureCanvas = createOffscreenCanvas(8, 8);
	const measureCtx = measureCanvas?.getContext('2d');
	if (!measureCtx) return null;
	measureCtx.font = style.font;
	measureCtx.textBaseline = 'middle';

	const glyphs = Array.from(style.text);
	const glyphWidths = glyphs.map(char => measureCtx.measureText(char).width);
	const measuredWidth = glyphWidths.reduce(
		(sum, width, index) =>
			sum +
			width +
			(index < glyphWidths.length - 1
				? Math.max(0, style.letterSpacing)
				: 0),
		0
	);

	const reach = clamp(style.glowReach, 1, 3);
	const haloBlur = style.glowBlurBase * reach;
	const glowIsMultiColor = style.glowSlot.mode !== 'solid';
	const textIsMultiColor = style.fillSlot.mode !== 'solid';
	const strokeIsMultiColor = style.strokeSlot.mode !== 'solid';
	// A `filter: blur(r)` spreads wider than `shadowBlur: r` (r is a stdDev
	// there, not a radius), and the widest halo pass uses 0.9×haloBlur, so the
	// multicolor canvas needs room for roughly 3 stdDevs of that. Solid keeps
	// its exact original padding.
	const haloSpread = haloBlur;
	const paddingX = Math.ceil(
		12 + Math.max(haloSpread, style.strokeWidth * 2)
	);
	const paddingY = Math.ceil(
		style.fontSize * 0.9 + haloSpread + style.strokeWidth * 2
	);
	const renderScale = getTextRenderScale();
	const logicalWidth = measuredWidth + paddingX * 2;
	const logicalHeight = style.fontSize * 2.8 + paddingY * 2;
	const mAscent = measureCtx.measureText('M').actualBoundingBoxAscent;

	const setupCtx = (canvas: HTMLCanvasElement | null) => {
		const context = canvas?.getContext('2d');
		if (!context) return null;
		context.scale(renderScale, renderScale);
		context.translate(paddingX, logicalHeight / 2);
		context.font = style.font;
		context.textBaseline = 'middle';
		context.textAlign = 'left';
		return context;
	};

	let glowCanvas: HTMLCanvasElement | null = null;
	if (style.glowBlurBase > 0.01) {
		glowCanvas = acquireCanvas(
			reuse?.glowCanvas,
			logicalWidth * renderScale,
			logicalHeight * renderScale
		);
		const glowCtx = setupCtx(glowCanvas);
		if (glowCtx) {
			// `shadowColor` cannot take a CanvasGradient. Stacking blurred
			// gradient copies DID produce a multicolor halo, but a single line
			// cost ~25ms to bake — enough to drop frames every time a new lyric
			// appeared. Instead: build the halo exactly as the solid path does
			// (one shadowBlur pass, ~0.2ms) and, when the glow is multicolor,
			// tint that mask through `source-in`, which keeps its alpha and
			// only replaces the color.
			glowCtx.fillStyle = glowIsMultiColor ? '#ffffff' : style.glowColor;
			glowCtx.shadowColor = glowIsMultiColor
				? '#ffffff'
				: style.glowColor;
			glowCtx.shadowBlur = haloBlur;
			drawSpacedGlyphs(
				glowCtx,
				glyphs,
				glyphWidths,
				0,
				0,
				style.letterSpacing
			);
			if (glowIsMultiColor) {
				glowCtx.shadowColor = 'transparent';
				glowCtx.shadowBlur = 0;
				glowCtx.globalCompositeOperation = 'source-in';
				glowCtx.fillStyle = createLyricsHorizontalPaint(
					glowCtx,
					style.glowSlot,
					0,
					measuredWidth,
					rotationPhase
				);
				glowCtx.fillRect(
					-paddingX,
					-logicalHeight / 2,
					logicalWidth,
					logicalHeight
				);
				glowCtx.globalCompositeOperation = 'source-over';
			}
		} else {
			glowCanvas = null;
		}
	}

	const textCanvas = acquireCanvas(
		reuse?.textCanvas,
		logicalWidth * renderScale,
		logicalHeight * renderScale
	);
	const textCtx = setupCtx(textCanvas);
	if (!textCanvas || !textCtx) return null;
	// The tight inner shadow is a single color by nature; with a multicolor
	// halo already painted it would only re-tint the gradient.
	textCtx.shadowColor = glowIsMultiColor ? 'transparent' : style.glowColor;
	textCtx.shadowBlur = glowIsMultiColor ? 0 : style.glowBlurBase * 0.35;
	const stroke = applyTextTreatment(textCtx, style.treatment, {
		top: -mAscent,
		height: Math.max(1, mAscent * 1.2),
		baseColor: style.color,
		secondaryColor: style.secondaryColor,
		userStrokeColor: style.strokeColor,
		userStrokeWidth: style.strokeWidth
	});
	if (textIsMultiColor || style.fillIsExplicit) {
		// A color chosen for THIS layer outranks the treatment's own fill —
		// `glass` and `metallic` hardcode a white ramp and `neon` a white fill,
		// so otherwise picking solid black on a layer still drew white text.
		textCtx.fillStyle = createLyricsHorizontalPaint(
			textCtx,
			style.fillSlot,
			0,
			measuredWidth,
			rotationPhase
		);
	}
	// strokeStyle accepts a CanvasGradient directly, so a gradient/rainbow
	// border needs no extra pass — only a paint the shared treatment type
	// (string-only, and used by other overlays) cannot carry.
	const strokePaint =
		stroke && strokeIsMultiColor
			? {
					color: createLyricsHorizontalPaint(
						textCtx,
						style.strokeSlot,
						0,
						measuredWidth,
						rotationPhase
					),
					width: stroke.width
				}
			: stroke;
	drawSpacedGlyphs(
		textCtx,
		glyphs,
		glyphWidths,
		0,
		0,
		style.letterSpacing,
		strokePaint
	);

	return {
		glowCanvas,
		textCanvas,
		rotationStep: style.rotationStep,
		measuredWidth,
		paddingX,
		logicalWidth,
		logicalHeight,
		haloAlphaBase: Math.min(1, 0.34 + (reach - 1) * 0.14)
	};
}

function ensureLineRenderEntry(
	style: LyricLineStyle
): LyricLineRenderEntry | null {
	const key = buildLineRenderKey(style, getTextRenderScale());
	const cached = lineRenderCache.get(key);
	if (cached) {
		// Refresh LRU recency.
		lineRenderCache.delete(key);
		lineRenderCache.set(key, cached);
		if (cached.rotationStep === style.rotationStep) return cached;
		// A rotating line: re-bake into the SAME canvases at the new step. The
		// step is deliberately not part of the cache key — keying it would keep
		// one multi-megabyte entry per step alive.
		const rebaked = renderLineToCache(style, cached);
		if (!rebaked) return cached;
		lineRenderCache.set(key, rebaked);
		return rebaked;
	}
	const entry = renderLineToCache(style);
	if (!entry) return null;
	lineRenderCache.set(key, entry);
	if (lineRenderCache.size > LINE_RENDER_CACHE_MAX) {
		const oldest = lineRenderCache.keys().next().value;
		if (oldest !== undefined) lineRenderCache.delete(oldest);
	}
	return entry;
}

function blitCachedLine(
	ctx: CanvasRenderingContext2D,
	entry: LyricLineRenderEntry,
	centerX: number,
	baselineY: number,
	alpha: number,
	glowMultiplier: number,
	scale: number,
	offsetX: number,
	offsetY: number,
	extraBlur: number
) {
	ctx.save();
	ctx.translate(centerX + offsetX, baselineY + offsetY);
	ctx.scale(scale, scale);
	ctx.filter = extraBlur > 0 ? `blur(${extraBlur}px)` : 'none';
	const dx = -(entry.paddingX + entry.measuredWidth / 2);
	const dy = -entry.logicalHeight / 2;
	if (entry.glowCanvas) {
		// Multipliers above 1 draw the halo a second time — an approximate
		// additive brightening that keeps the pulse visible past alpha 1.
		const halo = entry.haloAlphaBase * Math.max(0, glowMultiplier);
		const first = Math.min(1, halo);
		if (first > 0.003) {
			ctx.globalAlpha = alpha * first;
			ctx.drawImage(
				entry.glowCanvas,
				dx,
				dy,
				entry.logicalWidth,
				entry.logicalHeight
			);
		}
		const extraHalo = Math.min(1, halo - 1);
		if (extraHalo > 0.003) {
			ctx.globalAlpha = alpha * extraHalo;
			ctx.drawImage(
				entry.glowCanvas,
				dx,
				dy,
				entry.logicalWidth,
				entry.logicalHeight
			);
		}
	}
	ctx.globalAlpha = alpha;
	ctx.drawImage(
		entry.textCanvas,
		dx,
		dy,
		entry.logicalWidth,
		entry.logicalHeight
	);
	ctx.restore();
}

function resolveTransitionPreset(
	preset: LyricsTextTransition,
	progress: number,
	direction: 'in' | 'out',
	fontSize: number
): {
	alpha: number;
	scale: number;
	offsetX: number;
	offsetY: number;
	blur: number;
} {
	if (preset === 'none') {
		return { alpha: 1, scale: 1, offsetX: 0, offsetY: 0, blur: 0 };
	}
	const p = clamp(progress, 0, 1);
	const eased = 1 - Math.pow(1 - p, 3);
	const entering = direction === 'in';
	const amount = entering ? 1 - eased : eased;
	switch (preset) {
		case 'slide-up':
			return {
				alpha: entering ? eased : 1 - eased,
				scale: 1,
				offsetX: 0,
				offsetY: amount * fontSize * (entering ? 0.9 : -0.7),
				blur: 0
			};
		case 'slide-down':
			return {
				alpha: entering ? eased : 1 - eased,
				scale: 1,
				offsetX: 0,
				offsetY: amount * fontSize * (entering ? -0.9 : 0.7),
				blur: 0
			};
		case 'scale':
			return {
				alpha: entering ? eased : 1 - eased,
				scale: entering ? 0.86 + eased * 0.14 : 1 - eased * 0.12,
				offsetX: 0,
				offsetY: 0,
				blur: 0
			};
		case 'pop':
			return {
				alpha: entering ? eased : 1 - eased,
				scale: entering
					? 0.72 + eased * 0.28 + Math.sin(p * Math.PI) * 0.08
					: 1 + eased * 0.14,
				offsetX: 0,
				offsetY: 0,
				blur: 0
			};
		case 'blur':
			return {
				alpha: entering ? eased : 1 - eased,
				scale: 1,
				offsetX: 0,
				offsetY: 0,
				blur: amount * fontSize * 0.2
			};
		case 'fade':
		default:
			return {
				alpha: entering ? eased : 1 - eased,
				scale: 1,
				offsetX: 0,
				offsetY: 0,
				blur: 0
			};
	}
}

function resolveActiveAnimation(
	preset: LyricsActiveAnimation,
	timeSec: number,
	lineIndex: number,
	fontSize: number
): {
	alpha: number;
	scale: number;
	offsetX: number;
	offsetY: number;
	glowMultiplier: number;
} {
	const phase = timeSec * Math.PI * 2 + lineIndex * 0.55;
	switch (preset) {
		case 'pulse': {
			const pulse = (Math.sin(phase * 0.82) + 1) / 2;
			return {
				alpha: 1,
				scale: 1 + pulse * 0.045,
				offsetX: 0,
				offsetY: 0,
				glowMultiplier: 1 + pulse * 0.25
			};
		}
		case 'glow-pulse': {
			const pulse = (Math.sin(phase * 0.95) + 1) / 2;
			return {
				alpha: 1,
				scale: 1,
				offsetX: 0,
				offsetY: 0,
				glowMultiplier: 1.15 + pulse * 0.85
			};
		}
		case 'breathing': {
			const pulse = (Math.sin(phase * 0.42) + 1) / 2;
			return {
				alpha: 0.92 + pulse * 0.08,
				scale: 0.985 + pulse * 0.035,
				offsetX: 0,
				offsetY: 0,
				glowMultiplier: 1 + pulse * 0.18
			};
		}
		case 'shake-light':
			return {
				alpha: 1,
				scale: 1,
				offsetX: Math.sin(phase * 5.7) * fontSize * 0.025,
				offsetY: Math.cos(phase * 4.9) * fontSize * 0.015,
				glowMultiplier: 1.15
			};
		case 'wave':
			return {
				alpha: 1,
				scale: 1,
				offsetX: 0,
				offsetY: Math.sin(phase * 1.6) * fontSize * 0.08,
				glowMultiplier: 1.2
			};
		case 'flicker': {
			const flicker =
				Math.sin(phase * 5.1) > 0.82 || Math.sin(phase * 8.3) < -0.92;
			return {
				alpha: flicker ? 0.68 : 1,
				scale: 1,
				offsetX: flicker ? fontSize * 0.025 : 0,
				offsetY: 0,
				glowMultiplier: flicker ? 1.65 : 1.1
			};
		}
		case 'none':
		default:
			return {
				alpha: 1,
				scale: 1,
				offsetX: 0,
				offsetY: 0,
				glowMultiplier: 1
			};
	}
}

/**
 * Base point a bundle layer's `positionPreset` anchors to, or `null` when the
 * layer carries no preset (then the tab's own layout anchor is used).
 *
 * The preset is only the BASE: the caller still adds the tab's global
 * Position X/Y offset on top. Returning the preset as an absolute anchor is
 * what used to make both sliders look dead for every preset-carrying layer.
 */
function resolveAnchorFromLyrixaPreset(
	preset: LyrixaClipPositionPreset | undefined,
	canvas: HTMLCanvasElement
): { x: number; y: number } | null {
	const marginX = canvas.width * 0.08;
	const marginY = canvas.height * 0.12;
	switch (preset) {
		case 'top':
			return { x: canvas.width / 2, y: marginY };
		case 'bottom':
			return { x: canvas.width / 2, y: canvas.height - marginY };
		case 'top-left':
			return { x: marginX, y: marginY };
		case 'top-right':
			return { x: canvas.width - marginX, y: marginY };
		case 'bottom-left':
			return { x: marginX, y: canvas.height - marginY };
		case 'bottom-right':
			return { x: canvas.width - marginX, y: canvas.height - marginY };
		case 'center':
			return { x: canvas.width / 2, y: canvas.height / 2 };
		default:
			return null;
	}
}

/** Per-line animation state the backdrop has to follow. */
export type LyricsAnimationSample = {
	alpha: number;
	scale: number;
	offsetX: number;
	offsetY: number;
};

/**
 * How the backdrop box should be transformed to track the text.
 *
 * It used to be painted before the animation was even resolved, at a fixed
 * alpha: the text faded or slid while the box sat still, and the box then
 * vanished the instant the clip ended. It now follows whichever line is most
 * visible — `follow: false` restores the old rigid panel on purpose.
 *
 * `layerScale` / `layerOpacity` are divided back out because the box geometry
 * already includes them.
 */
export function resolveBackdropAnimation(
	lines: LyricsAnimationSample[],
	options: { follow: boolean; layerScale: number; layerOpacity: number }
): { alphaScale: number; scale: number; offsetX: number; offsetY: number } {
	const still = { alphaScale: 1, scale: 1, offsetX: 0, offsetY: 0 };
	if (!options.follow || lines.length === 0) return still;
	const lead = lines.reduce((best, candidate) =>
		candidate.alpha > best.alpha ? candidate : best
	);
	return {
		alphaScale: clamp(
			lead.alpha / Math.max(options.layerOpacity, 0.001),
			0,
			1
		),
		scale: lead.scale / Math.max(options.layerScale, 0.001),
		offsetX: lead.offsetX,
		offsetY: lead.offsetY
	};
}

export function drawLyricsOverlay(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	state: WallpaperState,
	activeTrackAssetId: string | null,
	currentTimeSec: number,
	durationSec: number,
	palettes?: LyricsPalettes
) {
	if (!state.audioLyricsEnabled || !activeTrackAssetId) return;
	const entry = state.audioLyricsByTrackAssetId[activeTrackAssetId];
	const adjustedTime = Math.max(
		0,
		currentTimeSec + state.audioLyricsTimeOffsetMs / 1000
	);
	const lyrixaRenderMode = entry?.lyrixaRenderMode ?? 'editor';
	const layerOverrides = resolveLayerOverrides(
		entry?.lyrixaBundle ?? null,
		entry?.lyrixaLayerOverrides,
		state.audioLyricsShowTranslation !== false
	);

	if (
		entry?.lyrixaBundle &&
		lyrixaRenderMode === 'bundle' &&
		hasRenderableLyrixaBundle(entry.lyrixaBundle)
	) {
		drawLyrixaLyricsBundle(ctx, canvas, entry.lyrixaBundle, adjustedTime, {
			layerOverrides,
			palettes
		});
		return;
	}

	type SourceLine = {
		text: string;
		isActive: boolean;
		startTime: number;
		endTime: number;
		layerId?: string;
		layer?: LyrixaLyricLayer;
		/** Per-clip free position from the bundle, normalised 0..1. */
		coords?: LyrixaLyricCoordinates;
		/** Per-clip preset; overrides the layer's own preset. */
		clipPosition?: LyrixaClipPositionPreset;
	};
	const sourceLines: SourceLine[] = [];
	const visibleLyricLines = Math.max(
		1,
		Math.round(state.audioLyricsVisibleLineCount)
	);

	if (entry?.lyrixaBundle && lyrixaRenderMode === 'editor') {
		// Read clip endTimes straight from the bundle. Going through LRC
		// would have collapsed each clip's endTime to the next clip's
		// startTime, which is exactly what hid the silences before.
		const bundleLines: SourceLine[] = [];
		const visibleLayers = new Map(
			entry.lyrixaBundle.project.layers
				.filter(
					layer =>
						(layer.visible !== false ||
							layerOverrides[layer.id]?.visible === true) &&
						layerOverrides[layer.id]?.visible !== false
				)
				.sort((a, b) => a.order - b.order)
				.map(layer => [layer.id, layer])
		);
		for (const clip of entry.lyrixaBundle.project.clips
			.filter(clip => {
				const layer = visibleLayers.get(clip.layerId);
				return (
					layer &&
					!clip.muted &&
					adjustedTime >= clip.startTime &&
					adjustedTime <= clip.endTime &&
					(!layer.renderSettings?.suppressClipText ||
						clip.forceTextRender)
				);
			})
			.sort((a, b) => {
				const layerA = visibleLayers.get(a.layerId)?.order ?? 0;
				const layerB = visibleLayers.get(b.layerId)?.order ?? 0;
				return layerA - layerB || a.startTime - b.startTime;
			})) {
			const layer = visibleLayers.get(clip.layerId);
			bundleLines.push({
				text: clip.text,
				isActive: true,
				startTime: clip.startTime,
				endTime: clip.endTime,
				layerId: clip.layerId,
				layer,
				coords: resolveClipCoords(clip),
				clipPosition: clip.position
			});
		}
		// "Visible lines" also applies to bundles: when a layer has several
		// clips alive at once, keep only the N most recent ones (per layer, so
		// one busy layer can't push the others off screen).
		const keptPerLayer = new Map<string, number>();
		for (let i = bundleLines.length - 1; i >= 0; i -= 1) {
			const line = bundleLines[i]!;
			const key = line.layerId ?? '__default__';
			const kept = keptPerLayer.get(key) ?? 0;
			if (kept >= visibleLyricLines) continue;
			keptPerLayer.set(key, kept + 1);
			sourceLines.unshift(line);
		}
		if (sourceLines.length === 0) return;
	} else if (entry?.rawText.trim()) {
		const lyrics = getCachedLyricsDocument(entry, durationSec);
		if (lyrics.lines.length === 0) return;
		const activeIndex = findActiveLyricsLineIndex(
			lyrics.lines,
			adjustedTime,
			lyrics.hasTimestamps
		);
		if (activeIndex < 0) return;
		const radius = Math.max(0, Math.round((visibleLyricLines - 1) / 2));
		const startIndex = Math.max(0, activeIndex - radius);
		const endIndex = Math.min(
			lyrics.lines.length - 1,
			activeIndex + radius
		);
		for (let i = startIndex; i <= endIndex; i += 1) {
			const lyricLine = lyrics.lines[i]!;
			sourceLines.push({
				text: lyricLine.text,
				isActive: i === activeIndex,
				startTime: lyricLine.startTime,
				endTime: lyricLine.endTime
			});
		}
	} else {
		return;
	}

	const maxWidth = canvas.width * state.audioLyricsWidth;
	const layoutCenterX =
		state.audioLyricsLayoutMode === 'left-dock'
			? maxWidth / 2 + 36
			: state.audioLyricsLayoutMode === 'right-dock'
				? canvas.width - maxWidth / 2 - 36
				: canvas.width / 2;
	// Global Position X/Y are kept as deltas so they can be added on top of a
	// bundle layer's own position preset (see resolveAnchorFromLyrixaPreset).
	const globalOffsetX =
		state.audioLyricsLayoutMode === 'free'
			? state.audioLyricsPositionX * canvas.width * 0.5
			: 0;
	const globalOffsetY = -state.audioLyricsPositionY * canvas.height * 0.5;
	const centerX = layoutCenterX + globalOffsetX;
	const anchorY = canvas.height / 2 + globalOffsetY;
	const lineHeightPx =
		state.audioLyricsFontSize * state.audioLyricsLineHeight;
	const letterSpacing = state.audioLyricsLetterSpacing;

	const font = getFont(state);
	ctx.save();
	ctx.font = font;
	ctx.textBaseline = 'middle';
	ctx.filter = 'none';

	const physicalLines: Array<{
		text: string;
		alpha: number;
		color: string;
		secondaryColor: string;
		isActive: boolean;
		startTime: number;
		endTime: number;
		layerId: string;
		layer?: LyrixaLyricLayer;
		coords?: LyrixaLyricCoordinates;
		clipPosition?: LyrixaClipPositionPreset;
	}> = [];

	const layerOverridesForWrap = entry?.lyrixaLayerOverrides ?? {};
	for (const source of sourceLines) {
		const sourceText = state.audioLyricsUppercase
			? source.text.toUpperCase()
			: source.text;
		// The line is blitted at the layer's scale, so a scaled layer must wrap
		// against a proportionally SMALLER budget — otherwise every line is
		// laid out for the full width and then blown past the screen edge.
		const wrapScale = clamp(
			source.layerId
				? (layerOverridesForWrap[source.layerId]?.scale ?? 1)
				: 1,
			0.2,
			4
		);
		const wrapped = wrapTextCached(
			ctx,
			sourceText,
			maxWidth / wrapScale,
			letterSpacing,
			font
		);
		for (const segment of wrapped) {
			physicalLines.push({
				text: segment,
				alpha: source.isActive
					? state.audioLyricsOpacity
					: state.audioLyricsOpacity *
						state.audioLyricsInactiveOpacity,
				color: source.isActive
					? state.audioLyricsActiveColor
					: state.audioLyricsInactiveColor,
				secondaryColor: state.audioLyricsInactiveColor,
				isActive: source.isActive,
				startTime: source.startTime,
				endTime: source.endTime,
				layerId: source.layerId ?? '__default__',
				layer: source.layer,
				coords: source.coords,
				clipPosition: source.clipPosition
			});
		}
	}

	if (physicalLines.length === 0) {
		ctx.restore();
		return;
	}

	// Split each layer's lines by anchor: a clip carrying its own coords or
	// position preset renders at ITS anchor (mirroring the bundle
	// renderer's resolveLineAnchor), not the layer's shared one. Lines that
	// resolve to the same anchor keep stacking against it.
	const groupedLines = new Map<
		string,
		{ layerId: string; lines: typeof physicalLines }
	>();
	for (const line of physicalLines) {
		const anchorKey = line.coords
			? `@${line.coords.x.toFixed(4)},${line.coords.y.toFixed(4)}`
			: line.clipPosition && line.clipPosition !== 'center'
				? `#${line.clipPosition}`
				: '';
		const groupKey = `${line.layerId}|${anchorKey}`;
		const group = groupedLines.get(groupKey) ?? {
			layerId: line.layerId,
			lines: []
		};
		group.lines.push(line);
		groupedLines.set(groupKey, group);
	}

	groupedLines.forEach(group => {
		const lines = group.lines;
		const layerId = group.layerId;
		const layer = lines[0]?.layer;
		const layerOverride =
			layerId !== '__default__'
				? (entry?.lyrixaLayerOverrides ?? {})[layerId]
				: undefined;
		const layerScale = clamp(layerOverride?.scale ?? 1, 0.2, 4);
		const groupLineHeightPx = lineHeightPx * layerScale;
		const first = lines[0];
		const baseAnchor = first?.coords
			? {
					x: first.coords.x * canvas.width,
					y: first.coords.y * canvas.height
				}
			: (resolveAnchorFromLyrixaPreset(
					first?.clipPosition && first.clipPosition !== 'center'
						? first.clipPosition
						: layer?.renderSettings?.positionPreset,
					canvas
				) ?? null);
		const layerAnchor = baseAnchor
			? {
					x: baseAnchor.x + globalOffsetX,
					y: baseAnchor.y + globalOffsetY
				}
			: { x: centerX, y: anchorY };
		// positionOffset maps to a full screen dimension so any layer can be
		// dragged edge-to-edge regardless of its bundle position preset.
		const groupCenterX =
			layerAnchor.x +
			clamp(layerOverride?.positionOffsetX ?? 0, -2, 2) * canvas.width;
		const groupAnchorY =
			layerAnchor.y -
			clamp(layerOverride?.positionOffsetY ?? 0, -2, 2) * canvas.height;
		const totalHeight = lines.length * groupLineHeightPx;
		const unclampedTopY =
			groupAnchorY - totalHeight / 2 + groupLineHeightPx / 2;
		const topY = clamp(
			unclampedTopY,
			groupLineHeightPx / 2,
			Math.max(
				groupLineHeightPx / 2,
				canvas.height - totalHeight + groupLineHeightPx / 2
			)
		);
		const glowIntensityScale =
			layerOverride?.glowIntensity !== undefined
				? clamp(layerOverride.glowIntensity, 0, 4)
				: 1;
		// On low performance mode, cap the halo reach — the blur cost is baked
		// once per cache entry, but smaller halos also shrink the cached
		// canvases and each per-frame blit.
		const glowReach =
			state.performanceMode === 'low'
				? Math.min(state.audioLyricsGlowReach, 1.5)
				: state.audioLyricsGlowReach;
		// A layer that explicitly configures its glow must be able to show one
		// even when the global Glow Blur slider sits at 0 — otherwise the
		// per-layer Glow Color control multiplies by zero and looks broken.
		const layerConfiguresGlow =
			layerOverride?.glowColorMode !== undefined ||
			layerOverride?.glowColorSource !== undefined ||
			layerOverride?.glowColor !== undefined;
		const baseGlowBlur =
			state.audioLyricsGlowBlur > 0.01
				? state.audioLyricsGlowBlur
				: layerConfiguresGlow
					? LAYER_GLOW_FALLBACK_BLUR
					: 0;
		const { fillSlot, strokeSlot, glowSlot, backdropSlot } =
			resolveLyricStyleSlots(
				state,
				layerOverride,
				// The resolver documents this as THE ACTIVE line's color; using
				// lines[0] silently swapped in the previous (inactive) line's
				// dimmed color whenever a group started on a preview line, so
				// the picked Active color never reached the cache.
				lines.find(line => line.isActive)?.color ?? lines[0]?.color,
				palettes
			);
		const strokeWidth = Math.max(
			0,
			layerOverride?.strokeWidth ?? state.audioLyricsStrokeWidth
		);
		// One step for the whole line: fill, border and glow share the cached
		// canvases, so they re-bake together.
		const rotationStep =
			resolveLyricsRotationStep(fillSlot) ??
			resolveLyricsRotationStep(strokeSlot) ??
			resolveLyricsRotationStep(glowSlot);
		const renderedLines = lines.map(line => ({
			line,
			entry: ensureLineRenderEntry({
				text: line.text,
				font,
				fontSize: state.audioLyricsFontSize,
				letterSpacing,
				// An inactive line keeps its own dimmed color unless the layer
				// pins one; the slot only overrides when it was configured.
				color:
					layerOverride?.textColor ??
					(line.isActive ? fillSlot.primary : line.color),
				// The active line's gradient stop comes from its own slot
				// (panel's Secondary Color), not the global inactive color;
				// inactive lines keep their dimmed solid paint.
				secondaryColor: line.isActive
					? fillSlot.secondary
					: line.secondaryColor,
				glowColor: glowSlot.primary,
				fillSlot: line.isActive
					? fillSlot
					: { ...fillSlot, primary: line.color },
				strokeSlot,
				glowSlot,
				fillIsExplicit:
					line.isActive &&
					(layerOverride?.textColor !== undefined ||
						layerOverride?.textColorMode !== undefined ||
						layerOverride?.textColorSource !== undefined ||
						fillSlot.mode !== 'solid'),
				glowBlurBase:
					(line.isActive ? baseGlowBlur : baseGlowBlur * 0.42) *
					glowIntensityScale,
				glowReach,
				treatment: state.audioLyricsTextTreatment,
				strokeColor: strokeSlot.primary,
				strokeWidth,
				rotationStep
			})
		}));
		const maxMeasuredWidth = renderedLines.reduce(
			(max, item) => Math.max(max, item.entry?.measuredWidth ?? 0),
			0
		);

		// The animation envelope is resolved BEFORE anything is drawn: the
		// backdrop needs it too, and it used to be painted first with a fixed
		// alpha — so the text faded or slid while the box sat still, then
		// vanished the instant the clip ended.
		const animatedLines = renderedLines.map(({ line, entry }, index) => {
			const durationMs = Math.max(
				60,
				state.audioLyricsAnimationDurationMs
			);
			const enterProgress =
				((adjustedTime - line.startTime) * 1000) / durationMs;
			const exitProgress =
				1 - ((line.endTime - adjustedTime) * 1000) / durationMs;
			const inFx = line.isActive
				? resolveTransitionPreset(
						state.audioLyricsTransitionIn,
						enterProgress,
						'in',
						state.audioLyricsFontSize
					)
				: { alpha: 1, scale: 1, offsetX: 0, offsetY: 0, blur: 0 };
			const outFx = line.isActive
				? resolveTransitionPreset(
						state.audioLyricsTransitionOut,
						exitProgress,
						'out',
						state.audioLyricsFontSize
					)
				: { alpha: 1, scale: 1, offsetX: 0, offsetY: 0, blur: 0 };
			const activeFx = line.isActive
				? resolveActiveAnimation(
						state.audioLyricsActiveAnimation,
						adjustedTime,
						index,
						state.audioLyricsFontSize
					)
				: {
						alpha: 1,
						scale: 1,
						offsetX: 0,
						offsetY: 0,
						glowMultiplier: 1
					};
			return {
				line,
				entry,
				index,
				alpha: clamp(
					line.alpha *
						Math.min(inFx.alpha, outFx.alpha) *
						activeFx.alpha *
						clamp(layerOverride?.opacity ?? 1, 0, 1),
					0,
					1
				),
				glowMultiplier: activeFx.glowMultiplier,
				scale: inFx.scale * outFx.scale * activeFx.scale * layerScale,
				offsetX: inFx.offsetX + outFx.offsetX + activeFx.offsetX,
				offsetY: inFx.offsetY + outFx.offsetY + activeFx.offsetY,
				blur: Math.max(
					inFx.blur,
					outFx.blur,
					layerOverride?.blurAmount ?? 0
				)
			};
		});

		if (state.audioLyricsBackdropEnabled) {
			const follow = resolveBackdropAnimation(animatedLines, {
				follow: state.audioLyricsBackdropFollowAnimation,
				layerScale,
				layerOpacity: clamp(layerOverride?.opacity ?? 1, 0, 1)
			});
			const pad = state.audioLyricsBackdropPadding;
			const boxWidth =
				(maxMeasuredWidth * layerScale + pad * 2) * follow.scale;
			const boxHeight = (totalHeight + pad * 2) * follow.scale;
			const boxX = groupCenterX - boxWidth / 2 + follow.offsetX;
			const boxY =
				topY -
				groupLineHeightPx / 2 -
				pad * follow.scale +
				follow.offsetY;
			const radiusPx = clamp(
				state.audioLyricsBackdropRadius,
				0,
				Math.min(boxWidth, boxHeight) / 2
			);

			ctx.save();
			ctx.globalAlpha =
				state.audioLyricsBackdropOpacity *
				clamp(layerOverride?.opacity ?? 1, 0, 1) *
				follow.alphaScale;
			ctx.fillStyle = createLyricsHorizontalPaint(
				ctx,
				backdropSlot,
				boxX,
				boxX + boxWidth,
				rotationStepToPhase(resolveLyricsRotationStep(backdropSlot))
			);
			ctx.beginPath();
			ctx.moveTo(boxX + radiusPx, boxY);
			ctx.arcTo(
				boxX + boxWidth,
				boxY,
				boxX + boxWidth,
				boxY + boxHeight,
				radiusPx
			);
			ctx.arcTo(
				boxX + boxWidth,
				boxY + boxHeight,
				boxX,
				boxY + boxHeight,
				radiusPx
			);
			ctx.arcTo(boxX, boxY + boxHeight, boxX, boxY, radiusPx);
			ctx.arcTo(boxX, boxY, boxX + boxWidth, boxY, radiusPx);
			ctx.closePath();
			ctx.fill();
			ctx.restore();
		}

		animatedLines.forEach(fx => {
			if (!fx.entry) return;
			blitCachedLine(
				ctx,
				fx.entry,
				groupCenterX,
				topY + fx.index * groupLineHeightPx,
				fx.alpha,
				fx.glowMultiplier,
				fx.scale,
				fx.offsetX,
				fx.offsetY,
				fx.blur
			);
		});
	});

	ctx.restore();
}
