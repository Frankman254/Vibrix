/**
 * Camera FX: Camera Motion (a slow path) and Screen Shake (audio-peak kicks).
 * The step (`stepCameraFx`) is shared by the live `CameraFxStage`, which
 * writes the result as CSS transforms on the marked layer roots, and the
 * offline video export, which applies it as a canvas transform per layer.
 *
 * No React, no store: callers pass the settings, the clock, the viewport size
 * (CSS pixels) and a lazy audio read, and own the runtime between frames.
 */
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { WallpaperState } from '@/types/wallpaper';
import {
	resolveMotionLayerStack,
	type MotionLayerSettings
} from './motionLayers';
import {
	createMotionAudioFollower,
	resolveMotionRate,
	stepMotionAudioFollower,
	type MotionAudioFollower
} from './motionAudioResponse';
import {
	CAMERA_FX_CAPS,
	CAMERA_MOTION_SMOOTHING_MAX_SEC,
	cameraMotionSlackMode,
	resolveCameraMotionEdgeZoom,
	resolveCameraMotionRange,
	resolveCameraMotionSmoothing,
	resolveCameraMotionTrail,
	cameraMotionTargetIncludes,
	readFxChannel,
	resolveFxThreshold,
	shouldTriggerFxPeak,
	type CameraMotionLayer
} from './stageFxConfig';

export type CameraFxSettings = Pick<
	WallpaperState,
	| 'cameraMotionEnabled'
	| 'cameraMotionMode'
	| 'cameraMotionDrive'
	| 'cameraMotionAmount'
	| 'cameraMotionRange'
	| 'cameraMotionSpeed'
	| 'cameraMotionDirection'
	| 'cameraMotionAudioChannel'
	| 'cameraMotionAudioInfluence'
	| 'cameraMotionAmplitudeAudio'
	| 'cameraMotionEdgeZoom'
	| 'cameraMotionSmoothing'
	| 'cameraMotionTrail'
	| 'cameraMotionTrailColor'
	| 'cameraMotionTargets'
	| 'motionLayers'
	| 'activeMotionLayerId'
	| 'cameraShakeEnabled'
	| 'cameraShakeAmount'
	| 'cameraShakeChannel'
	| 'cameraShakeBandThresholds'
	| 'cameraShakeThreshold'
	| 'cameraShakeRetriggerMs'
	| 'cameraShakeSensitivity'
	| 'cameraShakeDecay'
	| 'cameraShakeFrequency'
	| 'cameraShakeRoughness'
	| 'cameraShakeMode'
	| 'cameraShakeTargets'
	| 'motionPaused'
>;

/** State Camera FX carries from one frame to the next. */
export type CameraFxRuntime = {
	/**
	 * Phase per motion layer. Each layer advances at its own speed and audio
	 * drive, so one clock for all of them would make adding a layer jump the
	 * others; layers that disappear simply stop being read.
	 */
	motionTimes: Record<string, number>;
	/**
	 * Per-layer audio followers. Like the clocks above they are per layer, so
	 * two movements listening to different channels never share a brake.
	 */
	motionAudio: Record<string, MotionAudioFollower>;
	/**
	 * Per-layer smoothed offset: what the layer is actually showing, chasing
	 * the path the shape describes. The dial is the lag between the two.
	 */
	motionSmoothed: Record<string, CameraOffset>;
	/**
	 * Per-layer trailing position, always lagging further behind than the
	 * smoothed one. The gap between them IS the trail vector: it grows with
	 * speed, points where the layer came from and collapses when it stops.
	 */
	motionLag: Record<string, { tx: number; ty: number }>;
	shakeTime: number;
	shakeEnergy: number;
	lastShakeLevel: number;
	lastShakeTriggerMs: number;
	snapDirection: 1 | -1;
};

export function createCameraFxRuntime(): CameraFxRuntime {
	return {
		motionTimes: {},
		motionAudio: {},
		motionSmoothed: {},
		motionLag: {},
		shakeTime: 0,
		shakeEnergy: 0,
		lastShakeLevel: 0,
		lastShakeTriggerMs: -Infinity,
		snapDirection: 1
	};
}

/**
 * The halo a moving layer drags behind it, in CSS pixels of the viewport it
 * was stepped for. `dx`/`dy` point BACKWARDS along the movement (where the
 * layer came from), which is where the ghosts are drawn.
 */
export type CameraMotionTrail = {
	dx: number;
	dy: number;
	blur: number;
	alpha: number;
	color: string;
};

export type CameraOffset = {
	tx: number;
	ty: number;
	scale: number;
	/** `null` when the layer asks for no trail, or is not moving. */
	trail?: CameraMotionTrail | null;
};

/** How many ghosts the halo is drawn with. Three reads as a smear, not a copy. */
const TRAIL_GHOSTS = 3;

/**
 * The trail as a CSS/Canvas2D `filter` string, or `null` when there is nothing
 * to draw. Shared by the live stage (element style) and the offline export
 * (`ctx.filter`), so the halo is the same effect in both.
 *
 * `scale` converts the stepped CSS pixels into the caller's own pixels.
 */
export function cameraTrailFilter(
	trail: CameraMotionTrail | null | undefined,
	scale = 1
): string | null {
	if (!trail || trail.alpha <= 0.002) return null;
	const parts: string[] = [];
	for (let i = 1; i <= TRAIL_GHOSTS; i += 1) {
		const step = i / TRAIL_GHOSTS;
		const alpha = trail.alpha * (1 - (i - 1) / TRAIL_GHOSTS);
		if (alpha <= 0.002) continue;
		const dx = trail.dx * step * scale;
		const dy = trail.dy * step * scale;
		const blur = Math.max(0, trail.blur * step * scale);
		parts.push(
			`drop-shadow(${dx.toFixed(2)}px ${dy.toFixed(2)}px ${blur.toFixed(2)}px ${withAlpha(trail.color, alpha)})`
		);
	}
	return parts.length > 0 ? parts.join(' ') : null;
}

/** `#rrggbb` (or any CSS colour) with an explicit alpha, for the ghost stack. */
function withAlpha(color: string, alpha: number): string {
	const hex = color.trim();
	const match = /^#([0-9a-f]{6})$/i.exec(hex);
	if (!match) return hex;
	const value = parseInt(match[1], 16);
	const r = (value >> 16) & 255;
	const g = (value >> 8) & 255;
	const b = value & 255;
	return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

/** One motion layer's contribution this frame, in the same order as the stack. */
export type CameraMotionFrameEntry = {
	layerId: string;
	targets: CameraMotionLayer[];
	offset: CameraOffset;
};

/** One frame of Camera FX, in CSS pixels of the viewport it was stepped for. */
export type CameraFxFrame = {
	motionActive: boolean;
	shakeActive: boolean;
	/**
	 * Every motion layer that moves something this frame, top-down. First match
	 * wins in `resolveCameraLayerOffset`: layers never blend.
	 */
	motions: CameraMotionFrameEntry[];
	/**
	 * The top-most layer's offset, kept for callers (and diagnostics) that only
	 * ask "how much is the camera moving" without caring about which layer.
	 */
	motion: CameraOffset;
	shake: CameraOffset;
};

const IDENTITY_OFFSET: CameraOffset = { tx: 0, ty: 0, scale: 1 };

function clamp(value: number, limit: number): number {
	return Math.max(-limit, Math.min(limit, value));
}

export function isCameraFxActive(settings: CameraFxSettings): boolean {
	return settings.cameraMotionEnabled || settings.cameraShakeEnabled;
}

/** How many discrete stops `beat-jump` snaps between on its way round. */
const BEAT_JUMP_STEPS = 8;

const TAU = Math.PI * 2;

/** The phase as a 0..1 lap, negative phases included. */
function lap(phase: number): number {
	const u = (phase / TAU) % 1;
	return u < 0 ? u + 1 : u;
}

/**
 * A closed polygon path: the lap walks the vertices and the position is the
 * straight line between the two it currently sits on, so the movement holds a
 * direction and then turns a corner — «formas triangulares, cuadradas etc».
 *
 * `rotation` decides which way the shape points (a triangle on its point, a
 * square with flat sides). `innerRatio` under 1 pulls every other vertex in,
 * which is all a star is.
 */
function polygonOffset(
	phase: number,
	amp: number,
	sides: number,
	rotation: number,
	innerRatio = 1
): { tx: number; ty: number; zoom: number } {
	const count = innerRatio < 1 ? sides * 2 : sides;
	const t = lap(phase) * count;
	const index = Math.floor(t);
	const f = t - index;
	const radiusAt = (i: number) =>
		innerRatio < 1 && i % 2 === 1 ? amp * innerRatio : amp;
	const angleAt = (i: number) => rotation + ((i % count) / count) * TAU;
	const a0 = angleAt(index);
	const a1 = angleAt(index + 1);
	const r0 = radiusAt(index);
	const r1 = radiusAt(index + 1);
	const x0 = Math.cos(a0) * r0;
	const y0 = Math.sin(a0) * r0;
	const x1 = Math.cos(a1) * r1;
	const y1 = Math.sin(a1) * r1;
	return {
		tx: x0 + (x1 - x0) * f,
		ty: y0 + (y1 - y0) * f,
		zoom: 0
	};
}

/**
 * The path shape for a phase and amplitude.
 *
 * `zoom` is a 0..1 extra zoom request on top of the base scale: only
 * `zoom-pulse` uses it, and it is the reason the shapes return scale at all
 * instead of the stepper deciding it alone.
 */
function motionOffsetForMode(
	mode: MotionLayerSettings['cameraMotionMode'],
	phase: number,
	amp: number
): { tx: number; ty: number; zoom: number } {
	switch (mode) {
		case 'drift':
			return {
				tx: Math.sin(phase) * amp,
				ty: Math.cos(phase * 0.7) * amp,
				zoom: 0
			};
		case 'circle':
			return {
				tx: Math.cos(phase) * amp,
				ty: Math.sin(phase) * amp,
				zoom: 0
			};
		case 'semicircle':
			return {
				tx: Math.cos(phase) * amp,
				ty: -Math.abs(Math.sin(phase)) * amp,
				zoom: 0
			};
		case 'figure-eight':
			return {
				tx: Math.sin(phase) * amp,
				ty: Math.sin(phase * 2) * amp * 0.5,
				zoom: 0
			};
		case 'orbit':
			return {
				tx: Math.cos(phase) * amp,
				ty: Math.sin(phase) * amp * 0.58,
				zoom: 0
			};
		case 'pendulum':
			return {
				tx: Math.sin(phase) * amp,
				ty: Math.abs(Math.cos(phase)) * amp * 0.22,
				zoom: 0
			};
		case 'beat-jump': {
			// Quantised circle: the position holds still and then snaps, which
			// is what reads as "on the beat" when the speed is audio-driven.
			const step =
				(Math.floor((phase / (Math.PI * 2)) * BEAT_JUMP_STEPS) *
					(Math.PI * 2)) /
				BEAT_JUMP_STEPS;
			return {
				tx: Math.cos(step) * amp,
				ty: Math.sin(step) * amp,
				zoom: 0
			};
		}
		case 'path-trace': {
			// Around the frame instead of around its centre: the phase is a
			// position along a square perimeter, corners included.
			const u = (phase / (Math.PI * 2)) % 1;
			const p = (u < 0 ? u + 1 : u) * 4;
			if (p < 1) return { tx: (p * 2 - 1) * amp, ty: -amp, zoom: 0 };
			if (p < 2) return { tx: amp, ty: ((p - 1) * 2 - 1) * amp, zoom: 0 };
			if (p < 3) return { tx: (1 - (p - 2) * 2) * amp, ty: amp, zoom: 0 };
			return { tx: -amp, ty: (1 - (p - 3) * 2) * amp, zoom: 0 };
		}
		case 'zoom-pulse':
			// No translation on purpose: this is the one movement that does not
			// need the zoom slack, because it IS the zoom.
			return { tx: 0, ty: 0, zoom: 0.5 + 0.5 * Math.sin(phase) };
		case 'lissajous':
			return {
				tx: Math.sin(phase * 3) * amp,
				ty: Math.sin(phase * 2) * amp,
				zoom: 0
			};
		// Polygons. The rotation puts the flat side where it reads best: a
		// triangle standing on its base, a diamond on its point.
		case 'triangle':
			return polygonOffset(phase, amp, 3, -Math.PI / 2);
		case 'diamond':
			return polygonOffset(phase, amp, 4, -Math.PI / 2);
		case 'pentagon':
			return polygonOffset(phase, amp, 5, -Math.PI / 2);
		case 'hexagon':
			return polygonOffset(phase, amp, 6, -Math.PI / 2);
		case 'star':
			return polygonOffset(phase, amp, 5, -Math.PI / 2, 0.42);
		case 'zigzag': {
			// Left to right and back, sawing up and down on the way: a ribbon
			// across the frame rather than a loop around its centre.
			const u = lap(phase);
			const sweep = (u < 0.5 ? u * 4 - 1 : 3 - u * 4) * amp;
			const saw = Math.asin(Math.sin(phase * 6)) / (Math.PI / 2);
			return { tx: sweep, ty: saw * amp * 0.5, zoom: 0 };
		}
		case 'spiral': {
			// The circle with a radius that winds in and back out, so the path
			// fills the area instead of retracing one ring.
			const radius =
				amp * (0.25 + 0.75 * (0.5 - 0.5 * Math.cos(phase / 4)));
			return {
				tx: Math.cos(phase) * radius,
				ty: Math.sin(phase) * radius,
				zoom: 0
			};
		}
		default:
			return { tx: 0, ty: 0, zoom: 0 };
	}
}

/**
 * One motion layer stepped and turned into an offset.
 *
 * Two things are deliberately per layer, not global:
 *   • the clock, so adding a layer never jumps the others;
 *   • the clamp. A layer that moves the frame itself has to stay inside the
 *     zoom slack or it exposes the edge; a layer that only moves an overlay has
 *     no edge to expose and gets the full amplitude.
 */
function stepMotionLayer(
	runtime: CameraFxRuntime,
	settings: MotionLayerSettings,
	layerId: string,
	targets: readonly CameraMotionLayer[],
	snapshot: AudioSnapshot | null,
	dtSec: number,
	paused: boolean,
	viewport: { width: number; height: number }
): CameraOffset {
	const minDim = Math.max(1, Math.min(viewport.width, viewport.height));
	const level = snapshot
		? Math.max(
				0,
				readFxChannel(snapshot, settings.cameraMotionAudioChannel)
			)
		: 0;
	// The raw channel is nearly constant on mastered material; the follower is
	// what turns it into something that accelerates and brakes.
	const follower = (runtime.motionAudio[layerId] ??=
		createMotionAudioFollower());
	const shaped = paused
		? follower.value
		: stepMotionAudioFollower(follower, level, dtSec);
	// The reach multiplier: the amount dial is the movement's loudness inside
	// the path, this is how big the path itself is allowed to be.
	const range = resolveCameraMotionRange(settings.cameraMotionRange);
	const baseAmp =
		Math.min(1.5, Math.max(0, settings.cameraMotionAmount)) *
		CAMERA_FX_CAPS.maxMotionPx *
		range;
	// Audio → amplitude, independently of audio → speed: a movement can get
	// bigger without getting faster, which is what a kick actually looks like.
	// It rides the same shaped level, so the size swells on the hit instead of
	// sitting at a constant offset the whole track.
	const amp =
		baseAmp *
		(1 + Math.max(0, settings.cameraMotionAmplitudeAudio) * shaped);
	const rate = resolveMotionRate(
		settings.cameraMotionDrive,
		settings.cameraMotionSpeed,
		settings.cameraMotionAudioInfluence,
		shaped
	);
	const previous = runtime.motionTimes[layerId] ?? 0;
	const time = paused ? previous : previous + dtSec * rate;
	runtime.motionTimes[layerId] = time;
	const direction = settings.cameraMotionDirection === 'ccw' ? -1 : 1;
	const offset = motionOffsetForMode(
		settings.cameraMotionMode,
		time * direction,
		amp
	);
	const slackMode = cameraMotionSlackMode(targets);
	// `zoom-pulse` asks for its own zoom and never translates, so it needs no
	// translation slack at all.
	const translates = settings.cameraMotionMode !== 'zoom-pulse';
	const edgeZoom = resolveCameraMotionEdgeZoom(settings.cameraMotionEdgeZoom);
	// The zoom that hides the exposed edge.
	//   • frame — automatic and mandatory: without it the background uncovers
	//     black bars as it slides, which is not a look, it is a bug.
	//   • full-bleed — only what the Edge cover dial asks for, zero by default.
	//     «Movement scale esta influyendo en la escala del propio logo mas
	//     spectrum cuando no deberia»: this zoom was automatic and tied to the
	//     reach, so widening the path enlarged the figure. The reach now widens
	//     the path alone, and covering the canvas border is an opt-in.
	const slackAmp = !translates
		? 0
		: slackMode === 'frame'
			? amp
			: slackMode === 'full-bleed'
				? amp * 2 * edgeZoom
				: 0;
	// Only a frame target is clamped to its own zoom: there the zoom is what
	// keeps the edge covered, so the translation may not outrun it. A
	// full-bleed or free layer keeps the whole path it asked for.
	const bounded = slackMode === 'frame';
	// The slack ceiling grows with the reach for the same reason the amplitude
	// does: at `range` 1 this is exactly the historical cap.
	const maxScale = 1 + (CAMERA_FX_CAPS.maxScale - 1) * range;
	const scale = Math.min(
		maxScale,
		Math.max(1, 1 + slackAmp / minDim + (offset.zoom * amp) / minDim)
	);
	const limitX = bounded ? ((scale - 1) * viewport.width) / 2 : amp;
	const limitY = bounded ? ((scale - 1) * viewport.height) / 2 : amp;
	const targetTx = clamp(offset.tx, limitX);
	const targetTy = clamp(offset.ty, limitY);

	// «se ven muy bruscos los saltos»: the shape is what it is — a jump snaps,
	// a polygon turns a hard corner — so the smoothing is not in the path but
	// in how the layer follows it. The layer chases the path with a lag, which
	// rounds the corner without changing where the corner is.
	const smoothing = resolveCameraMotionSmoothing(
		settings.cameraMotionSmoothing
	);
	const shown = runtime.motionSmoothed[layerId];
	let tx = targetTx;
	let ty = targetTy;
	let appliedScale = scale;
	if (paused && shown) {
		tx = shown.tx;
		ty = shown.ty;
		appliedScale = shown.scale;
	} else if (smoothing > 0 && shown && dtSec > 0) {
		const tau = Math.max(1e-3, smoothing * CAMERA_MOTION_SMOOTHING_MAX_SEC);
		const k = 1 - Math.exp(-dtSec / tau);
		tx = shown.tx + (targetTx - shown.tx) * k;
		ty = shown.ty + (targetTy - shown.ty) * k;
		appliedScale = shown.scale + (scale - shown.scale) * k;
	}

	// The halo. A second, slower follower trails behind the position; the gap
	// between them is the smear, so it stretches with speed and collapses to
	// nothing the moment the layer stops — «una estela o halo del spectrum
	// cuando se desplace».
	const trailAmount = resolveCameraMotionTrail(settings.cameraMotionTrail);
	const lag = (runtime.motionLag[layerId] ??= { tx, ty });
	if (!paused && dtSec > 0) {
		const tau = 0.06 + trailAmount * 0.18;
		const k = 1 - Math.exp(-dtSec / tau);
		lag.tx += (tx - lag.tx) * k;
		lag.ty += (ty - lag.ty) * k;
	}
	let trail: CameraMotionTrail | null = null;
	if (trailAmount > 0) {
		const dx = lag.tx - tx;
		const dy = lag.ty - ty;
		const length = Math.hypot(dx, dy);
		if (length > 0.4) {
			trail = {
				dx,
				dy,
				blur: Math.min(64, 4 + length * 0.9),
				alpha: trailAmount * Math.min(1, length / 24),
				color: settings.cameraMotionTrailColor
			};
		}
	}

	const result: CameraOffset = { tx, ty, scale: appliedScale, trail };
	runtime.motionSmoothed[layerId] = result;
	return result;
}

export function stepCameraFx(
	runtime: CameraFxRuntime,
	state: CameraFxSettings,
	readAudio: () => AudioSnapshot | null,
	nowMs: number,
	dtSec: number,
	viewport: { width: number; height: number },
	random: () => number = Math.random
): CameraFxFrame {
	const w = viewport.width;
	const h = viewport.height;
	const minDim = Math.max(1, Math.min(w, h));
	// The stack already drops layers that are off, aimed at nothing or set to
	// `none`; the master switch gates the whole subsystem.
	const stack = state.cameraMotionEnabled
		? resolveMotionLayerStack(state)
		: [];
	const motionNeedsAudio = stack.some(
		layer =>
			layer.settings.cameraMotionDrive === 'audio' ||
			layer.settings.cameraMotionDrive === 'fixed-audio' ||
			layer.settings.cameraMotionAmplitudeAudio > 0
	);
	const snapshot =
		motionNeedsAudio || state.cameraShakeEnabled ? readAudio() : null;
	const shakeMax = state.cameraShakeEnabled
		? Math.min(3, Math.max(0, state.cameraShakeAmount)) *
			CAMERA_FX_CAPS.maxShakePx
		: 0;
	const shakeScale = Math.min(
		CAMERA_FX_CAPS.maxScale,
		Math.max(1, 1 + shakeMax / minDim)
	);
	const shakeSlackX = ((shakeScale - 1) * w) / 2;
	const shakeSlackY = ((shakeScale - 1) * h) / 2;

	runtime.shakeTime += dtSec;

	const motions: CameraMotionFrameEntry[] = stack.map(layer => ({
		layerId: layer.id,
		targets: layer.targets,
		offset: stepMotionLayer(
			runtime,
			layer.settings,
			layer.id,
			layer.targets,
			snapshot,
			dtSec,
			state.motionPaused,
			viewport
		)
	}));

	let txShake = 0;
	let tyShake = 0;
	if (state.cameraShakeEnabled && snapshot) {
		const level = Math.max(
			0,
			readFxChannel(snapshot, state.cameraShakeChannel)
		);
		const threshold = resolveFxThreshold(
			state.cameraShakeBandThresholds,
			state.cameraShakeChannel,
			state.cameraShakeThreshold
		);
		if (
			snapshot.bins.length > 0 &&
			shouldTriggerFxPeak({
				level,
				previousLevel: runtime.lastShakeLevel,
				threshold,
				nowMs,
				lastTriggerMs: runtime.lastShakeTriggerMs,
				retriggerMs: Math.max(20, state.cameraShakeRetriggerMs),
				minRise: 0.015
			})
		) {
			runtime.shakeEnergy = Math.max(
				runtime.shakeEnergy,
				Math.min(
					1,
					((level - threshold) / (1 - threshold)) *
						Math.max(0, state.cameraShakeSensitivity)
				)
			);
			runtime.lastShakeTriggerMs = nowMs;
			runtime.snapDirection = runtime.snapDirection === 1 ? -1 : 1;
		}
		runtime.lastShakeLevel = level;
		if (snapshot.bins.length === 0) {
			runtime.shakeEnergy = 0;
		} else {
			const decay = Math.min(
				0.999,
				Math.max(0.01, state.cameraShakeDecay)
			);
			runtime.shakeEnergy *= Math.pow(decay, dtSec * 60);
		}
		if (runtime.shakeEnergy < 0.001) runtime.shakeEnergy = 0;

		const mag = runtime.shakeEnergy * shakeMax;
		const phase =
			runtime.shakeTime *
			Math.max(1, state.cameraShakeFrequency) *
			Math.PI *
			2;
		const roughness = Math.max(0, Math.min(1, state.cameraShakeRoughness));
		const wave = Math.sin(phase);
		const noiseX = (random() * 2 - 1) * roughness;
		const noiseY = (random() * 2 - 1) * roughness;
		switch (state.cameraShakeMode) {
			case 'horizontal':
				txShake = (wave * (1 - roughness) + noiseX) * mag;
				break;
			case 'vertical':
				tyShake = (wave * (1 - roughness) + noiseY) * mag;
				break;
			case 'punch':
				tyShake = -Math.abs(wave) * mag;
				break;
			case 'jitter':
				txShake = noiseX * mag;
				tyShake = noiseY * mag;
				break;
			case 'kick-snap':
				txShake = runtime.snapDirection * mag;
				tyShake = -mag * 0.24;
				break;
			default:
				txShake = (wave * (1 - roughness) + noiseX) * mag;
				tyShake =
					(Math.cos(phase * 1.17) * (1 - roughness) + noiseY) * mag;
				break;
		}
	}

	return {
		motionActive: motions.length > 0,
		shakeActive: state.cameraShakeEnabled,
		motions,
		motion: motions[0]?.offset ?? IDENTITY_OFFSET,
		shake: {
			tx: clamp(txShake, shakeSlackX),
			ty: clamp(tyShake, shakeSlackY),
			scale: shakeScale
		}
	};
}

/**
 * The offset a layer gets this frame (translate, then scale about the
 * centre), or `null` when neither motion nor shake targets it.
 */
export function resolveCameraLayerOffset(
	frame: CameraFxFrame,
	settings: Pick<CameraFxSettings, 'cameraShakeTargets'>,
	layer: CameraMotionLayer
): CameraOffset | null {
	// First match wins, top-down: motion layers never blend, so the layer under
	// one that already claimed this target contributes nothing to it.
	const motion =
		frame.motions.find(entry =>
			cameraMotionTargetIncludes(entry.targets, layer)
		)?.offset ?? null;
	const shakeApplies =
		frame.shakeActive &&
		cameraMotionTargetIncludes(settings.cameraShakeTargets, layer);
	if (!motion && !shakeApplies) return null;
	return {
		tx: (motion?.tx ?? 0) + (shakeApplies ? frame.shake.tx : 0),
		ty: (motion?.ty ?? 0) + (shakeApplies ? frame.shake.ty : 0),
		scale: (motion?.scale ?? 1) * (shakeApplies ? frame.shake.scale : 1),
		// The halo belongs to the movement, so shake alone never draws one.
		trail: motion?.trail ?? null
	};
}
