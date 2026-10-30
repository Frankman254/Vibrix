import { useMemo } from 'react';
import {
	CloudRain,
	Lightbulb,
	RotateCcw,
	Sparkles,
	Video,
	Wand2
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
	doProfileSettingsMatch,
	extractCameraFxProfileSettings,
	extractLightsProfileSettings,
	extractParticlesProfileSettings,
	extractRainProfileSettings
} from '@/store/featureProfiles';
import { PARTICLE_LIMITS } from '@/store/defaultState';
import { useT } from '@/lib/i18n';
import { useTabViewState } from '@/hooks/useTabViewState';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type {
	AudioReactiveChannel,
	ColorSourceMode,
	ParticleColorMode,
	ParticleRotationDirection,
	ParticleShape,
	WallpaperState
} from '@/types/wallpaper';
import { useDialog } from '@/editor/DialogProvider';
import {
	Button,
	EditorTabFooter,
	EditorTabHeader,
	EditorTabLayout,
	SectionCard,
	SegmentedControl,
	ICON_SIZE
} from '@/ui';
// MotionTab is a composition shell, not a domain: it stacks sections owned by
// three different features. Each one comes in through its own facade.
import {
	ParticlesAppearanceSection,
	ParticlesLayerSection,
	ParticlesProfilesSection
} from '@/features/particles/ui';
import { RainProfilesSection, RainSection } from '@/features/rain/ui';
import {
	CameraFxProfilesSection,
	CameraMotionSection,
	FlashLightSection,
	LightsProfilesSection,
	ScreenShakeSection,
	StageLightsSection
} from '@/features/stageFx/ui';
import { useIsSimple } from '@/editor/UIMode';

type MotionView = 'particles' | 'rain' | 'lights' | 'camera';
const MODERN_MOTION_VIEW_STORAGE_KEY = 'lwag-modern-motion-view';

function isMotionView(value: unknown): value is MotionView {
	return (
		value === 'particles' ||
		value === 'rain' ||
		value === 'lights' ||
		value === 'camera'
	);
}

export default function MotionTab({
	onResetParticles,
	onResetRain
}: {
	onResetParticles: () => void;
	onResetRain: () => void;
}) {
	const t = useT();
	const { confirm } = useDialog();
	const isSimple = useIsSimple();
	const store = useWallpaperStore(
		useShallow(s => ({
			performanceMode: s.performanceMode,
			particlesEnabled: s.particlesEnabled,
			particleLayerMode: s.particleLayerMode,
			particleShape: s.particleShape,
			particleCount: s.particleCount,
			particleSpeed: s.particleSpeed,
			particleLifetime: s.particleLifetime,
			particleColorMode: s.particleColorMode,
			particleColorSource: s.particleColorSource,
			particleColor1: s.particleColor1,
			particleColor2: s.particleColor2,
			particleOpacity: s.particleOpacity,
			particleSizeMin: s.particleSizeMin,
			particleSizeMax: s.particleSizeMax,
			particleFadeInOut: s.particleFadeInOut,
			particleGlow: s.particleGlow,
			particleGlowStrength: s.particleGlowStrength,
			particleGlowReach: s.particleGlowReach,
			particleGlowAudioAmount: s.particleGlowAudioAmount,
			particleRotationIntensity: s.particleRotationIntensity,
			particleRotationDirection: s.particleRotationDirection,
			particleFilterBrightness: s.particleFilterBrightness,
			particleFilterContrast: s.particleFilterContrast,
			particleFilterSaturation: s.particleFilterSaturation,
			particleFilterBlur: s.particleFilterBlur,
			particleFilterHueRotate: s.particleFilterHueRotate,
			particleAudioReactive: s.particleAudioReactive,
			particleAudioChannel: s.particleAudioChannel,
			particleAudioSmoothing: s.particleAudioSmoothing,
			particleAudioSizeBoost: s.particleAudioSizeBoost,
			particleAudioOpacityBoost: s.particleAudioOpacityBoost,
			particleAudioAttack: s.particleAudioAttack,
			particleAudioRelease: s.particleAudioRelease,
			particleAudioReactivitySpeed: s.particleAudioReactivitySpeed,
			particleAudioPeakWindow: s.particleAudioPeakWindow,
			particleAudioPeakFloor: s.particleAudioPeakFloor,
			particleAudioPunch: s.particleAudioPunch,
			particleAudioDriftEnabled: s.particleAudioDriftEnabled,
			particleAudioDriftAngle: s.particleAudioDriftAngle,
			particleAudioDriftAmount: s.particleAudioDriftAmount,
			particleAudioDriftBase: s.particleAudioDriftBase,
			particleAudioDriftChannel: s.particleAudioDriftChannel,
			particleAudioDriftThreshold: s.particleAudioDriftThreshold,
			particleAudioDriftRelease: s.particleAudioDriftRelease,
			particleAudioDriftMode: s.particleAudioDriftMode,
			particleDepthFlowEnabled: s.particleDepthFlowEnabled,
			particleDepthFlowAmount: s.particleDepthFlowAmount,
			particleDepthFlowDirection: s.particleDepthFlowDirection,
			particleDepthFlowChannel: s.particleDepthFlowChannel,
			particleDepthFlowThreshold: s.particleDepthFlowThreshold,
			particleDepthFlowSensitivity: s.particleDepthFlowSensitivity,
			particleDepthFlowAttack: s.particleDepthFlowAttack,
			particleDepthFlowRelease: s.particleDepthFlowRelease,
			particleDepthFlowSpeed: s.particleDepthFlowSpeed,
			particleDepthFlowSpread: s.particleDepthFlowSpread,
			particleDepthFlowFocusX: s.particleDepthFlowFocusX,
			particleDepthFlowFocusY: s.particleDepthFlowFocusY,
			particleDepthFlowMode: s.particleDepthFlowMode,
			particleDepthFlowSpawnOrigin: s.particleDepthFlowSpawnOrigin,
			particleDepthFlowInvertFocusOnLowEnergy:
				s.particleDepthFlowInvertFocusOnLowEnergy,
			particleDepthFlowInvertFocusAxis:
				s.particleDepthFlowInvertFocusAxis,
			particleDepthFlowWindInfluence: s.particleDepthFlowWindInfluence,
			particlesProfileSlots: s.particlesProfileSlots,
			setParticlesEnabled: s.setParticlesEnabled,
			setParticleLayerMode: s.setParticleLayerMode,
			setParticleShape: s.setParticleShape,
			setParticleCount: s.setParticleCount,
			setParticleSpeed: s.setParticleSpeed,
			setParticleLifetime: s.setParticleLifetime,
			randomizeMotion: s.randomizeMotion,
			setParticleColorMode: s.setParticleColorMode,
			setParticleColorSource: s.setParticleColorSource,
			setParticleColor1: s.setParticleColor1,
			setParticleColor2: s.setParticleColor2,
			setParticleOpacity: s.setParticleOpacity,
			setParticleSizeMin: s.setParticleSizeMin,
			setParticleSizeMax: s.setParticleSizeMax,
			setParticleFadeInOut: s.setParticleFadeInOut,
			setParticleGlow: s.setParticleGlow,
			setParticleGlowStrength: s.setParticleGlowStrength,
			setParticleGlowReach: s.setParticleGlowReach,
			setParticleGlowAudioAmount: s.setParticleGlowAudioAmount,
			setParticleRotationIntensity: s.setParticleRotationIntensity,
			setParticleRotationDirection: s.setParticleRotationDirection,
			setParticleFilterBrightness: s.setParticleFilterBrightness,
			setParticleFilterContrast: s.setParticleFilterContrast,
			setParticleFilterSaturation: s.setParticleFilterSaturation,
			setParticleFilterBlur: s.setParticleFilterBlur,
			setParticleFilterHueRotate: s.setParticleFilterHueRotate,
			setParticleAudioReactive: s.setParticleAudioReactive,
			setParticleAudioChannel: s.setParticleAudioChannel,
			setParticleAudioSmoothing: s.setParticleAudioSmoothing,
			setParticleAudioSizeBoost: s.setParticleAudioSizeBoost,
			setParticleAudioOpacityBoost: s.setParticleAudioOpacityBoost,
			setParticleAudioAttack: s.setParticleAudioAttack,
			setParticleAudioRelease: s.setParticleAudioRelease,
			setParticleAudioReactivitySpeed: s.setParticleAudioReactivitySpeed,
			setParticleAudioPeakWindow: s.setParticleAudioPeakWindow,
			setParticleAudioPeakFloor: s.setParticleAudioPeakFloor,
			setParticleAudioPunch: s.setParticleAudioPunch,
			setParticleAudioDriftEnabled: s.setParticleAudioDriftEnabled,
			setParticleAudioDriftAngle: s.setParticleAudioDriftAngle,
			setParticleAudioDriftAmount: s.setParticleAudioDriftAmount,
			setParticleAudioDriftBase: s.setParticleAudioDriftBase,
			setParticleAudioDriftChannel: s.setParticleAudioDriftChannel,
			setParticleAudioDriftThreshold: s.setParticleAudioDriftThreshold,
			setParticleAudioDriftRelease: s.setParticleAudioDriftRelease,
			setParticleAudioDriftMode: s.setParticleAudioDriftMode,
			setParticleDepthFlowEnabled: s.setParticleDepthFlowEnabled,
			setParticleDepthFlowAmount: s.setParticleDepthFlowAmount,
			setParticleDepthFlowDirection: s.setParticleDepthFlowDirection,
			setParticleDepthFlowChannel: s.setParticleDepthFlowChannel,
			setParticleDepthFlowThreshold: s.setParticleDepthFlowThreshold,
			setParticleDepthFlowSensitivity: s.setParticleDepthFlowSensitivity,
			setParticleDepthFlowAttack: s.setParticleDepthFlowAttack,
			setParticleDepthFlowRelease: s.setParticleDepthFlowRelease,
			setParticleDepthFlowSpeed: s.setParticleDepthFlowSpeed,
			setParticleDepthFlowSpread: s.setParticleDepthFlowSpread,
			setParticleDepthFlowFocusX: s.setParticleDepthFlowFocusX,
			setParticleDepthFlowFocusY: s.setParticleDepthFlowFocusY,
			setParticleDepthFlowMode: s.setParticleDepthFlowMode,
			setParticleDepthFlowSpawnOrigin: s.setParticleDepthFlowSpawnOrigin,
			setParticleDepthFlowInvertFocusOnLowEnergy:
				s.setParticleDepthFlowInvertFocusOnLowEnergy,
			setParticleDepthFlowInvertFocusAxis:
				s.setParticleDepthFlowInvertFocusAxis,
			setParticleDepthFlowWindInfluence:
				s.setParticleDepthFlowWindInfluence,
			loadParticlesProfileSlot: s.loadParticlesProfileSlot,
			saveParticlesProfileSlot: s.saveParticlesProfileSlot,
			addParticlesProfileSlot: s.addParticlesProfileSlot,
			removeParticlesProfileSlot: s.removeParticlesProfileSlot,
			rainEnabled: s.rainEnabled,
			rainIntensity: s.rainIntensity,
			rainDropCount: s.rainDropCount,
			rainSpeed: s.rainSpeed,
			rainAngle: s.rainAngle,
			rainMeshRotationZ: s.rainMeshRotationZ,
			rainColorSource: s.rainColorSource,
			rainColor: s.rainColor,
			rainColorMode: s.rainColorMode,
			rainParticleType: s.rainParticleType,
			rainLength: s.rainLength,
			rainWidth: s.rainWidth,
			rainBlur: s.rainBlur,
			rainVariation: s.rainVariation,
			rainProfileSlots: s.rainProfileSlots,
			setRainEnabled: s.setRainEnabled,
			setRainIntensity: s.setRainIntensity,
			setRainDropCount: s.setRainDropCount,
			setRainSpeed: s.setRainSpeed,
			setRainAngle: s.setRainAngle,
			setRainMeshRotationZ: s.setRainMeshRotationZ,
			setRainColorSource: s.setRainColorSource,
			setRainColor: s.setRainColor,
			setRainColorMode: s.setRainColorMode,
			setRainParticleType: s.setRainParticleType,
			setRainLength: s.setRainLength,
			setRainWidth: s.setRainWidth,
			setRainBlur: s.setRainBlur,
			setRainVariation: s.setRainVariation,
			loadRainProfileSlot: s.loadRainProfileSlot,
			saveRainProfileSlot: s.saveRainProfileSlot,
			addRainProfileSlot: s.addRainProfileSlot,
			removeRainProfileSlot: s.removeRainProfileSlot,
			stageLightsEnabled: s.stageLightsEnabled,
			flashLightEnabled: s.flashLightEnabled,
			cameraMotionEnabled: s.cameraMotionEnabled,
			cameraShakeEnabled: s.cameraShakeEnabled,
			lightsProfileSlots: s.lightsProfileSlots,
			loadLightsProfileSlot: s.loadLightsProfileSlot,
			saveLightsProfileSlot: s.saveLightsProfileSlot,
			addLightsProfileSlot: s.addLightsProfileSlot,
			removeLightsProfileSlot: s.removeLightsProfileSlot,
			cameraFxProfileSlots: s.cameraFxProfileSlots,
			loadCameraFxProfileSlot: s.loadCameraFxProfileSlot,
			saveCameraFxProfileSlot: s.saveCameraFxProfileSlot,
			addCameraFxProfileSlot: s.addCameraFxProfileSlot,
			removeCameraFxProfileSlot: s.removeCameraFxProfileSlot
		}))
	);

	const fullStore = useWallpaperStore.getState() as WallpaperState;
	const currentParticles = extractParticlesProfileSettings(fullStore);
	const activeParticlesIndex = store.particlesProfileSlots.findIndex(slot =>
		doProfileSettingsMatch(currentParticles, slot.values)
	);
	const currentRain = extractRainProfileSettings(fullStore);
	const activeRainIndex = store.rainProfileSlots.findIndex(slot =>
		doProfileSettingsMatch(currentRain, slot.values)
	);
	const currentLights = extractLightsProfileSettings(fullStore);
	const activeLightsIndex = store.lightsProfileSlots.findIndex(slot =>
		doProfileSettingsMatch(currentLights, slot.values)
	);
	const currentCamera = extractCameraFxProfileSettings(fullStore);
	const activeCameraIndex = store.cameraFxProfileSlots.findIndex(slot =>
		doProfileSettingsMatch(currentCamera, slot.values)
	);
	const [motionView, handleMotionViewChange] = useTabViewState<MotionView>(
		'motion',
		'particles',
		isMotionView,
		{ legacyStorageKey: MODERN_MOTION_VIEW_STORAGE_KEY }
	);
	const particleLimit = PARTICLE_LIMITS[store.performanceMode];
	const effectiveParticleCount = Math.min(store.particleCount, particleLimit);

	const colorSourceLabels = useMemo(
		() =>
			({
				manual: t.label_manual_color,
				image: t.label_current_image,
				theme: t.label_theme
			}) satisfies Record<ColorSourceMode, string>,
		[t]
	);
	const particleColorModeLabels = useMemo(
		() =>
			({
				solid: t.particle_color_solid,
				gradient: t.particle_color_gradient,
				rainbow: t.particle_color_rainbow,
				rotateRgb: t.particle_color_rotate_rgb,
				completeRotate: t.particle_color_complete_rotate
			}) satisfies Record<ParticleColorMode, string>,
		[t]
	);
	const particleShapeLabels = useMemo(
		() =>
			({
				circles: t.particle_shape_circle,
				squares: t.particle_shape_square,
				triangles: t.particle_shape_triangle,
				stars: t.particle_shape_star,
				plus: t.particle_shape_plus,
				minus: t.particle_shape_minus,
				diamonds: t.particle_shape_diamond,
				cross: t.particle_shape_cross,
				all: t.particle_shape_mix
			}) satisfies Record<ParticleShape, string>,
		[t]
	);
	const particleRotationLabels = useMemo(
		() =>
			({
				clockwise: t.particle_rotation_cw,
				counterclockwise: t.particle_rotation_ccw
			}) satisfies Record<ParticleRotationDirection, string>,
		[t]
	);
	const audioChannelLabels = useMemo(
		() =>
			({
				auto: t.channel_auto,
				kick: t.channel_kick,
				instrumental: t.channel_instrumental,
				bass: t.channel_bass,
				hihat: t.channel_hihat,
				vocal: t.channel_vocal,
				full: t.channel_full
			}) satisfies Record<AudioReactiveChannel, string>,
		[t]
	);

	async function handleSaveParticlesSlot(index: number) {
		const slot = store.particlesProfileSlots[index];
		if (slot?.values) {
			const ok = await confirm({
				title: t.label_save_profile,
				message: t.confirm_overwrite_profile,
				confirmLabel: t.label_save_profile,
				cancelLabel: t.label_cancel,
				tone: 'warning'
			});
			if (!ok) return;
		}
		store.saveParticlesProfileSlot(index);
	}

	async function handleSaveRainSlot(index: number) {
		const slot = store.rainProfileSlots[index];
		if (slot?.values) {
			const ok = await confirm({
				title: t.label_save_profile,
				message: t.confirm_overwrite_profile,
				confirmLabel: t.label_save_profile,
				cancelLabel: t.label_cancel,
				tone: 'warning'
			});
			if (!ok) return;
		}
		store.saveRainProfileSlot(index);
	}

	async function handleSaveLightsSlot(index: number) {
		const slot = store.lightsProfileSlots[index];
		if (slot?.values) {
			const ok = await confirm({
				title: t.label_save_profile,
				message: t.confirm_overwrite_profile,
				confirmLabel: t.label_save_profile,
				cancelLabel: t.label_cancel,
				tone: 'warning'
			});
			if (!ok) return;
		}
		store.saveLightsProfileSlot(index);
	}

	async function handleSaveCameraSlot(index: number) {
		const slot = store.cameraFxProfileSlots[index];
		if (slot?.values) {
			const ok = await confirm({
				title: t.label_save_profile,
				message: t.confirm_overwrite_profile,
				confirmLabel: t.label_save_profile,
				cancelLabel: t.label_cancel,
				tone: 'warning'
			});
			if (!ok) return;
		}
		store.saveCameraFxProfileSlot(index);
	}

	const quickAdjust = (
		<SectionCard
			title={t.quick_adjust_section}
			subtitle={t.quick_adjust_subtitle}
			density="compact"
		>
			<div className="grid grid-cols-2 gap-1.5">
				<Button
					type="button"
					onClick={() => store.randomizeMotion('manual')}
					size="sm"
					density="compact"
					variant="secondary"
					icon={<Wand2 size={ICON_SIZE.xs} />}
				>
					{t.btn_random_any}
				</Button>
				<Button
					type="button"
					onClick={() => store.randomizeMotion('image')}
					size="sm"
					density="compact"
					variant="secondary"
					icon={<Wand2 size={ICON_SIZE.xs} />}
				>
					{t.btn_random_image}
				</Button>
			</div>
		</SectionCard>
	);

	const particlesLayer = (
		<ParticlesLayerSection
			store={store}
			effectiveParticleCount={effectiveParticleCount}
			particleLimit={particleLimit}
			particleShapeLabels={particleShapeLabels}
			labels={{
				title: t.section_particles_layer_density,
				layerMode: t.label_layer_mode,
				particleShape: t.label_particle_shape,
				count: t.label_count,
				speed: t.label_speed,
				lifetime: t.label_particle_lifetime,
				lifetimeHint: t.hint_particle_lifetime,
				enabled: t.label_enabled
			}}
		/>
	);

	const particlesAppearance = store.particlesEnabled ? (
		<ParticlesAppearanceSection
			store={store}
			particleColorModeLabels={particleColorModeLabels}
			colorSourceLabels={colorSourceLabels}
			particleRotationLabels={particleRotationLabels}
			audioChannelLabels={audioChannelLabels}
			labels={{
				title: t.section_appearance,
				subtitle: t.hint_particle_appearance,
				colorMode: t.label_color_mode,
				colorSource: t.label_color_source,
				color1: t.label_color_1,
				color2: t.label_color_2,
				themeHint: t.hint_theme_palette_auto,
				imageHint: t.hint_background_palette_auto,
				opacity: t.label_opacity,
				particleDetails: t.label_particle_details,
				sizeMin: t.label_size_min,
				sizeMax: t.label_size_max,
				fadeInOut: t.label_fade_in_out,
				glow: t.label_glow,
				glowStrength: t.label_glow_strength,
				glowReach: t.label_glow_reach,
				audioGlowAmount: t.label_audio_glow,
				motionFilters: t.section_particle_motion_filters,
				rotationIntensity: t.label_rotation_intensity,
				direction: t.label_direction,
				brightness: t.label_brightness,
				contrast: t.label_contrast,
				saturation: t.label_saturation,
				blur: t.label_blur,
				hueRotate: t.label_hue_rotate,
				audioResponse: t.section_particle_audio_response,
				audioReactive: t.label_audio_reactive,
				audioChannel: t.label_audio_channel,
				audioSizeBoost: t.label_audio_size_boost,
				audioOpacityBoost: t.label_audio_opacity_boost,
				audioDirectionalDrift: t.label_audio_directional_drift,
				audioDirectionalDriftHint: isSimple
					? t.hint_audio_directional_drift
					: t.hint_audio_wind,
				audioDriftMode: t.label_drift_mode,
				audioDriftAngle: t.label_drift_angle,
				audioDriftAmount: t.label_drift_amount,
				audioDriftBase: t.label_drift_base,
				audioDriftThreshold: t.label_drift_threshold,
				audioDriftRelease: t.label_particle_release,
				depthFlow: t.label_depth_flow,
				depthFlowHint: t.hint_depth_flow,
				depthFlowDirection: t.label_direction,
				depthFlowMode: t.label_depth_flow_mode,
				depthFlowSpawnOrigin: t.label_depth_flow_spawn_origin,
				depthFlowAmount: t.label_drift_amount,
				depthFlowFocusX: t.label_depth_flow_focus_x,
				depthFlowFocusY: t.label_depth_flow_focus_y,
				depthFlowFocusHint: t.hint_depth_flow_focus,
				centerFocus: t.label_particle_center_focus,
				depthFlowInvertFocusOnLowEnergy:
					'Invert focus when particles stop',
				depthFlowInvertFocusAxis: 'Invert axis',
				depthFlowThreshold: t.label_drift_threshold,
				depthFlowSensitivity: t.label_depth_flow_sensitivity,
				depthFlowAttack: t.label_particle_attack,
				depthFlowRelease: t.label_particle_release,
				depthFlowSpeed: t.label_depth_flow_speed,
				depthFlowSpread: t.label_depth_flow_spread,
				depthFlowWindInfluence: t.label_depth_flow_wind_influence
			}}
			isSimple={isSimple}
		/>
	) : null;

	const rainBlock = (
		<RainSection
			store={store}
			colorSourceLabels={colorSourceLabels}
			showSavedProfiles={false}
			labels={{
				title: t.tab_rain,
				subtitle: t.hint_rain_low_perf,
				enabled: t.label_rain_enabled,
				intensity: t.label_rain_intensity,
				count: t.label_rain_count,
				speed: t.label_rain_speed,
				direction: t.section_rain_direction,
				angle: t.label_rain_angle,
				rotationZ: t.label_rain_rotation_z,
				style: t.section_rain_style,
				colorSource: t.label_color_source,
				color: t.label_rain_color,
				colorMode: t.label_color_mode,
				colorModes: {
					solid: t.particle_color_solid,
					rainbow: t.particle_color_rainbow,
					completeRotate: t.particle_color_complete_rotate
				},
				type: t.label_rain_type,
				length: t.label_rain_length,
				width: t.label_rain_width,
				blur: t.label_rain_blur,
				variation: t.label_variation,
				themeHint: t.hint_theme_palette_auto,
				imageHint: t.hint_background_palette_auto,
				savedProfiles: t.section_saved_profiles,
				load: t.label_load_profile,
				save: t.label_save_profile,
				slot: t.label_profile_slot,
				empty: t.profile_slot_empty,
				active: t.profile_slot_active
			}}
		/>
	);

	const profileLabels = (subtitlePrefix: string) => ({
		title: t.section_saved_profiles,
		subtitle: `${subtitlePrefix} · ${t.hint_saved_profiles}`,
		load: t.label_load_profile,
		save: t.label_save_profile,
		empty: t.profile_slot_empty,
		active: t.profile_slot_active
	});

	// Saved-profile slots stay in the canonical position (directly under the
	// header, via EditorTabLayout's `savedProfiles` slot) — same as every other
	// tab. Only the active sub-view's slots are shown.
	const motionSavedProfiles =
		motionView === 'particles' ? (
			<ParticlesProfilesSection
				store={store}
				activeIndex={
					activeParticlesIndex >= 0 ? activeParticlesIndex : null
				}
				onSave={index => void handleSaveParticlesSlot(index)}
				labels={profileLabels(t.tab_particles)}
			/>
		) : motionView === 'rain' ? (
			<RainProfilesSection
				store={store}
				activeIndex={activeRainIndex >= 0 ? activeRainIndex : null}
				onSave={index => void handleSaveRainSlot(index)}
				labels={profileLabels(t.tab_rain)}
			/>
		) : motionView === 'lights' ? (
			<LightsProfilesSection
				store={store}
				activeIndex={activeLightsIndex >= 0 ? activeLightsIndex : null}
				onSave={index => void handleSaveLightsSlot(index)}
				labels={profileLabels(t.tab_lights)}
			/>
		) : (
			<CameraFxProfilesSection
				store={store}
				activeIndex={activeCameraIndex >= 0 ? activeCameraIndex : null}
				onSave={index => void handleSaveCameraSlot(index)}
				labels={profileLabels(t.tab_camera)}
			/>
		);

	const particlesView = (
		<>
			{quickAdjust}
			{particlesLayer}
			{particlesAppearance}
		</>
	);

	const rainView = rainBlock;

	const lightsView = (
		<>
			<StageLightsSection />
			<FlashLightSection />
		</>
	);

	const cameraView = (
		<>
			<CameraMotionSection />
			<ScreenShakeSection />
		</>
	);

	return (
		<EditorTabLayout
			header={
				<EditorTabHeader title={t.tab_motion}>
					<SegmentedControl<MotionView>
						value={motionView}
						onChange={handleMotionViewChange}
						options={[
							{
								value: 'particles',
								label: t.tab_particles,
								icon: <Sparkles size={ICON_SIZE.xs} />
							},
							{
								value: 'rain',
								label: t.tab_rain,
								icon: <CloudRain size={ICON_SIZE.xs} />
							},
							{
								value: 'lights',
								label: t.tab_lights,
								icon: <Lightbulb size={ICON_SIZE.xs} />
							},
							{
								value: 'camera',
								label: t.tab_camera,
								icon: <Video size={ICON_SIZE.xs} />
							}
						]}
						size="sm"
						density="compact"
						full
						ariaLabel={t.tab_motion}
					/>
				</EditorTabHeader>
			}
			savedProfiles={motionSavedProfiles}
			footer={
				isSimple ||
				(motionView !== 'particles' &&
					motionView !== 'rain') ? undefined : (
					<EditorTabFooter title={t.label_reset}>
						{motionView === 'particles' ? (
							<Button
								type="button"
								onClick={onResetParticles}
								size="sm"
								density="compact"
								variant="secondary"
								icon={<RotateCcw size={ICON_SIZE.xs} />}
							>
								{t.tab_particles}
							</Button>
						) : (
							<Button
								type="button"
								onClick={onResetRain}
								size="sm"
								density="compact"
								variant="secondary"
								icon={<RotateCcw size={ICON_SIZE.xs} />}
							>
								{t.tab_rain}
							</Button>
						)}
					</EditorTabFooter>
				)
			}
		>
			{motionView === 'particles' ? particlesView : null}
			{motionView === 'rain' ? rainView : null}
			{motionView === 'lights' ? lightsView : null}
			{motionView === 'camera' ? cameraView : null}
		</EditorTabLayout>
	);
}
