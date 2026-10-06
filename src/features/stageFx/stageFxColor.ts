import {
	completeRotatePalette,
	DEFAULT_RAINBOW_PALETTE,
	samplePaletteColor,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import type { StageFxColorMode, StageLightsColorSource } from './stageFxConfig';

export type StageFxColorSettings = {
	colorSource: StageLightsColorSource;
	colorMode: StageFxColorMode;
	primaryColor: string;
	secondaryColor: string;
	rainbowColors: string[];
};

export type StageFxColorPalettes = {
	background: BackgroundPalette;
	theme: BackgroundPalette;
};

export type ResolvedStageFxPalette = {
	primaryColor: string;
	secondaryColor: string;
	rainbowColors: string[];
};

function wrap01(value: number): number {
	return ((value % 1) + 1) % 1;
}

function pingPong01(value: number): number {
	const wrapped = wrap01(value);
	return wrapped <= 0.5 ? wrapped * 2 : (1 - wrapped) * 2;
}

export function resolveStageFxPalette(
	settings: StageFxColorSettings,
	palettes: StageFxColorPalettes
): ResolvedStageFxPalette {
	if (settings.colorSource === 'manual') {
		return {
			primaryColor: settings.primaryColor,
			secondaryColor: settings.secondaryColor,
			rainbowColors:
				settings.rainbowColors.length > 0
					? settings.rainbowColors
					: DEFAULT_RAINBOW_PALETTE
		};
	}
	const palette =
		settings.colorSource === 'theme'
			? palettes.theme
			: palettes.background.sourceUrl
				? palettes.background
				: null;
	if (!palette) {
		return {
			primaryColor: settings.primaryColor,
			secondaryColor: settings.secondaryColor,
			rainbowColors:
				settings.rainbowColors.length > 0
					? settings.rainbowColors
					: DEFAULT_RAINBOW_PALETTE
		};
	}
	return {
		primaryColor: palette.dominant,
		secondaryColor: palette.secondary,
		rainbowColors:
			palette.rainbow.length > 0
				? palette.rainbow
				: DEFAULT_RAINBOW_PALETTE
	};
}

/**
 * Samples one colour for a beam or flash. `position` spreads colours across
 * simultaneous beams; `motion` advances the rotating modes on the shared
 * render clock, so live preview and offline export stay identical.
 */
export function sampleStageFxColor(
	settings: StageFxColorSettings,
	palettes: StageFxColorPalettes,
	position: number,
	motion: number
): string {
	const palette = resolveStageFxPalette(settings, palettes);
	switch (settings.colorMode) {
		case 'gradient':
			return samplePaletteColor(
				[palette.primaryColor, palette.secondaryColor],
				pingPong01(position + motion)
			);
		case 'rainbow':
			return samplePaletteColor(
				palette.rainbowColors,
				Math.max(0, Math.min(1, position))
			);
		case 'visible-rotate':
			return samplePaletteColor(
				palette.rainbowColors,
				wrap01(position + motion)
			);
		case 'complete-rotate':
			return samplePaletteColor(
				completeRotatePalette(palette.rainbowColors),
				wrap01(position + motion)
			);
		case 'solid':
		default:
			return palette.primaryColor;
	}
}
