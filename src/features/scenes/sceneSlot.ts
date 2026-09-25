/**
 * Scene slots are composition-only records that reference slots owned by
 * individual feature subsystems (spectrum, looks, particles, rain, logo,
 * trackTitle). Applying a Scene slot resolves each non-null reference and
 * copies the values from that feature's slot into a partial state patch. A
 * `null` reference means "do not apply this subsystem" — the feature's
 * current state is preserved.
 *
 * Design rules (hard):
 *  - A Scene slot MUST NOT flatten raw config.
 *  - A Scene slot MUST NOT own values; values live in each feature's slot.
 *  - Feature slots remain under each feature's authority; Scene only reads.
 */
import {
	extractLooksProfileSettings,
	hydrateLooksProfileValues,
	extractParticlesProfileSettings,
	hydrateParticlesProfileValues,
	extractRainProfileSettings,
	extractTrackTitleProfileSettings,
	extractLogoProfileSettings,
	extractLightsProfileSettings,
	extractCameraFxProfileSettings
} from '@/store/featureProfiles';
import { hydrateSpectrumProfileValues } from '@/features/spectrum/runtime/spectrumProfileHydrate';
import { readSlotTargetSettings } from '@/features/spectrum/domain/spectrumTargetProfile';
import { createDefaultSpectrumInstance } from '@/features/spectrum/domain/spectrumInstanceModel';
import { normalizeSpectrumSettings } from '@/features/spectrum/domain/spectrumStateTransforms';
import { DEFAULT_STATE } from '@/store/defaultState';
import type {
	SceneSlot,
	SceneSlotRef,
	SpectrumInstance,
	WallpaperState
} from '@/types/wallpaper';

/**
 * Scene-first resolution. An image's *effective* scene is its explicit
 * `sceneSlotId` when that points to a real scene; otherwise the global
 * `defaultSceneSlotId` when that is valid; otherwise `null` (no scene → base
 * visual state + legacy per-image overrides). Pure: no store import, no DOM.
 *
 * `usedDefault` lets callers distinguish "this image uses the default scene"
 * from "this image has its own scene" for UI labelling and transition gating.
 */
export function resolveEffectiveSceneSlotId(
	image: { sceneSlotId?: string | null } | null | undefined,
	state: Pick<WallpaperState, 'sceneSlots' | 'defaultSceneSlotId'>
): { sceneSlotId: string | null; usedDefault: boolean } {
	const exists = (id: string | null | undefined): id is string =>
		typeof id === 'string' && state.sceneSlots.some(slot => slot.id === id);
	if (exists(image?.sceneSlotId)) {
		return {
			sceneSlotId: image!.sceneSlotId as string,
			usedDefault: false
		};
	}
	if (exists(state.defaultSceneSlotId)) {
		return { sceneSlotId: state.defaultSceneSlotId, usedDefault: true };
	}
	return { sceneSlotId: null, usedDefault: false };
}

export function createSceneSlotId(): string {
	return `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultSceneSlotName(index: number): string {
	return `Scene ${index + 1}`;
}

export function createEmptySceneSlot(name?: string): SceneSlot {
	return {
		id: createSceneSlotId(),
		name: name?.trim() || defaultSceneSlotName(0),
		spectrumSlotId: null,
		spectrumSecondSlotId: null,
		looksSlotId: null,
		particlesSlotId: null,
		rainSlotId: null,
		lightsSlotId: null,
		cameraFxSlotId: null,
		logoSlotId: null,
		trackTitleSlotId: null
	};
}

/**
 * Validate a slot-id reference against its slot family. The literal `'off'`
 * is preserved (force-off has no slot to validate). References to deleted
 * slots collapse to `null` so downstream code never dereferences a ghost.
 */
export function normalizeSlotRef(
	ref: SceneSlotRef | undefined,
	slots: ReadonlyArray<{ id: string }>
): SceneSlotRef {
	if (ref === 'off') return 'off';
	if (typeof ref !== 'string') return null;
	return slots.some(slot => slot.id === ref) ? ref : null;
}

/** Resolve a slot-id reference to its slot, or null. */
export function findSlotByRef<T extends { id: string }>(
	slots: ReadonlyArray<T>,
	ref: SceneSlotRef
): T | null {
	if (typeof ref !== 'string') return null;
	return slots.find(slot => slot.id === ref) ?? null;
}

export function normalizeSceneSlotAgainstState(
	slot: SceneSlot,
	state: WallpaperState
): SceneSlot {
	return {
		...slot,
		spectrumSlotId: normalizeSlotRef(
			slot.spectrumSlotId,
			state.spectrumProfileSlots
		),
		spectrumSecondSlotId: normalizeSlotRef(
			slot.spectrumSecondSlotId,
			state.spectrumSecondProfileSlots
		),
		looksSlotId: normalizeSlotRef(
			slot.looksSlotId,
			state.looksProfileSlots
		),
		particlesSlotId: normalizeSlotRef(
			slot.particlesSlotId,
			state.particlesProfileSlots
		),
		rainSlotId: normalizeSlotRef(slot.rainSlotId, state.rainProfileSlots),
		lightsSlotId: normalizeSlotRef(
			slot.lightsSlotId,
			state.lightsProfileSlots
		),
		cameraFxSlotId: normalizeSlotRef(
			slot.cameraFxSlotId,
			state.cameraFxProfileSlots
		),
		logoSlotId: normalizeSlotRef(slot.logoSlotId, state.logoProfileSlots),
		trackTitleSlotId: normalizeSlotRef(
			slot.trackTitleSlotId,
			state.trackTitleProfileSlots
		)
	};
}

/**
 * Resolve a Scene slot into a state patch. Each subsystem ref is 3-state:
 *  - `null`   → not present in the patch (the feature keeps its current state).
 *  - `'off'`  → emit a force-off patch (the feature's `*Enabled` flag(s) false).
 *  - `number` → copy the saved slot's values over the feature defaults.
 */
export function buildSceneSlotActivationPatch(
	state: WallpaperState,
	slot: SceneSlot
): Partial<WallpaperState> {
	const patch: Partial<WallpaperState> = {};
	const defaults = DEFAULT_STATE as WallpaperState;

	// Spectrum 1 (flat keys + its bundled instance portion, for back-compat)
	if (slot.spectrumSlotId === 'off') {
		Object.assign(patch, { spectrumEnabled: false });
	} else if (slot.spectrumSlotId !== null) {
		const ref = findSlotByRef(
			state.spectrumProfileSlots,
			slot.spectrumSlotId
		);
		if (ref?.values) {
			Object.assign(patch, hydrateSpectrumProfileValues(ref.values));
		}
	}

	// Spectrum 2 — independent override of the second instance. Composes on top
	// of whatever Spectrum 1 left in `patch.spectrumInstances` (or live state),
	// so a scene can bind each spectrum to a different slot. A `null` ref keeps
	// the back-compat behaviour where Spectrum 1's bundled portion drives it.
	if (slot.spectrumSecondSlotId === 'off') {
		const base = (patch.spectrumInstances ??
			state.spectrumInstances) as SpectrumInstance[];
		patch.spectrumInstances = base.map((inst, i) =>
			i === 0 ? { ...inst, enabled: false } : inst
		);
	} else if (slot.spectrumSecondSlotId !== null) {
		const ref = findSlotByRef(
			state.spectrumSecondProfileSlots,
			slot.spectrumSecondSlotId
		);
		if (ref?.values) {
			const second = readSlotTargetSettings(
				hydrateSpectrumProfileValues(ref.values),
				'instance'
			);
			const base = (patch.spectrumInstances ??
				state.spectrumInstances) as SpectrumInstance[];
			const inst0 = base[0] ?? createDefaultSpectrumInstance();
			patch.spectrumInstances = [
				normalizeSpectrumSettings({
					...inst0,
					...second,
					enabled: true
				}) as SpectrumInstance,
				...base.slice(1)
			];
			patch.spectrumEnabled = true;
		}
	}

	// Looks (no single enable flag — 'off' is treated as a no-op, same as null)
	if (slot.looksSlotId !== null && slot.looksSlotId !== 'off') {
		const ref = findSlotByRef(state.looksProfileSlots, slot.looksSlotId);
		if (ref?.values) {
			// Hydrate rather than spread: a slot saved before effect layers
			// existed carries only the flat keys, and must become one layer
			// holding them instead of borrowing the live stack.
			Object.assign(
				patch,
				hydrateLooksProfileValues(
					ref.values,
					extractLooksProfileSettings(defaults)
				)
			);
		}
	}

	// Particles
	if (slot.particlesSlotId === 'off') {
		Object.assign(patch, { particlesEnabled: false });
	} else if (slot.particlesSlotId !== null) {
		const ref = findSlotByRef(
			state.particlesProfileSlots,
			slot.particlesSlotId
		);
		if (ref?.values) {
			const particleDefaults = extractParticlesProfileSettings(defaults);
			Object.assign(
				patch,
				hydrateParticlesProfileValues(ref.values, particleDefaults)
			);
		}
	}

	// Rain
	if (slot.rainSlotId === 'off') {
		Object.assign(patch, { rainEnabled: false });
	} else if (slot.rainSlotId !== null) {
		const ref = findSlotByRef(state.rainProfileSlots, slot.rainSlotId);
		if (ref?.values) {
			Object.assign(
				patch,
				extractRainProfileSettings(defaults),
				ref.values
			);
		}
	}

	// Lights (stage lights + flash)
	if (slot.lightsSlotId === 'off') {
		Object.assign(patch, {
			stageLightsEnabled: false,
			flashLightEnabled: false
		});
	} else if (slot.lightsSlotId !== null) {
		const ref = findSlotByRef(state.lightsProfileSlots, slot.lightsSlotId);
		if (ref?.values) {
			Object.assign(
				patch,
				extractLightsProfileSettings(defaults),
				ref.values
			);
		}
	}

	// Camera FX (camera motion + screen shake)
	if (slot.cameraFxSlotId === 'off') {
		Object.assign(patch, {
			cameraMotionEnabled: false,
			cameraShakeEnabled: false
		});
	} else if (slot.cameraFxSlotId !== null) {
		const ref = findSlotByRef(
			state.cameraFxProfileSlots,
			slot.cameraFxSlotId
		);
		if (ref?.values) {
			Object.assign(
				patch,
				extractCameraFxProfileSettings(defaults),
				ref.values
			);
		}
	}

	// Logo
	if (slot.logoSlotId === 'off') {
		Object.assign(patch, { logoEnabled: false });
	} else if (slot.logoSlotId !== null) {
		const ref = findSlotByRef(state.logoProfileSlots, slot.logoSlotId);
		if (ref?.values) {
			Object.assign(
				patch,
				extractLogoProfileSettings(defaults),
				ref.values,
				{
					logoEnabled: true
				} as Partial<WallpaperState>
			);
		}
	}

	// Track title
	if (slot.trackTitleSlotId === 'off') {
		Object.assign(patch, {
			audioTrackTitleEnabled: false,
			audioTrackTimeEnabled: false
		});
	} else if (slot.trackTitleSlotId !== null) {
		const ref = findSlotByRef(
			state.trackTitleProfileSlots,
			slot.trackTitleSlotId
		);
		if (ref?.values) {
			Object.assign(
				patch,
				extractTrackTitleProfileSettings(defaults),
				ref.values
			);
		}
	}

	return patch;
}

/** The three states a scene can hold for one subsystem, as the editor shows them. */
export type SceneBindingMode = 'keep' | 'off' | 'slot';

export function sceneBindingMode(ref: SceneSlotRef): SceneBindingMode {
	if (ref == null) return 'keep';
	if (ref === 'off') return 'off';
	return 'slot';
}

/**
 * What a scene binding becomes when the user presses one of the three state
 * buttons. `undefined` means "nothing to do": pressing "Slot" with no saved
 * slot in that family must not silently bind an empty one, which would look
 * like a scene that applies something and applies nothing.
 */
export function resolveSceneBindingChange(
	mode: SceneBindingMode,
	current: SceneSlotRef,
	slots: ReadonlyArray<{ id: string; values: unknown | null }>
): SceneSlotRef | undefined {
	if (mode === 'keep') return null;
	if (mode === 'off') return 'off';
	const usable = slots.filter(slot => slot.values !== null);
	const kept = usable.find(slot => slot.id === current);
	return (kept ?? usable[0])?.id;
}
