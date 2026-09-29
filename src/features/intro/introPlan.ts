/**
 * The intro / ending sequence, planned as pure math.
 *
 * The idea is the user's: the system BUILDS both out of the images of the
 * selected setlist and mounts a small composition over them — montage,
 * spectrum, logo, title, tagline — where every piece arrives one after another
 * while the window opens and is taken apart in the reverse order while it
 * closes. Everything is a function of the window's progress, so nothing here
 * depends on wall-clock time and the live preview and the exported file agree
 * frame for frame.
 *
 * Neither window adds time to the video: the intro owns the head of the
 * timeline and the ending its tail, so the audio never drifts.
 *
 * This module owns TIME. Where the text and the marks land on screen is the
 * painter's job, because that needs font metrics; what the plan decides is how
 * far along each piece is this frame.
 */
import type {
	IntroLogoSource,
	IntroMontageMode,
	IntroSequenceKind,
	IntroSequenceSettings,
	IntroTextReveal,
	WallpaperState
} from '@/types/wallpaper';
import {
	INTRO_WAVE_INTENSITY_RANGE,
	INTRO_WAVE_SPEED_RANGE
} from './introSpectrum';

export type IntroSequenceState = Pick<
	WallpaperState,
	'introSequence' | 'outroSequence'
>;

/** The window a frame falls in, with its progress in `0..1`. */
export type IntroWindow = {
	kind: IntroSequenceKind;
	progress: number;
	/**
	 * Seconds since the window opened. `progress` is normalized, which is what
	 * the mount envelopes want, but a wave needs REAL seconds so it travels at
	 * the same speed whatever the configured duration — and taking them from
	 * the track keeps live and offline identical.
	 */
	elapsedSec: number;
};

export type IntroViewport = { width: number; height: number };

/**
 * One image of the montage, placed in viewport pixels. `x`/`y` are the CENTRE
 * so a rotation turns the card and not its corner.
 */
export type IntroCard = {
	/** Position in the picked list — which image this card shows. */
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
	alpha: number;
	scale: number;
	rotationRad: number;
};

/** How far along one line of text is, however it is being revealed. */
export type IntroTextFrame = {
	alpha: number;
	/** Characters drawn, counted from the start of the string. */
	visibleChars: number;
	/** Vertical offset in font-size units — `rise` slides the line up. */
	offsetEm: number;
	scale: number;
	/** Share of the line a left-to-right mask has uncovered, `0..1`. */
	wipePct: number;
};

export type IntroTextPlan = {
	text: string;
	sizePct: number;
	frame: IntroTextFrame;
};

/**
 * The intro spectrum is drawn by the REAL spectrum engine from a saved slot, so
 * the plan carries no geometry at all: only how far the figure is mounted and
 * how opaque it is. `introSpectrumDraw` turns that into a slot render.
 */
export type IntroSpectrumPlan = {
	/** Which saved spectrum slot, by position in `spectrumProfileSlots`. */
	slotIndex: number;
	centered: boolean;
	/** `0..1` — feeds both the generated wave's height and the opacity. */
	mount: number;
	alpha: number;
	waveSpeed: number;
	waveIntensity: number;
};

export type IntroLogoPlan = {
	source: Exclude<IntroLogoSource, 'none'>;
	sizePct: number;
	alpha: number;
	scale: number;
};

export type IntroFrame = {
	kind: IntroSequenceKind;
	progress: number;
	backdropAlpha: number;
	/** How much the montage is darkened under the composition, `0..1`. */
	imageDim: number;
	cards: IntroCard[];
	spectrum: IntroSpectrumPlan | null;
	logo: IntroLogoPlan | null;
	title: IntroTextPlan | null;
	/** The rectangle around the title: how wide it has drawn itself. */
	titleFrame: { alpha: number; widthPct: number } | null;
	tagline: IntroTextPlan | null;
};

export const INTRO_DURATION_RANGE = { min: 0.5, max: 20 } as const;
export const INTRO_IMAGE_COUNT_RANGE = { min: 1, max: 16 } as const;
export const INTRO_PHASE_RANGE = { min: 0.05, max: 0.45 } as const;
export const INTRO_TITLE_SIZE_RANGE = { min: 4, max: 22 } as const;
export const INTRO_TAGLINE_SIZE_RANGE = { min: 2, max: 12 } as const;
export const INTRO_LOGO_SIZE_RANGE = { min: 4, max: 40 } as const;
export { INTRO_WAVE_INTENSITY_RANGE, INTRO_WAVE_SPEED_RANGE };

/**
 * The order pieces are mounted in. The teardown runs it backwards, which is
 * what makes the window read as "built, then taken apart" instead of a fade.
 * The backdrop is not in the list — it brackets the whole window.
 */
export const INTRO_MOUNT_ORDER = [
	'cards',
	'spectrum',
	'logo',
	'titleFrame',
	'title',
	'tagline'
] as const;

export type IntroMountSlot = (typeof INTRO_MOUNT_ORDER)[number];

export function createDefaultIntroSequence(
	kind: IntroSequenceKind
): IntroSequenceSettings {
	const intro = kind === 'intro';
	return {
		enabled: false,
		durationSec: intro ? 5 : 6,
		buildPct: 0.3,
		releasePct: intro ? 0.25 : 0.3,

		montage: intro ? 'mosaic-grid' : 'mosaic-burst',
		imageCount: intro ? 9 : 9,
		order: intro ? 'setlist' : 'setlist-reverse',
		backdropColor: '#000000',
		imageDim: 0.45,

		titleEnabled: true,
		titleText: '',
		titleFontStyle: 'display',
		titleSizePct: 11,
		titleReveal: intro ? 'pop' : 'fade',
		titleColorSource: 'manual',
		titleColor: '#ffffff',
		titleFrameEnabled: true,

		taglineEnabled: true,
		taglineText: '',
		taglineFontStyle: 'clean',
		taglineSizePct: 4,
		taglineReveal: 'typewriter',
		taglineColorSource: 'image',
		taglineColor: '#ffd7ec',

		logoSource: 'none',
		logoSizePct: 14,

		spectrumSource: 'none',
		spectrumSlotIndex: 0,
		spectrumCentered: true,
		spectrumWaveSpeed: 1,
		spectrumWaveIntensity: 1
	};
}

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampRange(
	value: number,
	range: { min: number; max: number }
): number {
	return Math.max(range.min, Math.min(range.max, value));
}

/** Smooth ease-in-out, so nothing starts or stops on a hard edge. */
export function easeInOut(t: number): number {
	const x = clamp01(t);
	return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
}

/**
 * Progress of item `index` of `count`, inside a phase that runs `0..1`.
 *
 * Items overlap — one is still settling while the next arrives, which is what
 * keeps a sequence from popping — but the LAST one finishes exactly at the end
 * of the phase, so a window never hands over mid-animation.
 */
export function staggered(phase: number, index: number, count: number): number {
	const total = Math.max(1, count);
	const ramp = Math.min(0.7, 1.5 / total);
	const step = total > 1 ? (1 - ramp) / (total - 1) : 0;
	return clamp01((phase - index * step) / ramp);
}

function effectiveDuration(
	settings: IntroSequenceSettings,
	totalSec: number
): number {
	if (!settings.enabled) return 0;
	const wanted = clampRange(settings.durationSec, INTRO_DURATION_RANGE);
	// A window can never eat more than half the video: on a very short track
	// the intro and the ending must still both fit, and neither may swallow
	// the project entirely.
	return Math.min(wanted, Math.max(0, totalSec / 2));
}

/**
 * Which window `timeSec` falls in, or `null` for "the project plays normally".
 *
 * The intro owns the head and the ending the tail, clamped against each other
 * so they can never overlap whatever the track length.
 */
export function resolveIntroWindow(
	state: IntroSequenceState,
	timeSec: number,
	totalSec: number
): IntroWindow | null {
	if (!(totalSec > 0)) return null;
	const introSec = effectiveDuration(state.introSequence, totalSec);
	const outroSec = effectiveDuration(state.outroSequence, totalSec);
	if (introSec > 0 && timeSec < introSec) {
		return {
			kind: 'intro',
			progress: clamp01(timeSec / introSec),
			elapsedSec: Math.max(0, timeSec)
		};
	}
	if (outroSec > 0) {
		const startSec = Math.max(introSec, totalSec - outroSec);
		if (timeSec >= startSec) {
			const span = Math.max(0.001, totalSec - startSec);
			return {
				kind: 'outro',
				progress: clamp01((timeSec - startSec) / span),
				elapsedSec: Math.max(0, timeSec - startSec)
			};
		}
	}
	return null;
}

/**
 * The asset ids the montage shows, in the order it shows them.
 *
 * The pool arrives already filtered to the active setlist and in setlist order
 * (`resolveSlideshowPool`), which is the whole point: the window is made of the
 * set's own images, in the order the user arranged them. The intro takes them
 * from the front, the ending — with the default reverse order — from the back,
 * so a set closes on the images it ends with.
 */
export function pickIntroImages(
	pool: readonly { assetId: string }[],
	settings: IntroSequenceSettings
): string[] {
	const count = Math.round(
		clampRange(settings.imageCount, INTRO_IMAGE_COUNT_RANGE)
	);
	if (pool.length === 0) return [];
	const ids = pool.map(image => image.assetId);
	if (settings.order === 'setlist-reverse') {
		return ids.slice(Math.max(0, ids.length - count)).reverse();
	}
	return ids.slice(0, count);
}

/**
 * How far a piece is mounted this frame, in `0..1`.
 *
 * `1` for the whole hold; it ramps up during the build in mount order and back
 * down during the release in the reverse order, so the last thing to appear is
 * the first thing to go.
 */
export function resolveSlotMount(
	settings: IntroSequenceSettings,
	progress: number,
	slot: IntroMountSlot
): number {
	const index = INTRO_MOUNT_ORDER.indexOf(slot);
	const count = INTRO_MOUNT_ORDER.length;
	const build = clampRange(settings.buildPct, INTRO_PHASE_RANGE);
	const release = clampRange(settings.releasePct, INTRO_PHASE_RANGE);
	const p = clamp01(progress);
	if (p < build) return staggered(p / build, index, count);
	if (p > 1 - release) {
		// `closing` counts DOWN from 1 to 0, so the piece with the highest
		// index reaches zero first: the last thing mounted is the first to go.
		const closing = (1 - p) / release;
		return staggered(closing, index, count);
	}
	return 1;
}

/**
 * How opaque the backdrop that hides the project is.
 *
 * The two windows are not symmetric here, and on purpose: an intro must own
 * the screen from the very first frame and hand the project over at the end,
 * while an ending has to rise out of the project and then keep the screen,
 * because there is nothing after it.
 */
export function resolveIntroBackdropAlpha(
	kind: IntroSequenceKind,
	settings: IntroSequenceSettings,
	progress: number
): number {
	const p = clamp01(progress);
	if (kind === 'intro') {
		const release = clampRange(settings.releasePct, INTRO_PHASE_RANGE);
		// The backdrop is the last thing to go, so nothing is still on screen
		// when the project appears underneath.
		const tail = release * 0.45;
		if (p <= 1 - tail) return 1;
		return easeInOut((1 - p) / tail);
	}
	const build = clampRange(settings.buildPct, INTRO_PHASE_RANGE);
	const head = build * 0.45;
	if (p >= head) return 1;
	return easeInOut(p / head);
}

/**
 * Where every card sits this frame. Cards with `alpha <= 0` are returned too,
 * so the painter can decide cheaply and the layout stays easy to reason about.
 */
export function resolveIntroCards(options: {
	montage: IntroMontageMode;
	count: number;
	viewport: IntroViewport;
	/** The `cards` slot mount — `1` through the hold. */
	mount: number;
	/** The window's own progress, for motion that continues through the hold. */
	progress: number;
}): IntroCard[] {
	const { montage, viewport, mount, progress } = options;
	const total = Math.max(1, Math.round(options.count));
	const { width, height } = viewport;
	const cards: IntroCard[] = [];
	const m = clamp01(mount);
	const p = clamp01(progress);

	/** Grid geometry shared by the two mosaics. */
	const columns = Math.ceil(Math.sqrt(total));
	const rows = Math.ceil(total / columns);

	switch (montage) {
		case 'mosaic-grid': {
			// Every image at once, as asked: the whole wall arrives together
			// and breathes as one piece.
			const eased = easeInOut(m);
			const cellW = width / columns;
			const cellH = height / rows;
			for (let index = 0; index < total; index += 1) {
				const column = index % columns;
				const row = Math.floor(index / columns);
				cards.push({
					index,
					x: cellW * (column + 0.5),
					y: cellH * (row + 0.5),
					width: cellW,
					height: cellH,
					alpha: eased,
					// A slow push that never stops, so the wall is alive even
					// while nothing is mounting.
					scale: 1.08 - 0.06 * eased + 0.04 * p,
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'mosaic-burst': {
			// The same mosaic, landing from the middle outwards.
			const cellW = width / columns;
			const cellH = height / rows;
			const centreCol = (columns - 1) / 2;
			const centreRow = (rows - 1) / 2;
			const ranked = Array.from({ length: total }, (_, index) => {
				const column = index % columns;
				const row = Math.floor(index / columns);
				return {
					index,
					distance: Math.hypot(column - centreCol, row - centreRow)
				};
			}).sort((a, b) => a.distance - b.distance);
			ranked.forEach((entry, rank) => {
				const t = easeInOut(staggered(m, rank, total));
				const column = entry.index % columns;
				const row = Math.floor(entry.index / columns);
				cards.push({
					index: entry.index,
					x: cellW * (column + 0.5),
					y: cellH * (row + 0.5),
					width: cellW,
					height: cellH,
					alpha: t,
					scale: 1.18 - 0.16 * t,
					rotationRad: 0
				});
			});
			cards.sort((a, b) => a.index - b.index);
			return cards;
		}
		case 'film-strip': {
			// A strip that crosses the screen for the whole window; mounting
			// only fades it in, because a filmstrip does not dissolve.
			const across = Math.max(2, Math.min(total, 5));
			const cardW = (width * 0.92) / across;
			const cardH = (cardW * 9) / 16;
			const pitch = cardW * 1.04;
			const drift = (0.5 - p) * pitch * total * 0.55;
			for (let index = 0; index < total; index += 1) {
				const t = easeInOut(staggered(m, index, total));
				cards.push({
					index,
					x: width / 2 + (index - (total - 1) / 2) * pitch + drift,
					y: height / 2,
					width: cardW,
					height: cardH,
					alpha: t,
					scale: 1,
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'shutter-wipe': {
			// Vertical panels sliding in from alternating edges.
			const panelW = width / total;
			for (let index = 0; index < total; index += 1) {
				const t = easeInOut(staggered(m, index, total));
				const fromTop = index % 2 === 0;
				const travel = height * (1 - t);
				cards.push({
					index,
					x: panelW * (index + 0.5),
					y: height / 2 + (fromTop ? -travel : travel),
					width: panelW,
					height,
					alpha: 1,
					scale: 1,
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'ken-burns': {
			// One image at a time with a slow push, cinema-style. The push runs
			// on the window's own progress so it never freezes during the hold.
			for (let index = 0; index < total; index += 1) {
				const t = staggered(m, index, total);
				const eased = easeInOut(t);
				const next =
					index + 1 < total ? staggered(m, index + 1, total) : 0;
				const drift = (p * total - index) * 0.06;
				cards.push({
					index,
					x: width / 2 + width * 0.02 * Math.sin(index * 1.7),
					y: height / 2,
					width,
					height,
					alpha: eased * (1 - easeInOut(next)),
					scale: 1.22 - 0.18 * clamp01(drift + eased * 0.4),
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'glitch-cut': {
			// Hard cuts with a sliced offset. Deterministic in `progress`, so
			// the file and the preview glitch on exactly the same frames.
			for (let index = 0; index < total; index += 1) {
				const t = staggered(m, index, total);
				const next =
					index + 1 < total ? staggered(m, index + 1, total) : 0;
				const live =
					t >= 1 && next < 1 ? 1 : t > 0 && next <= 0 ? t : 0;
				const shake = Math.sin(p * 97 + index * 13);
				cards.push({
					index,
					x: width / 2 + (live > 0 ? shake * width * 0.012 : 0),
					y: height / 2,
					width,
					height,
					// A cut, not a dissolve: full on or fully out.
					alpha: live > 0.5 ? 1 : 0,
					scale: 1.04 + (live > 0 ? Math.abs(shake) * 0.02 : 0),
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'fade-stack':
		default: {
			for (let index = 0; index < total; index += 1) {
				const t = staggered(m, index, total);
				const eased = easeInOut(t);
				// Only the card on top of the stack is visible: it fades in,
				// holds, and is covered by the next one. The top card has
				// nothing covering it, so it holds.
				const next =
					index + 1 < total ? staggered(m, index + 1, total) : 0;
				cards.push({
					index,
					x: width / 2,
					y: height / 2,
					width,
					height,
					alpha: eased * (1 - easeInOut(next)),
					scale: 1.06 - 0.06 * eased,
					rotationRad: 0
				});
			}
			return cards;
		}
	}
}

/**
 * How far a line of text is revealed.
 *
 * `typewriter` is the one the user asked for by name: letters are added one by
 * one while the line mounts and taken away one by one while it goes, which the
 * same `visibleChars` expression gives for free because `mount` runs back down
 * to zero during the release.
 */
export function resolveIntroTextFrame(
	reveal: IntroTextReveal,
	mount: number,
	charCount: number
): IntroTextFrame {
	const m = clamp01(mount);
	const chars = Math.max(0, Math.round(charCount));
	const base: IntroTextFrame = {
		alpha: 1,
		visibleChars: chars,
		offsetEm: 0,
		scale: 1,
		wipePct: 1
	};
	switch (reveal) {
		case 'typewriter':
			return {
				...base,
				visibleChars: Math.round(m * chars),
				alpha: m > 0 ? 1 : 0
			};
		case 'rise':
			return { ...base, alpha: m, offsetEm: (1 - easeInOut(m)) * 0.7 };
		case 'pop':
			return { ...base, alpha: m, scale: 0.62 + 0.38 * easeInOut(m) };
		case 'wipe':
			return { ...base, wipePct: easeInOut(m), alpha: m > 0 ? 1 : 0 };
		case 'fade':
		default:
			return { ...base, alpha: m };
	}
}

/** Everything the painter needs about this frame, and nothing about colour. */
export function resolveIntroFrame(options: {
	kind: IntroSequenceKind;
	settings: IntroSequenceSettings;
	progress: number;
	viewport: IntroViewport;
	/** How many images the montage actually has. */
	cardCount: number;
}): IntroFrame {
	const { kind, settings, viewport, cardCount } = options;
	const progress = clamp01(options.progress);
	const mountOf = (slot: IntroMountSlot) =>
		resolveSlotMount(settings, progress, slot);

	const spectrumMount = mountOf('spectrum');
	const logoMount = mountOf('logo');
	const titleMount = mountOf('title');
	const titleFrameMount = mountOf('titleFrame');
	const taglineMount = mountOf('tagline');

	const title = settings.titleEnabled && settings.titleText.length > 0;
	const tagline = settings.taglineEnabled && settings.taglineText.length > 0;

	return {
		kind,
		progress,
		backdropAlpha: resolveIntroBackdropAlpha(kind, settings, progress),
		imageDim: clamp01(settings.imageDim),
		cards: resolveIntroCards({
			montage: settings.montage,
			count: cardCount,
			viewport,
			mount: mountOf('cards'),
			progress
		}),
		spectrum:
			settings.spectrumSource === 'none' ||
			settings.spectrumSlotIndex < 0 ||
			spectrumMount <= 0
				? null
				: {
						slotIndex: Math.round(settings.spectrumSlotIndex),
						centered: settings.spectrumCentered,
						mount: spectrumMount,
						alpha: clamp01(spectrumMount * 1.4),
						waveSpeed: clampRange(
							settings.spectrumWaveSpeed,
							INTRO_WAVE_SPEED_RANGE
						),
						waveIntensity: clampRange(
							settings.spectrumWaveIntensity,
							INTRO_WAVE_INTENSITY_RANGE
						)
					},
		logo:
			settings.logoSource === 'none' || logoMount <= 0
				? null
				: {
						source: settings.logoSource,
						sizePct: clampRange(
							settings.logoSizePct,
							INTRO_LOGO_SIZE_RANGE
						),
						alpha: clamp01(logoMount),
						scale: 0.8 + 0.2 * easeInOut(logoMount)
					},
		title: title
			? {
					text: settings.titleText,
					sizePct: clampRange(
						settings.titleSizePct,
						INTRO_TITLE_SIZE_RANGE
					),
					frame: resolveIntroTextFrame(
						settings.titleReveal,
						titleMount,
						settings.titleText.length
					)
				}
			: null,
		titleFrame:
			title && settings.titleFrameEnabled && titleFrameMount > 0
				? {
						alpha: clamp01(titleFrameMount),
						widthPct: easeInOut(titleFrameMount)
					}
				: null,
		tagline: tagline
			? {
					text: settings.taglineText,
					sizePct: clampRange(
						settings.taglineSizePct,
						INTRO_TAGLINE_SIZE_RANGE
					),
					frame: resolveIntroTextFrame(
						settings.taglineReveal,
						taglineMount,
						settings.taglineText.length
					)
				}
			: null
	};
}
