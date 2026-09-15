import type { StateCreator } from 'zustand';
import {
	IMAGE_BASS_ZOOM_PRESETS,
	releaseToLegacyDecay,
	type ImageBassZoomPresetId
} from '@/features/presets/imageBassZoomProfiles';
import {
	createProfileSlotId,
	buildBackgroundProfileName,
	buildLooksProfileName,
	extractBackgroundProfileSettings,
	extractLogoProfileSettings,
	extractLooksProfileSettings,
	hydrateLooksProfileValues,
	extractParticlesProfileSettings,
	extractRainProfileSettings,
	extractSpectrumProfileSettings,
	MAX_LOOKS_SLOT_COUNT,
	MAX_PROFILE_SLOT_COUNT
} from '@/store/featureProfiles';
import {
	buildBackgroundImageCollectionPatch,
	setActiveImageFramingEditedPatch,
	syncActiveBackgroundImage
} from '@/store/backgroundStoreUtils';
import { createBackgroundCollectionActions } from '@/store/slices/backgroundCollectionActions';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import { DEFAULT_STATE } from '@/store/defaultState';
import {
	CUSTOM_FILTER_LOOK_ID,
	fromFilterLookSlotSelectionId,
	extractFilterLookSettingsFromState,
	toFilterLookSlotSelectionId,
	type FilterLookPreset
} from '@/features/filterLooks/filterLooks';
import { generateRandomLooksProfile } from '@/features/filterLooks/looksRandomizer';

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];
type WallpaperGet = Parameters<StateCreator<WallpaperStore>>[1];
type WallpaperApi = Parameters<StateCreator<WallpaperStore>>[2];

export function createBackgroundSlice(
	set: WallpaperSet,
	get: WallpaperGet,
	_api: WallpaperApi
) {
	return {
		setNoiseIntensity: v =>
			set({ noiseIntensity: v, activeFilterLookId: null }),
		setRgbShift: v => set({ rgbShift: v, activeFilterLookId: null }),
		setRgbShiftAudioReactive: v =>
			set({ rgbShiftAudioReactive: v, activeFilterLookId: null }),
		setRgbShiftAudioSensitivity: v =>
			set({ rgbShiftAudioSensitivity: v, activeFilterLookId: null }),
		setRgbShiftAudioChannel: v =>
			set({ rgbShiftAudioChannel: v, activeFilterLookId: null }),
		setRgbShiftAudioSmoothing: v =>
			set({ rgbShiftAudioSmoothing: v, activeFilterLookId: null }),
		setRgbShiftAudioAttack: v =>
			set({ rgbShiftAudioAttack: v, activeFilterLookId: null }),
		setRgbShiftAudioRelease: v =>
			set({ rgbShiftAudioRelease: v, activeFilterLookId: null }),
		setRgbShiftAudioReactivitySpeed: v =>
			set({ rgbShiftAudioReactivitySpeed: v, activeFilterLookId: null }),
		setRgbShiftAudioPeakWindow: v =>
			set({ rgbShiftAudioPeakWindow: v, activeFilterLookId: null }),
		setRgbShiftAudioPeakFloor: v =>
			set({ rgbShiftAudioPeakFloor: v, activeFilterLookId: null }),
		setRgbShiftAudioPunch: v =>
			set({ rgbShiftAudioPunch: v, activeFilterLookId: null }),
		setScanlinesEnabled: v =>
			set({ scanlinesEnabled: v, activeFilterLookId: null }),
		setScanlineIntensity: v =>
			set({ scanlineIntensity: v, activeFilterLookId: null }),
		setScanlineMode: v =>
			set({ scanlineMode: v, activeFilterLookId: null }),
		setScanlineSpacing: v =>
			set({ scanlineSpacing: v, activeFilterLookId: null }),
		setScanlineThickness: v =>
			set({ scanlineThickness: v, activeFilterLookId: null }),
		setParallaxStrength: v => set({ parallaxStrength: v }),
		setImageUrl: v =>
			set(state => {
				if (v === null) {
					return {
						imageUrl: null,
						activeImageId: null
					};
				}

				const match = state.backgroundImages.find(
					image => image.url === v
				);
				if (!match) {
					return {
						imageUrl: v,
						activeImageId: null
					};
				}

				return buildBackgroundImageCollectionPatch(
					state,
					state.backgroundImages,
					match.assetId
				);
			}),
		setImageScale: v =>
			set(state => ({
				imageScale: v,
				...syncActiveBackgroundImage(state, { scale: v })
			})),
		setImagePositionX: v =>
			set(state => ({
				imagePositionX: v,
				...syncActiveBackgroundImage(state, { positionX: v })
			})),
		setImagePositionY: v =>
			set(state => ({
				imagePositionY: v,
				...syncActiveBackgroundImage(state, { positionY: v })
			})),
		setImageFocusPoint: (x, y) =>
			set(state => ({
				imageFocusX: x,
				imageFocusY: y,
				...syncActiveBackgroundImage(state, { focusX: x, focusY: y })
			})),
		setImageOpacity: v =>
			set(state => ({
				imageOpacity: v,
				...syncActiveBackgroundImage(state, { opacity: v })
			})),
		setImageBassReactive: v =>
			set(state => ({
				imageBassReactive: v,
				backgroundImages: state.backgroundImages.map(image => ({
					...image,
					bassReactive: v
				}))
			})),
		setImageCoverageLockEnabled: v => {
			set(state => ({
				imageCoverageLockEnabled: v,
				...syncActiveBackgroundImage(state, {
					coverageLockEnabled: v
				})
			}));
			// Switching the lock ON is explicit user intent: recalculate the
			// active composition from scratch, even over a hand-tuned one.
			// Clearing the provenance flag first makes the (async, passive)
			// refit run through the normal path; the flag clear also means
			// later viewport changes keep re-fitting. Owned by the store so
			// every entry point (UI switch, quick action) recalculates.
			if (v) {
				set(state => setActiveImageFramingEditedPatch(state, false));
				void get().autoFitCoveredActiveImage();
			}
		},
		setImageAudioSmoothing: v =>
			set({ imageAudioSmoothing: v, imageBassZoomPresetId: null }),
		setImageOpacityReactive: v =>
			set({ imageOpacityReactive: v, imageBassZoomPresetId: null }),
		setImageOpacityReactiveAmount: v =>
			set({ imageOpacityReactiveAmount: v, imageBassZoomPresetId: null }),
		setImageOpacityReactiveInvert: v =>
			set({
				imageOpacityReactiveInvert: v,
				imageBassZoomPresetId: null
			}),
		setImageOpacityReactiveThreshold: v =>
			set({
				imageOpacityReactiveThreshold: v,
				imageBassZoomPresetId: null
			}),
		setImageOpacityReactiveSoftness: v =>
			set({
				imageOpacityReactiveSoftness: v,
				imageBassZoomPresetId: null
			}),
		setImageBlurReactive: v =>
			set({ imageBlurReactive: v, imageBassZoomPresetId: null }),
		setImageBlurReactiveAmount: v =>
			set({ imageBlurReactiveAmount: v, imageBassZoomPresetId: null }),
		setImageBlurReactiveInvert: v =>
			set({
				imageBlurReactiveInvert: v,
				imageBassZoomPresetId: null
			}),
		setImageBlurReactiveThreshold: v =>
			set({
				imageBlurReactiveThreshold: v,
				imageBassZoomPresetId: null
			}),
		setImageBlurReactiveSoftness: v =>
			set({
				imageBlurReactiveSoftness: v,
				imageBassZoomPresetId: null
			}),
		setImageBassScaleIntensity: v =>
			set(state => ({
				imageBassScaleIntensity: v,
				backgroundImages: state.backgroundImages.map(image => ({
					...image,
					bassIntensity: v
				}))
			})),
		setImageAudioReactiveDecay: v =>
			set(state => ({
				imageAudioReactiveDecay: v,
				imageBassRelease: 0.02 + (1 - v) * 0.2,
				imageBassZoomPresetId: null,
				backgroundImages: state.backgroundImages.map(image => ({
					...image,
					audioReactiveDecay: v
				}))
			})),
		applyImageBassZoomPreset: (id: ImageBassZoomPresetId) =>
			set(state => {
				const patch = IMAGE_BASS_ZOOM_PRESETS[id];
				const decay = releaseToLegacyDecay(patch.imageBassRelease);
				return {
					...patch,
					imageBassZoomPresetId: id,
					imageAudioReactiveDecay: decay,
					backgroundImages: state.backgroundImages.map(image => ({
						...image,
						audioReactiveDecay: decay
					}))
				};
			}),
		setImageBassAttack: v =>
			set({ imageBassAttack: v, imageBassZoomPresetId: null }),
		setImageBassRelease: v =>
			set(state => {
				const decay = releaseToLegacyDecay(v);
				return {
					imageBassRelease: v,
					imageAudioReactiveDecay: decay,
					imageBassZoomPresetId: null,
					backgroundImages: state.backgroundImages.map(image => ({
						...image,
						audioReactiveDecay: decay
					}))
				};
			}),
		setImageBassReactivitySpeed: v =>
			set({ imageBassReactivitySpeed: v, imageBassZoomPresetId: null }),
		setImageBassPeakWindow: v =>
			set({ imageBassPeakWindow: v, imageBassZoomPresetId: null }),
		setImageBassPeakFloor: v =>
			set({ imageBassPeakFloor: v, imageBassZoomPresetId: null }),
		setImageBassPunch: v =>
			set({ imageBassPunch: v, imageBassZoomPresetId: null }),
		setImageBassReactiveScaleIntensity: v =>
			set({
				imageBassReactiveScaleIntensity: v,
				imageBassZoomPresetId: null
			}),
		setImageAudioChannel: v =>
			set(state => ({
				imageAudioChannel: v,
				imageBassZoomPresetId: null,
				backgroundImages: state.backgroundImages.map(image => ({
					...image,
					audioChannel: v
				}))
			})),
		addBackgroundProfileSlot: () =>
			set(state => {
				if (
					state.backgroundProfileSlots.length >=
					MAX_PROFILE_SLOT_COUNT
				)
					return state;
				return {
					backgroundProfileSlots: [
						...state.backgroundProfileSlots,
						{
							id: createProfileSlotId(),
							name: `BG ${state.backgroundProfileSlots.length + 1}`,
							values: null
						}
					]
				};
			}),
		removeBackgroundProfileSlot: index =>
			set(state => {
				if (index < 3 || index >= state.backgroundProfileSlots.length)
					return state;
				return {
					backgroundProfileSlots: state.backgroundProfileSlots.filter(
						(_, slotIndex) => slotIndex !== index
					)
				};
			}),
		saveBackgroundProfileSlot: index =>
			set(state => {
				if (index < 0 || index >= state.backgroundProfileSlots.length)
					return state;
				const nextSlots = state.backgroundProfileSlots.map(
					(slot, slotIndex) =>
						slotIndex === index
							? {
									...slot,
									name: buildBackgroundProfileName(state),
									values: extractBackgroundProfileSettings(
										state
									)
								}
							: slot
				);
				return { backgroundProfileSlots: nextSlots };
			}),
		loadBackgroundProfileSlot: index =>
			set(state => {
				const slot = state.backgroundProfileSlots[index];
				if (!slot?.values) return state;

				const defaultSettings = extractBackgroundProfileSettings(
					DEFAULT_STATE as WallpaperStore
				);
				const hydratedValues = { ...defaultSettings, ...slot.values };

				return {
					...hydratedValues,
					imageBassZoomPresetId: null,
					backgroundImages: state.backgroundImages.map(image => ({
						...image,
						bassReactive: hydratedValues.imageBassReactive,
						bassIntensity: hydratedValues.imageBassScaleIntensity,
						audioReactiveDecay:
							hydratedValues.imageAudioReactiveDecay,
						audioChannel: hydratedValues.imageAudioChannel
					}))
				};
			}),
		addLooksProfileSlot: () =>
			set(state => {
				if (state.looksProfileSlots.length >= MAX_LOOKS_SLOT_COUNT)
					return state;
				return {
					looksProfileSlots: [
						...state.looksProfileSlots,
						{
							id: createProfileSlotId(),
							name: `Look ${state.looksProfileSlots.length + 1}`,
							values: null
						}
					]
				};
			}),
		removeLooksProfileSlot: index =>
			set(state => {
				if (index < 0 || index >= state.looksProfileSlots.length)
					return state;
				const removed = state.looksProfileSlots[index];
				const activeSlotId = fromFilterLookSlotSelectionId(
					state.activeFilterLookId
				);
				return {
					looksProfileSlots: state.looksProfileSlots.filter(
						(_, i) => i !== index
					),
					activeFilterLookId:
						removed?.id === activeSlotId
							? null
							: state.activeFilterLookId
				};
			}),
		saveLooksProfileSlot: index =>
			set(state => {
				if (index < 0 || index >= state.looksProfileSlots.length)
					return state;
				const nextSlots = state.looksProfileSlots.map((slot, i) =>
					i === index
						? {
								...slot,
								name: buildLooksProfileName(state),
								values: extractLooksProfileSettings(state)
							}
						: slot
				);
				return {
					looksProfileSlots: nextSlots,
					activeFilterLookId: toFilterLookSlotSelectionId(
						nextSlots[index]!.id
					)
				};
			}),
		loadLooksProfileSlot: index =>
			set(state => {
				const slot = state.looksProfileSlots[index];
				if (!slot?.values) return state;
				const defaults = extractLooksProfileSettings(
					DEFAULT_STATE as WallpaperStore
				);
				return {
					...hydrateLooksProfileValues(slot.values, defaults),
					activeFilterLookId: toFilterLookSlotSelectionId(slot.id)
				};
			}),
		setImageLogoProfileSlotIndex: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, logoProfileSlotIndex: v }
						: img
				)
			})),
		setImageSpectrumProfileSlotIndex: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, spectrumProfileSlotIndex: v }
						: img
				)
			})),
		setImageLogoOverride: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, logoOverride: v }
						: img
				)
			})),
		setImageSpectrumOverride: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, spectrumOverride: v }
						: img
				)
			})),
		captureImageLogoOverride: () =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? {
								...img,
								logoOverride: extractLogoProfileSettings(state)
							}
						: img
				)
			})),
		captureImageSpectrumOverride: () =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? {
								...img,
								spectrumOverride:
									extractSpectrumProfileSettings(state)
							}
						: img
				)
			})),
		setImageParticlesProfileSlotIndex: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, particlesProfileSlotIndex: v }
						: img
				)
			})),
		setImageRainProfileSlotIndex: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, rainProfileSlotIndex: v }
						: img
				)
			})),
		setImageLooksProfileSlotIndex: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, looksProfileSlotIndex: v }
						: img
				)
			})),
		setImageParticlesOverride: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, particlesOverride: v }
						: img
				)
			})),
		setImageRainOverride: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, rainOverride: v }
						: img
				)
			})),
		setImageLooksOverride: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, looksOverride: v }
						: img
				)
			})),
		captureImageParticlesOverride: () =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? {
								...img,
								particlesOverride:
									extractParticlesProfileSettings(state)
							}
						: img
				)
			})),
		captureImageRainOverride: () =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? {
								...img,
								rainOverride: extractRainProfileSettings(state)
							}
						: img
				)
			})),
		captureImageLooksOverride: () =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? {
								...img,
								looksOverride:
									extractLooksProfileSettings(state)
							}
						: img
				)
			})),
		setImageFitMode: v =>
			set(state => ({
				imageFitMode: v,
				...syncActiveBackgroundImage(state, { fitMode: v })
			})),
		setImageMirror: v =>
			set(state => ({
				imageMirror: v,
				...syncActiveBackgroundImage(state, { mirror: v })
			})),
		setImageMirrorFill: v =>
			set(state => {
				// When Mirror Fill turns ON, reset the focus point so the user
				// re-picks it in COMPOSITION space (focus is now relative to the
				// full mirrored composition, not the source tile).
				const focusReset =
					v &&
					(state.imageFocusX !== null || state.imageFocusY !== null)
						? { imageFocusX: null, imageFocusY: null }
						: null;
				return {
					imageMirrorFill: v,
					...(focusReset ?? {}),
					...syncActiveBackgroundImage(state, {
						mirrorFill: v,
						...(focusReset ? { focusX: null, focusY: null } : {})
					})
				};
			}),
		setImageMirrorFillInvert: v =>
			set(state => ({
				imageMirrorFillInvert: v,
				...syncActiveBackgroundImage(state, { mirrorFillInvert: v })
			})),
		setImageMirrorFillCount: v =>
			set(state => ({
				imageMirrorFillCount: v,
				...syncActiveBackgroundImage(state, { mirrorFillCount: v })
			})),
		setImageRotation: v =>
			set(state => ({
				imageRotation: v,
				...syncActiveBackgroundImage(state, { rotation: v })
			})),
		setActiveImageFramingEdited: v =>
			set(state => setActiveImageFramingEditedPatch(state, v)),
		setBackgroundImageEnabled: v => set({ backgroundImageEnabled: v }),
		setShowBackgroundScaleMeter: v => set({ showBackgroundScaleMeter: v }),
		setGlobalBackgroundEnabled: v => set({ globalBackgroundEnabled: v }),
		setGlobalBackgroundId: v => set({ globalBackgroundId: v }),
		setGlobalBackgroundUrl: v => set({ globalBackgroundUrl: v }),
		setGlobalBackgroundScale: v => set({ globalBackgroundScale: v }),
		setGlobalBackgroundPositionX: v =>
			set({ globalBackgroundPositionX: v }),
		setGlobalBackgroundPositionY: v =>
			set({ globalBackgroundPositionY: v }),
		setGlobalBackgroundFitMode: v => set({ globalBackgroundFitMode: v }),
		setGlobalBackgroundOpacity: v => set({ globalBackgroundOpacity: v }),
		setGlobalBackgroundBrightness: v =>
			set({ globalBackgroundBrightness: v }),
		setGlobalBackgroundContrast: v => set({ globalBackgroundContrast: v }),
		setGlobalBackgroundSaturation: v =>
			set({ globalBackgroundSaturation: v }),
		setGlobalBackgroundBlur: v => set({ globalBackgroundBlur: v }),
		setGlobalBackgroundHueRotate: v =>
			set({ globalBackgroundHueRotate: v }),
		setFilterTargets: v =>
			set({ filterTargets: v, activeFilterLookId: null }),
		toggleFilterTarget: target =>
			set(state => ({
				filterTargets: state.filterTargets.includes(target)
					? state.filterTargets.filter(item => item !== target)
					: [...state.filterTargets, target],
				activeFilterLookId: null
			})),
		setFilterOpacity: v =>
			set({ filterOpacity: v, activeFilterLookId: null }),
		setFilterBrightness: v =>
			set({ filterBrightness: v, activeFilterLookId: null }),
		setFilterContrast: v =>
			set({ filterContrast: v, activeFilterLookId: null }),
		setFilterSaturation: v =>
			set({ filterSaturation: v, activeFilterLookId: null }),
		setFilterBlur: v => set({ filterBlur: v, activeFilterLookId: null }),
		setFilterHueRotate: v =>
			set({ filterHueRotate: v, activeFilterLookId: null }),
		setFilterVignette: v =>
			set({ filterVignette: v, activeFilterLookId: null }),
		setFilterBloom: v => set({ filterBloom: v, activeFilterLookId: null }),
		setFilterLumaThreshold: v =>
			set({ filterLumaThreshold: v, activeFilterLookId: null }),
		setFilterLensWarp: v =>
			set({ filterLensWarp: v, activeFilterLookId: null }),
		setFilterHeatDistortion: v =>
			set({ filterHeatDistortion: v, activeFilterLookId: null }),
		setActiveFilterLookId: id => set({ activeFilterLookId: id }),
		saveCustomFilterLookFromCurrent: () =>
			set(state => ({
				customFilterLookSettings:
					extractFilterLookSettingsFromState(state),
				activeFilterLookId: CUSTOM_FILTER_LOOK_ID
			})),
		// Unified path: instead of saving to the single legacy
		// `customFilterLookSettings` field, append a new entry in
		// `looksProfileSlots` (same model as logo / spectrum / particles).
		// Returns the index of the new slot in case the UI wants to focus it.
		saveCurrentLooksAsNewSlot: () => {
			let createdIndex: number | null = null;
			set(state => {
				if (state.looksProfileSlots.length >= MAX_LOOKS_SLOT_COUNT) {
					return state;
				}
				createdIndex = state.looksProfileSlots.length;
				const nextSlot = {
					id: createProfileSlotId(),
					name: buildLooksProfileName(state),
					values: extractLooksProfileSettings(state)
				};
				return {
					looksProfileSlots: [...state.looksProfileSlots, nextSlot],
					activeFilterLookId: toFilterLookSlotSelectionId(nextSlot.id)
				};
			});
			return createdIndex;
		},
		randomizeLooks: () => set(generateRandomLooksProfile()),
		// Factory looks only. The legacy single Custom look was folded into the
		// normal slot bank in v110, so there is no second kind of look left to
		// branch on here.
		applyFilterLook: (look: FilterLookPreset) =>
			set({ ...look.settings, activeFilterLookId: look.id }),
		setSlideshowEnabled: v => set({ slideshowEnabled: v }),
		setSlideshowInterval: v => set({ slideshowInterval: v }),
		setSlideshowTransitionDuration: v =>
			set(state => ({
				slideshowTransitionDuration: v,
				...syncActiveBackgroundImage(state, { transitionDuration: v })
			})),
		setSlideshowTransitionType: v =>
			set(state => ({
				slideshowTransitionType: v,
				...syncActiveBackgroundImage(state, { transitionType: v })
			})),
		setSlideshowTransitionIntensity: v =>
			set(state => ({
				slideshowTransitionIntensity: v,
				...syncActiveBackgroundImage(state, { transitionIntensity: v })
			})),
		setSlideshowTransitionAudioDrive: v =>
			set(state => ({
				slideshowTransitionAudioDrive: v,
				...syncActiveBackgroundImage(state, { transitionAudioDrive: v })
			})),
		setSlideshowTransitionAudioChannel: v =>
			set(state => ({
				slideshowTransitionAudioChannel: v,
				...syncActiveBackgroundImage(state, {
					transitionAudioChannel: v
				})
			})),
		setSlideshowTransitionAudioSmoothing: v =>
			set({ slideshowTransitionAudioSmoothing: v }),
		setSlideshowResetPosition: v => set({ slideshowResetPosition: v }),
		setSlideshowAudioCheckpointsEnabled: v =>
			set({ slideshowAudioCheckpointsEnabled: v }),
		setSlideshowTrackChangeSyncEnabled: v =>
			set({ slideshowTrackChangeSyncEnabled: v }),
		setSlideshowManualTimestampsEnabled: v =>
			set({ slideshowManualTimestampsEnabled: v }),
		...createBackgroundCollectionActions(set, get),
		// Derived from the canonical key list instead of a hand-written one.
		// The hand-written version had drifted: it reset four of the ten
		// `rgbShiftAudio*` keys and left `scanlinesEnabled` alone, so "reset"
		// left the tab in a state the user could not reach any other way.
		resetFiltersToDefaults: () =>
			set({
				...extractLooksProfileSettings(DEFAULT_STATE),
				customFilterLookSettings: DEFAULT_STATE.customFilterLookSettings
			})
	} satisfies Partial<WallpaperStore>;
}
