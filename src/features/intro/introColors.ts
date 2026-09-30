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
	resolveModeDrivenColors,
	resolveThemeColor,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import type {
	BackgroundImageItem,
	ColorSourceMode,
	IntroFillMode,
	IntroSequenceSettings,
	WallpaperState
} from '@/types/wallpaper';
import type {
	IntroFill,
	IntroFocusPoint,
	IntroPaintColors
} from './introPaint';

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
		backdrop: resolveIntroBackdropFill(
			settings,
			backgroundPalette,
			themePalette
		),
		titleFrame: resolveIntroFill(
			{
				source: settings.titleFrameColorSource,
				primary: settings.titleFrameColor,
				secondary: settings.titleFrameColorSecondary,
				mode: settings.titleFrameFillMode
			},
			backgroundPalette,
			themePalette,
			'text'
		)
	};
}

/**
 * One area's fill: the colour SOURCE brings the colours (and its own rainbow),
 * the fill MODE lays them down. `solid` goes through the role-aware
 * `resolveThemeColor`, so a solid fill in `theme` mode gets the colour meant for
 * that role instead of the palette's dominant one.
 */
export function resolveIntroFill(
	spec: {
		source: ColorSourceMode;
		primary: string;
		secondary: string;
		mode: IntroFillMode;
	},
	backgroundPalette: BackgroundPalette,
	themePalette: BackgroundPalette,
	role: Parameters<typeof resolveThemeColor>[4]
): IntroFill {
	const driven = resolveModeDrivenColors(
		spec.source,
		spec.primary,
		spec.secondary,
		backgroundPalette,
		themePalette
	);
	return {
		mode: spec.mode,
		primary:
			spec.mode === 'solid'
				? resolveThemeColor(
						spec.source,
						spec.primary,
						backgroundPalette,
						themePalette,
						role
					)
				: driven.primaryColor,
		secondary: driven.secondaryColor,
		rainbow: driven.rainbowColors
	};
}

/**
 * The backdrop's fill. The colour SOURCE decides which colours are in play —
 * the same `resolveModeDrivenColors` every other subsystem uses, so `current
 * image` and `theme` bring their own palette and their own rainbow — and the
 * fill mode decides how they are laid down. `solid` keeps the role-aware
 * `backdrop` colour, which is darker than the dominant one and is what a
 * backdrop wants.
 */
export function resolveIntroBackdropFill(
	settings: IntroSequenceSettings,
	backgroundPalette: BackgroundPalette,
	themePalette: BackgroundPalette
): IntroFill {
	const driven = resolveModeDrivenColors(
		settings.backdropColorSource,
		settings.backdropColor,
		settings.backdropColorSecondary,
		backgroundPalette,
		themePalette
	);
	return {
		mode: settings.backdropFillMode,
		primary:
			settings.backdropFillMode === 'solid'
				? resolveThemeColor(
						settings.backdropColorSource,
						settings.backdropColor,
						backgroundPalette,
						themePalette,
						'backdrop'
					)
				: driven.primaryColor,
		secondary: driven.secondaryColor,
		rainbow: driven.rainbowColors
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

/**
 * Card index → the point of that image the montage must keep in frame.
 *
 * The face focus first: that is the annotation made for exactly this, so a
 * tall shutter panel crops around the face instead of through it.
 *
 * Unmeasured, the image's own framing focus stands in. The montage builds its
 * pool from the setlist without asking, so a project where nobody walked the
 * Points panel image by image would otherwise crop every card dead centre —
 * the very crop the face point exists to avoid — while the user's framing
 * decision, made by hand in the same panel, sat there unread. Only with
 * neither does the painter fall back to the centre.
 */
export function resolveIntroFocusMap(
	pool: readonly Pick<
		BackgroundImageItem,
		'assetId' | 'faceFocusX' | 'faceFocusY' | 'focusX' | 'focusY'
	>[],
	ids: readonly string[]
): Map<number, IntroFocusPoint> {
	const focus = new Map<number, IntroFocusPoint>();
	ids.forEach((assetId, index) => {
		const item = pool.find(entry => entry.assetId === assetId);
		if (!item) return;
		const x = item.faceFocusX ?? item.focusX;
		const y = item.faceFocusY ?? item.focusY;
		if (typeof x !== 'number' || typeof y !== 'number') return;
		focus.set(index, { x, y });
	});
	return focus;
}

/** The settings of one window, whichever it is. */
export function selectIntroSequence(
	state: Pick<WallpaperState, 'introSequence' | 'outroSequence'>,
	kind: 'intro' | 'outro'
): IntroSequenceSettings {
	return kind === 'intro' ? state.introSequence : state.outroSequence;
}
