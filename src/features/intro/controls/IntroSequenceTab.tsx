/**
 * The intro / ending module.
 *
 * Its own tab, not a corner of the export settings: what is configured here is
 * a piece of the video with its own look — a montage of the setlist's images
 * with a title, a tagline, a mark and the window's own spectrum, each mounted
 * and taken apart again on the window's own clock.
 *
 * The two windows are configured separately and share every control, so
 * whatever is learned on the intro applies to the ending.
 */
import { useMemo, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
	Button,
	Caption,
	FieldLabel,
	SectionCard,
	SegmentedControl,
	Select,
	TabFade,
	Tabs,
	TextInput
} from '@/ui';
import { useTabViewState } from '@/hooks/useTabViewState';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import ToggleControl from '@/editor/ToggleControl';
import AdaptiveColorInput from '@/editor/AdaptiveColorInput';
import ConnectedColorInput from '@/editor/ConnectedColorInput';
import ProfileSlotsEditor from '@/editor/ProfileSlotsEditor';
import { MotionSlider as Slider } from '@/editor/MotionSharedControls';
import { formatDecimal } from '@/editor/motionTabUtils';
import { resolveSlideshowPool } from '@/features/background';
import { MAX_INTRO_SLOT_COUNT } from '@/store/featureProfiles';
import IntroImagePicker from './IntroImagePicker';
import { INTRO_PRESETS } from '../introPresets';
import { useIntroPreviewStore } from '../introPreviewStore';
import {
	TRACK_TITLE_FONTS,
	TRACK_TITLE_FONT_LABELS
} from '@/lib/canvasText/trackTitleOptions';
import type {
	ProfileSlot,
	SpectrumProfileSettings,
	IntroDivisionPattern,
	IntroFillMode,
	IntroMontageArrival,
	IntroMontageMove,
	IntroTitleFrameAnimation,
	IntroTitleFrameShape,
	IntroTitleFrameStyle,
	IntroImageSourceMode,
	IntroTextStyleSource,
	IntroLogoPlacement,
	IntroLogoSource,
	IntroMontageMode,
	IntroSequenceKind,
	IntroSequenceOrder,
	IntroTextReveal,
	TrackTitleFontStyle
} from '@/types/wallpaper';
import { INTRO_TITLE_FRAME_SHAPES } from '../introTitleFrame';
import {
	INTRO_ANGLED_PATTERNS,
	INTRO_DIVISION_ANGLE_RANGE,
	INTRO_DIVISION_PATTERNS
} from '../introDivisions';
import {
	INTRO_DURATION_RANGE,
	INTRO_IMAGE_SCALE_RANGE,
	INTRO_FRAME_THICKNESS_RANGE,
	INTRO_IMAGE_COUNT_RANGE,
	INTRO_LOGO_OFFSET_RANGE,
	INTRO_LOGO_OPACITY_RANGE,
	INTRO_LOGO_SIZE_RANGE,
	INTRO_LOGO_STRETCH_RANGE,
	INTRO_PHASE_SEC_RANGE,
	INTRO_TAGLINE_SIZE_RANGE,
	INTRO_WAVE_INTENSITY_RANGE,
	INTRO_WAVE_SPEED_RANGE,
	INTRO_TITLE_SIZE_RANGE,
	createDefaultIntroSequence,
	pickIntroImages,
	resolveIntroPhases
} from '../introPlan';

const FONT_OPTIONS = TRACK_TITLE_FONTS.map(value => ({
	value,
	label: TRACK_TITLE_FONT_LABELS[value]
}));

function formatPct(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function formatSignedPct(value: number): string {
	const pct = Math.round(value * 100);
	return `${pct > 0 ? '+' : ''}${pct}%`;
}

function formatDeg(value: number): string {
	return `${Math.round(value)}°`;
}

/**
 * The montages that CUT the screen up. The rest show one image at a time (or a
 * travelling strip), so a division pattern would have nothing to divide — the
 * controls are hidden instead of sitting there doing nothing.
 */
const TILED_MONTAGES: readonly IntroMontageMode[] = [
	'mosaic-grid',
	'mosaic-burst',
	'shutter-wipe'
];

/**
 * The filled slots of one spectrum bank, by stable id.
 *
 * Only slots that actually hold a saved figure: an empty slot would draw nothing
 * and look like a bug. The id — never the array position — is what gets stored,
 * so deleting another slot cannot silently retarget the window.
 *
 * The label carries the slot NUMBER even when the slot has a name, because
 * saved figures very often share one («veo que todos son iguales en mi
 * proyecto») and the name alone cannot tell them apart.
 */
function toSlotOptions(
	slots: ProfileSlot<SpectrumProfileSettings>[]
): { value: string; label: string }[] {
	return slots
		.map((slot, index) => ({ slot, index }))
		.filter(entry => entry.slot.values !== null)
		.map(entry => ({
			value: entry.slot.id,
			label: entry.slot.name
				? `${entry.index + 1} · ${entry.slot.name}`
				: `#${entry.index + 1}`
		}));
}

/**
 * One spectrum figure inside the window: its own switch and its own slot list.
 * Spectrum 1 and Spectrum 2 each get one of these, which is what lets a window
 * mount one, the other, or both at once.
 */
function IntroSpectrumBankControls({
	label,
	tooltip,
	enabled,
	onEnabledChange,
	slotId,
	onSlotChange,
	options,
	emptyLabel
}: {
	label: string;
	tooltip: string;
	enabled: boolean;
	onEnabledChange: (value: boolean) => void;
	slotId: string | null;
	onSlotChange: (value: string | null) => void;
	options: { value: string; label: string }[];
	emptyLabel: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<ToggleControl
				label={label}
				value={enabled}
				onChange={value => {
					onEnabledChange(value);
					// Switching a figure on with nothing chosen would leave a
					// picker showing a slot it is not actually using, and draw
					// nothing. Pick the first saved slot instead.
					const first = options[0];
					if (value && !slotId && first) onSlotChange(first.value);
				}}
				tooltip={tooltip}
			/>
			{!enabled ? null : options.length === 0 ? (
				<Caption>{emptyLabel}</Caption>
			) : (
				<Select<string>
					value={slotId ?? ''}
					onChange={value => onSlotChange(value || null)}
					ariaLabel={label}
					full
					options={options}
				/>
			)}
		</div>
	);
}

/**
 * The window's settings grew past what one column of accordions can hold, so it
 * is split the way the Spectrum tab is: one sub-tab per piece of the
 * composition, remembered per window in the workspace.
 *
 * Inside a sub-tab the sections are PLAIN cards, never accordions: the tab is
 * already the thing that chooses what is on screen, and a collapsible on top of
 * it let a tab hide its own only content — «al entrar a esa pestaña se puede
 * esconder todo el menu no tiene sentido». The one exception is the hand-picked
 * image grid, which is long enough to deserve its own fold.
 */
type IntroWindowView = 'timing' | 'montage' | 'text' | 'logo' | 'spectrum';

function isIntroWindowView(value: unknown): value is IntroWindowView {
	return (
		value === 'timing' ||
		value === 'montage' ||
		value === 'text' ||
		value === 'logo' ||
		value === 'spectrum'
	);
}

function IntroWindowEditor({ kind }: { kind: IntroSequenceKind }) {
	const t = useT();
	const settings = useWallpaperStore(s =>
		kind === 'intro' ? s.introSequence : s.outroSequence
	);
	const setIntroSequence = useWallpaperStore(s => s.setIntroSequence);
	const poolSize = useWallpaperStore(
		useShallow(
			s =>
				resolveSlideshowPool(
					s.backgroundImages,
					s.setlists,
					s.activeSetlistId
				).length
		)
	);
	// The slot ARRAY is selected as-is (a stable reference) and mapped in a
	// memo. Mapping inside the selector — even with `useShallow` — rebuilds the
	// option objects on every call, so the snapshot never compares equal and the
	// store re-renders for ever: React #185, black screen.
	const spectrumProfileSlots = useWallpaperStore(s => s.spectrumProfileSlots);
	const spectrumSecondProfileSlots = useWallpaperStore(
		s => s.spectrumSecondProfileSlots
	);
	// The hand-picked grid lists the WHOLE collection: a picked image must not
	// disappear because the active setlist filters it out.
	const backgroundImages = useWallpaperStore(s => s.backgroundImages);
	const imagePreviewQuality = useWallpaperStore(
		s => s.editorImagePreviewQuality
	);
	// Only slots that actually hold a saved figure: an empty slot would draw
	// nothing and look like a bug.
	const primarySlotOptions = useMemo(
		() => toSlotOptions(spectrumProfileSlots),
		[spectrumProfileSlots]
	);
	const secondSlotOptions = useMemo(
		() => toSlotOptions(spectrumSecondProfileSlots),
		[spectrumSecondProfileSlots]
	);
	const factory = createDefaultIntroSequence(kind);
	const patch = (next: Parameters<typeof setIntroSequence>[1]) =>
		setIntroSequence(kind, next);
	// What the montage will actually show: asking for more images than the
	// setlist holds is not an error, it just uses what there is. Hand-picked
	// mode counts the picks that still exist in the collection.
	const available = new Set(backgroundImages.map(image => image.assetId));
	// `catalog` slices the whole collection, `setlist` the active curation: the
	// readout has to count the pool the window will actually read.
	const sourcePoolSize =
		settings.imageSourceMode === 'setlist'
			? poolSize
			: backgroundImages.length;
	const used =
		settings.imageSourceMode === 'manual'
			? settings.imageAssetIds.filter(id => available.has(id)).length
			: pickIntroImages(
					Array.from({ length: sourcePoolSize }, (_, i) => ({
						assetId: String(i)
					})),
					settings
				).length;

	// Ephemeral on purpose — see `introPreviewStore`. `previewing` is true only
	// for THIS window: asking for the other one replaces the preview, so both
	// buttons can never read as running at once.
	const preview = useIntroPreviewStore(s => s.preview);
	const startIntroPreview = useIntroPreviewStore(s => s.startIntroPreview);
	const pauseIntroPreview = useIntroPreviewStore(s => s.pauseIntroPreview);
	const resumeIntroPreview = useIntroPreviewStore(s => s.resumeIntroPreview);
	const stopIntroPreview = useIntroPreviewStore(s => s.stopIntroPreview);
	const previewing = preview?.kind === kind;
	const paused = previewing && preview?.pausedAtSec !== null;

	const [view, setView] = useTabViewState<IntroWindowView>(
		`intro-${kind}`,
		'timing',
		isIntroWindowView
	);
	const viewOptions: { value: IntroWindowView; label: string }[] = [
		{ value: 'timing', label: t.intro_view_timing },
		{ value: 'montage', label: t.intro_view_montage },
		{ value: 'text', label: t.intro_view_text },
		{ value: 'logo', label: t.intro_view_logo },
		{ value: 'spectrum', label: t.intro_view_spectrum }
	];

	// Preset labels are looked up by key, which the literal-typed dictionary
	// cannot express: one cast, at the one place that needs it.
	const text = t as unknown as Record<string, string>;

	const phases = resolveIntroPhases(settings);
	const revealOptions: { value: IntroTextReveal; label: string }[] = [
		{ value: 'typewriter', label: t.intro_reveal_typewriter },
		{ value: 'fade', label: t.intro_reveal_fade },
		{ value: 'rise', label: t.intro_reveal_rise },
		{ value: 'pop', label: t.intro_reveal_pop },
		{ value: 'wipe', label: t.intro_reveal_wipe }
	];

	return (
		<div className="flex flex-col gap-2">
			<SectionCard
				title={kind === 'intro' ? t.intro_title : t.intro_outro_title}
				subtitle={kind === 'intro' ? t.intro_hint : t.intro_outro_hint}
				density="compact"
			>
				<ToggleControl
					label={t.intro_enabled}
					value={settings.enabled}
					onChange={enabled => patch({ enabled })}
					tooltip={t.intro_enabled_tooltip}
				/>
			</SectionCard>

			{!settings.enabled ? null : (
				<>
					{/* The sub-tab row is a navigation bar, not a setting: wrapping
					    it in a titled card cost a header's worth of height on
					    every screen and said nothing. */}
					<SegmentedControl<IntroWindowView>
						value={view}
						onChange={setView}
						options={viewOptions}
						size="sm"
						density="compact"
						full
						ariaLabel={t.intro_aria_sections}
					/>

					{/* An ACTION, not a setting, so it sits bare beside the
					    sub-tab row instead of inside a titled card. Before this
					    the only way to look at a window was to drag the playhead
					    into it, so iterating on the composition cost a rewind
					    per change. */}
					<div className="flex flex-col gap-1">
						<div className="flex gap-1.5">
							<Button
								onClick={() => {
									if (!previewing)
										return startIntroPreview(kind);
									if (paused) return resumeIntroPreview();
									// The frozen second comes from the live
									// clock, so pausing keeps the frame that is
									// on screen rather than jumping anywhere.
									pauseIntroPreview(
										(performance.now() -
											(preview?.startedAtMs ?? 0)) /
											1000
									);
								}}
								size="sm"
								density="compact"
								variant={
									previewing && !paused
										? 'primary'
										: 'secondary'
								}
								icon={
									previewing && !paused ? (
										<Pause size={11} />
									) : (
										<Play size={11} />
									)
								}
								full
							>
								{!previewing
									? kind === 'intro'
										? t.intro_preview_intro
										: t.intro_preview_outro
									: paused
										? t.intro_preview_resume
										: t.intro_preview_pause}
							</Button>
							{previewing && (
								<Button
									onClick={stopIntroPreview}
									size="sm"
									density="compact"
									variant="secondary"
									icon={<Square size={11} />}
									title={t.intro_preview_stop}
									aria-label={t.intro_preview_stop}
								/>
							)}
						</div>
						<Caption>{t.intro_preview_hint}</Caption>
					</div>

					{/* Above the sub-tabs on purpose: a quick look is the shortcut
					    into the whole window, so it must not be buried inside
					    one of its sections. A preset is a patch — the text, the
					    picked images and the spectrum slots survive it. */}
					<SectionCard
						title={t.intro_presets_title}
						density="compact"
					>
						<div className="flex flex-col gap-1.5">
							<div className="grid grid-cols-3 gap-1.5">
								{INTRO_PRESETS.map(preset => (
									<Button
										key={preset.id}
										onClick={() => patch(preset.patch)}
										size="sm"
										density="compact"
										variant="secondary"
										title={text[preset.hintKey]}
										full
									>
										{text[preset.labelKey]}
									</Button>
								))}
							</div>
							<Caption>{t.intro_presets_hint}</Caption>
						</div>
					</SectionCard>

					<TabFade tabKey={view}>
						{view === 'timing' ? (
							<SectionCard
								title={t.intro_section_timing}
								density="compact"
							>
								<div className="flex flex-col gap-2">
									<Slider
										label={t.intro_duration}
										value={settings.durationSec}
										min={INTRO_DURATION_RANGE.min}
										max={INTRO_DURATION_RANGE.max}
										step={0.5}
										onChange={durationSec =>
											patch({ durationSec })
										}
										defaultValue={factory.durationSec}
										variant="macro"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.intro_build_sec}
										value={settings.buildSec}
										min={INTRO_PHASE_SEC_RANGE.min}
										max={INTRO_PHASE_SEC_RANGE.max}
										step={0.1}
										onChange={buildSec =>
											patch({ buildSec })
										}
										defaultValue={factory.buildSec}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.intro_release_sec}
										value={settings.releaseSec}
										min={INTRO_PHASE_SEC_RANGE.min}
										max={INTRO_PHASE_SEC_RANGE.max}
										step={0.1}
										onChange={releaseSec =>
											patch({ releaseSec })
										}
										defaultValue={factory.releaseSec}
										variant="compact"
										formatValue={formatDecimal}
									/>
									{/* The hold is not a control: it is what the other
							    three numbers leave over, and showing it is the
							    only way to see that at a glance. */}
									<Caption>
										{t.intro_hold_readout.replace(
											'{sec}',
											formatDecimal(phases.holdSec)
										)}
									</Caption>
									<Caption>{t.intro_timing_hint}</Caption>
								</div>
							</SectionCard>
						) : null}

						{view === 'montage' ? (
							<SectionCard
								title={t.intro_section_montage}
								density="compact"
							>
								<div className="flex flex-col gap-2">
									<Select<IntroMontageMode>
										value={settings.montage}
										onChange={montage => patch({ montage })}
										ariaLabel={t.intro_montage}
										full
										options={[
											{
												value: 'mosaic-grid',
												label: t.intro_montage_mosaic_grid,
												hint: t.intro_montage_mosaic_grid_hint
											},
											{
												value: 'mosaic-burst',
												label: t.intro_montage_mosaic_burst,
												hint: t.intro_montage_mosaic_burst_hint
											},
											{
												value: 'fade-stack',
												label: t.intro_montage_fade_stack,
												hint: t.intro_montage_fade_stack_hint
											},
											{
												value: 'film-strip',
												label: t.intro_montage_film_strip,
												hint: t.intro_montage_film_strip_hint
											},
											{
												value: 'shutter-wipe',
												label: t.intro_montage_shutter,
												hint: t.intro_montage_shutter_hint
											},
											{
												value: 'ken-burns',
												label: t.intro_montage_ken_burns,
												hint: t.intro_montage_ken_burns_hint
											},
											{
												value: 'glitch-cut',
												label: t.intro_montage_glitch,
												hint: t.intro_montage_glitch_hint
											}
										]}
									/>
									<Select<IntroMontageMove>
										value={settings.montageMove}
										onChange={montageMove =>
											patch({ montageMove })
										}
										ariaLabel={t.intro_montage_move}
										full
										options={[
											{
												value: 'auto',
												label: t.intro_move_auto
											},
											{
												value: 'still',
												label: t.intro_move_still
											},
											{
												value: 'zoom-in',
												label: t.intro_move_zoom_in
											},
											{
												value: 'zoom-out',
												label: t.intro_move_zoom_out
											},
											{
												value: 'pan',
												label: t.intro_move_pan
											},
											{
												value: 'pan-vertical',
												label: t.intro_move_pan_vertical
											},
											{
												value: 'drift',
												label: t.intro_move_drift
											},
											{
												value: 'zoom-pan',
												label: t.intro_move_zoom_pan
											},
											{
												value: 'breathe',
												label: t.intro_move_breathe
											},
											{
												value: 'pulse',
												label: t.intro_move_pulse
											}
										]}
									/>
									<Slider
										label={t.intro_image_scale}
										value={settings.montageImageScale}
										min={INTRO_IMAGE_SCALE_RANGE.min}
										max={INTRO_IMAGE_SCALE_RANGE.max}
										step={0.05}
										onChange={montageImageScale =>
											patch({ montageImageScale })
										}
										defaultValue={factory.montageImageScale}
										variant="compact"
										formatValue={formatDecimal}
										hint={t.intro_image_scale_hint}
									/>
									{TILED_MONTAGES.includes(
										settings.montage
									) && (
										<Select<IntroMontageArrival>
											value={settings.montageArrival}
											onChange={montageArrival =>
												patch({ montageArrival })
											}
											ariaLabel={t.intro_montage_arrival}
											full
											options={[
												{
													value: 'auto',
													label: t.intro_arrival_auto
												},
												{
													value: 'together',
													label: t.intro_arrival_together
												},
												{
													value: 'reading',
													label: t.intro_arrival_reading
												},
												{
													value: 'centre-out',
													label: t.intro_arrival_centre_out
												},
												{
													value: 'edges-in',
													label: t.intro_arrival_edges_in
												},
												{
													value: 'random',
													label: t.intro_arrival_random
												}
											]}
										/>
									)}
									{TILED_MONTAGES.includes(
										settings.montage
									) && (
										<>
											<Select<IntroDivisionPattern>
												value={settings.divisionPattern}
												onChange={divisionPattern =>
													patch({ divisionPattern })
												}
												ariaLabel={
													t.intro_division_pattern
												}
												full
												options={INTRO_DIVISION_PATTERNS.map(
													value => ({
														value,
														label: t[
															`intro_division_${value}`
														]
													})
												)}
											/>
											{INTRO_ANGLED_PATTERNS.includes(
												settings.divisionPattern
											) && (
												<Slider
													label={
														t.intro_division_angle
													}
													value={
														settings.divisionAngleDeg
													}
													min={
														INTRO_DIVISION_ANGLE_RANGE.min
													}
													max={
														INTRO_DIVISION_ANGLE_RANGE.max
													}
													step={1}
													onChange={divisionAngleDeg =>
														patch({
															divisionAngleDeg
														})
													}
													defaultValue={
														factory.divisionAngleDeg
													}
													variant="compact"
													formatValue={formatDeg}
												/>
											)}
										</>
									)}
									<div className="flex flex-col gap-1">
										<FieldLabel>
											{t.intro_image_source}
										</FieldLabel>
										<SegmentedControl<IntroImageSourceMode>
											value={settings.imageSourceMode}
											onChange={imageSourceMode =>
												patch({ imageSourceMode })
											}
											full
											options={[
												{
													value: 'setlist',
													label: t.intro_image_source_setlist
												},
												{
													value: 'catalog',
													label: t.intro_image_source_catalog
												},
												{
													value: 'manual',
													label: t.intro_image_source_manual
												}
											]}
										/>
									</div>
									{settings.imageSourceMode === 'manual' ? (
										<>
											<IntroImagePicker
												sectionId={`intro-${kind}-picker`}
												images={backgroundImages}
												previewQuality={
													imagePreviewQuality
												}
												selected={
													settings.imageAssetIds
												}
												onChange={imageAssetIds =>
													patch({ imageAssetIds })
												}
											/>
											<Caption>
												{t.intro_picked_hint}
											</Caption>
										</>
									) : (
										<>
											<Slider
												label={t.intro_image_count}
												value={settings.imageCount}
												min={
													INTRO_IMAGE_COUNT_RANGE.min
												}
												max={
													INTRO_IMAGE_COUNT_RANGE.max
												}
												step={1}
												onChange={imageCount =>
													patch({ imageCount })
												}
												defaultValue={
													factory.imageCount
												}
												variant="compact"
											/>
											<SegmentedControl<IntroSequenceOrder>
												value={settings.order}
												onChange={order =>
													patch({ order })
												}
												options={[
													{
														value: 'setlist',
														label: t.intro_order_first
													},
													{
														value: 'setlist-reverse',
														label: t.intro_order_last
													}
												]}
											/>
										</>
									)}
									<Slider
										label={t.intro_image_dim}
										value={settings.imageDim}
										min={0}
										max={1}
										step={0.01}
										onChange={imageDim =>
											patch({ imageDim })
										}
										defaultValue={factory.imageDim}
										variant="compact"
										formatValue={formatPct}
									/>
									<AdaptiveColorInput
										label={t.intro_backdrop_color}
										source={settings.backdropColorSource}
										onSourceChange={backdropColorSource =>
											patch({ backdropColorSource })
										}
										value={settings.backdropColor}
										onChange={backdropColor =>
											patch({ backdropColor })
										}
									/>
									<SegmentedControl<IntroFillMode>
										value={settings.backdropFillMode}
										onChange={backdropFillMode =>
											patch({ backdropFillMode })
										}
										options={[
											{
												value: 'solid',
												label: t.intro_fill_solid
											},
											{
												value: 'gradient',
												label: t.intro_fill_gradient
											},
											{
												value: 'rainbow',
												label: t.intro_fill_rainbow
											}
										]}
									/>
									{settings.backdropFillMode ===
									'gradient' ? (
										<ConnectedColorInput
											label={
												t.intro_backdrop_color_secondary
											}
											value={
												settings.backdropColorSecondary
											}
											onChange={backdropColorSecondary =>
												patch({
													backdropColorSecondary
												})
											}
										/>
									) : null}
									<Caption>
										{sourcePoolSize === 0
											? t.intro_no_images
											: t.intro_uses_images
													.replace(
														'{used}',
														String(used)
													)
													.replace(
														'{pool}',
														String(sourcePoolSize)
													)}
									</Caption>
								</div>
							</SectionCard>
						) : null}

						{view === 'text' ? (
							<SectionCard
								title={t.intro_section_title}
								density="compact"
							>
								<div className="flex flex-col gap-2">
									<ToggleControl
										label={t.intro_title_enabled}
										value={settings.titleEnabled}
										onChange={titleEnabled =>
											patch({ titleEnabled })
										}
									/>
									<TextInput
										value={settings.titleText}
										onChange={event =>
											patch({
												titleText: event.target.value
											})
										}
										placeholder={t.intro_title_placeholder}
										aria-label={t.intro_title_text}
										size="sm"
										full
									/>
									<Select<TrackTitleFontStyle>
										value={settings.titleFontStyle}
										onChange={titleFontStyle =>
											patch({ titleFontStyle })
										}
										ariaLabel={t.intro_font}
										options={FONT_OPTIONS}
										full
										disabled={
											settings.titleTextStyleSource ===
											'track-info'
										}
									/>
									<SegmentedControl<IntroTextStyleSource>
										value={settings.titleTextStyleSource}
										onChange={titleTextStyleSource =>
											patch({ titleTextStyleSource })
										}
										options={[
											{
												value: 'own',
												label: t.intro_text_style_own
											},
											{
												value: 'track-info',
												label: t.intro_text_style_track_info
											}
										]}
									/>
									<Caption>{t.intro_text_style_hint}</Caption>
									<Slider
										label={t.intro_title_size}
										value={settings.titleSizePct}
										min={INTRO_TITLE_SIZE_RANGE.min}
										max={INTRO_TITLE_SIZE_RANGE.max}
										step={0.5}
										onChange={titleSizePct =>
											patch({ titleSizePct })
										}
										defaultValue={factory.titleSizePct}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Select<IntroTextReveal>
										value={settings.titleReveal}
										onChange={titleReveal =>
											patch({ titleReveal })
										}
										ariaLabel={t.intro_reveal}
										options={revealOptions}
										full
									/>
									<ToggleControl
										label={t.intro_title_frame}
										value={settings.titleFrameEnabled}
										onChange={titleFrameEnabled =>
											patch({ titleFrameEnabled })
										}
										tooltip={t.intro_title_frame_tooltip}
									/>
									{settings.titleFrameEnabled ? (
										<>
											<Select<IntroTitleFrameShape>
												value={settings.titleFrameShape}
												onChange={titleFrameShape =>
													patch({ titleFrameShape })
												}
												ariaLabel={t.intro_frame_shape}
												full
												options={INTRO_TITLE_FRAME_SHAPES.map(
													value => ({
														value,
														label: t[
															`intro_frame_shape_${value}`
														]
													})
												)}
											/>
											<SegmentedControl<IntroTitleFrameStyle>
												value={settings.titleFrameStyle}
												onChange={titleFrameStyle =>
													patch({ titleFrameStyle })
												}
												options={[
													{
														value: 'outline',
														label: t.intro_frame_style_outline
													},
													{
														value: 'filled',
														label: t.intro_frame_style_filled
													},
													{
														value: 'both',
														label: t.intro_frame_style_both
													}
												]}
											/>
											<Select<IntroTitleFrameAnimation>
												value={
													settings.titleFrameAnimation
												}
												onChange={titleFrameAnimation =>
													patch({
														titleFrameAnimation
													})
												}
												ariaLabel={
													t.intro_frame_animation
												}
												full
												options={[
													{
														value: 'draw',
														label: t.intro_frame_anim_draw
													},
													{
														value: 'expand',
														label: t.intro_frame_anim_expand
													},
													{
														value: 'grow',
														label: t.intro_frame_anim_grow
													},
													{
														value: 'fade',
														label: t.intro_frame_anim_fade
													},
													{
														value: 'sweep',
														label: t.intro_frame_anim_sweep
													}
												]}
											/>
											<Slider
												label={t.intro_frame_thickness}
												value={
													settings.titleFrameThickness
												}
												min={
													INTRO_FRAME_THICKNESS_RANGE.min
												}
												max={
													INTRO_FRAME_THICKNESS_RANGE.max
												}
												step={0.05}
												onChange={titleFrameThickness =>
													patch({
														titleFrameThickness
													})
												}
												defaultValue={
													factory.titleFrameThickness
												}
												variant="compact"
												formatValue={value =>
													`${formatDecimal(value)}×`
												}
											/>
											<AdaptiveColorInput
												label={t.intro_frame_color}
												source={
													settings.titleFrameColorSource
												}
												onSourceChange={titleFrameColorSource =>
													patch({
														titleFrameColorSource
													})
												}
												value={settings.titleFrameColor}
												onChange={titleFrameColor =>
													patch({ titleFrameColor })
												}
											/>
											<SegmentedControl<IntroFillMode>
												value={
													settings.titleFrameFillMode
												}
												onChange={titleFrameFillMode =>
													patch({
														titleFrameFillMode
													})
												}
												options={[
													{
														value: 'solid',
														label: t.intro_fill_solid
													},
													{
														value: 'gradient',
														label: t.intro_fill_gradient
													},
													{
														value: 'rainbow',
														label: t.intro_fill_rainbow
													}
												]}
											/>
											{settings.titleFrameFillMode ===
											'gradient' ? (
												<ConnectedColorInput
													label={
														t.intro_frame_color_secondary
													}
													value={
														settings.titleFrameColorSecondary
													}
													onChange={titleFrameColorSecondary =>
														patch({
															titleFrameColorSecondary
														})
													}
												/>
											) : null}
										</>
									) : null}
									<AdaptiveColorInput
										label={t.intro_title_color}
										source={settings.titleColorSource}
										onSourceChange={titleColorSource =>
											patch({ titleColorSource })
										}
										value={settings.titleColor}
										onChange={titleColor =>
											patch({ titleColor })
										}
									/>
								</div>
							</SectionCard>
						) : null}

						{view === 'text' ? (
							<SectionCard
								title={t.intro_section_tagline}
								density="compact"
							>
								<div className="flex flex-col gap-2">
									<ToggleControl
										label={t.intro_tagline_enabled}
										value={settings.taglineEnabled}
										onChange={taglineEnabled =>
											patch({ taglineEnabled })
										}
									/>
									<TextInput
										value={settings.taglineText}
										onChange={event =>
											patch({
												taglineText: event.target.value
											})
										}
										placeholder={
											t.intro_tagline_placeholder
										}
										aria-label={t.intro_tagline_text}
										size="sm"
										full
									/>
									<Select<TrackTitleFontStyle>
										value={settings.taglineFontStyle}
										onChange={taglineFontStyle =>
											patch({ taglineFontStyle })
										}
										ariaLabel={t.intro_font}
										options={FONT_OPTIONS}
										full
										disabled={
											settings.taglineTextStyleSource ===
											'track-info'
										}
									/>
									<SegmentedControl<IntroTextStyleSource>
										value={settings.taglineTextStyleSource}
										onChange={taglineTextStyleSource =>
											patch({ taglineTextStyleSource })
										}
										options={[
											{
												value: 'own',
												label: t.intro_text_style_own
											},
											{
												value: 'track-info',
												label: t.intro_text_style_track_info
											}
										]}
									/>
									<Caption>{t.intro_text_style_hint}</Caption>
									<Slider
										label={t.intro_tagline_size}
										value={settings.taglineSizePct}
										min={INTRO_TAGLINE_SIZE_RANGE.min}
										max={INTRO_TAGLINE_SIZE_RANGE.max}
										step={0.25}
										onChange={taglineSizePct =>
											patch({ taglineSizePct })
										}
										defaultValue={factory.taglineSizePct}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Select<IntroTextReveal>
										value={settings.taglineReveal}
										onChange={taglineReveal =>
											patch({ taglineReveal })
										}
										ariaLabel={t.intro_reveal}
										options={revealOptions}
										full
									/>
									<AdaptiveColorInput
										label={t.intro_tagline_color}
										source={settings.taglineColorSource}
										onSourceChange={taglineColorSource =>
											patch({ taglineColorSource })
										}
										value={settings.taglineColor}
										onChange={taglineColor =>
											patch({ taglineColor })
										}
									/>
									<Caption>{t.intro_tagline_hint}</Caption>
								</div>
							</SectionCard>
						) : null}

						{view === 'logo' ? (
							<SectionCard
								title={t.intro_section_logo}
								density="compact"
							>
								<div className="flex flex-col gap-2">
									<SegmentedControl<IntroLogoSource>
										value={settings.logoSource}
										onChange={logoSource =>
											patch({ logoSource })
										}
										options={[
											{
												value: 'none',
												label: t.intro_logo_none
											},
											{
												value: 'vibrix',
												label: t.intro_logo_vibrix
											},
											{
												value: 'project',
												label: t.intro_logo_project
											}
										]}
									/>
									{settings.logoSource === 'none' ? null : (
										<>
											<Slider
												label={t.intro_logo_size}
												value={settings.logoSizePct}
												min={INTRO_LOGO_SIZE_RANGE.min}
												max={INTRO_LOGO_SIZE_RANGE.max}
												step={0.5}
												onChange={logoSizePct =>
													patch({ logoSizePct })
												}
												defaultValue={
													factory.logoSizePct
												}
												variant="compact"
												formatValue={formatDecimal}
											/>
											<Slider
												label={t.intro_logo_stretch}
												value={settings.logoStretch}
												min={
													INTRO_LOGO_STRETCH_RANGE.min
												}
												max={
													INTRO_LOGO_STRETCH_RANGE.max
												}
												step={0.01}
												onChange={logoStretch =>
													patch({ logoStretch })
												}
												defaultValue={
													factory.logoStretch
												}
												variant="compact"
												formatValue={formatPct}
											/>
											<SegmentedControl<IntroLogoPlacement>
												value={settings.logoPlacement}
												onChange={logoPlacement =>
													patch({ logoPlacement })
												}
												options={[
													{
														value: 'stack',
														label: t.intro_logo_placement_stack
													},
													{
														value: 'free',
														label: t.intro_logo_placement_free
													}
												]}
											/>
											<Slider
												label={t.intro_logo_offset_x}
												value={settings.logoOffsetX}
												min={
													INTRO_LOGO_OFFSET_RANGE.min
												}
												max={
													INTRO_LOGO_OFFSET_RANGE.max
												}
												step={0.005}
												onChange={logoOffsetX =>
													patch({ logoOffsetX })
												}
												defaultValue={
													factory.logoOffsetX
												}
												variant="compact"
												formatValue={formatSignedPct}
											/>
											<Slider
												label={t.intro_logo_offset_y}
												value={settings.logoOffsetY}
												min={
													INTRO_LOGO_OFFSET_RANGE.min
												}
												max={
													INTRO_LOGO_OFFSET_RANGE.max
												}
												step={0.005}
												onChange={logoOffsetY =>
													patch({ logoOffsetY })
												}
												defaultValue={
													factory.logoOffsetY
												}
												variant="compact"
												formatValue={formatSignedPct}
											/>
											<Slider
												label={t.intro_logo_opacity}
												value={settings.logoOpacity}
												min={
													INTRO_LOGO_OPACITY_RANGE.min
												}
												max={
													INTRO_LOGO_OPACITY_RANGE.max
												}
												step={0.01}
												onChange={logoOpacity =>
													patch({ logoOpacity })
												}
												defaultValue={
													factory.logoOpacity
												}
												variant="compact"
												formatValue={formatPct}
											/>
										</>
									)}
									<Caption>{t.intro_logo_hint}</Caption>
								</div>
							</SectionCard>
						) : null}

						{view === 'spectrum' ? (
							<SectionCard
								title={t.intro_section_spectrum}
								density="compact"
							>
								<div className="flex flex-col gap-2">
									<IntroSpectrumBankControls
										label={t.intro_spectrum_primary}
										tooltip={
											t.intro_spectrum_primary_tooltip
										}
										enabled={
											settings.spectrumPrimaryEnabled
										}
										onEnabledChange={spectrumPrimaryEnabled =>
											patch({ spectrumPrimaryEnabled })
										}
										slotId={settings.spectrumPrimarySlotId}
										onSlotChange={spectrumPrimarySlotId =>
											patch({ spectrumPrimarySlotId })
										}
										options={primarySlotOptions}
										emptyLabel={t.intro_spectrum_no_slots}
									/>
									<IntroSpectrumBankControls
										label={t.intro_spectrum_second}
										tooltip={
											t.intro_spectrum_second_tooltip
										}
										enabled={settings.spectrumSecondEnabled}
										onEnabledChange={spectrumSecondEnabled =>
											patch({ spectrumSecondEnabled })
										}
										slotId={settings.spectrumSecondSlotId}
										onSlotChange={spectrumSecondSlotId =>
											patch({ spectrumSecondSlotId })
										}
										options={secondSlotOptions}
										emptyLabel={t.intro_spectrum_no_slots}
									/>
									{!settings.spectrumPrimaryEnabled &&
									!settings.spectrumSecondEnabled ? null : (
										<>
											<ToggleControl
												label={
													t.intro_spectrum_centered
												}
												value={
													settings.spectrumCentered
												}
												onChange={spectrumCentered =>
													patch({ spectrumCentered })
												}
												tooltip={
													t.intro_spectrum_centered_tooltip
												}
											/>
											<Slider
												label={
													t.intro_spectrum_wave_speed
												}
												value={
													settings.spectrumWaveSpeed
												}
												min={INTRO_WAVE_SPEED_RANGE.min}
												max={INTRO_WAVE_SPEED_RANGE.max}
												step={0.05}
												onChange={spectrumWaveSpeed =>
													patch({ spectrumWaveSpeed })
												}
												defaultValue={
													factory.spectrumWaveSpeed
												}
												variant="compact"
												formatValue={formatDecimal}
											/>
											<Slider
												label={
													t.intro_spectrum_wave_intensity
												}
												value={
													settings.spectrumWaveIntensity
												}
												min={
													INTRO_WAVE_INTENSITY_RANGE.min
												}
												max={
													INTRO_WAVE_INTENSITY_RANGE.max
												}
												step={0.05}
												onChange={spectrumWaveIntensity =>
													patch({
														spectrumWaveIntensity
													})
												}
												defaultValue={
													factory.spectrumWaveIntensity
												}
												variant="compact"
												formatValue={formatDecimal}
											/>
										</>
									)}
									<Caption>{t.intro_spectrum_hint}</Caption>
								</div>
							</SectionCard>
						) : null}
					</TabFade>
				</>
			)}
		</div>
	);
}

/**
 * Saved intro animations.
 *
 * One slot holds BOTH windows, which is why this lives outside the per-window
 * editor: "my intro" is the opening and the ending together. The active setlist
 * can be bound to one, and then activating that setlist loads it — the answer
 * to "slots de animaciones para ese setlist o el global".
 */
function IntroSlotsSection() {
	const t = useT();
	const slots = useWallpaperStore(s => s.introProfileSlots);
	const setlists = useWallpaperStore(s => s.setlists);
	const activeSetlistId = useWallpaperStore(s => s.activeSetlistId);
	const actions = useWallpaperStore(
		useShallow(s => ({
			add: s.addIntroProfileSlot,
			remove: s.removeIntroProfileSlot,
			save: s.saveIntroProfileSlot,
			load: s.loadIntroProfileSlot,
			bind: s.bindSetlistIntroSlot
		}))
	);
	const activeSetlist = setlists.find(item => item.id === activeSetlistId);
	const slotOptions = useMemo(
		() => [
			{ value: '', label: t.intro_slots_setlist_none },
			...slots
				.filter(slot => slot.values)
				.map(slot => ({ value: slot.id, label: slot.name }))
		],
		[slots, t.intro_slots_setlist_none]
	);

	return (
		<SectionCard title={t.intro_slots_title} density="compact">
			<div className="flex flex-col gap-2">
				<ProfileSlotsEditor
					title=""
					hint={t.intro_slots_hint}
					slots={slots}
					activeIndex={null}
					onLoad={actions.load}
					onSave={actions.save}
					onAdd={actions.add}
					onDelete={actions.remove}
					loadLabel={t.label_load_profile}
					saveLabel={t.label_save_profile}
					slotLabel={t.label_profile_slot}
					emptyLabel={t.profile_slot_empty}
					activeLabel={t.profile_slot_active}
					maxSlots={MAX_INTRO_SLOT_COUNT}
				/>
				{activeSetlist ? (
					<>
						<Select<string>
							value={activeSetlist.introSlotId ?? ''}
							onChange={value =>
								actions.bind(
									activeSetlist.id,
									value === '' ? null : value
								)
							}
							ariaLabel={t.intro_slots_setlist_label}
							options={slotOptions}
							full
						/>
						<Caption>
							{t.intro_slots_setlist_hint.replace(
								'{name}',
								activeSetlist.name
							)}
						</Caption>
					</>
				) : (
					<Caption>{t.intro_slots_setlist_empty}</Caption>
				)}
			</div>
		</SectionCard>
	);
}

export default function IntroSequenceTab() {
	const t = useT();
	const [kind, setKind] = useState<IntroSequenceKind>('intro');

	return (
		<div className="flex flex-col gap-2">
			<Tabs<IntroSequenceKind>
				items={[
					{ id: 'intro', label: t.intro_tab_intro },
					{ id: 'outro', label: t.intro_tab_outro }
				]}
				value={kind}
				onChange={setKind}
				size="sm"
				ariaLabel={t.tab_intro}
			/>
			<IntroSlotsSection />
			<IntroWindowEditor kind={kind} />
		</div>
	);
}
