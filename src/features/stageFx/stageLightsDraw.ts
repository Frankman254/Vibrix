/**
 * Stage Lights: directional concert beams. The per-frame audio envelope
 * (`stepStageLights`) and the draw pass (`drawStageLights`) are shared by the
 * live `StageLightsCanvas` and the offline video export, so both move and
 * paint the beams the same way.
 *
 * No React, no store: callers pass the settings, the audio snapshot, the
 * palettes and the clock, and own the runtime between frames.
 */
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { BackgroundPalette } from '@/lib/backgroundPalette';
import type { WallpaperState } from '@/types/wallpaper';
import {
	readFxChannel,
	resolveFxThreshold,
	resolveStageLightsBudget,
	STAGE_FX_CAPS,
	type StageLightsOrigin
} from './stageFxConfig';

export type StageLightsSettings = Pick<
	WallpaperState,
	| 'performanceMode'
	| 'stageLightsAudioAmount'
	| 'stageLightsAudioChannel'
	| 'stageLightsAudioDecay'
	| 'stageLightsAudioGateEnabled'
	| 'stageLightsAudioHoldMs'
	| 'stageLightsAudioOscillationAmount'
	| 'stageLightsAudioReactive'
	| 'stageLightsBandThresholds'
	| 'stageLightsBeamLength'
	| 'stageLightsBeamWidth'
	| 'stageLightsBlendMode'
	| 'stageLightsColor'
	| 'stageLightsColorSource'
	| 'stageLightsFixedMotion'
	| 'stageLightsIntensity'
	| 'stageLightsInvertDirection'
	| 'stageLightsMaxBeamCount'
	| 'stageLightsMinBeamCount'
	| 'stageLightsMirrorDirections'
	| 'stageLightsMovementMode'
	| 'stageLightsOpacity'
	| 'stageLightsOrigin'
	| 'stageLightsPeakThreshold'
	| 'stageLightsSoftness'
	| 'stageLightsSpeed'
>;

/** State a Stage Lights layer carries from one frame to the next. */
export type StageLightsRuntime = {
	/** Beam sweep clock (seconds, scaled by motion rate). */
	time: number;
	/** Held/decaying audio response, 0–1. */
	energy: number;
	lastPeakMs: number;
	phases: Float32Array;
};

export type StageLightsPalettes = {
	background: BackgroundPalette;
	theme: BackgroundPalette;
};

export type StageLightsDrawResult = {
	drawn: boolean;
	beamCount: number;
	passes: number;
};

type BeamEdge = 'top' | 'bottom' | 'left' | 'right';

export function createStageLightsRuntime(): StageLightsRuntime {
	return {
		time: 0,
		energy: 0,
		lastPeakMs: -Infinity,
		phases: Float32Array.from(
			{ length: STAGE_FX_CAPS.maxBeamCount },
			(_, i) => (i * 2.39996) % (Math.PI * 2)
		)
	};
}

function resolveBeamEdge(origin: StageLightsOrigin, index: number): BeamEdge {
	switch (origin) {
		case 'bottom':
		case 'left':
		case 'right':
			return origin;
		case 'top-bottom':
			return index % 2 === 0 ? 'top' : 'bottom';
		case 'sides':
			return index % 2 === 0 ? 'left' : 'right';
		case 'all':
			return (['top', 'right', 'bottom', 'left'] as const)[index % 4];
		default:
			return 'top';
	}
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function parseHexColor(color: string): [number, number, number] {
	const normalized = color.trim();
	const short = /^#([0-9a-f]{3})$/i.exec(normalized);
	if (short) {
		return short[1].split('').map(part => parseInt(part + part, 16)) as [
			number,
			number,
			number
		];
	}
	const long = /^#([0-9a-f]{6})$/i.exec(normalized);
	if (long) {
		const value = parseInt(long[1], 16);
		return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
	}
	return [255, 255, 255];
}

/**
 * Advances the audio envelope and the sweep clock by one frame and returns the
 * beam response (0–1). `motionPaused` freezes the sweep, not the envelope.
 */
export function stepStageLights(
	runtime: StageLightsRuntime,
	settings: StageLightsSettings,
	audio: AudioSnapshot,
	nowMs: number,
	dtSec: number,
	motionPaused = false
): number {
	const reactive = settings.stageLightsAudioReactive;
	const level = reactive
		? Math.max(0, readFxChannel(audio, settings.stageLightsAudioChannel))
		: 0;
	const threshold = resolveFxThreshold(
		settings.stageLightsBandThresholds,
		settings.stageLightsAudioChannel,
		settings.stageLightsPeakThreshold
	);
	const rawResponse =
		reactive && level > threshold
			? clamp01(
					((level - threshold) / Math.max(0.01, 1 - threshold)) *
						settings.stageLightsAudioAmount
				)
			: 0;
	if (rawResponse > runtime.energy) {
		runtime.energy = rawResponse;
		runtime.lastPeakMs = nowMs;
	} else if (
		nowMs - runtime.lastPeakMs >
		Math.max(0, settings.stageLightsAudioHoldMs)
	) {
		const decay = Math.max(
			0.01,
			Math.min(0.995, settings.stageLightsAudioDecay)
		);
		runtime.energy *= Math.pow(decay, dtSec * 60);
	}
	if (!reactive || runtime.energy < 0.001) {
		runtime.energy = 0;
	}
	const response = reactive ? runtime.energy : 0;
	const motionRate =
		(settings.stageLightsFixedMotion ? 1 : 0) +
		(reactive ? response * settings.stageLightsAudioAmount : 0);
	if (!motionPaused) {
		runtime.time += dtSec * motionRate;
	}
	return response;
}

/**
 * Paints one frame of beams onto `ctx`, clearing it first. Returns
 * `drawn: false` without touching the canvas when the layer would be
 * invisible. `pixelScale` scales the pixel-sized parts (blur, core stroke,
 * flare) for an output larger or smaller than the live viewport.
 */
export function drawStageLights(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	settings: StageLightsSettings,
	runtime: StageLightsRuntime,
	response: number,
	palettes: StageLightsPalettes,
	pixelScale = 1
): StageLightsDrawResult {
	const w = width;
	const h = height;
	const quality = settings.performanceMode;
	const intensity = Math.max(0, Math.min(2, settings.stageLightsIntensity));
	const opacity = Math.min(
		STAGE_FX_CAPS.maxOpacity,
		Math.max(0, settings.stageLightsOpacity)
	);
	const budget = resolveStageLightsBudget(
		quality,
		settings.stageLightsMinBeamCount,
		settings.stageLightsMaxBeamCount,
		settings.stageLightsSoftness * STAGE_FX_CAPS.maxBeamBlurPx
	);
	const { minBeamCount, maxBeamCount, drawHaze, drawCore, drawFlare } =
		budget;
	const blurPx = budget.blurPx * pixelScale;
	const beamCount = Math.max(
		minBeamCount,
		Math.min(
			maxBeamCount,
			Math.round(minBeamCount + (maxBeamCount - minBeamCount) * response)
		)
	);
	const activePalette =
		settings.stageLightsColorSource === 'theme'
			? palettes.theme
			: palettes.background;
	const color =
		settings.stageLightsColorSource === 'manual'
			? settings.stageLightsColor
			: activePalette.dominant;
	const halfWidth = 0.04 + clamp01(settings.stageLightsBeamWidth) * 0.22;
	const beamLengthRatio = Math.max(
		0.15,
		Math.min(1.35, settings.stageLightsBeamLength)
	);
	const direction = settings.stageLightsInvertDirection ? -1 : 1;
	const phases = runtime.phases;
	const t = runtime.time * settings.stageLightsSpeed * direction;
	const audioOscillation =
		1 +
		response *
			Math.max(
				0,
				Math.min(2, settings.stageLightsAudioOscillationAmount)
			);
	const beamAlpha =
		opacity *
		intensity *
		(settings.stageLightsAudioReactive
			? settings.stageLightsAudioGateEnabled
				? response
				: 0.14 + response * 0.86
			: 0.8);

	if (beamAlpha < 0.002) {
		return { drawn: false, beamCount: 0, passes: 0 };
	}

	// Parse color once per frame — not inside each gradient stop (~10× per beam).
	const [cr, cg, cb] = parseHexColor(color);
	const rgbaFast = (alpha: number) =>
		`rgba(${cr}, ${cg}, ${cb}, ${clamp01(alpha)})`;

	// Blur scale for the haze and (when active) core/flare passes.
	const hazeBlurScale = quality === 'high' ? 1.3 : 0.8;
	const coreBlurScale = 0.55;
	const flareBlurScale = quality === 'high' ? 0.45 : 0.3;

	ctx.clearRect(0, 0, w, h);
	ctx.save();
	ctx.globalCompositeOperation = settings.stageLightsBlendMode;
	ctx.shadowColor = color;

	for (let i = 0; i < beamCount; i += 1) {
		const edge = resolveBeamEdge(settings.stageLightsOrigin, i);
		const edgeRatio = (i + 0.5) / beamCount;
		let originX = edgeRatio * w;
		let originY = -0.06 * h;
		if (edge === 'bottom') {
			originY = 1.06 * h;
		} else if (edge === 'left') {
			originX = -0.06 * w;
			originY = edgeRatio * h;
		} else if (edge === 'right') {
			originX = 1.06 * w;
			originY = edgeRatio * h;
		}

		const centerAim = Math.atan2(h / 2 - originY, w / 2 - originX);
		const mirroredDirection =
			settings.stageLightsMirrorDirections && i % 2 === 1 ? -1 : 1;
		const sweep = Math.sin(t + phases[i]) * mirroredDirection;
		let sweepOffset = sweep * 0.34;
		switch (settings.stageLightsMovementMode) {
			case 'top-down':
				sweepOffset = sweep * 0.34;
				break;
			case 'bottom-up':
				sweepOffset = -sweep * 0.34;
				break;
			case 'left-right':
				sweepOffset = sweep * 0.5;
				break;
			case 'right-left':
				sweepOffset = -sweep * 0.5;
				break;
			case 'cross-sweep':
				sweepOffset = sweep * 0.72;
				break;
			case 'radial-sweep':
				sweepOffset = sweep * 0.9;
				break;
			case 'circular-sweep':
				sweepOffset =
					(Math.sin(t + phases[i]) * 0.64 +
						Math.sin(t * 0.55 + phases[i] * 0.35) * 0.18) *
					mirroredDirection;
				break;
			default:
				break;
		}
		const aim =
			centerAim +
			Math.max(-1.05, Math.min(1.05, sweepOffset * audioOscillation));
		const centerDistance = Math.hypot(w / 2 - originX, h / 2 - originY);
		const length = centerDistance * beamLengthRatio;

		const lx = originX + Math.cos(aim - halfWidth) * length;
		const ly = originY + Math.sin(aim - halfWidth) * length;
		const rx = originX + Math.cos(aim + halfWidth) * length;
		const ry = originY + Math.sin(aim + halfWidth) * length;
		const endX = originX + Math.cos(aim) * length;
		const endY = originY + Math.sin(aim) * length;

		// ── Pass 1: main beam triangle ────────────────────────────────
		const mainGradient = ctx.createLinearGradient(
			originX,
			originY,
			endX,
			endY
		);
		mainGradient.addColorStop(0, rgbaFast(0.78));
		mainGradient.addColorStop(0.18, rgbaFast(0.42));
		mainGradient.addColorStop(0.72, rgbaFast(0.16));
		mainGradient.addColorStop(1, rgbaFast(0));

		ctx.globalAlpha = Math.min(1, beamAlpha);
		ctx.shadowBlur = blurPx;
		ctx.fillStyle = mainGradient;
		ctx.beginPath();
		ctx.moveTo(originX, originY);
		ctx.lineTo(lx, ly);
		ctx.lineTo(rx, ry);
		ctx.closePath();
		ctx.fill();

		// ── Pass 2: haze (medium + high only) ────────────────────────
		if (drawHaze) {
			const hazeWidth = halfWidth * 1.65;
			const hlx = originX + Math.cos(aim - hazeWidth) * length;
			const hly = originY + Math.sin(aim - hazeWidth) * length;
			const hrx = originX + Math.cos(aim + hazeWidth) * length;
			const hry = originY + Math.sin(aim + hazeWidth) * length;
			ctx.globalAlpha = Math.min(1, beamAlpha * 0.34);
			ctx.shadowBlur = blurPx * hazeBlurScale;
			ctx.fillStyle = mainGradient;
			ctx.beginPath();
			ctx.moveTo(originX, originY);
			ctx.lineTo(hlx, hly);
			ctx.lineTo(hrx, hry);
			ctx.closePath();
			ctx.fill();
		}

		// ── Pass 3: core stroke (medium + high only) ─────────────────
		if (drawCore) {
			const coreWidth =
				(8 + clamp01(settings.stageLightsBeamWidth) * 32) * pixelScale;
			const coreGradient = ctx.createLinearGradient(
				originX,
				originY,
				endX,
				endY
			);
			coreGradient.addColorStop(0, rgbaFast(0.95));
			coreGradient.addColorStop(0.4, rgbaFast(0.42));
			coreGradient.addColorStop(1, rgbaFast(0));
			ctx.globalAlpha = Math.min(1, beamAlpha * 0.72);
			ctx.shadowBlur = blurPx * coreBlurScale;
			ctx.strokeStyle = coreGradient;
			ctx.lineWidth = coreWidth;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(originX, originY);
			ctx.lineTo(endX, endY);
			ctx.stroke();
		}

		// ── Pass 4: flare radial burst (high only) ───────────────────
		if (drawFlare) {
			const flareRadius =
				(22 +
					clamp01(settings.stageLightsBeamWidth) * 54 +
					response * 18) *
				pixelScale;
			const flare = ctx.createRadialGradient(
				originX,
				originY,
				0,
				originX,
				originY,
				flareRadius
			);
			flare.addColorStop(0, rgbaFast(0.72));
			flare.addColorStop(0.45, rgbaFast(0.22));
			flare.addColorStop(1, rgbaFast(0));
			ctx.globalAlpha = Math.min(1, beamAlpha);
			ctx.shadowBlur = blurPx * flareBlurScale;
			ctx.fillStyle = flare;
			ctx.beginPath();
			ctx.arc(originX, originY, flareRadius, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	ctx.restore();
	return {
		drawn: true,
		beamCount,
		passes:
			1 + (drawHaze ? 1 : 0) + (drawCore ? 1 : 0) + (drawFlare ? 1 : 0)
	};
}
