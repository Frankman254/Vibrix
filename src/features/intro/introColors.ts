/**
 * Resolving the colours and the logo of an intro / ending window.
 *
 * Shared by the live layer and the offline subsystem so both pick exactly the
 * same colours. The window follows the app's colour system like every other
 * subsystem: manual, the editor theme, or the palette extracted from the
 * background image.
 */
import { APP_LOGO_URL } from '@/config/appLogo';
import {
	getEditorThemePalette,
	resolveThemeColor,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import type { IntroSequenceSettings, WallpaperState } from '@/types/wallpaper';
import type { IntroPaintColors } from './introPaint';

export function resolveIntroColors(
	settings: IntroSequenceSettings,
	backgroundPalette: BackgroundPalette,
	themePalette: BackgroundPalette
): IntroPaintColors {
	return {
		title: resolveThemeColor(
			settings.titleColorSource,
			settings.titleColor,
			backgroundPalette,
			themePalette,
			'text'
		),
		tagline: resolveThemeColor(
			settings.taglineColorSource,
			settings.taglineColor,
			backgroundPalette,
			themePalette,
			'accent'
		),
		backdrop: resolveThemeColor(
			settings.backdropColorSource,
			settings.backdropColor,
			backgroundPalette,
			themePalette,
			'backdrop'
		)
	};
}

export function resolveIntroThemePalette(
	state: Pick<WallpaperState, 'editorTheme'>
): BackgroundPalette {
	return getEditorThemePalette(state.editorTheme);
}

/** The URL of the mark that sits in the middle, or `null` for "no mark". */
export function resolveIntroLogoUrl(
	settings: IntroSequenceSettings,
	state: Pick<WallpaperState, 'logoUrl'>
): string | null {
	if (settings.logoSource === 'vibrix') return APP_LOGO_URL;
	if (settings.logoSource === 'project') return state.logoUrl ?? null;
	return null;
}

/** The settings of one window, whichever it is. */
export function selectIntroSequence(
	state: Pick<WallpaperState, 'introSequence' | 'outroSequence'>,
	kind: 'intro' | 'outro'
): IntroSequenceSettings {
	return kind === 'intro' ? state.introSequence : state.outroSequence;
}
