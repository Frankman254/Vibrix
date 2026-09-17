import type { StateCreator } from 'zustand';
import {
	FACTORY_DEFAULT_STATE,
	getFactoryDefaultValue
} from '@/store/factoryDefaults';
import { CANONICAL_FACTORY_SETTINGS_PATCH } from '@/lib/canonicalFactoryPresets';
import {
	createCustomPresetId,
	extractPresetValues,
	resolvePreset
} from '@/features/presets/presets';
import {
	buildSceneSlotActivationPatch,
	createEmptySceneSlot,
	defaultSceneSlotName,
	normalizeSceneSlotAgainstState
} from '@/features/scenes/sceneSlot';
import {
	ALL_SCENE_CAPTURE_KINDS,
	captureSceneSlot
} from '@/features/scenes/captureSceneSlot';
import { invalidateSpectrumPresetMorph } from '@/features/spectrum';
import {
	readPersistedSpectrumTarget,
	writePersistedSpectrumTarget
} from '@/features/spectrum';
import { syncStateWithActiveBackgroundImage } from '@/store/backgroundStoreUtils';
import {
	convertLegacySpectrumCloneState,
	hasLegacySpectrumCloneData
} from '@/features/spectrum';
import type { ColorSourceMode, SpectrumInstance } from '@/types/wallpaper';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';

const MAX_SCENE_SLOTS = 40;

/**
 * Normalize a hex string into the canonical `#RRGGBB` lowercase form used
 * by the global favourites palette. Accepts 3- or 6-digit hex with or
 * without leading hash. Returns `null` for anything that doesn't parse,
 * so callers can reject silently instead of polluting the store.
 */
function withInstancesColorSource(
	instances: SpectrumInstance[],
	source: ColorSourceMode
): SpectrumInstance[] {
	return instances.map(instance => ({
		...instance,
		spectrumColorSource: source
	}));
}

function normalizeFavouriteHex(hex: string): string | null {
	if (typeof hex !== 'string') return null;
	const trimmed = hex.trim().replace(/^#/, '');
	if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
		const r = trimmed[0];
		const g = trimmed[1];
		const b = trimmed[2];
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
		return `#${trimmed}`.toLowerCase();
	}
	return null;
}

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];
type WallpaperGet = Parameters<StateCreator<WallpaperStore>>[1];
type WallpaperApi = Parameters<StateCreator<WallpaperStore>>[2];

export function createSystemSlice(
	set: WallpaperSet,
	get: WallpaperGet,
	_api: WallpaperApi
) {
	return {
		setPerformanceMode: v =>
			set(state => {
				if (state.performanceSafeEnabled) {
					return {
						performanceSafeEnabled: false,
						performanceModeBeforeSafe: null,
						performanceMode: v
					};
				}
				return { performanceMode: v };
			}),
		setPerformanceSafeEnabled: enabled =>
			set(state => {
				if (enabled) {
					if (state.performanceSafeEnabled) return {};
					return {
						performanceSafeEnabled: true,
						performanceModeBeforeSafe: state.performanceMode,
						performanceMode: 'low'
					};
				}
				if (!state.performanceSafeEnabled) return {};
				return {
					performanceSafeEnabled: false,
					performanceMode:
						state.performanceModeBeforeSafe ??
						state.performanceMode,
					performanceModeBeforeSafe: null
				};
			}),
		dismissDiscoveryOnboarding: () =>
			set({ discoveryOnboardingDismissed: true }),
		surpriseMe: () => {
			invalidateSpectrumPresetMorph();
			const pool = get().sceneSlots;
			if (pool.length === 0) return;
			const slot =
				pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
			if (!slot) return;
			set(state =>
				syncStateWithActiveBackgroundImage(state, {
					...buildSceneSlotActivationPatch(state, slot),
					activeSceneSlotId: slot.id
				})
			);
		},
		setLanguage: v => set({ language: v }),
		setShowFps: v => set({ showFps: v }),
		setSceneServiceBaseUrl: v =>
			set({ sceneServiceBaseUrl: v.trim().replace(/\/+$/, '') }),
		setControlPanelAnchor: v =>
			set({
				controlPanelAnchor: v,
				controlPanelOffsetX: 0,
				controlPanelOffsetY: 0
			}),
		setControlPanelOffset: (x, y) =>
			set({ controlPanelOffsetX: x, controlPanelOffsetY: y }),
		setHudLiquidGlassEnabled: v => set({ hudLiquidGlassEnabled: v }),
		setQuickEditCaptureMode: v => set({ quickEditCaptureMode: v }),
		// Cap favourites at 32 entries (FIFO when full). Always normalise hex
		// to lowercase so the dedup check doesn't keep both '#FF00FF' and
		// '#ff00ff' as separate favourites.
		addColorFavorite: hex =>
			set(state => {
				const normalized = normalizeFavouriteHex(hex);
				if (!normalized) return state;
				const existing = state.colorFavorites ?? [];
				if (existing.includes(normalized)) {
					// Promote to first slot so MRU works without growing list.
					const filtered = existing.filter(c => c !== normalized);
					return { colorFavorites: [normalized, ...filtered] };
				}
				const capped = [normalized, ...existing].slice(0, 32);
				return { colorFavorites: capped };
			}),
		removeColorFavorite: hex =>
			set(state => {
				const normalized = normalizeFavouriteHex(hex);
				if (!normalized) return state;
				const existing = state.colorFavorites ?? [];
				return {
					colorFavorites: existing.filter(c => c !== normalized)
				};
			}),
		setColorFavorites: list =>
			set(() => ({
				colorFavorites: list
					.map(normalizeFavouriteHex)
					.filter((c): c is string => c !== null)
					.slice(0, 32)
			})),
		setControlPanelActiveTab: v => set({ controlPanelActiveTab: v }),
		// Shared active Spectrum target (editor + HUD). UI selection only — it
		// never changes visual settings by itself. Persisted as a localStorage UI
		// preference, excluded from project state (see partializeWallpaperStore).
		activeSpectrumTarget: readPersistedSpectrumTarget(),
		setActiveSpectrumTarget: v => {
			writePersistedSpectrumTarget(v);
			set({ activeSpectrumTarget: v });
		},
		setFpsOverlayAnchor: v => set({ fpsOverlayAnchor: v }),
		setEditorTheme: v => set({ editorTheme: v }),
		setEditorThemeColorSource: v => set({ editorThemeColorSource: v }),
		setEditorCornerRadius: v => set({ editorCornerRadius: v }),
		setEditorControlCornerRadius: v =>
			set({ editorControlCornerRadius: v }),
		setEditorUiScale: v =>
			// Clamp at the slice level so any caller (HUD, future hotkeys,
			// imported presets) gets the same valid range without copy-pasting it.
			set({ editorUiScale: Math.min(2, Math.max(0.7, v)) }),
		setEditorShowPreciseNumericControls: v =>
			set({ editorShowPreciseNumericControls: v }),
		setEditorCompactSlotIcons: v => set({ editorCompactSlotIcons: v }),
		setEditorImagePreviewQuality: v =>
			set({ editorImagePreviewQuality: v }),
		// Color source ownership contract:
		// - editorThemeColorSource + quickActionsColorSource => UI shell owner
		// - spectrum/logo/particles/rain/track-*/lyrics-* => canvas owners
		// Use the focused setters below for owner-scoped updates.
		// Sets only the UI-shell color source (editor panel + HUD).
		setEditorShellColorSource: v =>
			set({
				editorThemeColorSource: v,
				quickActionsColorSource: v
			}),
		// Per-feature batched setters. Each one syncs every color source that
		// belongs to a single subsystem so the UI can offer a "set all colors
		// for X" shortcut without leaking into other subsystems.
		setSpectrumColorSources: v =>
			set(state => ({
				spectrumColorSource: v,
				spectrumInstances: withInstancesColorSource(
					state.spectrumInstances,
					v
				)
			})),
		setLogoColorSources: v =>
			set({
				logoGlowColorSource: v,
				logoShadowColorSource: v,
				logoBackdropColorSource: v
			}),
		setMotionColorSources: v =>
			set({
				particleColorSource: v,
				rainColorSource: v
			}),
		setTrackTitleColorSources: v =>
			set({
				audioTrackTitleTextColorSource: v,
				audioTrackTitleStrokeColorSource: v,
				audioTrackTitleGlowColorSource: v,
				audioTrackTitleBackdropColorSource: v,
				audioTrackTimeTextColorSource: v,
				audioTrackTimeStrokeColorSource: v,
				audioTrackTimeGlowColorSource: v
			}),
		setLyricsColorSources: v =>
			set({
				audioLyricsActiveColorSource: v,
				audioLyricsInactiveColorSource: v,
				audioLyricsStrokeColorSource: v,
				audioLyricsGlowColorSource: v,
				audioLyricsBackdropColorSource: v
			}),
		// Sets every canvas/content color source (spectrum, logo, particles,
		// rain, audio track overlays, lyrics) to the same value.
		setCanvasColorSources: v =>
			set(state => ({
				spectrumInstances: withInstancesColorSource(
					state.spectrumInstances,
					v
				),
				spectrumColorSource: v,
				logoGlowColorSource: v,
				logoShadowColorSource: v,
				logoBackdropColorSource: v,
				particleColorSource: v,
				rainColorSource: v,
				audioTrackTitleTextColorSource: v,
				audioTrackTitleStrokeColorSource: v,
				audioTrackTitleGlowColorSource: v,
				audioTrackTitleBackdropColorSource: v,
				audioTrackTimeTextColorSource: v,
				audioTrackTimeStrokeColorSource: v,
				audioTrackTimeGlowColorSource: v,
				audioLyricsActiveColorSource: v,
				audioLyricsInactiveColorSource: v,
				audioLyricsStrokeColorSource: v,
				audioLyricsGlowColorSource: v,
				audioLyricsBackdropColorSource: v
			})),
		// Convenience action only: sync every color source to the same value.
		// This is an explicit batch update for UX shortcuts ("sync all"), not a
		// single source of truth. Domain owners still remain per-feature.
		syncAllColorSources: v =>
			set(state => ({
				editorThemeColorSource: v,
				quickActionsColorSource: v,
				spectrumInstances: withInstancesColorSource(
					state.spectrumInstances,
					v
				),
				spectrumColorSource: v,
				logoGlowColorSource: v,
				logoShadowColorSource: v,
				logoBackdropColorSource: v,
				particleColorSource: v,
				rainColorSource: v,
				audioTrackTitleTextColorSource: v,
				audioTrackTitleStrokeColorSource: v,
				audioTrackTitleGlowColorSource: v,
				audioTrackTitleBackdropColorSource: v,
				audioTrackTimeTextColorSource: v,
				audioTrackTimeStrokeColorSource: v,
				audioTrackTimeGlowColorSource: v,
				audioLyricsActiveColorSource: v,
				audioLyricsInactiveColorSource: v,
				audioLyricsStrokeColorSource: v,
				audioLyricsGlowColorSource: v,
				audioLyricsBackdropColorSource: v
			})),
		setEditorManualAccentColor: v => set({ editorManualAccentColor: v }),
		setEditorManualSecondaryColor: v =>
			set({ editorManualSecondaryColor: v }),
		setEditorManualBackdropColor: v =>
			set({ editorManualBackdropColor: v }),
		setEditorManualTextPrimaryColor: v =>
			set({ editorManualTextPrimaryColor: v }),
		setEditorManualTextSecondaryColor: v =>
			set({ editorManualTextSecondaryColor: v }),
		setEditorManualBackdropOpacity: v =>
			set({ editorManualBackdropOpacity: v }),
		setEditorManualBlurPx: v => set({ editorManualBlurPx: v }),
		setEditorManualSurfaceOpacity: v =>
			set({ editorManualSurfaceOpacity: v }),
		setEditorManualItemOpacity: v => set({ editorManualItemOpacity: v }),
		setQuickActionsEnabled: v => set({ quickActionsEnabled: v }),
		setQuickActionsPositionX: v => set({ quickActionsPositionX: v }),
		setQuickActionsPositionY: v => set({ quickActionsPositionY: v }),
		setQuickActionsLauncherPositionX: v =>
			set({ quickActionsLauncherPositionX: v }),
		setQuickActionsLauncherPositionY: v =>
			set({ quickActionsLauncherPositionY: v }),
		setQuickActionsBackdropOpacity: v =>
			set({ quickActionsBackdropOpacity: v }),
		setQuickActionsBlurPx: v => set({ quickActionsBlurPx: v }),
		setQuickActionsScale: v => set({ quickActionsScale: v }),
		setQuickActionsLauncherSize: v => set({ quickActionsLauncherSize: v }),
		setQuickActionsColorSource: v => set({ quickActionsColorSource: v }),
		setQuickActionsManualAccentColor: v =>
			set({ quickActionsManualAccentColor: v }),
		setQuickActionsManualSecondaryColor: v =>
			set({ quickActionsManualSecondaryColor: v }),
		setQuickActionsManualBackdropColor: v =>
			set({ quickActionsManualBackdropColor: v }),
		setQuickActionsManualTextPrimaryColor: v =>
			set({ quickActionsManualTextPrimaryColor: v }),
		setQuickActionsManualTextSecondaryColor: v =>
			set({ quickActionsManualTextSecondaryColor: v }),
		setQuickActionsManualSurfaceOpacity: v =>
			set({ quickActionsManualSurfaceOpacity: v }),
		setQuickActionsManualItemOpacity: v =>
			set({ quickActionsManualItemOpacity: v }),
		setSleepModeEnabled: v => set({ sleepModeEnabled: v }),
		setSleepModeDelaySeconds: v => set({ sleepModeDelaySeconds: v }),
		setSleepModeActive: v => set({ sleepModeActive: v }),
		setVirtualFoldersEnabled: v => set({ virtualFoldersEnabled: v }),
		setUIMode: v => set({ uiMode: v }),
		setEnableDragMode: v =>
			set(state => ({
				enableDragMode: v,
				activeTool: v
					? state.activeTool === 'none'
						? 'logo'
						: state.activeTool
					: 'none'
			})),
		setActiveTool: v => set({ activeTool: v }),
		setDragTool: v => set({ activeTool: v, enableDragMode: v !== 'none' }),
		setLayerZIndex: (id, zIndex) =>
			set(state => ({
				layerZIndices: {
					...state.layerZIndices,
					[id]: zIndex
				}
			})),
		resetLayerZIndices: () => set({ layerZIndices: {} }),
		backgroundFallbackVisible: false,
		setBackgroundFallbackVisible: v =>
			set({ backgroundFallbackVisible: v }),
		restoreFactorySettingsDefaults: () =>
			set(state =>
				syncStateWithActiveBackgroundImage(
					state,
					CANONICAL_FACTORY_SETTINGS_PATCH
				)
			),
		applyPreset: id =>
			set(state => {
				const preset = resolvePreset(id, state.customPresets);
				if (!preset) return state;
				const presetValues = { ...preset.values };
				if (typeof presetValues.spectrumRotationSpeed === 'number') {
					if (!presetValues.spectrumRotationDirection) {
						presetValues.spectrumRotationDirection =
							presetValues.spectrumRotationSpeed < 0
								? 'ccw'
								: 'cw';
					}
					presetValues.spectrumRotationSpeed = Math.abs(
						presetValues.spectrumRotationSpeed
					);
				}
				// Presets saved before store v86 still carry flat legacy
				// `spectrumClone*` keys: convert them to an instance and strip
				// the dead keys so they never re-enter the store.
				const legacyPreset = presetValues as Record<string, unknown>;
				if (
					!Array.isArray(presetValues.spectrumInstances) &&
					hasLegacySpectrumCloneData(legacyPreset)
				) {
					presetValues.spectrumInstances = [
						convertLegacySpectrumCloneState(legacyPreset)
					];
				}
				for (const key of Object.keys(legacyPreset)) {
					if (
						key.startsWith('spectrumClone') ||
						key === 'spectrumCircularClone'
					) {
						delete legacyPreset[key];
					}
				}
				// A spectrum-enabled preset must never resolve to "all spectrums
				// hidden" (use `spectrumEnabled` for that). Older presets saved
				// before the both-off guard could carry it, so fall back to the
				// main spectrum.
				const nextMainVisible =
					presetValues.spectrumMainVisible ??
					state.spectrumMainVisible;
				const nextInstances =
					presetValues.spectrumInstances ?? state.spectrumInstances;
				const nextEnabled =
					presetValues.spectrumEnabled ?? state.spectrumEnabled;
				if (
					nextEnabled &&
					!nextMainVisible &&
					!nextInstances.some(inst => inst.enabled)
				) {
					presetValues.spectrumMainVisible = true;
				}
				return syncStateWithActiveBackgroundImage(state, {
					...presetValues,
					activePreset: preset.id,
					isPresetDirty: false
				});
			}),
		saveCustomPreset: name =>
			set(state => {
				const currentCustom = state.customPresets[state.activePreset];
				const nextName =
					name?.trim() || currentCustom?.name || 'Custom Preset';
				const id = currentCustom?.id ?? createCustomPresetId();

				return {
					customPresets: {
						...state.customPresets,
						[id]: {
							id,
							name: nextName,
							values: extractPresetValues(state)
						}
					},
					activePreset: id,
					isPresetDirty: false
				};
			}),
		duplicatePreset: name =>
			set(state => {
				const source = resolvePreset(
					state.activePreset,
					state.customPresets
				);
				const nextName =
					name?.trim() || `${source?.name ?? 'Preset'} Copy`;
				const id = createCustomPresetId();

				return {
					customPresets: {
						...state.customPresets,
						[id]: {
							id,
							name: nextName,
							values: extractPresetValues(state)
						}
					},
					activePreset: id,
					isPresetDirty: false
				};
			}),
		revertToActivePreset: () =>
			set(state => {
				const preset = resolvePreset(
					state.activePreset,
					state.customPresets
				);
				if (!preset) return state;
				return syncStateWithActiveBackgroundImage(state, {
					...preset.values,
					isPresetDirty: false
				});
			}),
		addSceneSlot: name =>
			set(state => {
				if (state.sceneSlots.length >= MAX_SCENE_SLOTS) return state;
				const slot = createEmptySceneSlot(
					name?.trim() ||
						defaultSceneSlotName(state.sceneSlots.length)
				);
				return { sceneSlots: [...state.sceneSlots, slot] };
			}),
		updateSceneSlot: (id, patch) =>
			set(state => ({
				sceneSlots: state.sceneSlots.map(slot =>
					slot.id === id
						? normalizeSceneSlotAgainstState(
								{ ...slot, ...patch },
								state
							)
						: slot
				)
			})),
		renameSceneSlot: (id, nextName) =>
			set(state => ({
				sceneSlots: state.sceneSlots.map(slot =>
					slot.id === id
						? {
								...slot,
								name: nextName.trim() || slot.name
							}
						: slot
				)
			})),
		removeSceneSlot: id =>
			set(state => ({
				sceneSlots: state.sceneSlots.filter(s => s.id !== id),
				backgroundImages: state.backgroundImages.map(img =>
					img.sceneSlotId === id ? { ...img, sceneSlotId: null } : img
				),
				activeSceneSlotId:
					state.activeSceneSlotId === id
						? null
						: state.activeSceneSlotId,
				// Scene-first: dropping the default scene clears the default so
				// images that rode it fall back to base instead of a dangling id.
				defaultSceneSlotId:
					state.defaultSceneSlotId === id
						? null
						: state.defaultSceneSlotId
			})),
		applySceneSlotById: id =>
			set(state => {
				const slot = state.sceneSlots.find(s => s.id === id);
				if (!slot) return {};
				invalidateSpectrumPresetMorph();
				const normalized = normalizeSceneSlotAgainstState(slot, state);
				return syncStateWithActiveBackgroundImage(state, {
					...buildSceneSlotActivationPatch(state, normalized),
					activeSceneSlotId: slot.id
				} satisfies Partial<WallpaperStore>);
			}),
		setActiveSceneSlotId: id => set({ activeSceneSlotId: id }),
		/**
		 * Snapshot the live visual state into a new Scene slot. Each requested
		 * subsystem's values go into that feature's OWN slot array (reusing a
		 * matching slot when one exists) and the Scene keeps only the reference
		 * — Scenes never own values. See `captureSceneSlot` for the ref
		 * semantics, cap handling and disabled-subsystem rules.
		 *
		 * The new Scene is appended but NOT applied and NOT made active:
		 * capturing describes the state you are already looking at, so
		 * re-applying it would be a no-op at best and a surprise at worst.
		 */
		captureSceneSlotFromCurrent: (name, matchKinds) => {
			const state = get();
			if (state.sceneSlots.length >= MAX_SCENE_SLOTS) return null;
			const { scene, slotPatch, skipped } = captureSceneSlot(
				state,
				name?.trim() || defaultSceneSlotName(state.sceneSlots.length),
				matchKinds ?? ALL_SCENE_CAPTURE_KINDS
			);
			set({
				...(slotPatch as Partial<WallpaperStore>),
				sceneSlots: [...state.sceneSlots, scene]
			});
			return { sceneId: scene.id, skipped };
		},
		reset: () =>
			set(state => ({
				...FACTORY_DEFAULT_STATE,
				customPresets: state.customPresets,
				sceneSlots: state.sceneSlots,
				particlesProfileSlots: state.particlesProfileSlots,
				rainProfileSlots: state.rainProfileSlots,
				looksProfileSlots: state.looksProfileSlots,
				trackTitleProfileSlots: state.trackTitleProfileSlots,
				language: state.language
			})),
		resetSection: keys =>
			set(state =>
				syncStateWithActiveBackgroundImage(
					state,
					Object.fromEntries(
						keys.map(k => [k, getFactoryDefaultValue(k)])
					)
				)
			)
	} satisfies Partial<WallpaperStore>;
}
