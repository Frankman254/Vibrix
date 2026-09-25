import { DEFAULT_STATE } from '@/store/defaultState';
import type { BackgroundImageItem, WallpaperState } from '@/types/wallpaper';

export type BackgroundImageLayout = Pick<
	BackgroundImageItem,
	| 'scale'
	| 'positionX'
	| 'positionY'
	| 'focusX'
	| 'focusY'
	| 'fitMode'
	| 'mirrorFill'
	| 'mirrorFillInvert'
	| 'mirrorFillCount'
>;
export type BackgroundImageSettings = Pick<
	BackgroundImageItem,
	| 'enabled'
	| 'originalFileName'
	| 'scale'
	| 'positionX'
	| 'positionY'
	| 'focusX'
	| 'focusY'
	| 'rotation'
	| 'fitMode'
	| 'mirror'
	| 'mirrorFill'
	| 'mirrorFillInvert'
	| 'mirrorFillCount'
	| 'opacity'
	| 'bassReactive'
	| 'bassIntensity'
	| 'audioReactiveDecay'
	| 'audioChannel'
	| 'transitionType'
	| 'transitionDuration'
	| 'transitionIntensity'
	| 'transitionAudioDrive'
	| 'transitionAudioChannel'
	| 'transitionPresetId'
	| 'logoProfileSlotId'
	| 'spectrumProfileSlotId'
	| 'particlesProfileSlotId'
	| 'rainProfileSlotId'
	| 'looksProfileSlotId'
	| 'logoOverride'
	| 'spectrumOverride'
	| 'particlesOverride'
	| 'rainOverride'
	| 'looksOverride'
	| 'cameraFxOverride'
	| 'lightsOverride'
	| 'trackTitleOverride'
	| 'playbackSwitchAt'
	| 'sceneSlotId'
>;

export function getDefaultBackgroundImageSettings(): BackgroundImageSettings {
	return {
		enabled: true,
		originalFileName: null,
		scale: DEFAULT_STATE.imageScale,
		positionX: DEFAULT_STATE.imagePositionX,
		positionY: DEFAULT_STATE.imagePositionY,
		focusX: DEFAULT_STATE.imageFocusX,
		focusY: DEFAULT_STATE.imageFocusY,
		rotation: 0,
		fitMode: DEFAULT_STATE.imageFitMode,
		mirror: DEFAULT_STATE.imageMirror,
		mirrorFill: DEFAULT_STATE.imageMirrorFill,
		mirrorFillInvert: DEFAULT_STATE.imageMirrorFillInvert,
		mirrorFillCount: DEFAULT_STATE.imageMirrorFillCount,
		opacity: DEFAULT_STATE.imageOpacity,
		bassReactive: DEFAULT_STATE.imageBassReactive,
		bassIntensity: DEFAULT_STATE.imageBassScaleIntensity,
		audioReactiveDecay: DEFAULT_STATE.imageAudioReactiveDecay,
		audioChannel: DEFAULT_STATE.imageAudioChannel,
		transitionType: DEFAULT_STATE.slideshowTransitionType,
		transitionDuration: DEFAULT_STATE.slideshowTransitionDuration,
		transitionIntensity: DEFAULT_STATE.slideshowTransitionIntensity,
		transitionAudioDrive: DEFAULT_STATE.slideshowTransitionAudioDrive,
		transitionAudioChannel: DEFAULT_STATE.slideshowTransitionAudioChannel,
		transitionPresetId: null,
		logoProfileSlotId: null,
		spectrumProfileSlotId: null,
		particlesProfileSlotId: null,
		rainProfileSlotId: null,
		looksProfileSlotId: null,
		logoOverride: null,
		spectrumOverride: null,
		particlesOverride: null,
		rainOverride: null,
		looksOverride: null,
		cameraFxOverride: null,
		lightsOverride: null,
		trackTitleOverride: null,
		playbackSwitchAt: null,
		sceneSlotId: null
	};
}

export function getDefaultBackgroundImageLayout(): BackgroundImageLayout {
	const defaults = getDefaultBackgroundImageSettings();
	return {
		scale: defaults.scale,
		positionX: defaults.positionX,
		positionY: defaults.positionY,
		focusX: defaults.focusX,
		focusY: defaults.focusY,
		fitMode: defaults.fitMode,
		mirrorFill: defaults.mirrorFill,
		mirrorFillInvert: defaults.mirrorFillInvert,
		mirrorFillCount: defaults.mirrorFillCount
	};
}

export function createBackgroundImageItem(
	assetId: string,
	url: string | null,
	thumbnailUrl: string | null = null,
	settings: Partial<BackgroundImageSettings> = {}
): BackgroundImageItem {
	const defaults = getDefaultBackgroundImageSettings();
	return {
		assetId,
		url,
		thumbnailUrl,
		originalFileName:
			settings.originalFileName ?? defaults.originalFileName,
		enabled: settings.enabled ?? defaults.enabled,
		scale: settings.scale ?? defaults.scale,
		positionX: settings.positionX ?? defaults.positionX,
		positionY: settings.positionY ?? defaults.positionY,
		focusX: settings.focusX ?? defaults.focusX,
		focusY: settings.focusY ?? defaults.focusY,
		rotation: settings.rotation ?? defaults.rotation,
		fitMode: settings.fitMode ?? defaults.fitMode,
		// Never hand-framed; provenance flag, deliberately not part of
		// importable settings.
		coverageFramingEdited: false,
		mirror: settings.mirror ?? defaults.mirror,
		mirrorFill: settings.mirrorFill ?? defaults.mirrorFill,
		mirrorFillInvert:
			settings.mirrorFillInvert ?? defaults.mirrorFillInvert,
		mirrorFillCount: settings.mirrorFillCount ?? defaults.mirrorFillCount,
		opacity: settings.opacity ?? defaults.opacity,
		bassReactive: settings.bassReactive ?? defaults.bassReactive,
		bassIntensity: settings.bassIntensity ?? defaults.bassIntensity,
		audioReactiveDecay:
			settings.audioReactiveDecay ?? defaults.audioReactiveDecay,
		audioChannel: settings.audioChannel ?? defaults.audioChannel,
		transitionType: settings.transitionType ?? defaults.transitionType,
		transitionDuration:
			settings.transitionDuration ?? defaults.transitionDuration,
		transitionIntensity:
			settings.transitionIntensity ?? defaults.transitionIntensity,
		transitionAudioDrive:
			settings.transitionAudioDrive ?? defaults.transitionAudioDrive,
		transitionAudioChannel:
			settings.transitionAudioChannel ?? defaults.transitionAudioChannel,
		transitionPresetId:
			settings.transitionPresetId ?? defaults.transitionPresetId,
		logoProfileSlotId:
			settings.logoProfileSlotId ?? defaults.logoProfileSlotId,
		spectrumProfileSlotId:
			settings.spectrumProfileSlotId ?? defaults.spectrumProfileSlotId,
		particlesProfileSlotId:
			settings.particlesProfileSlotId ?? defaults.particlesProfileSlotId,
		rainProfileSlotId:
			settings.rainProfileSlotId ?? defaults.rainProfileSlotId,
		looksProfileSlotId:
			settings.looksProfileSlotId ?? defaults.looksProfileSlotId,
		logoOverride: settings.logoOverride ?? defaults.logoOverride,
		spectrumOverride:
			settings.spectrumOverride ?? defaults.spectrumOverride,
		particlesOverride:
			settings.particlesOverride ?? defaults.particlesOverride,
		rainOverride: settings.rainOverride ?? defaults.rainOverride,
		looksOverride: settings.looksOverride ?? defaults.looksOverride,
		cameraFxOverride:
			settings.cameraFxOverride ?? defaults.cameraFxOverride,
		lightsOverride: settings.lightsOverride ?? defaults.lightsOverride,
		trackTitleOverride:
			settings.trackTitleOverride ?? defaults.trackTitleOverride,
		playbackSwitchAt:
			settings.playbackSwitchAt ?? defaults.playbackSwitchAt,
		sceneSlotId: settings.sceneSlotId ?? defaults.sceneSlotId ?? null
	};
}

export function getBackgroundImageRuntimePatch(
	image: BackgroundImageItem | null
): Pick<
	WallpaperState,
	| 'imageUrl'
	| 'imageScale'
	| 'imagePositionX'
	| 'imagePositionY'
	| 'imageFocusX'
	| 'imageFocusY'
	| 'imageOpacity'
	| 'imageBassReactive'
	| 'imageBassScaleIntensity'
	| 'imageAudioReactiveDecay'
	| 'imageAudioChannel'
	| 'imageFitMode'
	| 'imageMirror'
	| 'imageMirrorFill'
	| 'imageMirrorFillInvert'
	| 'imageMirrorFillCount'
	| 'imageRotation'
	| 'slideshowTransitionType'
	| 'slideshowTransitionDuration'
	| 'slideshowTransitionIntensity'
	| 'slideshowTransitionAudioDrive'
	| 'slideshowTransitionAudioChannel'
> {
	return {
		imageUrl: image?.url ?? null,
		imageScale: image?.scale ?? DEFAULT_STATE.imageScale,
		imagePositionX: image?.positionX ?? DEFAULT_STATE.imagePositionX,
		imagePositionY: image?.positionY ?? DEFAULT_STATE.imagePositionY,
		imageFocusX: image?.focusX ?? DEFAULT_STATE.imageFocusX,
		imageFocusY: image?.focusY ?? DEFAULT_STATE.imageFocusY,
		imageOpacity: image?.opacity ?? DEFAULT_STATE.imageOpacity,
		imageBassReactive:
			image?.bassReactive ?? DEFAULT_STATE.imageBassReactive,
		imageBassScaleIntensity:
			image?.bassIntensity ?? DEFAULT_STATE.imageBassScaleIntensity,
		imageAudioReactiveDecay:
			image?.audioReactiveDecay ?? DEFAULT_STATE.imageAudioReactiveDecay,
		imageAudioChannel:
			image?.audioChannel ?? DEFAULT_STATE.imageAudioChannel,
		imageFitMode: image?.fitMode ?? DEFAULT_STATE.imageFitMode,
		imageMirror: image?.mirror ?? DEFAULT_STATE.imageMirror,
		imageMirrorFill: image?.mirrorFill ?? DEFAULT_STATE.imageMirrorFill,
		imageMirrorFillInvert:
			image?.mirrorFillInvert ?? DEFAULT_STATE.imageMirrorFillInvert,
		imageMirrorFillCount:
			image?.mirrorFillCount ?? DEFAULT_STATE.imageMirrorFillCount,
		imageRotation: image?.rotation ?? DEFAULT_STATE.imageRotation,
		slideshowTransitionType:
			image?.transitionType ?? DEFAULT_STATE.slideshowTransitionType,
		slideshowTransitionDuration:
			image?.transitionDuration ??
			DEFAULT_STATE.slideshowTransitionDuration,
		slideshowTransitionIntensity:
			image?.transitionIntensity ??
			DEFAULT_STATE.slideshowTransitionIntensity,
		slideshowTransitionAudioDrive:
			image?.transitionAudioDrive ??
			DEFAULT_STATE.slideshowTransitionAudioDrive,
		slideshowTransitionAudioChannel:
			image?.transitionAudioChannel ??
			DEFAULT_STATE.slideshowTransitionAudioChannel
	};
}

export function isBackgroundImageUsingDefaultLayout(
	image: BackgroundImageItem
): boolean {
	const defaults = getDefaultBackgroundImageSettings();
	return (
		image.scale === defaults.scale &&
		image.positionX === defaults.positionX &&
		image.positionY === defaults.positionY &&
		image.focusX === defaults.focusX &&
		image.focusY === defaults.focusY &&
		image.fitMode === defaults.fitMode &&
		image.rotation === defaults.rotation
	);
}
