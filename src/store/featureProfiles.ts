import type {
	BackgroundProfileSettings,
	LogoProfileSettings,
	ProfileSlot,
	SpectrumProfileSettings,
	WallpaperState
} from '@/types/wallpaper';
import {
	SECOND_SPECTRUM_INSTANCE_ID,
	SPECTRUM_VISUAL_ACCENTS_DEMO_PROFILE_SLOTS,
	createDefaultSpectrumInstanceSettings,
	hydrateSpectrumProfileValues,
	normalizeSpectrumShape
} from '@/features/spectrum';
import { FILTER_LOOK_PRESET_KEYS } from '@/features/filterLooks/filterLooks';
import {
	createDefaultEffectLayer,
	syncActiveEffectLayer
} from '@/features/filterLooks/effectLayers';

export const BACKGROUND_PROFILE_SLOT_COUNT = 3;
export const LOGO_PROFILE_SLOT_COUNT = 3;
export const SPECTRUM_PROFILE_SLOT_COUNT = 8;
export const MAX_PROFILE_SLOT_COUNT = 60;
// Slot caps are just guards; the real ceiling is the localStorage quota
// (~5MB), shared across all persisted state. These generous values give plenty
// of headroom — a spectrum slot is ~4KB, so 120 ≈ 0.5MB. The persist storage
// now degrades gracefully if the quota is ever hit (see safeStorage.setItem).
export const MAX_SPECTRUM_SLOT_COUNT = 120;
export const MAX_LOGO_SLOT_COUNT = 60;
export const PARTICLES_PROFILE_SLOT_COUNT = 3;
export const MAX_PARTICLES_SLOT_COUNT = 60;
export const RAIN_PROFILE_SLOT_COUNT = 3;
export const MAX_RAIN_SLOT_COUNT = 60;
export const LOOKS_PROFILE_SLOT_COUNT = 6;
export const MAX_LOOKS_SLOT_COUNT = 60;
export const TRACK_TITLE_PROFILE_SLOT_COUNT = 3;
export const MAX_TRACK_TITLE_SLOT_COUNT = 60;
export const LIGHTS_PROFILE_SLOT_COUNT = 3;
export const MAX_LIGHTS_SLOT_COUNT = 60;
export const CAMERA_FX_PROFILE_SLOT_COUNT = 3;
export const MAX_CAMERA_FX_SLOT_COUNT = 60;

export const PARTICLES_PROFILE_KEYS = [
	'particlesEnabled',
	'particleLayerMode',
	'particleShape',
	'particleColor1',
	'particleColor2',
	'particleColorSource',
	'particleColorMode',
	'particleSizeMin',
	'particleSizeMax',
	'particleOpacity',
	'particleGlow',
	'particleGlowStrength',
	'particleGlowReach',
	'particleGlowAudioAmount',
	'particleFilterBrightness',
	'particleFilterContrast',
	'particleFilterSaturation',
	'particleFilterBlur',
	'particleFilterHueRotate',
	'particleRotationIntensity',
	'particleRotationDirection',
	'particleFadeInOut',
	'particleAudioReactive',
	'particleAudioChannel',
	'particleAudioSmoothing',
	'particleAudioSizeBoost',
	'particleAudioOpacityBoost',
	'particleAudioAttack',
	'particleAudioRelease',
	'particleAudioReactivitySpeed',
	'particleAudioPeakWindow',
	'particleAudioPeakFloor',
	'particleAudioPunch',
	'particleAudioDriftEnabled',
	'particleAudioDriftAngle',
	'particleAudioDriftAmount',
	'particleAudioDriftBase',
	'particleAudioDriftChannel',
	'particleAudioDriftThreshold',
	'particleAudioDriftRelease',
	'particleAudioDriftMode',
	'particleAudioDriftInvertOnLowEnergy',
	'particleDepthFlowEnabled',
	'particleDepthFlowAmount',
	'particleDepthFlowDirection',
	'particleDepthFlowChannel',
	'particleDepthFlowThreshold',
	'particleDepthFlowSensitivity',
	'particleDepthFlowAttack',
	'particleDepthFlowRelease',
	'particleDepthFlowSpeed',
	'particleDepthFlowSpread',
	'particleDepthFlowFocusX',
	'particleDepthFlowFocusY',
	'particleDepthFlowMode',
	'particleDepthFlowSpawnOrigin',
	'particleDepthFlowInvertFocusOnLowEnergy',
	'particleDepthFlowInvertFocusAxis',
	'particleDepthFlowWindInfluence',
	'particleCount',
	'particleSpeed',
	'particleLifetime'
] as const satisfies ReadonlyArray<keyof WallpaperState>;

export type ParticlesProfileSettings = Pick<
	WallpaperState,
	(typeof PARTICLES_PROFILE_KEYS)[number]
>;

export const RAIN_PROFILE_KEYS = [
	'rainEnabled',
	'rainIntensity',
	'rainDropCount',
	'rainAngle',
	'rainMeshRotationZ',
	'rainColor',
	'rainColorSource',
	'rainColorMode',
	'rainParticleType',
	'rainLength',
	'rainWidth',
	'rainBlur',
	'rainSpeed',
	'rainVariation'
] as const satisfies ReadonlyArray<keyof WallpaperState>;

export type RainProfileSettings = Pick<
	WallpaperState,
	(typeof RAIN_PROFILE_KEYS)[number]
>;

/**
 * Lights = Stage Lights + Flash Light captured together into one slot.
 * `stageLightsEnabled` and `flashLightEnabled` are included so a Scene can
 * force the whole subsystem OFF.
 */
export const LIGHTS_PROFILE_KEYS = [
	'stageLightsEnabled',
	'stageLightsIntensity',
	'stageLightsBeamCount',
	'stageLightsMinBeamCount',
	'stageLightsMaxBeamCount',
	'stageLightsBeamWidth',
	'stageLightsBeamLength',
	'stageLightsSoftness',
	'stageLightsSpeed',
	'stageLightsFixedMotion',
	'stageLightsColorSource',
	'stageLightsColor',
	'stageLightsAudioReactive',
	'stageLightsAudioChannel',
	'stageLightsAudioAmount',
	'stageLightsAudioOscillationAmount',
	'stageLightsAudioHoldMs',
	'stageLightsAudioDecay',
	'stageLightsAudioGateEnabled',
	'stageLightsPeakFlash',
	'stageLightsPeakThreshold',
	'stageLightsBandThresholds',
	'stageLightsOpacity',
	'stageLightsBlendMode',
	'stageLightsOrigin',
	'stageLightsMovementMode',
	'stageLightsInvertDirection',
	'stageLightsMirrorDirections',
	'flashLightEnabled',
	'flashLightIntensity',
	'flashLightColorSource',
	'flashLightColor',
	'flashLightSoftness',
	'flashLightBrightness',
	'flashLightDecay',
	'flashLightAudioChannel',
	'flashLightThreshold',
	'flashLightBandThresholds',
	'flashLightSensitivity',
	'flashLightRetriggerMs',
	'flashLightShape',
	'flashLightBlendMode'
] as const satisfies ReadonlyArray<keyof WallpaperState>;

export type LightsProfileSettings = Pick<
	WallpaperState,
	(typeof LIGHTS_PROFILE_KEYS)[number]
>;

/**
 * Camera FX = Camera Motion + Screen Shake captured together. Both enabled
 * flags are included so a Scene can force the subsystem OFF. The deprecated
 * scalar `cameraMotionTarget` is intentionally excluded (use
 * `cameraMotionTargets`).
 */
export const CAMERA_FX_PROFILE_KEYS = [
	'cameraMotionEnabled',
	'cameraMotionMode',
	'cameraMotionAmount',
	'cameraMotionSpeed',
	'cameraMotionDrive',
	'cameraMotionAudioInfluence',
	'cameraMotionAudioChannel',
	'cameraMotionDirection',
	'cameraMotionTargets',
	// The whole stack from day one: a slot that restored only the flat keys
	// would restore the layer being edited instead of the composition.
	'motionLayers',
	'activeMotionLayerId',
	'cameraShakeEnabled',
	'cameraShakeAmount',
	'cameraShakeDecay',
	'cameraShakeThreshold',
	'cameraShakeBandThresholds',
	'cameraShakeTargets',
	'cameraShakeSensitivity',
	'cameraShakeRetriggerMs',
	'cameraShakeChannel',
	'cameraShakeMode',
	'cameraShakeFrequency',
	'cameraShakeRoughness'
] as const satisfies ReadonlyArray<keyof WallpaperState>;

export type CameraFxProfileSettings = Pick<
	WallpaperState,
	(typeof CAMERA_FX_PROFILE_KEYS)[number]
>;

/**
 * Looks (filter + post-fx) snapshot. Includes the filter stack, the RGB shift
 * with its audio routing, scanlines and noise, so that a Looks slot captures
 * the full visual-tone pipeline without leaking into other subsystems
 * (spectrum/logo/audio remain untouched).
 */
export const LOOKS_PROFILE_KEYS = [
	'filterTargets',
	'effectLayers',
	'activeEffectLayerId',
	...FILTER_LOOK_PRESET_KEYS
] as const satisfies ReadonlyArray<keyof WallpaperState>;

export type LooksProfileSettings = Pick<
	WallpaperState,
	(typeof LOOKS_PROFILE_KEYS)[number]
>;

export const TRACK_TITLE_PROFILE_KEYS = [
	'trackMetadataMode',
	'trackMetadataAutoSource',
	'trackManualArtist',
	'trackManualTitle',
	'nowPlayingMode',
	'nowPlayingCoverEnabled',
	'nowPlayingArtistEnabled',
	'nowPlayingProgressEnabled',
	'nowPlayingScale',
	'nowPlayingAccentColor',
	'nowPlayingAccentColorSource',
	'nowPlayingTextTreatment',
	'audioTrackTitleEnabled',
	'audioTrackTitleLayoutMode',
	'audioTrackTitleFontStyle',
	'audioTrackTitleUppercase',
	'audioTrackTitlePositionX',
	'audioTrackTitlePositionY',
	'audioTrackTitleFontSize',
	'audioTrackTitleLetterSpacing',
	'audioTrackTitleWidth',
	'audioTrackTitleOpacity',
	'audioTrackTitleScrollSpeed',
	'audioTrackTitleRgbShift',
	'audioTrackTitleTextColor',
	'audioTrackTitleTextColorSource',
	'audioTrackTitleStrokeColor',
	'audioTrackTitleStrokeColorSource',
	'audioTrackTitleStrokeWidth',
	'audioTrackTitleGlowColor',
	'audioTrackTitleGlowColorSource',
	'audioTrackTitleGlowBlur',
	'audioTrackTitleGlowReach',
	'audioTrackTitleBackdropEnabled',
	'audioTrackTitleBackdropColor',
	'audioTrackTitleBackdropColorSource',
	'audioTrackTitleBackdropOpacity',
	'audioTrackTitleBackdropPadding',
	'audioTrackTitleFilterBrightness',
	'audioTrackTitleFilterContrast',
	'audioTrackTitleFilterSaturation',
	'audioTrackTitleFilterBlur',
	'audioTrackTitleFilterHueRotate',
	'audioTrackTimeEnabled',
	'audioTrackTimePositionX',
	'audioTrackTimePositionY',
	'audioTrackTimeWidth',
	'audioTrackTimeFontStyle',
	'audioTrackTimeFontSize',
	'audioTrackTimeLetterSpacing',
	'audioTrackTimeOpacity',
	'audioTrackTimeRgbShift',
	'audioTrackTimeTextColor',
	'audioTrackTimeTextColorSource',
	'audioTrackTimeStrokeColor',
	'audioTrackTimeStrokeColorSource',
	'audioTrackTimeStrokeWidth',
	'audioTrackTimeGlowColor',
	'audioTrackTimeGlowColorSource',
	'audioTrackTimeGlowBlur',
	'audioTrackTimeGlowReach',
	'audioTrackTimeFilterBrightness',
	'audioTrackTimeFilterContrast',
	'audioTrackTimeFilterSaturation',
	'audioTrackTimeFilterBlur',
	'audioTrackTimeFilterHueRotate'
] as const satisfies ReadonlyArray<keyof WallpaperState>;

export type TrackTitleProfileSettings = Pick<
	WallpaperState,
	(typeof TRACK_TITLE_PROFILE_KEYS)[number]
>;

const BACKGROUND_PROFILE_KEYS = [
	'imageBassReactive',
	'imageBassScaleIntensity',
	'imageAudioReactiveDecay',
	'imageAudioSmoothing',
	'imageOpacityReactive',
	'imageOpacityReactiveAmount',
	'imageOpacityReactiveInvert',
	'imageOpacityReactiveThreshold',
	'imageOpacityReactiveSoftness',
	'imageBlurReactive',
	'imageBlurReactiveAmount',
	'imageBlurReactiveInvert',
	'imageBlurReactiveThreshold',
	'imageBlurReactiveSoftness',
	'imageMirrorFill',
	'imageMirrorFillInvert',
	'imageMirrorFillCount',
	'imageBassAttack',
	'imageBassRelease',
	'imageBassReactivitySpeed',
	'imageBassPeakWindow',
	'imageBassPeakFloor',
	'imageBassPunch',
	'imageBassReactiveScaleIntensity',
	'imageAudioChannel',
	'parallaxStrength'
] as const satisfies ReadonlyArray<keyof WallpaperState>;

export const SPECTRUM_PROFILE_KEYS = [
	'spectrumEnabled',
	'spectrumMainVisible',
	'spectrumInstances',
	'spectrumFamily',
	'spectrumFrameMemoryEnabled',
	'spectrumAfterglow',
	'spectrumMotionTrails',
	'spectrumGhostFrames',
	'spectrumFrameHistoryDepth',
	'spectrumGainExpressiveness',
	'spectrumEnvelopeAttack',
	'spectrumEnvelopeRelease',
	'spectrumEnvelopeReactivitySpeed',
	'spectrumEnvelopePeakWindow',
	'spectrumEnvelopePeakFloor',
	'spectrumEnvelopePunch',
	'spectrumPeakRibbonsEnabled',
	'spectrumPeakRibbons',
	'spectrumBassShockwaveEnabled',
	'spectrumBassShockwave',
	'spectrumShockwaveBandMode',
	'spectrumShockwaveBandThresholds',
	'spectrumShockwaveThickness',
	'spectrumShockwaveOpacity',
	'spectrumShockwaveBlur',
	'spectrumShockwaveColorMode',
	'spectrumEnergyBloomEnabled',
	'spectrumEnergyBloom',
	'spectrumPeakRibbonAngle',
	'spectrumFigureRotationSpeed',
	'spectrumOscilloscopeLineWidth',
	'spectrumTunnelRingCount',
	'spectrumTunnelDepthFalloff',
	'spectrumTunnelRingSpacing',
	'spectrumTunnelWallOpacity',
	'spectrumTunnelPulseStrength',
	'spectrumTunnelAlternateRotation',
	'spectrumLiquidLayer1Opacity',
	'spectrumLiquidLayer2Opacity',
	'spectrumLiquidLayer3Opacity',
	'spectrumLiquidLayer1Amp',
	'spectrumLiquidLayer2Amp',
	'spectrumLiquidLayer3Amp',
	'spectrumLiquidLayer1Fill',
	'spectrumLiquidLayer2Fill',
	'spectrumLiquidLayer3Fill',
	'spectrumLiquidLayer1Speed',
	'spectrumLiquidLayer2Speed',
	'spectrumLiquidLayer3Speed',
	'spectrumLiquidLayer1RotationSpeed',
	'spectrumLiquidLayer2RotationSpeed',
	'spectrumLiquidLayer3RotationSpeed',
	'spectrumLiquidLayer1Shape',
	'spectrumLiquidLayer2Shape',
	'spectrumLiquidLayer3Shape',
	'spectrumLiquidLayer1RigidShape',
	'spectrumLiquidLayer2RigidShape',
	'spectrumLiquidLayer3RigidShape',
	'spectrumLiquidLayer1Pixelate',
	'spectrumLiquidLayer2Pixelate',
	'spectrumLiquidLayer3Pixelate',
	'spectrumSpiralTurns',
	'spectrumSpiralOuterRadius',
	'spectrumSpiralTightness',
	'spectrumSpiralShape',
	'spectrumSpiralLogarithmic',
	'spectrumSpiralGradientStroke',
	'spectrumSpiralArms',
	'spectrumSpiralAudioTurns',
	'spectrumSpiralDotShape',
	'spectrumSpiralStrokeWidth',
	'spectrumOscilloscopeScrollSpeed',
	'spectrumOscilloscopeReactiveWidth',
	'spectrumOscilloscopePhosphor',
	'spectrumOscilloscopePhosphorDecay',
	'spectrumOscilloscopeGrid',
	'spectrumOscilloscopeGridDivisions',
	'spectrumDriveMode',
	'spectrumManualSections',
	'spectrumManualAddWeight',
	'spectrumManualAttack',
	'spectrumManualRelease',
	'spectrumMode',
	'spectrumLinearOrientation',
	'spectrumLinearDirection',
	'spectrumRadialShape',
	'spectrumRadialAngle',
	'spectrumRadialSharpness',
	'spectrumRadialFitLogo',
	'spectrumFollowLogo',
	'spectrumLogoGap',
	'spectrumSpan',
	'spectrumScale',
	'spectrumInnerRadius',
	'spectrumBarCount',
	'spectrumBarWidth',
	'spectrumMinHeight',
	'spectrumMaxHeight',
	'spectrumSmoothing',
	'spectrumOpacity',
	'spectrumGlowIntensity',
	'spectrumGlowReach',
	'spectrumGlowAudioAmount',
	'spectrumShadowBlur',
	'spectrumPrimaryColor',
	'spectrumSecondaryColor',
	'spectrumColorSource',
	'spectrumColorMode',
	'spectrumManualGlow',
	'spectrumManualGlowMode',
	'spectrumGlowColorSource',
	'spectrumGlowColorMode',
	'spectrumGlowPrimaryColor',
	'spectrumGlowSecondaryColor',
	'spectrumPixelate',
	'spectrumPixelateScale',
	'spectrumLedCellSize',
	'spectrumLedCellGap',
	'spectrumLedAngle',
	'spectrumLedShape',
	'spectrumRgbSplit',
	'spectrumRgbSplitAmount',
	'spectrumNeonCore',
	'spectrumNeonCoreIntensity',
	'spectrumNeonCoreWidth',
	'spectrumGradientFlow',
	'spectrumGradientFlowSpeed',
	'spectrumGradientFlowAudio',
	'spectrumGradientFlowDirection',
	'spectrumPeakSparks',
	'spectrumPeakSparksAmount',
	'spectrumPeakSparksSize',
	'spectrumPeakSparksThreshold',
	'spectrumEchoTrace',
	'spectrumEchoTraceCount',
	'spectrumEchoTraceOpacity',
	'spectrumEchoTraceOffset',
	'spectrumEchoTraceDecay',
	'spectrumBandMode',
	'spectrumAudioSmoothing',
	'spectrumShape',
	'spectrumWaveFillOpacity',
	'spectrumRotationSpeed',
	'spectrumRotationDrive',
	'spectrumRotationAudioAmount',
	'spectrumRotationChannel',
	'spectrumRotationDirection',
	'spectrumRotationSmoothing',
	'spectrumRotationInvertOnLowEnergy',
	'spectrumRotationInvertThreshold',
	'spectrumRotationInvertHoldMs',
	'spectrumMirror',
	'spectrumPeakHold',
	'spectrumPeakDecay',
	'spectrumPositionX',
	'spectrumPositionY'
] as const satisfies ReadonlyArray<keyof WallpaperState>;

const LOGO_PROFILE_KEYS = [
	'logoEnabled',
	'logoVariantMode',
	'logoBaseSize',
	'logoPositionX',
	'logoPositionY',
	'logoCircularCrop',
	'logoCropRadius',
	'logoBandMode',
	'logoAudioSmoothing',
	'logoAudioSensitivity',
	'logoReactiveScaleIntensity',
	'logoReactivitySpeed',
	'logoAttack',
	'logoRelease',
	'logoMinScale',
	'logoMaxScale',
	'logoPunch',
	'logoPeakWindow',
	'logoPeakFloor',
	'logoGlowColor',
	'logoGlowColorSource',
	'logoGlowEnabled',
	'logoGlowBlur',
	'logoGlowReach',
	'logoGlowAudioAmount',
	'logoShadowEnabled',
	'logoShadowColor',
	'logoShadowColorSource',
	'logoShadowBlur',
	'logoBackdropEnabled',
	'logoBackdropColor',
	'logoBackdropColorSource',
	'logoBackdropOpacity',
	'logoBackdropPadding',
	'logoRotationSpeed'
] as const satisfies ReadonlyArray<keyof WallpaperState>;

function pickState<K extends keyof WallpaperState>(
	state: WallpaperState,
	keys: readonly K[]
): Pick<WallpaperState, K> {
	const next = {} as Pick<WallpaperState, K>;
	for (const key of keys) {
		next[key] = state[key] as Pick<WallpaperState, K>[K];
	}
	return next;
}

/** Stable id for a ProfileSlot — the reference target for scenes and
 *  per-image bindings (never reference slots by array position). */
export function createProfileSlotId(): string {
	return `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptySlots<T>(
	prefix: string,
	count: number
): Array<ProfileSlot<T>> {
	return Array.from({ length: count }, (_, index) => ({
		id: createProfileSlotId(),
		name: `${prefix} ${index + 1}`,
		values: null
	}));
}

export function createDefaultSpectrumProfileSlots(): Array<
	ProfileSlot<SpectrumProfileSettings>
> {
	const slots = createEmptySlots<SpectrumProfileSettings>(
		'Spectrum',
		SPECTRUM_PROFILE_SLOT_COUNT
	);
	SPECTRUM_VISUAL_ACCENTS_DEMO_PROFILE_SLOTS.forEach((demo, index) => {
		const slotIndex =
			SPECTRUM_PROFILE_SLOT_COUNT -
			SPECTRUM_VISUAL_ACCENTS_DEMO_PROFILE_SLOTS.length +
			index;
		if (slotIndex < 0 || slotIndex >= slots.length) return;
		slots[slotIndex] = {
			id: createProfileSlotId(),
			name: demo.name,
			values: {
				spectrumEnabled: true,
				spectrumMainVisible: true,
				...createDefaultSpectrumInstanceSettings(),
				...demo.values
			} as SpectrumProfileSettings
		};
	});
	return slots;
}

/**
 * Default slots for Spectrum 2's OWN profile list. Mirrors the Spectrum 1
 * defaults, but each demo look is written into the slot's `spectrumInstances[0]`
 * (the second-spectrum portion) so the Spectrum 2 editor — which reads/writes
 * only the instance portion — sees the demo presets instead of blank slots.
 */
export function createDefaultSpectrumSecondProfileSlots(): Array<
	ProfileSlot<SpectrumProfileSettings>
> {
	const slots = createEmptySlots<SpectrumProfileSettings>(
		'Spectrum',
		SPECTRUM_PROFILE_SLOT_COUNT
	);
	SPECTRUM_VISUAL_ACCENTS_DEMO_PROFILE_SLOTS.forEach((demo, index) => {
		const slotIndex =
			SPECTRUM_PROFILE_SLOT_COUNT -
			SPECTRUM_VISUAL_ACCENTS_DEMO_PROFILE_SLOTS.length +
			index;
		if (slotIndex < 0 || slotIndex >= slots.length) return;
		slots[slotIndex] = {
			id: createProfileSlotId(),
			name: demo.name,
			values: {
				spectrumEnabled: true,
				spectrumMainVisible: true,
				...createDefaultSpectrumInstanceSettings(),
				spectrumInstances: [
					{
						id: SECOND_SPECTRUM_INSTANCE_ID,
						enabled: true,
						...createDefaultSpectrumInstanceSettings(),
						...demo.values
					}
				]
			} as SpectrumProfileSettings
		};
	});
	return slots;
}

export function createDefaultBackgroundProfileSlots(): Array<
	ProfileSlot<BackgroundProfileSettings>
> {
	return createEmptySlots<BackgroundProfileSettings>(
		'BG',
		BACKGROUND_PROFILE_SLOT_COUNT
	);
}

export function createDefaultLogoProfileSlots(): Array<
	ProfileSlot<LogoProfileSettings>
> {
	return createEmptySlots<LogoProfileSettings>(
		'Logo',
		LOGO_PROFILE_SLOT_COUNT
	);
}

export function createDefaultParticlesProfileSlots(): Array<
	ProfileSlot<ParticlesProfileSettings>
> {
	return createEmptySlots<ParticlesProfileSettings>(
		'Particles',
		PARTICLES_PROFILE_SLOT_COUNT
	);
}

export function createDefaultRainProfileSlots(): Array<
	ProfileSlot<RainProfileSettings>
> {
	return createEmptySlots<RainProfileSettings>(
		'Rain',
		RAIN_PROFILE_SLOT_COUNT
	);
}

export function createDefaultLightsProfileSlots(): Array<
	ProfileSlot<LightsProfileSettings>
> {
	return createEmptySlots<LightsProfileSettings>(
		'Lights',
		LIGHTS_PROFILE_SLOT_COUNT
	);
}

export function createDefaultCameraFxProfileSlots(): Array<
	ProfileSlot<CameraFxProfileSettings>
> {
	return createEmptySlots<CameraFxProfileSettings>(
		'Camera',
		CAMERA_FX_PROFILE_SLOT_COUNT
	);
}

export function createDefaultLooksProfileSlots(): Array<
	ProfileSlot<LooksProfileSettings>
> {
	return createEmptySlots<LooksProfileSettings>(
		'Look',
		LOOKS_PROFILE_SLOT_COUNT
	);
}

export function createDefaultTrackTitleProfileSlots(): Array<
	ProfileSlot<TrackTitleProfileSettings>
> {
	return createEmptySlots<TrackTitleProfileSettings>(
		'Track Title',
		TRACK_TITLE_PROFILE_SLOT_COUNT
	);
}

export function extractBackgroundProfileSettings(
	state: WallpaperState
): BackgroundProfileSettings {
	return pickState(state, BACKGROUND_PROFILE_KEYS);
}

export function extractSpectrumProfileSettings(
	state: WallpaperState
): SpectrumProfileSettings {
	return pickState(state, SPECTRUM_PROFILE_KEYS);
}

export function extractLogoProfileSettings(
	state: WallpaperState
): LogoProfileSettings {
	return pickState(state, LOGO_PROFILE_KEYS);
}

export function extractParticlesProfileSettings(
	state: WallpaperState
): ParticlesProfileSettings {
	return pickState(state, PARTICLES_PROFILE_KEYS);
}

function inferDepthFlowSpawnOrigin(
	mode: WallpaperState['particleDepthFlowMode'],
	direction: WallpaperState['particleDepthFlowDirection']
): WallpaperState['particleDepthFlowSpawnOrigin'] {
	if (direction === 'awayFromViewer') {
		return 'randomScreen';
	}
	switch (mode) {
		case 'pushFromFocus':
			return 'fromFocus';
		case 'tunnelBurst':
			return 'fromCenter';
		case 'snowRush':
			return 'fromTop';
		case 'pullToCamera':
		default:
			return 'fromEdges';
	}
}

export function hydrateParticlesProfileValues(
	values: Partial<ParticlesProfileSettings>,
	defaults: ParticlesProfileSettings
): ParticlesProfileSettings {
	const resolvedMode =
		values.particleDepthFlowMode ?? defaults.particleDepthFlowMode;
	const hasSpawnOrigin = Object.prototype.hasOwnProperty.call(
		values,
		'particleDepthFlowSpawnOrigin'
	);
	const hasWindInfluence = Object.prototype.hasOwnProperty.call(
		values,
		'particleDepthFlowWindInfluence'
	);
	const resolvedDirection =
		values.particleDepthFlowDirection ??
		defaults.particleDepthFlowDirection;

	return {
		...defaults,
		...values,
		particleDepthFlowSpawnOrigin: hasSpawnOrigin
			? (values.particleDepthFlowSpawnOrigin ??
				defaults.particleDepthFlowSpawnOrigin)
			: inferDepthFlowSpawnOrigin(resolvedMode, resolvedDirection),
		particleDepthFlowWindInfluence: hasWindInfluence
			? (values.particleDepthFlowWindInfluence ??
				defaults.particleDepthFlowWindInfluence)
			: defaults.particleDepthFlowWindInfluence
	};
}

export function extractRainProfileSettings(
	state: WallpaperState
): RainProfileSettings {
	return pickState(state, RAIN_PROFILE_KEYS);
}

/**
 * A Looks slot is the WHOLE effect-layer stack, not the layer being edited.
 *
 * Saving only the active layer is what made slots feel like they forgot half
 * the composition: the other layers stayed as they were, so a slot saved while
 * editing the spectrum layer never brought the background treatment back. The
 * active layer's array entry is a stale snapshot by design, so it is refreshed
 * here before the array is copied — without that, the slot stores whatever the
 * layer looked like the last time the user switched away from it.
 */
export function extractLooksProfileSettings(
	state: WallpaperState
): LooksProfileSettings {
	return {
		...pickState(state, LOOKS_PROFILE_KEYS),
		effectLayers: syncActiveEffectLayer(state)
	};
}

/**
 * Slots saved before the stack existed carry only the flat `filter*` keys.
 * Those become a single layer holding exactly those values, which is what they
 * always meant — one treatment aimed at one set of targets.
 */
export function hydrateLooksProfileValues(
	values: Partial<LooksProfileSettings>,
	defaults: LooksProfileSettings
): LooksProfileSettings {
	const merged = pickState(
		{ ...defaults, ...values } as WallpaperState,
		LOOKS_PROFILE_KEYS
	);
	// Judge the SAVED values, not the merge: a pre-stack slot would otherwise
	// inherit whatever stack is on screen and apply its flat values to the
	// wrong layer — the exact bug this is here to close.
	const saved =
		Array.isArray(values.effectLayers) && values.effectLayers.length > 0
			? values.effectLayers
			: [];
	return normalizeLooksProfileStack({ ...merged, effectLayers: saved });
}

/**
 * Guarantees the invariant every consumer relies on: at least one layer, and
 * `activeEffectLayerId` naming one of them. A stack whose active id points
 * nowhere would leave `resolveFilterStack` reading the flat keys for a layer
 * that no longer exists.
 */
export function normalizeLooksProfileStack(
	values: LooksProfileSettings
): LooksProfileSettings {
	const layers =
		Array.isArray(values.effectLayers) && values.effectLayers.length > 0
			? values.effectLayers
			: [
					createDefaultEffectLayer(
						pickState(
							values as unknown as WallpaperState,
							FILTER_LOOK_PRESET_KEYS
						),
						values.filterTargets ?? [],
						// A pre-stack slot never recorded which factory look it
						// came from; loading it selects the slot itself.
						null
					)
				];
	const activeId = layers.some(
		layer => layer.id === values.activeEffectLayerId
	)
		? values.activeEffectLayerId
		: layers[0]!.id;
	return { ...values, effectLayers: layers, activeEffectLayerId: activeId };
}

export function extractLightsProfileSettings(
	state: WallpaperState
): LightsProfileSettings {
	return pickState(state, LIGHTS_PROFILE_KEYS);
}

export function extractCameraFxProfileSettings(
	state: WallpaperState
): CameraFxProfileSettings {
	return pickState(state, CAMERA_FX_PROFILE_KEYS);
}

export function extractTrackTitleProfileSettings(
	state: WallpaperState
): TrackTitleProfileSettings {
	const settings = pickState(state, TRACK_TITLE_PROFILE_KEYS);
	const activeTrack =
		state.audioTracks.find(
			track => track.id === state.activeAudioTrackId
		) ?? null;
	if (activeTrack) {
		settings.trackManualArtist =
			activeTrack.manualArtist ?? state.trackManualArtist;
		settings.trackManualTitle =
			activeTrack.manualTitle ?? state.trackManualTitle;
	}
	return settings;
}

export function buildParticlesProfileName(state: WallpaperState): string {
	const on = state.particlesEnabled ? 'on' : 'off';
	return `${state.particleShape} · ${state.particleCount} (${on})`;
}

export function buildRainProfileName(state: WallpaperState): string {
	const on = state.rainEnabled ? 'on' : 'off';
	return `${state.rainParticleType} · ${state.rainDropCount} (${on})`;
}

export function buildLightsProfileName(state: WallpaperState): string {
	const sl = state.stageLightsEnabled ? 'S' : 's';
	const fl = state.flashLightEnabled ? 'F' : 'f';
	return `${sl}${fl} · ${state.stageLightsMovementMode}`;
}

export function buildCameraFxProfileName(state: WallpaperState): string {
	const cm = state.cameraMotionEnabled ? 'M' : 'm';
	const cs = state.cameraShakeEnabled ? 'S' : 's';
	return `${cm}${cs} · ${state.cameraMotionMode}`;
}

export function buildLooksProfileName(state: WallpaperState): string {
	if (state.activeFilterLookId) return state.activeFilterLookId;
	return `Look b${state.filterBrightness.toFixed(2)} s${state.filterSaturation.toFixed(2)}`;
}

export function buildTrackTitleProfileName(state: WallpaperState): string {
	const tt = state.audioTrackTitleEnabled ? 'T' : 't';
	const tm = state.audioTrackTimeEnabled ? 'M' : 'm';
	const meta =
		state.trackMetadataMode === 'manual'
			? 'manual'
			: state.trackMetadataAutoSource;
	return `${tt}${tm} · ${state.nowPlayingMode} · ${meta}`;
}

/**
 * Structural equality for profile values. Profile snapshots are plain JSON-like
 * data (scalars, arrays, plain objects), and hydration rebuilds object/array
 * fields with fresh references on every save/load, so a reference (`===`) check
 * would never match keys like `spectrumInstances` or
 * `spectrumShockwaveBandThresholds`. For scalars this is identical to `===`, so
 * all-scalar feature profiles are unaffected.
 */
function profileValuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return a === b;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		return a.every((item, index) => profileValuesEqual(item, b[index]));
	}
	if (typeof a === 'object' && typeof b === 'object') {
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const aKeys = Object.keys(aObj);
		const bKeys = Object.keys(bObj);
		if (aKeys.length !== bKeys.length) return false;
		return aKeys.every(
			key =>
				Object.prototype.hasOwnProperty.call(bObj, key) &&
				profileValuesEqual(aObj[key], bObj[key])
		);
	}
	return false;
}

export function doProfileSettingsMatch<T extends object>(
	current: T,
	values: T | null
): boolean {
	if (!values) return false;
	return Object.entries(values as Record<string, unknown>).every(
		([key, value]) =>
			profileValuesEqual((current as Record<string, unknown>)[key], value)
	);
}

/**
 * Pure, reactive-friendly selector for the spectrum profile slot that currently
 * matches live state. Returns the matching slot index, or -1 when no slot
 * matches. Designed to be called inside a Zustand selector so the active-profile
 * indicator re-renders the moment any profile-relevant setting changes — never
 * read this off a stale `getState()` snapshot during render.
 */
export function selectSpectrumActiveProfileIndex(
	state: WallpaperState
): number {
	// Slots store hydrated/normalized settings (see `saveSpectrumProfileSlot`),
	// which snap some floats (e.g. 0.62→0.6) and rebuild instance objects. Hydrate
	// the live settings the same way so the comparison is normalized-vs-normalized
	// instead of raw-vs-normalized — otherwise the active indicator never matches.
	const current = hydrateSpectrumProfileValues(
		extractSpectrumProfileSettings(state)
	);
	return state.spectrumProfileSlots.findIndex(slot =>
		doProfileSettingsMatch(current, slot.values)
	);
}

export function normalizeProfileSlots<T>(
	slots: Array<ProfileSlot<T>> | undefined,
	fallbackFactory: () => Array<ProfileSlot<T>>,
	prefix: string,
	maxLimit = MAX_PROFILE_SLOT_COUNT
): Array<ProfileSlot<T>> {
	const fallback = fallbackFactory();
	const targetLength = Math.max(
		fallback.length,
		Math.min(slots?.length ?? fallback.length, maxLimit)
	);

	return Array.from({ length: targetLength }, (_, index) => {
		const candidate = slots?.[index];
		const fallbackSlot = fallback[index] ?? {
			id: createProfileSlotId(),
			name: `${prefix} ${index + 1}`,
			values: null
		};
		return {
			// Preserve the persisted id; pre-v104 slots have none — mint one so
			// every slot is referenceable. (The v104 migration converts old
			// index-based scene/per-image bindings against these same arrays.)
			id: candidate?.id || fallbackSlot.id,
			name: candidate?.name?.trim() || fallbackSlot.name,
			values: candidate?.values ?? null
		};
	});
}

export function buildSpectrumProfileName(state: WallpaperState): string {
	const modeLabel =
		state.spectrumMode === 'radial'
			? state.spectrumRadialShape.charAt(0).toUpperCase() +
				state.spectrumRadialShape.slice(1)
			: state.spectrumLinearOrientation === 'horizontal'
				? 'Horizontal'
				: 'Vertical';
	const styleShape = normalizeSpectrumShape(state.spectrumShape);
	const style = styleShape.charAt(0).toUpperCase() + styleShape.slice(1);
	return `${modeLabel} ${style}`;
}

export function buildBackgroundProfileName(state: WallpaperState): string {
	const channel =
		state.imageAudioChannel.charAt(0).toUpperCase() +
		state.imageAudioChannel.slice(1);
	return `${channel} ${state.imageBassScaleIntensity.toFixed(2)}x`;
}

export function buildLogoProfileName(state: WallpaperState): string {
	const band =
		state.logoBandMode.charAt(0).toUpperCase() +
		state.logoBandMode.slice(1);
	return `${band} ${state.logoMaxScale.toFixed(2)}x`;
}
