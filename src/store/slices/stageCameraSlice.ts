import type { StateCreator } from 'zustand';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import {
	createProfileSlotId,
	buildCameraFxProfileName,
	buildLightsProfileName,
	extractCameraFxProfileSettings,
	extractLightsProfileSettings,
	MAX_CAMERA_FX_SLOT_COUNT,
	MAX_LIGHTS_SLOT_COUNT
} from '@/store/featureProfiles';
import { DEFAULT_STATE } from '@/store/defaultState';
import { createMotionLayerActions } from '@/store/slices/motionLayerActions';

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];
type WallpaperGet = Parameters<StateCreator<WallpaperStore>>[1];
type WallpaperApi = Parameters<StateCreator<WallpaperStore>>[2];

/**
 * Setters for radial spectrum rotation drive, Stage Lights FX, and Camera FX.
 * Data + defaults live in `types/wallpaper.ts` and `store/defaultState.ts`; the
 * render-side caps live in `features/stageFx/stageFxConfig.ts`.
 */
export function createStageCameraSlice(
	set: WallpaperSet,
	_get: WallpaperGet,
	_api: WallpaperApi
) {
	return {
		...createMotionLayerActions(set),

		// Radial spectrum rotation
		setSpectrumRotationDrive: v => set({ spectrumRotationDrive: v }),
		setSpectrumRotationAudioAmount: v =>
			set({ spectrumRotationAudioAmount: v }),
		setSpectrumRotationChannel: v => set({ spectrumRotationChannel: v }),
		setSpectrumRotationDirection: v =>
			set({ spectrumRotationDirection: v }),
		setSpectrumRotationSmoothing: v =>
			set({ spectrumRotationSmoothing: v }),
		setSpectrumRotationInvertOnLowEnergy: v =>
			set({ spectrumRotationInvertOnLowEnergy: v }),
		setSpectrumRotationInvertThreshold: v =>
			set({ spectrumRotationInvertThreshold: v }),
		setSpectrumRotationInvertHoldMs: v =>
			set({ spectrumRotationInvertHoldMs: v }),

		// Stage Lights FX
		setStageLightsEnabled: v => set({ stageLightsEnabled: v }),
		setStageLightsIntensity: v => set({ stageLightsIntensity: v }),
		setStageLightsBeamCount: v => set({ stageLightsBeamCount: v }),
		setStageLightsMinBeamCount: v => set({ stageLightsMinBeamCount: v }),
		setStageLightsMaxBeamCount: v => set({ stageLightsMaxBeamCount: v }),
		setStageLightsBeamWidth: v => set({ stageLightsBeamWidth: v }),
		setStageLightsBeamLength: v => set({ stageLightsBeamLength: v }),
		setStageLightsSoftness: v => set({ stageLightsSoftness: v }),
		setStageLightsSpeed: v => set({ stageLightsSpeed: v }),
		setStageLightsFixedMotion: v => set({ stageLightsFixedMotion: v }),
		setStageLightsColorSource: v => set({ stageLightsColorSource: v }),
		setStageLightsColor: v => set({ stageLightsColor: v }),
		setStageLightsAudioReactive: v => set({ stageLightsAudioReactive: v }),
		setStageLightsAudioChannel: v => set({ stageLightsAudioChannel: v }),
		setStageLightsAudioAmount: v => set({ stageLightsAudioAmount: v }),
		setStageLightsAudioOscillationAmount: v =>
			set({ stageLightsAudioOscillationAmount: v }),
		setStageLightsAudioHoldMs: v => set({ stageLightsAudioHoldMs: v }),
		setStageLightsAudioDecay: v => set({ stageLightsAudioDecay: v }),
		setStageLightsAudioGateEnabled: v =>
			set({ stageLightsAudioGateEnabled: v }),
		setStageLightsPeakFlash: v => set({ stageLightsPeakFlash: v }),
		setStageLightsPeakThreshold: v => set({ stageLightsPeakThreshold: v }),
		setStageLightsBandThreshold: (channel, v) =>
			set(state => ({
				stageLightsBandThresholds: {
					...state.stageLightsBandThresholds,
					[channel]: v
				}
			})),
		setStageLightsOpacity: v => set({ stageLightsOpacity: v }),
		setStageLightsBlendMode: v => set({ stageLightsBlendMode: v }),
		setStageLightsOrigin: v => set({ stageLightsOrigin: v }),
		setStageLightsMovementMode: v => set({ stageLightsMovementMode: v }),
		setStageLightsInvertDirection: v =>
			set({ stageLightsInvertDirection: v }),
		setStageLightsMirrorDirections: v =>
			set({ stageLightsMirrorDirections: v }),

		// Flash Light FX
		setFlashLightEnabled: v => set({ flashLightEnabled: v }),
		setFlashLightIntensity: v => set({ flashLightIntensity: v }),
		setFlashLightColorSource: v => set({ flashLightColorSource: v }),
		setFlashLightColor: v => set({ flashLightColor: v }),
		setFlashLightSoftness: v => set({ flashLightSoftness: v }),
		setFlashLightBrightness: v => set({ flashLightBrightness: v }),
		setFlashLightDecay: v => set({ flashLightDecay: v }),
		setFlashLightAudioChannel: v => set({ flashLightAudioChannel: v }),
		setFlashLightThreshold: v => set({ flashLightThreshold: v }),
		setFlashLightBandThreshold: (channel, v) =>
			set(state => ({
				flashLightBandThresholds: {
					...state.flashLightBandThresholds,
					[channel]: v
				}
			})),
		setFlashLightSensitivity: v => set({ flashLightSensitivity: v }),
		setFlashLightRetriggerMs: v => set({ flashLightRetriggerMs: v }),
		setFlashLightShape: v => set({ flashLightShape: v }),
		setFlashLightBlendMode: v => set({ flashLightBlendMode: v }),

		// Logo Flash Edge
		setLogoFlashEdgeEnabled: v => set({ logoFlashEdgeEnabled: v }),
		setLogoFlashEdgeIntensityMult: v =>
			set({ logoFlashEdgeIntensityMult: v }),
		setLogoFlashEdgeThickness: v => set({ logoFlashEdgeThickness: v }),
		setLogoFlashEdgeRadius: v => set({ logoFlashEdgeRadius: v }),
		setLogoFlashEdgeColorMode: v => set({ logoFlashEdgeColorMode: v }),
		setLogoFlashEdgeColor: v => set({ logoFlashEdgeColor: v }),

		// Background Flash Edge
		setBgFlashEdgeEnabled: v => set({ bgFlashEdgeEnabled: v }),
		setBgFlashEdgeIntensityMult: v => set({ bgFlashEdgeIntensityMult: v }),
		setBgFlashEdgeThickness: v => set({ bgFlashEdgeThickness: v }),
		setBgFlashEdgeRadius: v => set({ bgFlashEdgeRadius: v }),
		setBgFlashEdgeColorMode: v => set({ bgFlashEdgeColorMode: v }),
		setBgFlashEdgeColor: v => set({ bgFlashEdgeColor: v }),

		// Camera FX
		setCameraFxEnabled: v => set({ cameraFxEnabled: v }),
		setCameraMotionEnabled: v => set({ cameraMotionEnabled: v }),
		setCameraMotionMode: v => set({ cameraMotionMode: v }),
		setCameraMotionAmount: v => set({ cameraMotionAmount: v }),
		setCameraMotionSpeed: v => set({ cameraMotionSpeed: v }),
		setCameraMotionDrive: v => set({ cameraMotionDrive: v }),
		setCameraMotionAudioInfluence: v =>
			set({ cameraMotionAudioInfluence: v }),
		setCameraMotionAudioChannel: v => set({ cameraMotionAudioChannel: v }),
		setCameraMotionDirection: v => set({ cameraMotionDirection: v }),
		setCameraMotionTarget: v =>
			set({ cameraMotionTarget: v, cameraMotionTargets: [v] }),
		setCameraMotionTargets: v =>
			set({
				cameraMotionTargets: v,
				cameraMotionTarget: v[0] ?? 'background'
			}),
		setCameraShakeEnabled: v => set({ cameraShakeEnabled: v }),
		setCameraShakeAmount: v => set({ cameraShakeAmount: v }),
		setCameraShakeDecay: v => set({ cameraShakeDecay: v }),
		setCameraShakeThreshold: v => set({ cameraShakeThreshold: v }),
		setCameraShakeBandThreshold: (channel, v) =>
			set(state => ({
				cameraShakeBandThresholds: {
					...state.cameraShakeBandThresholds,
					[channel]: v
				}
			})),
		setCameraShakeTargets: v => set({ cameraShakeTargets: v }),
		setCameraShakeSensitivity: v => set({ cameraShakeSensitivity: v }),
		setCameraShakeRetriggerMs: v => set({ cameraShakeRetriggerMs: v }),
		setCameraShakeChannel: v => set({ cameraShakeChannel: v }),
		setCameraShakeMode: v => set({ cameraShakeMode: v }),
		setCameraShakeFrequency: v => set({ cameraShakeFrequency: v }),
		setCameraShakeRoughness: v => set({ cameraShakeRoughness: v }),

		// Lights slot CRUD (stage lights + flash)
		addLightsProfileSlot: () =>
			set(state => {
				if (state.lightsProfileSlots.length >= MAX_LIGHTS_SLOT_COUNT)
					return state;
				return {
					lightsProfileSlots: [
						...state.lightsProfileSlots,
						{
							id: createProfileSlotId(),
							name: `Lights ${state.lightsProfileSlots.length + 1}`,
							values: null
						}
					]
				};
			}),
		removeLightsProfileSlot: index =>
			set(state => {
				if (index < 3 || index >= state.lightsProfileSlots.length)
					return state;
				return {
					lightsProfileSlots: state.lightsProfileSlots.filter(
						(_, i) => i !== index
					)
				};
			}),
		saveLightsProfileSlot: index =>
			set(state => {
				if (index < 0 || index >= state.lightsProfileSlots.length)
					return state;
				const nextSlots = state.lightsProfileSlots.map((slot, i) =>
					i === index
						? {
								...slot,
								name: buildLightsProfileName(state),
								values: extractLightsProfileSettings(state)
							}
						: slot
				);
				return { lightsProfileSlots: nextSlots };
			}),
		loadLightsProfileSlot: index =>
			set(state => {
				const slot = state.lightsProfileSlots[index];
				if (!slot?.values) return state;
				const defaults = extractLightsProfileSettings(
					DEFAULT_STATE as WallpaperStore
				);
				return { ...defaults, ...slot.values };
			}),

		// Camera FX slot CRUD (camera motion + screen shake)
		addCameraFxProfileSlot: () =>
			set(state => {
				if (
					state.cameraFxProfileSlots.length >=
					MAX_CAMERA_FX_SLOT_COUNT
				)
					return state;
				return {
					cameraFxProfileSlots: [
						...state.cameraFxProfileSlots,
						{
							id: createProfileSlotId(),
							name: `Camera ${state.cameraFxProfileSlots.length + 1}`,
							values: null
						}
					]
				};
			}),
		removeCameraFxProfileSlot: index =>
			set(state => {
				if (index < 3 || index >= state.cameraFxProfileSlots.length)
					return state;
				return {
					cameraFxProfileSlots: state.cameraFxProfileSlots.filter(
						(_, i) => i !== index
					)
				};
			}),
		saveCameraFxProfileSlot: index =>
			set(state => {
				if (index < 0 || index >= state.cameraFxProfileSlots.length)
					return state;
				const nextSlots = state.cameraFxProfileSlots.map((slot, i) =>
					i === index
						? {
								...slot,
								name: buildCameraFxProfileName(state),
								values: extractCameraFxProfileSettings(state)
							}
						: slot
				);
				return { cameraFxProfileSlots: nextSlots };
			}),
		loadCameraFxProfileSlot: index =>
			set(state => {
				const slot = state.cameraFxProfileSlots[index];
				if (!slot?.values) return state;
				const defaults = extractCameraFxProfileSettings(
					DEFAULT_STATE as WallpaperStore
				);
				return { ...defaults, ...slot.values };
			})
	} satisfies Partial<WallpaperStore>;
}
