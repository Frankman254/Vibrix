export const APP_VERSION = '0.7.0-alpha';

export const SETTINGS_FORMAT = 'vibrix-settings';
export const SETTINGS_SCHEMA_VERSION = 1;

export const PROJECT_FORMAT = 'vibrix-project';
export const PROJECT_SCHEMA_VERSION = 1;

/** The file extension exports write today. */
export const PROJECT_FILE_EXTENSION = 'vibrix';

// The app was called Live Wallpaper Anime Glitch until 2026-09-06, and every
// file exported before that carries the old tags. Exports never write them
// again; imports accept them forever, because the alternative is a user's
// saved project silently refusing to open.
export const LEGACY_SETTINGS_FORMATS = ['lwag-settings'] as const;
export const LEGACY_PROJECT_FORMATS = ['lwag-project'] as const;
export const LEGACY_PROJECT_FILE_EXTENSIONS = ['lwag'] as const;

// v85: added lightsProfileSlots + cameraFxProfileSlots; SceneSlot gained
// lightsSlotIndex/cameraFxSlotIndex and the 3-state 'off' binding ref.
// v86: spectrumInstances replace spectrumClone* keys; low-energy inversion
// controls for spectrum rotation and particle audio drift.
// v87: low-energy spectrum rotation hold plus Depth Flow focus inversion.
// v88: contain keep-covered scale semantics.
// v89: now-playing metadata fallback + text treatment controls.
// v90: seed curated default color-favourites palette for empty lists.
// v91: spectrumScale added to spectrum main + instance settings; bump so the
// migration runs for existing users and backfills the new key (otherwise the
// Scale slider reads undefined and crashes the Spectrum tab).
// v92: spectrumManualGlow + spectrumManualGlowMode (per-spectrum glow color
// decoupled from the fill color source).
// v93: spectrumRgbSplit + spectrumRgbSplitAmount (chromatic-aberration effect
// for the classic wave).
// v94: Visual Accents pack — neon core, gradient flow, peak sparks, echo trace.
// v95: glow gains its own color identity (spectrumGlowColorSource/ColorMode +
// spectrumGlowPrimary/SecondaryColor), seeded from the fill colors so existing
// setups look identical.
// v96: retro pixel shape (classic linear) + global pixelate post-process
// (spectrumPixelate / spectrumPixelateScale).
// v97: Spectrum 2 gains its own independent profile slot list
// (spectrumSecondProfileSlots), seeded from the previously-shared slots.
// v98: Scene-first model — `defaultSceneSlotId` (the scene applied to images
// without an explicit sceneSlotId), backfilled to null on old stores.
// v99: Re-run instance migration to fill any keys (spectrumManualGlow,
// spectrumScale, spectrumSpan, etc.) absent from instances persisted before
// their version bumps, preventing S1 flat-state values bleeding into S2.
// v100: Liquid-glass toggles — `nowPlayingLiquidGlassEnabled`,
// `audioLyricsLiquidGlassEnabled`, `hudLiquidGlassEnabled` (all default false),
// backfilled onto older stores.
// v101: Liquid-glass tuning — per-surface blur/magnify/tint sliders
// (`nowPlayingLiquidGlass{Blur,Magnify,Tint}`,
// `audioLyricsLiquidGlass{Blur,Magnify,Tint}`), backfilled with macOS-like
// defaults; the HUD glass reuses the existing Quick HUD blur/opacity sliders.
// v102: Liquid-glass reworked to a transparent centre + refractive edge lens
// (no full-panel frost). The blur/magnify/tint values change meaning, so they
// are re-seeded once for stores below v102.
// v103: the combined Motion bundles (particles + rain in one slot) and the
// per-image Spectrum 2 override are retired; both are converted into named
// slots in their own families so nothing the user saved is lost.
// v104: scene and per-image bindings reference profile slots by stable `id`
// instead of array index, so reordering or deleting a slot can never silently
// retarget a binding. Legacy numeric refs translate against the migrated family.
// v105: per-liquid-layer retro pixelate (`spectrumLiquidLayer{1,2,3}Pixelate`),
// so one layer can read as chunky pixel art while the others stay smooth. The
// spectrum-wide `spectrumPixelate` toggle keeps meaning "all layers at once".
// v106: radial shapes are normalized in the registry (every shape now peaks at
// exactly the requested radius and reports its real trough), `cardioid` is
// retired in favour of `drop`, and `spectrumRadialSharpness` adds the per-
// instance "sharp points" control. The version bump is what makes migration run
// and seed the new key — a persisted key added without one reads as undefined.
// v107: the canvas liquid-glass panel (`nowPlayingLiquidGlass*`,
// `audioLyricsLiquidGlass*`) was removed — per-frame re-blur + re-magnify of
// the wallpaper, and it never produced the intended look. The keys are deleted
// on rehydrate. `hudLiquidGlassEnabled` is a separate CSS-only HUD style and
// is unaffected.
// v108: removed the unreachable Edge Glow subsystem and superseded orphan
// settings; Flash Edge remains the supported edge-light effect.
// v109: the ten `rgbShiftAudio*` keys join the Looks snapshot
// (LOOKS_PROFILE_KEYS + FilterLookPreset). They used to be globals sitting
// beside every look, so saving a slot captured the shift amount but not
// whether it followed the kick — and loading any slot inherited whatever the
// last one had left behind. The migration backfills every stored slot and the
// legacy custom look from the live globals, so nothing looks different.
// v110: factory Looks and user slots share one catalog; the legacy single
// Custom look migrates into a normal stable-id slot, and active preset metadata
// is removed from slot snapshots so HUD/editor selection cannot collide.
// v111: the factory logo moved to a new cache-safe Vibrix URL. Existing factory
// logo references migrate without touching user-uploaded logo assets.
// v112: built-in logo variant mode (vector/pixel/auto), including Logo profile
// snapshots and per-image Logo overrides.
// v113: per-image `coverageFramingEdited` provenance flag for Keep-Covered
// auto-fit. Pre-v113 persisted items lack the flag; normalize derives it from
// the stored layout (a custom framing is protected from machine overwrite).
// v114: `showAutoZoomDebug` debug-overlay flag. Pre-v114 payloads lack it; the
// overlay is opt-in, so migration only defaults it off.
// v115: `sceneServiceBaseUrl` — where the AI scene-intent service lives.
// Pre-v115 payloads lack it; '' keeps the historical same-origin behavior.
// v116: Keep-Covered is unconditional — the `imageCoverageLockEnabled` global
// and its per-image / per-profile-slot mirrors are removed (the Cover Fit
// buttons replace the AutoZoom action). The migration strips the keys.
// v117: `imageFramingManualEnabled` — the manual framing switch. Coverage math
// stays the default (false); turning it on hands scale/position back to the
// user untouched. Pre-v117 payloads lack the key, so migration defaults it off
// and nothing changes for existing projects.
// v118: `offlineExportResolutionId` + `offlineExportFps` — the offline video
// export profile is now a standing preference instead of component state, so
// leaving the Export tab (or reloading) keeps the chosen output. Pre-v118
// payloads lack both keys; migration writes the historical defaults (1080p/30).
// v119: effect layers — `effectLayers` + `activeEffectLayerId`. The active
// layer's live values are the legacy `filter*` keys; its entry in the array is
// a snapshot. Pre-v119 stores become a single layer holding what they had.
// v120: Looks slots and per-image Looks overrides carry the whole layer stack
// instead of only the layer being edited. Stored flat values migrate into a
// one-layer stack, which is what they always meant.
// v121: `globalCompositionOverride` + per-image `ignoreGlobalOverride` — the
// global composition mode that ignores per-image configs without erasing them.
// Migration defaults both off, so an existing project behaves exactly as before.
// v122: `sceneServiceModel` — which model the scene service should use, when
// its server offers several (LM Studio with three models loaded, say). '' keeps
// the server's own choice, which is what every pre-v122 store meant.
// v123: `slideshowTransitionAnchor` — where a manual timestamp sits inside its
// transition. Defaults to `end` (the transition finishes on the mark), which is
// a deliberate behaviour change for existing projects: marking is a sync gesture.
// v124: `motionLayers` + `activeMotionLayerId` — Camera Motion becomes a stack
// of movements with their own targets, mirroring `effectLayers`. The active
// layer's live values stay the flat `cameraMotion*` keys.
// v125: `cameraMotionAmplitudeAudio` — audio drives the amplitude of a movement
// and not only its speed. 0 for everything that existed, so nothing moves more
// than it did before the key.
// v126: per-image `cameraFxOverride`, `lightsOverride` and `trackTitleOverride`
// — an image can carry Camera FX, Lights and the Now Playing treatment the way
// it already carried its logo, spectrum, particles, rain and looks. All null,
// so no image gains a composition it did not have.
// v127: `transitionPresets` + per-image `transitionPresetId` — a transition
// look gets a name instead of being five anonymous dials. Existing images keep
// their values with no preset attached, so nothing changes on screen.
export const STORE_PERSIST_VERSION = 127;
