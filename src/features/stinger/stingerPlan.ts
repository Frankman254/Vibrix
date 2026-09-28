/**
 * The video intro and ending, planned as pure math.
 *
 * The idea is the user's: the system BUILDS them out of the images of the
 * selected setlist and renders them "as if they were images", in the setlist's
 * own order, each with its own duration. So neither is a separate clip — both
 * are a window on the same timeline. The intro owns the first `durationSec`
 * seconds, the ending the last ones, and in between the project plays exactly
 * as it does today. Nothing is added to the video's length, so the audio stays
 * in sync and nothing downstream has to learn about a new clock.
 *
 * Everything here is pure and deterministic in the frame time, which is what
 * lets the live preview and the offline export agree frame for frame.
 */
import type {
	StingerKind,
	StingerSettings,
	StingerStyle,
	WallpaperState
} from '@/types/wallpaper';

export type StingerState = Pick<
	WallpaperState,
	'introStinger' | 'outroStinger'
>;

/** The window a frame falls in, with its progress in `0..1`. */
export type StingerWindow = {
	kind: StingerKind;
	progress: number;
};

export type StingerViewport = { width: number; height: number };

/**
 * One image of the montage, placed in viewport pixels. `x`/`y` are the CENTRE
 * so a rotation is a rotation about the card and not about the corner.
 */
export type StingerCard = {
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

export const STINGER_DURATION_RANGE = { min: 0.5, max: 20 } as const;
export const STINGER_IMAGE_COUNT_RANGE = { min: 1, max: 12 } as const;

export function createDefaultStinger(kind: StingerKind): StingerSettings {
	return {
		enabled: false,
		durationSec: kind === 'intro' ? 4 : 5,
		style: kind === 'intro' ? 'fade-stack' : 'grid-reveal',
		imageCount: kind === 'intro' ? 4 : 6,
		order: kind === 'intro' ? 'setlist' : 'setlist-reverse'
	};
}

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Smooth ease-in-out, so a card never starts or stops on a hard edge. */
export function easeInOut(t: number): number {
	const x = clamp01(t);
	return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
}

function effectiveDuration(
	settings: StingerSettings,
	totalSec: number
): number {
	if (!settings.enabled) return 0;
	const wanted = Math.max(
		STINGER_DURATION_RANGE.min,
		Math.min(STINGER_DURATION_RANGE.max, settings.durationSec)
	);
	// A window can never eat more than half the video: on a very short track
	// the intro and the ending must still both fit, and neither may swallow the
	// project entirely.
	return Math.min(wanted, Math.max(0, totalSec / 2));
}

/**
 * Which window `timeSec` falls in, or `null` for "the project plays normally".
 *
 * The intro owns the head and the ending the tail. They are clamped against
 * each other so they can never overlap, whatever the track length.
 */
export function resolveStingerWindow(
	state: StingerState,
	timeSec: number,
	totalSec: number
): StingerWindow | null {
	if (!(totalSec > 0)) return null;
	const introSec = effectiveDuration(state.introStinger, totalSec);
	const outroSec = effectiveDuration(state.outroStinger, totalSec);
	if (introSec > 0 && timeSec < introSec) {
		return { kind: 'intro', progress: clamp01(timeSec / introSec) };
	}
	if (outroSec > 0) {
		const startSec = Math.max(introSec, totalSec - outroSec);
		if (timeSec >= startSec) {
			const span = Math.max(0.001, totalSec - startSec);
			return {
				kind: 'outro',
				progress: clamp01((timeSec - startSec) / span)
			};
		}
	}
	return null;
}

/**
 * The asset ids the montage shows, in the order it shows them.
 *
 * The pool arrives already filtered to the active setlist and in setlist order
 * (`resolveSlideshowPool`), which is the whole point: the intro is made of the
 * set's own images, in the order the user arranged them. The intro takes them
 * from the front, the ending — with the default reverse order — from the back,
 * so a set closes on the images it ends with.
 */
export function pickStingerImages(
	pool: readonly { assetId: string }[],
	settings: StingerSettings
): string[] {
	const count = Math.max(
		STINGER_IMAGE_COUNT_RANGE.min,
		Math.min(STINGER_IMAGE_COUNT_RANGE.max, Math.round(settings.imageCount))
	);
	if (pool.length === 0) return [];
	const ids = pool.map(image => image.assetId);
	if (settings.order === 'setlist-reverse') {
		return ids.slice(Math.max(0, ids.length - count)).reverse();
	}
	return ids.slice(0, count);
}

/**
 * How opaque the backdrop behind the cards is.
 *
 * The window covers the project rather than blending with it — that is what
 * makes an intro read as an intro — but it opens and closes on a fade so the
 * cut into the project (and out of it) is never abrupt.
 */
export function resolveStingerBackdropAlpha(
	kind: StingerKind,
	progress: number
): number {
	const p = clamp01(progress);
	const FADE = 0.18;
	if (kind === 'intro') {
		// Opaque from the first frame; fades away into the project at the end.
		return p > 1 - FADE ? easeInOut((1 - p) / FADE) : 1;
	}
	// The ending fades up out of the project and then stays.
	return p < FADE ? easeInOut(p / FADE) : 1;
}

/**
 * Progress of card `index` inside a montage of `count` cards, in `0..1`.
 *
 * Cards overlap — a card is still settling while the next one arrives, which is
 * what keeps a montage from popping — but the LAST one finishes exactly at the
 * end of the window, so the intro never hands the project back mid-animation.
 */
function cardProgress(progress: number, index: number, count: number): number {
	const total = Math.max(1, count);
	const ramp = Math.min(0.6, 1.4 / total);
	const stagger = total > 1 ? (1 - ramp) / (total - 1) : 0;
	return clamp01((progress - index * stagger) / ramp);
}

/**
 * Where every card sits this frame. Cards with `alpha <= 0` are returned too,
 * so the painter can decide cheaply and the layout stays easy to reason about.
 */
export function resolveStingerCards(
	kind: StingerKind,
	style: StingerStyle,
	progress: number,
	count: number,
	viewport: StingerViewport
): StingerCard[] {
	const total = Math.max(1, Math.round(count));
	// The ending runs the same layouts backwards: same code, mirrored time.
	const p = kind === 'outro' ? 1 - clamp01(progress) : clamp01(progress);
	const cards: StingerCard[] = [];
	const { width, height } = viewport;

	switch (style) {
		case 'slide-strip': {
			// A filmstrip crossing the screen. Cards keep the 16:9 of a frame
			// and are sized to fit `total` of them across with a margin.
			const cardW = (width * 0.9) / Math.max(2, Math.min(total, 5));
			const cardH = (cardW * 9) / 16;
			const travel = width + cardW;
			for (let index = 0; index < total; index += 1) {
				const t = easeInOut(cardProgress(p, index, total));
				cards.push({
					index,
					x: width + cardW / 2 - travel * t,
					y: height / 2,
					width: cardW,
					height: cardH,
					// The travel itself takes the card off screen, so there is
					// nothing to fade: a filmstrip does not dissolve.
					alpha: 1,
					scale: 1,
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'grid-reveal': {
			const columns = Math.ceil(Math.sqrt(total));
			const rows = Math.ceil(total / columns);
			const cellW = width / columns;
			const cellH = height / rows;
			for (let index = 0; index < total; index += 1) {
				const t = easeInOut(cardProgress(p, index, total));
				const column = index % columns;
				const row = Math.floor(index / columns);
				cards.push({
					index,
					x: cellW * (column + 0.5),
					y: cellH * (row + 0.5),
					width: cellW,
					height: cellH,
					alpha: t,
					// Settles from slightly oversized, so the grid breathes.
					scale: 1 + 0.12 * (1 - t),
					rotationRad: 0
				});
			}
			return cards;
		}
		case 'fade-stack':
		default: {
			for (let index = 0; index < total; index += 1) {
				const t = cardProgress(p, index, total);
				const eased = easeInOut(t);
				// Only the card on top of the stack is visible: it fades in,
				// holds, and is covered by the next one.
				// The card on top has nothing covering it, so it holds.
				const next =
					index + 1 < total ? cardProgress(p, index + 1, total) : 0;
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
