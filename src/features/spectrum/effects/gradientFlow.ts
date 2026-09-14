import type { SpectrumGradientFlowDirection } from '@/types/wallpaper';
import type {
	SpectrumScope,
	SpectrumSettings
} from '../runtime/spectrumRuntime';
import { LIVE_SPECTRUM_SCOPE } from '../runtime/spectrumRuntime';

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

// No phase global: the phase lives on the caller's SpectrumScope, so the
// offline export and the live viewport each advance their own.

/**
 * Animated phase offset (0..1) for gradient-driven spectrum fills/strokes.
 * Returns 0 when disabled — callers keep the legacy gradient path.
 */
export function resolveGradientFlowPhase(
	settings: SpectrumSettings,
	audioEnergy: number,
	dt: number,
	scope: SpectrumScope = LIVE_SPECTRUM_SCOPE
): number {
	if (!settings.spectrumGradientFlow) return 0;
	const speed = clamp01(settings.spectrumGradientFlowSpeed ?? 0.5);
	const direction =
		settings.spectrumGradientFlowDirection === 'reverse' ? -1 : 1;
	const baseRate = 0.06 + speed * 0.38;
	let delta = baseRate * dt * direction;
	if (settings.spectrumGradientFlowAudio) {
		delta += clamp01(audioEnergy) * speed * 0.35 * dt * direction;
	}
	scope.gradientPhase = (scope.gradientPhase + delta + 1) % 1;
	return scope.gradientPhase;
}

export function wrapGradientPhase(phase: number): number {
	return ((phase % 1) + 1) % 1;
}

export function directionSign(
	direction: SpectrumGradientFlowDirection | undefined
): 1 | -1 {
	return direction === 'reverse' ? -1 : 1;
}
