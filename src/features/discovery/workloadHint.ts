import type { SpectrumInstance, WallpaperState } from '@/types/wallpaper';
import { PARTICLE_LIMITS } from '@/store/defaultState';

type SpectrumCostSettings = Pick<
	WallpaperState,
	| 'spectrumFamily'
	| 'spectrumMotionTrails'
	| 'spectrumGhostFrames'
	| 'spectrumAfterglow'
>;

/**
 * A single spectrum's own cost, family plus frame-memory. Instances carry the
 * same main-named keys, so the main state and an instance go through here alike.
 */
function isSpectrumCostly(settings: SpectrumCostSettings): boolean {
	return (
		settings.spectrumFamily === 'tunnel' ||
		settings.spectrumFamily === 'liquid' ||
		settings.spectrumFamily === 'orbital' ||
		settings.spectrumMotionTrails > 0.45 ||
		settings.spectrumGhostFrames > 0.45 ||
		settings.spectrumAfterglow > 0.45
	);
}

function activeSpectrumInstances(state: WallpaperState): SpectrumInstance[] {
	return state.spectrumInstances.filter(
		instance => instance.enabled && instance.spectrumOpacity > 0.001
	);
}

/**
 * Returns whether the current wallpaper settings are likely GPU-heavy
 * relative to the chosen performance mode (for dismissible UI hints).
 */
export function getVisualWorkloadHint(state: WallpaperState): 'heavy' | 'none' {
	const instances = state.spectrumEnabled
		? activeSpectrumInstances(state)
		: [];
	const drawnSpectrums =
		(state.spectrumEnabled && state.spectrumMainVisible ? 1 : 0) +
		instances.length;
	// Each drawn spectrum is its own full-screen canvas; the perf audit found
	// that count — not the blur — is what actually costs frames.
	if (drawnSpectrums >= 2 && state.performanceMode !== 'low') {
		return 'heavy';
	}
	const spectrumLooksHeavy =
		state.spectrumEnabled &&
		((state.spectrumMainVisible && isSpectrumCostly(state)) ||
			instances.some(isSpectrumCostly));
	if (spectrumLooksHeavy && state.performanceMode !== 'low') {
		return 'heavy';
	}
	const limit = PARTICLE_LIMITS[state.performanceMode] ?? 80;
	if (
		state.particlesEnabled &&
		state.particleCount >= limit * 0.92 &&
		state.performanceMode !== 'low'
	) {
		return 'heavy';
	}
	if (
		state.rainEnabled &&
		state.rainDropCount >= 1100 &&
		state.performanceMode === 'high'
	) {
		return 'heavy';
	}
	return 'none';
}
