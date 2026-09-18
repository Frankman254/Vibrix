import { AdvancedOnly } from '@/editor/UIMode';
import { useDialog } from '@/editor/DialogProvider';
import { AUDIO_ROUTING_RANGES, SLIDESHOW_RANGES } from '@/config/ranges';
import type {
	AudioReactiveChannel,
	BackgroundImageItem,
	SlideshowTransitionType
} from '@/types/wallpaper';
import type { SliderRange } from '@/types/controls';
import BgFitModeSelector from './BgFitModeSelector';
import { TRANSITION_LABELS, TRANSITION_TYPES } from './constants';
import BgAudioChannelSelector from './BgAudioChannelSelector';
import { Button, Slider, UI_COLORS, FONT } from '@/ui';
import { CollapsibleSection } from '@/editor';
import BackgroundCardShell from './BackgroundCardShell';
import ImageSceneAssignment from './ImageSceneAssignment';
import { OverrideRow, SnapToNowButton } from './activeWallpaperAtoms';
import { formatDecimal } from './bgFormat';

type Props = {
	t: Record<string, string>;
	activeImage: BackgroundImageItem | null;
	activeImageIndex: number;
	imageCount: number;
	imageFitMode: Parameters<typeof BgFitModeSelector>[0]['value'];
	imageFramingManualEnabled: boolean;
	imageScale: number;
	imagePositionX: number;
	imagePositionY: number;
	imageFocusX: number | null;
	imageFocusY: number | null;
	imageRotation: number;
	imagePreviewUrl: string;
	imagePositionXRange: SliderRange;
	imagePositionYRange: SliderRange;
	imageOpacity: number;
	imageMirror: boolean;
	imageMirrorFill: boolean;
	imageMirrorFillInvert: boolean;
	imageMirrorFillCount: number;
	layoutResponsiveEnabled: boolean;
	layoutBackgroundReframeEnabled: boolean;
	layoutReferenceWidth: number;
	layoutReferenceHeight: number;
	imageMinScale: number;
	transitionType: SlideshowTransitionType;
	transitionDuration: number;
	transitionIntensity: number;
	transitionAudioDrive: number;
	transitionAudioChannel: AudioReactiveChannel;
	transitionAudioSmoothing: number;
	slideshowManualTimestampsEnabled: boolean;
	onCaptureLogoOverride: () => void;
	onClearLogoOverride: () => void;
	onCaptureSpectrumOverride: () => void;
	onClearSpectrumOverride: () => void;
	onCaptureParticlesOverride: () => void;
	onClearParticlesOverride: () => void;
	onCaptureRainOverride: () => void;
	onClearRainOverride: () => void;
	onCaptureLooksOverride: () => void;
	onClearLooksOverride: () => void;
	onChangePlaybackSwitchAt: (v: number | null) => void;
	calculatedSwitchAt?: number | null;
	onChangeFramingManualEnabled: (value: boolean) => void;
	onCoverFitCurrent: () => void;
	onCoverFitAll: () => void;
	onAutoFocusActiveImage: () => void;
	onUploadClick: () => void;
	onPreviousImage: () => void;
	onNextImage: () => void;
	onDownloadImage: () => void;
	onChangeFitMode: (
		value: Parameters<typeof BgFitModeSelector>[0]['value']
	) => void;
	onChangeScale: (value: number) => void;
	onChangePositionX: (value: number) => void;
	onChangePositionY: (value: number) => void;
	onChangeFocusPoint: (x: number | null, y: number | null) => void;
	/**
	 * Reset focus to null AND recenter the image so the full mirror-fill
	 * composition (primary + mirrored depth on both sides) is visually
	 * centered in the viewport.
	 */
	onCenterFocus: () => void;
	onChangeRotation: (value: number) => void;
	onChangeOpacity: (value: number) => void;
	onChangeMirror: (value: boolean) => void;
	onChangeMirrorFill: (value: boolean) => void;
	onChangeMirrorFillInvert: (value: boolean) => void;
	onChangeMirrorFillCount: (value: number) => void;
	onChangeTransitionType: (value: SlideshowTransitionType) => void;
	onChangeTransitionDuration: (value: number) => void;
	onChangeTransitionIntensity: (value: number) => void;
	onChangeTransitionAudioDrive: (value: number) => void;
	onChangeTransitionAudioChannel: (value: AudioReactiveChannel) => void;
	onChangeTransitionAudioSmoothing: (value: number) => void;
};

export default function ActiveWallpaperSection({
	t,
	activeImage,
	activeImageIndex,
	imageCount,
	imageFitMode,
	imageFramingManualEnabled,
	imageScale,
	imagePositionX,
	imagePositionY,
	imageFocusX,
	imageFocusY,
	imageRotation,
	imagePreviewUrl,
	imagePositionXRange,
	imagePositionYRange,
	imageOpacity,
	imageMirror,
	imageMirrorFill,
	imageMirrorFillInvert,
	imageMirrorFillCount,
	layoutResponsiveEnabled,
	layoutBackgroundReframeEnabled,
	layoutReferenceWidth,
	layoutReferenceHeight,
	imageMinScale,
	transitionType,
	transitionDuration,
	transitionIntensity,
	transitionAudioDrive,
	transitionAudioChannel,
	transitionAudioSmoothing,
	slideshowManualTimestampsEnabled,
	onCaptureLogoOverride,
	onClearLogoOverride,
	onCaptureSpectrumOverride,
	onClearSpectrumOverride,
	onCaptureParticlesOverride,
	onClearParticlesOverride,
	onCaptureRainOverride,
	onClearRainOverride,
	onCaptureLooksOverride,
	onClearLooksOverride,
	onChangePlaybackSwitchAt,
	calculatedSwitchAt,
	onChangeFramingManualEnabled,
	onCoverFitCurrent,
	onCoverFitAll,
	onUploadClick,
	onPreviousImage,
	onNextImage,
	onDownloadImage,
	onChangeFitMode,
	onChangeScale,
	onChangePositionX,
	onChangePositionY,
	onChangeFocusPoint,
	onCenterFocus,
	onChangeRotation,
	onChangeOpacity,
	onChangeMirror,
	onChangeMirrorFill,
	onChangeMirrorFillInvert,
	onChangeMirrorFillCount,
	onChangeTransitionType,
	onChangeTransitionDuration,
	onChangeTransitionIntensity,
	onChangeTransitionAudioDrive,
	onChangeTransitionAudioChannel,
	onChangeTransitionAudioSmoothing,
	onAutoFocusActiveImage
}: Props) {
	const { confirm } = useDialog();
	const logoOverrideActive = activeImage?.logoOverride != null;
	const spectrumOverrideActive = activeImage?.spectrumOverride != null;
	const particlesOverrideActive = activeImage?.particlesOverride != null;
	const rainOverrideActive = activeImage?.rainOverride != null;
	const looksOverrideActive = activeImage?.looksOverride != null;

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	function parseTime(value: string): number | null {
		const parts = value.split(':');
		if (parts.length === 2) {
			const m = parseInt(parts[0] ?? '0', 10);
			const s = parseInt(parts[1] ?? '0', 10);
			if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
		}
		const plain = parseFloat(value);
		return isNaN(plain) ? null : plain;
	}

	const isCalculatedTime = activeImage?.playbackSwitchAt == null;
	const displayTime = !isCalculatedTime
		? activeImage.playbackSwitchAt
		: calculatedSwitchAt != null
			? calculatedSwitchAt
			: null;

	async function handleDownloadImage() {
		const ok = await confirm({
			title: t.label_download_original_image_asset,
			message: t.confirm_download_original_image_asset,
			confirmLabel: t.label_download_original_image_asset,
			cancelLabel: t.label_cancel,
			tone: 'default'
		});
		if (!ok) return;
		onDownloadImage();
	}

	async function handleResetFraming() {
		const ok = await confirm({
			title: t.label_reset_framing,
			message: t.confirm_reset_image_framing,
			confirmLabel: t.label_reset_framing,
			cancelLabel: t.label_cancel,
			tone: 'warning'
		});
		if (!ok) return;
		onChangeFocusPoint(null, null);
		onChangeFitMode('cover');
		onChangeScale(1);
		onChangePositionX(0);
		onChangePositionY(0);
		onChangeRotation(0);
	}

	async function handleCoverFitAll() {
		const ok = await confirm({
			title: t.label_cover_fit_all,
			message: t.confirm_cover_fit_all,
			confirmLabel: t.label_cover_fit_all,
			cancelLabel: t.label_cancel,
			tone: 'warning'
		});
		if (!ok) return;
		onCoverFitAll();
	}

	return (
		<BackgroundCardShell
			t={t}
			activeImage={activeImage}
			activeImageIndex={activeImageIndex}
			imageCount={imageCount}
			onUploadClick={onUploadClick}
			onPreviousImage={onPreviousImage}
			onNextImage={onNextImage}
			onDownloadImage={handleDownloadImage}
			imageFitMode={imageFitMode}
			imageFramingManualEnabled={imageFramingManualEnabled}
			imageScale={imageScale}
			imagePositionX={imagePositionX}
			imagePositionY={imagePositionY}
			imagePositionXRange={imagePositionXRange}
			imagePositionYRange={imagePositionYRange}
			imageFocusX={imageFocusX}
			imageFocusY={imageFocusY}
			imageRotation={imageRotation}
			imageOpacity={imageOpacity}
			imagePreviewUrl={imagePreviewUrl}
			imageMirror={imageMirror}
			imageMirrorFill={imageMirrorFill}
			imageMirrorFillInvert={imageMirrorFillInvert}
			imageMirrorFillCount={imageMirrorFillCount}
			layoutResponsiveEnabled={layoutResponsiveEnabled}
			layoutBackgroundReframeEnabled={layoutBackgroundReframeEnabled}
			layoutReferenceWidth={layoutReferenceWidth}
			layoutReferenceHeight={layoutReferenceHeight}
			onChangePositionX={onChangePositionX}
			onChangePositionY={onChangePositionY}
			onChangeFocusPoint={onChangeFocusPoint}
			onChangeScale={onChangeScale}
			onChangeRotation={onChangeRotation}
			onChangeOpacity={onChangeOpacity}
			onChangeMirror={onChangeMirror}
			onChangeMirrorFill={onChangeMirrorFill}
			onChangeMirrorFillInvert={onChangeMirrorFillInvert}
			onChangeMirrorFillCount={onChangeMirrorFillCount}
			onChangeFramingManualEnabled={onChangeFramingManualEnabled}
			onCoverFitCurrent={onCoverFitCurrent}
			onCoverFitAll={() => void handleCoverFitAll()}
			onAutoFocusActiveImage={onAutoFocusActiveImage}
			imageMinScale={imageMinScale}
			onResetFraming={() => void handleResetFraming()}
			onCenterFocus={onCenterFocus}
		>
			<AdvancedOnly>
				<div className="mb-2">
					<ImageSceneAssignment />
				</div>
				<CollapsibleSection title={t.bg_per_image_overrides}>
					<div className="flex flex-col gap-2">
						<p
							className="text-[11px] leading-snug"
							style={{ color: 'var(--editor-accent-muted)' }}
						>
							{t.bg_per_image_overrides_hint}
						</p>
						<OverrideRow
							label={t.bg_override_logo}
							active={logoOverrideActive}
							onCapture={onCaptureLogoOverride}
							onClear={onClearLogoOverride}
						/>
						<OverrideRow
							label={t.bg_override_spectrum}
							active={spectrumOverrideActive}
							onCapture={onCaptureSpectrumOverride}
							onClear={onClearSpectrumOverride}
						/>
						<OverrideRow
							label={t.bg_override_particles}
							active={particlesOverrideActive}
							onCapture={onCaptureParticlesOverride}
							onClear={onClearParticlesOverride}
						/>
						<OverrideRow
							label={t.bg_override_rain}
							active={rainOverrideActive}
							onCapture={onCaptureRainOverride}
							onClear={onClearRainOverride}
						/>
						<OverrideRow
							label={t.bg_override_looks}
							active={looksOverrideActive}
							onCapture={onCaptureLooksOverride}
							onClear={onClearLooksOverride}
						/>
					</div>

					{activeImage && slideshowManualTimestampsEnabled && (
						<div
							className="mt-2 flex items-center justify-between gap-3 rounded-(--editor-radius-md) border px-3 py-2"
							style={{
								borderColor: UI_COLORS.border,
								background: UI_COLORS.raised
							}}
						>
							<span
								className="text-[12px] font-medium"
								style={{ color: UI_COLORS.fg }}
							>
								Switch at
							</span>
							<div className="flex flex-wrap items-center justify-end gap-1">
								<SnapToNowButton
									onSnap={onChangePlaybackSwitchAt}
								/>
								<Button
									onClick={() =>
										onChangePlaybackSwitchAt(
											Math.max(0, (displayTime ?? 0) - 1)
										)
									}
									size="sm"
									density="compact"
									variant="secondary"
									title="-1s"
								>
									-
								</Button>
								<Button
									onClick={() =>
										onChangePlaybackSwitchAt(
											(displayTime ?? 0) + 1
										)
									}
									size="sm"
									density="compact"
									variant="secondary"
									title="+1s"
								>
									+
								</Button>
								<input
									type="text"
									placeholder="mm:ss"
									value={
										displayTime != null
											? formatTime(displayTime)
											: ''
									}
									onChange={e => {
										const v = parseTime(e.target.value);
										onChangePlaybackSwitchAt(
											v != null && v >= 0 ? v : null
										);
									}}
									className="w-16 rounded border px-1.5 py-0.5 text-[11px] text-center outline-none transition-colors"
									style={{
										background: isCalculatedTime
											? 'var(--editor-tag-bg)'
											: 'var(--editor-surface-bg)',
										borderColor: isCalculatedTime
											? 'transparent'
											: 'var(--editor-accent-border)',
										color: isCalculatedTime
											? 'var(--editor-tag-fg)'
											: 'var(--editor-active-fg)',
										opacity: isCalculatedTime ? 0.7 : 1
									}}
									title={
										isCalculatedTime
											? 'Auto-calculated from Audio Checkpoints'
											: 'Manual override'
									}
								/>
								{!isCalculatedTime && (
									<Button
										onClick={() =>
											onChangePlaybackSwitchAt(null)
										}
										size="sm"
										density="compact"
										variant="ghost"
									>
										✕
									</Button>
								)}
							</div>
						</div>
					)}
				</CollapsibleSection>
			</AdvancedOnly>
			<AdvancedOnly>
				{activeImage ? (
					<CollapsibleSection title={t.section_transition_next}>
						<span
							className="text-[11px]"
							style={{ color: UI_COLORS.fgMute }}
						>
							{t.hint_transition_next}
						</span>

						<div className="flex flex-col gap-1">
							<span
								className="uppercase"
								style={{
									color: UI_COLORS.fgMute,
									fontFamily: FONT.mono,
									fontSize: 10,
									fontWeight: 650,
									letterSpacing: '0.1em'
								}}
							>
								Transition Style
							</span>
							<div className="flex flex-wrap gap-1.5">
								{TRANSITION_TYPES.map(type => (
									<Button
										key={type}
										size="sm"
										density="compact"
										variant={
											transitionType === type
												? 'primary'
												: 'secondary'
										}
										active={transitionType === type}
										onClick={() =>
											onChangeTransitionType(type)
										}
									>
										{TRANSITION_LABELS[type]}
									</Button>
								))}
							</div>
						</div>

						<div className="grid grid-cols-2 gap-2">
							<Slider
								label={t.label_transition_duration}
								value={transitionDuration}
								{...SLIDESHOW_RANGES.transitionDuration}
								unit="s"
								onChange={onChangeTransitionDuration}
								variant="compact"
								formatValue={formatDecimal}
							/>
							<Slider
								label={t.label_transition_intensity}
								value={transitionIntensity}
								{...SLIDESHOW_RANGES.transitionIntensity}
								onChange={onChangeTransitionIntensity}
								variant="compact"
								formatValue={formatDecimal}
							/>
						</div>

						<Slider
							label={t.label_transition_audio_drive}
							value={transitionAudioDrive}
							{...SLIDESHOW_RANGES.transitionAudioDrive}
							onChange={onChangeTransitionAudioDrive}
							variant="compact"
							formatValue={formatDecimal}
						/>
						<BgAudioChannelSelector
							value={transitionAudioChannel}
							onChange={onChangeTransitionAudioChannel}
							label={t.label_transition_audio_channel}
						/>
						<Slider
							label={t.label_smoothing}
							value={transitionAudioSmoothing}
							{...AUDIO_ROUTING_RANGES.selectedChannelSmoothing}
							onChange={onChangeTransitionAudioSmoothing}
							variant="compact"
							formatValue={formatDecimal}
						/>
					</CollapsibleSection>
				) : null}
			</AdvancedOnly>
		</BackgroundCardShell>
	);
}
