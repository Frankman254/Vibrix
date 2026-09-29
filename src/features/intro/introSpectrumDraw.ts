/**
 * Drawing the intro's spectrum: a SAVED spectrum slot, rendered by the real
 * spectrum engine, fed by the window's own fixed wave.
 *
 * The user asked for exactly this and the reason is sound: a lookalike figure
 * built for the intro can never match the wallpaper's spectrum, and the whole
 * point of the flourish is that the thing which mounts itself IS the spectrum
 * the video is about to show. So the slot's values are merged over the state and
 * put through the SAME pipeline the wallpaper uses (responsive → placement →
 * colours → `drawSpectrum`), with its own runtime key so it cannot disturb the
 * live spectrums' smoothing.
 *
 * What the window overrides: the levels (see `introSpectrum` — generated, never
 * the track), the opacity and scale (the mount envelope) and, optionally, the
 * position (the intro is a centred composition).
 */
import {
	applySpectrumPlacementToState,
	hydrateSpectrumProfileValues,
	resolveMainSpectrumState
} from '@/features/spectrum';
import { drawSpectrum } from '@/features/spectrum/render';
import { resolveResponsiveSpectrumSettings } from '@/features/layout/responsiveLayout';
import type { BackgroundPalette } from '@/lib/backgroundPalette';
import type { WallpaperState } from '@/types/wallpaper';
import type { IntroSpectrumPlan } from './introPlan';
import type { PaintIntroSpectrum } from './introPaint';
import { resolveIntroSpectrumWave } from './introSpectrum';

/** Per-window runtime key, so intro and ending keep separate smoothing. */
function runtimeKey(kind: 'intro' | 'outro'): string {
	return `intro-sequence-${kind}`;
}

export type IntroSpectrumContext = {
	kind: 'intro' | 'outro';
	state: WallpaperState;
	palette: BackgroundPalette;
	themePalette: BackgroundPalette;
	/** Seconds since the window opened — the fixed wave's only clock. */
	windowTimeSec: number;
	/** Frame delta in seconds, for the renderer's own smoothing. */
	dt: number;
};

/**
 * The painter callback `paintIntro` calls at the spectrum's z-position, or
 * `null` when there is nothing to draw (no slot at that index).
 */
export function createIntroSpectrumPainter(
	context: IntroSpectrumContext
): PaintIntroSpectrum | null {
	const { state } = context;
	if (state.spectrumProfileSlots.length === 0) return null;

	return (ctx, plan, windowAlpha) => {
		const slot = state.spectrumProfileSlots[plan.slotIndex];
		if (!slot?.values) return;
		const alpha = Math.min(1, plan.alpha) * windowAlpha;
		if (alpha <= 0.001) return;

		const canvas = ctx.canvas as HTMLCanvasElement;
		if (!(canvas.width > 0 && canvas.height > 0)) return;

		const merged = {
			...state,
			...hydrateSpectrumProfileValues(slot.values),
			// The window owns visibility: a slot saved with the main figure
			// hidden would render nothing here.
			spectrumEnabled: true,
			spectrumMainVisible: true,
			// Extra instances belong to the wallpaper, not to a five-second
			// flourish — one figure mounts, one figure leaves.
			spectrumInstances: [],
			spectrumOpacity: alpha
		} as WallpaperState;
		if (plan.centered) {
			merged.spectrumFollowLogo = false;
			merged.spectrumPositionX = 0.5;
			merged.spectrumPositionY = 0.5;
		}

		const placed = applySpectrumPlacementToState(
			resolveResponsiveSpectrumSettings(
				merged,
				canvas.width,
				canvas.height
			),
			{ logoScale: 1 }
		);
		const { bins, timeDomain } = resolveIntroSpectrumWave({
			timeSec: context.windowTimeSec,
			mount: plan.mount,
			speed: plan.waveSpeed,
			intensity: plan.waveIntensity
		});
		drawSpectrum(
			ctx,
			canvas,
			{
				bins,
				timeDomain,
				amplitude: plan.mount,
				peak: plan.mount,
				channels: {
					kick: plan.mount,
					instrumental: plan.mount,
					bass: plan.mount,
					hihat: plan.mount,
					vocal: plan.mount,
					full: plan.mount
				},
				timestampMs: context.windowTimeSec * 1000
			},
			resolveMainSpectrumState(
				placed as WallpaperState,
				context.palette,
				context.themePalette
			),
			context.dt,
			{
				performanceMode: state.performanceMode,
				// The flourish is not the place to read a diagnostics overlay.
				showDiagnosticsHud: false
			},
			runtimeKey(context.kind)
		);
	};
}

export type { IntroSpectrumPlan };
