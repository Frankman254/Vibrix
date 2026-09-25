import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT, type Translations } from '@/lib/i18n';
import { Button, Caption, UI_COLORS, FONT } from '@/ui';
import {
	describeImageComposition,
	type CompositionRow,
	type CompositionSubsystemId
} from '@/store/imageCompositionSummary';
import ImageSceneAssignment from './ImageSceneAssignment';

const ROW_LABEL_KEYS: Record<CompositionSubsystemId, keyof Translations> = {
	logo: 'bg_override_logo',
	spectrum: 'bg_override_spectrum',
	particles: 'bg_override_particles',
	rain: 'bg_override_rain',
	looks: 'bg_override_looks',
	cameraFx: 'bg_override_camera_fx',
	lights: 'bg_override_lights',
	trackTitle: 'bg_override_track_title'
};

const SOURCE_LABEL_KEYS: Record<CompositionRow['source'], keyof Translations> =
	{
		'global-mode': 'img_carry_src_global_mode',
		scene: 'img_carry_src_scene',
		'scene-off': 'img_carry_src_scene_off',
		override: 'img_carry_src_override',
		slot: 'img_carry_src_slot',
		global: 'img_carry_src_global'
	};

/**
 * ONE screen that answers "what does this image carry?".
 *
 * Before this the answer was split across the scene assignment block, the
 * per-image override rows and the HUD panel, and none of them said which one
 * actually wins. Every line here comes from `describeImageComposition`, which
 * walks the same precedence as `buildActiveImageSelectionPatch`, so a row that
 * says "Scene" really does mean the override underneath it is not what you see.
 */
export default function ImageCompositionPanel() {
	const t = useT();
	// Flat selection on purpose: the store's action identities are stable, so a
	// shallow compare of a flat object settles. Grouping them into nested
	// `{capture: {...}}` objects here rebuilds those objects on every call,
	// which never compares equal and spins React until it gives up.
	const store = useWallpaperStore(
		useShallow(s => ({
			activeImageId: s.activeImageId,
			backgroundImages: s.backgroundImages,
			globalCompositionOverride: s.globalCompositionOverride,
			sceneSlots: s.sceneSlots,
			defaultSceneSlotId: s.defaultSceneSlotId,
			logoProfileSlots: s.logoProfileSlots,
			spectrumProfileSlots: s.spectrumProfileSlots,
			particlesProfileSlots: s.particlesProfileSlots,
			rainProfileSlots: s.rainProfileSlots,
			looksProfileSlots: s.looksProfileSlots,
			cameraFxProfileSlots: s.cameraFxProfileSlots,
			lightsProfileSlots: s.lightsProfileSlots,
			trackTitleProfileSlots: s.trackTitleProfileSlots,
			captureLogo: s.captureImageLogoOverride,
			captureSpectrum: s.captureImageSpectrumOverride,
			captureParticles: s.captureImageParticlesOverride,
			captureRain: s.captureImageRainOverride,
			captureLooks: s.captureImageLooksOverride,
			captureCameraFx: s.captureImageCameraFxOverride,
			captureLights: s.captureImageLightsOverride,
			captureTrackTitle: s.captureImageTrackTitleOverride,
			setLogo: s.setImageLogoOverride,
			setSpectrum: s.setImageSpectrumOverride,
			setParticles: s.setImageParticlesOverride,
			setRain: s.setImageRainOverride,
			setLooks: s.setImageLooksOverride,
			setCameraFx: s.setImageCameraFxOverride,
			setLights: s.setImageLightsOverride,
			setTrackTitle: s.setImageTrackTitleOverride
		}))
	);
	const capture: Record<CompositionSubsystemId, () => void> = {
		logo: store.captureLogo,
		spectrum: store.captureSpectrum,
		particles: store.captureParticles,
		rain: store.captureRain,
		looks: store.captureLooks,
		cameraFx: store.captureCameraFx,
		lights: store.captureLights,
		trackTitle: store.captureTrackTitle
	};
	const clear: Record<CompositionSubsystemId, () => void> = {
		logo: () => store.setLogo(null),
		spectrum: () => store.setSpectrum(null),
		particles: () => store.setParticles(null),
		rain: () => store.setRain(null),
		looks: () => store.setLooks(null),
		cameraFx: () => store.setCameraFx(null),
		lights: () => store.setLights(null),
		trackTitle: () => store.setTrackTitle(null)
	};
	const image = store.backgroundImages.find(
		img => img.assetId === store.activeImageId
	);
	if (!image) return null;
	const summary = describeImageComposition(store, image);

	return (
		<div className="flex flex-col gap-2">
			{/* No title here: the collapsible section header already says it. */}
			<Caption as="p">{t.img_carry_hint}</Caption>
			{summary.globalMode ? (
				<Caption as="p">{t.img_carry_global_mode_banner}</Caption>
			) : null}
			{summary.ignoresGlobalMode ? (
				<Caption as="p">{t.img_carry_ignores_global_banner}</Caption>
			) : null}
			<ImageSceneAssignment />
			<div className="flex flex-col gap-1.5">
				{summary.rows.map(row => {
					const winning =
						row.source === 'override' || row.source === 'slot';
					return (
						<div
							key={row.id}
							className="flex items-center justify-between gap-3 rounded-(--editor-radius-md) border px-3 py-2"
							style={{
								borderColor: UI_COLORS.border,
								background: UI_COLORS.raised
							}}
						>
							<div className="min-w-0">
								<div
									className="truncate text-[12px] font-medium"
									style={{ color: UI_COLORS.fg }}
								>
									{t[ROW_LABEL_KEYS[row.id]]}
								</div>
								<div
									className="truncate text-[10px] uppercase tracking-[0.12em]"
									style={{
										color: UI_COLORS.fgMute,
										fontFamily: FONT.mono
									}}
								>
									{t[SOURCE_LABEL_KEYS[row.source]]}
									{row.detail ? ` · ${row.detail}` : ''}
									{row.hasOverride && !winning
										? ` · ${t.img_carry_override_shadowed}`
										: ''}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<Button
									onClick={capture[row.id]}
									size="sm"
									density="compact"
									variant="secondary"
								>
									{t.img_carry_capture}
								</Button>
								{row.hasOverride ? (
									<Button
										onClick={clear[row.id]}
										size="sm"
										density="compact"
										variant="ghost"
									>
										{t.img_carry_clear}
									</Button>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
