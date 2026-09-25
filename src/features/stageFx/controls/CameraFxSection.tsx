import { useShallow } from 'zustand/react/shallow';
import {
	Button,
	Caption,
	SectionCard,
	SegmentedControl,
	ToggleSwitch
} from '@/ui';
import { CollapsibleSection } from '@/editor';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { FACTORY_DEFAULT_STATE } from '@/store/factoryDefaults';
import type {
	CameraMotionDirection,
	CameraMotionDrive,
	CameraMotionMode,
	CameraMotionTarget
} from '@/features/stageFx/stageFxConfig';
import { formatDecimal } from '@/editor/motionTabUtils';
import { MotionSlider as Slider } from '@/editor/MotionSharedControls';
import {
	CAMERA_FX_TARGETS,
	isCameraFxTargetAvailable,
	getCameraFxTargetLabels,
	resolveAvailableCameraFxTargets
} from './cameraFxTargetControls';
import MotionLayerStack from './MotionLayerStack';
import { findMotionLayerForTarget } from '@/features/stageFx/motionLayers';

/** Continuous camera movement. Peak vibration lives in `ScreenShakeSection`. */
export function CameraMotionSection() {
	const t = useT();
	const targetLabels = getCameraFxTargetLabels(t);
	const s = useWallpaperStore(
		useShallow(state => ({
			enabled: state.cameraMotionEnabled,
			mode: state.cameraMotionMode,
			amount: state.cameraMotionAmount,
			speed: state.cameraMotionSpeed,
			drive: state.cameraMotionDrive,
			audioInfluence: state.cameraMotionAudioInfluence,
			amplitudeAudio: state.cameraMotionAmplitudeAudio,
			audioChannel: state.cameraMotionAudioChannel,
			direction: state.cameraMotionDirection,
			targets: state.cameraMotionTargets,
			motionLayers: state.motionLayers,
			activeMotionLayerId: state.activeMotionLayerId,
			hasOverlay: state.overlays.some(overlay => overlay.enabled),
			hasSecondSpectrum: state.spectrumInstances.length > 0,
			advanced: state.uiMode === 'advanced'
		}))
	);
	const set = useWallpaperStore(
		useShallow(state => ({
			enabled: state.setCameraMotionEnabled,
			mode: state.setCameraMotionMode,
			amount: state.setCameraMotionAmount,
			speed: state.setCameraMotionSpeed,
			drive: state.setCameraMotionDrive,
			audioInfluence: state.setCameraMotionAudioInfluence,
			amplitudeAudio: state.setCameraMotionAmplitudeAudio,
			audioChannel: state.setCameraMotionAudioChannel,
			direction: state.setCameraMotionDirection,
			targets: state.setCameraMotionTargets,
			claim: state.claimMotionTarget
		}))
	);
	const hasAudioDrive = s.drive === 'audio' || s.drive === 'fixed-audio';
	const availability = {
		hasOverlay: s.hasOverlay,
		hasSecondSpectrum: s.hasSecondSpectrum
	};
	const availableTargets = resolveAvailableCameraFxTargets(availability);
	const allTargetsEnabled = availableTargets.every(target =>
		s.targets.includes(target)
	);

	function toggleTarget(target: CameraMotionTarget) {
		if (!isCameraFxTargetAvailable(target, availability)) return;
		const next = s.targets.includes(target)
			? s.targets.filter(item => item !== target)
			: [...s.targets, target];
		set.targets(next.length > 0 ? next : ['background']);
	}

	/**
	 * The layer that would win this target if it is not the one being edited.
	 * Includes the case where the active layer also names it: a layer above
	 * still wins, and saying so is the whole point of the dimmed chip.
	 */
	function targetOwner(target: CameraMotionTarget) {
		const owner = findMotionLayerForTarget(
			{
				motionLayers: s.motionLayers,
				activeMotionLayerId: s.activeMotionLayerId,
				cameraMotionTargets: s.targets
			},
			target
		);
		if (!owner || owner.id === s.activeMotionLayerId) return null;
		const index = s.motionLayers.findIndex(layer => layer.id === owner.id);
		return {
			name:
				owner.name.trim() ||
				t.motion_layers_default_name.replace(
					'{index}',
					String(index + 1)
				)
		};
	}

	function toggleAllTargets() {
		set.targets(allTargetsEnabled ? ['background'] : [...availableTargets]);
	}

	return (
		<SectionCard
			title={t.sfx_camera_motion_title}
			subtitle={t.sfx_camera_motion_subtitle}
			action={
				<ToggleSwitch
					checked={s.enabled}
					onChange={set.enabled}
					size="sm"
					ariaLabel={t.sfx_camera_motion_enable}
				/>
			}
			density="compact"
		>
			{s.enabled ? (
				<div className="flex flex-col gap-3">
					{/* Above the dials because the dials belong to whichever
					    layer is selected here. */}
					{s.advanced ? (
						<MotionLayerStack targetLabels={targetLabels} />
					) : null}
					<SegmentedControl<CameraMotionMode>
						value={s.mode}
						onChange={set.mode}
						options={[
							{ value: 'none', label: t.sfx_cam_mode_off },
							{ value: 'drift', label: t.sfx_cam_mode_drift },
							{ value: 'circle', label: t.sfx_cam_mode_circle },
							{ value: 'semicircle', label: t.sfx_cam_mode_semi },
							{
								value: 'figure-eight',
								label: t.sfx_cam_mode_eight
							},
							{ value: 'orbit', label: t.sfx_cam_mode_orbit },
							{
								value: 'pendulum',
								label: t.sfx_cam_mode_pendulum
							},
							{
								value: 'beat-jump',
								label: t.sfx_cam_mode_beat_jump
							},
							{
								value: 'path-trace',
								label: t.sfx_cam_mode_path_trace
							},
							{
								value: 'zoom-pulse',
								label: t.sfx_cam_mode_zoom_pulse
							},
							{
								value: 'lissajous',
								label: t.sfx_cam_mode_lissajous
							}
						]}
						size="sm"
						full
					/>
					<Slider
						label={t.sfx_motion_amount}
						value={s.amount}
						min={0}
						max={1.5}
						step={0.01}
						onChange={set.amount}
						defaultValue={FACTORY_DEFAULT_STATE.cameraMotionAmount}
						variant="macro"
						formatValue={formatDecimal}
					/>
					<Slider
						label={t.sfx_motion_amount_audio}
						value={s.amplitudeAudio}
						min={0}
						max={2}
						step={0.01}
						onChange={set.amplitudeAudio}
						defaultValue={
							FACTORY_DEFAULT_STATE.cameraMotionAmplitudeAudio
						}
						variant="compact"
						formatValue={formatDecimal}
					/>
					<SegmentedControl<CameraMotionDrive>
						value={s.drive}
						onChange={set.drive}
						options={[
							{ value: 'fixed', label: t.sfx_drive_fixed },
							{ value: 'audio', label: t.sfx_drive_audio },
							{
								value: 'fixed-audio',
								label: t.sfx_drive_fixed_audio
							}
						]}
						size="sm"
						full
					/>
					{s.advanced ? (
						<CollapsibleSection
							title={t.sfx_advanced}
							defaultOpen={false}
							dense
						>
							<div className="flex flex-col gap-3">
								<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
									<Slider
										label={t.sfx_motion_speed}
										value={s.speed}
										min={0}
										max={4}
										step={0.01}
										onChange={set.speed}
										defaultValue={
											FACTORY_DEFAULT_STATE.cameraMotionSpeed
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									{hasAudioDrive ? (
										<Slider
											label={t.sfx_audio_speed_influence}
											value={s.audioInfluence}
											min={0}
											max={3}
											step={0.01}
											onChange={set.audioInfluence}
											defaultValue={
												FACTORY_DEFAULT_STATE.cameraMotionAudioInfluence
											}
											variant="compact"
											formatValue={formatDecimal}
										/>
									) : null}
								</div>
								<SegmentedControl<CameraMotionDirection>
									value={s.direction}
									onChange={set.direction}
									options={[
										{ value: 'cw', label: t.sfx_dir_cw },
										{ value: 'ccw', label: t.sfx_dir_ccw }
									]}
									size="sm"
									full
								/>
								{hasAudioDrive ? (
									<SegmentedControl<'kick' | 'bass' | 'full'>
										value={s.audioChannel}
										onChange={set.audioChannel}
										options={[
											{
												value: 'kick',
												label: t.sfx_chan_kick
											},
											{
												value: 'bass',
												label: t.sfx_chan_bass
											},
											{
												value: 'full',
												label: t.sfx_chan_full
											}
										]}
										size="sm"
										full
									/>
								) : null}
								<div className="flex flex-col gap-1.5">
									<div className="flex items-center justify-between gap-2">
										<span className="text-xs text-[var(--editor-text-muted)]">
											{t.sfx_affected_layers}
										</span>
										<Button
											type="button"
											onClick={toggleAllTargets}
											size="sm"
											density="compact"
											variant={
												allTargetsEnabled
													? 'primary'
													: 'secondary'
											}
										>
											{t.sfx_all}
										</Button>
									</div>
									<div className="flex flex-wrap gap-1">
										{CAMERA_FX_TARGETS.map(target => {
											const disabled =
												!isCameraFxTargetAvailable(
													target,
													availability
												);
											const owner = disabled
												? null
												: targetOwner(target);
											const active =
												s.targets.includes(target) &&
												!owner;
											return (
												<Button
													key={target}
													type="button"
													// Never a hard block:
													// pressing a taken chip
													// steals the target instead
													// of doing nothing.
													onClick={() =>
														owner
															? set.claim(target)
															: toggleTarget(
																	target
																)
													}
													disabled={disabled}
													title={
														owner
															? t.motion_target_claim.replace(
																	'{name}',
																	owner.name
																)
															: undefined
													}
													variant={
														active
															? 'primary'
															: 'secondary'
													}
													size="sm"
													density="compact"
													active={active}
													style={
														owner
															? { opacity: 0.55 }
															: undefined
													}
												>
													{owner
														? `${targetLabels[target]} · ${t.motion_target_owner.replace('{name}', owner.name)}`
														: targetLabels[target]}
												</Button>
											);
										})}
									</div>
									<Caption>
										{t.motion_targets_owner_hint}
									</Caption>
								</div>
							</div>
						</CollapsibleSection>
					) : null}
				</div>
			) : null}
		</SectionCard>
	);
}
