import { useShallow } from 'zustand/react/shallow';
import { Button, SectionCard, SegmentedControl, ToggleSwitch } from '@/ui';
import { CollapsibleSection } from '@/editor';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { FACTORY_DEFAULT_STATE } from '@/store/factoryDefaults';
import type {
	CameraMotionTarget,
	ScreenShakeMode
} from '@/features/stageFx/stageFxConfig';
import { MotionSlider as Slider } from '@/editor/MotionSharedControls';
import { FxBandThresholdControls } from './FxBandThresholdControls';
import { formatDecimal } from '@/editor/motionTabUtils';
import {
	CAMERA_FX_TARGETS,
	isCameraFxTargetAvailable,
	getCameraFxTargetLabels,
	resolveAvailableCameraFxTargets
} from './cameraFxTargetControls';

export function ScreenShakeSection() {
	const t = useT();
	const targetLabels = getCameraFxTargetLabels(t);
	const s = useWallpaperStore(
		useShallow(state => ({
			enabled: state.cameraShakeEnabled,
			amount: state.cameraShakeAmount,
			decay: state.cameraShakeDecay,
			bandThresholds: state.cameraShakeBandThresholds,
			sensitivity: state.cameraShakeSensitivity,
			retriggerMs: state.cameraShakeRetriggerMs,
			channel: state.cameraShakeChannel,
			targets: state.cameraShakeTargets,
			hasOverlay: state.overlays.some(overlay => overlay.enabled),
			hasSecondSpectrum: state.spectrumInstances.length > 0,
			mode: state.cameraShakeMode,
			frequency: state.cameraShakeFrequency,
			roughness: state.cameraShakeRoughness,
			advanced: state.uiMode === 'advanced'
		}))
	);
	const set = useWallpaperStore(
		useShallow(state => ({
			enabled: state.setCameraShakeEnabled,
			amount: state.setCameraShakeAmount,
			decay: state.setCameraShakeDecay,
			bandThreshold: state.setCameraShakeBandThreshold,
			targets: state.setCameraShakeTargets,
			sensitivity: state.setCameraShakeSensitivity,
			retriggerMs: state.setCameraShakeRetriggerMs,
			channel: state.setCameraShakeChannel,
			mode: state.setCameraShakeMode,
			frequency: state.setCameraShakeFrequency,
			roughness: state.setCameraShakeRoughness
		}))
	);
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

	function toggleAllTargets() {
		set.targets(allTargetsEnabled ? ['background'] : [...availableTargets]);
	}

	return (
		<SectionCard
			title={t.sfx_screen_shake_title}
			subtitle={t.sfx_screen_shake_subtitle}
			action={
				<ToggleSwitch
					checked={s.enabled}
					onChange={set.enabled}
					size="sm"
					ariaLabel={t.sfx_screen_shake_enable}
				/>
			}
			density="compact"
		>
			{s.enabled ? (
				<div className="flex flex-col gap-3">
					<SegmentedControl<ScreenShakeMode>
						value={s.mode}
						onChange={set.mode}
						options={[
							{ value: 'horizontal', label: t.sfx_shake_mode_h },
							{ value: 'vertical', label: t.sfx_shake_mode_v },
							{ value: 'free', label: t.sfx_shake_mode_free },
							{ value: 'punch', label: t.sfx_shake_mode_punch },
							{ value: 'jitter', label: t.sfx_shake_mode_jitter },
							{ value: 'kick-snap', label: t.sfx_shake_mode_snap }
						]}
						size="sm"
						full
					/>
					<Slider
						label={t.sfx_shake_amount}
						value={s.amount}
						min={0}
						max={3}
						step={0.01}
						onChange={set.amount}
						defaultValue={FACTORY_DEFAULT_STATE.cameraShakeAmount}
						variant="macro"
						formatValue={formatDecimal}
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
										label={t.sfx_decay}
										value={s.decay}
										min={0.2}
										max={0.995}
										step={0.005}
										onChange={set.decay}
										defaultValue={
											FACTORY_DEFAULT_STATE.cameraShakeDecay
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_frequency}
										value={s.frequency}
										min={1}
										max={110}
										step={1}
										onChange={set.frequency}
										defaultValue={
											FACTORY_DEFAULT_STATE.cameraShakeFrequency
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_impact_sensitivity}
										value={s.sensitivity}
										min={0}
										max={8}
										step={0.01}
										onChange={set.sensitivity}
										defaultValue={
											FACTORY_DEFAULT_STATE.cameraShakeSensitivity
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_retrigger_ms}
										value={s.retriggerMs}
										min={20}
										max={700}
										step={5}
										onChange={set.retriggerMs}
										defaultValue={
											FACTORY_DEFAULT_STATE.cameraShakeRetriggerMs
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_roughness}
										value={s.roughness}
										min={0}
										max={1}
										step={0.01}
										onChange={set.roughness}
										defaultValue={
											FACTORY_DEFAULT_STATE.cameraShakeRoughness
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
								</div>
								<SegmentedControl<'kick' | 'bass' | 'full'>
									value={s.channel}
									onChange={set.channel}
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
								<FxBandThresholdControls
									thresholds={s.bandThresholds}
									defaultThresholds={
										FACTORY_DEFAULT_STATE.cameraShakeBandThresholds
									}
									onChange={set.bandThreshold}
								/>
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
											const active =
												s.targets.includes(target);
											return (
												<Button
													key={target}
													type="button"
													onClick={() =>
														toggleTarget(target)
													}
													disabled={disabled}
													variant={
														active
															? 'primary'
															: 'secondary'
													}
													size="sm"
													density="compact"
													active={active}
												>
													{targetLabels[target]}
												</Button>
											);
										})}
									</div>
								</div>
							</div>
						</CollapsibleSection>
					) : null}
				</div>
			) : null}
		</SectionCard>
	);
}
