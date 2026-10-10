import type { WallpaperState } from '@/types/wallpaper';

/**
 * Which persisted keys the factory look owns.
 *
 * The factory look (`lib/canonicalFactoryPresets`) is a snapshot of the shipped
 * project: what a first-run user sees and what "reset to factory" restores. It
 * must describe the LOOK and nothing else — pinning an asset id would point the
 * default project at a file that is not on this machine, and pinning runtime
 * state would restore a paused wallpaper.
 *
 * The rule is deliberately inverted: everything is a look key unless it is
 * listed below. A feature shipped tomorrow is therefore part of the factory look
 * the moment it exists, which is the only arrangement that survives contact with
 * a growing editor — the previous one was an allowlist, and every feature added
 * after the last defaults import simply never made it in (the forgotten half
 * included the whole lyrics style block, the spectrum FX, the glow reach
 * sliders, the flash edges and Now Playing).
 *
 * `factoryLookCoverage.test.ts` holds this honest: a key here that no longer
 * exists in the state fails, and a look key with no factory opinion has to be
 * declared as debt rather than quietly forgotten.
 */
type StateKey = keyof WallpaperState;

/** Assets the user supplies. A default project ships a look, not files. */
const CONTENT_KEYS = [
	'activeImageId',
	'backgroundImages',
	'imageIds',
	'imageUrl',
	'imageUrls',
	'imageFocusX',
	'imageFocusY',
	'globalBackgroundId',
	'globalBackgroundUrl',
	'logoId',
	'logoUrl',
	'overlays',
	'selectedOverlayId',
	'audioTracks',
	'activeAudioTrackId',
	'queuedAudioTrackId',
	'audioFileAssetId',
	'audioFileName',
	'audioLyricsByTrackAssetId'
] as const satisfies readonly StateKey[];

/** Rebuilt every session. Restoring these would restore a frozen editor. */
const RUNTIME_KEYS = [
	'audioCaptureState',
	'audioPaused',
	'motionPaused',
	'visualTransition',
	'isPresetDirty',
	'activePreset',
	'activeSpectrumTarget',
	'activeMotionLayerId',
	'activeEffectLayerId',
	'activeSceneSlotId',
	'activeGlobalCompositionSlotId',
	'activeSetlistId',
	'activeFilterLookId',
	'globalCompositionOverride'
] as const satisfies readonly StateKey[];

/**
 * The user's own saved work. Slots, scenes, setlists and layer stacks are
 * theirs; shipping a factory opinion here would overwrite captures on reset.
 */
const LIBRARY_KEYS = [
	'backgroundProfileSlots',
	'spectrumProfileSlots',
	'spectrumSecondProfileSlots',
	'logoProfileSlots',
	'particlesProfileSlots',
	'rainProfileSlots',
	'looksProfileSlots',
	'lightsProfileSlots',
	'cameraFxProfileSlots',
	'trackTitleProfileSlots',
	'introProfileSlots',
	'calibrationProfileSlots',
	'calibrationSyntheticGroups',
	'sceneSlots',
	'defaultSceneSlotId',
	'globalCompositionSlots',
	'setlists',
	'setlistIntroFallback',
	'customPresets',
	'motionLayers',
	'effectLayers',
	'introSequence',
	'outroSequence',
	'colorFavorites'
] as const satisfies readonly StateKey[];

/** How the editor is laid out for this person, not how the wallpaper looks. */
const EDITOR_PREF_KEYS = [
	'language',
	'editorShowPreciseNumericControls',
	'editorCompactSlotIcons',
	'controlPanelOffsetX',
	'controlPanelOffsetY',
	'hudLiquidGlassEnabled',
	'quickEditCaptureMode',
	'discoveryOnboardingDismissed',
	'mediaSessionEnabled'
] as const satisfies readonly StateKey[];

/** Export target and AI service wiring: machine settings, not a look. */
const TOOLING_KEYS = [
	'offlineExportResolutionId',
	'offlineExportResolutionAuto',
	'offlineExportQualityId',
	'offlineExportFps',
	'sceneServiceBaseUrl',
	'sceneServiceModel'
] as const satisfies readonly StateKey[];

/**
 * Playback transport. How a track is advanced, crossfaded or how loud it is
 * does not change what a frame looks like; the ANALYSIS settings
 * (`audioSensitivity`, `audioSmoothing`, the thresholds) do, and stay look keys.
 */
const AUDIO_TRANSPORT_KEYS = [
	'audioSourceMode',
	'audioMixMode',
	'audioAutoAdvance',
	'audioCrossfadeEnabled',
	'audioCrossfadeSeconds',
	'audioFileLoop',
	'audioFileVolume',
	'audioTransitionStyle',
	'audioAutoSwitchHoldMs'
] as const satisfies readonly StateKey[];

export const NON_LOOK_STATE_KEY_GROUPS = {
	content: CONTENT_KEYS,
	runtime: RUNTIME_KEYS,
	library: LIBRARY_KEYS,
	editorPrefs: EDITOR_PREF_KEYS,
	tooling: TOOLING_KEYS,
	audioTransport: AUDIO_TRANSPORT_KEYS
} as const;

export const NON_LOOK_STATE_KEYS: readonly StateKey[] = Object.values(
	NON_LOOK_STATE_KEY_GROUPS
).flat();

/**
 * The three keys the factory look owns even though the groups above class them
 * as content or library.
 *
 * `spectrumProfileSlots` ships 20 calibrated spectrum profiles, and "restore
 * factory Spectrum" (destructive, confirmed) exists precisely to put them back —
 * see `store/slices/spectrumSlice.ts`. The second-layer slots are rebuilt from
 * code instead, so they are not here. `logoId`/`logoUrl` point at the logo that
 * ships in `public/`: part of the application, not of the user's library, so a
 * factory reset restoring it always finds the file.
 *
 * Deliberately NOT named `*_KEYS`: the importer reads the groups above by that
 * suffix, and these are subtracted from them, not added.
 */
export const FACTORY_LOOK_OWNED_EXCEPTIONS = [
	'logoId',
	'logoUrl',
	'spectrumProfileSlots'
] as const satisfies readonly StateKey[];

const nonLook = new Set<string>(
	NON_LOOK_STATE_KEYS.filter(
		key =>
			!(FACTORY_LOOK_OWNED_EXCEPTIONS as readonly string[]).includes(key)
	)
);

/** True when the factory look should carry an opinion about this key. */
export function isFactoryLookKey(key: string): boolean {
	return !nonLook.has(key);
}
