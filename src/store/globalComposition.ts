/**
 * Applying a captured global composition, without the store.
 *
 * The global composition mode used to be a pure veto: with it on, whatever was
 * on screen stayed on screen. The one way to make that composition durable was
 * a button that wrote it into every image — and that erased the per-image work
 * of a 200-image pool in one click. The slots replace it: a capture lives in
 * its own slot, the mode applies the selected slot, and no image is ever
 * written to. Turning the mode off brings every image's own composition back.
 *
 * `buildGlobalCompositionPatch` is pure so the live preview and the offline
 * video export resolve a global slot identically.
 */
import {
	extractCameraFxProfileSettings,
	extractLightsProfileSettings,
	extractLooksProfileSettings,
	extractTrackTitleProfileSettings,
	hydrateLooksProfileValues
} from '@/store/featureProfiles';
import type {
	GlobalCompositionValues,
	ProfileSlot,
	WallpaperState
} from '@/types/wallpaper';

export type GlobalCompositionState = Pick<
	WallpaperState,
	'globalCompositionOverride' | 'globalCompositionSlots'
> & { activeGlobalCompositionSlotId: string | null };

/**
 * The slot the global mode currently applies, or `undefined` for "none": the
 * mode is off, no slot is selected, or the selected slot was never captured.
 */
export function resolveActiveGlobalCompositionSlot(
	state: GlobalCompositionState
): ProfileSlot<GlobalCompositionValues> | undefined {
	if (!state.globalCompositionOverride) return undefined;
	const id = state.activeGlobalCompositionSlotId;
	if (!id) return undefined;
	const slot = state.globalCompositionSlots.find(entry => entry.id === id);
	return slot?.values ? slot : undefined;
}

/**
 * Flatten a captured composition into a state patch.
 *
 * Every family keeps its `*Enabled` flag from the live state: a slot captured
 * while the spectrum was hidden configures the spectrum, it does not hide it.
 * That is the same rule the per-image overrides follow.
 */
export function buildGlobalCompositionPatch(
	state: WallpaperState,
	values: GlobalCompositionValues
): Partial<WallpaperState> {
	const patch: Partial<WallpaperState> = {};
	Object.assign(patch, values.logo, { logoEnabled: state.logoEnabled });
	Object.assign(patch, values.spectrum, {
		spectrumEnabled: state.spectrumEnabled
	});
	Object.assign(patch, values.particles, {
		particlesEnabled: state.particlesEnabled
	});
	Object.assign(patch, values.rain, { rainEnabled: state.rainEnabled });
	Object.assign(
		patch,
		hydrateLooksProfileValues(
			values.looks,
			extractLooksProfileSettings(state)
		)
	);
	// Camera FX, Lights and Track Title carry their own enable flags on purpose
	// — that is how a captured composition says "and no shake here" — so unlike
	// logo/spectrum they apply exactly as saved, over the live defaults so a
	// snapshot from an older build is not missing keys.
	Object.assign(
		patch,
		extractCameraFxProfileSettings(state),
		values.cameraFx
	);
	Object.assign(patch, extractLightsProfileSettings(state), values.lights);
	Object.assign(
		patch,
		extractTrackTitleProfileSettings(state),
		values.trackTitle
	);
	return patch;
}
