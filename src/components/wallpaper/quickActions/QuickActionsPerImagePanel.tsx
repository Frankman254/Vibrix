import { Camera, Check, Eraser, Lock } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useT } from '@/lib/i18n';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { resolveEffectiveSceneSlotId } from '@/features/scenes/sceneSlot';

/**
 * Per-image override panel rendered INSIDE the HUD. Same functionality the
 * previous floating `QuickEditPerImagePanel` exposed, but mounted as an
 * expand-panel of the HUD frame so the user gets the same drag / theme /
 * position controls every other HUD panel has.
 *
 * Layout follows the user's accessibility brief:
 *   - Image name is the panel's prominent header row (not buried next to a
 *     small toggle).
 *   - Global capture/clear and per-family actions share one compact view.
 *   - Eight families fit in a four-column grid on the normal HUD, avoiding a
 *     second editor-sized surface inside the quick-access panel.
 */
type SubsystemRow = {
	id:
		| 'logo'
		| 'spectrum'
		| 'particles'
		| 'rain'
		| 'looks'
		| 'cameraFx'
		| 'lights'
		| 'trackTitle';
};

const ROWS: ReadonlyArray<SubsystemRow> = [
	{ id: 'logo' },
	{ id: 'spectrum' },
	{ id: 'particles' },
	{ id: 'rain' },
	{ id: 'looks' },
	{ id: 'cameraFx' },
	{ id: 'lights' },
	{ id: 'trackTitle' }
];

export default function QuickActionsPerImagePanel() {
	const t = useT();
	const rowLabels: Record<SubsystemRow['id'], string> = {
		logo: t.looks_target_logo,
		spectrum: t.looks_target_spectrum,
		particles: t.looks_target_particles,
		rain: t.looks_target_rain,
		looks: t.tab_looks,
		cameraFx: t.qa_pi_camera_fx,
		lights: t.qa_pi_lights,
		trackTitle: t.qa_pi_now_playing
	};
	const {
		activeImageId,
		backgroundImages,
		sceneSlots,
		defaultSceneSlotId,
		captureImageLogoOverride,
		setImageLogoOverride,
		captureImageSpectrumOverride,
		setImageSpectrumOverride,
		captureImageParticlesOverride,
		setImageParticlesOverride,
		captureImageRainOverride,
		setImageRainOverride,
		captureImageLooksOverride,
		setImageLooksOverride,
		captureImageCameraFxOverride,
		setImageCameraFxOverride,
		captureImageLightsOverride,
		setImageLightsOverride,
		captureImageTrackTitleOverride,
		setImageTrackTitleOverride
	} = useWallpaperStore(
		useShallow(s => ({
			activeImageId: s.activeImageId,
			backgroundImages: s.backgroundImages,
			sceneSlots: s.sceneSlots,
			defaultSceneSlotId: s.defaultSceneSlotId,
			captureImageLogoOverride: s.captureImageLogoOverride,
			setImageLogoOverride: s.setImageLogoOverride,
			captureImageSpectrumOverride: s.captureImageSpectrumOverride,
			setImageSpectrumOverride: s.setImageSpectrumOverride,
			captureImageParticlesOverride: s.captureImageParticlesOverride,
			setImageParticlesOverride: s.setImageParticlesOverride,
			captureImageRainOverride: s.captureImageRainOverride,
			setImageRainOverride: s.setImageRainOverride,
			captureImageLooksOverride: s.captureImageLooksOverride,
			setImageLooksOverride: s.setImageLooksOverride,
			captureImageCameraFxOverride: s.captureImageCameraFxOverride,
			setImageCameraFxOverride: s.setImageCameraFxOverride,
			captureImageLightsOverride: s.captureImageLightsOverride,
			setImageLightsOverride: s.setImageLightsOverride,
			captureImageTrackTitleOverride: s.captureImageTrackTitleOverride,
			setImageTrackTitleOverride: s.setImageTrackTitleOverride
		}))
	);

	const activeImage = backgroundImages.find(
		image => image.assetId === activeImageId
	);
	// Scene-first: an image is scene-locked when its EFFECTIVE scene applies —
	// its own scene OR the default scene it rides — since either one makes the
	// legacy per-image overrides inert.
	const { sceneSlotId: effectiveSceneSlotId } = resolveEffectiveSceneSlotId(
		activeImage,
		{ sceneSlots, defaultSceneSlotId }
	);
	const activeSceneSlot = effectiveSceneSlotId
		? sceneSlots.find(slot => slot.id === effectiveSceneSlotId)
		: undefined;
	const sceneLocked = activeSceneSlot != null;
	const noImage = !activeImage;
	const captureBlocked = noImage || sceneLocked;

	function hasOverrideFor(id: SubsystemRow['id']): boolean {
		if (!activeImage) return false;
		switch (id) {
			case 'logo':
				return activeImage.logoOverride != null;
			case 'spectrum':
				return activeImage.spectrumOverride != null;
			case 'particles':
				return activeImage.particlesOverride != null;
			case 'rain':
				return activeImage.rainOverride != null;
			case 'looks':
				return activeImage.looksOverride != null;
			case 'cameraFx':
				return activeImage.cameraFxOverride != null;
			case 'lights':
				return activeImage.lightsOverride != null;
			case 'trackTitle':
				return activeImage.trackTitleOverride != null;
		}
	}
	const savedCount = ROWS.filter(row => hasOverrideFor(row.id)).length;
	const anyOverrideSaved = savedCount > 0;

	function captureAll() {
		if (captureBlocked) return;
		captureImageLogoOverride();
		captureImageSpectrumOverride();
		captureImageParticlesOverride();
		captureImageRainOverride();
		captureImageLooksOverride();
		captureImageCameraFxOverride();
		captureImageLightsOverride();
		captureImageTrackTitleOverride();
	}
	function clearAll() {
		if (captureBlocked) return;
		setImageLogoOverride(null);
		setImageSpectrumOverride(null);
		setImageParticlesOverride(null);
		setImageRainOverride(null);
		setImageLooksOverride(null);
		setImageCameraFxOverride(null);
		setImageLightsOverride(null);
		setImageTrackTitleOverride(null);
	}

	function statusOf(id: SubsystemRow['id']) {
		if (!activeImage) return 'no-active';
		if (sceneLocked) return 'scene-locked';
		return hasOverrideFor(id) ? 'override' : 'empty';
	}

	function capture(id: SubsystemRow['id']) {
		switch (id) {
			case 'logo':
				captureImageLogoOverride();
				return;
			case 'spectrum':
				captureImageSpectrumOverride();
				return;
			case 'particles':
				captureImageParticlesOverride();
				return;
			case 'rain':
				captureImageRainOverride();
				return;
			case 'looks':
				captureImageLooksOverride();
				return;
			case 'cameraFx':
				captureImageCameraFxOverride();
				return;
			case 'lights':
				captureImageLightsOverride();
				return;
			case 'trackTitle':
				captureImageTrackTitleOverride();
				return;
		}
	}
	function clear(id: SubsystemRow['id']) {
		switch (id) {
			case 'logo':
				setImageLogoOverride(null);
				return;
			case 'spectrum':
				setImageSpectrumOverride(null);
				return;
			case 'particles':
				setImageParticlesOverride(null);
				return;
			case 'rain':
				setImageRainOverride(null);
				return;
			case 'looks':
				setImageLooksOverride(null);
				return;
			case 'cameraFx':
				setImageCameraFxOverride(null);
				return;
			case 'lights':
				setImageLightsOverride(null);
				return;
			case 'trackTitle':
				setImageTrackTitleOverride(null);
				return;
		}
	}

	return (
		<div className="flex flex-col gap-1.5">
			{/* Header row: image name takes the prominent slot. */}
			<div
				className="flex items-center gap-2 border-b pb-1 text-[11px] font-medium"
				style={{
					borderColor: 'var(--editor-accent-border)'
				}}
			>
				<Camera
					size={11}
					style={{ color: 'var(--editor-accent-muted)' }}
					aria-hidden
				/>
				<span
					className="min-w-0 flex-1 truncate"
					style={{ color: 'var(--editor-accent-soft)' }}
					title={
						activeImage?.originalFileName ??
						activeImage?.assetId ??
						undefined
					}
				>
					{activeImage
						? (activeImage.originalFileName ??
							activeImage.assetId.slice(0, 12))
						: t.qa_pi_no_active_image}
				</span>
				<span
					className="shrink-0 text-[9px] uppercase tracking-widest"
					style={{ color: 'var(--editor-accent-muted)' }}
				>
					{savedCount}/{ROWS.length} {t.qa_pi_saved_suffix}
				</span>
			</div>

			{sceneLocked && activeSceneSlot ? (
				<div
					className="flex items-center gap-1.5 border px-2 py-1 text-[10px]"
					style={{
						borderRadius: 'var(--editor-radius-sm)',
						borderColor: 'rgba(248,191,28,0.4)',
						background: 'rgba(248,191,28,0.08)',
						color: 'rgba(253,224,138,0.95)'
					}}
				>
					<Lock size={10} />
					<span>
						{t.qa_pi_scene_locked.replace(
							'{name}',
							activeSceneSlot.name
						)}
					</span>
				</div>
			) : null}

			<div className="flex flex-wrap items-center gap-1">
				<button
					type="button"
					disabled={captureBlocked}
					onClick={captureAll}
					className="flex items-center gap-1 border px-2 py-1 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
					style={{
						borderRadius: 'var(--editor-radius-sm)',
						borderColor: 'var(--editor-accent-color)',
						background: 'var(--editor-active-bg)',
						color: 'var(--editor-active-fg)'
					}}
					title={t.qa_pi_capture_all_t}
				>
					<Camera size={10} />
					{t.qa_pi_capture_all}
				</button>
				<button
					type="button"
					disabled={captureBlocked || !anyOverrideSaved}
					onClick={clearAll}
					className="flex items-center gap-1 border px-2 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-40"
					style={{
						borderRadius: 'var(--editor-radius-sm)',
						borderColor: 'rgba(248,113,113,0.45)',
						background: 'rgba(248,113,113,0.08)',
						color: 'rgba(252,165,165,0.95)'
					}}
					title={t.qa_pi_clear_all_t}
				>
					<Eraser size={10} />
					{t.qa_pi_clear_all}
				</button>
			</div>

			<div
				className="grid gap-1"
				style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
			>
				{ROWS.map(row => {
					const status = statusOf(row.id);
					const disabled =
						status === 'no-active' || status === 'scene-locked';
					const isSaved = status === 'override';
					return (
						<div
							key={row.id}
							className="flex min-w-0 items-center gap-1 border p-1 text-[10px]"
							style={{
								borderRadius: 'var(--editor-radius-sm)',
								borderColor: isSaved
									? 'rgba(120,255,180,0.32)'
									: 'var(--editor-accent-border)',
								background: 'var(--editor-tag-bg)'
							}}
						>
							<span
								className="min-w-0 flex-1 truncate"
								style={{ color: 'var(--editor-accent-soft)' }}
								title={rowLabels[row.id]}
							>
								{isSaved ? (
									<Check
										size={9}
										strokeWidth={3}
										className="mr-1 inline"
										style={{
											color: 'rgba(120,255,180,0.95)'
										}}
									/>
								) : null}
								{rowLabels[row.id]}
							</span>
							<button
								type="button"
								disabled={disabled}
								onClick={() => capture(row.id)}
								className="flex h-6 w-6 shrink-0 items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-40"
								style={{
									borderRadius: 'var(--editor-radius-sm)',
									background: 'var(--editor-button-bg)',
									color: 'var(--editor-accent-soft)'
								}}
								title={t.qa_pi_capture_t}
							>
								<Camera size={10} />
							</button>
							<button
								type="button"
								disabled={disabled || !isSaved}
								onClick={() => clear(row.id)}
								className="flex h-6 w-6 shrink-0 items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-40"
								style={{
									borderRadius: 'var(--editor-radius-sm)',
									background: 'rgba(248,113,113,0.12)',
									color: 'rgba(252,165,165,0.95)'
								}}
								title={t.qa_pi_clear_t}
							>
								<Eraser size={10} />
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
