import type { WallpaperState } from '@/types/wallpaper';

export type TrackFontStyle = WallpaperState['audioTrackTitleFontStyle'];

// Bundled web fonts (loaded via @fontsource in main.tsx) lead each stack so the
// look is consistent across machines; system fonts remain as fallbacks.
export const TRACK_TITLE_FONT_STACKS: Record<TrackFontStyle, string> = {
	clean: '"Inter", "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
	condensed:
		'"Oswald", "Arial Narrow", "Roboto Condensed", "Segoe UI", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
	techno: '"Orbitron", "Eurostile", "Trebuchet MS", Verdana, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
	mono: '"Space Mono", "SFMono-Regular", Consolas, "Liberation Mono", "Noto Sans Mono", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", monospace',
	serif: '"Playfair Display", Georgia, "Times New Roman", "Noto Serif", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif',
	display:
		'"Bebas Neue", "Oswald", "Impact", "Haettenschweiler", "Arial Narrow Bold", sans-serif',
	rounded:
		'"Nunito", "Quicksand", "Varela Round", "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
	handwritten:
		'"Caveat", "Comic Sans MS", "Bradley Hand", "Segoe Script", cursive',
	poster: '"Anton", "Impact", "Haettenschweiler", "Arial Narrow Bold", sans-serif',
	black: '"Archivo Black", "Arial Black", "Helvetica Neue", Arial, sans-serif',
	modern: '"Montserrat", "Helvetica Neue", Arial, "Noto Sans", sans-serif',
	geometric: '"Poppins", "Futura", "Century Gothic", "Segoe UI", sans-serif',
	slab: '"Roboto Slab", "Rockwell", "Courier New", Georgia, serif',
	elegant:
		'"Cormorant Garamond", Garamond, "Times New Roman", Georgia, serif',
	cinematic: '"Cinzel", "Trajan Pro", "Times New Roman", Georgia, serif',
	futuristic:
		'"Audiowide", "Orbitron", "Eurostile", "Trebuchet MS", sans-serif',
	racing: '"Russo One", "Eurostile", "Trebuchet MS", Verdana, sans-serif',
	stencil: '"Black Ops One", "Stencil", Impact, "Arial Black", sans-serif',
	pixel: '"Press Start 2P", "Courier New", "Liberation Mono", monospace',
	terminal: '"VT323", "IBM Plex Mono", "Courier New", monospace',
	comic: '"Bangers", "Comic Sans MS", Impact, cursive',
	marker: '"Permanent Marker", "Comic Sans MS", "Segoe Script", cursive',
	brush: '"Pacifico", "Brush Script MT", "Segoe Script", cursive',
	kawaii: '"Fredoka", "Varela Round", "Quicksand", "Segoe UI", sans-serif',
	blackletter:
		'"UnifrakturMaguntia", "Old English Text MT", "Luminari", "Papyrus", serif'
};

export const TRACK_TITLE_FONT_WEIGHT: Record<TrackFontStyle, number> = {
	clean: 700,
	condensed: 700,
	techno: 800,
	mono: 700,
	serif: 700,
	display: 400,
	rounded: 800,
	handwritten: 700,
	poster: 400,
	black: 400,
	modern: 800,
	geometric: 700,
	slab: 700,
	elegant: 700,
	cinematic: 700,
	futuristic: 400,
	racing: 400,
	stencil: 400,
	pixel: 400,
	terminal: 400,
	comic: 400,
	marker: 400,
	brush: 400,
	kawaii: 600,
	blackletter: 400
};

export const TRACK_TITLE_STYLE_SPACING_BONUS: Record<TrackFontStyle, number> = {
	clean: 0,
	condensed: 0.8,
	techno: 2.6,
	mono: 1.2,
	serif: 0.3,
	display: 1.6,
	rounded: 0,
	handwritten: 0,
	poster: 0.8,
	black: 0.4,
	modern: 0.6,
	geometric: 0.4,
	slab: 0.2,
	elegant: 0.4,
	cinematic: 2.2,
	futuristic: 2.4,
	racing: 1.8,
	stencil: 1.4,
	pixel: 3,
	terminal: 1.5,
	comic: 1,
	marker: 0,
	brush: 0,
	kawaii: 0,
	blackletter: 0.5
};

export function buildTrackFont(
	fontStyle: TrackFontStyle,
	fontSize: number,
	weight?: number
): string {
	return `${weight ?? TRACK_TITLE_FONT_WEIGHT[fontStyle]} ${fontSize}px ${TRACK_TITLE_FONT_STACKS[fontStyle]}`;
}

// Canvas only paints a web font once the browser has actually loaded the face.
// Nothing in the DOM uses these families, so we explicitly warm them at startup;
// otherwise the first frames fall back to system fonts until a later repaint.
const FONT_WARMUP: ReadonlyArray<readonly [string, number]> = [
	['Inter', 700],
	['Oswald', 700],
	['Orbitron', 800],
	['Space Mono', 700],
	['Playfair Display', 700],
	['Bebas Neue', 400],
	['Nunito', 800],
	['Caveat', 700],
	['Anton', 400],
	['Archivo Black', 400],
	['Montserrat', 800],
	['Poppins', 700],
	['Roboto Slab', 700],
	['Cormorant Garamond', 700],
	['Cinzel', 700],
	['Audiowide', 400],
	['Russo One', 400],
	['Black Ops One', 400],
	['Press Start 2P', 400],
	['VT323', 400],
	['Bangers', 400],
	['Permanent Marker', 400],
	['Pacifico', 400],
	['Fredoka', 600],
	['UnifrakturMaguntia', 400]
];

let warmed = false;

export function ensureTrackFontsLoaded(): void {
	if (warmed || typeof document === 'undefined' || !document.fonts) return;
	warmed = true;
	for (const [family, weight] of FONT_WARMUP) {
		void document.fonts.load(`${weight} 32px "${family}"`).catch(() => {
			/* font unavailable — stacks fall back to system fonts */
		});
	}
}

const EXPORT_FONT_WEIGHTS = [300, 400, 500, 600, 700, 800, 900] as const;

/**
 * `font-family` / `font-weight` pairs a Lyrixa bundle's styles ask for,
 * found anywhere in its JSON (layer styles, clip overrides).
 */
export function collectBundleFontSpecs(bundle: unknown): string[] {
	const specs = new Set<string>();
	const visit = (value: unknown, depth: number) => {
		if (!value || typeof value !== 'object' || depth > 12) return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item, depth + 1);
			return;
		}
		const record = value as Record<string, unknown>;
		const family = record.fontFamily;
		if (typeof family === 'string' && family && family !== 'inherit') {
			const weight = record.fontWeight ?? 400;
			specs.add(`${weight} 32px ${family}`);
		}
		for (const child of Object.values(record)) visit(child, depth + 1);
	};
	visit(bundle, 0);
	return [...specs];
}

/**
 * Waits until every track/lyrics face is loaded at every weight a style can
 * ask for, plus any extra `font` shorthands (a lyrics bundle's own faces).
 * The offline export draws frame 0 immediately, so it cannot rely on the
 * fire-and-forget warm-up repainting later.
 */
export async function loadTrackFonts(
	extraFontSpecs: readonly string[] = []
): Promise<void> {
	if (typeof document === 'undefined' || !document.fonts) return;
	ensureTrackFontsLoaded();
	await Promise.all([
		...FONT_WARMUP.flatMap(([family]) =>
			EXPORT_FONT_WEIGHTS.map(weight =>
				document.fonts
					.load(`${weight} 32px "${family}"`)
					.catch(() => undefined)
			)
		),
		...extraFontSpecs.map(spec =>
			document.fonts.load(spec).catch(() => undefined)
		)
	]);
	await document.fonts.ready;
}
