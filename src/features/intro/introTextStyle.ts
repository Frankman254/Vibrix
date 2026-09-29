/**
 * The typography of the intro's two lines.
 *
 * The user's request was to let the tagline (and the title) borrow **Track
 * Info's** configuration instead of growing a second, smaller set of controls:
 * its font, its uppercase, its letter spacing, its text treatment, its stroke,
 * its halo and its backdrop chip are already configured in that tab, already
 * follow the colour system, and already look finished.
 *
 * Everything Track Info stores in PIXELS is converted here to a share of the
 * line's own size (`em`), because the intro's title is several times bigger than
 * the widget's: copying `18px` of blur onto a 120px title would be invisible,
 * while `0.64em` reads the same at both sizes. That is also why the values are
 * resolved once, outside the painter, where the font size is not known yet.
 */
import {
	resolveThemeColor,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import type {
	IntroTextStyleSource,
	NowPlayingTextTreatment,
	TrackTitleFontStyle,
	WallpaperState
} from '@/types/wallpaper';

/** The Track Info keys a borrowed style reads. */
export type IntroTextStyleState = Pick<
	WallpaperState,
	| 'nowPlayingTextTreatment'
	| 'audioTrackTitleFontStyle'
	| 'audioTrackTitleUppercase'
	| 'audioTrackTitleFontSize'
	| 'audioTrackTitleLetterSpacing'
	| 'audioTrackTitleStrokeColor'
	| 'audioTrackTitleStrokeColorSource'
	| 'audioTrackTitleStrokeWidth'
	| 'audioTrackTitleGlowColor'
	| 'audioTrackTitleGlowColorSource'
	| 'audioTrackTitleGlowBlur'
	| 'audioTrackTitleGlowReach'
	| 'audioTrackTitleBackdropEnabled'
	| 'audioTrackTitleBackdropColor'
	| 'audioTrackTitleBackdropColorSource'
	| 'audioTrackTitleBackdropOpacity'
	| 'audioTrackTitleBackdropPadding'
>;

export type IntroTextStyle = {
	font: TrackTitleFontStyle;
	uppercase: boolean;
	/** Extra room between glyphs, as a share of the line's size. */
	letterSpacingEm: number;
	treatment: NowPlayingTextTreatment;
	/** Outline around every glyph, its width as a share of the size. */
	stroke: { color: string; widthEm: number } | null;
	/** The halo behind the line, its blur as a share of the size. */
	glow: { color: string; blurEm: number; reach: number } | null;
	/** The slab behind the line, its padding as a share of the size. */
	backdrop: { color: string; opacity: number; paddingEm: number } | null;
};

/**
 * What the intro has always drawn: the line's own font and a soft black drop
 * shadow, which is what keeps white text legible over any montage without
 * painting a slab behind it.
 */
export function introOwnTextStyle(font: TrackTitleFontStyle): IntroTextStyle {
	return {
		font,
		uppercase: false,
		letterSpacingEm: 0,
		treatment: 'solid',
		stroke: null,
		glow: { color: 'rgba(0,0,0,0.55)', blurEm: 0.28, reach: 1 },
		backdrop: null
	};
}

export function resolveIntroTextStyle(
	source: IntroTextStyleSource,
	ownFont: TrackTitleFontStyle,
	state: IntroTextStyleState,
	backgroundPalette: BackgroundPalette,
	themePalette: BackgroundPalette
): IntroTextStyle {
	if (source !== 'track-info') return introOwnTextStyle(ownFont);
	// The widget's own font size is the unit every pixel value below is in.
	const unit = Math.max(1, state.audioTrackTitleFontSize);
	const colour = (
		mode: WallpaperState['audioTrackTitleStrokeColorSource'],
		manual: string,
		role: Parameters<typeof resolveThemeColor>[4]
	) => resolveThemeColor(mode, manual, backgroundPalette, themePalette, role);
	const strokeWidthEm = Math.max(0, state.audioTrackTitleStrokeWidth) / unit;
	const glowBlurEm = Math.max(0, state.audioTrackTitleGlowBlur) / unit;
	return {
		font: state.audioTrackTitleFontStyle,
		uppercase: state.audioTrackTitleUppercase,
		letterSpacingEm: state.audioTrackTitleLetterSpacing / unit,
		treatment: state.nowPlayingTextTreatment,
		stroke:
			strokeWidthEm > 0
				? {
						color: colour(
							state.audioTrackTitleStrokeColorSource,
							state.audioTrackTitleStrokeColor,
							'backdrop'
						),
						widthEm: strokeWidthEm
					}
				: null,
		glow:
			glowBlurEm > 0
				? {
						color: colour(
							state.audioTrackTitleGlowColorSource,
							state.audioTrackTitleGlowColor,
							'accent'
						),
						blurEm: glowBlurEm,
						reach: Math.min(
							3,
							Math.max(1, state.audioTrackTitleGlowReach)
						)
					}
				: null,
		backdrop: state.audioTrackTitleBackdropEnabled
			? {
					color: colour(
						state.audioTrackTitleBackdropColorSource,
						state.audioTrackTitleBackdropColor,
						'backdrop'
					),
					opacity: Math.min(
						1,
						Math.max(0, state.audioTrackTitleBackdropOpacity)
					),
					paddingEm:
						Math.max(0, state.audioTrackTitleBackdropPadding) / unit
				}
			: null
	};
}
