import { useT } from '@/lib/i18n';
import { FACTORY_DEFAULT_STATE } from '@/store/factoryDefaults';
import { SegmentedControl, ToggleSwitch } from '@/ui';
import {
	ColorField,
	MotionSlider as Slider
} from '@/editor/MotionSharedControls';
import { formatDecimal } from '@/editor/motionTabUtils';
import type {
	StageFxColorMode,
	StageLightsColorSource
} from '../stageFxConfig';

type StageFxColorControlsProps = {
	kind: 'stage' | 'flash';
	colorSource: StageLightsColorSource;
	colorMode: StageFxColorMode;
	primaryColor: string;
	secondaryColor: string;
	rainbowColors: string[];
	manualGlow: boolean;
	glowStrength: number;
	glowSize: number;
	onColorSourceChange: (value: StageLightsColorSource) => void;
	onColorModeChange: (value: StageFxColorMode) => void;
	onPrimaryColorChange: (value: string) => void;
	onSecondaryColorChange: (value: string) => void;
	onRainbowColorsChange: (value: string[]) => void;
	onManualGlowChange: (value: boolean) => void;
	onGlowStrengthChange: (value: number) => void;
	onGlowSizeChange: (value: number) => void;
};

export function StageFxColorControls(props: StageFxColorControlsProps) {
	const t = useT();
	const defaults =
		props.kind === 'stage'
			? {
					glowStrength: FACTORY_DEFAULT_STATE.stageLightsGlowStrength,
					glowSize: FACTORY_DEFAULT_STATE.stageLightsGlowSize
				}
			: {
					glowStrength: FACTORY_DEFAULT_STATE.flashLightGlowStrength,
					glowSize: FACTORY_DEFAULT_STATE.flashLightGlowSize
				};
	const usesSecondary = props.colorMode === 'gradient';
	const usesPalette =
		props.colorMode === 'rainbow' ||
		props.colorMode === 'visible-rotate' ||
		props.colorMode === 'complete-rotate';

	return (
		<div className="flex flex-col gap-2 rounded-[var(--editor-radius-sm)] border border-[var(--editor-accent-border)] p-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] font-medium">
					{t.sfx_color_system}
				</span>
				<span className="text-[9px] text-[var(--editor-text-muted)]">
					{t.sfx_color_system_hint}
				</span>
			</div>
			<SegmentedControl<StageLightsColorSource>
				value={props.colorSource}
				onChange={props.onColorSourceChange}
				options={[
					{ value: 'theme', label: t.sfx_color_theme },
					{ value: 'image', label: t.sfx_color_image },
					{ value: 'manual', label: t.sfx_color_manual }
				]}
				size="sm"
				full
			/>
			<SegmentedControl<StageFxColorMode>
				value={props.colorMode}
				onChange={props.onColorModeChange}
				options={[
					{ value: 'solid', label: t.sfx_color_mode_solid },
					{ value: 'gradient', label: t.sfx_color_mode_gradient },
					{ value: 'rainbow', label: t.sfx_color_mode_rgb },
					{
						value: 'visible-rotate',
						label: t.sfx_color_mode_visible_rgb
					},
					{
						value: 'complete-rotate',
						label: t.sfx_color_mode_complete_rgb
					}
				]}
				size="sm"
				full
			/>
			{props.colorSource === 'manual' ? (
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<ColorField
						label={t.sfx_primary_color}
						value={props.primaryColor}
						onChange={props.onPrimaryColorChange}
					/>
					{usesSecondary ? (
						<ColorField
							label={t.sfx_secondary_color}
							value={props.secondaryColor}
							onChange={props.onSecondaryColorChange}
						/>
					) : null}
				</div>
			) : null}
			{props.colorSource === 'manual' && usesPalette ? (
				<label className="flex flex-col gap-1 text-[10px] text-[var(--editor-text-muted)]">
					<span>{t.sfx_manual_palette}</span>
					<span className="flex flex-wrap gap-1">
						{props.rainbowColors.map((color, index) => (
							<input
								key={index}
								type="color"
								value={color}
								onChange={event => {
									const next = [...props.rainbowColors];
									next[index] = event.target.value;
									props.onRainbowColorsChange(next);
								}}
								className="h-7 w-9 cursor-pointer rounded border border-[var(--editor-accent-border)] bg-transparent p-0.5"
								aria-label={`${t.sfx_manual_palette} ${index + 1}`}
							/>
						))}
					</span>
				</label>
			) : null}
			<div className="flex items-center justify-between gap-2">
				<div>
					<div className="text-[11px]">{t.sfx_manual_glow}</div>
					<div className="text-[9px] text-[var(--editor-text-muted)]">
						{t.sfx_manual_glow_hint}
					</div>
				</div>
				<ToggleSwitch
					checked={props.manualGlow}
					onChange={props.onManualGlowChange}
					size="sm"
					ariaLabel={t.sfx_manual_glow}
				/>
			</div>
			{props.manualGlow ? (
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<Slider
						label={t.sfx_glow_strength}
						value={props.glowStrength}
						min={0}
						max={3}
						step={0.01}
						onChange={props.onGlowStrengthChange}
						defaultValue={defaults.glowStrength}
						variant="compact"
						formatValue={formatDecimal}
					/>
					<Slider
						label={t.sfx_glow_size}
						value={props.glowSize}
						min={0}
						max={1}
						step={0.01}
						onChange={props.onGlowSizeChange}
						defaultValue={defaults.glowSize}
						variant="compact"
						formatValue={formatDecimal}
					/>
				</div>
			) : null}
		</div>
	);
}
