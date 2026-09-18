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
import { getImageBaseSize, resolveImageTransform } from '@/features/background';
import { resolveAutoZoomScale } from '@/features/background/domain/autoZoom';
import {
	extractLooksProfileSettings,
	extractParticlesProfileSettings,
	extractRainProfileSettings
} from '@/store/featureProfiles';
import {
	buildBackgroundImageCollectionPatch,
	syncStateWithActiveBackgroundImage
} from '@/store/backgroundStoreUtils';
import type { BackgroundImageItem, WallpaperState } from '@/types/wallpaper';

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
 * The passive raise-only refit: RAISE the stored scale to the coverage minimum
 * (never lower it — a deliberate zoom-in is kept) and clamp the composition
 * center back into coverage bounds. `fitMode` and the focus point are user
 * intent and are NEVER touched. Returns `null` when already fitted.
 * This is the engine behind `buildCoveredAutoFitPatch` (viewport / image
 * switch refits). The explicit Cover Fit buttons use `buildCoverFitPatch`,
 * which fits exactly instead of raising.
 */
export function buildAutoZoomPatch(
	state: WallpaperState,
	imageSize: { width: number; height: number },
	viewport: { width: number; height: number }
): Partial<WallpaperState> | null {
	const image = state.backgroundImages.find(
		img => img.assetId === state.activeImageId
	);
	if (!image?.url) return null;
	const mirrorFillCount = image.mirrorFill ? (image.mirrorFillCount ?? 0) : 0;
	const base = getImageBaseSize(
		viewport.width,
		viewport.height,
		imageSize.width,
		imageSize.height,
		state.imageFitMode
	);
	const autoZoomMin = resolveAutoZoomScale({
		viewportWidth: viewport.width,
		viewportHeight: viewport.height,
		tileWidthAtScaleOne: base.width,
		tileHeightAtScaleOne: base.height,
		mirrorFillCount,
		rotation: image.rotation
	});
	const nextScale = Math.max(state.imageScale, autoZoomMin);
	// Re-resolve the composition at the new scale: its effective position is
	// the authored position CLAMPED into coverage bounds. This is the same
	// clamp the renderer applies, so the stored state and the drawn result
	// cannot disagree.
	const resolved = resolveImageTransform({
		viewportWidth: viewport.width,
		viewportHeight: viewport.height,
		imageWidth: imageSize.width,
		imageHeight: imageSize.height,
		fitMode: state.imageFitMode,
		scale: nextScale,
		positionX: state.imagePositionX,
		positionY: state.imagePositionY,
		rotation: image.rotation,
		mirror: state.imageMirror,
		keepCovered: true,
		mirrorFill: image.mirrorFill,
		mirrorFillInvert: state.imageMirrorFillInvert,
		mirrorFillCount
	});
	const alreadyFitted =
		state.imageScale === nextScale &&
		state.imagePositionX === resolved.effectivePositionX &&
		state.imagePositionY === resolved.effectivePositionY;
	if (alreadyFitted) return null;
	return syncStateWithActiveBackgroundImage(state, {
		imageScale: nextScale,
		imagePositionX: resolved.effectivePositionX,
		imagePositionY: resolved.effectivePositionY
	});
}

/**
 * Keep Covered refit of the active image for a viewport, or `null` when it
 * does not apply (manual framing mode, hand-tuned framing, already fitted). The hand-tuned guard
 * (`coverageFramingEdited`) is provenance set by the user's manual framing;
 * the explicit Cover Fit buttons clear it because they ARE the deliberate
 * recalculation.
 */
export function buildCoveredAutoFitPatch(
	state: WallpaperState,
	imageSize: { width: number; height: number },
	viewport: { width: number; height: number }
): Partial<WallpaperState> | null {
	// Manual framing: the coverage math is off, so nothing refits behind the
	// user's back. The renderer skips the clamp for the same reason.
	if (state.imageFramingManualEnabled) return null;
	if (!state.activeImageId) return null;
	// A hand-tuned composition is the user's intent: never machine-overwrite
	// it on image switch / viewport change.
	const image = state.backgroundImages.find(
		img => img.assetId === state.activeImageId
	);
	if (image?.coverageFramingEdited) return null;
	return buildAutoZoomPatch(state, imageSize, viewport);
}

/**
 * The exact covered framing for one image at `viewport`: scale set exactly to
 * the coverage minimum (a machine framing may shrink as well as grow) and the
 * composition center clamped into coverage bounds. `fitMode` and the focus
 * point are user intent and are NEVER touched.
 */
function computeCoverFit(
	image: BackgroundImageItem,
	imageSize: { width: number; height: number },
	viewport: { width: number; height: number }
): { scale: number; positionX: number; positionY: number } {
	const mirrorFillCount = image.mirrorFill ? (image.mirrorFillCount ?? 0) : 0;
	const base = getImageBaseSize(
		viewport.width,
		viewport.height,
		imageSize.width,
		imageSize.height,
		image.fitMode
	);
	const coverScale = resolveAutoZoomScale({
		viewportWidth: viewport.width,
		viewportHeight: viewport.height,
		tileWidthAtScaleOne: base.width,
		tileHeightAtScaleOne: base.height,
		mirrorFillCount,
		rotation: image.rotation
	});
	// Re-resolve the composition at the exact scale: its effective position is
	// the authored position CLAMPED into coverage bounds. This is the same
	// clamp the renderer applies (focus included), so the stored state and the
	// drawn result cannot disagree.
	const resolved = resolveImageTransform({
		viewportWidth: viewport.width,
		viewportHeight: viewport.height,
		imageWidth: imageSize.width,
		imageHeight: imageSize.height,
		fitMode: image.fitMode,
		scale: coverScale,
		positionX: image.positionX,
		positionY: image.positionY,
		rotation: image.rotation,
		mirror: image.mirror,
		keepCovered: true,
		focusX: image.focusX,
		focusY: image.focusY,
		mirrorFill: image.mirrorFill,
		mirrorFillInvert: image.mirrorFillInvert,
		mirrorFillCount
	});
	return {
		scale: coverScale,
		positionX: resolved.effectivePositionX,
		positionY: resolved.effectivePositionY
	};
}

function isExactFit(
	image: BackgroundImageItem,
	fit: { scale: number; positionX: number; positionY: number }
): boolean {
	return (
		image.scale === fit.scale &&
		image.positionX === fit.positionX &&
		image.positionY === fit.positionY &&
		!image.coverageFramingEdited
	);
}

/**
 * The explicit Cover Fit of the ACTIVE image: exact covered framing +
 * `coverageFramingEdited: false` (the result is machine framing again, so a
 * later viewport change may refit it). Globals and the active item move
 * together. Returns `null` when already exactly fitted.
 */
export function buildCoverFitPatch(
	state: WallpaperState,
	imageSize: { width: number; height: number },
	viewport: { width: number; height: number }
): Partial<WallpaperState> | null {
	const image = state.backgroundImages.find(
		img => img.assetId === state.activeImageId
	);
	if (!image?.url) return null;
	const fit = computeCoverFit(image, imageSize, viewport);
	if (isExactFit(image, fit)) return null;
	return {
		imageScale: fit.scale,
		imagePositionX: fit.positionX,
		imagePositionY: fit.positionY,
		backgroundImages: state.backgroundImages.map(img =>
			img.assetId === state.activeImageId
				? {
						...img,
						scale: fit.scale,
						positionX: fit.positionX,
						positionY: fit.positionY,
						coverageFramingEdited: false
					}
				: img
		)
	};
}

/**
 * The explicit Cover Fit of EVERY background image with loaded dimensions:
 * per-item exact framing (each item's own fitMode / focus / mirror geometry),
 * provenance cleared across the board. Items without dims keep their framing.
 * Globals are re-synced from the new active item. `null` when nothing changed.
 */
export function buildCoverFitAllImagesPatch(
	state: WallpaperState,
	dimsByAssetId: Record<
		string,
		{ width: number; height: number } | undefined
	>,
	viewport: { width: number; height: number }
): Partial<WallpaperState> | null {
	let changed = false;
	const backgroundImages = state.backgroundImages.map(image => {
		const dims = dimsByAssetId[image.assetId];
		if (!image.url || !dims) return image;
		const fit = computeCoverFit(image, dims, viewport);
		if (isExactFit(image, fit)) return image;
		changed = true;
		return {
			...image,
			scale: fit.scale,
			positionX: fit.positionX,
			positionY: fit.positionY,
			coverageFramingEdited: false
		};
	});
	if (!changed) return null;
	return buildBackgroundImageCollectionPatch(
		state,
		backgroundImages,
		state.activeImageId
	);
}
