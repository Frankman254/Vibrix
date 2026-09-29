/**
 * Spectrum colour resolution, lifted out of the overlay registry so every
 * caller that hands a state to `drawSpectrum` resolves colours the same way.
 *
 * Two consumers today: the live/offline overlay registry (the wallpaper's own
 * spectrums) and the generated intro, which renders a SAVED spectrum slot. If
 * the intro resolved colours itself, an image-driven or theme-driven slot would
 * come out a different colour in the flourish than on the wallpaper.
 */
import {
	resolveModeDrivenColors,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import type { WallpaperState } from '@/types/wallpaper';

export type ResolvedSpectrumColorState = WallpaperState & {
	spectrumRainbowColors?: string[];
	spectrumGlowRainbowColors?: string[];
};

export function resolveMainSpectrumState(
	state: WallpaperState,
	backgroundPalette: BackgroundPalette,
	themePalette: BackgroundPalette
): ResolvedSpectrumColorState {
	const resolvedColors = resolveModeDrivenColors(
		state.spectrumColorSource,
		state.spectrumPrimaryColor,
		state.spectrumSecondaryColor,
		backgroundPalette,
		themePalette
	);
	// The glow carries its own color source/colors, resolved independently of
	// the fill so it works in manual / image / theme alike.
	const resolvedGlow = resolveModeDrivenColors(
		state.spectrumGlowColorSource,
		state.spectrumGlowPrimaryColor,
		state.spectrumGlowSecondaryColor,
		backgroundPalette,
		themePalette
	);
	return {
		...state,
		spectrumPrimaryColor: resolvedColors.primaryColor,
		spectrumSecondaryColor: resolvedColors.secondaryColor,
		spectrumRainbowColors: resolvedColors.rainbowColors,
		spectrumGlowPrimaryColor: resolvedGlow.primaryColor,
		spectrumGlowSecondaryColor: resolvedGlow.secondaryColor,
		// Rainbow / rotate glow samples its own palette, so an image-driven glow
		// can sweep the wallpaper's colors independently of the fill.
		spectrumGlowRainbowColors: resolvedGlow.rainbowColors
	};
}
