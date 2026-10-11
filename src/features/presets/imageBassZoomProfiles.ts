import type { WallpaperState } from '@/types/wallpaper';

/** Envelope fields shared with logo-style `createAudioEnvelope` (BG uses min=0 max=sensitivity). */
export type ImageBassZoomEnvelopeSlice = Pick<
	WallpaperState,
	| 'imageBassAttack'
	| 'imageBassRelease'
	| 'imageBassReactivitySpeed'
	| 'imageBassPeakWindow'
	| 'imageBassPeakFloor'
	| 'imageBassPunch'
	| 'imageBassReactiveScaleIntensity'
>;

/**
 * The default BG bass-zoom envelope, and the only one left.
 *
 * There used to be a bank of three named presets here (classic / smooth /
 * punchy) with a `imageBassZoomPresetId` on the state to remember which was
 * picked. The picker was removed from the editor and the envelope became a set
 * of Calibration sliders, which left the other two presets and the id
 * unreachable. These numbers survive because they ARE the shipped default —
 * they match what `ImageLayerCanvas` once hardcoded (decay 0.62 → release
 * ≈ 0.096, responseSpeed 2.65).
 */
export const IMAGE_BASS_ZOOM_CLASSIC: ImageBassZoomEnvelopeSlice = {
	imageBassAttack: 1.3,
	imageBassRelease: 0.02 + (1 - 0.62) * 0.2,
	imageBassReactivitySpeed: 2.65 / 2.4,
	imageBassPeakWindow: 1.05,
	imageBassPeakFloor: 0.015,
	imageBassPunch: 0.22,
	imageBassReactiveScaleIntensity: 1.2
};

export function releaseToLegacyDecay(release: number): number {
	const decay = 1 - (release - 0.02) / 0.2;
	if (!Number.isFinite(decay)) return 0.62;
	return Math.min(0.95, Math.max(0.05, decay));
}
