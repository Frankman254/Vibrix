import { useCallback, useMemo, useRef } from 'react';
import {
	Maximize2,
	Minimize2,
	Monitor,
	Move,
	Layers,
	Palette,
	AudioWaveform,
	Circle,
	Sparkles,
	Music2,
	Type as TypeIcon,
	Image as ImageIcon,
	Cpu,
	ImageDown,
	Grid3x3,
	FileText,
	SlidersHorizontal,
	MousePointer
} from 'lucide-react';
import { useT } from '@/lib/i18n';
import { APP_NAME } from '@/config/brand';
import {
	doProfileSettingsMatch,
	extractCameraFxProfileSettings,
	extractLightsProfileSettings,
	extractLooksProfileSettings,
	extractLogoProfileSettings,
	extractParticlesProfileSettings,
	extractRainProfileSettings,
	extractTrackTitleProfileSettings
} from '@/store/featureProfiles';
import {
	isSpectrumSlotActiveForTarget,
	selectSpectrumActiveProfileIndexForTarget
} from '@/features/spectrum';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { filterImageIdsBySetlist } from '@/store/slices/setlistsSlice';
import type { QuickActionsState } from '@/components/wallpaper/quickActions/useQuickActionsState';
import type { ExpandPanel } from '@/components/wallpaper/quickActions/quickActionsShared';
import { resolveSharedColorSource } from '@/editor/colorSourceUtils';
import type { ActiveTool, ColorSourceMode } from '@/types/wallpaper';
import {
	buildFilterLookCatalog,
	findFilterLookCatalogIndex,
	fromFilterLookSlotSelectionId
} from '@/features/filterLooks/filterLooks';
import type { SubsystemCarouselNav } from '@/components/controls/mediaDock/types';
import type { QuickActionButtonProps } from '@/components/wallpaper/quickActions/QuickActionButton';
import { isBuiltInAppLogoUrl } from '@/config/appLogo';
import { useDialog } from '@/editor/DialogProvider';

/**
 * What drag mode can actually move. Mirrors `DRAG_TARGETS` in
 * `DragInteractionLayer`, plus `hud` (which the HUD drags itself).
 */
const DRAG_TOOL_ITEMS: ReadonlyArray<{
	id: ActiveTool;
	label: string;
	icon: React.ReactNode;
}> = [
	{
		id: 'logo',
		label: 'Logo',
		icon: <ImageIcon size={11} strokeWidth={2.25} />
	},
	{
		id: 'spectrum',
		label: 'Spec',
		icon: <AudioWaveform size={11} strokeWidth={2.25} />
	},
	{
		id: 'track-title',
		label: 'Track',
		icon: <TypeIcon size={11} strokeWidth={2.25} />
	},
	{
		id: 'lyrics',
		label: 'Lyrics',
		icon: <FileText size={11} strokeWidth={2.25} />
	},
	{
		id: 'hud',
		label: 'HUD',
		icon: <SlidersHorizontal size={11} strokeWidth={2.25} />
	}
];

export type QuickColorSourceShortcut = {
	value: ColorSourceMode | null;
	onChange: (value: ColorSourceMode) => void;
};
import {
	buildLayerActions,
	buildLooksActions,
	buildSpectrumActions,
	buildMotionActions,
	buildAudioActions,
	buildLogoActions,
	buildTitleActions,
	buildSystemActions,
	buildThemeActions
} from '@/components/wallpaper/quickActions/quickActionConfigs';

type QuickActionsAudioControls = {
	captureMode: 'none' | 'desktop' | 'microphone' | 'file';
	isPaused: boolean;
	pauseCapture: () => void;
	resumeCapture: () => void;
	pauseFileForSystem: () => void;
	resumeFileFromSystem: () => void;
	playNextTrack: () => void | Promise<void>;
	playPrevTrack: () => void | Promise<void>;
	getFileName: () => string;
};

type UseQuickActionsViewModelOptions = {
	state: QuickActionsState;
	t: ReturnType<typeof useT>;
	audio: QuickActionsAudioControls;
	expandPanel: ExpandPanel;
	toggleExpand: (panel: Exclude<ExpandPanel, null>) => void;
	isFullscreen: boolean;
	fullscreenSupported: boolean;
	toggleFullscreen: () => void | Promise<void>;
	goPresentation: () => void;
};

export function useQuickActionsViewModel({
	state,
	t,
	audio,
	expandPanel,
	toggleExpand,
	isFullscreen,
	fullscreenSupported,
	toggleFullscreen,
	goPresentation
}: UseQuickActionsViewModelOptions) {
	const fullStore = useWallpaperStore();
	const { confirm } = useDialog();
	// Visible pool — respects the active setlist. The label / index shown
	// in the quick actions HUD reflects the curated set when one is active.
	const visibleImages = useMemo(
		() =>
			filterImageIdsBySetlist(
				state.backgroundImages,
				state.setlists,
				state.activeSetlistId
			),
		[state.backgroundImages, state.setlists, state.activeSetlistId]
	);
	const imageIndex = useMemo(
		() =>
			visibleImages.findIndex(
				image => image.assetId === state.activeImageId
			),
		[visibleImages, state.activeImageId]
	);

	const activeTrack = useMemo(
		() =>
			state.audioTracks.find(
				track => track.id === state.activeAudioTrackId
			) ?? null,
		[state]
	);

	const enabledTracksCount = useMemo(
		() => state.audioTracks.filter(track => track.enabled).length,
		[state]
	);

	const isFileMode = audio.captureMode === 'file';
	const trackLabel = useMemo(() => {
		if (audio.captureMode === 'microphone') return 'MICROPHONE';
		if (audio.captureMode === 'desktop') return 'LIVE INPUT';
		const runtimeName = audio.getFileName().trim();
		const raw = runtimeName || activeTrack?.name?.trim() || '';
		if (!raw) return `${APP_NAME} Mix`;
		// Strip file extension (.mp3/.wav/.flac/…) for display only.
		return raw.replace(/\.[^/.]+$/, '');
	}, [activeTrack?.name, audio]);
	const statusLabel = audio.captureMode === 'file' ? 'FILE' : 'LIVE';
	const imageLabel =
		visibleImages.length > 0
			? `${Math.max(1, imageIndex + 1)}/${visibleImages.length}`
			: '0/0';
	const isPanelExpanded = useCallback(
		(...panels: Exclude<ExpandPanel, null>[]) =>
			expandPanel !== null && panels.includes(expandPanel),
		[expandPanel]
	);
	const activeLooksSlotIndex = useMemo(() => {
		// The explicit selection wins. The value diff stays as the fallback for
		// a look the user has since nudged by hand, where nothing is formally
		// selected any more but the slot is still what is on screen.
		const selectedId = fromFilterLookSlotSelectionId(
			fullStore.activeFilterLookId
		);
		if (selectedId !== null) {
			const bySelection = fullStore.looksProfileSlots.findIndex(
				slot => slot.id === selectedId
			);
			if (bySelection >= 0) return bySelection;
		}
		const current = extractLooksProfileSettings(fullStore);
		return fullStore.looksProfileSlots.findIndex(slot =>
			doProfileSettingsMatch(current, slot.values)
		);
	}, [fullStore]);
	const activeSpectrumSlotIndex = useMemo(
		() =>
			selectSpectrumActiveProfileIndexForTarget(
				fullStore,
				fullStore.activeSpectrumTarget
			),
		[fullStore]
	);
	const activeParticlesSlotIndex = useMemo(() => {
		const current = extractParticlesProfileSettings(fullStore);
		return fullStore.particlesProfileSlots.findIndex(slot =>
			doProfileSettingsMatch(current, slot.values)
		);
	}, [fullStore]);
	const activeRainSlotIndex = useMemo(() => {
		const current = extractRainProfileSettings(fullStore);
		return fullStore.rainProfileSlots.findIndex(slot =>
			doProfileSettingsMatch(current, slot.values)
		);
	}, [fullStore]);
	const activeLightsSlotIndex = useMemo(() => {
		const current = extractLightsProfileSettings(fullStore);
		return fullStore.lightsProfileSlots.findIndex(slot =>
			doProfileSettingsMatch(current, slot.values)
		);
	}, [fullStore]);
	const activeCameraSlotIndex = useMemo(() => {
		const current = extractCameraFxProfileSettings(fullStore);
		return fullStore.cameraFxProfileSlots.findIndex(slot =>
			doProfileSettingsMatch(current, slot.values)
		);
	}, [fullStore]);
	const activeLogoSlotIndex = useMemo(() => {
		const current = extractLogoProfileSettings(fullStore);
		return fullStore.logoProfileSlots.findIndex(slot =>
			doProfileSettingsMatch(current, slot.values)
		);
	}, [fullStore]);
	const activeTitleSlotIndex = useMemo(() => {
		const current = extractTrackTitleProfileSettings(fullStore);
		return fullStore.trackTitleProfileSlots.findIndex(slot =>
			doProfileSettingsMatch(current, slot.values)
		);
	}, [fullStore]);

	const handleAudioToggle = useCallback(() => {
		if (audio.captureMode === 'file') {
			if (audio.isPaused) audio.resumeFileFromSystem();
			else audio.pauseFileForSystem();
			return;
		}
		if (audio.isPaused) audio.resumeCapture();
		else audio.pauseCapture();
	}, [audio]);

	const moveImage = useCallback(
		(direction: -1 | 1) => {
			// Same pool as the slideshow — enabled images with a valid URL,
			// filtered to the active setlist when one is set.
			const visible = filterImageIdsBySetlist(
				state.backgroundImages.filter(
					img => Boolean(img.url) && img.enabled !== false
				),
				state.setlists,
				state.activeSetlistId
			);
			if (!visible.length) return;
			const currentIndex = Math.max(
				0,
				visible.findIndex(img => img.assetId === state.activeImageId)
			);
			const nextIndex =
				(currentIndex + direction + visible.length) % visible.length;
			state.setActiveImageId(visible[nextIndex]?.assetId ?? null);
		},
		[state]
	);

	const setParticleLayerEnabled = useCallback(
		(target: 'background' | 'foreground', enabled: boolean) => {
			if (target === 'background') {
				if (enabled) {
					state.setParticlesEnabled(true);
					if (state.particleLayerMode === 'foreground') {
						state.setParticleLayerMode('both');
					} else {
						state.setParticleLayerMode('background');
					}
					return;
				}
				if (!state.particlesEnabled) return;
				if (state.particleLayerMode === 'both') {
					state.setParticleLayerMode('foreground');
				} else if (state.particleLayerMode === 'background') {
					state.setParticlesEnabled(false);
				}
				return;
			}

			if (enabled) {
				state.setParticlesEnabled(true);
				if (state.particleLayerMode === 'background') {
					state.setParticleLayerMode('both');
				} else {
					state.setParticleLayerMode('foreground');
				}
				return;
			}
			if (!state.particlesEnabled) return;
			if (state.particleLayerMode === 'both') {
				state.setParticleLayerMode('background');
			} else if (state.particleLayerMode === 'foreground') {
				state.setParticlesEnabled(false);
			}
		},
		[state]
	);

	const particleBgEnabled =
		state.particlesEnabled &&
		(state.particleLayerMode === 'background' ||
			state.particleLayerMode === 'both');
	const particleFgEnabled =
		state.particlesEnabled &&
		(state.particleLayerMode === 'foreground' ||
			state.particleLayerMode === 'both');

	const overlayLayers = useMemo(
		() =>
			state.overlays.map(overlay => ({
				id: overlay.id,
				label: (overlay.name ?? 'OVERLAY').slice(0, 10).toUpperCase(),
				active: overlay.enabled,
				onClick: () =>
					state.updateOverlay(overlay.id, {
						enabled: !overlay.enabled
					})
			})),
		[state]
	);

	const layerActions = useMemo(
		() =>
			buildLayerActions({
				t,
				globalBackgroundEnabled: state.globalBackgroundEnabled,
				setGlobalBackgroundEnabled: state.setGlobalBackgroundEnabled,
				backgroundImageEnabled: state.backgroundImageEnabled,
				setBackgroundImageEnabled: state.setBackgroundImageEnabled,
				slideshowEnabled: state.slideshowEnabled,
				setSlideshowEnabled: state.setSlideshowEnabled,
				spectrumEnabled: state.spectrumEnabled,
				setSpectrumEnabled: state.setSpectrumEnabled,
				logoEnabled: state.logoEnabled,
				setLogoEnabled: state.setLogoEnabled,
				audioTrackTitleEnabled: state.audioTrackTitleEnabled,
				setAudioTrackTitleEnabled: state.setAudioTrackTitleEnabled,
				audioTrackTimeEnabled: state.audioTrackTimeEnabled,
				setAudioTrackTimeEnabled: state.setAudioTrackTimeEnabled,
				particleBgEnabled,
				setParticleBgEnabled: value =>
					setParticleLayerEnabled('background', value),
				particleFgEnabled,
				setParticleFgEnabled: value =>
					setParticleLayerEnabled('foreground', value),
				rainEnabled: state.rainEnabled,
				setRainEnabled: state.setRainEnabled,
				overlayLayers
			}),
		[
			overlayLayers,
			particleBgEnabled,
			particleFgEnabled,
			setParticleLayerEnabled,
			state,
			t
		]
	);

	const looksActions = useMemo(() => {
		const actions = buildLooksActions({
			t,
			imageBassReactive: state.imageBassReactive,
			setImageBassReactive: state.setImageBassReactive,
			imageMirror: state.imageMirror,
			setImageMirror: state.setImageMirror,
			imageMirrorFill: state.imageMirrorFill,
			setImageMirrorFill: state.setImageMirrorFill,
			imageOpacityReactive: state.imageOpacityReactive,
			setImageOpacityReactive: state.setImageOpacityReactive,
			rgbShiftAudioReactive: state.rgbShiftAudioReactive,
			setRgbShiftAudioReactive: state.setRgbShiftAudioReactive
		});
		if (state.looksProfileSlots.length > 0) {
			actions.push({
				label: t.qa_slots,
				title: t.qa_slots_looks_t,
				icon: <Layers size={11} strokeWidth={2.25} />,
				active: expandPanel === 'looks_slots',
				small: true,
				onClick: () => toggleExpand('looks_slots')
			});
		}
		return actions;
	}, [expandPanel, state, toggleExpand, t]);

	const spectrumActions = useMemo(() => {
		const activeTarget = state.activeSpectrumTarget;
		const isMain = activeTarget === 'main';
		const instance = state.spectrumInstances[0];
		const targetVisible = isMain
			? state.spectrumMainVisible
			: (instance?.enabled ?? false);
		const actions = buildSpectrumActions({
			t,
			activeTarget,
			setActiveTarget: state.setActiveSpectrumTarget,
			hasSecondSpectrum: Boolean(instance),
			targetVisible,
			toggleTargetVisible: () => {
				if (isMain) {
					state.setSpectrumMainVisible(!state.spectrumMainVisible);
				} else if (instance) {
					state.setSpectrumInstanceEnabled(
						instance.id,
						!instance.enabled
					);
				}
			},
			targetMirror: isMain
				? state.spectrumMirror
				: (instance?.spectrumMirror ?? false),
			targetPeakHold: isMain
				? state.spectrumPeakHold
				: (instance?.spectrumPeakHold ?? false),
			targetFollowLogo: isMain
				? state.spectrumFollowLogo
				: (instance?.spectrumFollowLogo ?? false),
			targetRadialFitLogo: isMain
				? state.spectrumRadialFitLogo
				: (instance?.spectrumRadialFitLogo ?? false),
			targetPixelate: isMain
				? state.spectrumPixelate
				: (instance?.spectrumPixelate ?? false),
			updateTarget: patch => {
				if (isMain) {
					state.patchSpectrumMain(patch);
				} else if (instance) {
					state.updateSpectrumInstance(instance.id, patch);
				}
			}
		});
		const targetSlots =
			activeTarget === 'instance'
				? state.spectrumSecondProfileSlots
				: state.spectrumProfileSlots;
		if (targetSlots.length > 0) {
			actions.push({
				label: t.qa_slots,
				title: t.qa_slots_spectrum_t,
				icon: <Layers size={11} strokeWidth={2.25} />,
				active: expandPanel === 'spectrum_slots',
				small: true,
				onClick: () => toggleExpand('spectrum_slots')
			});
		}
		return actions;
	}, [expandPanel, state, toggleExpand, t]);

	const motionActions = useMemo(() => {
		const groups = buildMotionActions({
			t,
			motionPaused: state.motionPaused,
			setMotionPaused: state.setMotionPaused,
			stageLightsEnabled: state.stageLightsEnabled,
			setStageLightsEnabled: state.setStageLightsEnabled,
			flashLightEnabled: state.flashLightEnabled,
			setFlashLightEnabled: state.setFlashLightEnabled,
			cameraMotionEnabled: state.cameraMotionEnabled,
			setCameraMotionEnabled: state.setCameraMotionEnabled,
			cameraShakeEnabled: state.cameraShakeEnabled,
			setCameraShakeEnabled: state.setCameraShakeEnabled,
			particleAudioReactive: state.particleAudioReactive,
			setParticleAudioReactive: state.setParticleAudioReactive,
			particleGlow: state.particleGlow,
			setParticleGlow: state.setParticleGlow,
			particleFadeInOut: state.particleFadeInOut,
			setParticleFadeInOut: state.setParticleFadeInOut,
			particleAudioDriftEnabled: state.particleAudioDriftEnabled,
			setParticleAudioDriftEnabled: state.setParticleAudioDriftEnabled,
			particleDepthFlowEnabled: state.particleDepthFlowEnabled,
			setParticleDepthFlowEnabled: state.setParticleDepthFlowEnabled
		});
		// Saved-profile loaders live in their own subsection so the toggles
		// above stay focused on real on/off feature controls. Mirrors the
		// Motion editor sub-tabs: particles · rain · lights · camera.
		const slotActions = [];
		if (state.particlesProfileSlots.length > 0) {
			slotActions.push({
				label: t.qa_slots_particles,
				title: t.qa_slots_particles_t,
				icon: <Layers size={11} strokeWidth={2.25} />,
				active: expandPanel === 'particles_slots',
				small: true,
				onClick: () => toggleExpand('particles_slots')
			});
		}
		if (state.rainProfileSlots.length > 0) {
			slotActions.push({
				label: t.qa_slots_rain,
				title: t.qa_slots_rain_t,
				icon: <Layers size={11} strokeWidth={2.25} />,
				active: expandPanel === 'rain_slots',
				small: true,
				onClick: () => toggleExpand('rain_slots')
			});
		}
		if (state.lightsProfileSlots.length > 0) {
			slotActions.push({
				label: t.qa_slots_lights,
				title: t.qa_slots_lights_t,
				icon: <Layers size={11} strokeWidth={2.25} />,
				active: expandPanel === 'lights_slots',
				small: true,
				onClick: () => toggleExpand('lights_slots')
			});
		}
		if (state.cameraFxProfileSlots.length > 0) {
			slotActions.push({
				label: t.qa_slots_camera,
				title: t.qa_slots_camera_t,
				icon: <Layers size={11} strokeWidth={2.25} />,
				active: expandPanel === 'camera_slots',
				small: true,
				onClick: () => toggleExpand('camera_slots')
			});
		}
		if (slotActions.length > 0) {
			groups.push({ label: t.qa_grp_sub_slots, actions: slotActions });
		}
		return groups;
	}, [expandPanel, state, toggleExpand, t]);

	const audioActions = useMemo(
		() =>
			buildAudioActions({
				t,
				audioReactive: state.audioReactive,
				setAudioReactive: state.setAudioReactive,
				audioCrossfadeEnabled: state.audioCrossfadeEnabled,
				setAudioCrossfadeEnabled: state.setAudioCrossfadeEnabled,
				audioAutoAdvance: state.audioAutoAdvance,
				setAudioAutoAdvance: state.setAudioAutoAdvance,
				audioFileLoop: state.audioFileLoop,
				setAudioFileLoop: state.setAudioFileLoop,
				mediaSessionEnabled: state.mediaSessionEnabled,
				setMediaSessionEnabled: state.setMediaSessionEnabled,
				slideshowAudioCheckpointsEnabled:
					state.slideshowAudioCheckpointsEnabled,
				setSlideshowAudioCheckpointsEnabled:
					state.setSlideshowAudioCheckpointsEnabled,
				slideshowTrackChangeSyncEnabled:
					state.slideshowTrackChangeSyncEnabled,
				setSlideshowTrackChangeSyncEnabled:
					state.setSlideshowTrackChangeSyncEnabled,
				slideshowManualTimestampsEnabled:
					state.slideshowManualTimestampsEnabled,
				setSlideshowManualTimestampsEnabled:
					state.setSlideshowManualTimestampsEnabled,
				slideshowResetPosition: state.slideshowResetPosition,
				setSlideshowResetPosition: state.setSlideshowResetPosition
			}),
		[state, t]
	);

	const logoShortcutActions = useMemo(() => {
		const actions = buildLogoActions({
			t,
			logoVariantMode: state.logoVariantMode,
			setLogoVariantMode: state.setLogoVariantMode,
			isBuiltInLogo: !state.logoId && isBuiltInAppLogoUrl(state.logoUrl),
			onRestoreFactoryLogo: () => {
				void (async () => {
					const ok = await confirm({
						title: t.confirm_restore_vibrix_logo_title,
						message: t.confirm_restore_vibrix_logo_message,
						confirmLabel: t.restore_vibrix_logo,
						cancelLabel: t.label_cancel,
						tone: 'danger'
					});
					if (ok) state.restoreFactoryLogo();
				})();
			},
			logoShadowEnabled: state.logoShadowEnabled,
			setLogoShadowEnabled: state.setLogoShadowEnabled,
			logoBackdropEnabled: state.logoBackdropEnabled,
			setLogoBackdropEnabled: state.setLogoBackdropEnabled
		});
		// Quick position picker — one tap snaps the logo to a grid cell (same
		// logoPositionX/Y state as the Logo tab; reactivity/presets untouched).
		actions.push({
			label: t.qa_logo_position,
			title: t.qa_logo_position_t,
			icon: <Grid3x3 size={11} strokeWidth={2.25} />,
			active: expandPanel === 'logo_position',
			small: true,
			onClick: () => toggleExpand('logo_position')
		});
		if (state.logoProfileSlots.length > 0) {
			actions.push({
				label: t.qa_slots,
				title: t.qa_slots_logo_t,
				icon: <Layers size={11} strokeWidth={2.25} />,
				active: expandPanel === 'logo_slots',
				small: true,
				onClick: () => toggleExpand('logo_slots')
			});
		}
		return actions;
	}, [confirm, expandPanel, state, toggleExpand, t]);

	const titleActions = useMemo(() => {
		const actions = buildTitleActions({
			t,
			audioTrackTitleBackdropEnabled:
				state.audioTrackTitleBackdropEnabled,
			setAudioTrackTitleBackdropEnabled:
				state.setAudioTrackTitleBackdropEnabled,
			audioTrackTitleUppercase: state.audioTrackTitleUppercase,
			setAudioTrackTitleUppercase: state.setAudioTrackTitleUppercase
		});
		if (state.trackTitleProfileSlots.length > 0) {
			actions.push({
				label: t.qa_slots,
				title: t.qa_slots_title_t,
				icon: <Layers size={11} strokeWidth={2.25} />,
				active: expandPanel === 'title_slots',
				small: true,
				onClick: () => toggleExpand('title_slots')
			});
		}
		return actions;
	}, [expandPanel, state, toggleExpand, t]);

	const systemActions = useMemo(
		() =>
			buildSystemActions({
				t,
				showFps: state.showFps,
				setShowFps: state.setShowFps,
				sleepModeEnabled: state.sleepModeEnabled,
				setSleepModeEnabled: state.setSleepModeEnabled,
				layoutResponsiveEnabled: state.layoutResponsiveEnabled,
				setLayoutResponsiveEnabled: state.setLayoutResponsiveEnabled,
				layoutBackgroundReframeEnabled:
					state.layoutBackgroundReframeEnabled,
				setLayoutBackgroundReframeEnabled:
					state.setLayoutBackgroundReframeEnabled,
				performanceSafeEnabled: state.performanceSafeEnabled,
				setPerformanceSafeEnabled: state.setPerformanceSafeEnabled,
				virtualFoldersEnabled: state.virtualFoldersEnabled,
				setVirtualFoldersEnabled: state.setVirtualFoldersEnabled,
				showBackgroundScaleMeter: state.showBackgroundScaleMeter,
				setShowBackgroundScaleMeter: state.setShowBackgroundScaleMeter,
				showSpectrumDiagnosticsHud: state.showSpectrumDiagnosticsHud,
				setShowSpectrumDiagnosticsHud:
					state.setShowSpectrumDiagnosticsHud,
				showLogoDiagnosticsHud: state.showLogoDiagnosticsHud,
				setShowLogoDiagnosticsHud: state.setShowLogoDiagnosticsHud,
				showSetlistHud: state.showSetlistHud,
				setShowSetlistHud: state.setShowSetlistHud
			}),
		[state, t]
	);

	const dragActions = useMemo<QuickActionButtonProps[]>(
		() => [
			...DRAG_TOOL_ITEMS.map(tool => ({
				label: tool.label,
				title: `${t.qa_drag_select_target}: ${tool.label}`,
				icon: tool.icon,
				active: state.enableDragMode && state.activeTool === tool.id,
				small: true,
				onClick: () => state.setDragTool(tool.id)
			})),
			{
				label: t.qa_drag_done,
				title: t.qa_drag_done_t,
				icon: <MousePointer size={11} strokeWidth={2.25} />,
				active: !state.enableDragMode,
				small: true,
				onClick: () => state.setDragTool('none')
			}
		],
		[state, t]
	);

	const { themeActions, colorSourceActions } = useMemo(
		() =>
			buildThemeActions({
				t,
				editorTheme: state.editorTheme,
				setEditorTheme: state.setEditorTheme,
				colorSource: state.quickActionsColorSource,
				setColorSource: state.setQuickActionsColorSource
			}),
		[state, t]
	);

	// Per-feature color source shortcuts. Each one resolves to `null` when
	// the underlying sub-sources diverge (rendered as "Mixed"), and pulling
	// any button overwrites all of them via the corresponding bulk setter.
	const spectrumColorSourceShortcut = useMemo<QuickColorSourceShortcut>(
		() => ({
			value: resolveSharedColorSource([
				state.spectrumColorSource,
				...state.spectrumInstances.map(
					instance => instance.spectrumColorSource
				)
			]),
			onChange: state.setSpectrumColorSources
		}),
		[
			state.spectrumColorSource,
			state.spectrumInstances,
			state.setSpectrumColorSources
		]
	);
	const logoColorSourceShortcut = useMemo<QuickColorSourceShortcut>(
		() => ({
			value: resolveSharedColorSource([
				state.logoGlowColorSource,
				state.logoShadowColorSource,
				state.logoBackdropColorSource
			]),
			onChange: state.setLogoColorSources
		}),
		[
			state.logoGlowColorSource,
			state.logoShadowColorSource,
			state.logoBackdropColorSource,
			state.setLogoColorSources
		]
	);
	const motionColorSourceShortcut = useMemo<QuickColorSourceShortcut>(
		() => ({
			value: resolveSharedColorSource([
				state.particleColorSource,
				state.rainColorSource
			]),
			onChange: state.setMotionColorSources
		}),
		[
			state.particleColorSource,
			state.rainColorSource,
			state.setMotionColorSources
		]
	);
	const titleColorSourceShortcut = useMemo<QuickColorSourceShortcut>(
		() => ({
			value: resolveSharedColorSource([
				state.audioTrackTitleTextColorSource,
				state.audioTrackTitleStrokeColorSource,
				state.audioTrackTitleGlowColorSource,
				state.audioTrackTitleBackdropColorSource,
				state.audioTrackTimeTextColorSource,
				state.audioTrackTimeStrokeColorSource,
				state.audioTrackTimeGlowColorSource
			]),
			onChange: state.setTrackTitleColorSources
		}),
		[
			state.audioTrackTitleTextColorSource,
			state.audioTrackTitleStrokeColorSource,
			state.audioTrackTitleGlowColorSource,
			state.audioTrackTitleBackdropColorSource,
			state.audioTrackTimeTextColorSource,
			state.audioTrackTimeStrokeColorSource,
			state.audioTrackTimeGlowColorSource,
			state.setTrackTitleColorSources
		]
	);
	const editorShellColorSourceShortcut = useMemo<QuickColorSourceShortcut>(
		() => ({
			value: resolveSharedColorSource([
				state.editorThemeColorSource,
				state.quickActionsColorSource
			]),
			onChange: state.setEditorShellColorSource
		}),
		[
			state.editorThemeColorSource,
			state.quickActionsColorSource,
			state.setEditorShellColorSource
		]
	);
	const globalColorSourceShortcut = useMemo<QuickColorSourceShortcut>(
		() => ({
			value: resolveSharedColorSource([
				state.editorThemeColorSource,
				state.quickActionsColorSource,
				state.spectrumColorSource,
				...state.spectrumInstances.map(
					instance => instance.spectrumColorSource
				),
				state.logoGlowColorSource,
				state.logoShadowColorSource,
				state.logoBackdropColorSource,
				state.particleColorSource,
				state.rainColorSource,
				state.audioTrackTitleTextColorSource,
				state.audioTrackTitleStrokeColorSource,
				state.audioTrackTitleGlowColorSource,
				state.audioTrackTitleBackdropColorSource,
				state.audioTrackTimeTextColorSource,
				state.audioTrackTimeStrokeColorSource,
				state.audioTrackTimeGlowColorSource
			]),
			onChange: state.syncAllColorSources
		}),
		[
			state.editorThemeColorSource,
			state.quickActionsColorSource,
			state.spectrumColorSource,
			state.spectrumInstances,
			state.logoGlowColorSource,
			state.logoShadowColorSource,
			state.logoBackdropColorSource,
			state.particleColorSource,
			state.rainColorSource,
			state.audioTrackTitleTextColorSource,
			state.audioTrackTitleStrokeColorSource,
			state.audioTrackTitleGlowColorSource,
			state.audioTrackTitleBackdropColorSource,
			state.audioTrackTimeTextColorSource,
			state.audioTrackTimeStrokeColorSource,
			state.audioTrackTimeGlowColorSource,
			state.syncAllColorSources
		]
	);

	// Header actions mirror the editor main-tabs. Each button opens a
	// sub-panel below with its own grid of toggles.
	const headerActions = useMemo(() => {
		const actions = [];
		if (fullscreenSupported) {
			actions.push({
				label: isFullscreen
					? t.label_quick_exit_fs
					: t.label_quick_full,
				title: isFullscreen
					? t.label_exit_fullscreen
					: t.label_enter_fullscreen,
				icon: isFullscreen ? (
					<Minimize2 size={11} strokeWidth={2.25} />
				) : (
					<Maximize2 size={11} strokeWidth={2.25} />
				),
				active: isFullscreen,
				onClick: () => void toggleFullscreen()
			});
		}
		actions.push({
			label: t.qa_presentation_short,
			title: t.hint_presentation_mode,
			icon: <Monitor size={11} strokeWidth={2.25} />,
			active: false,
			onClick: goPresentation
		});
		// Drag mode owns a dedicated panel: targets are exclusive tools, not tabs.
		actions.push({
			label: t.qa_drag_mode,
			title: t.qa_drag_mode_t,
			icon: <Move size={11} strokeWidth={2.25} />,
			active: state.enableDragMode || expandPanel === 'drag',
			onClick: () => toggleExpand('drag')
		});
		actions.push(
			{
				label: t.tab_layers.toUpperCase(),
				title: t.qa_grp_layers_t,
				icon: <Layers size={11} strokeWidth={2.25} />,
				active: isPanelExpanded('layers'),
				onClick: () => toggleExpand('layers')
			},
			{
				label: t.tab_looks.toUpperCase(),
				title: t.qa_grp_looks_t,
				icon: <ImageIcon size={11} strokeWidth={2.25} />,
				active: isPanelExpanded('looks', 'looks_slots'),
				onClick: () => toggleExpand('looks')
			}
		);
		// Always-visible Spectrum target toggle: flip the edited/HUD target
		// between Spectrum 1 and 2 without opening the Spectrum panel. Only shown
		// when a second spectrum exists.
		if (state.spectrumInstances[0]) {
			const onSecond = state.activeSpectrumTarget === 'instance';
			actions.push({
				label: onSecond ? t.qa_spec_s2 : t.qa_spec_s1,
				title: t.qa_spec_target_t,
				icon: <AudioWaveform size={11} strokeWidth={2.25} />,
				active: onSecond,
				onClick: () =>
					state.setActiveSpectrumTarget(
						onSecond ? 'main' : 'instance'
					)
			});
		}
		actions.push(
			{
				label: t.tab_spectrum.toUpperCase(),
				title: t.qa_grp_spectrum_t,
				icon: <AudioWaveform size={11} strokeWidth={2.25} />,
				active: isPanelExpanded('spectrum', 'spectrum_slots'),
				onClick: () => toggleExpand('spectrum')
			},
			{
				label: t.tab_motion.toUpperCase(),
				title: t.qa_grp_motion_t,
				icon: <Sparkles size={11} strokeWidth={2.25} />,
				active: isPanelExpanded(
					'motion',
					'particles_slots',
					'rain_slots',
					'lights_slots',
					'camera_slots'
				),
				onClick: () => toggleExpand('motion')
			},
			{
				label: t.tab_audio.toUpperCase(),
				title: t.qa_grp_audio_t,
				icon: <Music2 size={11} strokeWidth={2.25} />,
				active: expandPanel === 'audio',
				onClick: () => toggleExpand('audio')
			},
			{
				label: t.tab_logo.toUpperCase(),
				title: t.qa_grp_logo_t,
				icon: <Circle size={11} strokeWidth={2.25} />,
				active: isPanelExpanded('logo', 'logo_slots', 'logo_position'),
				onClick: () => toggleExpand('logo')
			},
			{
				label: t.tab_track.toUpperCase(),
				title: t.qa_grp_title_t,
				icon: <TypeIcon size={11} strokeWidth={2.25} />,
				active: isPanelExpanded('title', 'title_slots'),
				onClick: () => toggleExpand('title')
			},
			{
				// Per-image override snapshots (logo/spectrum/particles/rain/looks).
				// Lives inside the HUD instead of as a floating window so the
				// user controls position/design through the same HUD frame.
				label: t.qa_per_img,
				title: t.qa_per_img_t,
				icon: <ImageDown size={11} strokeWidth={2.25} />,
				active: isPanelExpanded('quickEdit'),
				onClick: () => toggleExpand('quickEdit')
			},
			{
				label: t.qa_sys,
				title: t.qa_grp_system_t,
				icon: <Cpu size={11} strokeWidth={2.25} />,
				active: isPanelExpanded('system'),
				onClick: () => toggleExpand('system')
			},
			{
				label: t.tab_editor.toUpperCase(),
				title: t.qa_grp_themes_t,
				icon: <Palette size={11} strokeWidth={2.25} />,
				active: isPanelExpanded('themes'),
				onClick: () => toggleExpand('themes')
			}
		);
		return actions;
	}, [
		expandPanel,
		fullscreenSupported,
		isFullscreen,
		t,
		isPanelExpanded,
		toggleExpand,
		toggleFullscreen,
		goPresentation,
		state
	]);

	const imageNav = useMemo(
		() => ({
			hasBackgroundImages: state.backgroundImages.length > 0,
			// Navigable = ≥2 images that are enabled and have a URL, respecting
			// the active setlist.  slideshowEnabled never gates this — auto-cycle
			// ON does not prevent manual Prev/Next.
			canNavigateImages:
				visibleImages.filter(img => img.url && img.enabled).length >= 2,
			slideshowEnabled: state.slideshowEnabled,
			onToggleSlideshow: () =>
				state.setSlideshowEnabled(!state.slideshowEnabled),
			motionPaused: state.motionPaused,
			onPrevImage: () => moveImage(-1),
			onNextImage: () => moveImage(1),
			onToggleFreeze: () => state.setMotionPaused(!state.motionPaused)
		}),
		// The rule wants the whole `state` object because the closures read it,
		// but every field they touch is listed individually below. Depending on
		// `state` would rebuild this on any store change — the opposite of why
		// the memo exists. Keep the precise list; add to it when a new
		// `state.x` is read here.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			moveImage,
			state.backgroundImages.length,
			state.motionPaused,
			state.setMotionPaused,
			state.setSlideshowEnabled,
			state.slideshowEnabled,
			visibleImages
		]
	);

	// ── Spectrum carousel ─────────────────────────────────────────────────
	// Only populated slots — empty slot entries are skipped completely so
	// the user only cycles between meaningful entries. A local cursor
	// (`lastSpectrumNavSlotRef`) remembers the last slot the HUD loaded so
	// the carousel never loses track if `doProfileSettingsMatch` drifts.
	const lastSpectrumNavSlotRef = useRef<number | null>(null);
	const spectrumNav: SubsystemCarouselNav | undefined = useMemo(() => {
		const targetSlots =
			fullStore.activeSpectrumTarget === 'instance'
				? fullStore.spectrumSecondProfileSlots
				: fullStore.spectrumProfileSlots;
		const populated = targetSlots
			.map((slot, index) => ({ slot, index }))
			.filter(({ slot }) => slot.values !== null);
		if (populated.length === 0) {
			lastSpectrumNavSlotRef.current = null;
			return undefined;
		}
		// Detection returns only the FIRST slot matching the live look, so when
		// several slots normalize to the same look it can't tell them apart. If
		// we always preferred detection, each arrow press would load the target
		// slot but then snap the cursor back to the first duplicate — making the
		// HUD skip every slot between them. So: prefer the explicit navigation
		// cursor while it still matches the live look; only fall back to
		// detection when the look changed elsewhere (grid click, editor load).
		const detectedIndex =
			activeSpectrumSlotIndex >= 0 ? activeSpectrumSlotIndex : null;
		const cursorRaw = lastSpectrumNavSlotRef.current;
		const cursorIndex =
			cursorRaw != null &&
			populated.some(({ index }) => index === cursorRaw)
				? cursorRaw
				: null;
		const cursorMatchesLive =
			cursorIndex != null &&
			isSpectrumSlotActiveForTarget(
				fullStore,
				fullStore.activeSpectrumTarget,
				cursorIndex
			);
		const effectiveIndex = cursorMatchesLive
			? cursorIndex
			: (detectedIndex ?? cursorIndex);
		const currentPos =
			effectiveIndex != null
				? populated.findIndex(({ index }) => index === effectiveIndex)
				: -1;
		const currentEntry = currentPos >= 0 ? populated[currentPos] : null;
		const totalLabel = String(populated.length).padStart(2, '0');
		const indexLabel =
			currentPos >= 0 ? String(currentPos + 1).padStart(2, '0') : '--';
		const stepBy = (delta: number) => {
			if (populated.length === 0) return;
			let nextPos: number;
			if (currentPos < 0) {
				// No active slot: forward = first populated, back = last
				// populated. Previously this collapsed to `(0 + delta) % N`
				// which silently skipped the first slot on the first ▶ click.
				nextPos = delta > 0 ? 0 : populated.length - 1;
			} else {
				nextPos =
					(currentPos + delta + populated.length) % populated.length;
			}
			const target = populated[nextPos];
			if (!target) return;
			lastSpectrumNavSlotRef.current = target.index;
			fullStore.loadSpectrumProfileSlot(
				target.index,
				fullStore.activeSpectrumTarget
			);
		};
		return {
			hasItems: true,
			label: `SPEC ${indexLabel}/${totalLabel}`,
			tooltip: currentEntry
				? `Spectrum slot: ${currentEntry.slot.name}`
				: 'Spectrum slot — none active yet',
			onPrev: () => stepBy(-1),
			onNext: () => stepBy(1)
		};
	}, [fullStore, activeSpectrumSlotIndex]);

	// ── Looks carousel ────────────────────────────────────────────────────
	// Same catalog the Looks tab renders (factory presets, then populated
	// slots); a local cursor covers hand-edited looks with no active id.
	const lastLooksNavKeyRef = useRef<string | null>(null);
	const looksNav: SubsystemCarouselNav | undefined = useMemo(() => {
		const entries = buildFilterLookCatalog(
			fullStore.looksProfileSlots,
			false
		);
		if (entries.length === 0) {
			lastLooksNavKeyRef.current = null;
			return undefined;
		}
		const detectedPos = findFilterLookCatalogIndex(
			entries,
			fullStore.activeFilterLookId
		);
		const cursorPos =
			lastLooksNavKeyRef.current != null
				? entries.findIndex(e => e.key === lastLooksNavKeyRef.current)
				: -1;
		const currentPos = detectedPos >= 0 ? detectedPos : cursorPos;
		const currentEntry = currentPos >= 0 ? entries[currentPos] : null;
		const totalLabel = String(entries.length).padStart(2, '0');
		const indexLabel =
			currentPos >= 0 ? String(currentPos + 1).padStart(2, '0') : '--';
		const apply = (entry: (typeof entries)[number]) => {
			lastLooksNavKeyRef.current = entry.key;
			if (entry.kind === 'slot') {
				fullStore.loadLooksProfileSlot(entry.slotIndex);
				return;
			}
			fullStore.applyFilterLook(entry.preset);
		};
		const stepBy = (delta: number) => {
			const nextPos =
				currentPos < 0
					? delta > 0
						? 0
						: entries.length - 1
					: (currentPos + delta + entries.length) % entries.length;
			const target = entries[nextPos];
			if (target) apply(target);
		};
		return {
			hasItems: true,
			label: `LOOK ${indexLabel}/${totalLabel}`,
			tooltip: currentEntry
				? `Looks ${currentEntry.kind === 'slot' ? 'slot' : 'preset'}: ${currentEntry.name}`
				: 'Looks — none active yet',
			onPrev: () => stepBy(-1),
			onNext: () => stepBy(1)
		};
	}, [fullStore]);

	// ── Particles carousel ────────────────────────────────────────────────
	// Mirrors the spectrum carousel: only populated slots, and the explicit
	// navigation cursor wins over diff-detection while it still matches the
	// live look, so arrow stepping never skips slots that share a look.
	const lastParticlesNavSlotRef = useRef<number | null>(null);
	const particlesNav: SubsystemCarouselNav | undefined = useMemo(() => {
		const populated = fullStore.particlesProfileSlots
			.map((slot, index) => ({ slot, index }))
			.filter(({ slot }) => slot.values !== null);
		if (populated.length === 0) {
			lastParticlesNavSlotRef.current = null;
			return undefined;
		}
		const detectedIndex =
			activeParticlesSlotIndex >= 0 ? activeParticlesSlotIndex : null;
		const cursorRaw = lastParticlesNavSlotRef.current;
		const cursorIndex =
			cursorRaw != null &&
			populated.some(({ index }) => index === cursorRaw)
				? cursorRaw
				: null;
		const cursorMatchesLive =
			cursorIndex != null &&
			doProfileSettingsMatch(
				extractParticlesProfileSettings(fullStore),
				fullStore.particlesProfileSlots[cursorIndex].values
			);
		const effectiveIndex = cursorMatchesLive
			? cursorIndex
			: (detectedIndex ?? cursorIndex);
		const currentPos =
			effectiveIndex != null
				? populated.findIndex(({ index }) => index === effectiveIndex)
				: -1;
		const currentEntry = currentPos >= 0 ? populated[currentPos] : null;
		const totalLabel = String(populated.length).padStart(2, '0');
		const indexLabel =
			currentPos >= 0 ? String(currentPos + 1).padStart(2, '0') : '--';
		const stepBy = (delta: number) => {
			if (populated.length === 0) return;
			let nextPos: number;
			if (currentPos < 0) {
				nextPos = delta > 0 ? 0 : populated.length - 1;
			} else {
				nextPos =
					(currentPos + delta + populated.length) % populated.length;
			}
			const target = populated[nextPos];
			if (!target) return;
			lastParticlesNavSlotRef.current = target.index;
			fullStore.loadParticlesProfileSlot(target.index);
		};
		return {
			hasItems: true,
			label: `PART ${indexLabel}/${totalLabel}`,
			tooltip: currentEntry
				? `Particles slot: ${currentEntry.slot.name}`
				: 'Particles slot — none active yet',
			onPrev: () => stepBy(-1),
			onNext: () => stepBy(1)
		};
	}, [fullStore, activeParticlesSlotIndex]);

	const spectrumSlots = useMemo(
		() =>
			(state.activeSpectrumTarget === 'instance'
				? state.spectrumSecondProfileSlots
				: state.spectrumProfileSlots
			).map((slot, index) => ({
				key: `spectrum-${index}`,
				orderLabel: String(index + 1).padStart(2, '0'),
				name: slot.name,
				active: activeSpectrumSlotIndex === index,
				onClick: () =>
					state.loadSpectrumProfileSlot(
						index,
						state.activeSpectrumTarget
					)
			})),
		[activeSpectrumSlotIndex, state]
	);

	const looksSlots = useMemo(
		() =>
			state.looksProfileSlots.map((slot, index) => ({
				key: `looks-${index}`,
				orderLabel: String(index + 1).padStart(2, '0'),
				name: slot.name,
				active: activeLooksSlotIndex === index,
				onClick: () => state.loadLooksProfileSlot(index)
			})),
		[activeLooksSlotIndex, state]
	);

	const particlesSlots = useMemo(
		() =>
			state.particlesProfileSlots.map((slot, index) => ({
				key: `particles-${index}`,
				orderLabel: String(index + 1).padStart(2, '0'),
				name: slot.name,
				active: activeParticlesSlotIndex === index,
				onClick: () => state.loadParticlesProfileSlot(index)
			})),
		[activeParticlesSlotIndex, state]
	);

	const rainSlots = useMemo(
		() =>
			state.rainProfileSlots.map((slot, index) => ({
				key: `rain-${index}`,
				orderLabel: String(index + 1).padStart(2, '0'),
				name: slot.name,
				active: activeRainSlotIndex === index,
				onClick: () => state.loadRainProfileSlot(index)
			})),
		[activeRainSlotIndex, state]
	);

	const lightsSlots = useMemo(
		() =>
			state.lightsProfileSlots.map((slot, index) => ({
				key: `lights-${index}`,
				orderLabel: String(index + 1).padStart(2, '0'),
				name: slot.name,
				active: activeLightsSlotIndex === index,
				onClick: () => state.loadLightsProfileSlot(index)
			})),
		[activeLightsSlotIndex, state]
	);

	const cameraSlots = useMemo(
		() =>
			state.cameraFxProfileSlots.map((slot, index) => ({
				key: `camera-${index}`,
				orderLabel: String(index + 1).padStart(2, '0'),
				name: slot.name,
				active: activeCameraSlotIndex === index,
				onClick: () => state.loadCameraFxProfileSlot(index)
			})),
		[activeCameraSlotIndex, state]
	);

	const logoSlots = useMemo(
		() =>
			state.logoProfileSlots.map((slot, index) => ({
				key: `logo-${index}`,
				orderLabel: String(index + 1).padStart(2, '0'),
				name: slot.name,
				active: activeLogoSlotIndex === index,
				onClick: () => state.loadLogoProfileSlot(index)
			})),
		[activeLogoSlotIndex, state]
	);

	const titleSlots = useMemo(
		() =>
			state.trackTitleProfileSlots.map((slot, index) => ({
				key: `track-title-${index}`,
				orderLabel: String(index + 1).padStart(2, '0'),
				name: slot.name,
				active: activeTitleSlotIndex === index,
				onClick: () => state.loadTrackTitleProfileSlot(index)
			})),
		[activeTitleSlotIndex, state]
	);

	return {
		enabledTracksCount,
		handleAudioToggle,
		headerActions,
		imageLabel,
		imageNav,
		spectrumNav,
		looksNav,
		particlesNav,
		isFileMode,
		layerActions,
		looksActions,
		spectrumActions,
		motionActions,
		dragActions,
		audioActions,
		logoShortcutActions,
		titleActions,
		systemActions,
		looksSlots,
		particlesSlots,
		rainSlots,
		lightsSlots,
		cameraSlots,
		logoSlots,
		spectrumSlots,
		statusLabel,
		themeActions,
		colorSourceActions,
		titleSlots,
		trackLabel,
		spectrumColorSourceShortcut,
		logoColorSourceShortcut,
		motionColorSourceShortcut,
		titleColorSourceShortcut,
		editorShellColorSourceShortcut,
		globalColorSourceShortcut
	};
}
