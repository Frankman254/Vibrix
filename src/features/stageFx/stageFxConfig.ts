import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type {
	FilterTarget,
	MotionLayerSettings,
	PerformanceMode
} from '@/types/wallpaper';

// ── Shared option types ───────────────────────────────────────────────────────

/** Audio channel selector shared by Stage Lights and Camera FX. */
export type FxAudioChannel = 'kick' | 'bass' | 'full';
export type FxBandThresholds = Record<FxAudioChannel, number>;

export type SpectrumRotationDrive = 'off' | 'fixed' | 'audio' | 'fixed-audio';
/** `selected` reuses the spectrum's own `spectrumBandMode`. */
export type SpectrumRotationChannel = 'kick' | 'bass' | 'full' | 'selected';
export type RotationDirection = 'cw' | 'ccw';

export type StageLightsColorSource = 'manual' | 'theme' | 'image';
export type StageLightsBlendMode = 'lighter' | 'screen' | 'source-over';
export type StageLightsOrigin =
	| 'top'
	| 'bottom'
	| 'left'
	| 'right'
	| 'top-bottom'
	| 'sides'
	| 'all';
export type StageLightsMovementMode =
	| 'top-down'
	| 'bottom-up'
	| 'left-right'
	| 'right-left'
	| 'cross-sweep'
	| 'radial-sweep'
	| 'circular-sweep';
export type FlashLightShape =
	| 'full-screen'
	| 'circular-burst'
	| 'horizontal-blast'
	| 'vertical-blast'
	| 'center-bloom'
	| 'edge-flash'
	| 'vignette-invert';

export type CameraMotionMode =
	| 'none'
	| 'drift'
	| 'circle'
	| 'semicircle'
	| 'figure-eight'
	| 'orbit'
	| 'pendulum'
	/** The same circle in 8 discrete steps: it snaps instead of gliding. */
	| 'beat-jump'
	/** Travels the perimeter of the frame instead of orbiting its centre. */
	| 'path-trace'
	/** No translation at all — the zoom breathes. */
	| 'zoom-pulse'
	| 'lissajous'
	// ── Polygon paths ──────────────────────────────────────────────────────
	// «poner mas patrones de movimiento, como formas triangulares, cuadradas
	// etc etc». They share one generator (`polygonOffset`): the phase walks the
	// vertices and the position is the straight line between two of them, so
	// the movement has real corners instead of a rounded orbit. The square is
	// `path-trace`, which already traced exactly that.
	| 'triangle'
	| 'diamond'
	| 'pentagon'
	| 'hexagon'
	| 'star'
	/** A horizontal sweep with a saw on top — a ribbon, not a loop. */
	| 'zigzag'
	/** The circle with a radius that breathes: it winds in and back out. */
	| 'spiral';
export type CameraMotionDirection = 'cw' | 'ccw';
export type CameraMotionDrive = 'fixed' | 'audio' | 'fixed-audio';
/**
 * `spectrum-2` has no `FilterTarget` twin on purpose: the filter stack still
 * treats both spectrums as one target, while the camera can move them apart
 * (they are drawn on two separate canvas roots when this target is in use).
 */
export type CameraMotionTarget =
	| FilterTarget
	| 'stage-lights'
	| 'flash-light'
	| 'spectrum-2';
export type CameraMotionLayer = CameraMotionTarget;
export type ScreenShakeMode =
	| 'horizontal'
	| 'vertical'
	| 'free'
	| 'punch'
	| 'jitter'
	| 'kick-snap';

// ── Performance / safety caps (Task 5) ─────────────────────────────────────────
// Hard ceilings applied regardless of slider input so these effects can never
// whiteout the screen, run unbounded blur, or tank the frame budget.

export const STAGE_FX_CAPS = {
	maxBeamCount: 16,
	/** Canvas2D shadow/filter blur ceiling — the single most expensive op. */
	maxBeamBlurPx: 72,
	maxOpacity: 1,
	/** Independent Flash Light overlay opacity ceiling. */
	maxFlashOpacity: 0.92,
	maxFlashBlurPx: 64
} as const;

/** Hard limits for the Reactive Edge Glow effect. Mirrors EDGE_GLOW_CAPS
 *  in edgeGlowDefaults.ts — keep in sync if values change. */
export const EDGE_GLOW_FX_CAPS = {
	maxBlurPx: 64,
	maxThicknessPx: 24,
	maxExpansionPx: 80,
	maxOpacity: 1
} as const;

export const CAMERA_FX_CAPS = {
	maxShakePx: 48,
	maxMotionPx: 96,
	/** Slight base zoom hides edges revealed by shake/motion translation. */
	maxScale: 1.18
} as const;

/**
 * Movement scale. The caps above are what a subtle drift needs; a logo that is
 * supposed to cross the screen with its spectrum needs more, and asking for it
 * has to widen BOTH budgets — the amplitude and the zoom slack that keeps a
 * full-bleed layer from cutting its own border into view — or the extra
 * amplitude is clamped straight back off.
 */
export const CAMERA_MOTION_RANGE_RANGE = { min: 1, max: 6 } as const;

/** The reach multiplier of a layer, clamped, with old saves reading as `1`. */
export function resolveCameraMotionRange(value: number | undefined): number {
	if (!Number.isFinite(value)) return CAMERA_MOTION_RANGE_RANGE.min;
	return Math.min(
		CAMERA_MOTION_RANGE_RANGE.max,
		Math.max(CAMERA_MOTION_RANGE_RANGE.min, value as number)
	);
}

/**
 * Edge cover zoom: how much of the automatic zoom a full-bleed layer is given
 * while it travels.
 *
 * «Movement scale esta influyendo en la escala del propio logo mas spectrum
 * cuando no deberia, lo que crece es el area de movimiento». It was: the zoom
 * that keeps a full-screen canvas from sliding its own border into view scaled
 * the DRAWN figure with it, so widening the path made the logo and its spectrum
 * grow. Now that zoom is this dial and it is **off by default** — the path
 * widens, the figure keeps its size, and a layer whose content reaches the edge
 * may show that edge, which is the trade the user asked for. Frame targets (the
 * background) are not affected: there the zoom is what stops black bars, so it
 * stays automatic and mandatory.
 */
export const CAMERA_MOTION_EDGE_ZOOM_RANGE = { min: 0, max: 1 } as const;

/** Smoothing: seconds of lag between the path and the layer that follows it. */
export const CAMERA_MOTION_SMOOTHING_RANGE = { min: 0, max: 1 } as const;

/** The longest lag the smoothing dial can ask for, in seconds. */
export const CAMERA_MOTION_SMOOTHING_MAX_SEC = 0.6;

/** Trail: how strong the halo dragged behind a moving layer is. */
export const CAMERA_MOTION_TRAIL_RANGE = { min: 0, max: 1 } as const;

/**
 * Invert on low energy: the level the movement's channel must fall below for
 * the path to run backwards. Same scale as the spectrum's radial rotation
 * invert, so a user who has tuned one already knows this one.
 */
export const CAMERA_MOTION_INVERT_THRESHOLD_RANGE = {
	min: 0,
	max: 1
} as const;

/** How long the quiet (or the return) must hold before the sign flips, in ms. */
export const CAMERA_MOTION_INVERT_HOLD_MS_RANGE = {
	min: 0,
	max: 1000
} as const;

function clampToRange(
	value: number | undefined,
	range: { min: number; max: number }
): number {
	if (!Number.isFinite(value)) return range.min;
	return Math.min(range.max, Math.max(range.min, value as number));
}

export function resolveCameraMotionEdgeZoom(value: number | undefined): number {
	return clampToRange(value, CAMERA_MOTION_EDGE_ZOOM_RANGE);
}

export function resolveCameraMotionSmoothing(
	value: number | undefined
): number {
	return clampToRange(value, CAMERA_MOTION_SMOOTHING_RANGE);
}

export function resolveCameraMotionTrail(value: number | undefined): number {
	return clampToRange(value, CAMERA_MOTION_TRAIL_RANGE);
}

export function resolveCameraMotionInvertThreshold(
	value: number | undefined
): number {
	return clampToRange(value, CAMERA_MOTION_INVERT_THRESHOLD_RANGE);
}

export function resolveCameraMotionInvertHoldMs(
	value: number | undefined
): number {
	return clampToRange(value, CAMERA_MOTION_INVERT_HOLD_MS_RANGE);
}

/**
 * Scale Stage Lights down on weaker GPUs. Returns already-capped beam counts,
 * blur, and draw-pass flags so the renderer can skip gradient/shadow work
 * entirely rather than just zeroing the blur.
 *
 * Pass budget by mode:
 *   low    — main fill only   (1 pass/beam, no haze/core/flare)
 *   medium — main+haze+core   (3 passes/beam, no flare radial gradient)
 *   high   — all 4 passes     (main+haze+core+flare)
 */
export function resolveStageLightsBudget(
	performanceMode: PerformanceMode,
	minBeamCount: number,
	maxBeamCount: number,
	blurPx: number
): {
	minBeamCount: number;
	maxBeamCount: number;
	blurPx: number;
	drawHaze: boolean;
	drawCore: boolean;
	drawFlare: boolean;
} {
	const cappedMin = Math.max(
		1,
		Math.min(STAGE_FX_CAPS.maxBeamCount, Math.round(minBeamCount))
	);
	const cappedMax = Math.max(
		cappedMin,
		1,
		Math.min(STAGE_FX_CAPS.maxBeamCount, Math.round(maxBeamCount))
	);
	const cappedBlur = Math.max(
		0,
		Math.min(STAGE_FX_CAPS.maxBeamBlurPx, blurPx)
	);
	if (performanceMode === 'low') {
		return {
			minBeamCount: Math.min(cappedMin, 5),
			maxBeamCount: Math.min(cappedMax, 5),
			blurPx: cappedBlur * 0.35,
			drawHaze: false,
			drawCore: false,
			drawFlare: false
		};
	}
	if (performanceMode === 'medium') {
		return {
			minBeamCount: Math.min(cappedMin, 10),
			maxBeamCount: Math.min(cappedMax, 10),
			blurPx: cappedBlur * 0.7,
			drawHaze: true,
			drawCore: true,
			drawFlare: false
		};
	}
	return {
		minBeamCount: cappedMin,
		maxBeamCount: cappedMax,
		blurPx: cappedBlur,
		drawHaze: true,
		drawCore: true,
		drawFlare: true
	};
}

/**
 * Read the level for an FX audio channel from a snapshot. Returns 0 when audio
 * is silent/paused (the snapshot already reports zeros in those states), so an
 * `audio`-driven effect naturally idles to rest.
 */
export function readFxChannel(
	snapshot: AudioSnapshot,
	channel: FxAudioChannel
): number {
	if (channel === 'full') return snapshot.amplitude;
	const value = snapshot.channels[channel];
	return Number.isFinite(value) ? value : 0;
}

export function rotationDirectionSign(direction: RotationDirection): 1 | -1 {
	return direction === 'ccw' ? -1 : 1;
}

export function resolveFxThreshold(
	thresholds: Partial<FxBandThresholds> | undefined,
	channel: FxAudioChannel,
	fallback: number
): number {
	const value = thresholds?.[channel];
	const resolved =
		typeof value === 'number' && Number.isFinite(value) ? value : fallback;
	return Math.max(0.01, Math.min(0.99, resolved));
}

export function shouldTriggerFxPeak({
	level,
	previousLevel,
	threshold,
	nowMs,
	lastTriggerMs,
	retriggerMs,
	minRise = 0.035
}: {
	level: number;
	previousLevel: number;
	threshold: number;
	nowMs: number;
	lastTriggerMs: number;
	retriggerMs: number;
	minRise?: number;
}): boolean {
	return (
		level > threshold &&
		nowMs - lastTriggerMs >= retriggerMs &&
		(previousLevel <= threshold || level - previousLevel >= minRise)
	);
}

/**
 * Targets that ARE the frame: translating them uncovers the background behind
 * the composition, so the offset has to stay inside the zoom slack.
 */
const FRAME_TARGETS: readonly CameraMotionTarget[] = [
	'global-background',
	'background',
	'selected-overlay'
];

/**
 * Targets drawn on a canvas the size of the viewport whose content reaches the
 * edges — a spectrum spans the full width, rain falls across it, lyrics sit at
 * the bottom. Translating that canvas slides its own border into view and the
 * content is cut off along a straight line (the bug the user caught on the
 * right-hand side of Spectrum 2). They get the same zoom trick as the frame,
 * only sized to keep the whole amplitude usable instead of halving it.
 */
const FULL_BLEED_TARGETS: readonly CameraMotionTarget[] = [
	'spectrum',
	'spectrum-2',
	'particles',
	'rain',
	'track-title',
	'lyrics',
	'stage-lights',
	'flash-light'
];

/**
 * How much room a layer needs before it can translate.
 *
 * - `frame`  — zoom just enough to cover the uncovered edge, clamp hard.
 * - `full-bleed` — zoom enough that the full amplitude never cuts the canvas.
 * - `free`   — nothing to expose (a logo sliding 96px reveals nothing).
 */
export type CameraMotionSlackMode = 'frame' | 'full-bleed' | 'free';

export function cameraMotionSlackMode(
	targets: readonly CameraMotionTarget[]
): CameraMotionSlackMode {
	if (targets.some(target => FRAME_TARGETS.includes(target))) return 'frame';
	if (targets.some(target => FULL_BLEED_TARGETS.includes(target)))
		return 'full-bleed';
	return 'free';
}

/**
 * The largest translation a movement can ever ask for, in pixels.
 *
 * This is the ceiling the SETTINGS allow, not the live position, and that is
 * the point: a layer that has to exist beyond the frame so the camera never
 * slides its own boundary into view needs a margin that stays put while the
 * movement runs. Sized from the live offset it would resize its drawing area
 * every frame — reseeding a particle field sixty times a second.
 *
 * `zoom-pulse` never translates, so it exposes no boundary and needs none.
 */
export function cameraMotionMaxOffsetPx(
	settings: Pick<
		MotionLayerSettings,
		| 'cameraMotionMode'
		| 'cameraMotionAmount'
		| 'cameraMotionRange'
		| 'cameraMotionAmplitudeAudio'
	>
): number {
	if (
		settings.cameraMotionMode === 'none' ||
		settings.cameraMotionMode === 'zoom-pulse'
	) {
		return 0;
	}
	const amount = Math.min(1.5, Math.max(0, settings.cameraMotionAmount));
	const range = resolveCameraMotionRange(settings.cameraMotionRange);
	const audio = Math.max(0, settings.cameraMotionAmplitudeAudio);
	return CAMERA_FX_CAPS.maxMotionPx * amount * range * (1 + audio);
}

export function cameraMotionTargetIncludes(
	targets: CameraMotionTarget[] | CameraMotionTarget,
	layer: CameraMotionLayer
): boolean {
	const list = Array.isArray(targets) ? targets : [targets];
	return list.includes(layer);
}

// ── Lightweight Stage FX diagnostics ────────────────────────────────────────
// Written by renderers each frame; read by diagnostics HUD on demand.
// No allocations — plain mutable struct updated in-place.

const _stageFxDiag = {
	stageLights: {
		drawing: false,
		beams: 0,
		passes: 0,
		mode: 'high' as PerformanceMode
	},
	flash: { active: false, drive: 0 },
	cameraMotionActive: false,
	cameraShakeActive: false
};

export function updateStageLightsDiag(
	drawing: boolean,
	beams: number,
	passes: number,
	mode: PerformanceMode
): void {
	_stageFxDiag.stageLights.drawing = drawing;
	_stageFxDiag.stageLights.beams = drawing ? beams : 0;
	_stageFxDiag.stageLights.passes = drawing ? passes : 0;
	_stageFxDiag.stageLights.mode = mode;
}

export function updateFlashDiag(active: boolean, drive: number): void {
	_stageFxDiag.flash.active = active;
	_stageFxDiag.flash.drive = drive;
}

export function updateCameraFxDiag(
	motionActive: boolean,
	shakeActive: boolean
): void {
	_stageFxDiag.cameraMotionActive = motionActive;
	_stageFxDiag.cameraShakeActive = shakeActive;
}

/** Read-only snapshot of the current Stage FX diagnostic state. */
export function getStageFxDiagnostics(): Readonly<typeof _stageFxDiag> {
	return _stageFxDiag;
}
