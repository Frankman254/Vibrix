import type { Translations } from '@/lib/i18n';
import type { CameraMotionTarget } from '@/features/stageFx/stageFxConfig';

export const CAMERA_FX_TARGETS: CameraMotionTarget[] = [
	'global-background',
	'background',
	'selected-overlay',
	'logo',
	'spectrum',
	'spectrum-2',
	'particles',
	'rain',
	'track-title',
	'lyrics',
	'stage-lights',
	'flash-light'
];

/** Translated label for each affected-layer target. Pass the active `useT()`. */
export function getCameraFxTargetLabels(
	t: Translations
): Record<CameraMotionTarget, string> {
	return {
		'global-background': t.sfx_target_global_bg,
		background: t.sfx_target_background,
		'selected-overlay': t.sfx_target_overlays,
		logo: t.sfx_target_logo,
		spectrum: t.sfx_target_spectrum,
		'spectrum-2': t.sfx_target_spectrum_2,
		particles: t.sfx_target_particles,
		rain: t.sfx_target_rain,
		'track-title': t.sfx_target_track_title,
		lyrics: t.sfx_target_lyrics,
		'stage-lights': t.sfx_target_stage_lights,
		'flash-light': t.sfx_target_flash_light
	};
}

/**
 * What exists on stage right now. A target for something the project does not
 * have is offered greyed out rather than hidden, so the chip row keeps the same
 * shape and the user can see why it is unavailable.
 */
export type CameraFxTargetAvailability = {
	hasOverlay: boolean;
	/** `spectrumInstances[0]` exists — what the editor calls Spectrum 2. */
	hasSecondSpectrum: boolean;
};

export function isCameraFxTargetAvailable(
	target: CameraMotionTarget,
	availability: CameraFxTargetAvailability
): boolean {
	if (target === 'selected-overlay') return availability.hasOverlay;
	if (target === 'spectrum-2') return availability.hasSecondSpectrum;
	return true;
}

export function resolveAvailableCameraFxTargets(
	availability: CameraFxTargetAvailability
): CameraMotionTarget[] {
	return CAMERA_FX_TARGETS.filter(target =>
		isCameraFxTargetAvailable(target, availability)
	);
}
