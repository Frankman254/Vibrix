/**
 * What selecting a background image does to the state, without the store.
 *
 * `setActiveImageId` applies it to the live store; the offline video export
 * applies it to its frozen snapshot, so a slideshow in the file switches scene
 * and per-image overrides exactly like the preview does.
 */
import {
	buildSceneSlotActivationPatch,
	findSlotByRef,
	normalizeSceneSlotAgainstState,
	resolveEffectiveSceneSlotId
} from '@/features/scenes/sceneSlot';
import { suggestBackgroundAutoFit } from '@/features/background';
import {
	extractLooksProfileSettings,
	extractParticlesProfileSettings,
	extractRainProfileSettings
} from '@/store/featureProfiles';
import {
	buildBackgroundImageCollectionPatch,
	syncStateWithActiveBackgroundImage
} from '@/store/backgroundStoreUtils';
import type { WallpaperState } from '@/types/wallpaper';

export type ActiveImageSelection = {
	patch: Partial<WallpaperState>;
	/** A scene slot was activated (callers reset the spectrum preset morph). */
	appliedScene: boolean;
};

export function buildActiveImageSelectionPatch(
	state: WallpaperState,
	id: string | null
): ActiveImageSelection {
	const patch = buildBackgroundImageCollectionPatch(
		state,
		state.backgroundImages,
		id
	);
	const activeImageId = patch.activeImageId;
	const match = activeImageId
		? state.backgroundImages.find(img => img.assetId === activeImageId)
		: undefined;
	if (!match) return { patch, appliedScene: false };

	// Scene-first precedence: the image's explicit scene, else the global
	// default scene, else legacy per-image overrides.
	const { sceneSlotId: effectiveSceneSlotId } = resolveEffectiveSceneSlotId(
		match,
		state
	);
	const sceneSlot = effectiveSceneSlotId
		? state.sceneSlots.find(s => s.id === effectiveSceneSlotId)
		: undefined;
	if (sceneSlot) {
		const normalized = normalizeSceneSlotAgainstState(sceneSlot, state);
		Object.assign(patch, buildSceneSlotActivationPatch(state, normalized), {
			activeSceneSlotId: sceneSlot.id
		});
		return { patch, appliedScene: true };
	}

	patch.activeSceneSlotId = null;
	// Legacy back-compat fallback only — used when the image has no effective
	// scene. Inline overrides take priority over slot indices.
	// Overrides configure appearance, not visibility — preserve the current
	// enabled state so a saved-when-disabled override never silently hides the
	// logo or spectrum.
	const logoSlot = findSlotByRef(
		state.logoProfileSlots,
		match.logoProfileSlotId
	);
	if (match.logoOverride) {
		Object.assign(patch, match.logoOverride, {
			logoEnabled: state.logoEnabled
		});
	} else if (logoSlot?.values) {
		Object.assign(patch, logoSlot.values, {
			logoEnabled: state.logoEnabled
		});
	}
	const spectrumSlot = findSlotByRef(
		state.spectrumProfileSlots,
		match.spectrumProfileSlotId
	);
	if (match.spectrumOverride) {
		Object.assign(patch, match.spectrumOverride, {
			spectrumEnabled: state.spectrumEnabled
		});
	} else if (spectrumSlot?.values) {
		Object.assign(patch, spectrumSlot.values, {
			spectrumEnabled: state.spectrumEnabled
		});
	}
	// Particles / Rain / Looks: same precedence as logo+spectrum — inline
	// override > slot binding > nothing. Inline overrides keep the
	// corresponding enabled flag from current state so a saved-when-disabled
	// snapshot never silently turns visibility off.
	const particlesSlot = findSlotByRef(
		state.particlesProfileSlots,
		match.particlesProfileSlotId
	);
	if (match.particlesOverride) {
		Object.assign(patch, match.particlesOverride, {
			particlesEnabled: state.particlesEnabled
		});
	} else if (particlesSlot?.values) {
		Object.assign(
			patch,
			extractParticlesProfileSettings(state),
			particlesSlot.values,
			{ particlesEnabled: state.particlesEnabled }
		);
	}
	const rainSlot = findSlotByRef(
		state.rainProfileSlots,
		match.rainProfileSlotId
	);
	if (match.rainOverride) {
		Object.assign(patch, match.rainOverride, {
			rainEnabled: state.rainEnabled
		});
	} else if (rainSlot?.values) {
		Object.assign(
			patch,
			extractRainProfileSettings(state),
			rainSlot.values,
			{ rainEnabled: state.rainEnabled }
		);
	}
	const looksSlot = findSlotByRef(
		state.looksProfileSlots,
		match.looksProfileSlotId
	);
	if (match.looksOverride) {
		Object.assign(patch, match.looksOverride);
	} else if (looksSlot?.values) {
		Object.assign(
			patch,
			extractLooksProfileSettings(state),
			looksSlot.values
		);
	}
	return { patch, appliedScene: false };
}

/**
 * Keep Covered refit of the active image for a viewport, or `null` when it
 * does not apply (lock off, hand-tuned framing, already fitted). The
 * hand-tuned guard (`coverageFramingEdited`) is provenance set by the user's
 * manual framing; enabling the lock clears it before calling this, so a
 * deliberate recalculation always lands.
 */
export function buildCoveredAutoFitPatch(
	state: WallpaperState,
	imageSize: { width: number; height: number },
	viewport: { width: number; height: number }
): Partial<WallpaperState> | null {
	if (!state.activeImageId || !state.imageCoverageLockEnabled) return null;
	const image = state.backgroundImages.find(
		img => img.assetId === state.activeImageId
	);
	// A hand-tuned composition is the user's intent: never machine-overwrite
	// it on image switch / viewport change. Explicit auto-fit still wins.
	if (!image?.url || image.coverageFramingEdited) return null;
	const suggestion = suggestBackgroundAutoFit(
		viewport.width,
		viewport.height,
		imageSize.width,
		imageSize.height,
		image.rotation,
		image.mirrorFill ? (image.mirrorFillCount ?? 0) : 0
	);
	const alreadyFitted =
		state.imageFitMode === suggestion.fitMode &&
		state.imageScale === suggestion.scale &&
		state.imagePositionX === suggestion.positionX &&
		state.imagePositionY === suggestion.positionY &&
		state.imageFocusX === 0.5 &&
		state.imageFocusY === 0.5;
	if (alreadyFitted) return null;
	return syncStateWithActiveBackgroundImage(state, {
		imageFitMode: suggestion.fitMode,
		imageScale: suggestion.scale,
		imagePositionX: suggestion.positionX,
		imagePositionY: suggestion.positionY,
		imageFocusX: 0.5,
		imageFocusY: 0.5
	});
}
