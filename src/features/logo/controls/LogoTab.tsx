import { useRef } from 'react';
import { Activity, ImageUp, Layout, RotateCcw, Sparkles } from 'lucide-react';
import { FlashEdgeSection } from '@/features/flashEdge/controls/FlashEdgeSection';
import { useShallow } from 'zustand/react/shallow';
import { resetLogoRotation } from '@/features/logo';
import { AUDIO_REACTIVE_CHANNELS } from '@/lib/audio/audioChannels';
import { loadImage, saveImage } from '@/lib/db/imageDb';
import {
	doProfileSettingsMatch,
	extractLogoProfileSettings,
	MAX_LOGO_SLOT_COUNT
} from '@/store/featureProfiles';
import { AUDIO_ROUTING_RANGES, LOGO_RANGES } from '@/config/ranges';
import { useT } from '@/lib/i18n';
import { useTabViewState } from '@/hooks/useTabViewState';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type {
	AudioReactiveChannel,
	ColorSourceMode,
	LogoVariantMode,
	WallpaperState
} from '@/types/wallpaper';
import {
	Button,
	EditorTabFooter,
	FeatureGate,
	EditorTabHeader,
	EditorTabLayout,
	SectionCard,
	SegmentedControl,
	Slider,
	UI_COLORS,
	ICON_SIZE
} from '@/ui';
import { CollapsibleSection } from '@/editor';
import { ProfileSlotsEditor } from '@/editor';
import {
	ColorSourceField,
	HintText,
	OptionButtonGroup,
	SwitchRow
} from '@/editor/advancedControls';
import { useDialog } from '@/editor/DialogProvider';
import { useIsSimple } from '@/editor/UIMode';
import { LOGO_QUICK_PROFILES, type LogoQuickProfile } from '@/features/logo';
import {
	APP_LOGO_PIXEL_URL,
	isBuiltInAppLogoUrl,
	resolveAppLogoUrl,
	shouldUsePixelAppLogo
} from '@/config/appLogo';

function formatDecimal(value: number): string {
	return value.toFixed(2);
}

function formatInteger(value: number): string {
	return Math.round(value).toString();
}

function sharedColorSource(values: ColorSourceMode[]): ColorSourceMode | null {
	const first = values[0];
	if (!first) return null;
	return values.every(value => value === first) ? first : null;
}

type LogoView = 'layout' | 'reactivity' | 'finish';

const MODERN_LOGO_VIEW_STORAGE_KEY = 'lwag-modern-logo-view';

function isLogoView(value: unknown): value is LogoView {
	return value === 'layout' || value === 'reactivity' || value === 'finish';
}

export default function LogoTab({ onReset }: { onReset: () => void }) {
	const isSimple = useIsSimple();
	const primaryVariant = isSimple ? 'macro' : 'compact';
	const t = useT();
	const { confirm } = useDialog();
	const uploadRef = useRef<HTMLInputElement>(null);
	const [view, setView] = useTabViewState<LogoView>(
		'advanced/logo',
		'layout',
		isLogoView,
		{ legacyStorageKey: MODERN_LOGO_VIEW_STORAGE_KEY }
	);
	const store = useWallpaperStore(
		useShallow(s => ({
			logoEnabled: s.logoEnabled,
			logoUrl: s.logoUrl,
			logoId: s.logoId,
			logoVariantMode: s.logoVariantMode,
			spectrumEnabled: s.spectrumEnabled,
			spectrumMainVisible: s.spectrumMainVisible,
			spectrumFamily: s.spectrumFamily,
			spectrumShape: s.spectrumShape,
			spectrumPixelate: s.spectrumPixelate,
			spectrumInstances: s.spectrumInstances,
			logoBaseSize: s.logoBaseSize,
			logoPositionX: s.logoPositionX,
			logoPositionY: s.logoPositionY,
			logoCircularCrop: s.logoCircularCrop,
			logoCropRadius: s.logoCropRadius,
			logoBandMode: s.logoBandMode,
			logoAudioSensitivity: s.logoAudioSensitivity,
			logoAudioSmoothing: s.logoAudioSmoothing,
			logoReactiveScaleIntensity: s.logoReactiveScaleIntensity,
			logoReactivitySpeed: s.logoReactivitySpeed,
			logoMinScale: s.logoMinScale,
			logoMaxScale: s.logoMaxScale,
			logoPunch: s.logoPunch,
			logoAttack: s.logoAttack,
			logoRelease: s.logoRelease,
			logoPeakWindow: s.logoPeakWindow,
			logoPeakFloor: s.logoPeakFloor,
			logoGlowEnabled: s.logoGlowEnabled,
			logoGlowColor: s.logoGlowColor,
			logoGlowColorSource: s.logoGlowColorSource,
			logoGlowBlur: s.logoGlowBlur,
			logoGlowReach: s.logoGlowReach,
			logoGlowAudioAmount: s.logoGlowAudioAmount,
			logoRotationSpeed: s.logoRotationSpeed,
			logoShadowEnabled: s.logoShadowEnabled,
			logoShadowColor: s.logoShadowColor,
			logoShadowColorSource: s.logoShadowColorSource,
			logoShadowBlur: s.logoShadowBlur,
			logoBackdropEnabled: s.logoBackdropEnabled,
			logoBackdropColor: s.logoBackdropColor,
			logoBackdropColorSource: s.logoBackdropColorSource,
			logoBackdropOpacity: s.logoBackdropOpacity,
			logoBackdropPadding: s.logoBackdropPadding,
			logoProfileSlots: s.logoProfileSlots,
			setLogoColorSources: s.setLogoColorSources,
			setLogoEnabled: s.setLogoEnabled,
			setLogoVariantMode: s.setLogoVariantMode,
			setLogoAsset: s.setLogoAsset,
			restoreFactoryLogo: s.restoreFactoryLogo,
			setLogoBaseSize: s.setLogoBaseSize,
			setLogoPositionX: s.setLogoPositionX,
			setLogoPositionY: s.setLogoPositionY,
			autoPlaceLogoForActiveImage: s.autoPlaceLogoForActiveImage,
			setLogoCircularCrop: s.setLogoCircularCrop,
			setLogoCropRadius: s.setLogoCropRadius,
			setLogoBandMode: s.setLogoBandMode,
			setLogoAudioSensitivity: s.setLogoAudioSensitivity,
			setLogoAudioSmoothing: s.setLogoAudioSmoothing,
			setLogoReactiveScaleIntensity: s.setLogoReactiveScaleIntensity,
			setLogoReactivitySpeed: s.setLogoReactivitySpeed,
			setLogoMinScale: s.setLogoMinScale,
			setLogoMaxScale: s.setLogoMaxScale,
			setLogoPunch: s.setLogoPunch,
			setLogoAttack: s.setLogoAttack,
			setLogoRelease: s.setLogoRelease,
			setLogoPeakWindow: s.setLogoPeakWindow,
			setLogoPeakFloor: s.setLogoPeakFloor,
			setLogoGlowEnabled: s.setLogoGlowEnabled,
			setLogoGlowColor: s.setLogoGlowColor,
			setLogoGlowColorSource: s.setLogoGlowColorSource,
			setLogoGlowBlur: s.setLogoGlowBlur,
			setLogoGlowReach: s.setLogoGlowReach,
			setLogoGlowAudioAmount: s.setLogoGlowAudioAmount,
			setLogoRotationSpeed: s.setLogoRotationSpeed,
			setLogoShadowEnabled: s.setLogoShadowEnabled,
			setLogoShadowColor: s.setLogoShadowColor,
			setLogoShadowColorSource: s.setLogoShadowColorSource,
			setLogoShadowBlur: s.setLogoShadowBlur,
			setLogoBackdropEnabled: s.setLogoBackdropEnabled,
			setLogoBackdropColor: s.setLogoBackdropColor,
			setLogoBackdropColorSource: s.setLogoBackdropColorSource,
			setLogoBackdropOpacity: s.setLogoBackdropOpacity,
			setLogoBackdropPadding: s.setLogoBackdropPadding,
			loadLogoProfileSlot: s.loadLogoProfileSlot,
			saveLogoProfileSlot: s.saveLogoProfileSlot,
			addLogoProfileSlot: s.addLogoProfileSlot,
			removeLogoProfileSlot: s.removeLogoProfileSlot
		}))
	);

	const fullStore = useWallpaperStore.getState();
	const currentProfileSettings = extractLogoProfileSettings(fullStore);
	const activeSavedProfileIndex = store.logoProfileSlots.findIndex(slot =>
		doProfileSettingsMatch(currentProfileSettings, slot.values)
	);
	const activeQuickProfile =
		(
			Object.entries(LOGO_QUICK_PROFILES) as Array<
				[LogoQuickProfile, Partial<WallpaperState>]
			>
		).find(([, profile]) =>
			Object.entries(profile).every(
				([key, value]) =>
					fullStore[key as keyof WallpaperState] === value
			)
		)?.[0] ?? 'balanced';
	const colorSourceLabels: Record<ColorSourceMode, string> = {
		manual: t.label_manual_color,
		theme: t.label_theme,
		image: t.label_current_image
	};
	const audioChannelLabels: Record<AudioReactiveChannel, string> = {
		auto: t.channel_auto,
		kick: t.channel_kick,
		instrumental: t.channel_instrumental,
		bass: t.channel_bass,
		hihat: t.channel_hihat,
		vocal: t.channel_vocal,
		full: t.channel_full
	};
	const quickProfileLabels: Record<LogoQuickProfile, string> = {
		subtle: t.profile_subtle,
		balanced: t.profile_balanced,
		dsg: t.profile_dsg
	};
	const logoVariantLabels: Record<LogoVariantMode, string> = {
		vector: t.logo_variant_vector,
		pixel: t.logo_variant_pixel,
		auto: t.logo_variant_auto
	};
	const builtInLogo = !store.logoId && isBuiltInAppLogoUrl(store.logoUrl);
	const autoPixelated = shouldUsePixelAppLogo(store);
	const effectiveLogoUrl = resolveAppLogoUrl(
		store.logoUrl,
		store.logoVariantMode,
		autoPixelated
	);
	const effectiveBuiltInVariant =
		effectiveLogoUrl === APP_LOGO_PIXEL_URL ? 'pixel' : 'vector';
	const sharedLogoColorSource = sharedColorSource([
		store.logoGlowColorSource,
		store.logoShadowColorSource,
		store.logoBackdropColorSource
	]);
	const viewOptions = [
		{
			value: 'layout',
			label: 'Layout',
			icon: <Layout size={ICON_SIZE.xs} />
		},
		{
			value: 'reactivity',
			label: 'React',
			icon: <Activity size={ICON_SIZE.xs} />
		},
		{
			value: 'finish',
			label: 'Finish',
			icon: <Sparkles size={ICON_SIZE.xs} />
		}
	] as const;

	function applyQuickProfile(profile: LogoQuickProfile) {
		useWallpaperStore.setState(LOGO_QUICK_PROFILES[profile]);
	}

	async function handleSaveProfile(index: number) {
		const slot = store.logoProfileSlots[index];
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
		store.saveLogoProfileSlot(index);
	}

	async function handleLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		const id = await saveImage(file);
		const url = await loadImage(id);
		event.target.value = '';
		if (!url) return;
		store.setLogoAsset(id, url);
	}

	async function restoreBuiltInLogo() {
		const ok = await confirm({
			title: t.confirm_restore_vibrix_logo_title,
			message: t.confirm_restore_vibrix_logo_message,
			confirmLabel: t.restore_vibrix_logo,
			cancelLabel: t.label_cancel,
			tone: 'danger'
		});
		if (!ok) return;
		store.restoreFactoryLogo();
	}

	function resetLogoRotationControl() {
		resetLogoRotation();
		store.setLogoRotationSpeed(0);
	}

	return (
		<EditorTabLayout
			header={
				<EditorTabHeader
					title={t.tab_logo}
					subtitle={t.hint_logo_profiles}
					enabled={store.logoEnabled}
					onToggle={store.setLogoEnabled}
					switchAriaLabel={t.label_enabled}
				>
					<OptionButtonGroup<ColorSourceMode>
						label={t.label_color_source}
						options={['manual', 'theme', 'image']}
						value={sharedLogoColorSource}
						onChange={store.setLogoColorSources}
						labels={colorSourceLabels}
						columns={3}
					/>
				</EditorTabHeader>
			}
			savedProfiles={
				<SectionCard
					title={t.section_saved_profiles}
					subtitle={t.hint_saved_profiles}
					density="compact"
				>
					<ProfileSlotsEditor
						title=""
						hint={t.hint_saved_profiles}
						slots={store.logoProfileSlots}
						activeIndex={
							activeSavedProfileIndex >= 0
								? activeSavedProfileIndex
								: null
						}
						onLoad={store.loadLogoProfileSlot}
						onSave={index => void handleSaveProfile(index)}
						onAdd={store.addLogoProfileSlot}
						onDelete={store.removeLogoProfileSlot}
						loadLabel={t.label_load_profile}
						saveLabel={t.label_save_profile}
						slotLabel={t.label_profile_slot}
						emptyLabel={t.profile_slot_empty}
						activeLabel={t.profile_slot_active}
						maxSlots={MAX_LOGO_SLOT_COUNT}
					/>
				</SectionCard>
			}
			footer={
				<EditorTabFooter title={t.label_reset}>
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
				</EditorTabFooter>
			}
		>
			<SectionCard
				title={t.section_logo_source_profiles}
				subtitle={t.hint_logo_profiles}
				density="compact"
			>
				<div className="flex flex-col gap-3">
					<input
						ref={uploadRef}
						type="file"
						accept="image/*,.svg"
						onChange={event => void handleLogoFile(event)}
						className="hidden"
					/>
					<div
						className="flex items-center gap-3 rounded-[var(--editor-radius-md)] border p-2"
						style={{
							borderColor: UI_COLORS.border,
							background: UI_COLORS.raised
						}}
					>
						{effectiveLogoUrl ? (
							<img
								src={effectiveLogoUrl}
								alt=""
								className="h-12 w-12 shrink-0 rounded-[var(--editor-radius-md)] object-contain"
								style={
									store.logoCircularCrop
										? {
												clipPath: `circle(${Math.max(10, Math.min(50, store.logoCropRadius * 50))}% at 50% 50%)`
											}
										: undefined
								}
							/>
						) : (
							<div
								className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--editor-radius-md)]"
								style={{ background: UI_COLORS.overlay }}
							>
								<ImageUp size={ICON_SIZE.lg} />
							</div>
						)}
						<div className="min-w-0 flex-1">
							<div
								className="text-[12px] font-medium"
								style={{ color: UI_COLORS.fg }}
							>
								{t.label_logo_image}
							</div>
							<HintText>
								{builtInLogo
									? effectiveBuiltInVariant === 'pixel'
										? t.logo_source_builtin_pixel
										: t.logo_source_builtin_vector
									: store.logoUrl
										? t.logo_source_custom
										: t.logo_source_missing}
							</HintText>
						</div>
						<div className="flex shrink-0 items-center gap-1">
							{!builtInLogo ? (
								<Button
									size="sm"
									density="compact"
									variant="destructive"
									icon={<RotateCcw size={ICON_SIZE.xs} />}
									onClick={() => void restoreBuiltInLogo()}
								>
									{t.restore_vibrix_logo}
								</Button>
							) : null}
							<Button
								size="sm"
								density="compact"
								icon={<ImageUp size={ICON_SIZE.xs} />}
								onClick={() => uploadRef.current?.click()}
							>
								{t.upload_logo}
							</Button>
						</div>
					</div>
					{builtInLogo ? (
						<div className="flex flex-col gap-1.5">
							<OptionButtonGroup<LogoVariantMode>
								label={t.label_logo_variant}
								options={['vector', 'pixel', 'auto']}
								value={store.logoVariantMode}
								onChange={store.setLogoVariantMode}
								labels={logoVariantLabels}
								columns={3}
							/>
							<HintText>{t.hint_logo_variant_auto}</HintText>
						</div>
					) : null}
					<OptionButtonGroup<LogoQuickProfile>
						label="Quick profile"
						options={['subtle', 'balanced', 'dsg']}
						value={activeQuickProfile}
						onChange={applyQuickProfile}
						labels={quickProfileLabels}
						columns={3}
					/>
				</div>
			</SectionCard>

			<FeatureGate
				enabled={store.logoEnabled}
				hint={t.hint_enable_to_configure}
			>
				<>
					<SectionCard
						title={t.logo_controls_title}
						subtitle={t.logo_controls_subtitle}
						density="compact"
					>
						<SegmentedControl<LogoView>
							value={view}
							onChange={setView}
							options={viewOptions}
							size="sm"
							density="compact"
							full
							ariaLabel={t.logo_controls_aria}
						/>
					</SectionCard>

					{view === 'layout' ? (
						<SectionCard
							title={t.section_logo_transform}
							density="compact"
						>
							<div className="flex flex-col gap-3">
								<Slider
									label={t.label_base_size}
									value={store.logoBaseSize}
									{...LOGO_RANGES.baseSize}
									onChange={store.setLogoBaseSize}
									variant="macro"
									formatValue={formatInteger}
								/>
								<SwitchRow
									label={t.label_logo_circular_crop}
									checked={store.logoCircularCrop}
									onChange={store.setLogoCircularCrop}
								/>
								{store.logoCircularCrop ? (
									<Slider
										label={t.label_logo_crop_radius}
										value={store.logoCropRadius}
										min={0.1}
										max={1}
										step={0.01}
										onChange={store.setLogoCropRadius}
										variant="compact"
										formatValue={formatDecimal}
									/>
								) : null}
								<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
									<Slider
										label={t.label_position_x}
										value={store.logoPositionX}
										{...LOGO_RANGES.positionX}
										onChange={store.setLogoPositionX}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.label_position_y}
										value={store.logoPositionY}
										{...LOGO_RANGES.positionY}
										onChange={store.setLogoPositionY}
										variant="compact"
										formatValue={formatDecimal}
									/>
								</div>
								<Button
									onClick={() =>
										void store.autoPlaceLogoForActiveImage()
									}
									size="sm"
									density="compact"
									variant="secondary"
									title={t.hint_auto_place_logo}
									full
								>
									{t.label_auto_place_logo}
								</Button>
								<Slider
									label="Rotation speed"
									value={store.logoRotationSpeed}
									{...LOGO_RANGES.rotationSpeed}
									onChange={store.setLogoRotationSpeed}
									onReset={resetLogoRotationControl}
									variant="compact"
									formatValue={formatDecimal}
								/>
							</div>
						</SectionCard>
					) : null}

					{view === 'reactivity' ? (
						<SectionCard
							title={t.section_logo_reactivity}
							subtitle={t.hint_editor_diag_tip}
							density="compact"
						>
							<div className="flex flex-col gap-3">
								<OptionButtonGroup<AudioReactiveChannel>
									label={t.label_logo_band_mode}
									options={AUDIO_REACTIVE_CHANNELS}
									value={store.logoBandMode}
									onChange={store.setLogoBandMode}
									labels={audioChannelLabels}
									columns={3}
								/>
								<Slider
									label={t.label_logo_sensitivity}
									value={store.logoAudioSensitivity}
									{...LOGO_RANGES.audioSensitivity}
									onChange={store.setLogoAudioSensitivity}
									variant={primaryVariant}
									formatValue={formatDecimal}
								/>
								<Slider
									label={t.label_smoothing}
									value={store.logoAudioSmoothing}
									{...AUDIO_ROUTING_RANGES.selectedChannelSmoothing}
									onChange={store.setLogoAudioSmoothing}
									variant={primaryVariant}
									formatValue={formatDecimal}
								/>
								<Slider
									label={t.label_audio_glow}
									value={store.logoGlowAudioAmount}
									{...LOGO_RANGES.glowAudioAmount}
									onChange={store.setLogoGlowAudioAmount}
									variant={primaryVariant}
									formatValue={formatDecimal}
								/>
								<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
									<Slider
										label={t.label_reactive_scale}
										value={store.logoReactiveScaleIntensity}
										{...LOGO_RANGES.reactiveScaleIntensity}
										onChange={
											store.setLogoReactiveScaleIntensity
										}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.label_reactivity_speed}
										value={store.logoReactivitySpeed}
										{...LOGO_RANGES.reactivitySpeed}
										onChange={store.setLogoReactivitySpeed}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.label_logo_min_scale}
										value={store.logoMinScale}
										{...LOGO_RANGES.minScale}
										onChange={store.setLogoMinScale}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.label_logo_max_scale}
										value={store.logoMaxScale}
										{...LOGO_RANGES.maxScale}
										onChange={store.setLogoMaxScale}
										variant={primaryVariant}
										formatValue={formatDecimal}
									/>
								</div>
								<CollapsibleSection
									title={t.label_envelope_params_expand}
									defaultOpen={!isSimple}
									dense
								>
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
										<Slider
											label={t.label_logo_punch}
											value={store.logoPunch}
											{...LOGO_RANGES.punch}
											onChange={store.setLogoPunch}
											variant="compact"
											formatValue={formatDecimal}
										/>
										<Slider
											label={t.label_logo_attack}
											value={store.logoAttack}
											{...LOGO_RANGES.attack}
											onChange={store.setLogoAttack}
											variant="compact"
											formatValue={formatDecimal}
										/>
										<Slider
											label={t.label_logo_release}
											value={store.logoRelease}
											{...LOGO_RANGES.release}
											onChange={store.setLogoRelease}
											variant="compact"
											formatValue={formatDecimal}
										/>
										<Slider
											label={t.label_logo_peak_window}
											value={store.logoPeakWindow}
											{...LOGO_RANGES.peakWindow}
											onChange={store.setLogoPeakWindow}
											variant="compact"
											formatValue={formatDecimal}
										/>
										<Slider
											label={t.label_logo_peak_floor}
											value={store.logoPeakFloor}
											{...LOGO_RANGES.peakFloor}
											onChange={store.setLogoPeakFloor}
											variant="compact"
											formatValue={formatDecimal}
										/>
									</div>
								</CollapsibleSection>
							</div>
						</SectionCard>
					) : null}

					{view === 'finish' ? (
						<>
							<SectionCard
								title={t.section_logo_glow_shadow}
								density="compact"
							>
								<div className="flex flex-col gap-3">
									<SwitchRow
										label="Glow ring"
										checked={store.logoGlowEnabled}
										onChange={store.setLogoGlowEnabled}
									/>
									{store.logoGlowEnabled ? (
										<>
											<ColorSourceField
												label={t.label_glow_color}
												source={
													store.logoGlowColorSource
												}
												onSourceChange={
													store.setLogoGlowColorSource
												}
												value={store.logoGlowColor}
												onChange={
													store.setLogoGlowColor
												}
												labels={colorSourceLabels}
												hintTheme={
													t.hint_theme_palette_auto
												}
												hintImage={
													t.hint_background_palette_auto
												}
											/>
											<Slider
												label={t.label_glow_blur}
												value={store.logoGlowBlur}
												{...LOGO_RANGES.glowBlur}
												onChange={store.setLogoGlowBlur}
												variant="compact"
												formatValue={formatInteger}
											/>
											<Slider
												label={t.label_glow_reach}
												value={store.logoGlowReach}
												{...LOGO_RANGES.glowReach}
												onChange={
													store.setLogoGlowReach
												}
												variant="compact"
												formatValue={formatDecimal}
											/>
										</>
									) : null}
									<SwitchRow
										label={t.label_shadow}
										checked={store.logoShadowEnabled}
										onChange={store.setLogoShadowEnabled}
									/>
									{store.logoShadowEnabled ? (
										<>
											<ColorSourceField
												label={t.label_shadow_color}
												source={
													store.logoShadowColorSource
												}
												onSourceChange={
													store.setLogoShadowColorSource
												}
												value={store.logoShadowColor}
												onChange={
													store.setLogoShadowColor
												}
												labels={colorSourceLabels}
												hintTheme={
													t.hint_theme_palette_auto
												}
												hintImage={
													t.hint_background_palette_auto
												}
											/>
											<Slider
												label={t.label_shadow_blur}
												value={store.logoShadowBlur}
												{...LOGO_RANGES.shadowBlur}
												onChange={
													store.setLogoShadowBlur
												}
												variant="compact"
												formatValue={formatInteger}
											/>
										</>
									) : null}
								</div>
							</SectionCard>

							<SectionCard
								title={t.label_backdrop}
								density="compact"
							>
								<div className="flex flex-col gap-3">
									<SwitchRow
										label={t.label_backdrop}
										checked={store.logoBackdropEnabled}
										onChange={store.setLogoBackdropEnabled}
									/>
									{store.logoBackdropEnabled ? (
										<>
											<ColorSourceField
												label={t.label_backdrop_color}
												source={
													store.logoBackdropColorSource
												}
												onSourceChange={
													store.setLogoBackdropColorSource
												}
												value={store.logoBackdropColor}
												onChange={
													store.setLogoBackdropColor
												}
												labels={colorSourceLabels}
												hintTheme={
													t.hint_theme_palette_auto
												}
												hintImage={
													t.hint_background_palette_auto
												}
											/>
											<Slider
												label={t.label_backdrop_opacity}
												value={
													store.logoBackdropOpacity
												}
												{...LOGO_RANGES.backdropOpacity}
												onChange={
													store.setLogoBackdropOpacity
												}
												variant="compact"
												formatValue={formatDecimal}
											/>
											<Slider
												label={t.label_backdrop_padding}
												value={
													store.logoBackdropPadding
												}
												{...LOGO_RANGES.backdropPadding}
												onChange={
													store.setLogoBackdropPadding
												}
												variant="compact"
												formatValue={formatInteger}
											/>
										</>
									) : null}
								</div>
							</SectionCard>
							<FlashEdgeSection target="logo" />
						</>
					) : null}
				</>
			</FeatureGate>
		</EditorTabLayout>
	);
}
