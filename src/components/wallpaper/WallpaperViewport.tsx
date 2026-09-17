import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { buildOverlayLayers, buildSceneLayers } from '@/lib/layers';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { SlideshowManager } from '@/features/background/ui';
import {
	CameraFxStage,
	FlashLightCanvas,
	StageLightsCanvas
} from '@/features/stageFx/ui';
import OverlayInteractionStage from '@/components/wallpaper/OverlayInteractionStage';
import SceneLayerCanvas from '@/components/wallpaper/layers/SceneLayerCanvas';
import BackgroundImageLayerView from '@/components/wallpaper/layers/BackgroundImageLayerView';
import OverlayImageLayerView from '@/components/wallpaper/layers/OverlayImageLayerView';
import AudioLayerCanvas from '@/components/audio/layers/AudioLayerCanvas';
import GlobalBackgroundView from '@/components/wallpaper/GlobalBackgroundView';
import FirstRunEmptyState from '@/components/wallpaper/FirstRunEmptyState';

import CanvasFpsOverlay from '@/components/wallpaper/CanvasFpsOverlay';
import DiagnosticsHudStack from '@/components/wallpaper/DiagnosticsHudStack';
import QuickActionsPanel from '@/components/wallpaper/QuickActionsPanel';
import DragInteractionLayer from '@/components/wallpaper/DragInteractionLayer';
import { SpectrumManualKeyboardGate } from '@/features/spectrum/ui';
import type { WallpaperState } from '@/types/wallpaper';
import type { OverlayLayer } from '@/types/layers';

function isAudioOverlayLayer(
	layer: OverlayLayer
): layer is Extract<
	OverlayLayer,
	{ type: 'logo' | 'spectrum' | 'track-title' | 'lyrics' }
> {
	return (
		layer.type === 'logo' ||
		layer.type === 'spectrum' ||
		layer.type === 'track-title' ||
		layer.type === 'lyrics'
	);
}

export default function WallpaperViewport({
	editorMode = false,
	outputMode = false,
	interactionVisible = false,
	sceneVisible = true
}: {
	editorMode?: boolean;
	outputMode?: boolean;
	interactionVisible?: boolean;
	sceneVisible?: boolean;
}) {
	const showEditorChrome = editorMode && !outputMode;
	const stageLightsEnabled = useWallpaperStore(s => s.stageLightsEnabled);
	const flashLightEnabled = useWallpaperStore(s => s.flashLightEnabled);
	const sceneLayerState = useWallpaperStore(
		useShallow(
			state =>
				({
					backgroundImageEnabled: state.backgroundImageEnabled,
					imageOpacity: state.imageOpacity,
					imagePositionX: state.imagePositionX,
					imagePositionY: state.imagePositionY,
					imageFocusX: state.imageFocusX,
					imageFocusY: state.imageFocusY,
					imageScale: state.imageScale,
					imageBassReactive: state.imageBassReactive,
					imageBassScaleIntensity: state.imageBassScaleIntensity,
					imageAudioChannel: state.imageAudioChannel,
					imageUrl: state.imageUrl,
					imageFitMode: state.imageFitMode,
					imageMirror: state.imageMirror,
					imageMirrorFill: state.imageMirrorFill,
					imageMirrorFillInvert: state.imageMirrorFillInvert,
					imageRotation: state.imageRotation,
					slideshowTransitionType: state.slideshowTransitionType,
					slideshowTransitionDuration:
						state.slideshowTransitionDuration,
					slideshowTransitionIntensity:
						state.slideshowTransitionIntensity,
					slideshowTransitionAudioDrive:
						state.slideshowTransitionAudioDrive,
					particlesEnabled: state.particlesEnabled,
					particleLayerMode: state.particleLayerMode,
					particleOpacity: state.particleOpacity,
					particleAudioReactive: state.particleAudioReactive,
					particleAudioSizeBoost: state.particleAudioSizeBoost,
					particleAudioOpacityBoost: state.particleAudioOpacityBoost,
					particleAudioChannel: state.particleAudioChannel,
					particleCount: state.particleCount,
					particleShape: state.particleShape,
					rainEnabled: state.rainEnabled,
					performanceMode: state.performanceMode,
					rainIntensity: state.rainIntensity,
					rainMeshRotationZ: state.rainMeshRotationZ,
					rainParticleType: state.rainParticleType,
					rainColorMode: state.rainColorMode,
					layerZIndices: state.layerZIndices
				}) satisfies Partial<WallpaperState>
		)
	);
	const overlayLayerState = useWallpaperStore(
		useShallow(
			state =>
				({
					overlays: state.overlays,
					layerZIndices: state.layerZIndices,
					logoEnabled: state.logoEnabled,
					logoPositionX: state.logoPositionX,
					logoPositionY: state.logoPositionY,
					logoAudioSensitivity: state.logoAudioSensitivity,
					logoBandMode: state.logoBandMode,
					logoUrl: state.logoUrl,
					logoBaseSize: state.logoBaseSize,
					logoCircularCrop: state.logoCircularCrop,
					logoCropRadius: state.logoCropRadius,
					audioTrackTitleEnabled: state.audioTrackTitleEnabled,
					audioTrackTimeEnabled: state.audioTrackTimeEnabled,
					audioTrackTitleOpacity: state.audioTrackTitleOpacity,
					audioTrackTimeOpacity: state.audioTrackTimeOpacity,
					audioTrackTitlePositionX: state.audioTrackTitlePositionX,
					audioTrackTitlePositionY: state.audioTrackTitlePositionY,
					audioTrackTitleWidth: state.audioTrackTitleWidth,
					audioTrackTitleFontSize: state.audioTrackTitleFontSize,
					audioTrackTimeFontSize: state.audioTrackTimeFontSize,
					audioTrackTitleScrollSpeed:
						state.audioTrackTitleScrollSpeed,
					audioLyricsEnabled: state.audioLyricsEnabled,
					audioLyricsPositionX: state.audioLyricsPositionX,
					audioLyricsPositionY: state.audioLyricsPositionY,
					audioLyricsWidth: state.audioLyricsWidth,
					audioLyricsFontSize: state.audioLyricsFontSize,
					audioLyricsOpacity: state.audioLyricsOpacity,
					audioLyricsVisibleLineCount:
						state.audioLyricsVisibleLineCount,
					spectrumEnabled: state.spectrumEnabled,
					spectrumMainVisible: state.spectrumMainVisible,
					spectrumInstances: state.spectrumInstances,
					spectrumFamily: state.spectrumFamily,
					spectrumOpacity: state.spectrumOpacity,
					spectrumPositionX: state.spectrumPositionX,
					spectrumPositionY: state.spectrumPositionY,
					spectrumMode: state.spectrumMode,
					spectrumLinearOrientation: state.spectrumLinearOrientation,
					spectrumRadialShape: state.spectrumRadialShape,
					spectrumShape: state.spectrumShape,
					spectrumPixelate: state.spectrumPixelate,
					spectrumLiquidLayer1Pixelate:
						state.spectrumLiquidLayer1Pixelate,
					spectrumLiquidLayer2Pixelate:
						state.spectrumLiquidLayer2Pixelate,
					spectrumLiquidLayer3Pixelate:
						state.spectrumLiquidLayer3Pixelate,
					spectrumFollowLogo: state.spectrumFollowLogo,
					spectrumBandMode: state.spectrumBandMode
				}) satisfies Partial<WallpaperState>
		)
	);

	const sceneLayers = useMemo(
		() => buildSceneLayers(sceneLayerState as WallpaperState),
		[sceneLayerState]
	);
	const overlayLayers = useMemo(
		() => buildOverlayLayers(overlayLayerState as WallpaperState),
		[overlayLayerState]
	);
	const audioLayers = useMemo(
		() =>
			overlayLayers
				.filter(isAudioOverlayLayer)
				.filter(layer => layer.enabled),
		[overlayLayers]
	);
	const renderableLayers = useMemo(
		() =>
			[...sceneLayers, ...overlayLayers]
				.filter(
					layer =>
						layer.type !== 'logo' &&
						layer.type !== 'spectrum' &&
						layer.type !== 'track-title' &&
						layer.type !== 'lyrics'
				)
				.sort((a, b) => a.zIndex - b.zIndex),
		[overlayLayers, sceneLayers]
	);

	if (!sceneVisible) {
		return null;
	}

	return (
		<>
			<SpectrumManualKeyboardGate enabled={showEditorChrome} />
			<SlideshowManager />
			<main
				style={{
					position: 'fixed',
					inset: 0,
					overflow: 'hidden',
					isolation: 'isolate'
				}}
			>
				{/* Camera FX wraps ONLY the wallpaper visual layers — the HUD /
				    editor below stay outside so they never shake. */}
				<CameraFxStage>
					<GlobalBackgroundView />
					{stageLightsEnabled && <StageLightsCanvas zIndex={1} />}
					{renderableLayers.map(layer => {
						if (!layer.enabled) return null;

						if (
							layer.type === 'background-image' &&
							layer.imageUrl
						) {
							return (
								<BackgroundImageLayerView
									key={layer.id}
									layer={layer}
								/>
							);
						}

						if (layer.type === 'overlay-image') {
							return (
								<OverlayImageLayerView
									key={layer.id}
									layer={layer}
								/>
							);
						}

						return (
							<SceneLayerCanvas key={layer.id} layer={layer} />
						);
					})}
					{audioLayers.map(layer => (
						<AudioLayerCanvas key={layer.id} layer={layer} />
					))}
					{flashLightEnabled && <FlashLightCanvas zIndex={90} />}
				</CameraFxStage>

				{showEditorChrome && <FirstRunEmptyState />}
				{/* Inside <main> on purpose: this element has `isolation:
				    isolate`, so anything mounted as a sibling of the viewport
				    paints above the WHOLE subtree no matter its z-index. Drag
				    capture lived out there and swallowed every HUD click. */}
				{showEditorChrome && <DragInteractionLayer />}
				{showEditorChrome && (
					<OverlayInteractionStage visible={interactionVisible} />
				)}
				{!outputMode ? (
					<>
						<DiagnosticsHudStack />
						<CanvasFpsOverlay />
						<QuickActionsPanel />
					</>
				) : null}
			</main>
		</>
	);
}
