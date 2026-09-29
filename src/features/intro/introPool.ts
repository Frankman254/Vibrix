/**
 * WHICH images an intro / ending window draws, and which image its colours come
 * from.
 *
 * Two questions that look like one and are not:
 *
 *  - The **pool** is where the montage's cards come from. In `setlist` mode it
 *    is the selected setlist, already filtered and in the user's own order; in
 *    `catalog` mode it is the whole collection sliced automatically, because
 *    «seleccionar de todo el catalogo o del set list seleccionado actual» is a
 *    choice, not a fixed rule; in `manual` mode it is also the WHOLE
 *    collection, because a hand-picked image must be drawn even when the
 *    active setlist filters it out.
 *  - The **palette image** is what the `current image` colour source means
 *    inside a window. It is the FIRST image of the setlist — never the live
 *    active image (the intro plays before anything is "active") and never the
 *    hand-picked list, which is the user's own rule: «current image es la
 *    primera imagen del set list, no de las que seleccionamos».
 */
import { resolveSlideshowPool } from '@/features/background';
import type {
	BackgroundImageItem,
	IntroSequenceSettings,
	WallpaperState
} from '@/types/wallpaper';

type PoolState = Pick<
	WallpaperState,
	'backgroundImages' | 'setlists' | 'activeSetlistId'
>;

/** The images the montage may draw, in the order it should consider them. */
export function resolveIntroPool(
	state: PoolState,
	settings: IntroSequenceSettings
): BackgroundImageItem[] {
	// Both `manual` and `catalog` read the whole collection: the first looks the
	// picked ids up in it, the second slices it automatically. Only `setlist`
	// narrows the pool down to the active curation.
	if (settings.imageSourceMode !== 'setlist') return state.backgroundImages;
	return resolveSlideshowPool(
		state.backgroundImages,
		state.setlists,
		state.activeSetlistId
	);
}

/**
 * The image the window's `current image` colour source reads, or `null` when
 * there is no setlist image at all.
 */
export function resolveIntroPaletteUrl(state: PoolState): string | null {
	const setlistPool = resolveSlideshowPool(
		state.backgroundImages,
		state.setlists,
		state.activeSetlistId
	);
	return setlistPool[0]?.url ?? null;
}
