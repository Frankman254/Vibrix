import type { StateCreator } from 'zustand';
import { DEFAULT_STATE } from '@/store/defaultState';
import { CANONICAL_FACTORY_SPECTRUM_PATCH } from '@/lib/canonicalFactoryPresets';
import { normalizeSpectrumSettings } from '@/features/spectrum';
import {
	createProfileSlotId,
	buildSpectrumProfileName,
	createDefaultSpectrumSecondProfileSlots,
	extractSpectrumProfileSettings,
	MAX_SPECTRUM_SLOT_COUNT
} from '@/store/featureProfiles';
import {
	normalizeSpectrumFamily,
	normalizeSpectrumShape
} from '@/features/spectrum';
import { buildSpectrumFrameMemoryPresetPatch } from '@/features/spectrum';
import { buildSpectrumTunnelPresetPatch } from '@/features/spectrum';
import { buildSpectrumLiquidPresetPatch } from '@/features/spectrum';
import {
	getSpectrumLiquidLayerFieldKey,
	getSpectrumLiquidLayerPixelateFieldKey,
	getSpectrumLiquidLayerRigidShapeFieldKey,
	getSpectrumLiquidLayerShapeFieldKey,
	type SpectrumLiquidLayerParamKey
} from '@/features/spectrum';
import type { SpectrumFrameMemoryPresetId } from '@/features/spectrum';
import type { SpectrumFrameMemoryTarget } from '@/features/spectrum';
import { hydrateSpectrumProfileValues } from '@/features/spectrum';
import {
	applySpectrumTargetSettings,
	defaultSpectrumTargetSettings,
	extractSpectrumTargetSettings,
	pickSpectrumInstanceSettings,
	readSlotTargetSettings,
	writeSlotTargetSettings,
	type SpectrumProfileTarget
} from '@/features/spectrum';
import { invalidateSpectrumPresetMorph } from '@/features/spectrum';
import type {
	ColorSourceMode,
	SpectrumInstance,
	SpectrumProfileSettings
} from '@/types/wallpaper';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];
type WallpaperGet = Parameters<StateCreator<WallpaperStore>>[1];
type WallpaperApi = Parameters<StateCreator<WallpaperStore>>[2];

function randomChoice<T>(items: readonly T[]): T {
	return items[Math.floor(Math.random() * items.length)]!;
}

/** Which slot array a target's profile actions operate on. Spectrum 1 owns
 *  `spectrumProfileSlots`; Spectrum 2 owns `spectrumSecondProfileSlots`. */
function spectrumSlotsKeyForTarget(
	target: SpectrumProfileTarget
): 'spectrumProfileSlots' | 'spectrumSecondProfileSlots' {
	return target === 'instance'
		? 'spectrumSecondProfileSlots'
		: 'spectrumProfileSlots';
}

function buildCanonicalSpectrumFactoryPatch(): Partial<WallpaperStore> {
	// hydrate (not just normalize): the canonical data still carries legacy
	// flat `spectrumClone*` keys, which hydration converts to
	// `spectrumInstances` — and it keeps dead keys out of the store.
	const patch = hydrateSpectrumProfileValues(
		CANONICAL_FACTORY_SPECTRUM_PATCH as Partial<SpectrumProfileSettings>
	) as Partial<WallpaperStore>;
	const spectrumProfileSlots =
		CANONICAL_FACTORY_SPECTRUM_PATCH.spectrumProfileSlots?.map(slot => ({
			...slot,
			values: slot.values
				? hydrateSpectrumProfileValues(slot.values)
				: null
		}));

	return {
		...patch,
		...(spectrumProfileSlots ? { spectrumProfileSlots } : {}),
		spectrumSecondProfileSlots: createDefaultSpectrumSecondProfileSlots()
	};
}

function getCurrentSpectrumPresetProfiles(
	state: WallpaperStore
): SpectrumProfileSettings[] {
	const profiles = state.spectrumProfileSlots
		.map(slot => slot.values)
		.filter((values): values is SpectrumProfileSettings => Boolean(values))
		.map(values => hydrateSpectrumProfileValues(values));
	if (profiles.length > 0) return profiles;

	return (
		buildCanonicalSpectrumFactoryPatch()
			.spectrumProfileSlots?.map(slot => slot.values)
			.filter((values): values is SpectrumProfileSettings =>
				Boolean(values)
			)
			.map(values => hydrateSpectrumProfileValues(values)) ?? []
	);
}

/** Per-target preset shuffle: applies one random preset's look to the chosen
 *  spectrum only, leaving the other spectrum, master enable and visibility
 *  untouched. */
function buildTargetPresetShufflePatch(
	state: WallpaperStore,
	target: SpectrumProfileTarget,
	colorSource: ColorSourceMode
): Partial<WallpaperStore> {
	const profiles = getCurrentSpectrumPresetProfiles(state);
	if (profiles.length === 0) return {};
	const profile = randomChoice(profiles);
	const settings = {
		...pickSpectrumInstanceSettings(profile),
		spectrumColorSource: colorSource
	};
	return applySpectrumTargetSettings(
		state,
		target,
		settings
	) as Partial<WallpaperStore>;
}

export function createSpectrumSlice(
	set: WallpaperSet,
	_get: WallpaperGet,
	_api: WallpaperApi
) {
	return {
		setShowSpectrumDiagnosticsHud: v =>
			set({ showSpectrumDiagnosticsHud: v }),
		setDiagnosticsHudPositionX: v =>
			set({
				diagnosticsHudPositionX: Math.min(1, Math.max(0, v))
			}),
		setDiagnosticsHudPositionY: v =>
			set({
				diagnosticsHudPositionY: Math.min(1, Math.max(0, v))
			}),
		setSpectrumEnabled: v => set({ spectrumEnabled: v }),
		setSpectrumMainVisible: v =>
			set(state => {
				if (v) return { spectrumMainVisible: true };
				// At least one spectrum must stay visible: use the master
				// `spectrumEnabled` toggle to hide everything. Refuse to turn off
				// the main spectrum when no instance is enabled.
				const anyInstanceEnabled = state.spectrumInstances.some(
					inst => inst.enabled
				);
				if (!anyInstanceEnabled) return state;
				return { spectrumMainVisible: false };
			}),
		setSpectrumLiquidLayerRigidShape: (layer, v) =>
			set({ [getSpectrumLiquidLayerRigidShapeFieldKey(layer)]: v }),
		setSpectrumLiquidLayerPixelate: (layer, v) =>
			set({ [getSpectrumLiquidLayerPixelateFieldKey(layer)]: v }),
		setSpectrumLiquidLayerParam: (
			layer: 1 | 2 | 3,
			param: SpectrumLiquidLayerParamKey,
			value: number
		) =>
			set({
				[getSpectrumLiquidLayerFieldKey(layer, param)]: value
			}),
		applySpectrumLiquidPreset: (preset: SpectrumFrameMemoryPresetId) =>
			set(state =>
				normalizeSpectrumSettings({
					...state,
					...buildSpectrumLiquidPresetPatch(preset)
				})
			),
		setSpectrumLiquidLayerShape: (layer, shape) =>
			set({ [getSpectrumLiquidLayerShapeFieldKey(layer)]: shape }),
		setSpectrumDriveMode: v => set({ spectrumDriveMode: v }),
		setSpectrumManualSections: v => set({ spectrumManualSections: v }),
		setSpectrumManualAddWeight: v => set({ spectrumManualAddWeight: v }),
		setSpectrumManualAttack: v => set({ spectrumManualAttack: v }),
		setSpectrumManualRelease: v => set({ spectrumManualRelease: v }),
		setSpectrumManualBinding: (index, key) =>
			set(state => {
				const bindings = state.spectrumManualBindings.slice();
				bindings[index] = key;
				return { spectrumManualBindings: bindings };
			}),
		setShowSpectrumManualHud: v => set({ showSpectrumManualHud: v }),
		setSpectrumRadialFitLogo: v => set({ spectrumRadialFitLogo: v }),
		setSpectrumFollowLogo: v => set({ spectrumFollowLogo: v }),
		setSpectrumBarCount: v => set({ spectrumBarCount: v }),
		setSpectrumMirror: v => set({ spectrumMirror: v }),
		setSpectrumPeakHold: v => set({ spectrumPeakHold: v }),
		setSpectrumPositionX: v => set({ spectrumPositionX: v }),
		setSpectrumPositionY: v => set({ spectrumPositionY: v }),
		patchSpectrumMain: patch =>
			set(() => {
				if (
					patch.spectrumFamily !== undefined ||
					patch.spectrumMode !== undefined
				) {
					invalidateSpectrumPresetMorph();
				}
				const next = { ...patch };
				if (next.spectrumFamily !== undefined) {
					next.spectrumFamily = normalizeSpectrumFamily(
						next.spectrumFamily
					);
				}
				if (next.spectrumShape !== undefined) {
					next.spectrumShape = normalizeSpectrumShape(
						next.spectrumShape
					);
				}
				return normalizeSpectrumSettings(
					next
				) as Partial<WallpaperStore>;
			}),
		updateSpectrumInstance: (id, patch) =>
			set(state => {
				if (
					patch.spectrumFamily !== undefined ||
					patch.spectrumMode !== undefined
				) {
					invalidateSpectrumPresetMorph();
				}
				return {
					spectrumInstances: state.spectrumInstances.map(inst =>
						inst.id === id
							? (normalizeSpectrumSettings({
									...inst,
									...patch
								}) as SpectrumInstance)
							: inst
					)
				};
			}),
		setSpectrumInstanceEnabled: (id, v) =>
			set(state => {
				if (!v) {
					// At least one spectrum must stay visible (see
					// setSpectrumMainVisible). Refuse to disable the last one.
					const otherVisible =
						state.spectrumMainVisible ||
						state.spectrumInstances.some(
							inst => inst.id !== id && inst.enabled
						);
					if (!otherVisible) return state;
				}
				return {
					spectrumInstances: state.spectrumInstances.map(inst =>
						inst.id === id ? { ...inst, enabled: v } : inst
					)
				};
			}),
		applySpectrumFrameMemoryPreset: (
			preset: SpectrumFrameMemoryPresetId,
			target: SpectrumFrameMemoryTarget
		) =>
			set(state => {
				const patch = normalizeSpectrumSettings(
					buildSpectrumFrameMemoryPresetPatch(preset, target)
				);
				if (target === 'main') return patch;
				return {
					spectrumInstances: state.spectrumInstances.map(
						(inst, index) =>
							index === 0
								? (normalizeSpectrumSettings({
										...inst,
										...patch
									}) as SpectrumInstance)
								: inst
					)
				};
			}),
		applySpectrumTunnelPreset: (
			preset: SpectrumFrameMemoryPresetId,
			target: SpectrumFrameMemoryTarget
		) =>
			set(state => {
				const patch = normalizeSpectrumSettings(
					buildSpectrumTunnelPresetPatch(preset)
				);
				if (target === 'main') return patch;
				return {
					spectrumInstances: state.spectrumInstances.map(
						(inst, index) =>
							index === 0
								? (normalizeSpectrumSettings({
										...inst,
										...patch
									}) as SpectrumInstance)
								: inst
					)
				};
			}),
		randomizeSpectrumTarget: (target, colorSource) => {
			invalidateSpectrumPresetMorph();
			set(state =>
				buildTargetPresetShufflePatch(state, target, colorSource)
			);
		},
		resetSpectrumTarget: target =>
			set(state =>
				applySpectrumTargetSettings(
					state,
					target,
					defaultSpectrumTargetSettings(target)
				)
			),
		addSpectrumProfileSlot: (target = 'main') =>
			set(state => {
				const key = spectrumSlotsKeyForTarget(target);
				const slots = state[key];
				if (slots.length >= MAX_SPECTRUM_SLOT_COUNT) return state;
				return {
					[key]: [
						...slots,
						{
							id: createProfileSlotId(),
							name: `Spectrum ${slots.length + 1}`,
							values: null
						}
					]
				};
			}),
		removeSpectrumProfileSlot: (index, target = 'main') =>
			set(state => {
				const key = spectrumSlotsKeyForTarget(target);
				const slots = state[key];
				if (index < 3 || index >= slots.length) return state;
				return {
					[key]: slots.filter((_, slotIndex) => slotIndex !== index)
				};
			}),
		// Each spectrum keeps its OWN slot list: Spectrum 1 in
		// `spectrumProfileSlots` (read/written via its flat 'main' portion) and
		// Spectrum 2 in `spectrumSecondProfileSlots` (read/written via the
		// 'instance' portion). The two never interfere. `target` defaults to
		// 'main' so legacy/HUD callers operate on Spectrum 1.
		saveSpectrumProfileSlot: (index, target = 'main') =>
			set(state => {
				const key = spectrumSlotsKeyForTarget(target);
				const slots = state[key];
				if (index < 0 || index >= slots.length) return state;
				const settings = extractSpectrumTargetSettings(state, target);
				const nextSlots = slots.map((slot, slotIndex) =>
					slotIndex === index
						? {
								name: buildSpectrumProfileName({
									...state,
									...settings
								}),
								values: writeSlotTargetSettings(
									slot.values,
									target,
									settings
								)
							}
						: slot
				);
				return { [key]: nextSlots };
			}),
		loadSpectrumProfileSlot: (index, target = 'main') => {
			invalidateSpectrumPresetMorph();
			set(state => {
				const slot = state[spectrumSlotsKeyForTarget(target)][index];
				if (!slot?.values) return state;
				const template = readSlotTargetSettings(
					hydrateSpectrumProfileValues(slot.values),
					target
				);
				const patch = applySpectrumTargetSettings(
					state,
					target,
					template
				) as Partial<WallpaperStore>;
				if (target === 'instance') {
					const instances = (
						patch.spectrumInstances ?? state.spectrumInstances
					).map((inst, instanceIndex) =>
						instanceIndex === 0 ? { ...inst, enabled: true } : inst
					);
					return {
						...patch,
						spectrumInstances: instances,
						spectrumEnabled: true
					};
				}
				return {
					...patch,
					spectrumEnabled: true,
					spectrumMainVisible: true
				};
			});
		},
		resetSpectrumToDefaults: () => {
			invalidateSpectrumPresetMorph();
			set(state => ({
				...buildCanonicalSpectrumFactoryPatch(),
				spectrumProfileSlots: state.spectrumProfileSlots,
				spectrumSecondProfileSlots: state.spectrumSecondProfileSlots
			}));
		},
		restoreFactorySpectrumDefaults: () => {
			invalidateSpectrumPresetMorph();
			set(buildCanonicalSpectrumFactoryPatch());
		},
		recoverAudioOverlays: () => {
			invalidateSpectrumPresetMorph();
			set(state => ({
				...hydrateSpectrumProfileValues(
					extractSpectrumProfileSettings(
						DEFAULT_STATE as unknown as WallpaperStore
					)
				),
				spectrumEnabled: true,
				spectrumMainVisible: true,
				logoEnabled: Boolean(state.logoUrl)
			}));
		}
	} satisfies Partial<WallpaperStore>;
}
