/**
 * Offline render of the generated intro / ending.
 *
 * The composition is built from the images of the selected setlist, so
 * `prepare` loads exactly those — the same list `pickIntroImages` gives the
 * live layer, in the same order — plus the mark each window puts in the middle.
 * `introPlan` decides how far each piece is mounted and `paintIntro` places it,
 * so the file and the preview agree frame for frame.
 */
import {
	getBackgroundPalette,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import {
	createIntroSpectrumPainter,
	paintIntro,
	pickIntroImages,
	resolveIntroColors,
	resolveIntroFocusMap,
	resolveIntroFrame,
	resolveIntroLogoUrl,
	resolveIntroPaletteUrl,
	resolveIntroPool,
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
	/** Card index → the point of that image to keep in frame while cropping. */
	focus: Map<number, { x: number; y: number }>;
	logo: HTMLImageElement | null;
	/**
	 * What `current image` means inside the window: the palette of the FIRST
	 * setlist image, resolved here so the file and the preview agree. `null`
	 * falls back to the frame's own palette.
	 */
	palette: BackgroundPalette | null;
};

async function loadWindowAssets(
	state: Readonly<WallpaperState>,
	kind: IntroSequenceKind
): Promise<WindowAssets> {
	const settings = selectIntroSequence(state, kind);
	const assets: WindowAssets = {
		images: new Map(),
		focus: new Map(),
		logo: null,
		palette: null
	};
	if (!settings.enabled) return assets;
	const pool = resolveIntroPool(state, settings);
	const paletteUrl = resolveIntroPaletteUrl(state);
	if (paletteUrl) {
		assets.palette = await getBackgroundPalette(paletteUrl);
	}
	const ids = pickIntroImages(pool, settings);
	assets.focus = resolveIntroFocusMap(pool, ids);
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
	const empty = (): WindowAssets => ({
		images: new Map(),
		focus: new Map(),
		logo: null,
		palette: null
	});
	let intro: WindowAssets = empty();
	let outro: WindowAssets = empty();

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
					cardCount: Math.max(1, assets.images.size),
					durationSec: window_.durationSec
				}),
				images: assets.images,
				focus: assets.focus,
				logo: assets.logo,
				colors: resolveIntroColors(
					settings,
					assets.palette ?? ctx.palette,
					resolveIntroThemePalette(ctx.state)
				),
				paintSpectrum:
					createIntroSpectrumPainter({
						kind: window_.kind,
						state: ctx.state as WallpaperState,
						palette: assets.palette ?? ctx.palette,
						themePalette: resolveIntroThemePalette(ctx.state),
						windowTimeSec: window_.elapsedSec,
						dt: Math.max(0.0001, ctx.deltaMs / 1000)
					}) ?? undefined,
				titleFontStyle: settings.titleFontStyle,
				taglineFontStyle: settings.taglineFontStyle
			});
		},
		dispose() {
			intro = empty();
			outro = empty();
		}
	};
}
