import { useShallow } from 'zustand/react/shallow';
import {
	LockKeyhole,
	Plus,
	Save,
	RotateCcw,
	Trash2,
	Wand2
} from 'lucide-react';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import {
	AUDIO_ROUTING_RANGES,
	FILTER_RANGES,
	IMAGE_EFFECT_RANGES,
	LOGO_RANGES,
	SCANLINE_RANGES
} from '@/config/ranges';
import type { FilterTarget, ScanlineMode } from '@/types/wallpaper';
import {
	buildFilterLookCatalog,
	findFilterLookCatalogIndex,
	type FactoryFilterLookId
} from '@/features/filterLooks/filterLooks';
import { MAX_LOOKS_SLOT_COUNT } from '@/store/featureProfiles';
import {
	Button,
	Caption,
	EditorTabFooter,
	EditorTabHeader,
	EditorTabLayout,
	EnumButtonGroup as EnumButtons,
	FeatureGate,
	IconButton,
	SectionCard,
	UI_COLORS,
	ICON_SIZE
} from '@/ui';
import { CollapsibleSection } from '@/editor';
import SliderControl from '@/editor/SliderControl';
import ToggleControl from '@/editor/ToggleControl';
import AudioChannelSelector from '@/editor/AudioChannelSelector';
import { AdvancedOnly, useIsSimple } from '@/editor/UIMode';
import { useDialog } from '@/editor/DialogProvider';
import { confirmResetFiltersDefaults } from '@/editor/confirmCritical';
import EffectLayerStack from '@/components/controls/tabs/main/looks/EffectLayerStack';

const FILTER_TARGETS: FilterTarget[] = [
	'global-background',
	'background',
	'selected-overlay',
	'logo',
	'spectrum',
	'particles',
	'rain',
	'track-title',
	'lyrics'
];

const SCANLINE_MODES: ScanlineMode[] = ['always', 'pulse', 'burst', 'beat'];

const LOOK_GRADIENTS: Record<FactoryFilterLookId, string> = {
	crt: 'linear-gradient(135deg, #22d3ee, #6366f1)',
	vhs: 'linear-gradient(135deg, #64748b, #f59e0b)',
	'cyber-neon': 'linear-gradient(135deg, #06b6d4, #ec4899)',
	'dream-bloom': 'linear-gradient(135deg, #f0abfc, #38bdf8)',
	'monochrome-ink': 'linear-gradient(135deg, #18181b, #71717a)',
	'club-glitch': 'linear-gradient(135deg, #f43f5e, #8b5cf6)',
	'glass-mist': 'linear-gradient(135deg, #bae6fd, #c4b5fd)',
	'infrared-pulse': 'linear-gradient(135deg, #fb923c, #ef4444)',
	'noir-cinema': 'linear-gradient(135deg, #09090b, #71717a)',
	hologram: 'linear-gradient(135deg, #22d3ee, #a5f3fc)',
	'sunset-film': 'linear-gradient(135deg, #fb7185, #fbbf24)',
	'ice-signal': 'linear-gradient(135deg, #2563eb, #cffafe)'
};

export default function LooksTab({ onReset }: { onReset: () => void }) {
	const isSimple = useIsSimple();
	const primaryVariant = isSimple ? 'macro' : 'compact';
	const t = useT();
	const filterTargetLabels: Record<FilterTarget, string> = {
		'global-background': t.looks_target_global_bg,
		background: t.looks_target_background,
		'selected-overlay': t.looks_target_selected_overlay,
		logo: t.looks_target_logo,
		spectrum: t.looks_target_spectrum,
		particles: t.looks_target_particles,
		rain: t.looks_target_rain,
		'track-title': t.looks_target_track_title,
		lyrics: t.looks_target_lyrics
	};
	const scanlineModeLabels: Record<ScanlineMode, string> = {
		always: t.scanline_mode_always,
		pulse: t.scanline_mode_pulse,
		burst: t.scanline_mode_burst,
		beat: t.scanline_mode_beat
	};
	const { confirm } = useDialog();
	const store = useWallpaperStore(
		useShallow(s => ({
			overlays: s.overlays,
			selectedOverlayId: s.selectedOverlayId,
			filterTargets: s.filterTargets,
			activeFilterLookId: s.activeFilterLookId,
			filterOpacity: s.filterOpacity,
			filterBrightness: s.filterBrightness,
			filterContrast: s.filterContrast,
			filterSaturation: s.filterSaturation,
			filterBlur: s.filterBlur,
			filterHueRotate: s.filterHueRotate,
			filterVignette: s.filterVignette,
			filterBloom: s.filterBloom,
			filterLumaThreshold: s.filterLumaThreshold,
			filterLensWarp: s.filterLensWarp,
			filterHeatDistortion: s.filterHeatDistortion,
			rgbShift: s.rgbShift,
			rgbShiftAudioReactive: s.rgbShiftAudioReactive,
			rgbShiftAudioChannel: s.rgbShiftAudioChannel,
			rgbShiftAudioSmoothing: s.rgbShiftAudioSmoothing,
			rgbShiftAudioSensitivity: s.rgbShiftAudioSensitivity,
			rgbShiftAudioAttack: s.rgbShiftAudioAttack,
			rgbShiftAudioRelease: s.rgbShiftAudioRelease,
			rgbShiftAudioReactivitySpeed: s.rgbShiftAudioReactivitySpeed,
			rgbShiftAudioPeakWindow: s.rgbShiftAudioPeakWindow,
			rgbShiftAudioPeakFloor: s.rgbShiftAudioPeakFloor,
			rgbShiftAudioPunch: s.rgbShiftAudioPunch,
			noiseIntensity: s.noiseIntensity,
			scanlinesEnabled: s.scanlinesEnabled,
			scanlineIntensity: s.scanlineIntensity,
			scanlineMode: s.scanlineMode,
			scanlineSpacing: s.scanlineSpacing,
			scanlineThickness: s.scanlineThickness,
			looksProfileSlots: s.looksProfileSlots,
			toggleFilterTarget: s.toggleFilterTarget,
			setFilterTargets: s.setFilterTargets,
			resetFiltersToDefaults: s.resetFiltersToDefaults,
			saveCurrentLooksAsNewSlot: s.saveCurrentLooksAsNewSlot,
			randomizeLooks: s.randomizeLooks,
			applyFilterLook: s.applyFilterLook,
			setFilterOpacity: s.setFilterOpacity,
			setFilterBrightness: s.setFilterBrightness,
			setFilterContrast: s.setFilterContrast,
			setFilterSaturation: s.setFilterSaturation,
			setFilterBlur: s.setFilterBlur,
			setFilterHueRotate: s.setFilterHueRotate,
			setFilterVignette: s.setFilterVignette,
			setFilterBloom: s.setFilterBloom,
			setFilterLumaThreshold: s.setFilterLumaThreshold,
			setFilterLensWarp: s.setFilterLensWarp,
			setFilterHeatDistortion: s.setFilterHeatDistortion,
			setRgbShift: s.setRgbShift,
			setRgbShiftAudioReactive: s.setRgbShiftAudioReactive,
			setRgbShiftAudioChannel: s.setRgbShiftAudioChannel,
			setRgbShiftAudioSmoothing: s.setRgbShiftAudioSmoothing,
			setRgbShiftAudioSensitivity: s.setRgbShiftAudioSensitivity,
			setRgbShiftAudioAttack: s.setRgbShiftAudioAttack,
			setRgbShiftAudioRelease: s.setRgbShiftAudioRelease,
			setRgbShiftAudioReactivitySpeed: s.setRgbShiftAudioReactivitySpeed,
			setRgbShiftAudioPeakWindow: s.setRgbShiftAudioPeakWindow,
			setRgbShiftAudioPeakFloor: s.setRgbShiftAudioPeakFloor,
			setRgbShiftAudioPunch: s.setRgbShiftAudioPunch,
			setNoiseIntensity: s.setNoiseIntensity,
			setScanlinesEnabled: s.setScanlinesEnabled,
			setScanlineIntensity: s.setScanlineIntensity,
			setScanlineMode: s.setScanlineMode,
			setScanlineSpacing: s.setScanlineSpacing,
			setScanlineThickness: s.setScanlineThickness,
			loadLooksProfileSlot: s.loadLooksProfileSlot,
			saveLooksProfileSlot: s.saveLooksProfileSlot,
			removeLooksProfileSlot: s.removeLooksProfileSlot
		}))
	);
	const selectedOverlay =
		store.overlays.find(
			overlay => overlay.id === store.selectedOverlayId
		) ?? null;
	const availableTargets = selectedOverlay
		? FILTER_TARGETS
		: FILTER_TARGETS.filter(target => target !== 'selected-overlay');
	const allTargetsEnabled = availableTargets.every(target =>
		store.filterTargets.includes(target)
	);
	const lookCatalog = buildFilterLookCatalog(store.looksProfileSlots);
	const activeCatalogIndex = findFilterLookCatalogIndex(
		lookCatalog,
		store.activeFilterLookId
	);
	const activeCatalogEntry =
		activeCatalogIndex >= 0 ? lookCatalog[activeCatalogIndex] : undefined;

	function toggleTarget(target: FilterTarget) {
		if (target === 'selected-overlay' && !selectedOverlay) return;
		store.toggleFilterTarget(target);
	}

	function toggleAllTargets() {
		if (allTargetsEnabled) {
			store.setFilterTargets(['background']);
			return;
		}
		store.setFilterTargets([...availableTargets]);
	}

	function saveCurrentAsSlot() {
		const emptyIndex = store.looksProfileSlots.findIndex(
			slot => slot.values === null
		);
		if (emptyIndex >= 0) {
			store.saveLooksProfileSlot(emptyIndex);
			return;
		}
		store.saveCurrentLooksAsNewSlot();
	}

	async function deleteLooksSlot(index: number, name: string) {
		const approved = await confirm({
			title: t.confirm_delete_profile_slot_title,
			message: t.confirm_delete_profile_slot_named.replace(
				'{name}',
				name
			),
			confirmLabel: t.label_delete_slot,
			cancelLabel: t.label_cancel,
			tone: 'danger'
		});
		if (approved) store.removeLooksProfileSlot(index);
	}

	return (
		<EditorTabLayout
			header={
				<EditorTabHeader
					title={t.tab_looks}
					subtitle={t.looks_subtitle_preset_first}
				/>
			}
			savedProfiles={
				<SectionCard
					title={t.label_look_packs}
					subtitle={t.looks_catalog_hint}
					density="compact"
					action={
						<Button
							type="button"
							onClick={saveCurrentAsSlot}
							disabled={
								store.looksProfileSlots.length >=
									MAX_LOOKS_SLOT_COUNT &&
								store.looksProfileSlots.every(
									slot => slot.values !== null
								)
							}
							size="sm"
							density="compact"
							variant="primary"
							icon={<Plus size={ICON_SIZE.xs} />}
						>
							{t.looks_save_current}
						</Button>
					}
				>
					<div className="flex flex-col gap-2">
						{activeCatalogEntry ? (
							<div
								className="rounded-[var(--editor-radius-md)] border px-2 py-1.5 text-[11px]"
								style={{
									background: UI_COLORS.raised,
									borderColor: UI_COLORS.accentBorder
								}}
							>
								<span style={{ color: UI_COLORS.fgMute }}>
									{t.label_active_look_prefix}{' '}
								</span>
								<strong style={{ color: UI_COLORS.accent }}>
									{activeCatalogEntry.name}
								</strong>
							</div>
						) : null}
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{lookCatalog.map(entry => {
								const isFactory = entry.kind === 'factory';
								const hasValues = entry.values !== null;
								const isActive =
									entry.key === activeCatalogEntry?.key;
								return (
									<div
										key={entry.key}
										className="group relative flex min-w-0 flex-col overflow-hidden"
										style={{
											borderRadius:
												'var(--editor-radius-lg)',
											border: `1px solid ${
												isActive
													? UI_COLORS.accentBorder
													: UI_COLORS.border
											}`,
											background: isActive
												? UI_COLORS.accentSoft
												: UI_COLORS.raised,
											boxShadow: isActive
												? '0 0 0 1px color-mix(in srgb, var(--vibrix-accent) 36%, transparent)'
												: 'none'
										}}
									>
										<button
											type="button"
											onClick={() => {
												if (entry.kind === 'factory') {
													store.applyFilterLook(
														entry.preset
													);
												} else if (entry.values) {
													store.loadLooksProfileSlot(
														entry.slotIndex
													);
												} else {
													store.saveLooksProfileSlot(
														entry.slotIndex
													);
												}
											}}
											className="flex min-w-0 flex-1 flex-col text-left"
										>
											<div
												aria-hidden
												className="m-2 mb-1.5 h-9 rounded-[var(--editor-radius-md)]"
												style={{
													background: isFactory
														? LOOK_GRADIENTS[
																entry.preset.id
															]
														: 'linear-gradient(135deg, var(--editor-tag-bg), var(--editor-panel-bg))',
													border: `1px solid ${UI_COLORS.hairline}`,
													opacity: hasValues
														? 1
														: 0.45
												}}
											/>
											<div className="min-w-0 px-2 pb-2">
												<div className="flex items-center gap-1">
													{isFactory ? (
														<LockKeyhole
															size={10}
															style={{
																color: UI_COLORS.fgMute
															}}
														/>
													) : null}
													<div
														className="min-w-0 flex-1 truncate text-[12px] font-semibold"
														style={{
															color: isActive
																? UI_COLORS.accent
																: UI_COLORS.fg
														}}
													>
														{hasValues
															? entry.name
															: t.profile_slot_empty}
													</div>
												</div>
												<Caption
													as="div"
													className="line-clamp-2"
												>
													{isFactory
														? t[
																entry.preset
																	.descriptionKey
															]
														: hasValues
															? t.looks_user_slot
															: t.looks_empty_slot_hint}
												</Caption>
											</div>
										</button>
										{entry.kind === 'slot' &&
										entry.values ? (
											<div className="absolute right-1 top-1 flex gap-0.5 rounded-md bg-black/40 p-0.5">
												<IconButton
													onClick={() =>
														store.saveLooksProfileSlot(
															entry.slotIndex
														)
													}
													size="sm"
													density="compact"
													title={t.label_save_profile}
													aria-label={
														t.label_save_profile
													}
												>
													<Save size={ICON_SIZE.xs} />
												</IconButton>
												<IconButton
													onClick={() =>
														void deleteLooksSlot(
															entry.slotIndex,
															entry.name
														)
													}
													size="sm"
													density="compact"
													variant="destructive"
													title={t.label_delete_slot}
													aria-label={
														t.label_delete_slot
													}
												>
													<Trash2
														size={ICON_SIZE.xs}
													/>
												</IconButton>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					</div>
				</SectionCard>
			}
			footer={
				<EditorTabFooter title={t.looks_section_reset}>
					<Button
						type="button"
						onClick={onReset}
						size="sm"
						density="compact"
						variant="secondary"
						icon={<RotateCcw size={ICON_SIZE.xs} />}
					>
						{t.reset_tab}
					</Button>
					<Button
						type="button"
						onClick={() =>
							void (async () => {
								if (
									!(await confirmResetFiltersDefaults(
										confirm,
										t
									))
								) {
									return;
								}
								store.resetFiltersToDefaults();
							})()
						}
						size="sm"
						density="compact"
						variant="warning"
						icon={<RotateCcw size={ICON_SIZE.xs} />}
					>
						{t.label_reset_filters_only}
					</Button>
				</EditorTabFooter>
			}
		>
			<SectionCard
				title={t.quick_adjust_section}
				subtitle={t.quick_adjust_subtitle}
				density="compact"
			>
				<Button
					type="button"
					onClick={() => store.randomizeLooks()}
					size="sm"
					density="compact"
					variant="secondary"
					icon={<Wand2 size={ICON_SIZE.xs} />}
				>
					{t.btn_randomize}
				</Button>
			</SectionCard>

			<AdvancedOnly>
				<EffectLayerStack targetLabels={filterTargetLabels} />
			</AdvancedOnly>

			<AdvancedOnly>
				<SectionCard
					title={t.label_filter_target}
					subtitle={t.hint_filter_target}
					density="compact"
					action={
						<Button
							type="button"
							onClick={toggleAllTargets}
							size="sm"
							density="compact"
							variant={
								allTargetsEnabled ? 'primary' : 'secondary'
							}
						>
							{t.label_all_layers}
						</Button>
					}
				>
					<div className="flex flex-wrap gap-1">
						{FILTER_TARGETS.map(target => {
							const disabled =
								target === 'selected-overlay' &&
								!selectedOverlay;
							const active = store.filterTargets.includes(target);
							return (
								<Button
									key={target}
									type="button"
									onClick={() => toggleTarget(target)}
									disabled={disabled}
									variant={active ? 'primary' : 'secondary'}
									size="sm"
									density="compact"
									active={active}
								>
									{filterTargetLabels[target]}
								</Button>
							);
						})}
					</div>
				</SectionCard>
			</AdvancedOnly>

			<SectionCard
				title={t.section_appearance}
				subtitle={t.looks_subtitle_tone_basic}
				density="compact"
			>
				<div className="flex flex-col gap-1">
					<SliderControl
						label={t.label_opacity}
						value={store.filterOpacity}
						{...FILTER_RANGES.opacity}
						onChange={store.setFilterOpacity}
						variant={primaryVariant}
					/>
					<SliderControl
						label={t.label_brightness}
						value={store.filterBrightness}
						{...FILTER_RANGES.brightness}
						onChange={store.setFilterBrightness}
						variant={primaryVariant}
					/>
					<SliderControl
						label={t.label_contrast}
						value={store.filterContrast}
						{...FILTER_RANGES.contrast}
						onChange={store.setFilterContrast}
						variant={primaryVariant}
					/>
					<SliderControl
						label={t.label_saturation}
						value={store.filterSaturation}
						{...FILTER_RANGES.saturation}
						onChange={store.setFilterSaturation}
						variant={primaryVariant}
					/>
					<SliderControl
						label={t.label_blur}
						value={store.filterBlur}
						{...FILTER_RANGES.blur}
						onChange={store.setFilterBlur}
						unit="px"
					/>
					<SliderControl
						label={t.label_hue_rotate}
						value={store.filterHueRotate}
						{...FILTER_RANGES.hueRotate}
						onChange={store.setFilterHueRotate}
						unit="deg"
					/>
				</div>
			</SectionCard>

			<AdvancedOnly>
				<SectionCard title={t.looks_section_glitch} density="compact">
					<div className="flex flex-col gap-1">
						<SliderControl
							label={t.label_rgb_shift}
							value={store.rgbShift}
							{...IMAGE_EFFECT_RANGES.rgbShift}
							onChange={store.setRgbShift}
						/>
						<ToggleControl
							label={t.label_rgb_shift_audio_reactive}
							value={store.rgbShiftAudioReactive}
							onChange={store.setRgbShiftAudioReactive}
						/>
						{store.rgbShiftAudioReactive ? (
							<>
								<AudioChannelSelector
									value={store.rgbShiftAudioChannel}
									onChange={store.setRgbShiftAudioChannel}
								/>
								<SliderControl
									label={t.label_smoothing}
									value={store.rgbShiftAudioSmoothing}
									{...AUDIO_ROUTING_RANGES.selectedChannelSmoothing}
									onChange={store.setRgbShiftAudioSmoothing}
								/>
								<SliderControl
									label={t.label_rgb_shift_audio_sensitivity}
									value={store.rgbShiftAudioSensitivity}
									{...IMAGE_EFFECT_RANGES.rgbAudioSensitivity}
									onChange={store.setRgbShiftAudioSensitivity}
								/>
								<CollapsibleSection
									title={t.label_envelope_params}
									dense
								>
									<div className="flex flex-col gap-2">
										<SliderControl
											label="Attack"
											value={store.rgbShiftAudioAttack}
											{...LOGO_RANGES.attack}
											onChange={
												store.setRgbShiftAudioAttack
											}
										/>
										<SliderControl
											label="Release"
											value={store.rgbShiftAudioRelease}
											{...LOGO_RANGES.release}
											onChange={
												store.setRgbShiftAudioRelease
											}
										/>
										<SliderControl
											label="Response speed"
											value={
												store.rgbShiftAudioReactivitySpeed
											}
											{...LOGO_RANGES.reactivitySpeed}
											onChange={
												store.setRgbShiftAudioReactivitySpeed
											}
										/>
										<SliderControl
											label="Peak window (s)"
											value={
												store.rgbShiftAudioPeakWindow
											}
											{...LOGO_RANGES.peakWindow}
											onChange={
												store.setRgbShiftAudioPeakWindow
											}
										/>
										<SliderControl
											label="Peak floor"
											value={store.rgbShiftAudioPeakFloor}
											{...LOGO_RANGES.peakFloor}
											onChange={
												store.setRgbShiftAudioPeakFloor
											}
										/>
										<SliderControl
											label="Punch"
											value={store.rgbShiftAudioPunch}
											{...LOGO_RANGES.punch}
											onChange={
												store.setRgbShiftAudioPunch
											}
										/>
									</div>
								</CollapsibleSection>
							</>
						) : null}
						<SliderControl
							label={t.label_noise_intensity}
							value={store.noiseIntensity}
							{...IMAGE_EFFECT_RANGES.noiseIntensity}
							onChange={store.setNoiseIntensity}
						/>
					</div>
				</SectionCard>
			</AdvancedOnly>

			<AdvancedOnly>
				<SectionCard
					title={t.looks_section_cinematic}
					density="compact"
				>
					<div className="flex flex-col gap-1">
						<SliderControl
							label="Vignette"
							value={store.filterVignette}
							{...FILTER_RANGES.vignette}
							onChange={store.setFilterVignette}
						/>
						<SliderControl
							label="Bloom"
							value={store.filterBloom}
							{...FILTER_RANGES.bloom}
							onChange={store.setFilterBloom}
						/>
						<SliderControl
							label="Luma Threshold"
							value={store.filterLumaThreshold}
							{...FILTER_RANGES.lumaThreshold}
							onChange={store.setFilterLumaThreshold}
						/>
						<SliderControl
							label="Lens Warp"
							value={store.filterLensWarp}
							{...FILTER_RANGES.lensWarp}
							onChange={store.setFilterLensWarp}
						/>
						<SliderControl
							label="Heat Distortion"
							value={store.filterHeatDistortion}
							{...FILTER_RANGES.heatDistortion}
							onChange={store.setFilterHeatDistortion}
						/>
					</div>
				</SectionCard>
			</AdvancedOnly>

			<AdvancedOnly>
				<SectionCard title={t.label_scanlines} density="compact">
					<div className="flex flex-col gap-1">
						<ToggleControl
							label={t.label_enabled}
							value={store.scanlinesEnabled}
							onChange={store.setScanlinesEnabled}
						/>
						<FeatureGate
							enabled={store.scanlinesEnabled}
							hint={t.hint_enable_to_configure}
						>
							<SliderControl
								label={t.label_intensity}
								value={store.scanlineIntensity}
								{...SCANLINE_RANGES.intensity}
								onChange={store.setScanlineIntensity}
							/>
							{store.scanlineIntensity > 0 ? (
								<>
									<div className="flex flex-col gap-1">
										<span
											className="text-xs"
											style={{ color: UI_COLORS.fgMute }}
										>
											{t.label_scanline_mode}
										</span>
										<EnumButtons<ScanlineMode>
											options={SCANLINE_MODES}
											value={store.scanlineMode}
											onChange={store.setScanlineMode}
											labels={scanlineModeLabels}
										/>
									</div>
									<SliderControl
										label={t.label_spacing}
										value={store.scanlineSpacing}
										{...SCANLINE_RANGES.spacing}
										onChange={store.setScanlineSpacing}
									/>
									<SliderControl
										label={t.label_thickness}
										value={store.scanlineThickness}
										{...SCANLINE_RANGES.thickness}
										onChange={store.setScanlineThickness}
									/>
								</>
							) : null}
						</FeatureGate>
					</div>
				</SectionCard>
			</AdvancedOnly>
		</EditorTabLayout>
	);
}
