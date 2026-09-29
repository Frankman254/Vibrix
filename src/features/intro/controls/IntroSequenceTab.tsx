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
import { useShallow } from 'zustand/react/shallow';
import {
	Caption,
	SectionCard,
	SegmentedControl,
	Select,
	Tabs,
	TextInput
} from '@/ui';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import ToggleControl from '@/editor/ToggleControl';
import CollapsibleSection from '@/editor/CollapsibleSection';
import AdaptiveColorInput from '@/editor/AdaptiveColorInput';
import ConnectedColorInput from '@/editor/ConnectedColorInput';
import { MotionSlider as Slider } from '@/editor/MotionSharedControls';
import { formatDecimal } from '@/editor/motionTabUtils';
import { resolveSlideshowPool } from '@/features/background';
import IntroImagePicker from './IntroImagePicker';
import {
	TRACK_TITLE_FONTS,
	TRACK_TITLE_FONT_LABELS
} from '@/lib/canvasText/trackTitleOptions';
import type {
	IntroDivisionPattern,
	IntroFillMode,
	IntroMontageArrival,
	IntroMontageMove,
	IntroTitleFrameAnimation,
	IntroTitleFrameShape,
	IntroTitleFrameStyle,
	IntroImageSourceMode,
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
	// The hand-picked grid lists the WHOLE collection: a picked image must not
	// disappear because the active setlist filters it out.
	const backgroundImages = useWallpaperStore(s => s.backgroundImages);
	const imagePreviewQuality = useWallpaperStore(
		s => s.editorImagePreviewQuality
	);
	// Only slots that actually hold a saved figure: an empty slot would draw
	// nothing and look like a bug.
	const slotOptions = useMemo(
		() =>
			spectrumProfileSlots
				.map((slot, index) => ({ slot, index }))
				.filter(entry => entry.slot.values !== null)
				.map(entry => ({
					value: String(entry.index),
					label: entry.slot.name || `#${entry.index + 1}`
				})),
		[spectrumProfileSlots]
	);
	const factory = createDefaultIntroSequence(kind);
	const patch = (next: Parameters<typeof setIntroSequence>[1]) =>
		setIntroSequence(kind, next);
	// What the montage will actually show: asking for more images than the
	// setlist holds is not an error, it just uses what there is. Hand-picked
	// mode counts the picks that still exist in the collection.
	const available = new Set(backgroundImages.map(image => image.assetId));
	const used =
		settings.imageSourceMode === 'manual'
			? settings.imageAssetIds.filter(id => available.has(id)).length
			: pickIntroImages(
					Array.from({ length: poolSize }, (_, i) => ({
						assetId: String(i)
					})),
					settings
				).length;

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
					<CollapsibleSection
						title={t.intro_section_timing}
						sectionId={`intro-${kind}-timing`}
						defaultOpen
						dense
					>
						<div className="flex flex-col gap-2">
							<Slider
								label={t.intro_duration}
								value={settings.durationSec}
								min={INTRO_DURATION_RANGE.min}
								max={INTRO_DURATION_RANGE.max}
								step={0.5}
								onChange={durationSec => patch({ durationSec })}
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
								onChange={buildSec => patch({ buildSec })}
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
								onChange={releaseSec => patch({ releaseSec })}
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
					</CollapsibleSection>

					<CollapsibleSection
						title={t.intro_section_montage}
						sectionId={`intro-${kind}-montage`}
						defaultOpen
						dense
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
								onChange={montageMove => patch({ montageMove })}
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
									{ value: 'pan', label: t.intro_move_pan },
									{
										value: 'pulse',
										label: t.intro_move_pulse
									}
								]}
							/>
							{TILED_MONTAGES.includes(settings.montage) && (
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
							{TILED_MONTAGES.includes(settings.montage) && (
								<>
									<Select<IntroDivisionPattern>
										value={settings.divisionPattern}
										onChange={divisionPattern =>
											patch({ divisionPattern })
										}
										ariaLabel={t.intro_division_pattern}
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
											label={t.intro_division_angle}
											value={settings.divisionAngleDeg}
											min={INTRO_DIVISION_ANGLE_RANGE.min}
											max={INTRO_DIVISION_ANGLE_RANGE.max}
											step={1}
											onChange={divisionAngleDeg =>
												patch({ divisionAngleDeg })
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
							<SegmentedControl<IntroImageSourceMode>
								value={settings.imageSourceMode}
								onChange={imageSourceMode =>
									patch({ imageSourceMode })
								}
								options={[
									{
										value: 'setlist',
										label: t.intro_image_source_setlist
									},
									{
										value: 'manual',
										label: t.intro_image_source_manual
									}
								]}
							/>
							{settings.imageSourceMode === 'manual' ? (
								<>
									<IntroImagePicker
										images={backgroundImages}
										previewQuality={imagePreviewQuality}
										selected={settings.imageAssetIds}
										onChange={imageAssetIds =>
											patch({ imageAssetIds })
										}
									/>
									<Caption>{t.intro_picked_hint}</Caption>
								</>
							) : (
								<>
									<Slider
										label={t.intro_image_count}
										value={settings.imageCount}
										min={INTRO_IMAGE_COUNT_RANGE.min}
										max={INTRO_IMAGE_COUNT_RANGE.max}
										step={1}
										onChange={imageCount =>
											patch({ imageCount })
										}
										defaultValue={factory.imageCount}
										variant="compact"
									/>
									<SegmentedControl<IntroSequenceOrder>
										value={settings.order}
										onChange={order => patch({ order })}
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
								onChange={imageDim => patch({ imageDim })}
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
							{settings.backdropFillMode === 'gradient' ? (
								<ConnectedColorInput
									label={t.intro_backdrop_color_secondary}
									value={settings.backdropColorSecondary}
									onChange={backdropColorSecondary =>
										patch({ backdropColorSecondary })
									}
								/>
							) : null}
							<Caption>
								{poolSize === 0
									? t.intro_no_images
									: t.intro_uses_images
											.replace('{used}', String(used))
											.replace(
												'{pool}',
												String(poolSize)
											)}
							</Caption>
						</div>
					</CollapsibleSection>

					<CollapsibleSection
						title={t.intro_section_title}
						sectionId={`intro-${kind}-title`}
						defaultOpen
						dense
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
									patch({ titleText: event.target.value })
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
							/>
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
								onChange={titleReveal => patch({ titleReveal })}
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
										value={settings.titleFrameAnimation}
										onChange={titleFrameAnimation =>
											patch({ titleFrameAnimation })
										}
										ariaLabel={t.intro_frame_animation}
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
										value={settings.titleFrameThickness}
										min={INTRO_FRAME_THICKNESS_RANGE.min}
										max={INTRO_FRAME_THICKNESS_RANGE.max}
										step={0.05}
										onChange={titleFrameThickness =>
											patch({ titleFrameThickness })
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
										source={settings.titleFrameColorSource}
										onSourceChange={titleFrameColorSource =>
											patch({ titleFrameColorSource })
										}
										value={settings.titleFrameColor}
										onChange={titleFrameColor =>
											patch({ titleFrameColor })
										}
									/>
									<SegmentedControl<IntroFillMode>
										value={settings.titleFrameFillMode}
										onChange={titleFrameFillMode =>
											patch({ titleFrameFillMode })
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
								onChange={titleColor => patch({ titleColor })}
							/>
						</div>
					</CollapsibleSection>

					<CollapsibleSection
						title={t.intro_section_tagline}
						sectionId={`intro-${kind}-tagline`}
						dense
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
									patch({ taglineText: event.target.value })
								}
								placeholder={t.intro_tagline_placeholder}
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
							/>
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
					</CollapsibleSection>

					<CollapsibleSection
						title={t.intro_section_logo}
						sectionId={`intro-${kind}-logo`}
						dense
					>
						<div className="flex flex-col gap-2">
							<SegmentedControl<IntroLogoSource>
								value={settings.logoSource}
								onChange={logoSource => patch({ logoSource })}
								options={[
									{ value: 'none', label: t.intro_logo_none },
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
										defaultValue={factory.logoSizePct}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.intro_logo_stretch}
										value={settings.logoStretch}
										min={INTRO_LOGO_STRETCH_RANGE.min}
										max={INTRO_LOGO_STRETCH_RANGE.max}
										step={0.01}
										onChange={logoStretch =>
											patch({ logoStretch })
										}
										defaultValue={factory.logoStretch}
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
										min={INTRO_LOGO_OFFSET_RANGE.min}
										max={INTRO_LOGO_OFFSET_RANGE.max}
										step={0.005}
										onChange={logoOffsetX =>
											patch({ logoOffsetX })
										}
										defaultValue={factory.logoOffsetX}
										variant="compact"
										formatValue={formatSignedPct}
									/>
									<Slider
										label={t.intro_logo_offset_y}
										value={settings.logoOffsetY}
										min={INTRO_LOGO_OFFSET_RANGE.min}
										max={INTRO_LOGO_OFFSET_RANGE.max}
										step={0.005}
										onChange={logoOffsetY =>
											patch({ logoOffsetY })
										}
										defaultValue={factory.logoOffsetY}
										variant="compact"
										formatValue={formatSignedPct}
									/>
									<Slider
										label={t.intro_logo_opacity}
										value={settings.logoOpacity}
										min={INTRO_LOGO_OPACITY_RANGE.min}
										max={INTRO_LOGO_OPACITY_RANGE.max}
										step={0.01}
										onChange={logoOpacity =>
											patch({ logoOpacity })
										}
										defaultValue={factory.logoOpacity}
										variant="compact"
										formatValue={formatPct}
									/>
								</>
							)}
							<Caption>{t.intro_logo_hint}</Caption>
						</div>
					</CollapsibleSection>

					<CollapsibleSection
						title={t.intro_section_spectrum}
						sectionId={`intro-${kind}-spectrum`}
						dense
					>
						<div className="flex flex-col gap-2">
							<ToggleControl
								label={t.intro_spectrum_enabled}
								value={settings.spectrumSource === 'slot'}
								onChange={on =>
									patch({
										spectrumSource: on ? 'slot' : 'none'
									})
								}
								tooltip={t.intro_spectrum_enabled_tooltip}
							/>
							{settings.spectrumSource ===
							'none' ? null : slotOptions.length === 0 ? (
								<Caption>{t.intro_spectrum_no_slots}</Caption>
							) : (
								<>
									<Select<string>
										value={String(
											settings.spectrumSlotIndex
										)}
										onChange={value =>
											patch({
												spectrumSlotIndex: Number(value)
											})
										}
										ariaLabel={t.intro_spectrum_slot}
										full
										options={slotOptions}
									/>
									<ToggleControl
										label={t.intro_spectrum_centered}
										value={settings.spectrumCentered}
										onChange={spectrumCentered =>
											patch({ spectrumCentered })
										}
										tooltip={
											t.intro_spectrum_centered_tooltip
										}
									/>
									<Slider
										label={t.intro_spectrum_wave_speed}
										value={settings.spectrumWaveSpeed}
										min={INTRO_WAVE_SPEED_RANGE.min}
										max={INTRO_WAVE_SPEED_RANGE.max}
										step={0.05}
										onChange={spectrumWaveSpeed =>
											patch({ spectrumWaveSpeed })
										}
										defaultValue={factory.spectrumWaveSpeed}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<Slider
										label={t.intro_spectrum_wave_intensity}
										value={settings.spectrumWaveIntensity}
										min={INTRO_WAVE_INTENSITY_RANGE.min}
										max={INTRO_WAVE_INTENSITY_RANGE.max}
										step={0.05}
										onChange={spectrumWaveIntensity =>
											patch({ spectrumWaveIntensity })
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
					</CollapsibleSection>
				</>
			)}
		</div>
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
			<IntroWindowEditor kind={kind} />
		</div>
	);
}
