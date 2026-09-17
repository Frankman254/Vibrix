import type {
	QuickActionButtonProps,
	QuickActionGroup
} from '@/components/wallpaper/quickActions/QuickActionButton';
import type { Translations } from '@/lib/i18n';
import type { LogoVariantMode } from '@/types/wallpaper';
import {
	EDITOR_THEMES,
	type EditorThemeOption
} from '@/components/wallpaper/quickActions/quickActionsShared';
import {
	Image as ImageIcon,
	Images,
	AudioWaveform,
	Type,
	Clock,
	Sparkles,
	CloudRain,
	Layers,
	Globe,
	FlipHorizontal,
	Droplets,
	Waves,
	CircleDashed,
	TrendingUp,
	Wand2,
	Circle,
	Sun,
	Square,
	SlidersHorizontal,
	Moon,
	Zap,
	SkipForward,
	Activity,
	Gauge,
	Palette,
	Shuffle,
	Monitor,
	Repeat,
	MapPin,
	Crosshair,
	Target,
	Eye,
	EyeOff,
	Ruler,
	FolderTree,
	Cpu,
	Smartphone,
	Radio,
	Move,
	Wind,
	Crosshair as CrosshairIcon,
	ListChecks
} from 'lucide-react';

const ICON_SZ = 11;

function makeIcon(
	Component: React.ComponentType<{ size?: number; strokeWidth?: number }>
) {
	return <Component size={ICON_SZ} strokeWidth={2.25} />;
}

// ──────────────────────────────────────────────────────────────────────────
// CAPAS (visibility)
// ──────────────────────────────────────────────────────────────────────────

type BuildLayerActionsOptions = {
	t: Translations;
	globalBackgroundEnabled: boolean;
	setGlobalBackgroundEnabled: (value: boolean) => void;
	backgroundImageEnabled: boolean;
	setBackgroundImageEnabled: (value: boolean) => void;
	slideshowEnabled: boolean;
	setSlideshowEnabled: (value: boolean) => void;
	spectrumEnabled: boolean;
	setSpectrumEnabled: (value: boolean) => void;
	logoEnabled: boolean;
	setLogoEnabled: (value: boolean) => void;
	audioTrackTitleEnabled: boolean;
	setAudioTrackTitleEnabled: (value: boolean) => void;
	audioTrackTimeEnabled: boolean;
	setAudioTrackTimeEnabled: (value: boolean) => void;
	particleBgEnabled: boolean;
	setParticleBgEnabled: (value: boolean) => void;
	particleFgEnabled: boolean;
	setParticleFgEnabled: (value: boolean) => void;
	rainEnabled: boolean;
	setRainEnabled: (value: boolean) => void;
	overlayLayers: Array<{
		id: string;
		label: string;
		active: boolean;
		onClick: () => void;
	}>;
};

export function buildLayerActions({
	t,
	globalBackgroundEnabled,
	setGlobalBackgroundEnabled,
	backgroundImageEnabled,
	setBackgroundImageEnabled,
	slideshowEnabled,
	setSlideshowEnabled,
	spectrumEnabled,
	setSpectrumEnabled,
	logoEnabled,
	setLogoEnabled,
	audioTrackTitleEnabled,
	setAudioTrackTitleEnabled,
	audioTrackTimeEnabled,
	setAudioTrackTimeEnabled,
	particleBgEnabled,
	setParticleBgEnabled,
	particleFgEnabled,
	setParticleFgEnabled,
	rainEnabled,
	setRainEnabled,
	overlayLayers
}: BuildLayerActionsOptions): QuickActionButtonProps[] {
	return [
		{
			label: t.qa_global_bg,
			title: t.qa_global_bg_t,
			icon: makeIcon(Globe),
			active: globalBackgroundEnabled,
			small: true,
			onClick: () => setGlobalBackgroundEnabled(!globalBackgroundEnabled)
		},
		{
			label: t.qa_bg_image,
			title: t.qa_bg_image_t,
			icon: makeIcon(ImageIcon),
			active: backgroundImageEnabled,
			small: true,
			onClick: () => setBackgroundImageEnabled(!backgroundImageEnabled)
		},
		{
			label: t.qa_slideshow,
			title: t.qa_slideshow_t,
			icon: makeIcon(Images),
			active: slideshowEnabled,
			small: true,
			onClick: () => setSlideshowEnabled(!slideshowEnabled)
		},
		{
			label: t.qa_spectrum,
			title: t.qa_spectrum_t,
			icon: makeIcon(AudioWaveform),
			active: spectrumEnabled,
			small: true,
			onClick: () => setSpectrumEnabled(!spectrumEnabled)
		},
		{
			label: t.qa_logo,
			title: t.qa_logo_t,
			icon: makeIcon(Circle),
			active: logoEnabled,
			small: true,
			onClick: () => setLogoEnabled(!logoEnabled)
		},
		{
			label: t.qa_title,
			title: t.qa_title_t,
			icon: makeIcon(Type),
			active: audioTrackTitleEnabled,
			small: true,
			onClick: () => {
				const nextValue = !audioTrackTitleEnabled;
				setAudioTrackTitleEnabled(nextValue);
				if (!nextValue) setAudioTrackTimeEnabled(false);
			}
		},
		{
			label: t.qa_time,
			title: t.qa_time_t,
			icon: makeIcon(Clock),
			active: audioTrackTimeEnabled,
			small: true,
			onClick: () => setAudioTrackTimeEnabled(!audioTrackTimeEnabled)
		},
		{
			label: t.qa_part_bg,
			title: t.qa_part_bg_t,
			icon: makeIcon(Sparkles),
			active: particleBgEnabled,
			small: true,
			onClick: () => setParticleBgEnabled(!particleBgEnabled)
		},
		{
			label: t.qa_part_fg,
			title: t.qa_part_fg_t,
			icon: makeIcon(Sparkles),
			active: particleFgEnabled,
			small: true,
			onClick: () => setParticleFgEnabled(!particleFgEnabled)
		},
		{
			label: t.qa_rain,
			title: t.qa_rain_t,
			icon: makeIcon(CloudRain),
			active: rainEnabled,
			small: true,
			onClick: () => setRainEnabled(!rainEnabled)
		},
		...overlayLayers.map(
			layer =>
				({
					label: layer.label,
					title: layer.label,
					icon: makeIcon(Layers),
					active: layer.active,
					small: true,
					onClick: layer.onClick
				}) satisfies QuickActionButtonProps
		)
	];
}

// ──────────────────────────────────────────────────────────────────────────
// LOOKS (image / filters)
// ──────────────────────────────────────────────────────────────────────────

type BuildLooksActionsOptions = {
	t: Translations;
	imageBassReactive: boolean;
	setImageBassReactive: (value: boolean) => void;
	imageMirror: boolean;
	setImageMirror: (value: boolean) => void;
	imageMirrorFill: boolean;
	setImageMirrorFill: (value: boolean) => void;
	imageOpacityReactive: boolean;
	setImageOpacityReactive: (value: boolean) => void;
	rgbShiftAudioReactive: boolean;
	setRgbShiftAudioReactive: (value: boolean) => void;
};

export function buildLooksActions(
	o: BuildLooksActionsOptions
): QuickActionButtonProps[] {
	return [
		{
			label: o.t.qa_bass_zoom,
			title: o.t.qa_bass_zoom_t,
			icon: makeIcon(TrendingUp),
			active: o.imageBassReactive,
			small: true,
			onClick: () => o.setImageBassReactive(!o.imageBassReactive)
		},
		{
			label: o.t.qa_mirror,
			title: o.t.qa_mirror_img_t,
			icon: makeIcon(FlipHorizontal),
			active: o.imageMirror,
			small: true,
			onClick: () => o.setImageMirror(!o.imageMirror)
		},
		{
			label: o.t.qa_mirror_fill,
			title: o.t.qa_mirror_fill_t,
			icon: makeIcon(Layers),
			active: o.imageMirrorFill,
			small: true,
			onClick: () => o.setImageMirrorFill(!o.imageMirrorFill)
		},
		{
			label: o.t.qa_img_opac,
			title: o.t.qa_img_opac_t,
			icon: makeIcon(Droplets),
			active: o.imageOpacityReactive,
			small: true,
			onClick: () => o.setImageOpacityReactive(!o.imageOpacityReactive)
		},
		{
			label: o.t.qa_rgb_audio,
			title: o.t.qa_rgb_audio_t,
			icon: makeIcon(Zap),
			active: o.rgbShiftAudioReactive,
			small: true,
			onClick: () => o.setRgbShiftAudioReactive(!o.rgbShiftAudioReactive)
		}
	];
}

// ──────────────────────────────────────────────────────────────────────────
// SPECTRUM
// ──────────────────────────────────────────────────────────────────────────

type SpectrumQuickTarget = 'main' | 'instance';

type BuildSpectrumActionsOptions = {
	t: Translations;
	/** Shared active target (editor + HUD). */
	activeTarget: SpectrumQuickTarget;
	setActiveTarget: (target: SpectrumQuickTarget) => void;
	/** Whether the second spectrum exists (so its tab can be offered). */
	hasSecondSpectrum: boolean;
	/** Resolved settings of the *active* target only. */
	targetVisible: boolean;
	toggleTargetVisible: () => void;
	targetMirror: boolean;
	targetPeakHold: boolean;
	targetFollowLogo: boolean;
	targetRadialFitLogo: boolean;
	targetPixelate: boolean;
	/** Writes a patch to the active target only (Spectrum 1 flat / Spectrum 2). */
	updateTarget: (
		patch: Partial<import('@/types/wallpaper').SpectrumInstanceSettings>
	) => void;
};

/**
 * One target-bound spectrum bank shared with the editor. The [S1|S2] selector
 * drives `activeSpectrumTarget`; every toggle below writes only the active
 * spectrum. No duplicate per-spectrum banks.
 */
export function buildSpectrumActions(
	o: BuildSpectrumActionsOptions
): QuickActionButtonProps[] {
	const editing =
		o.activeTarget === 'main'
			? o.t.spectrum_editing_main
			: o.t.spectrum_editing_second;
	return [
		{
			label: o.t.qa_spec_s1,
			title: o.t.qa_spec_target_t,
			icon: makeIcon(Activity),
			active: o.activeTarget === 'main',
			small: true,
			onClick: () => o.setActiveTarget('main')
		},
		{
			label: o.t.qa_spec_s2,
			title: o.t.qa_spec_target_t,
			icon: makeIcon(CircleDashed),
			active: o.activeTarget === 'instance',
			small: true,
			disabled: !o.hasSecondSpectrum,
			onClick: () => o.setActiveTarget('instance')
		},
		{
			label: o.t.qa_spec_visible,
			title: `${o.t.qa_spec_visible_t} — ${editing}`,
			icon: makeIcon(o.targetVisible ? Eye : EyeOff),
			active: o.targetVisible,
			small: true,
			onClick: () => o.toggleTargetVisible()
		},
		{
			label: o.t.qa_mirror,
			title: `${o.t.qa_spec_mirror_t} — ${editing}`,
			icon: makeIcon(FlipHorizontal),
			active: o.targetMirror,
			small: true,
			disabled: !o.targetVisible,
			onClick: () => o.updateTarget({ spectrumMirror: !o.targetMirror })
		},
		{
			label: o.t.qa_peak,
			title: `${o.t.qa_peak_t} — ${editing}`,
			icon: makeIcon(TrendingUp),
			active: o.targetPeakHold,
			small: true,
			disabled: !o.targetVisible,
			onClick: () =>
				o.updateTarget({ spectrumPeakHold: !o.targetPeakHold })
		},
		{
			label: o.t.qa_follow_logo,
			title: `${o.t.qa_follow_logo_t} — ${editing}`,
			icon: makeIcon(Target),
			active: o.targetFollowLogo,
			small: true,
			disabled: !o.targetVisible,
			onClick: () =>
				o.updateTarget({ spectrumFollowLogo: !o.targetFollowLogo })
		},
		{
			label: o.t.qa_fit_logo,
			title: `${o.t.qa_fit_logo_t} — ${editing}`,
			icon: makeIcon(Crosshair),
			active: o.targetRadialFitLogo,
			small: true,
			disabled: !o.targetVisible,
			onClick: () =>
				o.updateTarget({
					spectrumRadialFitLogo: !o.targetRadialFitLogo
				})
		},
		{
			label: o.t.qa_pixelate,
			title: `${o.t.qa_pixelate_t} — ${editing}`,
			icon: makeIcon(Square),
			active: o.targetPixelate,
			small: true,
			disabled: !o.targetVisible,
			onClick: () =>
				o.updateTarget({ spectrumPixelate: !o.targetPixelate })
		}
	];
}

// ──────────────────────────────────────────────────────────────────────────
// MOTION (particles + rain)
// ──────────────────────────────────────────────────────────────────────────

type BuildMotionActionsOptions = {
	t: Translations;
	motionPaused: boolean;
	setMotionPaused: (value: boolean) => void;
	stageLightsEnabled: boolean;
	setStageLightsEnabled: (value: boolean) => void;
	flashLightEnabled: boolean;
	setFlashLightEnabled: (value: boolean) => void;
	cameraMotionEnabled: boolean;
	setCameraMotionEnabled: (value: boolean) => void;
	cameraShakeEnabled: boolean;
	setCameraShakeEnabled: (value: boolean) => void;
	particleAudioReactive: boolean;
	setParticleAudioReactive: (value: boolean) => void;
	particleGlow: boolean;
	setParticleGlow: (value: boolean) => void;
	particleFadeInOut: boolean;
	setParticleFadeInOut: (value: boolean) => void;
	particleAudioDriftEnabled: boolean;
	setParticleAudioDriftEnabled: (value: boolean) => void;
	particleDepthFlowEnabled: boolean;
	setParticleDepthFlowEnabled: (value: boolean) => void;
};

/**
 * Motion shortcuts grouped by subsection so the HUD mirrors the Motion tab's
 * structure (Playback / Particles / Stage FX) instead of a flat button wrap.
 * The view model appends a "Slots" group for saved-profile loaders.
 */
export function buildMotionActions(
	o: BuildMotionActionsOptions
): QuickActionGroup[] {
	return [
		{
			label: o.t.qa_grp_sub_playback,
			actions: [
				{
					label: o.motionPaused ? o.t.qa_unfreeze : o.t.qa_freeze,
					title: o.motionPaused ? o.t.qa_unfreeze_t : o.t.qa_freeze_t,
					icon: makeIcon(o.motionPaused ? Sun : Moon),
					active: o.motionPaused,
					small: true,
					onClick: () => o.setMotionPaused(!o.motionPaused)
				}
			]
		},
		{
			label: o.t.qa_grp_sub_particles,
			actions: [
				{
					label: o.t.qa_part_audio,
					title: o.t.qa_part_audio_t,
					icon: makeIcon(Activity),
					active: o.particleAudioReactive,
					small: true,
					onClick: () =>
						o.setParticleAudioReactive(!o.particleAudioReactive)
				},
				{
					label: o.t.qa_part_glow,
					title: o.t.qa_part_glow_t,
					icon: makeIcon(Sun),
					active: o.particleGlow,
					small: true,
					onClick: () => o.setParticleGlow(!o.particleGlow)
				},
				{
					label: o.t.qa_part_fade,
					title: o.t.qa_part_fade_t,
					icon: makeIcon(Wand2),
					active: o.particleFadeInOut,
					small: true,
					onClick: () => o.setParticleFadeInOut(!o.particleFadeInOut)
				},
				{
					label: o.t.qa_part_wind,
					title: o.t.qa_part_wind_t,
					icon: makeIcon(Wind),
					active: o.particleAudioDriftEnabled,
					small: true,
					onClick: () =>
						o.setParticleAudioDriftEnabled(
							!o.particleAudioDriftEnabled
						)
				},
				{
					label: o.t.qa_part_depth,
					title: o.t.qa_part_depth_t,
					icon: makeIcon(CrosshairIcon),
					active: o.particleDepthFlowEnabled,
					small: true,
					onClick: () =>
						o.setParticleDepthFlowEnabled(
							!o.particleDepthFlowEnabled
						)
				}
			]
		},
		{
			label: o.t.qa_grp_sub_stagefx,
			actions: [
				{
					label: o.t.sfx_hud_stage_lights,
					title: o.t.sfx_hud_stage_lights,
					icon: makeIcon(Sun),
					active: o.stageLightsEnabled,
					small: true,
					onClick: () =>
						o.setStageLightsEnabled(!o.stageLightsEnabled)
				},
				{
					label: o.t.sfx_hud_flash_light,
					title: o.t.sfx_hud_flash_light,
					icon: makeIcon(Zap),
					active: o.flashLightEnabled,
					small: true,
					onClick: () => o.setFlashLightEnabled(!o.flashLightEnabled)
				},
				{
					label: o.t.sfx_hud_camera_motion,
					title: o.t.sfx_hud_camera_motion,
					icon: makeIcon(Move),
					active: o.cameraMotionEnabled,
					small: true,
					onClick: () =>
						o.setCameraMotionEnabled(!o.cameraMotionEnabled)
				},
				{
					label: o.t.sfx_hud_screen_shake,
					title: o.t.sfx_hud_screen_shake,
					icon: makeIcon(Activity),
					active: o.cameraShakeEnabled,
					small: true,
					onClick: () =>
						o.setCameraShakeEnabled(!o.cameraShakeEnabled)
				}
			]
		}
	];
}

// ──────────────────────────────────────────────────────────────────────────
// AUDIO
// ──────────────────────────────────────────────────────────────────────────

type BuildAudioActionsOptions = {
	t: Translations;
	audioReactive: boolean;
	setAudioReactive: (value: boolean) => void;
	audioCrossfadeEnabled: boolean;
	setAudioCrossfadeEnabled: (value: boolean) => void;
	audioAutoAdvance: boolean;
	setAudioAutoAdvance: (value: boolean) => void;
	audioFileLoop: boolean;
	setAudioFileLoop: (value: boolean) => void;
	mediaSessionEnabled: boolean;
	setMediaSessionEnabled: (value: boolean) => void;
	slideshowAudioCheckpointsEnabled: boolean;
	setSlideshowAudioCheckpointsEnabled: (value: boolean) => void;
	slideshowTrackChangeSyncEnabled: boolean;
	setSlideshowTrackChangeSyncEnabled: (value: boolean) => void;
	slideshowManualTimestampsEnabled: boolean;
	setSlideshowManualTimestampsEnabled: (value: boolean) => void;
	slideshowResetPosition: boolean;
	setSlideshowResetPosition: (value: boolean) => void;
};

export function buildAudioActions(
	o: BuildAudioActionsOptions
): QuickActionButtonProps[] {
	return [
		{
			label: o.t.qa_reactive,
			title: o.t.qa_reactive_t,
			icon: makeIcon(Activity),
			active: o.audioReactive,
			small: true,
			onClick: () => o.setAudioReactive(!o.audioReactive)
		},
		{
			label: o.t.qa_crossfade,
			title: o.t.qa_crossfade_t,
			icon: makeIcon(Shuffle),
			active: o.audioCrossfadeEnabled,
			small: true,
			onClick: () => o.setAudioCrossfadeEnabled(!o.audioCrossfadeEnabled)
		},
		{
			label: o.t.qa_auto_next,
			title: o.t.qa_auto_next_t,
			icon: makeIcon(SkipForward),
			active: o.audioAutoAdvance,
			small: true,
			onClick: () => o.setAudioAutoAdvance(!o.audioAutoAdvance)
		},
		{
			label: o.t.qa_loop,
			title: o.t.qa_loop_t,
			icon: makeIcon(Repeat),
			active: o.audioFileLoop,
			small: true,
			onClick: () => o.setAudioFileLoop(!o.audioFileLoop)
		},
		{
			label: o.t.qa_media_keys,
			title: o.t.qa_media_keys_t,
			icon: makeIcon(Radio),
			active: o.mediaSessionEnabled,
			small: true,
			onClick: () => o.setMediaSessionEnabled(!o.mediaSessionEnabled)
		},
		{
			label: o.t.qa_slide_audio,
			title: o.t.qa_slide_audio_t,
			icon: makeIcon(Images),
			active: o.slideshowAudioCheckpointsEnabled,
			small: true,
			onClick: () =>
				o.setSlideshowAudioCheckpointsEnabled(
					!o.slideshowAudioCheckpointsEnabled
				)
		},
		{
			label: o.t.qa_track_sync,
			title: o.t.qa_track_sync_t,
			icon: makeIcon(Shuffle),
			active: o.slideshowTrackChangeSyncEnabled,
			small: true,
			onClick: () =>
				o.setSlideshowTrackChangeSyncEnabled(
					!o.slideshowTrackChangeSyncEnabled
				)
		},
		{
			label: o.t.qa_manual_ts,
			title: o.t.qa_manual_ts_t,
			icon: makeIcon(MapPin),
			active: o.slideshowManualTimestampsEnabled,
			small: true,
			onClick: () =>
				o.setSlideshowManualTimestampsEnabled(
					!o.slideshowManualTimestampsEnabled
				)
		},
		{
			label: o.t.qa_reset_pos,
			title: o.t.qa_reset_pos_t,
			icon: makeIcon(SkipForward),
			active: o.slideshowResetPosition,
			small: true,
			onClick: () =>
				o.setSlideshowResetPosition(!o.slideshowResetPosition)
		}
	];
}

// ──────────────────────────────────────────────────────────────────────────
// LOGO
// ──────────────────────────────────────────────────────────────────────────

type BuildLogoActionsOptions = {
	t: Translations;
	logoVariantMode: LogoVariantMode;
	setLogoVariantMode: (value: LogoVariantMode) => void;
	isBuiltInLogo: boolean;
	onRestoreFactoryLogo: () => void;
	logoShadowEnabled: boolean;
	setLogoShadowEnabled: (value: boolean) => void;
	logoBackdropEnabled: boolean;
	setLogoBackdropEnabled: (value: boolean) => void;
};

export function buildLogoActions(
	o: BuildLogoActionsOptions
): QuickActionButtonProps[] {
	return [
		...(o.isBuiltInLogo
			? ([
					{
						label: o.t.logo_variant_vector.toUpperCase(),
						title: o.t.logo_source_builtin_vector,
						icon: makeIcon(Circle),
						active: o.logoVariantMode === 'vector',
						small: true,
						onClick: () => o.setLogoVariantMode('vector')
					},
					{
						label: o.t.logo_variant_pixel.toUpperCase(),
						title: o.t.logo_source_builtin_pixel,
						icon: makeIcon(Square),
						active: o.logoVariantMode === 'pixel',
						small: true,
						onClick: () => o.setLogoVariantMode('pixel')
					},
					{
						label: o.t.logo_variant_auto.toUpperCase(),
						title: o.t.hint_logo_variant_auto,
						icon: makeIcon(Wand2),
						active: o.logoVariantMode === 'auto',
						small: true,
						onClick: () => o.setLogoVariantMode('auto')
					}
				] satisfies QuickActionButtonProps[])
			: ([
					{
						label: o.t.restore_vibrix_logo.toUpperCase(),
						title: o.t.confirm_restore_vibrix_logo_message,
						icon: makeIcon(ImageIcon),
						small: true,
						onClick: o.onRestoreFactoryLogo
					}
				] satisfies QuickActionButtonProps[])),
		{
			label: o.t.qa_shadow,
			title: o.t.qa_shadow_t,
			icon: makeIcon(Moon),
			active: o.logoShadowEnabled,
			small: true,
			onClick: () => o.setLogoShadowEnabled(!o.logoShadowEnabled)
		},
		{
			label: o.t.qa_backdrop,
			title: o.t.qa_logo_backdrop_t,
			icon: makeIcon(Square),
			active: o.logoBackdropEnabled,
			small: true,
			onClick: () => o.setLogoBackdropEnabled(!o.logoBackdropEnabled)
		}
	];
}

// ──────────────────────────────────────────────────────────────────────────
// TRACK TITLE
// ──────────────────────────────────────────────────────────────────────────

type BuildTitleActionsOptions = {
	t: Translations;
	audioTrackTitleBackdropEnabled: boolean;
	setAudioTrackTitleBackdropEnabled: (value: boolean) => void;
	audioTrackTitleUppercase: boolean;
	setAudioTrackTitleUppercase: (value: boolean) => void;
};

export function buildTitleActions(
	o: BuildTitleActionsOptions
): QuickActionButtonProps[] {
	return [
		{
			label: o.t.qa_backdrop,
			title: o.t.qa_title_backdrop_t,
			icon: makeIcon(Square),
			active: o.audioTrackTitleBackdropEnabled,
			small: true,
			onClick: () =>
				o.setAudioTrackTitleBackdropEnabled(
					!o.audioTrackTitleBackdropEnabled
				)
		},
		{
			label: o.t.qa_uppercase,
			title: o.t.qa_uppercase_t,
			icon: makeIcon(Type),
			active: o.audioTrackTitleUppercase,
			small: true,
			onClick: () =>
				o.setAudioTrackTitleUppercase(!o.audioTrackTitleUppercase)
		}
	];
}

// ──────────────────────────────────────────────────────────────────────────
// SYSTEM
// ──────────────────────────────────────────────────────────────────────────

type BuildSystemActionsOptions = {
	t: Translations;
	showFps: boolean;
	setShowFps: (value: boolean) => void;
	sleepModeEnabled: boolean;
	setSleepModeEnabled: (value: boolean) => void;
	layoutResponsiveEnabled: boolean;
	setLayoutResponsiveEnabled: (value: boolean) => void;
	layoutBackgroundReframeEnabled: boolean;
	setLayoutBackgroundReframeEnabled: (value: boolean) => void;
	performanceSafeEnabled: boolean;
	setPerformanceSafeEnabled: (value: boolean) => void;
	virtualFoldersEnabled: boolean;
	setVirtualFoldersEnabled: (value: boolean) => void;
	showBackgroundScaleMeter: boolean;
	setShowBackgroundScaleMeter: (value: boolean) => void;
	showSpectrumDiagnosticsHud: boolean;
	setShowSpectrumDiagnosticsHud: (value: boolean) => void;
	showLogoDiagnosticsHud: boolean;
	setShowLogoDiagnosticsHud: (value: boolean) => void;
	showSetlistHud: boolean;
	setShowSetlistHud: (value: boolean) => void;
};

export function buildSystemActions(
	o: BuildSystemActionsOptions
): QuickActionButtonProps[] {
	return [
		// FULLSCREEN intentionally not duplicated here — the HUD's header
		// already exposes it; surfacing it twice was the audit's first hit.
		{
			label: o.t.qa_fps,
			title: o.t.qa_fps_t,
			icon: makeIcon(Gauge),
			active: o.showFps,
			small: true,
			onClick: () => o.setShowFps(!o.showFps)
		},
		{
			label: o.t.qa_sleep,
			title: o.t.qa_sleep_t,
			icon: makeIcon(Moon),
			active: o.sleepModeEnabled,
			small: true,
			onClick: () => o.setSleepModeEnabled(!o.sleepModeEnabled)
		},
		{
			label: o.t.qa_perf_safe,
			title: o.t.qa_perf_safe_t,
			icon: makeIcon(Cpu),
			active: o.performanceSafeEnabled,
			small: true,
			onClick: () =>
				o.setPerformanceSafeEnabled(!o.performanceSafeEnabled)
		},
		{
			label: o.t.qa_responsive,
			title: o.t.qa_responsive_t,
			icon: makeIcon(Smartphone),
			active: o.layoutResponsiveEnabled,
			small: true,
			onClick: () =>
				o.setLayoutResponsiveEnabled(!o.layoutResponsiveEnabled)
		},
		{
			label: o.t.qa_bg_reframe,
			title: o.t.qa_bg_reframe_t,
			icon: makeIcon(Ruler),
			active: o.layoutBackgroundReframeEnabled,
			small: true,
			onClick: () =>
				o.setLayoutBackgroundReframeEnabled(
					!o.layoutBackgroundReframeEnabled
				)
		},
		{
			label: o.t.qa_folders,
			title: o.t.qa_folders_t,
			icon: makeIcon(FolderTree),
			active: o.virtualFoldersEnabled,
			small: true,
			onClick: () => o.setVirtualFoldersEnabled(!o.virtualFoldersEnabled)
		},
		{
			label: o.t.qa_bg_meter,
			title: o.t.qa_bg_meter_t,
			icon: makeIcon(Ruler),
			active: o.showBackgroundScaleMeter,
			small: true,
			onClick: () =>
				o.setShowBackgroundScaleMeter(!o.showBackgroundScaleMeter)
		},
		{
			label: o.t.qa_spec_diag,
			title: o.t.qa_spec_diag_t,
			icon: makeIcon(o.showSpectrumDiagnosticsHud ? Eye : EyeOff),
			active: o.showSpectrumDiagnosticsHud,
			small: true,
			onClick: () =>
				o.setShowSpectrumDiagnosticsHud(!o.showSpectrumDiagnosticsHud)
		},
		{
			label: o.t.qa_logo_diag,
			title: o.t.qa_logo_diag_t,
			icon: makeIcon(o.showLogoDiagnosticsHud ? Eye : EyeOff),
			active: o.showLogoDiagnosticsHud,
			small: true,
			onClick: () =>
				o.setShowLogoDiagnosticsHud(!o.showLogoDiagnosticsHud)
		},
		// QUICK EDIT toggle removed — the per-image overrides now live
		// inside the HUD as the `PER IMG` header panel, so toggling its
		// visibility separately is redundant with toggling the HUD itself.
		{
			label: o.t.qa_setlist_hud,
			title: o.t.qa_setlist_hud_t,
			icon: makeIcon(ListChecks),
			active: o.showSetlistHud,
			small: true,
			onClick: () => o.setShowSetlistHud(!o.showSetlistHud)
		}
	];
}

// ──────────────────────────────────────────────────────────────────────────
// THEMES
// ──────────────────────────────────────────────────────────────────────────

type BuildThemeActionsOptions = {
	t: Translations;
	editorTheme: EditorThemeOption;
	setEditorTheme: (value: EditorThemeOption) => void;
	colorSource: 'manual' | 'theme' | 'image';
	setColorSource: (value: 'manual' | 'theme' | 'image') => void;
};

const THEME_ICONS: Record<
	string,
	React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
	cyber: Zap,
	glass: Square,
	sunset: Sun,
	terminal: Monitor,
	midnight: Moon,
	carbon: Square,
	aurora: Palette,
	rose: Palette,
	ocean: Waves,
	amber: Sun,
	rainbow: Palette
};

export function buildThemeActions({
	t,
	editorTheme,
	setEditorTheme,
	colorSource,
	setColorSource
}: BuildThemeActionsOptions) {
	const colorSourceLabel: Record<'manual' | 'theme' | 'image', string> = {
		manual: t.qa_cs_manual,
		theme: t.qa_cs_theme,
		image: t.qa_cs_bgimg
	};
	const colorSourceTitle: Record<'manual' | 'theme' | 'image', string> = {
		manual: t.qa_cs_manual_t,
		theme: t.qa_cs_theme_t,
		image: t.qa_cs_bgimg_t
	};
	return {
		themeActions: EDITOR_THEMES.map(
			theme =>
				({
					label: theme.toUpperCase(),
					title: `Theme: ${theme}`,
					icon: makeIcon(THEME_ICONS[theme] ?? Palette),
					active: editorTheme === theme,
					small: true,
					onClick: () => setEditorTheme(theme as EditorThemeOption)
				}) satisfies QuickActionButtonProps
		),
		colorSourceActions: (['manual', 'theme', 'image'] as const).map(
			source => ({
				label: colorSourceLabel[source],
				title: colorSourceTitle[source],
				icon: makeIcon(
					source === 'manual'
						? SlidersHorizontal
						: source === 'theme'
							? Palette
							: ImageIcon
				),
				active: colorSource === source,
				small: true,
				onClick: () => setColorSource(source)
			})
		)
	};
}
