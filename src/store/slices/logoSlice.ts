import type { StateCreator } from 'zustand';
import {
	createProfileSlotId,
	buildLogoProfileName,
	extractLogoProfileSettings,
	MAX_LOGO_SLOT_COUNT
} from '@/store/featureProfiles';
import { DEFAULT_STATE } from '@/store/defaultState';
import { APP_LOGO_URL } from '@/config/appLogo';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];
type WallpaperGet = Parameters<StateCreator<WallpaperStore>>[1];
type WallpaperApi = Parameters<StateCreator<WallpaperStore>>[2];

export function createLogoSlice(
	set: WallpaperSet,
	get: WallpaperGet,
	_api: WallpaperApi
) {
	return {
		setShowLogoDiagnosticsHud: v => set({ showLogoDiagnosticsHud: v }),
		setLogoEnabled: v => set({ logoEnabled: v }),
		setLogoFollowImageFocus: v => {
			set({ logoFollowImageFocus: v });
			// Turning it ON must move the mark right now: waiting for the next
			// image switch would make the switch look broken.
			if (v) void get().applyImageLogoFocus(get().activeImageId);
		},
		setLogoUrl: v => set({ logoUrl: v }),
		setLogoId: v => set({ logoId: v }),
		setLogoVariantMode: v => set({ logoVariantMode: v }),
		setLogoAsset: (id, url) =>
			set({ logoId: id, logoUrl: url, logoEnabled: true }),
		restoreFactoryLogo: () =>
			set({ logoId: null, logoUrl: APP_LOGO_URL, logoEnabled: true }),
		setLogoBaseSize: v => set({ logoBaseSize: v }),
		setLogoPositionX: v => set({ logoPositionX: v }),
		setLogoPositionY: v => set({ logoPositionY: v }),
		setLogoCircularCrop: v => set({ logoCircularCrop: v }),
		setLogoCropRadius: v => set({ logoCropRadius: v }),
		setLogoBandMode: v => set({ logoBandMode: v }),
		setLogoAudioSmoothing: v => set({ logoAudioSmoothing: v }),
		setLogoAudioSensitivity: v => set({ logoAudioSensitivity: v }),
		setLogoReactiveScaleIntensity: v =>
			set({ logoReactiveScaleIntensity: v }),
		setLogoReactivitySpeed: v => set({ logoReactivitySpeed: v }),
		setLogoAttack: v => set({ logoAttack: v }),
		setLogoRelease: v => set({ logoRelease: v }),
		setLogoMinScale: v => set({ logoMinScale: v }),
		setLogoMaxScale: v => set({ logoMaxScale: v }),
		setLogoPunch: v => set({ logoPunch: v }),
		setLogoPeakWindow: v => set({ logoPeakWindow: v }),
		setLogoPeakFloor: v => set({ logoPeakFloor: v }),
		setLogoGlowEnabled: v => set({ logoGlowEnabled: v }),
		setLogoGlowColor: v => set({ logoGlowColor: v }),
		setLogoGlowColorSource: v => set({ logoGlowColorSource: v }),
		setLogoGlowBlur: v => set({ logoGlowBlur: v }),
		setLogoGlowReach: v => set({ logoGlowReach: v }),
		setLogoGlowAudioAmount: v => set({ logoGlowAudioAmount: v }),
		setLogoShadowEnabled: v => set({ logoShadowEnabled: v }),
		setLogoShadowColor: v => set({ logoShadowColor: v }),
		setLogoShadowColorSource: v => set({ logoShadowColorSource: v }),
		setLogoShadowBlur: v => set({ logoShadowBlur: v }),
		setLogoBackdropEnabled: v => set({ logoBackdropEnabled: v }),
		setLogoBackdropColor: v => set({ logoBackdropColor: v }),
		setLogoBackdropColorSource: v => set({ logoBackdropColorSource: v }),
		setLogoBackdropOpacity: v => set({ logoBackdropOpacity: v }),
		setLogoBackdropPadding: v => set({ logoBackdropPadding: v }),
		setLogoRotationSpeed: v => set({ logoRotationSpeed: v }),
		addLogoProfileSlot: () =>
			set(state => {
				if (state.logoProfileSlots.length >= MAX_LOGO_SLOT_COUNT)
					return state;
				return {
					logoProfileSlots: [
						...state.logoProfileSlots,
						{
							id: createProfileSlotId(),
							name: `Logo ${state.logoProfileSlots.length + 1}`,
							values: null
						}
					]
				};
			}),
		removeLogoProfileSlot: index =>
			set(state => {
				if (index < 3 || index >= state.logoProfileSlots.length)
					return state;
				return {
					logoProfileSlots: state.logoProfileSlots.filter(
						(_, slotIndex) => slotIndex !== index
					)
				};
			}),
		saveLogoProfileSlot: index =>
			set(state => {
				if (index < 0 || index >= state.logoProfileSlots.length)
					return state;
				const nextSlots = state.logoProfileSlots.map(
					(slot, slotIndex) =>
						slotIndex === index
							? {
									...slot,
									name: buildLogoProfileName(state),
									values: extractLogoProfileSettings(state)
								}
							: slot
				);
				return { logoProfileSlots: nextSlots };
			}),
		loadLogoProfileSlot: index =>
			set(state => {
				const slot = state.logoProfileSlots[index];
				if (!slot?.values) return state;
				const defaultSettings = extractLogoProfileSettings(
					DEFAULT_STATE as WallpaperStore
				);
				// Loading a slot always enables the logo — the slot defines appearance,
				// not visibility. A disabled flag saved in an old slot is never intentional.
				return {
					...defaultSettings,
					...slot.values,
					logoEnabled: true
				};
			})
	} satisfies Partial<WallpaperStore>;
}
