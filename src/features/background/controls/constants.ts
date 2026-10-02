import type { ImageFitMode, SlideshowTransitionType } from '@/types/wallpaper';

export const FIT_MODES: ImageFitMode[] = [
	'cover',
	'contain',
	'stretch',
	'fit-width',
	'fit-height'
];

export const TRANSITION_TYPES: SlideshowTransitionType[] = [
	'fade',
	'slide-left',
	'slide-right',
	'zoom-in',
	'blur-dissolve',
	'bars-horizontal',
	'bars-vertical',
	'rgb-shift',
	'distortion',
	'cross-zoom',
	'diagonal-wipe',
	'iris'
];

export const TRANSITION_LABELS = {
	fade: 'transition_style_fade',
	'slide-left': 'transition_style_slide_left',
	'slide-right': 'transition_style_slide_right',
	'zoom-in': 'transition_style_zoom_in',
	'blur-dissolve': 'transition_style_blur_dissolve',
	'bars-horizontal': 'transition_style_bars_horizontal',
	'bars-vertical': 'transition_style_bars_vertical',
	'rgb-shift': 'transition_style_rgb_shift',
	distortion: 'transition_style_distortion',
	'cross-zoom': 'transition_style_cross_zoom',
	'diagonal-wipe': 'transition_style_diagonal_wipe',
	iris: 'transition_style_iris'
} as const satisfies Record<SlideshowTransitionType, string>;

export const VISIBLE_BACKGROUND_THUMBNAILS = 10;
