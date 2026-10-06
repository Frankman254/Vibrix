import { useShallow } from 'zustand/react/shallow';
import { SectionCard, SegmentedControl, ToggleSwitch } from '@/ui';
import { CollapsibleSection } from '@/editor';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { FACTORY_DEFAULT_STATE } from '@/store/factoryDefaults';
import type {
	StageLightsMovementMode,
	StageLightsOrigin
} from '@/features/stageFx/stageFxConfig';
import { MotionSlider as Slider } from '@/editor/MotionSharedControls';
import { FxBandThresholdControls } from './FxBandThresholdControls';
import { StageFxColorControls } from './StageFxColorControls';
import { formatDecimal, formatInteger } from '@/editor/motionTabUtils';

export function StageLightsSection() {
	const t = useT();
	const s = useWallpaperStore(
		useShallow(state => ({
			enabled: state.stageLightsEnabled,
			intensity: state.stageLightsIntensity,
			minCount: state.stageLightsMinBeamCount,
			maxCount: state.stageLightsMaxBeamCount,
			beamWidth: state.stageLightsBeamWidth,
			beamLength: state.stageLightsBeamLength,
			softness: state.stageLightsSoftness,
			speed: state.stageLightsSpeed,
			fixedMotion: state.stageLightsFixedMotion,
			colorSource: state.stageLightsColorSource,
			colorMode: state.stageLightsColorMode,
			color: state.stageLightsColor,
			secondaryColor: state.stageLightsSecondaryColor,
			rainbowColors: state.stageLightsRainbowColors,
			manualGlow: state.stageLightsManualGlow,
			glowStrength: state.stageLightsGlowStrength,
			glowSize: state.stageLightsGlowSize,
			audioReactive: state.stageLightsAudioReactive,
			audioChannel: state.stageLightsAudioChannel,
			audioAmount: state.stageLightsAudioAmount,
			audioOscillationAmount: state.stageLightsAudioOscillationAmount,
			audioHoldMs: state.stageLightsAudioHoldMs,
			audioDecay: state.stageLightsAudioDecay,
			audioGateEnabled: state.stageLightsAudioGateEnabled,
			bandThresholds: state.stageLightsBandThresholds,
			opacity: state.stageLightsOpacity,
			blendMode: state.stageLightsBlendMode,
			origin: state.stageLightsOrigin,
			movementMode: state.stageLightsMovementMode,
			invertDirection: state.stageLightsInvertDirection,
			mirrorDirections: state.stageLightsMirrorDirections,
			advanced: state.uiMode === 'advanced'
		}))
	);
	const set = useWallpaperStore(
		useShallow(state => ({
			enabled: state.setStageLightsEnabled,
			intensity: state.setStageLightsIntensity,
			minCount: state.setStageLightsMinBeamCount,
			maxCount: state.setStageLightsMaxBeamCount,
			beamWidth: state.setStageLightsBeamWidth,
			beamLength: state.setStageLightsBeamLength,
			softness: state.setStageLightsSoftness,
			speed: state.setStageLightsSpeed,
			fixedMotion: state.setStageLightsFixedMotion,
			colorSource: state.setStageLightsColorSource,
			colorMode: state.setStageLightsColorMode,
			color: state.setStageLightsColor,
			secondaryColor: state.setStageLightsSecondaryColor,
			rainbowColors: state.setStageLightsRainbowColors,
			manualGlow: state.setStageLightsManualGlow,
			glowStrength: state.setStageLightsGlowStrength,
			glowSize: state.setStageLightsGlowSize,
			audioReactive: state.setStageLightsAudioReactive,
			audioChannel: state.setStageLightsAudioChannel,
			audioAmount: state.setStageLightsAudioAmount,
			audioOscillationAmount: state.setStageLightsAudioOscillationAmount,
			audioHoldMs: state.setStageLightsAudioHoldMs,
			audioDecay: state.setStageLightsAudioDecay,
			audioGateEnabled: state.setStageLightsAudioGateEnabled,
			bandThreshold: state.setStageLightsBandThreshold,
			opacity: state.setStageLightsOpacity,
			blendMode: state.setStageLightsBlendMode,
			origin: state.setStageLightsOrigin,
			movementMode: state.setStageLightsMovementMode,
			invertDirection: state.setStageLightsInvertDirection,
			mirrorDirections: state.setStageLightsMirrorDirections
		}))
	);
	const hasSweep = s.speed > 0;

	return (
		<SectionCard
			title={t.sfx_stage_lights_title}
			subtitle={t.sfx_stage_lights_subtitle}
			action={
				<ToggleSwitch
					checked={s.enabled}
					onChange={set.enabled}
					size="sm"
					ariaLabel={t.sfx_stage_lights_enable}
				/>
			}
			density="compact"
		>
			{s.enabled ? (
				<div className="flex flex-col gap-3">
					<Slider
						label={t.sfx_intensity}
						value={s.intensity}
						min={0}
						max={2}
						step={0.01}
						onChange={set.intensity}
						defaultValue={
							FACTORY_DEFAULT_STATE.stageLightsIntensity
						}
						variant="macro"
						formatValue={formatDecimal}
					/>
					<div className="flex flex-col gap-1">
						<span className="text-xs text-[var(--editor-text-muted)]">
							{t.sfx_sweep_style}
						</span>
						<SegmentedControl<StageLightsMovementMode>
							value={s.movementMode}
							onChange={set.movementMode}
							options={[
								{ value: 'top-down', label: t.sfx_sweep_down },
								{ value: 'bottom-up', label: t.sfx_sweep_up },
								{
									value: 'left-right',
									label: t.sfx_sweep_right
								},
								{
									value: 'right-left',
									label: t.sfx_sweep_left
								},
								{
									value: 'cross-sweep',
									label: t.sfx_sweep_cross
								},
								{
									value: 'radial-sweep',
									label: t.sfx_sweep_radial
								},
								{
									value: 'circular-sweep',
									label: t.sfx_sweep_circle
								}
							]}
							size="sm"
							full
						/>
					</div>
					<StageFxColorControls
						kind="stage"
						colorSource={s.colorSource}
						colorMode={s.colorMode}
						primaryColor={s.color}
						secondaryColor={s.secondaryColor}
						rainbowColors={s.rainbowColors}
						manualGlow={s.manualGlow}
						glowStrength={s.glowStrength}
						glowSize={s.glowSize}
						onColorSourceChange={set.colorSource}
						onColorModeChange={set.colorMode}
						onPrimaryColorChange={set.color}
						onSecondaryColorChange={set.secondaryColor}
						onRainbowColorsChange={set.rainbowColors}
						onManualGlowChange={set.manualGlow}
						onGlowStrengthChange={set.glowStrength}
						onGlowSizeChange={set.glowSize}
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
										label={t.sfx_min_beams}
										value={s.minCount}
										min={1}
										max={16}
										step={1}
										onChange={set.minCount}
										defaultValue={
											FACTORY_DEFAULT_STATE.stageLightsMinBeamCount
										}
										variant="compact"
										formatValue={formatInteger}
									/>
									<Slider
										label={t.sfx_max_beams}
										value={s.maxCount}
										min={1}
										max={16}
										step={1}
										onChange={set.maxCount}
										defaultValue={
											FACTORY_DEFAULT_STATE.stageLightsMaxBeamCount
										}
										variant="compact"
										formatValue={formatInteger}
									/>
									<Slider
										label={t.sfx_beam_thickness}
										value={s.beamWidth}
										min={0}
										max={1}
										step={0.01}
										onChange={set.beamWidth}
										defaultValue={
											FACTORY_DEFAULT_STATE.stageLightsBeamWidth
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_beam_reach}
										value={s.beamLength}
										min={0.15}
										max={1.35}
										step={0.01}
										onChange={set.beamLength}
										defaultValue={
											FACTORY_DEFAULT_STATE.stageLightsBeamLength
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_edge_glow}
										value={s.softness}
										min={0}
										max={1}
										step={0.01}
										onChange={set.softness}
										defaultValue={
											FACTORY_DEFAULT_STATE.stageLightsSoftness
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_sweep_speed}
										value={s.speed}
										min={0}
										max={4}
										step={0.01}
										onChange={set.speed}
										defaultValue={
											FACTORY_DEFAULT_STATE.stageLightsSpeed
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_opacity}
										value={s.opacity}
										min={0}
										max={1}
										step={0.01}
										onChange={set.opacity}
										defaultValue={
											FACTORY_DEFAULT_STATE.stageLightsOpacity
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
								</div>
								<SegmentedControl<StageLightsOrigin>
									value={s.origin}
									onChange={set.origin}
									options={[
										{
											value: 'top',
											label: t.sfx_origin_top
										},
										{
											value: 'bottom',
											label: t.sfx_origin_bottom
										},
										{
											value: 'left',
											label: t.sfx_origin_left
										},
										{
											value: 'right',
											label: t.sfx_origin_right
										},
										{
											value: 'top-bottom',
											label: t.sfx_origin_top_bottom
										},
										{
											value: 'sides',
											label: t.sfx_origin_sides
										},
										{
											value: 'all',
											label: t.sfx_origin_all
										}
									]}
									size="sm"
									full
								/>
								<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
									{[
										...(hasSweep
											? [
													[
														t.sfx_reverse_sweep,
														s.invertDirection,
														set.invertDirection
													],
													[
														t.sfx_mirror_beams,
														s.mirrorDirections,
														set.mirrorDirections
													]
												]
											: []),
										[
											t.sfx_audio_reactive,
											s.audioReactive,
											set.audioReactive
										],
										...(s.audioReactive
											? [
													[
														t.sfx_move_without_audio,
														s.fixedMotion,
														set.fixedMotion
													],
													[
														t.sfx_off_below_threshold,
														s.audioGateEnabled,
														set.audioGateEnabled
													]
												]
											: [])
									].map(([label, checked, onChange]) => (
										<div
											key={label as string}
											className="flex items-center justify-between gap-2"
										>
											<span className="text-[11px]">
												{label as string}
											</span>
											<ToggleSwitch
												checked={checked as boolean}
												onChange={
													onChange as (
														value: boolean
													) => void
												}
												size="sm"
												ariaLabel={label as string}
											/>
										</div>
									))}
								</div>
								{s.audioReactive ? (
									<>
										<SegmentedControl<
											'kick' | 'bass' | 'full'
										>
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
										<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
											<Slider
												label={
													t.sfx_audio_intensity_boost
												}
												value={s.audioAmount}
												min={0}
												max={4}
												step={0.01}
												onChange={set.audioAmount}
												defaultValue={
													FACTORY_DEFAULT_STATE.stageLightsAudioAmount
												}
												variant="compact"
												formatValue={formatDecimal}
											/>
											<Slider
												label={t.sfx_audio_sweep_boost}
												value={s.audioOscillationAmount}
												min={0}
												max={2}
												step={0.01}
												onChange={
													set.audioOscillationAmount
												}
												defaultValue={
													FACTORY_DEFAULT_STATE.stageLightsAudioOscillationAmount
												}
												variant="compact"
												formatValue={formatDecimal}
											/>
											<Slider
												label={t.sfx_light_hold_ms}
												value={s.audioHoldMs}
												min={0}
												max={600}
												step={10}
												onChange={set.audioHoldMs}
												defaultValue={
													FACTORY_DEFAULT_STATE.stageLightsAudioHoldMs
												}
												variant="compact"
												formatValue={formatInteger}
											/>
											<Slider
												label={t.sfx_fade_decay}
												value={s.audioDecay}
												min={0.2}
												max={0.995}
												step={0.005}
												onChange={set.audioDecay}
												defaultValue={
													FACTORY_DEFAULT_STATE.stageLightsAudioDecay
												}
												variant="compact"
												formatValue={formatDecimal}
											/>
										</div>
										<FxBandThresholdControls
											thresholds={s.bandThresholds}
											defaultThresholds={
												FACTORY_DEFAULT_STATE.stageLightsBandThresholds
											}
											onChange={set.bandThreshold}
										/>
									</>
								) : null}
								<SegmentedControl<
									'lighter' | 'screen' | 'source-over'
								>
									value={s.blendMode}
									onChange={set.blendMode}
									options={[
										{
											value: 'lighter',
											label: t.sfx_blend_add
										},
										{
											value: 'screen',
											label: t.sfx_blend_screen
										},
										{
											value: 'source-over',
											label: t.sfx_blend_normal
										}
									]}
									size="sm"
									full
								/>
							</div>
						</CollapsibleSection>
					) : null}
				</div>
			) : null}
		</SectionCard>
	);
}
