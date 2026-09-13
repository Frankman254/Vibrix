import { getRenderNowMs } from '@/lib/visual/renderClock';
import {
	completeRotatePalette,
	samplePaletteColor
} from '@/lib/backgroundPalette';
import type { SpectrumLinearOrientation } from '@/types/wallpaper';
import type { SpectrumSettings } from '../runtime/spectrumRuntime';

export function hexToRgb(hex: string): [number, number, number] {
	const clean = hex.replace('#', '');
	return [
		parseInt(clean.slice(0, 2), 16),
		parseInt(clean.slice(2, 4), 16),
		parseInt(clean.slice(4, 6), 16)
	];
}

export function mixHexColors(a: string, b: string, t: number): string {
	const [r1, g1, b1] = hexToRgb(a);
	const [r2, g2, b2] = hexToRgb(b);
	return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(
		g1 + (g2 - g1) * t
	)}, ${Math.round(b1 + (b2 - b1) * t)})`;
}

export function sampleWrappedPaletteColor(colors: string[], t: number): string {
	const palette =
		colors.length > 0
			? colors
			: [
					'#ff004c',
					'#ff7a00',
					'#ffe600',
					'#2cff95',
					'#00d4ff',
					'#5566ff'
				];
	if (palette.length === 1) return palette[0];
	const wrapped = ((t % 1) + 1) % 1;
	const scaled = wrapped * palette.length;
	const lowerIndex = Math.floor(scaled) % palette.length;
	const upperIndex = (lowerIndex + 1) % palette.length;
	const alpha = scaled - Math.floor(scaled);
	return mixHexColors(palette[lowerIndex], palette[upperIndex], alpha);
}

/**
 * Palette a rotating mode sweeps. `complete-rotate` is `visible-rotate` plus the
 * achromatic extremes, so the cycle also passes through black and white.
 */
export function resolveRotatePalette(
	settings: Pick<SpectrumSettings, 'spectrumColorMode'> & {
		spectrumRainbowColors?: string[];
	}
): string[] {
	const palette = settings.spectrumRainbowColors ?? [];
	if (settings.spectrumColorMode !== 'complete-rotate') return palette;
	// Cache keyed on the source-array identity: `getColor` runs per bar per pass,
	// and store arrays are replaced, never mutated in place.
	if (completeRotateSource !== palette) {
		completeRotateSource = palette;
		completeRotateResult = completeRotatePalette(palette);
	}
	return completeRotateResult;
}

let completeRotateSource: string[] | null = null;
let completeRotateResult: string[] = [];

export function visibleSpectrumColor(t: number): string {
	const wrapped = ((t % 1) + 1) % 1;
	const h = wrapped * 360;
	return `hsl(${h} 100% 58%)`;
}

export function getRotateRgbPhase(): number {
	return (getRenderNowMs() / 4800) % 1;
}

export function normalizeSpectrumPhase(value: number): number {
	return ((value % 1) + 1) % 1;
}

export function getLoopGradientColor(
	primaryColor: string,
	secondaryColor: string,
	t: number
): string {
	const wrapped = ((t % 1) + 1) % 1;
	const mirroredT = wrapped <= 0.5 ? wrapped * 2 : 1 - (wrapped - 0.5) * 2;
	const [r1, g1, b1] = hexToRgb(primaryColor);
	const [r2, g2, b2] = hexToRgb(secondaryColor);
	return `rgb(${Math.round(r1 + (r2 - r1) * mirroredT)}, ${Math.round(g1 + (g2 - g1) * mirroredT)}, ${Math.round(b1 + (b2 - b1) * mirroredT)})`;
}

/**
 * The only fields `getColor` reads — a view type so the glow builds a colour view
 * without cloning `SpectrumSettings` per bar. Every existing caller passes a full
 * `SpectrumSettings`, which still satisfies this.
 */
export type SpectrumColorInput = Pick<
	SpectrumSettings,
	| 'spectrumMode'
	| 'spectrumColorMode'
	| 'spectrumPrimaryColor'
	| 'spectrumSecondaryColor'
> & { spectrumRainbowColors?: string[] };

export function getColor(settings: SpectrumColorInput, t: number): string {
	const { spectrumColorMode, spectrumPrimaryColor, spectrumSecondaryColor } =
		settings;
	const phase = normalizeSpectrumPhase(t);
	if (spectrumColorMode === 'solid') return spectrumPrimaryColor;
	if (
		spectrumColorMode === 'visible-rotate' ||
		spectrumColorMode === 'complete-rotate'
	) {
		const palette = resolveRotatePalette(settings);
		return palette.length > 0
			? sampleWrappedPaletteColor(palette, phase + getRotateRgbPhase())
			: visibleSpectrumColor(phase + getRotateRgbPhase());
	}
	if (spectrumColorMode === 'rainbow') {
		return settings.spectrumMode === 'radial'
			? sampleWrappedPaletteColor(
					settings.spectrumRainbowColors ?? [],
					phase
				)
			: samplePaletteColor(settings.spectrumRainbowColors ?? [], phase);
	}
	if (settings.spectrumMode === 'radial') {
		return getLoopGradientColor(
			spectrumPrimaryColor,
			spectrumSecondaryColor,
			phase
		);
	}
	const [r1, g1, b1] = hexToRgb(spectrumPrimaryColor);
	const [r2, g2, b2] = hexToRgb(spectrumSecondaryColor);
	return `rgb(${Math.round(r1 + (r2 - r1) * phase)}, ${Math.round(g1 + (g2 - g1) * phase)}, ${Math.round(b1 + (b2 - b1) * phase)})`;
}

export function addGradientStops(
	gradient: CanvasGradient,
	settings: SpectrumSettings,
	phaseOffset = 0
): void {
	if (phaseOffset !== 0) {
		const phase = normalizeSpectrumPhase(phaseOffset);
		const steps = 8;
		for (let index = 0; index <= steps; index += 1) {
			const stop = index / steps;
			gradient.addColorStop(
				stop,
				getColor(settings, normalizeSpectrumPhase(stop + phase))
			);
		}
		return;
	}
	if (settings.spectrumColorMode === 'solid') {
		gradient.addColorStop(0, settings.spectrumPrimaryColor);
		gradient.addColorStop(1, settings.spectrumPrimaryColor);
		return;
	}

	if (settings.spectrumColorMode === 'gradient') {
		gradient.addColorStop(0, settings.spectrumPrimaryColor);
		gradient.addColorStop(1, settings.spectrumSecondaryColor);
		return;
	}
	if (
		settings.spectrumColorMode === 'visible-rotate' ||
		settings.spectrumColorMode === 'complete-rotate'
	) {
		const rotatePhase = getRotateRgbPhase();
		const palette = resolveRotatePalette(settings);
		// Rotation offsets every stop by the same phase, so a stop grid as coarse
		// as the palette almost never lands ON a palette entry — `complete-rotate`'s
		// black/white members would average into grey. Oversampling keeps them.
		const steps =
			settings.spectrumColorMode === 'complete-rotate'
				? Math.max(6, palette.length * 4)
				: 6;
		for (let index = 0; index <= steps; index += 1) {
			const stop = index / steps;
			gradient.addColorStop(
				stop,
				palette.length > 0
					? sampleWrappedPaletteColor(palette, stop + rotatePhase)
					: visibleSpectrumColor(stop + rotatePhase)
			);
		}
		return;
	}

	const rainbowColors =
		settings.spectrumRainbowColors &&
		settings.spectrumRainbowColors.length > 0
			? settings.spectrumRainbowColors
			: [
					'#ff004c',
					'#ff7a00',
					'#ffe600',
					'#2cff95',
					'#00d4ff',
					'#5566ff'
				];
	const rainbowStops = rainbowColors.map(
		(color, index) =>
			[
				rainbowColors.length === 1
					? 1
					: index / Math.max(rainbowColors.length - 1, 1),
				color
			] as const
	);
	for (const [stop, color] of rainbowStops) {
		gradient.addColorStop(stop, color);
	}
}

export function addRadialLoopGradientStops(
	gradient: CanvasGradient,
	settings: SpectrumSettings,
	phaseOffset = 0
): void {
	if (phaseOffset !== 0) {
		const phase = normalizeSpectrumPhase(phaseOffset);
		const steps = 8;
		for (let index = 0; index <= steps; index += 1) {
			const stop = index / steps;
			gradient.addColorStop(
				stop,
				getColor(settings, normalizeSpectrumPhase(stop + phase))
			);
		}
		return;
	}
	if (settings.spectrumColorMode === 'solid') {
		gradient.addColorStop(0, settings.spectrumPrimaryColor);
		gradient.addColorStop(1, settings.spectrumPrimaryColor);
		return;
	}

	if (settings.spectrumColorMode === 'gradient') {
		gradient.addColorStop(0, settings.spectrumPrimaryColor);
		gradient.addColorStop(0.5, settings.spectrumSecondaryColor);
		gradient.addColorStop(1, settings.spectrumPrimaryColor);
		return;
	}
	if (
		settings.spectrumColorMode === 'visible-rotate' ||
		settings.spectrumColorMode === 'complete-rotate'
	) {
		const rotatePhase = getRotateRgbPhase();
		const palette = resolveRotatePalette(settings);
		// Rotation offsets every stop by the same phase, so a stop grid as coarse
		// as the palette almost never lands ON a palette entry — `complete-rotate`'s
		// black/white members would average into grey. Oversampling keeps them.
		const steps =
			settings.spectrumColorMode === 'complete-rotate'
				? Math.max(6, palette.length * 4)
				: 6;
		for (let index = 0; index <= steps; index += 1) {
			const stop = index / steps;
			gradient.addColorStop(
				stop,
				palette.length > 0
					? sampleWrappedPaletteColor(palette, stop + rotatePhase)
					: visibleSpectrumColor(stop + rotatePhase)
			);
		}
		return;
	}

	const rainbowColors =
		settings.spectrumRainbowColors &&
		settings.spectrumRainbowColors.length > 0
			? settings.spectrumRainbowColors
			: [
					'#ff004c',
					'#ff7a00',
					'#ffe600',
					'#2cff95',
					'#00d4ff',
					'#5566ff'
				];
	for (let index = 0; index < rainbowColors.length; index += 1) {
		gradient.addColorStop(
			index / rainbowColors.length,
			rainbowColors[index]
		);
	}
	gradient.addColorStop(1, rainbowColors[0]);
}

export function createWaveGradient(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	settings: SpectrumSettings,
	orientation: SpectrumLinearOrientation | 'radial',
	cx = canvas.width / 2,
	cy = canvas.height / 2,
	radius = Math.max(canvas.width, canvas.height) * 0.5,
	angleOffset = 0,
	gradientPhaseOffset = 0
): CanvasGradient | string {
	if (settings.spectrumColorMode === 'solid')
		return settings.spectrumPrimaryColor;

	if (orientation === 'vertical') {
		const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
		addGradientStops(gradient, settings, gradientPhaseOffset);
		return gradient;
	}

	if (orientation === 'radial') {
		if (typeof ctx.createConicGradient === 'function') {
			const gradient = ctx.createConicGradient(
				angleOffset - Math.PI / 2 + gradientPhaseOffset * Math.PI * 2,
				cx,
				cy
			);
			addRadialLoopGradientStops(gradient, settings, 0);
			return gradient;
		}

		const gradient = ctx.createRadialGradient(
			cx,
			cy,
			Math.max(4, radius * 0.25),
			cx,
			cy,
			radius
		);
		addRadialLoopGradientStops(gradient, settings, gradientPhaseOffset);
		return gradient;
	}

	const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
	addGradientStops(gradient, settings, gradientPhaseOffset);
	return gradient;
}
