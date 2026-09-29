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
import { useState } from 'react';
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
import { MotionSlider as Slider } from '@/editor/MotionSharedControls';
import { formatDecimal } from '@/editor/motionTabUtils';
import { resolveSlideshowPool } from '@/features/background';
import {
	TRACK_TITLE_FONTS,
	TRACK_TITLE_FONT_LABELS
} from '@/lib/canvasText/trackTitleOptions';
import type {
	IntroLogoSource,
	IntroMontageMode,
	IntroSequenceKind,
	IntroSequenceOrder,
	IntroSpectrumShape,
	IntroTextReveal,
	TrackTitleFontStyle
} from '@/types/wallpaper';
import {
	INTRO_DURATION_RANGE,
	INTRO_IMAGE_COUNT_RANGE,
	INTRO_LOGO_SIZE_RANGE,
	INTRO_PHASE_RANGE,
	INTRO_SPECTRUM_SIZE_RANGE,
	INTRO_TAGLINE_SIZE_RANGE,
	INTRO_TITLE_SIZE_RANGE,
	createDefaultIntroSequence,
	pickIntroImages
} from '../introPlan';

const FONT_OPTIONS = TRACK_TITLE_FONTS.map(value => ({
	value,
	label: TRACK_TITLE_FONT_LABELS[value]
}));

function formatPct(value: number): string {
	return `${Math.round(value * 100)}%`;
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
	const factory = createDefaultIntroSequence(kind);
	const patch = (next: Parameters<typeof setIntroSequence>[1]) =>
		setIntroSequence(kind, next);
	// What the montage will actually show: asking for more images than the
	// setlist holds is not an error, it just uses what there is.
	const used = pickIntroImages(
		Array.from({ length: poolSize }, (_, i) => ({ assetId: String(i) })),
		settings
	).length;

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
								label={t.intro_build_pct}
								value={settings.buildPct}
								min={INTRO_PHASE_RANGE.min}
								max={INTRO_PHASE_RANGE.max}
								step={0.01}
								onChange={buildPct => patch({ buildPct })}
								defaultValue={factory.buildPct}
								variant="compact"
								formatValue={formatPct}
							/>
							<Slider
								label={t.intro_release_pct}
								value={settings.releasePct}
								min={INTRO_PHASE_RANGE.min}
								max={INTRO_PHASE_RANGE.max}
								step={0.01}
								onChange={releasePct => patch({ releasePct })}
								defaultValue={factory.releasePct}
								variant="compact"
								formatValue={formatPct}
							/>
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
							<Slider
								label={t.intro_image_count}
								value={settings.imageCount}
								min={INTRO_IMAGE_COUNT_RANGE.min}
								max={INTRO_IMAGE_COUNT_RANGE.max}
								step={1}
								onChange={imageCount => patch({ imageCount })}
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
								source="manual"
								onSourceChange={() => {}}
								value={settings.backdropColor}
								onChange={backdropColor =>
									patch({ backdropColor })
								}
							/>
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
							<Select<IntroSpectrumShape>
								value={settings.spectrumShape}
								onChange={spectrumShape =>
									patch({ spectrumShape })
								}
								ariaLabel={t.intro_spectrum_shape}
								full
								options={[
									{
										value: 'none',
										label: t.intro_spectrum_none
									},
									{
										value: 'bars',
										label: t.intro_spectrum_bars
									},
									{
										value: 'mirror',
										label: t.intro_spectrum_mirror
									},
									{
										value: 'ring',
										label: t.intro_spectrum_ring
									},
									{
										value: 'wave',
										label: t.intro_spectrum_wave
									}
								]}
							/>
							{settings.spectrumShape === 'none' ? null : (
								<>
									<Slider
										label={t.intro_spectrum_size}
										value={settings.spectrumSizePct}
										min={INTRO_SPECTRUM_SIZE_RANGE.min}
										max={INTRO_SPECTRUM_SIZE_RANGE.max}
										step={0.5}
										onChange={spectrumSizePct =>
											patch({ spectrumSizePct })
										}
										defaultValue={factory.spectrumSizePct}
										variant="compact"
										formatValue={formatDecimal}
									/>
									<AdaptiveColorInput
										label={t.intro_spectrum_color}
										source={settings.spectrumColorSource}
										onSourceChange={spectrumColorSource =>
											patch({ spectrumColorSource })
										}
										value={settings.spectrumColor}
										onChange={spectrumColor =>
											patch({ spectrumColor })
										}
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
