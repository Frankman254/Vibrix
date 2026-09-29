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
import { resolveImageTransform } from '@/features/background';
import {
	extractCameraFxProfileSettings,
	extractLightsProfileSettings,
	extractLooksProfileSettings,
	extractParticlesProfileSettings,
	extractRainProfileSettings,
	extractTrackTitleProfileSettings,
	hydrateLooksProfileValues
} from '@/store/featureProfiles';
import {
	buildGlobalCompositionPatch,
	resolveActiveGlobalCompositionSlot
} from '@/store/globalComposition';
import {
	buildBackgroundImageCollectionPatch,
	syncStateWithActiveBackgroundImage
} from '@/store/backgroundStoreUtils';
import type { BackgroundImageItem, WallpaperState } from '@/types/wallpaper';

/** The responsive-layout keys the coverage math has to see. */
type CoverageLayout = Pick<
	WallpaperState,
	| 'layoutResponsiveEnabled'
	| 'layoutBackgroundReframeEnabled'
	| 'layoutReferenceWidth'
	| 'layoutReferenceHeight'
>;

function coverageLayout(state: WallpaperState): CoverageLayout {
	return {
		layoutResponsiveEnabled: state.layoutResponsiveEnabled,
		layoutBackgroundReframeEnabled: state.layoutBackgroundReframeEnabled,
		layoutReferenceWidth: state.layoutReferenceWidth,
		layoutReferenceHeight: state.layoutReferenceHeight
	};
}

/**
 * The AUTHORED scale at which the drawn composition sits exactly on the
 * coverage minimum, plus the composition center clamped into coverage bounds
 * at that scale.
 *
 * Two resolves on purpose, and they are not interchangeable:
 * - WITH the layout, to read `minAuthoredScaleForCoverage`: the background
 *   reframe multiplies whatever is stored, so the drawn minimum is not the
 *   number to store. Writing `minScaleForCoverage` straight into `imageScale`
 *   is exactly the over-zoom this function exists to avoid.
 * - WITHOUT it, to clamp the position: `effectivePositionX/Y` under a layout is
 *   the REFRAMED position, and storing that as the authored value would reframe
 *   it twice. The renderer clamps the position for coverage on every frame
 *   anyway, so the authored-space clamp is all the store needs.
 */
function resolveCoverFraming(params: {
	imageSize: { width: number; height: number };
	viewport: { width: number; height: number };
	layout: CoverageLayout;
	fitMode: BackgroundImageItem['fitMode'];
	positionX: number;
	positionY: number;
	rotation: number;
	mirror: boolean;
	focusX?: number | null;
	focusY?: number | null;
	mirrorFill?: boolean;
	mirrorFillInvert?: boolean;
	mirrorFillCount: number;
	/** Floor the result at the stored scale (the raise-only AutoZoom rule). */
	raiseOnlyFrom?: number;
}): { scale: number; positionX: number; positionY: number } {
	const geometry = {
		viewportWidth: params.viewport.width,
		viewportHeight: params.viewport.height,
		imageWidth: params.imageSize.width,
		imageHeight: params.imageSize.height,
		fitMode: params.fitMode,
		positionX: params.positionX,
		positionY: params.positionY,
		rotation: params.rotation,
		mirror: params.mirror,
		keepCovered: true,
		focusX: params.focusX ?? null,
		focusY: params.focusY ?? null,
		mirrorFill: params.mirrorFill,
		mirrorFillInvert: params.mirrorFillInvert,
		mirrorFillCount: params.mirrorFillCount
	};
	const { minAuthoredScaleForCoverage } = resolveImageTransform({
		...geometry,
		scale: params.raiseOnlyFrom ?? 1,
		layout: params.layout
	});
	const scale =
		params.raiseOnlyFrom != null
			? Math.max(params.raiseOnlyFrom, minAuthoredScaleForCoverage)
			: minAuthoredScaleForCoverage;
	const resolved = resolveImageTransform({ ...geometry, scale });
	return {
		scale,
		positionX: resolved.effectivePositionX,
		positionY: resolved.effectivePositionY
	};
}

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

	// Global composition mode: the global layer wins. Switching image only
	// changes the picture — no scene, no override, no slot binding — and
	// nothing stored is touched, so turning the mode off restores everything.
	// An image can opt out of the mode with `ignoreGlobalOverride`.
	if (state.globalCompositionOverride && !match.ignoreGlobalOverride) {
		// With a captured slot selected, the mode APPLIES that slot on every
		// image; with none, it keeps its original behaviour of freezing what is
		// already on screen. Either way no image is written to.
		const globalSlot = resolveActiveGlobalCompositionSlot(state);
		if (globalSlot?.values) {
			Object.assign(
				patch,
				buildGlobalCompositionPatch(state, globalSlot.values)
			);
		}
		return { patch, appliedScene: false };
	}

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
	// Both paths hydrate: an override or slot saved before effect layers
	// existed holds only the flat `filter*` keys, and writing those raw would
	// land them on whichever layer happens to be active — which is how a
	// per-image look could end up masked by a layer above it.
	if (match.looksOverride) {
		Object.assign(
			patch,
			hydrateLooksProfileValues(
				match.looksOverride,
				extractLooksProfileSettings(state)
			)
		);
	} else if (looksSlot?.values) {
		Object.assign(
			patch,
			hydrateLooksProfileValues(
				looksSlot.values,
				extractLooksProfileSettings(state)
			)
		);
	}
	// Camera FX, Lights and Track Title carry their own enable flags on purpose
	// — that is how a stored composition says "and no shake here" — so unlike
	// logo/spectrum these are applied exactly as saved. The defaults underneath
	// fill keys a snapshot from an older build does not have.
	if (match.cameraFxOverride) {
		Object.assign(
			patch,
			extractCameraFxProfileSettings(state),
			match.cameraFxOverride
		);
	}
	if (match.lightsOverride) {
		Object.assign(
			patch,
			extractLightsProfileSettings(state),
			match.lightsOverride
		);
	}
	if (match.trackTitleOverride) {
		Object.assign(
			patch,
			extractTrackTitleProfileSettings(state),
			match.trackTitleOverride
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
	const framing = resolveCoverFraming({
		imageSize,
		viewport,
		layout: coverageLayout(state),
		fitMode: state.imageFitMode,
		positionX: state.imagePositionX,
		positionY: state.imagePositionY,
		rotation: image.rotation,
		mirror: state.imageMirror,
		mirrorFill: image.mirrorFill,
		mirrorFillInvert: state.imageMirrorFillInvert,
		mirrorFillCount: image.mirrorFill ? (image.mirrorFillCount ?? 0) : 0,
		raiseOnlyFrom: state.imageScale
	});
	const alreadyFitted =
		state.imageScale === framing.scale &&
		state.imagePositionX === framing.positionX &&
		state.imagePositionY === framing.positionY;
	if (alreadyFitted) return null;
	return syncStateWithActiveBackgroundImage(state, {
		imageScale: framing.scale,
		imagePositionX: framing.positionX,
		imagePositionY: framing.positionY
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
 * The exact covered framing for one image at `viewport`: the authored scale at
 * which the DRAWN composition lands exactly on the coverage minimum (a machine
 * framing may shrink as well as grow) and the composition center clamped into
 * coverage bounds. `fitMode` and the focus point are user intent and are NEVER
 * touched.
 */
function computeCoverFit(
	image: BackgroundImageItem,
	imageSize: { width: number; height: number },
	viewport: { width: number; height: number },
	layout: CoverageLayout
): { scale: number; positionX: number; positionY: number } {
	return resolveCoverFraming({
		imageSize,
		viewport,
		layout,
		fitMode: image.fitMode,
		positionX: image.positionX,
		positionY: image.positionY,
		rotation: image.rotation,
		mirror: image.mirror,
		focusX: image.focusX,
		focusY: image.focusY,
		mirrorFill: image.mirrorFill,
		mirrorFillInvert: image.mirrorFillInvert,
		mirrorFillCount: image.mirrorFill ? (image.mirrorFillCount ?? 0) : 0
	});
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
	const fit = computeCoverFit(
		image,
		imageSize,
		viewport,
		coverageLayout(state)
	);
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
		const fit = computeCoverFit(
			image,
			dims,
			viewport,
			coverageLayout(state)
		);
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
