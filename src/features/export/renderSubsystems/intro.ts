/**
 * Offline render of the generated intro / ending.
 *
 * The composition is built from the images of the selected setlist, so
 * `prepare` loads exactly those — the same list `pickIntroImages` gives the
 * live layer, in the same order — plus the mark each window puts in the middle.
 * `introPlan` decides how far each piece is mounted and `paintIntro` places it,
 * so the file and the preview agree frame for frame.
 */
import { resolveSlideshowPool } from '@/features/background';
import {
	createIntroSpectrumPainter,
	paintIntro,
	pickIntroImages,
	resolveIntroColors,
	resolveIntroFrame,
	resolveIntroLogoUrl,
	resolveIntroThemePalette,
	resolveIntroWindow,
	selectIntroSequence
} from '@/features/intro';
import type { IntroSequenceKind, WallpaperState } from '@/types/wallpaper';
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

/** Everything one window needs on disk before the first frame is drawn. */
type WindowAssets = {
	images: Map<number, HTMLImageElement>;
	logo: HTMLImageElement | null;
};

async function loadWindowAssets(
	state: Readonly<WallpaperState>,
	kind: IntroSequenceKind
): Promise<WindowAssets> {
	const settings = selectIntroSequence(state, kind);
	const assets: WindowAssets = { images: new Map(), logo: null };
	if (!settings.enabled) return assets;
	const pool = resolveSlideshowPool(
		state.backgroundImages,
		state.setlists,
		state.activeSetlistId
	);
	const ids = pickIntroImages(pool, settings);
	const logoUrl = resolveIntroLogoUrl(settings, state);
	await Promise.all([
		...ids.map(async (assetId, index) => {
			const url = pool.find(item => item.assetId === assetId)?.url;
			if (!url) return;
			const image = await loadImage(url);
			if (image) assets.images.set(index, image);
		}),
		(async () => {
			if (!logoUrl) return;
			assets.logo = await loadImage(logoUrl);
		})()
	]);
	return assets;
}

export function createIntroSubsystem(): RenderSubsystem {
	let intro: WindowAssets = { images: new Map(), logo: null };
	let outro: WindowAssets = { images: new Map(), logo: null };

	return {
		id: 'introSequence',
		async prepare(state: Readonly<WallpaperState>) {
			intro = await loadWindowAssets(state, 'intro');
			outro = await loadWindowAssets(state, 'outro');
		},
		render(ctx: RenderFrameContext) {
			const window_ = resolveIntroWindow(
				ctx.state,
				ctx.trackCurrentTime,
				ctx.trackDuration
			);
			if (!window_) return;
			const settings = selectIntroSequence(ctx.state, window_.kind);
			const assets = window_.kind === 'intro' ? intro : outro;
			const target = ctx.canvas.getContext('2d');
			if (!target) return;
			paintIntro({
				ctx: target,
				viewport: ctx.resolution,
				frame: resolveIntroFrame({
					kind: window_.kind,
					settings,
					progress: window_.progress,
					viewport: ctx.resolution,
					cardCount: Math.max(1, assets.images.size)
				}),
				images: assets.images,
				logo: assets.logo,
				colors: resolveIntroColors(
					settings,
					ctx.palette,
					resolveIntroThemePalette(ctx.state)
				),
				paintSpectrum:
					createIntroSpectrumPainter({
						kind: window_.kind,
						state: ctx.state as WallpaperState,
						palette: ctx.palette,
						themePalette: resolveIntroThemePalette(ctx.state),
						windowTimeSec: window_.elapsedSec,
						dt: Math.max(0.0001, ctx.deltaMs / 1000)
					}) ?? undefined,
				titleFontStyle: settings.titleFontStyle,
				taglineFontStyle: settings.taglineFontStyle
			});
		},
		dispose() {
			intro = { images: new Map(), logo: null };
			outro = { images: new Map(), logo: null };
		}
	};
}
