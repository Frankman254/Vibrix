import {
	Camera,
	Check,
	Eraser,
	Layers,
	Lock,
	MousePointerClick
} from 'lucide-react';
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
 *   - Selection/Total mode toggle sits IN the action area, immediately next
 *     to Capture/Clear, so the user's cursor doesn't travel across the panel
 *     to switch mode.
 *   - Selection mode lays the subsystems out as a 2-column grid of compact
 *     chips. Avoids each row stretching across the full panel width which
 *     made the layout feel hollow on wide panels.
 *
 * Total mode adds a saved-count summary row + per-subsystem dots so the user
 * gets immediate feedback after pressing "Capture all".
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
		cameraFx: t.bg_override_camera_fx,
		lights: t.bg_override_lights,
		trackTitle: t.bg_override_track_title
	};
	const {
		mode,
		setMode,
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
			mode: s.quickEditCaptureMode,
			setMode: s.setQuickEditCaptureMode,
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

	const modeToggle = (
		<div
			className="inline-flex overflow-hidden border text-[10px] shrink-0"
			style={{
				borderRadius: 'var(--editor-radius-sm)',
				borderColor: 'var(--editor-accent-border)'
			}}
		>
			<button
				type="button"
				onClick={() => setMode('selection')}
				className="flex items-center gap-1 px-2 py-1 transition"
				style={{
					background:
						mode === 'selection'
							? 'var(--editor-active-bg)'
							: 'transparent',
					color:
						mode === 'selection'
							? 'var(--editor-active-fg)'
							: 'var(--editor-accent-muted)'
				}}
				title={t.qa_pi_selection_t}
			>
				<MousePointerClick size={10} />
				{t.qa_pi_selection}
			</button>
			<button
				type="button"
				onClick={() => setMode('total')}
				className="flex items-center gap-1 px-2 py-1 transition"
				style={{
					background:
						mode === 'total'
							? 'var(--editor-active-bg)'
							: 'transparent',
					color:
						mode === 'total'
							? 'var(--editor-active-fg)'
							: 'var(--editor-accent-muted)'
				}}
				title={t.qa_pi_total_t}
			>
				<Layers size={10} />
				{t.qa_pi_total}
			</button>
		</div>
	);

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

			{mode === 'total' ? (
				<div className="flex flex-col gap-1.5">
					{/* Mode toggle SITS WITH the action buttons so the user
					    doesn't have to travel across the panel to switch. */}
					<div className="flex flex-wrap items-center gap-1.5">
						{modeToggle}
						<button
							type="button"
							disabled={captureBlocked}
							onClick={captureAll}
							className="flex items-center gap-1.5 border px-2.5 py-1 text-[10.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
							style={{
								borderRadius: 'var(--editor-radius-sm)',
								borderColor: 'var(--editor-accent-color)',
								background: 'var(--editor-active-bg)',
								color: 'var(--editor-active-fg)'
							}}
							title={t.qa_pi_capture_all_t}
						>
							<Camera size={11} />
							{t.qa_pi_capture_all}
						</button>
						<button
							type="button"
							disabled={captureBlocked || !anyOverrideSaved}
							onClick={clearAll}
							className="flex items-center gap-1.5 border px-2.5 py-1 text-[10.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
							style={{
								borderRadius: 'var(--editor-radius-sm)',
								borderColor: 'rgba(248,113,113,0.45)',
								background: 'rgba(248,113,113,0.08)',
								color: 'rgba(252,165,165,0.95)'
							}}
							title={t.qa_pi_clear_all_t}
						>
							<Eraser size={11} />
							{t.qa_pi_clear_all}
						</button>
					</div>
					{/* Per-subsystem dots — direct visual feedback after
					    Capture all (or any partial state from selection mode). */}
					<div className="flex flex-wrap items-center gap-1">
						{ROWS.map(row => {
							const saved = hasOverrideFor(row.id);
							return (
								<span
									key={row.id}
									className="flex items-center gap-1 border px-1.5 py-0.5 text-[9.5px]"
									style={{
										borderRadius: 'var(--editor-radius-sm)',
										borderColor: saved
											? 'rgba(120,255,180,0.4)'
											: 'var(--editor-accent-border)',
										background: saved
											? 'rgba(120,255,180,0.08)'
											: 'transparent',
										color: saved
											? 'rgba(120,255,180,0.95)'
											: 'var(--editor-accent-muted)'
									}}
									title={`${rowLabels[row.id]}: ${saved ? t.qa_pi_state_saved : t.qa_pi_state_empty}`}
								>
									{saved ? (
										<Check size={9} strokeWidth={3} />
									) : (
										<span
											aria-hidden
											style={{
												width: 6,
												height: 6,
												borderRadius: 999,
												background:
													'var(--editor-accent-muted)',
												opacity: 0.4
											}}
										/>
									)}
									{rowLabels[row.id]}
								</span>
							);
						})}
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					{/* Toggle stays adjacent to the action chips below it. */}
					<div className="flex items-center justify-end">
						{modeToggle}
					</div>
					{/* 2-column grid keeps the chips at natural width instead
					    of every row stretching across the entire panel. */}
					<div
						className="grid gap-1"
						style={{
							gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'
						}}
					>
						{ROWS.map(row => {
							const status = statusOf(row.id);
							const disabled =
								status === 'no-active' ||
								status === 'scene-locked';
							const isSaved = status === 'override';
							const statusBadge = isSaved
								? t.qa_pi_state_saved
								: status === 'scene-locked'
									? t.qa_pi_state_scene
									: status === 'no-active'
										? '—'
										: t.qa_pi_state_empty;
							const statusColor = isSaved
								? 'rgba(120,255,180,0.95)'
								: status === 'scene-locked'
									? 'rgba(253,224,138,0.85)'
									: 'var(--editor-accent-muted)';
							return (
								<div
									key={row.id}
									className="flex flex-col gap-1 border px-1.5 py-1 text-[11px]"
									style={{
										borderRadius: 'var(--editor-radius-sm)',
										borderColor: isSaved
											? 'rgba(120,255,180,0.32)'
											: 'var(--editor-accent-border)',
										background: 'var(--editor-tag-bg)'
									}}
								>
									<div className="flex items-center justify-between gap-1">
										<span
											className="text-[10.5px]"
											style={{
												color: 'var(--editor-accent-soft)'
											}}
										>
											{rowLabels[row.id]}
										</span>
										<span
											className="text-[8.5px] uppercase tracking-widest"
											style={{ color: statusColor }}
										>
											{statusBadge}
										</span>
									</div>
									<div className="flex items-center gap-1">
										<button
											type="button"
											disabled={disabled}
											onClick={() => capture(row.id)}
											className="flex flex-1 items-center justify-center gap-1 px-1 py-0.5 text-[9.5px] transition disabled:cursor-not-allowed disabled:opacity-40"
											style={{
												borderRadius:
													'var(--editor-radius-sm)',
												background:
													'var(--editor-button-bg)',
												color: 'var(--editor-accent-soft)'
											}}
											title={t.qa_pi_capture_t}
										>
											<Camera size={9} />
											{t.qa_pi_capture}
										</button>
										<button
											type="button"
											disabled={disabled || !isSaved}
											onClick={() => clear(row.id)}
											className="flex flex-1 items-center justify-center gap-1 px-1 py-0.5 text-[9.5px] transition disabled:cursor-not-allowed disabled:opacity-40"
											style={{
												borderRadius:
													'var(--editor-radius-sm)',
												background:
													'rgba(248,113,113,0.12)',
												color: 'rgba(252,165,165,0.95)'
											}}
											title={t.qa_pi_clear_t}
										>
											<Eraser size={9} />
											{t.qa_pi_clear}
										</button>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
