import type {
	VisualTransitionSnapshot,
	VisualTransitionSubsystem,
	WallpaperState
} from '@/types/wallpaper';

function patchHasAny(
	patch: Partial<WallpaperState>,
	prefixes: readonly string[]
): boolean {
	return Object.keys(patch).some(key =>
		prefixes.some(prefix => key.startsWith(prefix))
	);
}

export function detectVisualTransitionSubsystems(
	patch: Partial<WallpaperState>
): VisualTransitionSubsystem[] {
	const subsystems: VisualTransitionSubsystem[] = [];
	if (
		patch.activeSceneSlotId !== undefined ||
		patch.sceneSlots !== undefined
	) {
		subsystems.push('scene');
	}
	if (
		patch.spectrumEnabled !== undefined ||
		patchHasAny(patch, ['spectrum'])
	) {
		subsystems.push('spectrum');
	}
	if (
		patch.particlesEnabled !== undefined ||
		patchHasAny(patch, ['particle'])
	) {
		subsystems.push('particles');
	}
	if (patch.rainEnabled !== undefined || patchHasAny(patch, ['rain'])) {
		subsystems.push('rain');
	}
	if (
		patch.filterTargets !== undefined ||
		patch.customFilterLookSettings !== undefined ||
		patch.activeFilterLookId !== undefined ||
		patchHasAny(patch, [
			'filter',
			'brightness',
			'contrast',
			'saturation',
			'blur',
			'hue',
			'vignette',
			'bloom',
			'luma',
			'lens',
			'heat',
			'scanline'
		])
	) {
		subsystems.push('looks');
	}
	if (patch.logoEnabled !== undefined || patchHasAny(patch, ['logo'])) {
		subsystems.push('logo');
	}
	return [...new Set(subsystems)];
}

export function createVisualTransitionSnapshot(params: {
	state: Pick<WallpaperState, 'activeImageId' | 'performanceMode'>;
	patch: Partial<WallpaperState>;
	toImageId: string | null;
	startedAtMs?: number;
	prefersReducedMotion?: boolean;
}): VisualTransitionSnapshot | null {
	const subsystems = detectVisualTransitionSubsystems(params.patch);
	const imageChanged = params.state.activeImageId !== params.toImageId;
	if (!imageChanged && subsystems.length === 0) return null;
	const reduced = params.prefersReducedMotion === true;
	const startedAtMs = params.startedAtMs ?? Date.now();
	const performanceDuration =
		params.state.performanceMode === 'low'
			? 220
			: params.state.performanceMode === 'medium'
				? 420
				: 520;
	return {
		id: `vt-${startedAtMs}-${Math.random().toString(36).slice(2, 8)}`,
		fromImageId: params.state.activeImageId,
		toImageId: params.toImageId,
		startedAtMs,
		durationMs: reduced ? 0 : performanceDuration,
		easing: 'smoothstep',
		subsystems
	};
}

/**
 * Maps a renderable layer's `type` to the visual-transition subsystems whose
 * fade envelope should drive it, or an empty list when the layer is not part of
 * the crossfade pass (track-title / lyrics / the slideshow controller).
 *
 * Every drawn layer also lists `looks`, because the filter stack is baked into
 * its pixels (`resolveFilterStack` runs inside each draw): changing a look with
 * no image change used to be a hard cut on every layer at once. The two image
 * layers additionally answer to `scene`, since a scene can re-frame them.
 *
 * Pure so it can be unit-tested without the DOM or the store.
 */
export function transitionSubsystemsForLayerType(
	type: string
): VisualTransitionSubsystem[] {
	switch (type) {
		case 'spectrum':
			return ['spectrum', 'looks'];
		case 'logo':
			return ['logo', 'looks'];
		case 'rain':
			return ['rain', 'looks'];
		case 'particle-background':
		case 'particle-foreground':
			return ['particles', 'looks'];
		case 'background-image':
		case 'overlay-image':
			return ['looks', 'scene'];
		default:
			return [];
	}
}

export function visualTransitionProgress(
	transition: VisualTransitionSnapshot | null,
	nowMs: number
): number {
	if (!transition) return 1;
	if (transition.durationMs <= 0) return 1;
	const t = Math.max(
		0,
		Math.min(1, (nowMs - transition.startedAtMs) / transition.durationMs)
	);
	return t * t * (3 - 2 * t);
}

export function isVisualTransitionActive(
	transition: VisualTransitionSnapshot | null,
	nowMs: number
): boolean {
	if (!transition) return false;
	return visualTransitionProgress(transition, nowMs) < 1;
}
