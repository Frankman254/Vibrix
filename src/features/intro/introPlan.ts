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
	IntroDivisionPattern,
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
import {
	INTRO_DIVISION_ANGLE_RANGE,
	resolveIntroDivisions,
	type IntroDivisionCell,
	type Point as DivisionPoint
} from './introDivisions';

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
	/**
	 * The EFFECTIVE duration of this window in seconds — what the user asked
	 * for, clamped to half the track. Every "in seconds" setting is resolved
	 * against this, so a window that had to shrink still keeps its shape.
	 */
	durationSec: number;
};

export type IntroViewport = { width: number; height: number };

export type IntroDivisionPoint = DivisionPoint;

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
	/**
	 * The clip outline, in pixels relative to (`x`, `y`). Absent means "the
	 * card's own box", which is what the non-tiled montages want.
	 */
	polygon?: IntroDivisionPoint[];
	/**
	 * A wipe INSIDE the clip: `pct` of the cell is uncovered, growing from the
	 * top edge or the bottom one. The shutter uses it so a panel can arrive
	 * without opening a hole where it has not arrived yet — a moving card would
	 * drag its own clip along and show the backdrop through the gap.
	 */
	reveal?: { pct: number; fromTop: boolean };
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
export const INTRO_PHASE_SEC_RANGE = { min: 0.2, max: 10 } as const;
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
		// Long enough that the montage reads as an animation instead of a
		// flash: the first version ran nine images through a 1.5 s build.
		durationSec: intro ? 8 : 8,
		buildSec: 2.5,
		releaseSec: 2.5,

		montage: intro ? 'mosaic-grid' : 'mosaic-burst',
		divisionPattern: 'grid',
		divisionAngleDeg: 0,
		imageSourceMode: 'setlist',
		imageAssetIds: [],
		imageCount: intro ? 9 : 9,
		order: intro ? 'setlist' : 'setlist-reverse',
		backdropColorSource: 'manual',
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
			elapsedSec: Math.max(0, timeSec),
			durationSec: introSec
		};
	}
	if (outroSec > 0) {
		const startSec = Math.max(introSec, totalSec - outroSec);
		if (timeSec >= startSec) {
			const span = Math.max(0.001, totalSec - startSec);
			return {
				kind: 'outro',
				progress: clamp01((timeSec - startSec) / span),
				elapsedSec: Math.max(0, timeSec - startSec),
				durationSec: span
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
	if (settings.imageSourceMode === 'manual') {
		// The user's own list, in the user's own order. Ids that are no longer
		// in the collection are dropped instead of drawing a hole, and the cap
		// is the same one the automatic mode obeys.
		const available = new Set(ids);
		return settings.imageAssetIds
			.filter(assetId => available.has(assetId))
			.slice(0, INTRO_IMAGE_COUNT_RANGE.max);
	}
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
/** The three sections of a window, in seconds and as shares of it. */
export type IntroPhases = {
	totalSec: number;
	buildSec: number;
	holdSec: number;
	releaseSec: number;
	/** The same three as shares of the window, which is what the math wants. */
	buildPct: number;
	holdPct: number;
	releasePct: number;
};

/**
 * Split a window into mount / hold / dismount.
 *
 * `totalSec` is the EFFECTIVE duration (a window is clamped to half the track),
 * so asking for 8 s on a 10 s track gives 5 s here and the three sections shrink
 * together instead of the dismount being cut off mid-animation.
 */
export function resolveIntroPhases(
	settings: IntroSequenceSettings,
	totalSec?: number
): IntroPhases {
	const total = Math.max(
		0.01,
		totalSec ?? clampRange(settings.durationSec, INTRO_DURATION_RANGE)
	);
	let build = clampRange(settings.buildSec, INTRO_PHASE_SEC_RANGE);
	let release = clampRange(settings.releaseSec, INTRO_PHASE_SEC_RANGE);
	const wanted = build + release;
	if (wanted > total) {
		// Proportional, so a window that no longer fits keeps the shape the
		// user gave it instead of losing its ending.
		const factor = total / wanted;
		build *= factor;
		release *= factor;
	}
	const hold = Math.max(0, total - build - release);
	return {
		totalSec: total,
		buildSec: build,
		holdSec: hold,
		releaseSec: release,
		buildPct: build / total,
		holdPct: hold / total,
		releasePct: release / total
	};
}

export function resolveSlotMount(
	settings: IntroSequenceSettings,
	progress: number,
	slot: IntroMountSlot,
	totalSec?: number
): number {
	const index = INTRO_MOUNT_ORDER.indexOf(slot);
	const count = INTRO_MOUNT_ORDER.length;
	const phases = resolveIntroPhases(settings, totalSec);
	const build = phases.buildPct;
	const release = phases.releasePct;
	const p = clamp01(progress);
	if (build <= 0 && release <= 0) return 1;
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
	progress: number,
	totalSec?: number
): number {
	const p = clamp01(progress);
	const phases = resolveIntroPhases(settings, totalSec);
	if (kind === 'intro') {
		const release = phases.releasePct;
		// The backdrop is the last thing to go, so nothing is still on screen
		// when the project appears underneath.
		const tail = release * 0.45;
		if (p <= 1 - tail) return 1;
		return easeInOut((1 - p) / tail);
	}
	const build = phases.buildPct;
	const head = build * 0.45;
	if (p >= head) return 1;
	return easeInOut(p / head);
}

/** One image's turn inside a sequential montage. */
type SequentialSlice = {
	/** 0..1 through this image's own turn. */
	t: number;
	/** Its opacity, crossfading with the neighbouring turns. */
	alpha: number;
	/** Whether this image is the one on screen right now (hard cuts). */
	live: boolean;
};

/**
 * Split the WHOLE window into `total` equal turns and report where `progress`
 * falls inside image `index`'s turn.
 *
 * This is the fix for "la animación pasa muy rápido": the montage used to cycle
 * on the mount envelope, which only runs during the build, so every image got a
 * third of a third of the window. A turn is now `1 / total` of the window.
 */
function sequentialSlice(
	progress: number,
	index: number,
	total: number
): SequentialSlice {
	const span = 1 / Math.max(1, total);
	const local = (clamp01(progress) - index * span) / span;
	const fade = 0.22;
	if (local <= -fade || local >= 1 + fade) {
		return { t: clamp01(local), alpha: 0, live: false };
	}
	const rampIn = local < 0 ? easeInOut(1 + local / fade) : 1;
	// The last image keeps the screen: there is nothing to hand over to.
	const isLast = index === total - 1;
	const rampOut =
		local > 1 && !isLast ? easeInOut(1 - (local - 1) / fade) : 1;
	return {
		t: clamp01(local),
		alpha: Math.min(rampIn, rampOut),
		live: local >= 0 && (local < 1 || isLast)
	};
}

/**
 * Where every card sits this frame. Cards with `alpha <= 0` are returned too,
 * so the painter can decide cheaply and the layout stays easy to reason about.
 */
export function resolveIntroCards(options: {
	montage: IntroMontageMode;
	/** The shape of the cuts; the tiled montages build their cells from it. */
	pattern?: IntroDivisionPattern;
	angleDeg?: number;
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
	/**
	 * The tiling, built once and shared by the montages that cut the screen up.
	 * Cells always cover the whole viewport, which is what keeps the backdrop
	 * from showing through between the images.
	 */
	const cells = (): IntroDivisionCell[] =>
		resolveIntroDivisions({
			pattern: options.pattern ?? 'grid',
			count: total,
			viewport,
			angleDeg: clampRange(
				options.angleDeg ?? 0,
				INTRO_DIVISION_ANGLE_RANGE
			)
		});
	const fromCell = (cell: IntroDivisionCell) => ({
		index: cell.index,
		x: cell.x,
		y: cell.y,
		width: cell.width,
		height: cell.height,
		polygon: cell.polygon
	});
	// Sequential montages use the mount only as a global fade, because their
	// image cycling belongs to the whole window (see `sequentialSlice`).
	const envelope = easeInOut(m);

	switch (montage) {
		case 'mosaic-grid': {
			// Every image at once, as asked: the whole wall arrives together
			// and breathes as one piece.
			const eased = easeInOut(m);
			for (const cell of cells()) {
				cards.push({
					...fromCell(cell),
					alpha: eased,
					// A slow push that never stops, so the wall is alive even
					// while nothing is mounting. It never drops below 1: a card
					// smaller than its cell would uncover the backdrop.
					scale: 1.08 - 0.06 * eased + 0.04 * p,
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'mosaic-burst': {
			// The same tiling, landing from the middle outwards: the cells
			// nearest the centre of the screen are ranked first.
			const cx = width / 2;
			const cy = height / 2;
			const ranked = cells()
				.map(cell => ({
					cell,
					distance: Math.hypot(cell.x - cx, cell.y - cy)
				}))
				.sort((a, b) => a.distance - b.distance);
			ranked.forEach((entry, rank) => {
				const t = easeInOut(staggered(m, rank, total));
				cards.push({
					...fromCell(entry.cell),
					alpha: t,
					scale: 1.18 - 0.16 * t,
					rotationRad: 0
				});
			});
			cards.sort((a, b) => a.index - b.index);
			return cards;
		}
		case 'film-strip': {
			// A big carousel crossing the screen for the whole window; mounting
			// only fades it in, because a filmstrip does not dissolve.
			//
			// The strip is as tall as the screen and its cards touch, so there
			// is never a black gap: what travels is the whole strip, from "left
			// edge aligned" to "right edge aligned", over the window's own
			// progress. Sizing cards to fit N across turned the montage into a
			// contact sheet of thumbnails, and leaving a pitch bigger than the
			// card left black bars between them.
			const cardW = Math.max(width * 0.55, width / total);
			const stripW = cardW * total;
			const travel = Math.max(0, stripW - width);
			const offsetX = -travel * p;
			for (let index = 0; index < total; index += 1) {
				const t = easeInOut(staggered(m, index, total));
				cards.push({
					index,
					x: offsetX + cardW * (index + 0.5),
					y: height / 2,
					width: cardW,
					height,
					alpha: t,
					scale: 1,
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'shutter-wipe': {
			// Panels wiping in from alternating edges. The wipe happens INSIDE
			// the cell (`reveal`) instead of sliding the cell itself: a moving
			// cell drags its clip along and the backdrop shows through the gap,
			// which is exactly the black the user reported.
			for (const cell of cells()) {
				const t = easeInOut(staggered(m, cell.index, total));
				cards.push({
					...fromCell(cell),
					alpha: 1,
					scale: 1,
					rotationRad: 0,
					reveal: { pct: t, fromTop: cell.index % 2 === 0 }
				});
			}
			return cards;
		}
		case 'ken-burns': {
			// One image at a time with a slow push, cinema-style. The cycling
			// runs on the WINDOW, not on the mount envelope: nine images inside
			// a 30 % build meant a sixth of a second each, which read as a
			// flicker instead of a push. The envelope only fades the montage in
			// and out.
			for (let index = 0; index < total; index += 1) {
				const slice = sequentialSlice(p, index, total);
				if (slice.alpha <= 0) continue;
				cards.push({
					index,
					x: width / 2 + width * 0.02 * Math.sin(index * 1.7),
					y: height / 2,
					width,
					height,
					alpha: slice.alpha * envelope,
					// A full push across the image's own turn, so the movement
					// is visible however many images there are.
					scale: 1.18 - 0.18 * easeInOut(slice.t),
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'glitch-cut': {
			// Hard cuts with a sliced offset, one image per slice of the whole
			// window. Deterministic in `progress`, so the file and the preview
			// glitch on exactly the same frames.
			for (let index = 0; index < total; index += 1) {
				const slice = sequentialSlice(p, index, total);
				if (!slice.live) continue;
				const shake = Math.sin(p * 97 + index * 13);
				cards.push({
					index,
					x: width / 2 + shake * width * 0.012,
					y: height / 2,
					width,
					height,
					// A cut, not a dissolve: full on for its whole turn.
					alpha: envelope,
					scale: 1.04 + Math.abs(shake) * 0.02,
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'fade-stack':
		default: {
			// One image per slice of the whole window, crossfading into the
			// next. Only the card whose turn it is (and the one handing over to
			// it) is returned, so the stack is cheap to paint.
			for (let index = 0; index < total; index += 1) {
				const slice = sequentialSlice(p, index, total);
				if (slice.alpha <= 0) continue;
				cards.push({
					index,
					x: width / 2,
					y: height / 2,
					width,
					height,
					alpha: slice.alpha * envelope,
					scale: 1.06 - 0.06 * easeInOut(slice.t),
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
	/** The window's effective duration; omit to use the configured one. */
	durationSec?: number;
}): IntroFrame {
	const { kind, settings, viewport, cardCount } = options;
	const progress = clamp01(options.progress);
	const totalSec = options.durationSec;
	const mountOf = (slot: IntroMountSlot) =>
		resolveSlotMount(settings, progress, slot, totalSec);

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
		backdropAlpha: resolveIntroBackdropAlpha(
			kind,
			settings,
			progress,
			totalSec
		),
		imageDim: clamp01(settings.imageDim),
		cards: resolveIntroCards({
			montage: settings.montage,
			pattern: settings.divisionPattern,
			angleDeg: settings.divisionAngleDeg,
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
