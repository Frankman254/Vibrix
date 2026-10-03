import type { ImageFitMode } from '@/types/wallpaper';

export const FIT_MODES: ImageFitMode[] = [
	'cover',
	'contain',
	'stretch',
	'fit-width',
	'fit-height'
];

export { TRANSITION_TYPES, TRANSITION_LABELS } from '../transitionCatalog';

export const VISIBLE_BACKGROUND_THUMBNAILS = 10;
