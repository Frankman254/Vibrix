/**
 * Offline render of the generated intro / ending.
 *
 * The montage is built from the images of the selected setlist, so `prepare`
 * loads exactly those — the same list `pickStingerImages` gives the live layer,
 * in the same order. `stingerPlan` decides the window and the layout and
 * `paintStinger` draws it, so the file and the preview agree frame for frame.
 */
import { resolveSlideshowPool } from '@/features/background';
import {
	pickStingerImages,
	resolveStingerBackdropAlpha,
	resolveStingerCards,
	resolveStingerWindow
} from '@/features/stinger/stingerPlan';
import { paintStinger } from '@/features/stinger/stingerPaint';
import type { WallpaperState } from '@/types/wallpaper';
import type { RenderFrameContext } from '../renderFrameContext';
import type { RenderSubsystem } from '../renderSubsystem';

async function loadImage(url: string): Promise<HTMLImageElement | null> {
	const image = new Image();
	image.decoding = 'async';
	image.src = url;
	try {
		await image.decode();
		return image;
	} catch {
		return null;
	}
}

/** Card index → image, for one window. Missing entries are simply not drawn. */
type CardImages = Map<number, HTMLImageElement>;

async function loadWindowImages(
	state: Readonly<WallpaperState>,
	kind: 'intro' | 'outro'
): Promise<CardImages> {
	const settings = kind === 'intro' ? state.introStinger : state.outroStinger;
	const images: CardImages = new Map();
	if (!settings.enabled) return images;
	const pool = resolveSlideshowPool(
		state.backgroundImages,
		state.setlists,
		state.activeSetlistId
	);
	const ids = pickStingerImages(pool, settings);
	await Promise.all(
		ids.map(async (assetId, index) => {
			const url = pool.find(item => item.assetId === assetId)?.url;
			if (!url) return;
			const image = await loadImage(url);
			if (image) images.set(index, image);
		})
	);
	return images;
}

export function createStingerSubsystem(): RenderSubsystem {
	let intro: CardImages = new Map();
	let outro: CardImages = new Map();

	return {
		id: 'stinger',
		async prepare(state: Readonly<WallpaperState>) {
			intro = await loadWindowImages(state, 'intro');
			outro = await loadWindowImages(state, 'outro');
		},
		render(ctx: RenderFrameContext) {
			const window = resolveStingerWindow(
				ctx.state,
				ctx.trackCurrentTime,
				ctx.trackDuration
			);
			if (!window) return;
			const settings =
				window.kind === 'intro'
					? ctx.state.introStinger
					: ctx.state.outroStinger;
			const images = window.kind === 'intro' ? intro : outro;
			if (images.size === 0) return;
			const target = ctx.canvas.getContext('2d');
			if (!target) return;
			paintStinger({
				ctx: target,
				viewport: ctx.resolution,
				cards: resolveStingerCards(
					window.kind,
					settings.style,
					window.progress,
					images.size,
					ctx.resolution
				),
				images,
				backdropAlpha: resolveStingerBackdropAlpha(
					window.kind,
					window.progress
				)
			});
		},
		dispose() {
			intro.clear();
			outro.clear();
		}
	};
}
