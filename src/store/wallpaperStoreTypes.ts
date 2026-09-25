import type { ImageBassZoomPresetId } from '@/features/presets/imageBassZoomProfiles';
import type {
	AudioLyricsTrackEntry,
	LyricsLayerColorMode
} from '@/features/lyrics';
import type {
	AudioCaptureState,
	AudioMixMode,
	AudioPlaylistTrack,
	AudioTransitionStyle,
	AudioReactiveChannel,
	BuiltInLayerId,
	ColorSourceMode,
	ControlPanelAnchor,
	EditorTheme,
	FilterTarget,
	ImageFitMode,
	Language,
	LyricsActiveAnimation,
	LyricsLayoutMode,
	LyricsTextTransition,
	LogoBandMode,
	NowPlayingTextTreatment,
	OfflineExportFps,
	OfflineExportResolutionPresetId,
	LogoProfileSettings,
	ParticleColorMode,
	ParticleAudioDriftMode,
	ParticleDepthFlowLowEnergyAxis,
	ParticleDepthFlowDirection,
	ParticleDepthFlowMode,
	ParticleLayerMode,
	ParticleRotationDirection,
	ParticleShape,
	PerformanceMode,
	RainColorMode,
	RainParticleType,
	ResolvedAudioReactiveChannel,
	ScanlineMode,
	SlideshowTransitionAnchor,
	SlideshowTransitionType,
	SpectrumBandMode,
	SpectrumColorMode,
	SpectrumLinearDirection,
	SpectrumLinearOrientation,
	SpectrumMode,
	SpectrumProfileSettings,
	SpectrumRadialShape,
	SpectrumShape,
	ThemeColorSource,
	TrackTitleFontStyle,
	TrackTitleLayoutMode,
	EditorImagePreviewQuality,
	WallpaperState
} from '@/types/wallpaper';

/** Outcome of the "mark here" gesture — see `markNextImageSwitchAt`. */
export type MarkNextSwitchResult = {
	/** False when there is no image after the active one to mark. */
	marked: boolean;
	/** The image whose start was moved, if any. */
	imageId: string | null;
	markedAt: number;
	/** 1-based position of that image in the pool, for the UI message. */
	poolPosition: number;
	/** The stored timestamps no longer ascend with the pool order. */
	reordered: boolean;
	/** The gesture had to turn manual timestamps on first. */
	enabledManualMode: boolean;
};

export type WallpaperStore = WallpaperState & {
	// FX
	setNoiseIntensity: (v: number) => void;
	setRgbShift: (v: number) => void;
	setRgbShiftAudioReactive: (v: boolean) => void;
	setRgbShiftAudioSensitivity: (v: number) => void;
	setRgbShiftAudioChannel: (v: AudioReactiveChannel) => void;
	setRgbShiftAudioSmoothing: (v: number) => void;
	setRgbShiftAudioAttack: (v: number) => void;
	setRgbShiftAudioRelease: (v: number) => void;
	setRgbShiftAudioReactivitySpeed: (v: number) => void;
	setRgbShiftAudioPeakWindow: (v: number) => void;
	setRgbShiftAudioPeakFloor: (v: number) => void;
	setRgbShiftAudioPunch: (v: number) => void;
	setScanlinesEnabled: (v: boolean) => void;
	setScanlineIntensity: (v: number) => void;
	setScanlineMode: (v: ScanlineMode) => void;
	setScanlineSpacing: (v: number) => void;
	setScanlineThickness: (v: number) => void;
	setParallaxStrength: (v: number) => void;
	setImageUrl: (v: string | null) => void;
	setImageScale: (v: number) => void;
	setImagePositionX: (v: number) => void;
	setImagePositionY: (v: number) => void;
	setImageFocusPoint: (x: number | null, y: number | null) => void;
	setImageOpacity: (v: number) => void;
	setImageBassReactive: (v: boolean) => void;
	setImageBassScaleIntensity: (v: number) => void;
	setImageAudioReactiveDecay: (v: number) => void;
	setImageAudioSmoothing: (v: number) => void;
	setImageOpacityReactive: (v: boolean) => void;
	setImageOpacityReactiveAmount: (v: number) => void;
	setImageOpacityReactiveInvert: (v: boolean) => void;
	setImageOpacityReactiveThreshold: (v: number) => void;
	setImageOpacityReactiveSoftness: (v: number) => void;
	setImageBlurReactive: (v: boolean) => void;
	setImageBlurReactiveAmount: (v: number) => void;
	setImageBlurReactiveInvert: (v: boolean) => void;
	setImageBlurReactiveThreshold: (v: number) => void;
	setImageBlurReactiveSoftness: (v: number) => void;
	applyImageBassZoomPreset: (id: ImageBassZoomPresetId) => void;
	setImageBassAttack: (v: number) => void;
	setImageBassRelease: (v: number) => void;
	setImageBassReactivitySpeed: (v: number) => void;
	setImageBassPeakWindow: (v: number) => void;
	setImageBassPeakFloor: (v: number) => void;
	setImageBassPunch: (v: number) => void;
	setImageBassReactiveScaleIntensity: (v: number) => void;
	setImageAudioChannel: (v: AudioReactiveChannel) => void;
	addBackgroundProfileSlot: () => void;
	removeBackgroundProfileSlot: (index: number) => void;
	saveBackgroundProfileSlot: (index: number) => void;
	loadBackgroundProfileSlot: (index: number) => void;
	setImageLogoProfileSlotIndex: (v: number | null) => void;
	setImageSpectrumProfileSlotIndex: (v: number | null) => void;
	setImageParticlesProfileSlotIndex: (v: number | null) => void;
	setImageRainProfileSlotIndex: (v: number | null) => void;
	setImageLooksProfileSlotIndex: (v: number | null) => void;
	setImageLogoOverride: (v: LogoProfileSettings | null) => void;
	setImageSpectrumOverride: (v: SpectrumProfileSettings | null) => void;
	setImageParticlesOverride: (
		v: import('@/store/featureProfiles').ParticlesProfileSettings | null
	) => void;
	setImageRainOverride: (
		v: import('@/store/featureProfiles').RainProfileSettings | null
	) => void;
	setImageLooksOverride: (
		v: import('@/store/featureProfiles').LooksProfileSettings | null
	) => void;
	/** Global composition mode: the live state wins over every per-image config. */
	setGlobalCompositionOverride: (v: boolean) => void;
	/** The active image keeps its own composition even in global mode. */
	setImageIgnoreGlobalOverride: (v: boolean) => void;
	/** Destructive: writes the current composition into EVERY image. Confirm first. */
	captureCompositionToAllImages: () => void;
	captureImageLogoOverride: () => void;
	captureImageSpectrumOverride: () => void;
	captureImageParticlesOverride: () => void;
	captureImageRainOverride: () => void;
	captureImageLooksOverride: () => void;
	setImageFitMode: (v: ImageFitMode) => void;
	setImageFramingManualEnabled: (v: boolean) => void;
	setImageMirror: (v: boolean) => void;
	setImageMirrorFill: (v: boolean) => void;
	setImageMirrorFillInvert: (v: boolean) => void;
	setImageMirrorFillCount: (v: number) => void;
	setImageRotation: (v: number) => void;
	setBackgroundImageEnabled: (v: boolean) => void;
	setShowBackgroundScaleMeter: (v: boolean) => void;
	setShowAutoZoomDebug: (v: boolean) => void;
	setShowSpectrumDiagnosticsHud: (v: boolean) => void;
	setShowLogoDiagnosticsHud: (v: boolean) => void;
	setDiagnosticsHudPositionX: (v: number) => void;
	setDiagnosticsHudPositionY: (v: number) => void;
	setGlobalBackgroundEnabled: (v: boolean) => void;
	setGlobalBackgroundId: (v: string | null) => void;
	setGlobalBackgroundUrl: (v: string | null) => void;
	setGlobalBackgroundScale: (v: number) => void;
	setGlobalBackgroundPositionX: (v: number) => void;
	setGlobalBackgroundPositionY: (v: number) => void;
	setGlobalBackgroundFitMode: (v: ImageFitMode) => void;
	setGlobalBackgroundOpacity: (v: number) => void;
	setGlobalBackgroundBrightness: (v: number) => void;
	setGlobalBackgroundContrast: (v: number) => void;
	setGlobalBackgroundSaturation: (v: number) => void;
	setGlobalBackgroundBlur: (v: number) => void;
	setGlobalBackgroundHueRotate: (v: number) => void;
	addEffectLayer: () => void;
	duplicateEffectLayer: (id: string) => void;
	removeEffectLayer: (id: string) => void;
	selectEffectLayer: (id: string) => void;
	setEffectLayerEnabled: (id: string, enabled: boolean) => void;
	renameEffectLayer: (id: string, name: string) => void;
	moveEffectLayer: (id: string, direction: 'up' | 'down') => void;
	/** Takes `v` away from whichever layer owns it and gives it to the active one. */
	claimFilterTarget: (v: FilterTarget) => void;
	setFilterTargets: (v: FilterTarget[]) => void;
	toggleFilterTarget: (v: FilterTarget) => void;
	setFilterOpacity: (v: number) => void;
	setFilterBrightness: (v: number) => void;
	setFilterContrast: (v: number) => void;
	setFilterSaturation: (v: number) => void;
	setFilterBlur: (v: number) => void;
	setFilterHueRotate: (v: number) => void;
	setFilterVignette: (v: number) => void;
	setFilterBloom: (v: number) => void;
	setFilterLumaThreshold: (v: number) => void;
	setFilterLensWarp: (v: number) => void;
	setFilterHeatDistortion: (v: number) => void;
	setActiveFilterLookId: (id: string | null) => void;
	applyFilterLook: (
		look: import('@/features/filterLooks/filterLooks').FilterLookPreset
	) => void;
	saveCustomFilterLookFromCurrent: () => void;
	/**
	 * Unified save path — captures the current looks state into a new entry
	 * in `looksProfileSlots`. Returns the index of the new slot or null when
	 * the slot cap is reached. Replaces the dual `customFilterLookSettings`
	 * code path for new saves.
	 */
	saveCurrentLooksAsNewSlot: () => number | null;

	// Audio
	setAudioReactive: (v: boolean) => void;
	setAudioSensitivity: (v: number) => void;
	setAudioCaptureState: (v: AudioCaptureState) => void;
	setAudioSourceMode: (v: WallpaperStore['audioSourceMode']) => void;
	setAudioFileAssetId: (v: string | null) => void;
	setAudioFileName: (v: string) => void;
	setAudioFileVolume: (v: number) => void;
	setAudioFileLoop: (v: boolean) => void;
	setAudioPaused: (v: boolean) => void;
	setMotionPaused: (v: boolean) => void;
	setFftSize: (v: number) => void;
	setAudioSmoothing: (v: number) => void;
	setAudioChannelSmoothing: (v: number) => void;
	setAudioAutoKickThreshold: (v: number) => void;
	setAudioAutoSwitchHoldMs: (v: number) => void;
	// Playlist
	setAudioTracks: (tracks: AudioPlaylistTrack[]) => void;
	addAudioTrack: (track: AudioPlaylistTrack) => void;
	removeAudioTrack: (id: string) => void;
	updateAudioTrack: (id: string, patch: Partial<AudioPlaylistTrack>) => void;
	moveAudioTrack: (fromIndex: number, toIndex: number) => void;
	setActiveAudioTrackId: (id: string | null) => void;
	setQueuedAudioTrackId: (id: string | null) => void;
	setAudioCrossfadeEnabled: (v: boolean) => void;
	setAudioCrossfadeSeconds: (v: number) => void;
	setAudioAutoAdvance: (v: boolean) => void;
	setAudioMixMode: (v: AudioMixMode) => void;
	setAudioTransitionStyle: (v: AudioTransitionStyle) => void;
	setMediaSessionEnabled: (v: boolean) => void;
	setTrackMetadataMode: (
		v: import('@/types/wallpaper').TrackMetadataMode
	) => void;
	setTrackMetadataAutoSource: (
		v: import('@/types/wallpaper').TrackMetadataAutoSource
	) => void;
	setNowPlayingMode: (v: import('@/types/wallpaper').NowPlayingMode) => void;
	setNowPlayingCoverEnabled: (v: boolean) => void;
	setNowPlayingArtistEnabled: (v: boolean) => void;
	setNowPlayingProgressEnabled: (v: boolean) => void;
	setNowPlayingScale: (v: number) => void;
	setNowPlayingAccentColor: (v: string) => void;
	setNowPlayingAccentColorSource: (v: ColorSourceMode) => void;
	setNowPlayingTextTreatment: (
		v: import('@/types/wallpaper').NowPlayingTextTreatment
	) => void;
	setTrackManualArtist: (v: string) => void;
	setTrackManualTitle: (v: string) => void;
	setAudioTrackTitleEnabled: (v: boolean) => void;
	setAudioTrackTitleLayoutMode: (v: TrackTitleLayoutMode) => void;
	setAudioTrackTitleFontStyle: (v: TrackTitleFontStyle) => void;
	setAudioTrackTitleUppercase: (v: boolean) => void;
	setAudioTrackTitlePositionX: (v: number) => void;
	setAudioTrackTitlePositionY: (v: number) => void;
	setAudioTrackTitleFontSize: (v: number) => void;
	setAudioTrackTitleLetterSpacing: (v: number) => void;
	setAudioTrackTitleWidth: (v: number) => void;
	setAudioTrackTitleOpacity: (v: number) => void;
	setAudioTrackTitleScrollSpeed: (v: number) => void;
	setAudioTrackTitleRgbShift: (v: number) => void;
	setAudioTrackTitleTextColor: (v: string) => void;
	setAudioTrackTitleTextColorSource: (v: ColorSourceMode) => void;
	setAudioTrackTitleStrokeColor: (v: string) => void;
	setAudioTrackTitleStrokeColorSource: (v: ColorSourceMode) => void;
	setAudioTrackTitleStrokeWidth: (v: number) => void;
	setAudioTrackTitleGlowColor: (v: string) => void;
	setAudioTrackTitleGlowColorSource: (v: ColorSourceMode) => void;
	setAudioTrackTitleGlowBlur: (v: number) => void;
	setAudioTrackTitleGlowReach: (v: number) => void;
	setAudioTrackTitleBackdropEnabled: (v: boolean) => void;
	setAudioTrackTitleBackdropColor: (v: string) => void;
	setAudioTrackTitleBackdropColorSource: (v: ColorSourceMode) => void;
	setAudioTrackTitleBackdropOpacity: (v: number) => void;
	setAudioTrackTitleBackdropPadding: (v: number) => void;
	setAudioTrackTitleFilterBrightness: (v: number) => void;
	setAudioTrackTitleFilterContrast: (v: number) => void;
	setAudioTrackTitleFilterSaturation: (v: number) => void;
	setAudioTrackTitleFilterBlur: (v: number) => void;
	setAudioTrackTitleFilterHueRotate: (v: number) => void;
	setAudioTrackTimeEnabled: (v: boolean) => void;
	setAudioTrackTimeFontStyle: (v: TrackTitleFontStyle) => void;
	setAudioTrackTimeFontSize: (v: number) => void;
	setAudioTrackTimeLetterSpacing: (v: number) => void;
	setAudioTrackTimeOpacity: (v: number) => void;
	setAudioTrackTimeRgbShift: (v: number) => void;
	setAudioTrackTimeTextColor: (v: string) => void;
	setAudioTrackTimeTextColorSource: (v: ColorSourceMode) => void;
	setAudioTrackTimeStrokeColor: (v: string) => void;
	setAudioTrackTimeStrokeColorSource: (v: ColorSourceMode) => void;
	setAudioTrackTimeStrokeWidth: (v: number) => void;
	setAudioTrackTimeGlowColor: (v: string) => void;
	setAudioTrackTimeGlowColorSource: (v: ColorSourceMode) => void;
	setAudioTrackTimeGlowBlur: (v: number) => void;
	setAudioTrackTimeGlowReach: (v: number) => void;
	setAudioTrackTimeFilterBrightness: (v: number) => void;
	setAudioTrackTimeFilterContrast: (v: number) => void;
	setAudioTrackTimeFilterSaturation: (v: number) => void;
	setAudioTrackTimeFilterBlur: (v: number) => void;
	setAudioTrackTimeFilterHueRotate: (v: number) => void;
	setAudioTrackTimePositionX: (v: number) => void;
	setAudioTrackTimePositionY: (v: number) => void;
	setAudioTrackTimeWidth: (v: number) => void;
	setAudioLyricsEnabled: (v: boolean) => void;
	setAudioLyricsLayoutMode: (v: LyricsLayoutMode) => void;
	setAudioLyricsUppercase: (v: boolean) => void;
	setAudioLyricsPositionX: (v: number) => void;
	setAudioLyricsPositionY: (v: number) => void;
	setAudioLyricsWidth: (v: number) => void;
	setAudioLyricsFontStyle: (v: TrackTitleFontStyle) => void;
	setAudioLyricsFontSize: (v: number) => void;
	setAudioLyricsLetterSpacing: (v: number) => void;
	setAudioLyricsLineHeight: (v: number) => void;
	setAudioLyricsVisibleLineCount: (v: number) => void;
	setAudioLyricsShowTranslation: (v: boolean) => void;
	setAudioLyricsOpacity: (v: number) => void;
	setAudioLyricsInactiveOpacity: (v: number) => void;
	setAudioLyricsTimeOffsetMs: (v: number) => void;
	setAudioLyricsActiveColor: (v: string) => void;
	setAudioLyricsActiveColorSource: (v: ColorSourceMode) => void;
	setAudioLyricsActiveColorMode: (v: LyricsLayerColorMode) => void;
	setAudioLyricsActiveColorSecondary: (v: string) => void;
	setAudioLyricsInactiveColor: (v: string) => void;
	setAudioLyricsInactiveColorSource: (v: ColorSourceMode) => void;
	setAudioLyricsTextTreatment: (v: NowPlayingTextTreatment) => void;
	setAudioLyricsStrokeColor: (v: string) => void;
	setAudioLyricsStrokeColorSource: (v: ColorSourceMode) => void;
	setAudioLyricsStrokeColorMode: (v: LyricsLayerColorMode) => void;
	setAudioLyricsStrokeColorSecondary: (v: string) => void;
	setAudioLyricsStrokeWidth: (v: number) => void;
	setAudioLyricsGlowColor: (v: string) => void;
	setAudioLyricsGlowColorSource: (v: ColorSourceMode) => void;
	setAudioLyricsGlowColorMode: (v: LyricsLayerColorMode) => void;
	setAudioLyricsGlowColorSecondary: (v: string) => void;
	setAudioLyricsGlowBlur: (v: number) => void;
	setAudioLyricsGlowReach: (v: number) => void;
	setAudioLyricsTransitionIn: (v: LyricsTextTransition) => void;
	setAudioLyricsTransitionOut: (v: LyricsTextTransition) => void;
	setAudioLyricsActiveAnimation: (v: LyricsActiveAnimation) => void;
	setAudioLyricsAnimationDurationMs: (v: number) => void;
	setAudioLyricsBackdropEnabled: (v: boolean) => void;
	setAudioLyricsBackdropColor: (v: string) => void;
	setAudioLyricsBackdropColorSource: (v: ColorSourceMode) => void;
	setAudioLyricsBackdropColorMode: (v: LyricsLayerColorMode) => void;
	setAudioLyricsBackdropColorSecondary: (v: string) => void;
	setAudioLyricsBackdropFollowAnimation: (v: boolean) => void;
	setAudioLyricsBackdropOpacity: (v: number) => void;
	setAudioLyricsBackdropPadding: (v: number) => void;
	setAudioLyricsBackdropRadius: (v: number) => void;
	upsertAudioLyricsTrackEntry: (
		assetId: string,
		entry: AudioLyricsTrackEntry
	) => void;
	updateAudioLyricsTrackEntry: (
		assetId: string,
		patch: Partial<AudioLyricsTrackEntry>
	) => void;
	removeAudioLyricsTrackEntry: (assetId: string) => void;

	// Responsive Layout
	setLayoutResponsiveEnabled: (v: boolean) => void;
	setLayoutBackgroundReframeEnabled: (v: boolean) => void;
	setEditorSidebarCollapsed: (v: boolean) => void;
	setLayoutReferenceResolution: (width: number, height: number) => void;
	captureCurrentViewportAsReference: () => void;

	// Spectrum
	setSpectrumEnabled: (v: boolean) => void;
	setSpectrumMainVisible: (v: boolean) => void;
	/** Patches the MAIN spectrum's flat keys (normalized; invalidates the
	 *  preset morph on family/mode changes). Counterpart of
	 *  updateSpectrumInstance so target-aware UI uses one shape for both. */
	patchSpectrumMain: (
		patch: Partial<import('@/types/wallpaper').SpectrumInstanceSettings>
	) => void;
	/** Patches one extra spectrum instance (id-addressed) and re-normalizes it. */
	updateSpectrumInstance: (
		id: string,
		patch: Partial<import('@/types/wallpaper').SpectrumInstanceSettings>
	) => void;
	setSpectrumInstanceEnabled: (id: string, v: boolean) => void;
	setSpectrumMode: (v: SpectrumMode) => void;
	setSpectrumLinearOrientation: (v: SpectrumLinearOrientation) => void;
	setSpectrumLinearDirection: (v: SpectrumLinearDirection) => void;
	setSpectrumRadialShape: (v: SpectrumRadialShape) => void;
	setSpectrumRadialAngle: (v: number) => void;
	setSpectrumRadialFitLogo: (v: boolean) => void;
	setSpectrumFollowLogo: (v: boolean) => void;
	setSpectrumLogoGap: (v: number) => void;
	setSpectrumSpan: (v: number) => void;
	setSpectrumInnerRadius: (v: number) => void;
	setSpectrumBarCount: (v: number) => void;
	setSpectrumBarWidth: (v: number) => void;
	setSpectrumMinHeight: (v: number) => void;
	setSpectrumMaxHeight: (v: number) => void;
	setSpectrumSmoothing: (v: number) => void;
	setSpectrumOpacity: (v: number) => void;
	setSpectrumGlowIntensity: (v: number) => void;
	setSpectrumGlowReach: (v: number) => void;
	setSpectrumGlowAudioAmount: (v: number) => void;
	setSpectrumShadowBlur: (v: number) => void;
	setSpectrumPrimaryColor: (v: string) => void;
	setSpectrumSecondaryColor: (v: string) => void;
	setSpectrumColorSource: (v: ColorSourceMode) => void;
	setSpectrumColorMode: (v: SpectrumColorMode) => void;
	setSpectrumBandMode: (v: SpectrumBandMode) => void;
	setSpectrumAudioSmoothing: (v: number) => void;
	setSpectrumShape: (v: SpectrumShape) => void;
	setSpectrumWaveFillOpacity: (v: number) => void;
	setSpectrumRotationSpeed: (v: number) => void;
	setSpectrumMirror: (v: boolean) => void;
	setSpectrumPeakHold: (v: boolean) => void;
	setSpectrumPeakDecay: (v: number) => void;
	setSpectrumPositionX: (v: number) => void;
	setSpectrumPositionY: (v: number) => void;
	applySpectrumMacro: (
		macro: 'energy' | 'softness' | 'chaos',
		value: number
	) => void;
	applySpectrumFrameMemoryPreset: (
		preset: import('@/features/spectrum').SpectrumFrameMemoryPresetId,
		target: import('@/features/spectrum').SpectrumFrameMemoryTarget
	) => void;
	randomizeSpectrum: (colorSource: ColorSourceMode) => void;
	randomizeSpectrumTarget: (
		target: import('@/features/spectrum').SpectrumProfileTarget,
		colorSource: ColorSourceMode
	) => void;
	resetSpectrumTarget: (
		target: import('@/features/spectrum').SpectrumProfileTarget
	) => void;
	addSpectrumProfileSlot: (
		target?: import('@/features/spectrum').SpectrumProfileTarget
	) => void;
	removeSpectrumProfileSlot: (
		index: number,
		target?: import('@/features/spectrum').SpectrumProfileTarget
	) => void;
	saveSpectrumProfileSlot: (
		index: number,
		target?: import('@/features/spectrum').SpectrumProfileTarget
	) => void;
	loadSpectrumProfileSlot: (
		index: number,
		target?: import('@/features/spectrum').SpectrumProfileTarget
	) => void;
	resetSpectrumToDefaults: () => void;
	restoreFactorySpectrumDefaults: () => void;
	recoverAudioOverlays: () => void;
	setSpectrumFamily: (v: import('@/types/wallpaper').SpectrumFamily) => void;
	setSpectrumFrameMemoryEnabled: (v: boolean) => void;
	setSpectrumAfterglow: (v: number) => void;
	setSpectrumMotionTrails: (v: number) => void;
	setSpectrumGhostFrames: (v: number) => void;
	setSpectrumFrameHistoryDepth: (v: number) => void;
	setSpectrumGainExpressiveness: (v: number) => void;
	setSpectrumEnvelopeAttack: (v: number) => void;
	setSpectrumEnvelopeRelease: (v: number) => void;
	setSpectrumEnvelopeReactivitySpeed: (v: number) => void;
	setSpectrumEnvelopePeakWindow: (v: number) => void;
	setSpectrumEnvelopePeakFloor: (v: number) => void;
	setSpectrumEnvelopePunch: (v: number) => void;
	setSpectrumPeakRibbonsEnabled: (v: boolean) => void;
	setSpectrumPeakRibbons: (v: number) => void;
	setSpectrumPeakRibbonAngle: (v: number) => void;
	setSpectrumBassShockwaveEnabled: (v: boolean) => void;
	setSpectrumBassShockwave: (v: number) => void;
	setSpectrumShockwaveBandMode: (
		v: import('@/types/wallpaper').SpectrumBandMode
	) => void;
	setSpectrumShockwaveBandThreshold: (
		channel: ResolvedAudioReactiveChannel,
		value: number
	) => void;
	setSpectrumShockwaveThickness: (v: number) => void;
	setSpectrumShockwaveOpacity: (v: number) => void;
	setSpectrumShockwaveBlur: (v: number) => void;
	setSpectrumShockwaveColorMode: (
		v: import('@/types/wallpaper').SpectrumShockwaveColorMode
	) => void;
	setSpectrumEnergyBloomEnabled: (v: boolean) => void;
	setSpectrumEnergyBloom: (v: number) => void;
	setSpectrumFigureRotationSpeed: (v: number) => void;
	setSpectrumOscilloscopeLineWidth: (v: number) => void;
	setSpectrumTunnelRingCount: (v: number) => void;
	setSpectrumTunnelDepthFalloff: (v: number) => void;
	setSpectrumTunnelRingSpacing: (v: number) => void;
	setSpectrumTunnelWallOpacity: (v: number) => void;
	setSpectrumTunnelPulseStrength: (v: number) => void;
	setSpectrumTunnelAlternateRotation: (v: boolean) => void;
	setSpectrumLiquidLayerRigidShape: (layer: 1 | 2 | 3, v: boolean) => void;
	setSpectrumLiquidLayerPixelate: (layer: 1 | 2 | 3, v: boolean) => void;
	applySpectrumTunnelPreset: (
		preset: import('@/features/spectrum').SpectrumFrameMemoryPresetId,
		target: import('@/features/spectrum').SpectrumFrameMemoryTarget
	) => void;
	setSpectrumLiquidLayerParam: (
		layer: 1 | 2 | 3,
		param: import('@/features/spectrum').SpectrumLiquidLayerParamKey,
		value: number
	) => void;
	applySpectrumLiquidPreset: (
		preset: import('@/features/spectrum').SpectrumFrameMemoryPresetId
	) => void;
	setSpectrumLiquidLayerShape: (
		layer: 1 | 2 | 3,
		shape: import('@/types/wallpaper').SpectrumRadialShape
	) => void;
	setSpectrumSpiralTurns: (v: number) => void;
	setSpectrumSpiralOuterRadius: (v: number) => void;
	setSpectrumSpiralTightness: (v: number) => void;
	setSpectrumSpiralShape: (
		v: import('@/types/wallpaper').SpectrumRadialShape
	) => void;
	setSpectrumSpiralLogarithmic: (v: boolean) => void;
	setSpectrumSpiralGradientStroke: (v: boolean) => void;
	setSpectrumSpiralArms: (v: number) => void;
	setSpectrumSpiralAudioTurns: (v: number) => void;
	setSpectrumSpiralDotShape: (
		v: import('@/types/wallpaper').SpectrumSpiralDotShape
	) => void;
	setSpectrumSpiralStrokeWidth: (v: number) => void;
	setSpectrumOscilloscopeScrollSpeed: (v: number) => void;
	setSpectrumOscilloscopeReactiveWidth: (v: boolean) => void;
	setSpectrumOscilloscopePhosphor: (v: boolean) => void;
	setSpectrumOscilloscopePhosphorDecay: (v: number) => void;
	setSpectrumOscilloscopeGrid: (v: boolean) => void;
	setSpectrumOscilloscopeGridDivisions: (v: number) => void;
	setSpectrumDriveMode: (
		v: import('@/types/wallpaper').SpectrumDriveMode
	) => void;
	setSpectrumManualSections: (v: number) => void;
	setSpectrumManualAddWeight: (v: number) => void;
	setSpectrumManualAttack: (v: number) => void;
	setSpectrumManualRelease: (v: number) => void;
	setSpectrumManualBinding: (index: number, key: string) => void;
	setShowSpectrumManualHud: (v: boolean) => void;

	// Logo
	setLogoEnabled: (v: boolean) => void;
	setLogoUrl: (v: string | null) => void;
	setLogoId: (v: string | null) => void;
	setLogoVariantMode: (
		v: import('@/types/wallpaper').LogoVariantMode
	) => void;
	setLogoAsset: (id: string, url: string) => void;
	restoreFactoryLogo: () => void;
	setLogoBaseSize: (v: number) => void;
	setLogoPositionX: (v: number) => void;
	setLogoPositionY: (v: number) => void;
	setLogoCircularCrop: (v: boolean) => void;
	setLogoCropRadius: (v: number) => void;
	setLogoBandMode: (v: LogoBandMode) => void;
	setLogoAudioSmoothing: (v: number) => void;
	setLogoAudioSensitivity: (v: number) => void;
	setLogoReactiveScaleIntensity: (v: number) => void;
	setLogoReactivitySpeed: (v: number) => void;
	setLogoAttack: (v: number) => void;
	setLogoRelease: (v: number) => void;
	setLogoMinScale: (v: number) => void;
	setLogoMaxScale: (v: number) => void;
	setLogoPunch: (v: number) => void;
	setLogoPeakWindow: (v: number) => void;
	setLogoPeakFloor: (v: number) => void;
	setLogoGlowEnabled: (v: boolean) => void;
	setLogoGlowColor: (v: string) => void;
	setLogoGlowColorSource: (v: ColorSourceMode) => void;
	setLogoGlowBlur: (v: number) => void;
	setLogoGlowReach: (v: number) => void;
	setLogoGlowAudioAmount: (v: number) => void;
	setLogoShadowEnabled: (v: boolean) => void;
	setLogoShadowColor: (v: string) => void;
	setLogoShadowColorSource: (v: ColorSourceMode) => void;
	setLogoShadowBlur: (v: number) => void;
	setLogoBackdropEnabled: (v: boolean) => void;
	setLogoBackdropColor: (v: string) => void;
	setLogoBackdropColorSource: (v: ColorSourceMode) => void;
	setLogoBackdropOpacity: (v: number) => void;
	setLogoBackdropPadding: (v: number) => void;
	setLogoRotationSpeed: (v: number) => void;
	addLogoProfileSlot: () => void;
	removeLogoProfileSlot: (index: number) => void;
	saveLogoProfileSlot: (index: number) => void;
	loadLogoProfileSlot: (index: number) => void;

	// Particles
	setParticlesEnabled: (v: boolean) => void;
	setParticleLayerMode: (v: ParticleLayerMode) => void;
	setParticleShape: (v: ParticleShape) => void;
	setParticleColor1: (v: string) => void;
	setParticleColor2: (v: string) => void;
	setParticleColorSource: (v: ColorSourceMode) => void;
	setParticleColorMode: (v: ParticleColorMode) => void;
	setParticleSizeMin: (v: number) => void;
	setParticleSizeMax: (v: number) => void;
	setParticleOpacity: (v: number) => void;
	setParticleGlow: (v: boolean) => void;
	setParticleGlowStrength: (v: number) => void;
	setParticleGlowReach: (v: number) => void;
	setParticleGlowAudioAmount: (v: number) => void;
	setParticleFilterBrightness: (v: number) => void;
	setParticleFilterContrast: (v: number) => void;
	setParticleFilterSaturation: (v: number) => void;
	setParticleFilterBlur: (v: number) => void;
	setParticleFilterHueRotate: (v: number) => void;
	setParticleRotationIntensity: (v: number) => void;
	setParticleRotationDirection: (v: ParticleRotationDirection) => void;
	setParticleFadeInOut: (v: boolean) => void;
	setParticleAudioReactive: (v: boolean) => void;
	setParticleAudioChannel: (v: AudioReactiveChannel) => void;
	setParticleAudioSmoothing: (v: number) => void;
	setParticleAudioSizeBoost: (v: number) => void;
	setParticleAudioOpacityBoost: (v: number) => void;
	setParticleAudioAttack: (v: number) => void;
	setParticleAudioRelease: (v: number) => void;
	setParticleAudioReactivitySpeed: (v: number) => void;
	setParticleAudioPeakWindow: (v: number) => void;
	setParticleAudioPeakFloor: (v: number) => void;
	setParticleAudioPunch: (v: number) => void;
	setParticleAudioDriftEnabled: (v: boolean) => void;
	setParticleAudioDriftAngle: (v: number) => void;
	setParticleAudioDriftAmount: (v: number) => void;
	setParticleAudioDriftBase: (v: number) => void;
	setParticleAudioDriftChannel: (v: AudioReactiveChannel) => void;
	setParticleAudioDriftThreshold: (v: number) => void;
	setParticleAudioDriftRelease: (v: number) => void;
	setParticleAudioDriftMode: (v: ParticleAudioDriftMode) => void;
	setParticleAudioDriftInvertOnLowEnergy: (v: boolean) => void;
	setParticleDepthFlowEnabled: (v: boolean) => void;
	setParticleDepthFlowAmount: (v: number) => void;
	setParticleDepthFlowDirection: (v: ParticleDepthFlowDirection) => void;
	setParticleDepthFlowChannel: (v: AudioReactiveChannel) => void;
	setParticleDepthFlowThreshold: (v: number) => void;
	setParticleDepthFlowSensitivity: (v: number) => void;
	setParticleDepthFlowAttack: (v: number) => void;
	setParticleDepthFlowRelease: (v: number) => void;
	setParticleDepthFlowSpeed: (v: number) => void;
	setParticleDepthFlowSpread: (v: number) => void;
	setParticleDepthFlowFocusX: (v: number) => void;
	setParticleDepthFlowFocusY: (v: number) => void;
	setParticleDepthFlowMode: (v: ParticleDepthFlowMode) => void;
	setParticleDepthFlowSpawnOrigin: (
		v: import('@/types/wallpaper').ParticleDepthFlowSpawnOrigin
	) => void;
	setParticleDepthFlowInvertFocusOnLowEnergy: (v: boolean) => void;
	setParticleDepthFlowInvertFocusAxis: (
		v: ParticleDepthFlowLowEnergyAxis
	) => void;
	setParticleDepthFlowWindInfluence: (v: number) => void;
	setParticleCount: (v: number) => void;
	setParticleSpeed: (v: number) => void;
	setParticleLifetime: (v: number) => void;
	randomizeMotion: (colorSource: ColorSourceMode) => void;

	// Rain
	setRainEnabled: (v: boolean) => void;
	setRainIntensity: (v: number) => void;
	setRainDropCount: (v: number) => void;
	setRainAngle: (v: number) => void;
	setRainMeshRotationZ: (v: number) => void;
	setRainColor: (v: string) => void;
	setRainColorSource: (v: ColorSourceMode) => void;
	setRainColorMode: (v: RainColorMode) => void;
	setRainParticleType: (v: RainParticleType) => void;
	setRainLength: (v: number) => void;
	setRainWidth: (v: number) => void;
	setRainBlur: (v: number) => void;
	setRainSpeed: (v: number) => void;
	setRainVariation: (v: number) => void;
	// Slideshow
	setSlideshowEnabled: (v: boolean) => void;
	setSlideshowInterval: (v: number) => void;
	setSlideshowTransitionDuration: (v: number) => void;
	setSlideshowTransitionType: (v: SlideshowTransitionType) => void;
	setSlideshowTransitionIntensity: (v: number) => void;
	setSlideshowTransitionAudioDrive: (v: number) => void;
	setSlideshowTransitionAudioChannel: (v: AudioReactiveChannel) => void;
	setSlideshowTransitionAudioSmoothing: (v: number) => void;
	setSlideshowTransitionAnchor: (v: SlideshowTransitionAnchor) => void;
	setSlideshowResetPosition: (v: boolean) => void;
	setSlideshowAudioCheckpointsEnabled: (v: boolean) => void;
	setSlideshowTrackChangeSyncEnabled: (v: boolean) => void;
	setSlideshowManualTimestampsEnabled: (v: boolean) => void;
	setImagePlaybackSwitchAt: (v: number | null) => void;
	setBackgroundImagePlaybackSwitchAt: (
		assetId: string,
		v: number | null
	) => void;
	resetAllManualTimestamps: () => void;
	/**
	 * Writes `timeSec` as the switch timestamp of the image AFTER the active
	 * one — the "mark here" gesture: the end of a clip is the start of the next.
	 * Turns manual mode on when it is off, and reports whether the mark left the
	 * slideshow playing images out of pool order.
	 */
	markNextImageSwitchAt: (timeSec: number) => MarkNextSwitchResult;
	setActiveImageId: (id: string | null) => void;
	applyActiveImageConfigToDefaultImages: () => void;
	moveImageEntry: (id: string, direction: -1 | 1) => void;
	moveImageEntryToIndex: (id: string, targetIndex: number) => void;
	setBackgroundImageEntryEnabled: (assetId: string, enabled: boolean) => void;
	shuffleImageEntries: () => void;
	setImageUrls: (v: string[]) => void;
	autoCoverFitActiveImage: () => Promise<void>;
	autoCoverFitAllImages: () => Promise<void>;
	autoFitCoveredActiveImage: () => Promise<void>;
	autoFocusActiveImage: () => Promise<void>;
	autoPlaceLogoForActiveImage: () => Promise<void>;
	setActiveImageFramingEdited: (edited: boolean) => void;

	// Persistence (IndexedDB)
	addImageEntry: (
		id: string,
		url: string,
		thumbnailUrl?: string | null,
		originalFileName?: string | null
	) => void;
	setImageThumbnailUrl: (id: string, thumbnailUrl: string | null) => void;
	removeImageEntry: (id: string) => void;
	addOverlay: (overlay: WallpaperState['overlays'][number]) => void;
	updateOverlay: (
		id: string,
		patch: Partial<WallpaperState['overlays'][number]>
	) => void;
	removeOverlay: (id: string) => void;
	setSelectedOverlayId: (id: string | null) => void;
	setBackgroundImageSceneSlotId: (
		assetId: string,
		sceneSlotId: string | null
	) => void;
	/** Scene-first: assign an explicit scene to an image (alias with intent). */
	assignSceneToImage: (assetId: string, sceneSlotId: string) => void;
	/** Scene-first: clear an image's explicit scene so it rides the default. */
	setImageUseDefaultScene: (assetId: string) => void;
	/** Scene-first: set/clear the global default scene (applied to images that
	 *  have no explicit scene). Re-applies + transitions the active image when
	 *  it rides the default. */
	setDefaultSceneSlot: (sceneSlotId: string | null) => void;
	clearDefaultSceneSlot: () => void;
	/** Duplicate a scene (shares its feature-slot references). */
	duplicateScene: (sceneSlotId: string) => void;
	resetSceneSlotBindings: () => void;
	resetFiltersToDefaults: () => void;
	randomizeLooks: () => void;

	// Feature slot CRUD (particles / rain / looks / track title)
	addParticlesProfileSlot: () => void;
	removeParticlesProfileSlot: (index: number) => void;
	saveParticlesProfileSlot: (index: number) => void;
	loadParticlesProfileSlot: (index: number) => void;
	addRainProfileSlot: () => void;
	removeRainProfileSlot: (index: number) => void;
	saveRainProfileSlot: (index: number) => void;
	loadRainProfileSlot: (index: number) => void;
	addLooksProfileSlot: () => void;
	removeLooksProfileSlot: (index: number) => void;
	saveLooksProfileSlot: (index: number) => void;
	loadLooksProfileSlot: (index: number) => void;
	addTrackTitleProfileSlot: () => void;
	removeTrackTitleProfileSlot: (index: number) => void;
	saveTrackTitleProfileSlot: (index: number) => void;
	loadTrackTitleProfileSlot: (index: number) => void;
	addLightsProfileSlot: () => void;
	removeLightsProfileSlot: (index: number) => void;
	saveLightsProfileSlot: (index: number) => void;
	loadLightsProfileSlot: (index: number) => void;
	addCameraFxProfileSlot: () => void;
	removeCameraFxProfileSlot: (index: number) => void;
	saveCameraFxProfileSlot: (index: number) => void;
	loadCameraFxProfileSlot: (index: number) => void;

	// Scene slot CRUD (composition-only)
	addSceneSlot: (name?: string) => void;
	updateSceneSlot: (
		id: string,
		patch: Partial<Omit<import('@/types/wallpaper').SceneSlot, 'id'>>
	) => void;
	renameSceneSlot: (id: string, nextName: string) => void;
	removeSceneSlot: (id: string) => void;
	applySceneSlotById: (id: string) => void;
	setActiveSceneSlotId: (id: string | null) => void;
	/**
	 * Snapshots live state into a new Scene slot. Omitted `matchKinds` captures
	 * every subsystem. Defined by `captureSceneSlot`.
	 *
	 * Returns the new scene's id plus the kinds that could not be stored because
	 * their family is at its slot cap, so callers can bind the scene (to an
	 * image) and tell the user what was left out. Returns `null` when the scene
	 * cap is reached and nothing was created.
	 */
	captureSceneSlotFromCurrent: (
		name?: string,
		matchKinds?: import('@/features/scenes/captureSceneSlot').SceneCaptureKinds
	) => {
		sceneId: string;
		skipped: import('@/features/scenes/captureSceneSlot').SceneCaptureKind[];
	} | null;

	// ── AI Director (try-on state; never persisted) ──────────────────────────
	/** The scene currently being tried on, or null. */
	aiDraft: import('@/features/aiDirector').SceneDraft | null;
	/** Whether `aiDraft` is applied to live state right now. */
	aiPreviewActive: boolean;
	/** Exactly the keys the preview overwrote, for a residue-free revert. */
	aiPreviewSnapshot: Partial<WallpaperState> | null;
	setAiDraft: (
		draft: import('@/features/aiDirector').SceneDraft | null
	) => void;
	previewAiDraft: (
		draft?: import('@/features/aiDirector').SceneDraft
	) => void;
	revertAiPreview: () => void;
	/** Commits scenes for a whole pool in one write and binds each to its
	 *  image. Returns what was built, or null when there was nothing to do. */
	applyAiBatch: (
		entries: import('@/features/aiDirector').BatchImageIntent[]
	) => import('@/features/aiDirector').BatchScenesResult | null;
	discardAiDraft: () => void;
	/** Saves the previewed look as a Scene and binds it to the draft's image.
	 *  Returns the same shape as `captureSceneSlotFromCurrent`, or null. */
	commitAiDraft: (
		name?: string,
		bindToImage?: boolean
	) => {
		sceneId: string;
		skipped: import('@/features/scenes/captureSceneSlot').SceneCaptureKind[];
	} | null;

	// System
	setPerformanceMode: (v: PerformanceMode) => void;
	setPerformanceSafeEnabled: (enabled: boolean) => void;
	dismissDiscoveryOnboarding: () => void;
	surpriseMe: () => void;
	setLanguage: (v: Language) => void;
	setShowFps: (v: boolean) => void;
	setSceneServiceBaseUrl: (v: string) => void;
	setSceneServiceModel: (v: string) => void;
	setOfflineExportResolutionId: (v: OfflineExportResolutionPresetId) => void;
	setOfflineExportFps: (v: OfflineExportFps) => void;
	setControlPanelAnchor: (v: ControlPanelAnchor) => void;
	setControlPanelOffset: (x: number, y: number) => void;
	setHudLiquidGlassEnabled: (v: boolean) => void;
	setQuickEditCaptureMode: (v: 'total' | 'selection') => void;
	addColorFavorite: (hex: string) => void;
	removeColorFavorite: (hex: string) => void;
	setColorFavorites: (list: string[]) => void;
	setControlPanelActiveTab: (v: string | null) => void;
	setActiveSpectrumTarget: (
		v: import('@/features/spectrum').SpectrumProfileTarget
	) => void;
	setFpsOverlayAnchor: (v: ControlPanelAnchor) => void;
	setEditorTheme: (v: EditorTheme) => void;
	setEditorThemeColorSource: (v: ThemeColorSource) => void;
	setEditorShellColorSource: (v: ThemeColorSource) => void;
	setSpectrumColorSources: (v: ThemeColorSource) => void;
	setLogoColorSources: (v: ThemeColorSource) => void;
	setMotionColorSources: (v: ThemeColorSource) => void;
	setTrackTitleColorSources: (v: ThemeColorSource) => void;
	setLyricsColorSources: (v: ThemeColorSource) => void;
	setCanvasColorSources: (v: ThemeColorSource) => void;
	syncAllColorSources: (v: ThemeColorSource) => void;
	setEditorCornerRadius: (v: number) => void;
	setEditorControlCornerRadius: (v: number) => void;
	setEditorUiScale: (v: number) => void;
	setEditorShowPreciseNumericControls: (v: boolean) => void;
	setEditorCompactSlotIcons: (v: boolean) => void;
	setEditorImagePreviewQuality: (v: EditorImagePreviewQuality) => void;
	setEditorManualAccentColor: (v: string) => void;
	setEditorManualSecondaryColor: (v: string) => void;
	setEditorManualBackdropColor: (v: string) => void;
	setEditorManualTextPrimaryColor: (v: string) => void;
	setEditorManualTextSecondaryColor: (v: string) => void;
	setEditorManualBackdropOpacity: (v: number) => void;
	setEditorManualBlurPx: (v: number) => void;
	setEditorManualSurfaceOpacity: (v: number) => void;
	setEditorManualItemOpacity: (v: number) => void;
	setQuickActionsEnabled: (v: boolean) => void;
	setQuickActionsPositionX: (v: number) => void;
	setQuickActionsPositionY: (v: number) => void;
	setQuickActionsLauncherPositionX: (v: number) => void;
	setQuickActionsLauncherPositionY: (v: number) => void;
	setQuickActionsBackdropOpacity: (v: number) => void;
	setQuickActionsBlurPx: (v: number) => void;
	setQuickActionsScale: (v: number) => void;
	setQuickActionsLauncherSize: (v: number) => void;
	setQuickActionsColorSource: (v: ThemeColorSource) => void;
	setQuickActionsManualAccentColor: (v: string) => void;
	setQuickActionsManualSecondaryColor: (v: string) => void;
	setQuickActionsManualBackdropColor: (v: string) => void;
	setQuickActionsManualTextPrimaryColor: (v: string) => void;
	setQuickActionsManualTextSecondaryColor: (v: string) => void;
	setQuickActionsManualSurfaceOpacity: (v: number) => void;
	setQuickActionsManualItemOpacity: (v: number) => void;
	setSleepModeEnabled: (v: boolean) => void;
	setSleepModeDelaySeconds: (v: number) => void;
	setSleepModeActive: (v: boolean) => void;
	setVirtualFoldersEnabled: (v: boolean) => void;
	setUIMode: (v: import('@/types/wallpaper').UIMode) => void;
	setEnableDragMode: (v: boolean) => void;
	setActiveTool: (v: import('@/types/wallpaper').ActiveTool) => void;
	setDragTool: (v: import('@/types/wallpaper').ActiveTool) => void;
	setLayerZIndex: (id: BuiltInLayerId, zIndex: number) => void;
	resetLayerZIndices: () => void;
	backgroundFallbackVisible: boolean;
	setBackgroundFallbackVisible: (v: boolean) => void;
	restoreFactorySettingsDefaults: () => void;
	applyPreset: (id: string) => void;
	saveCustomPreset: (name?: string) => void;
	duplicatePreset: (name?: string) => void;
	revertToActivePreset: () => void;
	reset: () => void;
	resetSection: (keys: (keyof WallpaperState)[]) => void;

	// Calibration
	setCalibrationRangeOverride: (
		key: keyof import('@/features/calibration').CalibrationRangeOverrides &
			string,
		override:
			| import('@/features/calibration').CalibrationRangeOverride
			| null
	) => void;
	resetCalibrationRangeOverrides: () => void;
	setCalibrationSyntheticMode: (
		group: import('@/features/calibration').CalibrationGroupId,
		enabled: boolean
	) => void;

	// Radial spectrum rotation drive
	setSpectrumRotationDrive: (
		v: import('@/features/stageFx/stageFxConfig').SpectrumRotationDrive
	) => void;
	setSpectrumRotationAudioAmount: (v: number) => void;
	setSpectrumRotationChannel: (
		v: import('@/features/stageFx/stageFxConfig').SpectrumRotationChannel
	) => void;
	setSpectrumRotationDirection: (
		v: import('@/features/stageFx/stageFxConfig').RotationDirection
	) => void;
	setSpectrumRotationSmoothing: (v: number) => void;
	setSpectrumRotationInvertOnLowEnergy: (v: boolean) => void;
	setSpectrumRotationInvertThreshold: (v: number) => void;
	setSpectrumRotationInvertHoldMs: (v: number) => void;

	// Stage Lights FX
	setStageLightsEnabled: (v: boolean) => void;
	setStageLightsIntensity: (v: number) => void;
	setStageLightsBeamCount: (v: number) => void;
	setStageLightsMinBeamCount: (v: number) => void;
	setStageLightsMaxBeamCount: (v: number) => void;
	setStageLightsBeamWidth: (v: number) => void;
	setStageLightsBeamLength: (v: number) => void;
	setStageLightsSoftness: (v: number) => void;
	setStageLightsSpeed: (v: number) => void;
	setStageLightsFixedMotion: (v: boolean) => void;
	setStageLightsColorSource: (
		v: import('@/features/stageFx/stageFxConfig').StageLightsColorSource
	) => void;
	setStageLightsColor: (v: string) => void;
	setStageLightsAudioReactive: (v: boolean) => void;
	setStageLightsAudioChannel: (
		v: import('@/features/stageFx/stageFxConfig').FxAudioChannel
	) => void;
	setStageLightsAudioAmount: (v: number) => void;
	setStageLightsAudioOscillationAmount: (v: number) => void;
	setStageLightsAudioHoldMs: (v: number) => void;
	setStageLightsAudioDecay: (v: number) => void;
	setStageLightsAudioGateEnabled: (v: boolean) => void;
	setStageLightsPeakFlash: (v: boolean) => void;
	setStageLightsPeakThreshold: (v: number) => void;
	setStageLightsBandThreshold: (
		channel: import('@/features/stageFx/stageFxConfig').FxAudioChannel,
		v: number
	) => void;
	setStageLightsOpacity: (v: number) => void;
	setStageLightsBlendMode: (
		v: import('@/features/stageFx/stageFxConfig').StageLightsBlendMode
	) => void;
	setStageLightsOrigin: (
		v: import('@/features/stageFx/stageFxConfig').StageLightsOrigin
	) => void;
	setStageLightsMovementMode: (
		v: import('@/features/stageFx/stageFxConfig').StageLightsMovementMode
	) => void;
	setStageLightsInvertDirection: (v: boolean) => void;
	setStageLightsMirrorDirections: (v: boolean) => void;

	// Flash Light FX
	setFlashLightEnabled: (v: boolean) => void;
	setFlashLightIntensity: (v: number) => void;
	setFlashLightColorSource: (
		v: import('@/features/stageFx/stageFxConfig').StageLightsColorSource
	) => void;
	setFlashLightColor: (v: string) => void;
	setFlashLightSoftness: (v: number) => void;
	setFlashLightBrightness: (v: number) => void;
	setFlashLightDecay: (v: number) => void;
	setFlashLightAudioChannel: (
		v: import('@/features/stageFx/stageFxConfig').FxAudioChannel
	) => void;
	setFlashLightThreshold: (v: number) => void;
	setFlashLightBandThreshold: (
		channel: import('@/features/stageFx/stageFxConfig').FxAudioChannel,
		v: number
	) => void;
	setFlashLightSensitivity: (v: number) => void;
	setFlashLightRetriggerMs: (v: number) => void;
	setFlashLightShape: (
		v: import('@/features/stageFx/stageFxConfig').FlashLightShape
	) => void;
	setFlashLightBlendMode: (
		v: import('@/features/stageFx/stageFxConfig').StageLightsBlendMode
	) => void;

	// Logo Flash Edge
	setLogoFlashEdgeEnabled: (v: boolean) => void;
	setLogoFlashEdgeIntensityMult: (v: number) => void;
	setLogoFlashEdgeThickness: (v: number) => void;
	setLogoFlashEdgeRadius: (v: number) => void;
	setLogoFlashEdgeColorMode: (v: 'flash' | 'manual') => void;
	setLogoFlashEdgeColor: (v: string) => void;

	// Background Flash Edge
	setBgFlashEdgeEnabled: (v: boolean) => void;
	setBgFlashEdgeIntensityMult: (v: number) => void;
	setBgFlashEdgeThickness: (v: number) => void;
	setBgFlashEdgeRadius: (v: number) => void;
	setBgFlashEdgeColorMode: (v: 'flash' | 'manual') => void;
	setBgFlashEdgeColor: (v: string) => void;

	// Camera FX
	setCameraFxEnabled: (v: boolean) => void;
	setCameraMotionEnabled: (v: boolean) => void;
	setCameraMotionMode: (
		v: import('@/features/stageFx/stageFxConfig').CameraMotionMode
	) => void;
	setCameraMotionAmount: (v: number) => void;
	setCameraMotionSpeed: (v: number) => void;
	setCameraMotionDrive: (
		v: import('@/features/stageFx/stageFxConfig').CameraMotionDrive
	) => void;
	setCameraMotionAudioInfluence: (v: number) => void;
	setCameraMotionAudioChannel: (
		v: import('@/features/stageFx/stageFxConfig').FxAudioChannel
	) => void;
	setCameraMotionDirection: (
		v: import('@/features/stageFx/stageFxConfig').CameraMotionDirection
	) => void;
	setCameraMotionTarget: (
		v: import('@/features/stageFx/stageFxConfig').CameraMotionTarget
	) => void;
	setCameraMotionTargets: (
		v: import('@/features/stageFx/stageFxConfig').CameraMotionTarget[]
	) => void;
	setCameraShakeEnabled: (v: boolean) => void;
	setCameraShakeAmount: (v: number) => void;
	setCameraShakeDecay: (v: number) => void;
	setCameraShakeThreshold: (v: number) => void;
	setCameraShakeBandThreshold: (
		channel: import('@/features/stageFx/stageFxConfig').FxAudioChannel,
		v: number
	) => void;
	setCameraShakeTargets: (
		v: import('@/features/stageFx/stageFxConfig').CameraMotionTarget[]
	) => void;
	setCameraShakeSensitivity: (v: number) => void;
	setCameraShakeRetriggerMs: (v: number) => void;
	setCameraShakeChannel: (
		v: import('@/features/stageFx/stageFxConfig').FxAudioChannel
	) => void;
	setCameraShakeMode: (
		v: import('@/features/stageFx/stageFxConfig').ScreenShakeMode
	) => void;
	setCameraShakeFrequency: (v: number) => void;
	setCameraShakeRoughness: (v: number) => void;
	applySuggestedCalibration: () => void;
	resetCalibrationToOriginalDefaults: () => void;
	addCalibrationProfileSlot: () => void;
	removeCalibrationProfileSlot: (index: number) => void;
	renameCalibrationProfileSlot: (index: number, name: string) => void;
	saveCalibrationProfileSlot: (index: number) => void;
	loadCalibrationProfileSlot: (index: number) => void;
	clearCalibrationProfileSlot: (index: number) => void;

	// Setlists (curated subsets of the global image pool + audio playlist).
	addSetlist: (name?: string) => string;
	renameSetlist: (id: string, name: string) => void;
	deleteSetlist: (id: string) => void;
	setActiveSetlistId: (id: string | null) => void;
	toggleSetlistImage: (id: string, assetId: string) => void;
	toggleSetlistTrack: (id: string, trackId: string) => void;
	setSetlistImages: (id: string, assetIds: string[]) => void;
	setSetlistTracks: (id: string, trackIds: string[]) => void;
	setShowSetlistHud: (v: boolean) => void;
};
