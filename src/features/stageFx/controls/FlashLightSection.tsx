import { useShallow } from 'zustand/react/shallow';
import { SectionCard, SegmentedControl, ToggleSwitch } from '@/ui';
import { CollapsibleSection } from '@/editor';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { FACTORY_DEFAULT_STATE } from '@/store/factoryDefaults';
import type { FlashLightShape } from '@/features/stageFx/stageFxConfig';
import { MotionSlider as Slider } from '@/editor/MotionSharedControls';
import { FxBandThresholdControls } from './FxBandThresholdControls';
import { StageFxColorControls } from './StageFxColorControls';
import { formatDecimal } from '@/editor/motionTabUtils';

export function FlashLightSection() {
	const t = useT();
	const s = useWallpaperStore(
		useShallow(state => ({
			enabled: state.flashLightEnabled,
			intensity: state.flashLightIntensity,
			colorSource: state.flashLightColorSource,
			colorMode: state.flashLightColorMode,
			color: state.flashLightColor,
			secondaryColor: state.flashLightSecondaryColor,
			rainbowColors: state.flashLightRainbowColors,
			manualGlow: state.flashLightManualGlow,
			glowStrength: state.flashLightGlowStrength,
			glowSize: state.flashLightGlowSize,
			softness: state.flashLightSoftness,
			brightness: state.flashLightBrightness,
			decay: state.flashLightDecay,
			audioChannel: state.flashLightAudioChannel,
			bandThresholds: state.flashLightBandThresholds,
			sensitivity: state.flashLightSensitivity,
			retriggerMs: state.flashLightRetriggerMs,
			shape: state.flashLightShape,
			blendMode: state.flashLightBlendMode,
			advanced: state.uiMode === 'advanced'
		}))
	);
	const set = useWallpaperStore(
		useShallow(state => ({
			enabled: state.setFlashLightEnabled,
			intensity: state.setFlashLightIntensity,
			colorSource: state.setFlashLightColorSource,
			colorMode: state.setFlashLightColorMode,
			color: state.setFlashLightColor,
			secondaryColor: state.setFlashLightSecondaryColor,
			rainbowColors: state.setFlashLightRainbowColors,
			manualGlow: state.setFlashLightManualGlow,
			glowStrength: state.setFlashLightGlowStrength,
			glowSize: state.setFlashLightGlowSize,
			softness: state.setFlashLightSoftness,
			brightness: state.setFlashLightBrightness,
			decay: state.setFlashLightDecay,
			audioChannel: state.setFlashLightAudioChannel,
			bandThreshold: state.setFlashLightBandThreshold,
			sensitivity: state.setFlashLightSensitivity,
			retriggerMs: state.setFlashLightRetriggerMs,
			shape: state.setFlashLightShape,
			blendMode: state.setFlashLightBlendMode
		}))
	);

	return (
		<SectionCard
			title={t.sfx_flash_light_title}
			subtitle={t.sfx_flash_light_subtitle}
			action={
				<ToggleSwitch
					checked={s.enabled}
					onChange={set.enabled}
					size="sm"
					ariaLabel={t.sfx_flash_light_enable}
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
						defaultValue={FACTORY_DEFAULT_STATE.flashLightIntensity}
						variant="macro"
						formatValue={formatDecimal}
					/>
					<SegmentedControl<FlashLightShape>
						value={s.shape}
						onChange={set.shape}
						options={[
							{
								value: 'full-screen',
								label: t.sfx_flash_shape_full
							},
							{
								value: 'circular-burst',
								label: t.sfx_flash_shape_circle
							},
							{
								value: 'horizontal-blast',
								label: t.sfx_flash_shape_h_blast
							},
							{
								value: 'vertical-blast',
								label: t.sfx_flash_shape_v_blast
							},
							{
								value: 'center-bloom',
								label: t.sfx_flash_shape_bloom
							},
							{
								value: 'edge-flash',
								label: t.sfx_flash_shape_edges
							},
							{
								value: 'vignette-invert',
								label: t.sfx_flash_shape_vignette
							}
						]}
						size="sm"
						full
					/>
					<StageFxColorControls
						kind="flash"
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
										label={t.sfx_sensitivity}
										value={s.sensitivity}
										min={0}
										max={8}
										step={0.01}
										onChange={set.sensitivity}
										defaultValue={
											FACTORY_DEFAULT_STATE.flashLightSensitivity
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_decay}
										value={s.decay}
										min={0.05}
										max={14}
										step={0.1}
										onChange={set.decay}
										defaultValue={
											FACTORY_DEFAULT_STATE.flashLightDecay
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_softness}
										value={s.softness}
										min={0}
										max={1}
										step={0.01}
										onChange={set.softness}
										defaultValue={
											FACTORY_DEFAULT_STATE.flashLightSoftness
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_brightness}
										value={s.brightness}
										min={0}
										max={8}
										step={0.01}
										onChange={set.brightness}
										defaultValue={
											FACTORY_DEFAULT_STATE.flashLightBrightness
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.sfx_retrigger_ms}
										value={s.retriggerMs}
										min={20}
										max={800}
										step={5}
										onChange={set.retriggerMs}
										defaultValue={
											FACTORY_DEFAULT_STATE.flashLightRetriggerMs
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
								</div>
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
								<FxBandThresholdControls
									thresholds={s.bandThresholds}
									defaultThresholds={
										FACTORY_DEFAULT_STATE.flashLightBandThresholds
									}
									onChange={set.bandThreshold}
								/>
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
