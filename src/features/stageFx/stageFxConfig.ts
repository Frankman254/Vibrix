import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { FilterTarget, PerformanceMode } from '@/types/wallpaper';

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
	| 'lissajous';
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
 * Targets that fill the frame, so translating them exposes the edge and the
 * offset has to stay inside the zoom slack. Everything else floats over the
 * composition and can use the full amplitude — a logo sliding 96px reveals
 * nothing.
 */
const EDGE_BOUND_TARGETS: readonly CameraMotionTarget[] = [
	'global-background',
	'background',
	'selected-overlay'
];

/** True when a layer must stay conservative because it moves the frame itself. */
export function cameraMotionIsEdgeBound(
	targets: readonly CameraMotionTarget[]
): boolean {
	return targets.some(target => EDGE_BOUND_TARGETS.includes(target));
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
