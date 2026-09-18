import type {
	ControllerLayer,
	OverlayLayer,
	SceneLayer,
	WallpaperLayer
} from '@/types/layers';
import type { WallpaperState } from '@/types/wallpaper';

function sortLayers<T extends WallpaperLayer>(layers: T[]): T[] {
	return [...layers].sort((a, b) => a.zIndex - b.zIndex);
}

function resolveZIndex(
	state: WallpaperState,
	id: keyof WallpaperState['layerZIndices'],
	fallback: number
): number {
	return state.layerZIndices[id] ?? fallback;
}

export function buildSceneLayers(state: WallpaperState): SceneLayer[] {
	return sortLayers([
		{
			id: 'background-image',
			type: 'background-image',
			kind: 'scene',
			enabled: state.backgroundImageEnabled,
			zIndex: resolveZIndex(state, 'background-image', 0),
			opacity: state.imageOpacity,
			positionX: state.imagePositionX,
			positionY: state.imagePositionY,
			scale: state.imageScale,
			rotation: state.imageRotation,
			blendMode: 'normal',
			locked: true,
			draggable: false,
			audioReactiveConfig: {
				enabled: state.imageBassReactive,
				sensitivity: state.imageBassScaleIntensity,
				channel: state.imageAudioChannel
			},
			imageUrl: state.imageUrl,
			fitMode: state.imageFitMode,
			keepCovered: !state.imageFramingManualEnabled,
			focusX: state.imageFocusX,
			focusY: state.imageFocusY,
			mirror: state.imageMirror,
			mirrorFill: state.imageMirrorFill,
			mirrorFillInvert: state.imageMirrorFillInvert,
			mirrorFillCount: state.imageMirrorFillCount,
			transitionType: state.slideshowTransitionType,
			transitionDuration: state.slideshowTransitionDuration,
			transitionIntensity: state.slideshowTransitionIntensity,
			transitionAudioDrive: state.slideshowTransitionAudioDrive
		},
		{
			id: 'particle-background',
			type: 'particle-background',
			kind: 'scene',
			enabled:
				state.particlesEnabled &&
				(state.particleLayerMode === 'background' ||
					state.particleLayerMode === 'both'),
			zIndex: resolveZIndex(state, 'particle-background', 10),
			opacity: state.particleOpacity,
			positionX: 0,
			positionY: 0,
			scale: 1,
			rotation: 0,
			blendMode: 'additive',
			locked: false,
			draggable: false,
			audioReactiveConfig: {
				enabled: state.particleAudioReactive,
				sensitivity: state.particleAudioSizeBoost,
				channel: state.particleAudioChannel
			},
			count: state.particleCount,
			shape: state.particleShape,
			layerMode: state.particleLayerMode
		},
		{
			id: 'rain',
			type: 'rain',
			kind: 'scene',
			enabled: state.rainEnabled && state.performanceMode !== 'low',
			zIndex: resolveZIndex(state, 'rain', 20),
			opacity: state.rainIntensity,
			positionX: 0,
			positionY: 0,
			scale: 1,
			rotation: state.rainMeshRotationZ,
			blendMode: 'screen',
			locked: false,
			draggable: false,
			particleType: state.rainParticleType,
			colorMode: state.rainColorMode
		},
		{
			id: 'particle-foreground',
			type: 'particle-foreground',
			kind: 'scene',
			enabled:
				state.particlesEnabled &&
				(state.particleLayerMode === 'foreground' ||
					state.particleLayerMode === 'both'),
			zIndex: resolveZIndex(state, 'particle-foreground', 30),
			opacity: state.particleOpacity,
			positionX: 0,
			positionY: 0,
			scale: 1,
			rotation: 0,
			blendMode: 'additive',
			locked: false,
			draggable: false,
			audioReactiveConfig: {
				enabled: state.particleAudioReactive,
				sensitivity: state.particleAudioOpacityBoost,
				channel: state.particleAudioChannel
			},
			count: state.particleCount,
			shape: state.particleShape,
			layerMode: state.particleLayerMode
		}
	]);
}

export function buildOverlayLayers(state: WallpaperState): OverlayLayer[] {
	return sortLayers([
		...state.overlays.map(overlay => ({
			id: overlay.id,
			type: 'overlay-image' as const,
			kind: 'overlay' as const,
			enabled: overlay.enabled,
			zIndex: overlay.zIndex,
			opacity: overlay.opacity,
			positionX: overlay.positionX,
			positionY: overlay.positionY,
			scale: overlay.scale,
			rotation: overlay.rotation,
			blendMode: overlay.blendMode,
			locked: false,
			draggable: true,
			assetId: overlay.assetId,
			imageUrl: overlay.url,
			name: overlay.name,
			cropShape: overlay.cropShape,
			edgeFade: overlay.edgeFade,
			edgeBlur: overlay.edgeBlur,
			edgeGlow: overlay.edgeGlow,
			width: overlay.width,
			height: overlay.height,
			audioOpacityReactive: overlay.audioOpacityReactive,
			audioOpacityAmount: overlay.audioOpacityAmount,
			audioOpacityInvert: overlay.audioOpacityInvert,
			audioOpacityChannel: overlay.audioOpacityChannel
		})),
		{
			id: 'logo',
			type: 'logo',
			kind: 'overlay',
			enabled: state.logoEnabled,
			// Logo must render above the spectrum (spectrum default = 70) so that
			// when spectrumFollowLogo places bars around the logo, the logo image
			// is not buried underneath them.
			zIndex: resolveZIndex(state, 'logo', 75),
			opacity: 1,
			positionX: state.logoPositionX,
			positionY: state.logoPositionY,
			scale: 1,
			rotation: 0,
			blendMode: 'normal',
			locked: false,
			draggable: false,
			audioReactiveConfig: {
				enabled: true,
				sensitivity: state.logoAudioSensitivity,
				channel: state.logoBandMode
			},
			imageUrl: state.logoUrl,
			baseSize: state.logoBaseSize,
			circularCrop: state.logoCircularCrop,
			cropRadius: state.logoCropRadius
		},
		{
			id: 'track-title',
			type: 'track-title',
			kind: 'overlay',
			enabled:
				state.nowPlayingMode === 'widget'
					? state.audioTrackTitleEnabled
					: state.audioTrackTitleEnabled ||
						state.audioTrackTimeEnabled,
			zIndex: resolveZIndex(state, 'track-title', 80),
			opacity: Math.max(
				state.audioTrackTitleOpacity,
				state.audioTrackTimeOpacity
			),
			positionX: state.audioTrackTitlePositionX,
			positionY: state.audioTrackTitlePositionY,
			scale: 1,
			rotation: 0,
			blendMode: 'normal',
			locked: false,
			draggable: false,
			maxWidthRatio: state.audioTrackTitleWidth,
			fontSize: Math.max(
				state.audioTrackTitleFontSize,
				state.audioTrackTimeFontSize
			),
			scrollSpeed: state.audioTrackTitleScrollSpeed
		},
		{
			id: 'lyrics',
			type: 'lyrics',
			kind: 'overlay',
			enabled: state.audioLyricsEnabled,
			zIndex: resolveZIndex(state, 'lyrics', 82),
			opacity: state.audioLyricsOpacity,
			positionX: state.audioLyricsPositionX,
			positionY: state.audioLyricsPositionY,
			scale: 1,
			rotation: 0,
			blendMode: 'normal',
			locked: false,
			draggable: false,
			maxWidthRatio: state.audioLyricsWidth,
			fontSize: state.audioLyricsFontSize,
			visibleLineCount: state.audioLyricsVisibleLineCount
		},
		{
			id: 'spectrum',
			type: 'spectrum',
			kind: 'overlay',
			enabled: state.spectrumEnabled,
			zIndex: resolveZIndex(state, 'spectrum', 70),
			opacity: state.spectrumOpacity,
			positionX: state.spectrumPositionX,
			positionY: state.spectrumPositionY,
			scale: 1,
			rotation: 0,
			blendMode: 'screen',
			locked: false,
			draggable: false,
			audioReactiveConfig: {
				enabled: true,
				sensitivity: 1,
				channel: state.spectrumBandMode
			},
			mode: state.spectrumMode,
			linearOrientation: state.spectrumLinearOrientation,
			radialShape: state.spectrumRadialShape,
			style: state.spectrumShape,
			followLogo:
				state.spectrumMode === 'radial' && state.spectrumFollowLogo
		}
	]);
}

export function getOverlayLayerById(
	state: WallpaperState,
	id: string
): OverlayLayer | null {
	const overlay = state.overlays.find(item => item.id === id);
	if (overlay) {
		return {
			id: overlay.id,
			type: 'overlay-image',
			kind: 'overlay',
			enabled: overlay.enabled,
			zIndex: overlay.zIndex,
			opacity: overlay.opacity,
			positionX: overlay.positionX,
			positionY: overlay.positionY,
			scale: overlay.scale,
			rotation: overlay.rotation,
			blendMode: overlay.blendMode,
			locked: false,
			draggable: true,
			assetId: overlay.assetId,
			imageUrl: overlay.url,
			name: overlay.name,
			cropShape: overlay.cropShape,
			edgeFade: overlay.edgeFade,
			edgeBlur: overlay.edgeBlur,
			edgeGlow: overlay.edgeGlow,
			width: overlay.width,
			height: overlay.height,
			audioOpacityReactive: overlay.audioOpacityReactive,
			audioOpacityAmount: overlay.audioOpacityAmount,
			audioOpacityInvert: overlay.audioOpacityInvert,
			audioOpacityChannel: overlay.audioOpacityChannel
		};
	}

	if (id === 'logo') {
		return {
			id: 'logo',
			type: 'logo',
			kind: 'overlay',
			enabled: state.logoEnabled,
			zIndex: resolveZIndex(state, 'logo', 75),
			opacity: 1,
			positionX: state.logoPositionX,
			positionY: state.logoPositionY,
			scale: 1,
			rotation: 0,
			blendMode: 'normal',
			locked: false,
			draggable: false,
			audioReactiveConfig: {
				enabled: true,
				sensitivity: state.logoAudioSensitivity,
				channel: state.logoBandMode
			},
			imageUrl: state.logoUrl,
			baseSize: state.logoBaseSize,
			circularCrop: state.logoCircularCrop,
			cropRadius: state.logoCropRadius
		};
	}

	if (id === 'track-title') {
		return {
			id: 'track-title',
			type: 'track-title',
			kind: 'overlay',
			enabled:
				state.nowPlayingMode === 'widget'
					? state.audioTrackTitleEnabled
					: state.audioTrackTitleEnabled ||
						state.audioTrackTimeEnabled,
			zIndex: resolveZIndex(state, 'track-title', 80),
			opacity: Math.max(
				state.audioTrackTitleOpacity,
				state.audioTrackTimeOpacity
			),
			positionX: state.audioTrackTitlePositionX,
			positionY: state.audioTrackTitlePositionY,
			scale: 1,
			rotation: 0,
			blendMode: 'normal',
			locked: false,
			draggable: false,
			maxWidthRatio: state.audioTrackTitleWidth,
			fontSize: Math.max(
				state.audioTrackTitleFontSize,
				state.audioTrackTimeFontSize
			),
			scrollSpeed: state.audioTrackTitleScrollSpeed
		};
	}

	if (id === 'lyrics') {
		return {
			id: 'lyrics',
			type: 'lyrics',
			kind: 'overlay',
			enabled: state.audioLyricsEnabled,
			zIndex: resolveZIndex(state, 'lyrics', 82),
			opacity: state.audioLyricsOpacity,
			positionX: state.audioLyricsPositionX,
			positionY: state.audioLyricsPositionY,
			scale: 1,
			rotation: 0,
			blendMode: 'normal',
			locked: false,
			draggable: false,
			maxWidthRatio: state.audioLyricsWidth,
			fontSize: state.audioLyricsFontSize,
			visibleLineCount: state.audioLyricsVisibleLineCount
		};
	}

	if (id === 'spectrum') {
		return {
			id: 'spectrum',
			type: 'spectrum',
			kind: 'overlay',
			enabled: state.spectrumEnabled,
			zIndex: resolveZIndex(state, 'spectrum', 70),
			opacity: state.spectrumOpacity,
			positionX: state.spectrumPositionX,
			positionY: state.spectrumPositionY,
			scale: 1,
			rotation: 0,
			blendMode: 'screen',
			locked: false,
			draggable: false,
			audioReactiveConfig: {
				enabled: true,
				sensitivity: 1,
				channel: state.spectrumBandMode
			},
			mode: state.spectrumMode,
			linearOrientation: state.spectrumLinearOrientation,
			radialShape: state.spectrumRadialShape,
			style: state.spectrumShape,
			followLogo:
				state.spectrumMode === 'radial' && state.spectrumFollowLogo
		};
	}

	return null;
}

export function buildControllerLayers(
	state: WallpaperState
): ControllerLayer[] {
	return sortLayers([
		{
			id: 'slideshow',
			type: 'slideshow',
			kind: 'controller',
			enabled:
				state.slideshowEnabled && state.backgroundImages.length > 1,
			zIndex: resolveZIndex(state, 'slideshow', 5),
			opacity: 1,
			positionX: 0,
			positionY: 0,
			scale: 1,
			rotation: 0,
			blendMode: 'normal',
			locked: false,
			draggable: false,
			interval: state.slideshowInterval,
			transitionDuration: state.slideshowTransitionDuration,
			imageCount: state.backgroundImages.length
		}
	]);
}
