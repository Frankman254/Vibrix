import type { CustomPresetsMap } from './presets';
import type { AudioLyricsTrackEntry } from '@/features/lyrics/domain/types';

export type PerformanceMode = 'low' | 'medium' | 'high';
/** Offline video export profile. The presets that carry the pixel sizes live
 *  in `features/export/offlineExportTypes`; the vocabulary lives here so the
 *  persisted store can name them without importing a feature. */
export type OfflineExportFps = 30 | 60 | 120;
export type OfflineExportResolutionPresetId = '720p' | '1080p' | '1440p' | '4k';
export type UIMode = 'simple' | 'advanced';
export type LogoVariantMode = 'vector' | 'pixel' | 'auto';
export type ActiveTool =
	| 'none'
	| 'logo'
	| 'spectrum'
	| 'hud'
	| 'track-title'
	| 'lyrics';
export type ControlPanelAnchor =
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right';
export type EditorTheme =
	| 'cyber'
	| 'glass'
	| 'sunset'
	| 'terminal'
	| 'midnight'
	| 'carbon'
	| 'aurora'
	| 'rose'
	| 'ocean'
	| 'amber'
	| 'rainbow';
/** Editor shell + synced UI: manual picks, built-in theme palettes, or current image palette. */
export type ThemeColorSource = 'manual' | 'theme' | 'image';
export type AudioCaptureState =
	| 'idle'
	| 'requesting'
	| 'active'
	| 'denied'
	| 'error'
	| 'no-audio-track';
export type AudioSourceMode = 'none' | 'desktop' | 'microphone' | 'file';
export type AudioMixMode =
	| 'manual'
	| 'sequential'
	| 'energy-match'
	| 'contrast';
export type AudioTransitionStyle =
	| 'linear'
	| 'smooth'
	| 'quick'
	| 'early-blend'
	| 'late-blend';
export type AudioPlaylistTrack = {
	id: string;
	assetId: string;
	name: string;
	mimeType: string;
	volume: number;
	loop: boolean;
	enabled: boolean;
	/** Duplicate-detection fingerprint: "<name>::<size>::<lastModified>" */
	fileKey?: string;
	energyScore?: number;
	bassScore?: number;
	densityScore?: number;
	// Silence/content detection (auto-computed)
	contentStartMs?: number;
	contentEndMs?: number;
	introTrimMs?: number;
	outroTrimMs?: number;
	// Mix points (auto-computed, manually overridable)
	/** Where the incoming track content starts — engine seeks here before fading in. */
	mixInStartMs?: number;
	/** Where crossfade out begins on this track. */
	mixOutStartMs?: number;
	// Musical metadata (lightweight heuristics)
	estimatedBpm?: number;
	beatStrength?: number;
	loudnessDb?: number;
	durationMs?: number;
	// Now-playing metadata. `artist`/`title`/`album`/`coverAssetId` are
	// auto-derived (ID3 tags or filename heuristic); `manualArtist`/`manualTitle`
	// are user overrides that win when the metadata mode is 'manual'.
	artist?: string;
	title?: string;
	album?: string;
	coverAssetId?: string;
	manualArtist?: string;
	manualTitle?: string;
};
export type TrackMetadataMode = 'manual' | 'auto';
export type TrackMetadataAutoSource = 'name' | 'full';
export type NowPlayingMode = 'widget' | 'free';
export type NowPlayingTextTreatment =
	| 'solid'
	| 'gradient'
	| 'metallic'
	| 'neon'
	| 'glass'
	| 'shadow';
export type LyricsTextTransition =
	| 'none'
	| 'fade'
	| 'slide-up'
	| 'slide-down'
	| 'scale'
	| 'blur'
	| 'pop';
export type LyricsActiveAnimation =
	| 'none'
	| 'pulse'
	| 'glow-pulse'
	| 'breathing'
	| 'shake-light'
	| 'wave'
	| 'flicker';
export type TrackTitleLayoutMode =
	| 'free'
	| 'centered'
	| 'left-dock'
	| 'right-dock';
export type TrackTitleFontStyle =
	| 'clean'
	| 'condensed'
	| 'techno'
	| 'mono'
	| 'serif'
	| 'display'
	| 'rounded'
	| 'handwritten'
	| 'poster'
	| 'black'
	| 'modern'
	| 'geometric'
	| 'slab'
	| 'elegant'
	| 'cinematic'
	| 'futuristic'
	| 'racing'
	| 'stencil'
	| 'pixel'
	| 'terminal'
	| 'comic'
	| 'marker'
	| 'brush'
	| 'kawaii'
	| 'blackletter';
export type LyricsLayoutMode = TrackTitleLayoutMode;
/** Per-layer color origin: manual hex, app theme palette, or extracted image palette. */
export type ColorSourceMode = 'manual' | 'theme' | 'image';
import type { LyricsLayerColorMode } from '@/features/lyrics/domain/types';

export type SpectrumColorMode =
	| 'solid'
	| 'gradient'
	| 'rainbow'
	| 'visible-rotate'
	/** Rainbow + black + white, cycled over time. */
	| 'complete-rotate';
/**
 * How the manual glow tints the bar/wave bloom when `spectrumManualGlow` is on.
 * The fill keeps its color-source colors; only the glow uses the two manual
 * colors. `core-halo`: inner glow = primary, outer halo = secondary.
 * `gradient`: glow blends primary→secondary. `peaks`: glow = primary, peak
 * markers = secondary.
 */
export type SpectrumManualGlowMode = 'core-halo' | 'gradient' | 'peaks';
/** Animates gradient phase along classic wave/bars when enabled. */
export type SpectrumGradientFlowDirection = 'forward' | 'reverse';
export type AudioReactiveChannel =
	| 'auto'
	| 'full'
	| 'kick'
	| 'instrumental'
	| 'bass'
	| 'hihat'
	| 'vocal';
export type ResolvedAudioReactiveChannel = Exclude<
	AudioReactiveChannel,
	'auto'
>;
export type SpectrumShockwaveBandThresholds = Partial<
	Record<ResolvedAudioReactiveChannel, number>
>;
export type SpectrumBandMode = AudioReactiveChannel;
export type SpectrumShape =
	| 'bars'
	| 'blocks'
	| 'lines'
	| 'wave'
	| 'dots'
	| 'capsules'
	// Retro LED equalizer: each bar is a column of cells snapped to a fixed
	// grid. Classic linear and radial.
	| 'pixel';
export type SpectrumLedShape = 'square' | 'rounded' | 'diamond' | 'circle';
export type SpectrumMode = 'radial' | 'linear';
export type SpectrumFamily =
	| 'classic'
	| 'oscilloscope'
	| 'tunnel'
	| 'liquid'
	| 'orbital'
	| 'spiral';
export type SpectrumLinearOrientation = 'horizontal' | 'vertical';
export type SpectrumLinearDirection = 'normal' | 'flipped';
export type SpectrumShockwaveColorMode = 'cycle' | 'primary' | 'secondary';
export type SpectrumRadialShape =
	| 'pentagon'
	| 'star6'
	| 'circle'
	| 'square'
	| 'triangle'
	| 'star'
	| 'diamond'
	| 'hexagon'
	| 'octagon'
	| 'oval'
	| 'lens'
	| 'squircle'
	| 'roundedSquare'
	| 'flower4'
	| 'flower5'
	| 'flower6'
	| 'flower8'
	| 'lobed3'
	| 'gear6'
	| 'gear12'
	| 'scalloped'
	| 'deltoid'
	| 'astroid'
	| 'bulgedTriangle'
	| 'bulgedSquare'
	| 'concaveTriangle'
	| 'catEars'
	| 'starburst10'
	| 'starburst12'
	| 'cross'
	| 'star3'
	| 'bowtie';
export type ParticleRotationDirection = 'clockwise' | 'counterclockwise';
export type LogoBandMode = AudioReactiveChannel;
export type ParticleColorMode =
	| 'solid'
	| 'gradient'
	| 'rainbow'
	| 'rotateRgb'
	/** Rainbow + black + white, cycled over time. */
	| 'completeRotate';
export type ParticleLayerMode = 'background' | 'foreground' | 'both';
export type ParticleAudioDriftMode = 'velocity' | 'offset' | 'burst';
/** @deprecated Direction is now implied by the Depth Flow mode. Kept only for
 *  backward-compatible persistence; the renderer/UI no longer read it. */
export type ParticleDepthFlowDirection = 'towardViewer' | 'awayFromViewer';
export type ParticleDepthFlowMode =
	| 'pullToCamera'
	| 'pushFromFocus'
	| 'tunnelBurst'
	| 'snowRush';
/** Where a particle is (re)placed when Depth Flow recycles it. */
export type ParticleDepthFlowSpawnOrigin =
	| 'randomScreen'
	| 'fromFocus'
	| 'fromEdges'
	| 'fromCenter'
	| 'fromTop'
	| 'fromBottom';
export type ParticleDepthFlowLowEnergyAxis = 'x' | 'y' | 'both';
export type ParticleShape =
	| 'circles'
	| 'squares'
	| 'triangles'
	| 'stars'
	| 'plus'
	| 'minus'
	| 'diamonds'
	| 'cross'
	| 'all';
export type RainParticleType = 'lines' | 'drops' | 'dots' | 'bars';
export type RainColorMode =
	| 'solid'
	| 'rainbow'
	/** Rainbow + black + white, cycled over time. */
	| 'completeRotate';
export type ScanlineMode = 'always' | 'pulse' | 'burst' | 'beat';
export type Language = 'en' | 'es';
export type ImageFitMode =
	| 'stretch'
	| 'cover'
	| 'contain'
	| 'fit-width'
	| 'fit-height';
export type FilterTarget =
	| 'global-background'
	| 'background'
	| 'selected-overlay'
	| 'logo'
	| 'spectrum'
	| 'particles'
	| 'rain'
	| 'track-title'
	| 'lyrics';

/**
 * One Looks treatment with its own values and its own set of target layers.
 *
 * Before effect layers there was a single stack of `filter*` values plus a
 * target list, so pointing the treatment at the spectrum took it away from the
 * background: the list was a choice between layers, never a composition of
 * them. Each layer here owns a full `FilterLookSettings`, so a CRT background
 * and a clean spectrum are two layers rather than an impossible request.
 *
 * Order is top-down and decides who wins: when two layers name the same
 * target, the first one in the array paints it. Values are never blended —
 * multiplying brightnesses across layers makes one slider change how a
 * different layer looks, and that is not something a user can predict.
 */
export type EffectLayer = {
	id: string;
	name: string;
	enabled: boolean;
	targets: FilterTarget[];
	/** Factory look / slot selection this layer last applied, if any. */
	lookId: string | null;
	settings: import('@/features/filterLooks/filterLooks').FilterLookSettings;
};

/**
 * One Camera Motion movement with its own values and its own target layers.
 *
 * Same shape and same rules as `EffectLayer`: order is top-down and decides
 * who wins, values are never blended, and the ACTIVE layer's live values are
 * the flat `cameraMotion*` keys rather than `settings` here. See
 * `features/stageFx/motionLayers.ts`.
 */
export type MotionLayer = {
	id: string;
	name: string;
	enabled: boolean;
	targets: import('@/features/stageFx/stageFxConfig').CameraMotionTarget[];
	settings: MotionLayerSettings;
};

/**
 * The per-layer Camera Motion values. Lives here rather than beside its helpers
 * in `features/stageFx/motionLayers.ts` so `types/` does not have to reach into
 * a feature for the shape it already owns — the flat keys below ARE these.
 * The master `cameraMotionEnabled` is deliberately not one of them: it gates
 * the whole subsystem, not a single movement.
 */
export type MotionLayerSettings = {
	cameraMotionMode: import('@/features/stageFx/stageFxConfig').CameraMotionMode;
	cameraMotionAmount: number;
	cameraMotionSpeed: number;
	cameraMotionDrive: import('@/features/stageFx/stageFxConfig').CameraMotionDrive;
	cameraMotionAudioInfluence: number;
	/**
	 * How much the audio level scales the AMPLITUDE (0 = never, 1 = doubles it
	 * on a peak). `cameraMotionAudioInfluence` drives the speed instead: a
	 * movement can get faster, bigger, both or neither.
	 */
	cameraMotionAmplitudeAudio: number;
	cameraMotionAudioChannel: import('@/features/stageFx/stageFxConfig').FxAudioChannel;
	cameraMotionDirection: import('@/features/stageFx/stageFxConfig').CameraMotionDirection;
};
/**
 * Where a manual timestamp sits inside its transition.
 *   • `start`  — the transition begins at the timestamp (legacy behaviour).
 *   • `center` — the timestamp is the middle of the transition.
 *   • `end`    — the transition ENDS at the timestamp, so the incoming image is
 *                fully on screen exactly on the beat. This is the one that
 *                needs look-ahead in the resolver, not a UI offset.
 */
export type SlideshowTransitionAnchor = 'start' | 'center' | 'end';
export type SlideshowTransitionType =
	| 'fade'
	| 'slide-left'
	| 'slide-right'
	| 'zoom-in'
	| 'blur-dissolve'
	| 'bars-horizontal'
	| 'bars-vertical'
	| 'rgb-shift'
	| 'distortion';
export type VisualTransitionSubsystem =
	| 'spectrum'
	| 'particles'
	| 'rain'
	| 'looks'
	| 'logo'
	| 'scene';
export type VisualTransitionSnapshot = {
	id: string;
	fromImageId: string | null;
	toImageId: string | null;
	startedAtMs: number;
	durationMs: number;
	easing: 'smoothstep';
	subsystems: VisualTransitionSubsystem[];
};
export type OverlayBlendMode = 'normal' | 'screen' | 'lighten' | 'multiply';
export type OverlayCropShape = 'rectangle' | 'rounded' | 'circle' | 'diamond';
export type BuiltInLayerId =
	| 'background-image'
	| 'slideshow'
	| 'logo'
	| 'track-title'
	| 'lyrics'
	| 'spectrum'
	| 'particle-background'
	| 'particle-foreground'
	| 'rain';

export interface OverlayImageItem {
	id: string;
	assetId: string;
	name: string;
	url: string | null;
	enabled: boolean;
	zIndex: number;
	positionX: number;
	positionY: number;
	scale: number;
	rotation: number;
	opacity: number;
	blendMode: OverlayBlendMode;
	cropShape: OverlayCropShape;
	edgeFade: number;
	edgeBlur: number;
	edgeGlow: number;
	width: number;
	height: number;
	audioOpacityReactive: boolean;
	audioOpacityAmount: number;
	audioOpacityInvert: boolean;
	audioOpacityChannel: AudioReactiveChannel;
}

export interface BackgroundImageItem {
	assetId: string;
	url: string | null;
	thumbnailUrl: string | null;
	/** Original upload filename when known. Older/imported assets may not have it. */
	originalFileName: string | null;
	/**
	 * When false the image stays in the pool (and keeps its per-image config)
	 * but the slideshow and manual nav skip it. Lets the user temporarily
	 * exclude images per song without losing them.
	 */
	enabled: boolean;
	// Transform
	scale: number;
	positionX: number;
	positionY: number;
	focusX: number | null;
	focusY: number | null;
	rotation: number;
	fitMode: ImageFitMode;
	/** True once the user hand-tuned this framing; Keep-Covered auto-fit
	 *  skips flagged images. Derived for pre-v113 persisted data. */
	coverageFramingEdited: boolean;
	mirror: boolean;
	mirrorFill: boolean;
	mirrorFillInvert: boolean;
	mirrorFillCount: number;
	opacity: number;
	// Per-image audio reactivity (overrides global imageBassReactive when set)
	bassReactive: boolean;
	bassIntensity: number;
	audioReactiveDecay: number;
	audioChannel: AudioReactiveChannel;
	// Transition (slideshow)
	transitionType: SlideshowTransitionType;
	transitionDuration: number;
	transitionIntensity: number;
	transitionAudioDrive: number;
	transitionAudioChannel: AudioReactiveChannel;
	logoProfileSlotId: string | null;
	spectrumProfileSlotId: string | null;
	particlesProfileSlotId: string | null;
	rainProfileSlotId: string | null;
	looksProfileSlotId: string | null;
	/** Inline per-image logo config. When set, takes priority over logoProfileSlotId. */
	logoOverride: LogoProfileSettings | null;
	/** Inline per-image spectrum config. When set, takes priority over spectrumProfileSlotIndex. */
	spectrumOverride: SpectrumProfileSettings | null;
	/** Inline per-image override of ONLY Spectrum 2's look (the second instance).
	 *  Independent of `spectrumOverride`; applied on top of it so an image can
	 *  carry its own Spectrum 2 without re-capturing the whole spectrum. */
	/** Inline per-image particles config. When set, takes priority over particlesProfileSlotIndex. */
	particlesOverride:
		| import('@/store/featureProfiles').ParticlesProfileSettings
		| null;
	/** Inline per-image rain config. When set, takes priority over rainProfileSlotIndex. */
	rainOverride: import('@/store/featureProfiles').RainProfileSettings | null;
	/** Inline per-image looks config. When set, takes priority over looksProfileSlotIndex. */
	looksOverride:
		| import('@/store/featureProfiles').LooksProfileSettings
		| null;
	/**
	 * This image keeps applying its own scene / overrides even while the
	 * global composition mode is on. Per-image opt-out, not a second global.
	 */
	ignoreGlobalOverride?: boolean;
	/** Seconds into the audio track at which this image becomes active (manual timestamps mode). */
	playbackSwitchAt: number | null;
	/**
	 * Scene slot applied when this image becomes active. A Scene slot is a
	 * composition of references to feature slots (spectrum, looks, particles,
	 * rain, logo, trackTitle). `null` means no scene-level orchestration is
	 * applied; per-image overrides / profile slot indices still take effect.
	 */
	sceneSlotId: string | null;
}

export interface ProfileSlot<T> {
	/** Stable identity — scenes and per-image bindings reference slots by this
	 *  id (never by array position), so reordering/deleting other slots can't
	 *  retarget a binding. Backfilled by migration v104 for older stores. */
	id: string;
	name: string;
	values: T | null;
}

/**
 * A Scene slot stores only REFERENCES to feature slots. It never flattens raw
 * feature configuration. `null` for a reference means "do not apply this
 * subsystem"; the feature's current state is preserved.
 *
 * Motion (combined particles+rain) is intentionally NOT referenced here — use
 * `particlesSlotIndex` + `rainSlotIndex` for granular composition.
 */
/**
 * A "Setlist" is a saved, named curation of the global pool: which images
 * (by `BackgroundImageItem.assetId`) and which audio tracks (by playlist
 * track id) belong to this mix / video / theme. The library itself is
 * GLOBAL — setlists are references, not copies. When `activeSetlistId`
 * names a setlist, the rest of the app shows ONLY the items it lists.
 */
export interface Setlist {
	id: string;
	name: string;
	imageAssetIds: string[];
	trackIds: string[];
	/** Epoch ms — used to sort the panel newest-first if the user prefers. */
	createdAt: number;
}

/**
 * A scene binding reference has THREE states:
 *  - `null`   → "no change": don't touch this subsystem (keep current state).
 *  - `'off'`  → force the subsystem OFF on this image.
 *  - `number` → apply the saved slot at this index.
 */
/** Reference to a feature ProfileSlot by its stable `id`. `'off'` force-disables
 *  the subsystem; `null` leaves it untouched. (Was an array index before v104.) */
export type SceneSlotRef = string | 'off' | null;

export interface SceneSlot {
	id: string;
	name: string;
	spectrumSlotId: SceneSlotRef;
	/** Spectrum 2's slot (from `spectrumSecondProfileSlots`). Independent of
	 *  `spectrumSlotId` so a scene can bind each spectrum separately. */
	spectrumSecondSlotId: SceneSlotRef;
	looksSlotId: SceneSlotRef;
	particlesSlotId: SceneSlotRef;
	rainSlotId: SceneSlotRef;
	lightsSlotId: SceneSlotRef;
	cameraFxSlotId: SceneSlotRef;
	logoSlotId: SceneSlotRef;
	trackTitleSlotId: SceneSlotRef;
}

/**
 * Appearance + placement of one spectrum, named exactly like the main
 * spectrum's flat WallpaperState keys. The main spectrum stores these flat in
 * the root state; extra instances carry them inside `spectrumInstances`, so
 * renderer/placement/color code runs unchanged on `{ ...state, ...instance }`.
 */
export interface SpectrumInstanceSettings {
	spectrumFamily: SpectrumFamily;
	/** Master switch for the Frame Memory effect (afterglow / motion trails /
	 *  ghost frames / history depth). When off the runtime skips the underlay
	 *  and the editor hides its controls. */
	spectrumFrameMemoryEnabled: boolean;
	spectrumAfterglow: number;
	spectrumMotionTrails: number;
	spectrumGhostFrames: number;
	/**
	 * Number of past frames blended into the ghost / motion-trail composite.
	 * Higher = longer visual memory (more cost). Capped per visual-quality
	 * tier in `historyDepthCapForTier()` so a `minimal` tier still tops out
	 * at 2 even if the user asks for 6.
	 */
	spectrumFrameHistoryDepth: number;
	/**
	 * How much the global energy envelope modulates bar height per frame.
	 * 0 = bars ignore the envelope entirely (only per-bin smoothed value
	 * drives height). 0.5 ≈ original behavior (subtle 8% peak pop). 1 =
	 * cinematic pop with 30% drop on silence + 20% surge on peaks. Used in
	 * `CircularSpectrum.ts` to compute `globalGain`.
	 */
	spectrumGainExpressiveness: number;
	/**
	 * Per-spectrum envelope shaping (mirrors logo/BG envelope params). These
	 * parameters drive `runtime.energyEnvelope.tick()` in CircularSpectrum.
	 * Defaults preserve the previously hardcoded values.
	 */
	spectrumEnvelopeAttack: number;
	spectrumEnvelopeRelease: number;
	spectrumEnvelopeReactivitySpeed: number;
	spectrumEnvelopePeakWindow: number;
	spectrumEnvelopePeakFloor: number;
	spectrumEnvelopePunch: number;
	spectrumPeakRibbonsEnabled: boolean;
	spectrumPeakRibbons: number;
	spectrumBassShockwaveEnabled: boolean;
	spectrumBassShockwave: number;
	spectrumShockwaveBandMode: SpectrumBandMode;
	/** Per-band trigger sensitivity. Lower values generate shockwaves more often. */
	spectrumShockwaveBandThresholds: SpectrumShockwaveBandThresholds;
	/** Main shockwave line thickness multiplier (0 = hairline, 1 = default). */
	spectrumShockwaveThickness: number;
	/** Main shockwave line opacity multiplier (0..1). */
	spectrumShockwaveOpacity: number;
	/** Main shockwave glow/blur multiplier (0 = no blur, 1 = default). */
	spectrumShockwaveBlur: number;
	/** Main shockwave color source. */
	spectrumShockwaveColorMode: SpectrumShockwaveColorMode;
	spectrumEnergyBloomEnabled: boolean;
	spectrumEnergyBloom: number;
	/** Main spectrum: rotates peak-ribbon polyline (deg). */
	spectrumPeakRibbonAngle: number;
	/** Main radial families: rotates the figure contour without rotating the bars. */
	spectrumFigureRotationSpeed: number;
	spectrumMode: SpectrumMode;
	spectrumLinearOrientation: SpectrumLinearOrientation;
	spectrumLinearDirection: SpectrumLinearDirection;
	spectrumRadialShape: SpectrumRadialShape;
	spectrumRadialAngle: number;
	spectrumRadialSharpness: number;
	spectrumRadialFitLogo: boolean;
	spectrumFollowLogo: boolean;
	spectrumLogoGap: number;
	spectrumSpan: number;
	spectrumScale: number;
	spectrumInnerRadius: number;
	spectrumBarCount: number;
	spectrumBarWidth: number;
	spectrumMinHeight: number;
	spectrumMaxHeight: number;
	spectrumSmoothing: number;
	spectrumOpacity: number;
	spectrumGlowIntensity: number;
	spectrumGlowReach: number;
	spectrumGlowAudioAmount: number;
	spectrumShadowBlur: number;
	spectrumPrimaryColor: string;
	spectrumSecondaryColor: string;
	spectrumColorSource: ColorSourceMode;
	spectrumColorMode: SpectrumColorMode;
	spectrumManualGlow: boolean;
	spectrumManualGlowMode: SpectrumManualGlowMode;
	/**
	 * Independent color identity for the manual glow, decoupled from the fill
	 * colors. Source (manual/image/theme) + mode (solid/gradient) + its own two
	 * colors; `spectrumManualGlowMode` still decides the core/halo/peaks layout.
	 */
	spectrumGlowColorSource: ColorSourceMode;
	spectrumGlowColorMode: SpectrumColorMode;
	spectrumGlowPrimaryColor: string;
	spectrumGlowSecondaryColor: string;
	/**
	 * Global retro pixelation: render the whole spectrum (any family) to an
	 * offscreen buffer and upscale it nearest-neighbor so everything snaps to a
	 * chunky pixel grid. `spectrumPixelateScale` = pixel block size in px.
	 */
	spectrumPixelate: boolean;
	spectrumPixelateScale: number;
	spectrumLedCellSize: number;
	spectrumLedCellGap: number;
	spectrumLedAngle: number;
	spectrumLedShape: SpectrumLedShape;
	spectrumRgbSplit: boolean;
	spectrumRgbSplitAmount: number;
	/** Thin bright core over wave/scope traces (one extra stroke, no blur). */
	spectrumNeonCore: boolean;
	spectrumNeonCoreIntensity: number;
	/** Core width as a fraction of the trace line width. */
	spectrumNeonCoreWidth: number;
	/** Animates gradient phase along the spectrum shape. */
	spectrumGradientFlow: boolean;
	spectrumGradientFlowSpeed: number;
	spectrumGradientFlowAudio: boolean;
	spectrumGradientFlowDirection: SpectrumGradientFlowDirection;
	/** Bright accents at local peaks (capped count, not a particle system). */
	spectrumPeakSparks: boolean;
	spectrumPeakSparksAmount: number;
	spectrumPeakSparksSize: number;
	spectrumPeakSparksThreshold: number;
	/**
	 * One or two previous wave traces with decaying opacity. Bounded memory —
	 * distinct from Frame Memory / Ghost Frames.
	 */
	spectrumEchoTrace: boolean;
	spectrumEchoTraceCount: 1 | 2;
	spectrumEchoTraceOpacity: number;
	spectrumEchoTraceOffset: number;
	spectrumEchoTraceDecay: number;
	spectrumBandMode: SpectrumBandMode;
	spectrumAudioSmoothing: number;
	spectrumShape: SpectrumShape;
	spectrumWaveFillOpacity: number;
	spectrumRotationSpeed: number;
	spectrumRotationDrive: import('@/features/stageFx/stageFxConfig').SpectrumRotationDrive;
	spectrumRotationAudioAmount: number;
	spectrumRotationChannel: import('@/features/stageFx/stageFxConfig').SpectrumRotationChannel;
	spectrumRotationDirection: import('@/features/stageFx/stageFxConfig').RotationDirection;
	spectrumRotationSmoothing: number;
	spectrumRotationInvertOnLowEnergy: boolean;
	spectrumRotationInvertThreshold: number;
	spectrumRotationInvertHoldMs: number;
	spectrumMirror: boolean;
	spectrumPeakHold: boolean;
	spectrumPeakDecay: number;
	spectrumPositionX: number;
	spectrumPositionY: number;
	spectrumOscilloscopeLineWidth: number;
	spectrumTunnelRingCount: number;
	/** Far rings dimmer (0) vs uniform (1). */
	spectrumTunnelDepthFalloff: number;
	/** 0 = even ring spacing; 1 = pack rings toward the outer rim. */
	spectrumTunnelRingSpacing: number;
	/** Fill between rings for a tube wall (0 = outline only). */
	spectrumTunnelWallOpacity: number;
	/** How much audio pushes rings outward. */
	spectrumTunnelPulseStrength: number;
	/**
	 * When on, even-indexed rings rotate `+rotation` and odd-indexed rings
	 * rotate `-rotation` — produces a counter-rotating depth illusion that
	 * reads as a layered spinning corridor. Radial mode only (linear tunnel
	 * draws straight corridor lines, no rotation to invert).
	 */
	spectrumTunnelAlternateRotation: boolean;
	/** Liquid layer 1 (back) — opacity multiplier. */
	spectrumLiquidLayer1Opacity: number;
	spectrumLiquidLayer2Opacity: number;
	spectrumLiquidLayer3Opacity: number;
	/** Liquid per-layer audio amplitude multiplier. */
	spectrumLiquidLayer1Amp: number;
	spectrumLiquidLayer2Amp: number;
	spectrumLiquidLayer3Amp: number;
	/** Liquid per-layer fill multiplier (× wave fill). */
	spectrumLiquidLayer1Fill: number;
	spectrumLiquidLayer2Fill: number;
	spectrumLiquidLayer3Fill: number;
	/** Liquid per-layer wobble speed multiplier. */
	spectrumLiquidLayer1Speed: number;
	spectrumLiquidLayer2Speed: number;
	spectrumLiquidLayer3Speed: number;
	/** Liquid radial rigid shape: per-layer figure rotation speed. */
	spectrumLiquidLayer1RotationSpeed: number;
	spectrumLiquidLayer2RotationSpeed: number;
	spectrumLiquidLayer3RotationSpeed: number;
	spectrumLiquidLayer1Shape: SpectrumRadialShape;
	spectrumLiquidLayer2Shape: SpectrumRadialShape;
	spectrumLiquidLayer3Shape: SpectrumRadialShape;
	/**
	 * Liquid radial: per-layer "rigid shape" mode. When on for that layer,
	 * the layer keeps its contour stable and the whole figure scales with
	 * audio. When off, the contour wobbles with per-bin amplitude.
	 */
	spectrumLiquidLayer1RigidShape: boolean;
	spectrumLiquidLayer2RigidShape: boolean;
	spectrumLiquidLayer3RigidShape: boolean;
	/** Retro pixelate applied to this liquid layer alone (see spectrumPixelate for all layers). */
	spectrumLiquidLayer1Pixelate: boolean;
	spectrumLiquidLayer2Pixelate: boolean;
	spectrumLiquidLayer3Pixelate: boolean;
	/** Spiral family — total revolutions from inner to outer radius. */
	spectrumSpiralTurns: number;
	/** Spiral family — outer radius as a fraction of the short canvas side (0..1). */
	spectrumSpiralOuterRadius: number;
	/** Spiral family — radius growth ease (>1 = packed outer, <1 = packed inner). */
	spectrumSpiralTightness: number;
	/** Spiral family — outline shape modulating the radius per angle. */
	spectrumSpiralShape: SpectrumRadialShape;
	/** Spiral family — log radius mapping (galaxy-like vs Archimedean). */
	spectrumSpiralLogarithmic: boolean;
	/** Spiral family — paint each segment of the stroke with `getColor()` so the curve takes the gradient instead of staying primary-only. */
	spectrumSpiralGradientStroke: boolean;
	/** Spiral family — number of parallel arms (1..4) of the spiral, rotated evenly around the center. */
	spectrumSpiralArms: number;
	/** Spiral family — how much audio amplitude drives extra turn count on hits (0..1). */
	spectrumSpiralAudioTurns: number;
	/** Spiral family — dot shape variant. `'mix'` cycles through every shape per bin. */
	spectrumSpiralDotShape: SpectrumSpiralDotShape;
	/** Spiral family — multiplier on the connecting line width (0 hides the stroke). */
	spectrumSpiralStrokeWidth: number;
	/**
	 * Scope family — trace response factor. 1 = slow / persistent wave
	 * (heavy lerp with previous frame's PCM, the most "calm" visual), 4 =
	 * snap (raw PCM each frame, the most reactive visual). Despite the
	 * historic field name, this is not a spatial scroll or height amount. Drives the
	 * frame-to-frame lerp in `oscilloscopeRenderer.getScopeSmoothingAlpha`.
	 */
	spectrumOscilloscopeScrollSpeed: number;
	/** Scope family — line thickness modulates with amplitude when on. */
	spectrumOscilloscopeReactiveWidth: boolean;
	/** Scope family — CRT-style afterglow trail behind the live trace. */
	spectrumOscilloscopePhosphor: boolean;
	/** Scope family — phosphor decay rate (0.05 = slow fade, 0.4 = quick fade). */
	spectrumOscilloscopePhosphorDecay: number;
	/** Scope family — toggles a CRT reticle behind the trace. */
	spectrumOscilloscopeGrid: boolean;
	/** Scope family — number of major divisions in the reticle. */
	spectrumOscilloscopeGridDivisions: number;
}

/** One extra spectrum beyond the main one ("Spectrum 2"). Capped by
 *  SPECTRUM_MAX_INSTANCES in features/spectrum/spectrumInstanceModel. */
export interface SpectrumInstance extends SpectrumInstanceSettings {
	id: string;
	enabled: boolean;
}

export interface SpectrumProfileSettings extends SpectrumInstanceSettings {
	spectrumEnabled: boolean;
	spectrumMainVisible: boolean;
	/**
	 * How audio + manual key input combine to drive the spectrum height:
	 *   - `audio`  : audio FFT only (legacy default)
	 *   - `max`    : per-section `max(audio, manual)` — manual lifts the
	 *                floor, audio still wins on peaks louder than the press
	 *   - `add`    : per-section `clamp(audio + manual * weight, 0, 1)` —
	 *                manual is additive, lets the user push past the natural
	 *                ceiling
	 *   - `manual` : audio ignored, only key presses drive the spectrum
	 *
	 * Manual drive is global: the keyboard runtime drives every instance.
	 */
	spectrumDriveMode: SpectrumDriveMode;
	/** How many sections the bar count is split into for manual key control (4..12). */
	spectrumManualSections: number;
	/** Weight of the manual signal when `spectrumDriveMode === 'add'`. */
	spectrumManualAddWeight: number;
	/** Time constant in seconds for a key press ramping the section to 1.0. */
	spectrumManualAttack: number;
	/** Time constant in seconds for a release dropping the section back to 0. */
	spectrumManualRelease: number;
	/** Extra spectrums beyond the main one. */
	spectrumInstances: SpectrumInstance[];
}

export type SpectrumDriveMode = 'audio' | 'max' | 'add' | 'manual';

/** Maximum sections the user can split the bar count into. Keybindings
 *  array is sized to this even if the active sections slider is lower. */
export const MAX_SPECTRUM_MANUAL_SECTIONS = 12;

/** Glyph used to draw each spiral dot. `'mix'` cycles every concrete shape. */
export type SpectrumSpiralDotShape =
	| 'circle'
	| 'square'
	| 'triangle'
	| 'diamond'
	| 'star'
	| 'plus'
	| 'mix';

export interface LogoProfileSettings {
	logoEnabled: boolean;
	logoVariantMode: LogoVariantMode;
	logoBaseSize: number;
	logoPositionX: number;
	logoPositionY: number;
	logoCircularCrop: boolean;
	logoCropRadius: number;
	logoBandMode: LogoBandMode;
	logoAudioSmoothing: number;
	logoAudioSensitivity: number;
	logoReactiveScaleIntensity: number;
	logoReactivitySpeed: number;
	logoAttack: number;
	logoRelease: number;
	logoMinScale: number;
	logoMaxScale: number;
	logoPunch: number;
	logoPeakWindow: number;
	logoPeakFloor: number;
	/** Master toggle for the glow ring around the logo. Default true. */
	logoGlowEnabled: boolean;
	logoGlowColor: string;
	logoGlowColorSource: ColorSourceMode;
	logoGlowBlur: number;
	logoGlowReach: number;
	logoGlowAudioAmount: number;
	logoShadowEnabled: boolean;
	logoShadowColor: string;
	logoShadowColorSource: ColorSourceMode;
	logoShadowBlur: number;
	logoBackdropEnabled: boolean;
	logoBackdropColor: string;
	logoBackdropColorSource: ColorSourceMode;
	logoBackdropOpacity: number;
	logoBackdropPadding: number;
	/** Rotation speed in radians per second. 0 = static. */
	logoRotationSpeed: number;
}

export interface BackgroundProfileSettings {
	imageBassReactive: boolean;
	imageBassScaleIntensity: number;
	imageAudioReactiveDecay: number;
	imageAudioSmoothing: number;
	imageOpacityReactive: boolean;
	imageOpacityReactiveAmount: number;
	imageOpacityReactiveInvert: boolean;
	imageOpacityReactiveThreshold: number;
	imageOpacityReactiveSoftness: number;
	imageBlurReactive: boolean;
	imageBlurReactiveAmount: number;
	imageBlurReactiveInvert: boolean;
	imageBlurReactiveThreshold: number;
	imageBlurReactiveSoftness: number;
	imageBassAttack: number;
	imageBassRelease: number;
	imageBassReactivitySpeed: number;
	imageBassPeakWindow: number;
	imageBassPeakFloor: number;
	imageBassPunch: number;
	imageBassReactiveScaleIntensity: number;
	imageAudioChannel: AudioReactiveChannel;
	parallaxStrength: number;
}

export type WallpaperState = {
	// Background FX
	rgbShift: number;
	/** Master switch for the Scanlines group (intensity + mode + spacing +
	 *  thickness). When off the runtime treats intensity as 0 and the editor
	 *  hides the group, preserving the stored values. */
	scanlinesEnabled: boolean;
	scanlineIntensity: number;
	scanlineMode: ScanlineMode;
	scanlineSpacing: number;
	scanlineThickness: number;
	parallaxStrength: number;
	backgroundImageEnabled: boolean;
	imageUrl: string | null;
	imageScale: number;
	imagePositionX: number;
	imagePositionY: number;
	imageFocusX: number | null;
	imageFocusY: number | null;
	imageOpacity: number;
	imageBassReactive: boolean;
	imageBassScaleIntensity: number;
	imageAudioReactiveDecay: number;
	imageAudioSmoothing: number;
	imageOpacityReactive: boolean;
	imageOpacityReactiveAmount: number;
	imageOpacityReactiveInvert: boolean;
	imageOpacityReactiveThreshold: number;
	imageOpacityReactiveSoftness: number;
	imageBlurReactive: boolean;
	imageBlurReactiveAmount: number;
	imageBlurReactiveInvert: boolean;
	imageBlurReactiveThreshold: number;
	imageBlurReactiveSoftness: number;
	/** Logo-style envelope for background zoom (attack/release/peak/punch); release syncs legacy `imageAudioReactiveDecay`. */
	imageBassAttack: number;
	imageBassRelease: number;
	imageBassReactivitySpeed: number;
	imageBassPeakWindow: number;
	imageBassPeakFloor: number;
	imageBassPunch: number;
	imageBassReactiveScaleIntensity: number;
	/** Last applied built-in BG zoom envelope preset; `null` after manual edits. */
	imageBassZoomPresetId: 'classic' | 'smooth' | 'punchy' | null;
	imageAudioChannel: AudioReactiveChannel;
	backgroundProfileSlots: ProfileSlot<BackgroundProfileSettings>[];
	imageFitMode: ImageFitMode;
	/**
	 * Manual framing: the coverage math (AutoZoom raise, keep-covered clamp)
	 * is off and scale/position are whatever the user typed. Turning it back
	 * off re-enables the math and refits the active image.
	 */
	imageFramingManualEnabled: boolean;
	imageMirror: boolean;
	imageMirrorFill: boolean;
	imageMirrorFillInvert: boolean;
	imageMirrorFillCount: number;
	/** Degrees; synced with active pool image `rotation`. */
	imageRotation: number;
	/** Debug HUD: live scale boost + audio drive (top-left) */
	showBackgroundScaleMeter: boolean;
	/** Debug overlay: authored vs drawn Keep-Covered frames on the canvas */
	showAutoZoomDebug: boolean;
	/** Debug HUD: spectrum channel, bins energy, gain, follow-logo placement */
	showSpectrumDiagnosticsHud: boolean;
	/** Debug HUD: logo drive, envelope, link to spectrum follow */
	showLogoDiagnosticsHud: boolean;
	/** Diagnostics HUD stack anchor (viewport fraction 0–1, top-left origin). */
	diagnosticsHudPositionX: number;
	diagnosticsHudPositionY: number;
	/**
	 * Every effect layer, top-down. The ACTIVE layer's live values are the
	 * legacy `filter*` keys below — its entry here is a snapshot that goes
	 * stale while it is selected, which is why readers must go through
	 * `features/filterLooks/filterStack` instead of indexing this array.
	 */
	effectLayers: EffectLayer[];
	/** Which layer the Looks tab is editing. */
	activeEffectLayerId: string;
	/** Target list of the ACTIVE effect layer. */
	filterTargets: FilterTarget[];
	filterOpacity: number;
	filterBrightness: number;
	filterContrast: number;
	filterSaturation: number;
	filterBlur: number;
	filterHueRotate: number;
	filterVignette: number;
	filterBloom: number;
	filterLumaThreshold: number;
	filterLensWarp: number;
	filterHeatDistortion: number;
	activeFilterLookId: string | null;
	/** Saved tone / glitch / scanline bundle for the Custom look slot. */
	customFilterLookSettings:
		| import('@/features/filterLooks/filterLooks').FilterLookPreset['settings']
		| null;
	globalBackgroundEnabled: boolean;
	globalBackgroundId: string | null;
	globalBackgroundUrl: string | null;
	globalBackgroundScale: number;
	globalBackgroundPositionX: number;
	globalBackgroundPositionY: number;
	globalBackgroundFitMode: ImageFitMode;
	globalBackgroundOpacity: number;
	globalBackgroundBrightness: number;
	globalBackgroundContrast: number;
	globalBackgroundSaturation: number;
	globalBackgroundBlur: number;
	globalBackgroundHueRotate: number;

	// Audio
	audioReactive: boolean;
	audioSensitivity: number;
	audioCaptureState: AudioCaptureState;
	audioSourceMode: AudioSourceMode;
	audioFileAssetId: string | null;
	audioFileName: string;
	audioFileVolume: number;
	audioFileLoop: boolean;
	audioPaused: boolean;
	motionPaused: boolean;
	fftSize: number;
	audioSmoothing: number;
	audioChannelSmoothing: number;
	audioAutoKickThreshold: number;
	audioAutoSwitchHoldMs: number;
	// Playlist
	audioTracks: AudioPlaylistTrack[];
	activeAudioTrackId: string | null;
	queuedAudioTrackId: string | null;
	audioCrossfadeEnabled: boolean;
	audioCrossfadeSeconds: number;
	audioAutoAdvance: boolean;
	audioMixMode: AudioMixMode;
	audioTransitionStyle: AudioTransitionStyle;
	/** Enable Media Session API (lock screen / notification controls). */
	mediaSessionEnabled: boolean;
	/** Where the now-playing artist/title come from. 'manual' uses the
	 *  per-track manualArtist/manualTitle overrides; 'auto' derives them. */
	trackMetadataMode: TrackMetadataMode;
	/** In auto mode: 'name' parses the filename; 'full' reads embedded ID3
	 *  tags (artist/title/album/cover), falling back to the filename. */
	trackMetadataAutoSource: TrackMetadataAutoSource;
	/** Now-playing render: 'widget' is the cohesive card (cover + artist +
	 *  title + progress); 'free' is the legacy two-loose-lines layout. */
	nowPlayingMode: NowPlayingMode;
	/** Widget mode: show album cover art (when the track has one). */
	nowPlayingCoverEnabled: boolean;
	/** Widget mode: show the artist line above the title. */
	nowPlayingArtistEnabled: boolean;
	/** Widget mode: show the progress bar + elapsed/total time. */
	nowPlayingProgressEnabled: boolean;
	/** Widget mode: overall scale multiplier for the whole card. */
	nowPlayingScale: number;
	/** Widget mode: accent color for the progress fill / cover ring. */
	nowPlayingAccentColor: string;
	nowPlayingAccentColorSource: ColorSourceMode;
	/** Fill treatment for the widget text (solid, gradient, metallic, …). */
	nowPlayingTextTreatment: NowPlayingTextTreatment;
	/** macOS-style liquid-glass panel behind the Now Playing / Track Info
	 *  widget (frosted, magnified backdrop) instead of the solid backdrop. */
	/** Backdrop blur radius (px) for the Track Info liquid-glass panel. */
	/** Lens magnification of the sampled backdrop (1 = none). */
	/** Tint overlay strength (0 = clear glass → 1 = opaque). Uses the widget's
	 *  backdrop color as the tint hue. */
	/** Global manual artist/title fallback for manual metadata mode when there
	 *  is no active playlist track (e.g. live/file capture). */
	trackManualArtist: string;
	trackManualTitle: string;
	audioTrackTitleEnabled: boolean;
	audioTrackTitleLayoutMode: TrackTitleLayoutMode;
	audioTrackTitleFontStyle: TrackTitleFontStyle;
	audioTrackTitleUppercase: boolean;
	audioTrackTitlePositionX: number;
	audioTrackTitlePositionY: number;
	audioTrackTitleFontSize: number;
	audioTrackTitleLetterSpacing: number;
	audioTrackTitleWidth: number;
	audioTrackTitleOpacity: number;
	audioTrackTitleScrollSpeed: number;
	audioTrackTitleRgbShift: number;
	audioTrackTitleTextColor: string;
	audioTrackTitleTextColorSource: ColorSourceMode;
	audioTrackTitleStrokeColor: string;
	audioTrackTitleStrokeColorSource: ColorSourceMode;
	audioTrackTitleStrokeWidth: number;
	audioTrackTitleGlowColor: string;
	audioTrackTitleGlowColorSource: ColorSourceMode;
	audioTrackTitleGlowBlur: number;
	audioTrackTitleGlowReach: number;
	audioTrackTitleBackdropEnabled: boolean;
	audioTrackTitleBackdropColor: string;
	audioTrackTitleBackdropColorSource: ColorSourceMode;
	audioTrackTitleBackdropOpacity: number;
	audioTrackTitleBackdropPadding: number;
	audioTrackTitleFilterBrightness: number;
	audioTrackTitleFilterContrast: number;
	audioTrackTitleFilterSaturation: number;
	audioTrackTitleFilterBlur: number;
	audioTrackTitleFilterHueRotate: number;
	audioTrackTimeEnabled: boolean;
	audioTrackTimePositionX: number;
	audioTrackTimePositionY: number;
	audioTrackTimeWidth: number;
	audioTrackTimeFontStyle: TrackTitleFontStyle;
	audioTrackTimeFontSize: number;
	audioTrackTimeLetterSpacing: number;
	audioTrackTimeOpacity: number;
	audioTrackTimeRgbShift: number;
	audioTrackTimeTextColor: string;
	audioTrackTimeTextColorSource: ColorSourceMode;
	audioTrackTimeStrokeColor: string;
	audioTrackTimeStrokeColorSource: ColorSourceMode;
	audioTrackTimeStrokeWidth: number;
	audioTrackTimeGlowColor: string;
	audioTrackTimeGlowColorSource: ColorSourceMode;
	audioTrackTimeGlowBlur: number;
	audioTrackTimeGlowReach: number;
	audioTrackTimeFilterBrightness: number;
	audioTrackTimeFilterContrast: number;
	audioTrackTimeFilterSaturation: number;
	audioTrackTimeFilterBlur: number;
	audioTrackTimeFilterHueRotate: number;
	audioLyricsEnabled: boolean;
	audioLyricsLayoutMode: LyricsLayoutMode;
	audioLyricsUppercase: boolean;
	audioLyricsPositionX: number;
	audioLyricsPositionY: number;
	audioLyricsWidth: number;
	audioLyricsFontStyle: TrackTitleFontStyle;
	audioLyricsFontSize: number;
	audioLyricsLetterSpacing: number;
	audioLyricsLineHeight: number;
	audioLyricsVisibleLineCount: number;
	/**
	 * Show the translation layer of an imported Lyrixa bundle. Global rather
	 * than per-track: it is a viewer preference ("I read Spanish"), not a
	 * property of one song.
	 */
	audioLyricsShowTranslation: boolean;
	audioLyricsOpacity: number;
	audioLyricsInactiveOpacity: number;
	audioLyricsTimeOffsetMs: number;
	audioLyricsActiveColor: string;
	audioLyricsActiveColorSource: ColorSourceMode;
	/** Solid / gradient / rainbow / rotate, shared with the per-layer slots. */
	audioLyricsActiveColorMode: LyricsLayerColorMode;
	audioLyricsActiveColorSecondary: string;
	audioLyricsInactiveColor: string;
	audioLyricsInactiveColorSource: ColorSourceMode;
	audioLyricsTextTreatment: NowPlayingTextTreatment;
	audioLyricsStrokeColor: string;
	audioLyricsStrokeColorSource: ColorSourceMode;
	audioLyricsStrokeColorMode: LyricsLayerColorMode;
	audioLyricsStrokeColorSecondary: string;
	audioLyricsStrokeWidth: number;
	audioLyricsGlowColor: string;
	audioLyricsGlowColorSource: ColorSourceMode;
	audioLyricsGlowColorMode: LyricsLayerColorMode;
	audioLyricsGlowColorSecondary: string;
	audioLyricsGlowBlur: number;
	audioLyricsGlowReach: number;
	audioLyricsTransitionIn: LyricsTextTransition;
	audioLyricsTransitionOut: LyricsTextTransition;
	audioLyricsActiveAnimation: LyricsActiveAnimation;
	audioLyricsAnimationDurationMs: number;
	audioLyricsBackdropEnabled: boolean;
	audioLyricsBackdropColor: string;
	audioLyricsBackdropColorSource: ColorSourceMode;
	audioLyricsBackdropColorMode: LyricsLayerColorMode;
	audioLyricsBackdropColorSecondary: string;
	/** Fade / move the backdrop with the lyric line animation. */
	audioLyricsBackdropFollowAnimation: boolean;
	audioLyricsBackdropOpacity: number;
	audioLyricsBackdropPadding: number;
	audioLyricsBackdropRadius: number;
	/** macOS-style liquid-glass panel behind the lyrics block (frosted,
	 *  magnified backdrop) instead of the solid backdrop. */
	/** Backdrop blur radius (px) for the lyrics liquid-glass panel. */
	/** Lens magnification of the sampled backdrop (1 = none). */
	/** Tint overlay strength (0 = clear glass → 1 = opaque). Uses the lyrics
	 *  backdrop color as the tint hue. */
	audioLyricsByTrackAssetId: Record<string, AudioLyricsTrackEntry>;

	// Spectrum
	spectrumEnabled: boolean;
	/** Draws the main spectrum. Independent from the extra instances: turning
	 *  this off with an enabled instance leaves only that instance visible.
	 *  Visibility-only — not part of SpectrumProfileSettings. */
	spectrumMainVisible: boolean;
	/** Extra spectrums beyond the main one ("Spectrum 2"). */
	spectrumInstances: SpectrumInstance[];
	spectrumMode: SpectrumMode;
	spectrumLinearOrientation: SpectrumLinearOrientation;
	spectrumLinearDirection: SpectrumLinearDirection;
	spectrumRadialShape: SpectrumRadialShape;
	spectrumRadialAngle: number;
	spectrumRadialSharpness: number;
	spectrumRadialFitLogo: boolean;
	spectrumFollowLogo: boolean;
	spectrumLogoGap: number;
	spectrumSpan: number;
	spectrumScale: number;
	spectrumInnerRadius: number;
	spectrumBarCount: number;
	spectrumBarWidth: number;
	spectrumMinHeight: number;
	spectrumMaxHeight: number;
	spectrumSmoothing: number;
	spectrumOpacity: number;
	spectrumGlowIntensity: number;
	spectrumGlowReach: number;
	spectrumGlowAudioAmount: number;
	spectrumShadowBlur: number;
	spectrumPrimaryColor: string;
	spectrumSecondaryColor: string;
	spectrumColorSource: ColorSourceMode;
	spectrumColorMode: SpectrumColorMode;
	spectrumManualGlow: boolean;
	spectrumManualGlowMode: SpectrumManualGlowMode;
	/**
	 * Independent color identity for the manual glow, decoupled from the fill
	 * colors. Source (manual/image/theme) + mode (solid/gradient) + its own two
	 * colors; `spectrumManualGlowMode` still decides the core/halo/peaks layout.
	 */
	spectrumGlowColorSource: ColorSourceMode;
	spectrumGlowColorMode: SpectrumColorMode;
	spectrumGlowPrimaryColor: string;
	spectrumGlowSecondaryColor: string;
	/**
	 * Global retro pixelation: render the whole spectrum (any family) to an
	 * offscreen buffer and upscale it nearest-neighbor so everything snaps to a
	 * chunky pixel grid. `spectrumPixelateScale` = pixel block size in px.
	 */
	spectrumPixelate: boolean;
	spectrumPixelateScale: number;
	spectrumLedCellSize: number;
	spectrumLedCellGap: number;
	spectrumLedAngle: number;
	spectrumLedShape: SpectrumLedShape;
	spectrumRgbSplit: boolean;
	spectrumRgbSplitAmount: number;
	/** Thin bright core over wave/scope traces (one extra stroke, no blur). */
	spectrumNeonCore: boolean;
	spectrumNeonCoreIntensity: number;
	/** Core width as a fraction of the trace line width. */
	spectrumNeonCoreWidth: number;
	/** Animates gradient phase along the spectrum shape. */
	spectrumGradientFlow: boolean;
	spectrumGradientFlowSpeed: number;
	spectrumGradientFlowAudio: boolean;
	spectrumGradientFlowDirection: SpectrumGradientFlowDirection;
	/** Bright accents at local peaks (capped count, not a particle system). */
	spectrumPeakSparks: boolean;
	spectrumPeakSparksAmount: number;
	spectrumPeakSparksSize: number;
	spectrumPeakSparksThreshold: number;
	/**
	 * One or two previous wave traces with decaying opacity. Bounded memory —
	 * distinct from Frame Memory / Ghost Frames.
	 */
	spectrumEchoTrace: boolean;
	spectrumEchoTraceCount: 1 | 2;
	spectrumEchoTraceOpacity: number;
	spectrumEchoTraceOffset: number;
	spectrumEchoTraceDecay: number;
	spectrumBandMode: SpectrumBandMode;
	spectrumAudioSmoothing: number;
	spectrumShape: SpectrumShape;
	spectrumWaveFillOpacity: number;
	spectrumRotationSpeed: number;
	spectrumMirror: boolean;
	spectrumPeakHold: boolean;
	spectrumPeakDecay: number;
	spectrumPositionX: number;
	spectrumPositionY: number;
	spectrumFamily: SpectrumFamily;
	/** Master switch for the Frame Memory effect (afterglow / motion trails /
	 *  ghost frames / history depth). When off the runtime skips the underlay
	 *  and the editor hides its controls. */
	spectrumFrameMemoryEnabled: boolean;
	spectrumAfterglow: number;
	spectrumMotionTrails: number;
	spectrumGhostFrames: number;
	spectrumFrameHistoryDepth: number;
	spectrumGainExpressiveness: number;
	/**
	 * Per-spectrum envelope shaping (mirrors logo/BG envelope params). These
	 * parameters drive `runtime.energyEnvelope.tick()` in CircularSpectrum.
	 * Defaults preserve the previously hardcoded values.
	 */
	spectrumEnvelopeAttack: number;
	spectrumEnvelopeRelease: number;
	spectrumEnvelopeReactivitySpeed: number;
	spectrumEnvelopePeakWindow: number;
	spectrumEnvelopePeakFloor: number;
	spectrumEnvelopePunch: number;
	spectrumPeakRibbonsEnabled: boolean;
	spectrumPeakRibbons: number;
	spectrumBassShockwaveEnabled: boolean;
	spectrumBassShockwave: number;
	spectrumShockwaveBandMode: SpectrumBandMode;
	spectrumShockwaveBandThresholds: SpectrumShockwaveBandThresholds;
	spectrumShockwaveThickness: number;
	spectrumShockwaveOpacity: number;
	spectrumShockwaveBlur: number;
	spectrumShockwaveColorMode: SpectrumShockwaveColorMode;
	spectrumEnergyBloomEnabled: boolean;
	spectrumEnergyBloom: number;
	spectrumPeakRibbonAngle: number;
	spectrumFigureRotationSpeed: number;
	spectrumOscilloscopeLineWidth: number;
	spectrumTunnelRingCount: number;
	spectrumTunnelDepthFalloff: number;
	spectrumTunnelRingSpacing: number;
	spectrumTunnelWallOpacity: number;
	spectrumTunnelPulseStrength: number;
	spectrumTunnelAlternateRotation: boolean;
	spectrumLiquidLayer1Opacity: number;
	spectrumLiquidLayer2Opacity: number;
	spectrumLiquidLayer3Opacity: number;
	spectrumLiquidLayer1Amp: number;
	spectrumLiquidLayer2Amp: number;
	spectrumLiquidLayer3Amp: number;
	spectrumLiquidLayer1Fill: number;
	spectrumLiquidLayer2Fill: number;
	spectrumLiquidLayer3Fill: number;
	spectrumLiquidLayer1Speed: number;
	spectrumLiquidLayer2Speed: number;
	spectrumLiquidLayer3Speed: number;
	spectrumLiquidLayer1RotationSpeed: number;
	spectrumLiquidLayer2RotationSpeed: number;
	spectrumLiquidLayer3RotationSpeed: number;
	spectrumLiquidLayer1Shape: SpectrumRadialShape;
	spectrumLiquidLayer2Shape: SpectrumRadialShape;
	spectrumLiquidLayer3Shape: SpectrumRadialShape;
	spectrumLiquidLayer1RigidShape: boolean;
	spectrumLiquidLayer2RigidShape: boolean;
	spectrumLiquidLayer3RigidShape: boolean;
	/** Retro pixelate applied to this liquid layer alone (see spectrumPixelate for all layers). */
	spectrumLiquidLayer1Pixelate: boolean;
	spectrumLiquidLayer2Pixelate: boolean;
	spectrumLiquidLayer3Pixelate: boolean;
	spectrumSpiralTurns: number;
	spectrumSpiralOuterRadius: number;
	spectrumSpiralTightness: number;
	spectrumSpiralShape: SpectrumRadialShape;
	spectrumSpiralLogarithmic: boolean;
	spectrumSpiralGradientStroke: boolean;
	spectrumSpiralArms: number;
	spectrumSpiralAudioTurns: number;
	spectrumSpiralDotShape: SpectrumSpiralDotShape;
	spectrumSpiralStrokeWidth: number;
	spectrumOscilloscopeScrollSpeed: number;
	spectrumOscilloscopeReactiveWidth: boolean;
	spectrumOscilloscopePhosphor: boolean;
	spectrumOscilloscopePhosphorDecay: number;
	spectrumOscilloscopeGrid: boolean;
	spectrumOscilloscopeGridDivisions: number;
	spectrumDriveMode: SpectrumDriveMode;
	spectrumManualSections: number;
	spectrumManualAddWeight: number;
	spectrumManualAttack: number;
	spectrumManualRelease: number;
	spectrumManualBindings: string[];
	showSpectrumManualHud: boolean;
	spectrumProfileSlots: ProfileSlot<SpectrumProfileSettings>[];
	/** Spectrum 2's independent profile list. Separate array from
	 *  `spectrumProfileSlots` so each spectrum keeps its own named slots without
	 *  interfering with the other. The editor reads/writes only the instance
	 *  portion of these slots. */
	spectrumSecondProfileSlots: ProfileSlot<SpectrumProfileSettings>[];

	// Logo
	logoEnabled: boolean;
	logoUrl: string | null;
	/** Variant used by the built-in Vibrix mark. Custom uploads are untouched. */
	logoVariantMode: LogoVariantMode;
	logoBaseSize: number;
	logoPositionX: number;
	logoPositionY: number;
	logoCircularCrop: boolean;
	logoCropRadius: number;
	logoBandMode: LogoBandMode;
	logoAudioSmoothing: number;
	logoAudioSensitivity: number;
	logoReactiveScaleIntensity: number;
	logoReactivitySpeed: number;
	logoAttack: number;
	logoRelease: number;
	logoMinScale: number;
	logoMaxScale: number;
	logoPunch: number;
	logoPeakWindow: number;
	logoPeakFloor: number;
	logoGlowEnabled: boolean;
	logoGlowColor: string;
	logoGlowColorSource: ColorSourceMode;
	logoGlowBlur: number;
	logoGlowReach: number;
	logoGlowAudioAmount: number;
	logoShadowEnabled: boolean;
	logoShadowColor: string;
	logoShadowColorSource: ColorSourceMode;
	logoShadowBlur: number;
	logoBackdropEnabled: boolean;
	logoBackdropColor: string;
	logoBackdropColorSource: ColorSourceMode;
	logoBackdropOpacity: number;
	logoBackdropPadding: number;
	logoRotationSpeed: number;
	logoProfileSlots: ProfileSlot<LogoProfileSettings>[];

	// Particles
	particlesEnabled: boolean;
	particleLayerMode: ParticleLayerMode;
	particleShape: ParticleShape;
	particleColor1: string;
	particleColor2: string;
	particleColorSource: ColorSourceMode;
	particleColorMode: ParticleColorMode;
	particleSizeMin: number;
	particleSizeMax: number;
	particleOpacity: number;
	particleGlow: boolean;
	particleGlowStrength: number;
	particleGlowReach: number;
	particleGlowAudioAmount: number;
	particleFilterBrightness: number;
	particleFilterContrast: number;
	particleFilterSaturation: number;
	particleFilterBlur: number;
	particleFilterHueRotate: number;
	particleRotationIntensity: number;
	particleRotationDirection: ParticleRotationDirection;
	particleFadeInOut: boolean;
	particleAudioReactive: boolean;
	particleAudioChannel: AudioReactiveChannel;
	particleAudioSmoothing: number;
	particleAudioSizeBoost: number;
	particleAudioOpacityBoost: number;
	// Envelope params — same shape as logo/bgZoom/spectrum so partículas tienen
	// física propia (attack/release/peakWindow/peakFloor/punch/responseSpeed).
	particleAudioAttack: number;
	particleAudioRelease: number;
	particleAudioReactivitySpeed: number;
	particleAudioPeakWindow: number;
	particleAudioPeakFloor: number;
	particleAudioPunch: number;
	particleAudioDriftEnabled: boolean;
	particleAudioDriftAngle: number;
	particleAudioDriftAmount: number;
	particleAudioDriftBase: number;
	particleAudioDriftChannel: AudioReactiveChannel;
	particleAudioDriftThreshold: number;
	particleAudioDriftRelease: number;
	particleAudioDriftMode: ParticleAudioDriftMode;
	particleAudioDriftInvertOnLowEnergy: boolean;
	particleDepthFlowEnabled: boolean;
	particleDepthFlowAmount: number;
	particleDepthFlowDirection: ParticleDepthFlowDirection;
	particleDepthFlowChannel: AudioReactiveChannel;
	particleDepthFlowThreshold: number;
	particleDepthFlowSensitivity: number;
	particleDepthFlowAttack: number;
	particleDepthFlowRelease: number;
	particleDepthFlowSpeed: number;
	particleDepthFlowSpread: number;
	particleDepthFlowFocusX: number;
	particleDepthFlowFocusY: number;
	particleDepthFlowMode: ParticleDepthFlowMode;
	particleDepthFlowSpawnOrigin: ParticleDepthFlowSpawnOrigin;
	particleDepthFlowInvertFocusOnLowEnergy: boolean;
	particleDepthFlowInvertFocusAxis: ParticleDepthFlowLowEnergyAxis;
	/** 0..1 — how much Audio Wind drift is allowed while Depth Flow is active. */
	particleDepthFlowWindInfluence: number;
	particleCount: number;
	particleSpeed: number;
	particleLifetime: number;

	noiseIntensity: number;
	rgbShiftAudioReactive: boolean;
	rgbShiftAudioSensitivity: number;
	rgbShiftAudioChannel: AudioReactiveChannel;
	rgbShiftAudioSmoothing: number;
	// Envelope params para que el rgb shift respire en lugar de seguir el
	// canal raw multiplicado por la sensitivity.
	rgbShiftAudioAttack: number;
	rgbShiftAudioRelease: number;
	rgbShiftAudioReactivitySpeed: number;
	rgbShiftAudioPeakWindow: number;
	rgbShiftAudioPeakFloor: number;
	rgbShiftAudioPunch: number;

	// Rain
	rainEnabled: boolean;
	rainIntensity: number;
	rainDropCount: number;
	rainAngle: number;
	rainMeshRotationZ: number;
	rainColor: string;
	rainColorSource: ColorSourceMode;
	rainColorMode: RainColorMode;
	rainParticleType: RainParticleType;
	rainLength: number;
	rainWidth: number;
	rainBlur: number;
	rainSpeed: number;
	rainVariation: number;
	/** User-saveable particles-only slots referenced by Scene slots. */
	particlesProfileSlots: ProfileSlot<
		import('@/store/featureProfiles').ParticlesProfileSettings
	>[];
	/** User-saveable rain-only slots referenced by Scene slots. */
	rainProfileSlots: ProfileSlot<
		import('@/store/featureProfiles').RainProfileSettings
	>[];
	/** User-saveable Looks (filter + post-fx) slots referenced by Scene slots. */
	looksProfileSlots: ProfileSlot<
		import('@/store/featureProfiles').LooksProfileSettings
	>[];
	/** User-saveable Lights (stage lights + flash) slots referenced by Scene slots. */
	lightsProfileSlots: ProfileSlot<
		import('@/store/featureProfiles').LightsProfileSettings
	>[];
	/** User-saveable Camera FX (motion + screen shake) slots referenced by Scene slots. */
	cameraFxProfileSlots: ProfileSlot<
		import('@/store/featureProfiles').CameraFxProfileSettings
	>[];
	/** User-saveable Track Title slots referenced by Scene slots. */
	trackTitleProfileSlots: ProfileSlot<
		import('@/store/featureProfiles').TrackTitleProfileSettings
	>[];
	/** Composition-only scene slots (references to feature slots). */
	sceneSlots: SceneSlot[];
	/** Last applied scene slot id (manual apply or slide binding). */
	activeSceneSlotId: string | null;
	/**
	 * Scene-first model: the scene applied to any image that has no explicit
	 * `sceneSlotId`. Resolved at runtime via
	 * `resolveEffectiveSceneSlotId(image, state)` — images do NOT copy this id.
	 * `null` = no default (images without an explicit scene fall back to the
	 * current/base visual state and their legacy per-image overrides).
	 */
	defaultSceneSlotId: string | null;

	/**
	 * Global composition mode: the state on screen wins and switching image
	 * applies neither the scene nor the per-image overrides nor the slot
	 * bindings — it only changes the picture.
	 *
	 * Nothing saved is erased: turning the mode off brings every image's own
	 * composition straight back. An image can opt out with
	 * `ignoreGlobalOverride`, and "save to all" is the explicit, destructive
	 * way to write the current composition into every image.
	 */
	globalCompositionOverride: boolean;

	/**
	 * Named bookmarks that curate which images and audio tracks are active
	 * for a given mix / video / theme. The global pool stays whole; each
	 * setlist just stores ID references. When `activeSetlistId` is set the
	 * pool, playlist, slideshow cycling, and audio auto-advance all FILTER
	 * to the setlist's members — non-members aren't shown at all.
	 * `activeSetlistId = null` means "show the whole pool" (default).
	 */
	setlists: Setlist[];
	/** Currently active setlist id, or null for "no filter". */
	activeSetlistId: string | null;
	/** Whether the on-screen Setlist HUD chip is visible when a setlist
	 *  is active. The HUD is the always-on indicator + quick deactivate.
	 *  When false the user relies on the in-panel switcher only. Default
	 *  true so newly-activated setlists give visible feedback. */
	showSetlistHud: boolean;

	/**
	 * Per-parameter slider range overrides used by the Calibration tab.
	 * Keys match field names on WallpaperState; missing keys fall back to
	 * the defaults declared in `src/features/calibration/calibrationConfig.ts`.
	 */
	calibrationRangeOverrides: import('@/features/calibration').CalibrationRangeOverrides;
	/** User-saveable slots that snapshot the reactivity calibration values. */
	calibrationProfileSlots: import('@/features/calibration').CalibrationProfileSlot[];
	/**
	 * Per-group "Sintético" toggle for the Calibration tab. When a group is
	 * `true`, the element it calibrates (e.g. logo, BG zoom) is driven by a
	 * synthetic 120 BPM test pulse instead of the live audio channel, so it
	 * can be calibrated in silence. Ephemeral — excluded from persistence.
	 */
	calibrationSyntheticGroups: import('@/features/calibration').CalibrationSyntheticGroups;

	// ── Radial spectrum rotation drive (Task 1) ──────────────────────────────
	/** off=no rotation, fixed=base speed, audio=energy-driven, fixed-audio=both. */
	spectrumRotationDrive: import('@/features/stageFx/stageFxConfig').SpectrumRotationDrive;
	/** Extra rotation speed (rad/s at full energy) added by audio. */
	spectrumRotationAudioAmount: number;
	spectrumRotationChannel: import('@/features/stageFx/stageFxConfig').SpectrumRotationChannel;
	spectrumRotationDirection: import('@/features/stageFx/stageFxConfig').RotationDirection;
	/** 0..1 EMA smoothing for the audio-driven rotation speed. */
	spectrumRotationSmoothing: number;
	/** When enabled, low selected/rotation-band energy flips radial rotation direction. */
	spectrumRotationInvertOnLowEnergy: boolean;
	/** 0..1 minimum band peak that triggers the low-energy direction flip. */
	spectrumRotationInvertThreshold: number;
	/** Debounce/hold time before low-energy radial rotation changes direction. */
	spectrumRotationInvertHoldMs: number;

	// ── Stage Lights FX (Task 2) ─────────────────────────────────────────────
	stageLightsEnabled: boolean;
	stageLightsIntensity: number;
	/** @deprecated Compatibility source for pre-split Stage Lights settings. */
	stageLightsBeamCount: number;
	stageLightsMinBeamCount: number;
	stageLightsMaxBeamCount: number;
	stageLightsBeamWidth: number;
	stageLightsBeamLength: number;
	stageLightsSoftness: number;
	stageLightsSpeed: number;
	stageLightsFixedMotion: boolean;
	stageLightsColorSource: import('@/features/stageFx/stageFxConfig').StageLightsColorSource;
	stageLightsColor: string;
	stageLightsAudioReactive: boolean;
	stageLightsAudioChannel: import('@/features/stageFx/stageFxConfig').FxAudioChannel;
	stageLightsAudioAmount: number;
	stageLightsAudioOscillationAmount: number;
	stageLightsAudioHoldMs: number;
	stageLightsAudioDecay: number;
	stageLightsAudioGateEnabled: boolean;
	/** @deprecated Migrated into the independent Flash Light layer. */
	stageLightsPeakFlash: boolean;
	stageLightsPeakThreshold: number;
	stageLightsBandThresholds: import('@/features/stageFx/stageFxConfig').FxBandThresholds;
	stageLightsOpacity: number;
	stageLightsBlendMode: import('@/features/stageFx/stageFxConfig').StageLightsBlendMode;
	stageLightsOrigin: import('@/features/stageFx/stageFxConfig').StageLightsOrigin;
	stageLightsMovementMode: import('@/features/stageFx/stageFxConfig').StageLightsMovementMode;
	stageLightsInvertDirection: boolean;
	stageLightsMirrorDirections: boolean;

	// ── Flash Light FX ──────────────────────────────────────────────────────
	flashLightEnabled: boolean;
	flashLightIntensity: number;
	flashLightColorSource: import('@/features/stageFx/stageFxConfig').StageLightsColorSource;
	flashLightColor: string;
	flashLightSoftness: number;
	flashLightBrightness: number;
	flashLightDecay: number;
	flashLightAudioChannel: import('@/features/stageFx/stageFxConfig').FxAudioChannel;
	flashLightThreshold: number;
	flashLightBandThresholds: import('@/features/stageFx/stageFxConfig').FxBandThresholds;
	flashLightSensitivity: number;
	flashLightRetriggerMs: number;
	flashLightShape: import('@/features/stageFx/stageFxConfig').FlashLightShape;
	flashLightBlendMode: import('@/features/stageFx/stageFxConfig').StageLightsBlendMode;

	// ── Logo Flash Edge (Reactive Neon Edge — usa driver de Flash Light) ─────
	logoFlashEdgeEnabled: boolean;
	/** 0.1–3: multiplicador sobre el drive del Flash Light. */
	logoFlashEdgeIntensityMult: number;
	/** 1–16 px: grosor del trazo neon interior. */
	logoFlashEdgeThickness: number;
	/** 0–40 px: radio del bloom exterior. */
	logoFlashEdgeRadius: number;
	/** 'flash' = heredar color del Flash Light, 'manual' = override. */
	logoFlashEdgeColorMode: 'flash' | 'manual';
	logoFlashEdgeColor: string;

	// ── Background Flash Edge ────────────────────────────────────────────────
	bgFlashEdgeEnabled: boolean;
	bgFlashEdgeIntensityMult: number;
	bgFlashEdgeThickness: number;
	bgFlashEdgeRadius: number;
	bgFlashEdgeColorMode: 'flash' | 'manual';
	bgFlashEdgeColor: string;

	// ── Camera FX (Task 3) ───────────────────────────────────────────────────
	/** @deprecated Compatibility source for pre-split Camera FX settings. */
	cameraFxEnabled: boolean;
	cameraMotionEnabled: boolean;
	/**
	 * Every motion layer, top-down. The ACTIVE layer's live values are the
	 * flat `cameraMotion*` keys below — its entry here is a snapshot that goes
	 * stale while it is selected, which is why readers go through
	 * `features/stageFx/motionLayers` instead of indexing this array.
	 */
	motionLayers: MotionLayer[];
	/** Which motion layer the Motion tab is editing. */
	activeMotionLayerId: string;
	cameraMotionMode: import('@/features/stageFx/stageFxConfig').CameraMotionMode;
	cameraMotionAmount: number;
	cameraMotionSpeed: number;
	cameraMotionDrive: import('@/features/stageFx/stageFxConfig').CameraMotionDrive;
	cameraMotionAudioInfluence: number;
	/** Audio → amplitude (the flat live value of the active motion layer). */
	cameraMotionAmplitudeAudio: number;
	cameraMotionAudioChannel: import('@/features/stageFx/stageFxConfig').FxAudioChannel;
	cameraMotionDirection: import('@/features/stageFx/stageFxConfig').CameraMotionDirection;
	/** @deprecated Use `cameraMotionTargets` for multi-layer targeting. */
	cameraMotionTarget: import('@/features/stageFx/stageFxConfig').CameraMotionTarget;
	cameraMotionTargets: import('@/features/stageFx/stageFxConfig').CameraMotionTarget[];
	cameraShakeEnabled: boolean;
	cameraShakeAmount: number;
	cameraShakeDecay: number;
	cameraShakeThreshold: number;
	cameraShakeBandThresholds: import('@/features/stageFx/stageFxConfig').FxBandThresholds;
	cameraShakeTargets: import('@/features/stageFx/stageFxConfig').CameraMotionTarget[];
	cameraShakeSensitivity: number;
	cameraShakeRetriggerMs: number;
	cameraShakeChannel: import('@/features/stageFx/stageFxConfig').FxAudioChannel;
	cameraShakeMode: import('@/features/stageFx/stageFxConfig').ScreenShakeMode;
	cameraShakeFrequency: number;
	cameraShakeRoughness: number;

	// Slideshow
	slideshowEnabled: boolean;
	slideshowInterval: number;
	slideshowTransitionDuration: number;
	slideshowTransitionType: SlideshowTransitionType;
	slideshowTransitionIntensity: number;
	slideshowTransitionAudioDrive: number;
	slideshowTransitionAudioChannel: AudioReactiveChannel;
	slideshowTransitionAudioSmoothing: number;
	/** Where a manual timestamp sits inside its transition (manual mode only). */
	slideshowTransitionAnchor: SlideshowTransitionAnchor;
	slideshowResetPosition: boolean;
	slideshowAudioCheckpointsEnabled: boolean;
	slideshowTrackChangeSyncEnabled: boolean;
	slideshowManualTimestampsEnabled: boolean;
	activeImageId: string | null;
	visualTransition: VisualTransitionSnapshot | null;
	backgroundImages: BackgroundImageItem[];
	imageUrls: string[];

	// Persistence (IndexedDB refs — blob URLs are reconstructed on load)
	imageIds: string[];
	logoId: string | null;
	overlays: OverlayImageItem[];
	selectedOverlayId: string | null;

	// Responsive Layout
	layoutResponsiveEnabled: boolean;
	layoutBackgroundReframeEnabled: boolean;
	layoutReferenceWidth: number;
	layoutReferenceHeight: number;
	/** Persisted collapsed state for the editor shell sidebar. */
	editorSidebarCollapsed: boolean;

	// Offline video export — standing output preferences. The run itself is not
	// store state (see features/export/video/offlineVideoExportRuntime).
	offlineExportResolutionId: OfflineExportResolutionPresetId;
	offlineExportFps: OfflineExportFps;

	// System
	performanceMode: PerformanceMode;
	customPresets: CustomPresetsMap;
	activePreset: string;
	language: Language;
	isPresetDirty: boolean;
	showFps: boolean;
	/** Scene-service (backend) base URL for AI features. '' means same-origin
	 *  (dev proxy / deployed server). Set it to point the app at a backend on
	 *  your own machine or LAN, e.g. http://localhost:8787. */
	sceneServiceBaseUrl: string;
	/** Which model the scene service should use. '' lets the server decide —
	 *  the only sensible default, since the app cannot know what it serves. */
	sceneServiceModel: string;
	controlPanelAnchor: ControlPanelAnchor;
	/** Pixel offset applied on top of the anchor — set by dragging the panel
	 *  header. Reset to 0 via the anchor selector or a context menu. */
	controlPanelOffsetX: number;
	controlPanelOffsetY: number;
	/** macOS-style liquid-glass surface (frosted, translucent) for the floating
	 *  media HUD instead of the default solid panel. */
	hudLiquidGlassEnabled: boolean;
	/**
	 * Quick Edit capture flow:
	 *  - 'selection': per-row Capture/Clear (default, fine-grained).
	 *  - 'total':     one button captures all 5 subsystems at once.
	 */
	quickEditCaptureMode: 'total' | 'selection';
	/**
	 * Global color palette shared across every subsystem that exposes a
	 * color picker (spectrum, logo, BG, particles, etc.). Hex strings only;
	 * order is the visual order in the picker's favourites strip. Capped at
	 * ~32 entries to keep the strip readable — older entries roll off the
	 * end when the user pins a new one.
	 */
	colorFavorites: string[];
	controlPanelActiveTab: string | null;
	/** Shared active Spectrum target for editor + HUD. UI selection only. */
	activeSpectrumTarget: 'main' | 'instance';
	fpsOverlayAnchor: ControlPanelAnchor;
	editorTheme: EditorTheme;
	editorThemeColorSource: ThemeColorSource;
	editorCornerRadius: number;
	editorControlCornerRadius: number;
	/**
	 * Multiplier applied to the entire ControlPanel via CSS transform. Default
	 * `1`. Useful on very large displays where the editor would otherwise feel
	 * tiny in fullscreen. Range chosen for usefulness, not for symmetry: 0.7
	 * still fits in narrow tablets, 1.8 covers a 4K 34" without dwarfing the
	 * canvas.
	 */
	editorUiScale: number;
	editorShowPreciseNumericControls: boolean;
	/** Compact "icon mode" for preset/save slots: numbered pills instead of
	 *  named pills. Global editor UI preference. */
	editorCompactSlotIcons: boolean;
	editorManualAccentColor: string;
	editorManualSecondaryColor: string;
	editorManualBackdropColor: string;
	editorManualTextPrimaryColor: string;
	editorManualTextSecondaryColor: string;
	editorManualBackdropOpacity: number;
	editorManualBlurPx: number;
	editorManualSurfaceOpacity: number;
	editorManualItemOpacity: number;
	editorImagePreviewQuality: EditorImagePreviewQuality;
	quickActionsEnabled: boolean;
	quickActionsPositionX: number;
	quickActionsPositionY: number;
	quickActionsLauncherPositionX: number;
	quickActionsLauncherPositionY: number;
	quickActionsBackdropOpacity: number;
	quickActionsBlurPx: number;
	quickActionsScale: number;
	quickActionsLauncherSize: number;
	quickActionsColorSource: ThemeColorSource;
	quickActionsManualAccentColor: string;
	quickActionsManualSecondaryColor: string;
	quickActionsManualBackdropColor: string;
	quickActionsManualTextPrimaryColor: string;
	quickActionsManualTextSecondaryColor: string;
	quickActionsManualSurfaceOpacity: number;
	quickActionsManualItemOpacity: number;
	layerZIndices: Partial<Record<BuiltInLayerId, number>>;
	sleepModeEnabled: boolean;
	sleepModeDelaySeconds: number;
	sleepModeActive: boolean;
	/** Whether to scan and show local "Virtual Folders" in BG/Audio tabs. */
	virtualFoldersEnabled: boolean;

	// Discovery UX (Phase 8)
	/** When true, the compact onboarding card in Scene is hidden. */
	discoveryOnboardingDismissed: boolean;
	/**
	 * Locks rendering to low cost: saves the previous `performanceMode` in
	 * `performanceModeBeforeSafe` so it can be restored when disabled.
	 */
	performanceSafeEnabled: boolean;
	performanceModeBeforeSafe: PerformanceMode | null;

	// Design mode
	uiMode: UIMode;
	enableDragMode: boolean;
	activeTool: ActiveTool;
};

export type EditorImagePreviewQuality = 'optimized' | 'original';
