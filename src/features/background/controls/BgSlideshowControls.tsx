import { useMemo, useState } from 'react';
import { useT } from '@/lib/i18n';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useDialog } from '@/editor/DialogProvider';
import { Button, EnumButtonGroup, Slider, ToggleSwitch, UI_COLORS } from '@/ui';
import type { SlideshowTransitionAnchor } from '@/types/wallpaper';
import SlideshowClipTimeline from './SlideshowClipTimeline';
import {
	filterImageIdsBySetlist,
	getActiveSetlist
} from '@/store/slices/setlistsSlice';

const ANCHOR_OPTIONS: readonly SlideshowTransitionAnchor[] = [
	'start',
	'center',
	'end'
];

function SwitchRow({
	label,
	checked,
	onChange,
	tooltip
}: {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
	tooltip?: string;
}) {
	return (
		<div
			className="flex items-center justify-between gap-3 rounded-[var(--editor-radius-md)] border px-3 py-2"
			style={{
				borderColor: UI_COLORS.border,
				background: UI_COLORS.raised
			}}
			title={tooltip}
		>
			<span
				className="min-w-0 text-[12px] font-medium"
				style={{ color: UI_COLORS.fg }}
			>
				{label}
			</span>
			<ToggleSwitch
				checked={checked}
				onChange={onChange}
				size="sm"
				ariaLabel={label}
			/>
		</div>
	);
}

export default function BgSlideshowControls() {
	const t = useT();
	const { confirm } = useDialog();
	const store = useWallpaperStore();
	const [useMinutes, setUseMinutes] = useState(false);
	const activeSetlist = getActiveSetlist(
		store.setlists,
		store.activeSetlistId
	);
	const visibleImages = useMemo(
		() =>
			filterImageIdsBySetlist(
				store.backgroundImages,
				store.setlists,
				store.activeSetlistId
			),
		[store.backgroundImages, store.setlists, store.activeSetlistId]
	);
	const resetButtonLabel = activeSetlist ? 'Reset Setlist' : 'Reset All';
	const resetButtonTitle = activeSetlist
		? 'Clear manual timestamps only on images in the active setlist'
		: 'Clear all manual timestamps on every image, revert to auto-calculated';

	const intervalSeconds = store.slideshowInterval;
	const displayInterval = useMinutes ? intervalSeconds / 60 : intervalSeconds;
	const minInterval = useMinutes ? 1 : 5;
	const maxInterval = useMinutes ? 60 : 300;
	const stepInterval = useMinutes ? 1 : 5;

	function handleIntervalChange(value: number) {
		store.setSlideshowInterval(useMinutes ? Math.round(value * 60) : value);
	}

	return (
		<>
			<SwitchRow
				label={t.label_slideshow_enabled}
				checked={store.slideshowEnabled}
				onChange={store.setSlideshowEnabled}
			/>
			{store.slideshowEnabled && (
				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-2">
						<SwitchRow
							label={t.label_slideshow_audio_checkpoints}
							checked={store.slideshowAudioCheckpointsEnabled}
							onChange={store.setSlideshowAudioCheckpointsEnabled}
							tooltip={t.hint_slideshow_audio_checkpoints}
						/>
						<SwitchRow
							label="Manual timestamps"
							checked={store.slideshowManualTimestampsEnabled}
							onChange={store.setSlideshowManualTimestampsEnabled}
							tooltip="Switch images at exact seconds defined per image (audio file mode)"
						/>
						<SwitchRow
							label={t.label_slideshow_track_change_sync}
							checked={store.slideshowTrackChangeSyncEnabled}
							onChange={store.setSlideshowTrackChangeSyncEnabled}
							tooltip={t.hint_slideshow_track_change_sync}
						/>
					</div>

					{store.slideshowManualTimestampsEnabled && (
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<span
									className="flex-1 text-[11px]"
									style={{
										color: 'var(--editor-accent-muted)'
									}}
								>
									Drag cards and resize their edges to control
									how long each image stays on screen.
								</span>
								<Button
									onClick={() =>
										void (async () => {
											if (
												!(await confirm({
													title: t.confirm_reset_slideshow_timestamps_title,
													message: activeSetlist
														? `Remove manual clip timing only from the ${visibleImages.length} image(s) in "${activeSetlist.name}". Timings on hidden images stay untouched.`
														: t.confirm_reset_slideshow_timestamps_message,
													confirmLabel:
														t.label_confirm_reset,
													cancelLabel: t.label_cancel,
													tone: 'warning'
												}))
											) {
												return;
											}
											if (activeSetlist) {
												visibleImages.forEach(image =>
													store.setBackgroundImagePlaybackSwitchAt(
														image.assetId,
														null
													)
												);
												return;
											}
											store.resetAllManualTimestamps();
										})()
									}
									className="shrink-0"
									size="sm"
									density="compact"
									variant="ghost"
									title={resetButtonTitle}
								>
									{resetButtonLabel}
								</Button>
							</div>
							<div className="flex flex-col gap-1">
								<span
									className="text-[11px] font-medium"
									style={{ color: UI_COLORS.fg }}
								>
									{t.label_slideshow_transition_anchor}
								</span>
								<EnumButtonGroup<SlideshowTransitionAnchor>
									options={ANCHOR_OPTIONS}
									value={store.slideshowTransitionAnchor}
									onChange={
										store.setSlideshowTransitionAnchor
									}
									labels={{
										start: t.slideshow_anchor_start,
										center: t.slideshow_anchor_center,
										end: t.slideshow_anchor_end
									}}
								/>
								<span
									className="text-[10px] leading-snug"
									style={{
										color: 'var(--editor-accent-muted)'
									}}
								>
									{t.hint_slideshow_transition_anchor}
								</span>
							</div>
							<SlideshowClipTimeline />
						</div>
					)}

					{store.slideshowAudioCheckpointsEnabled &&
					!store.slideshowManualTimestampsEnabled ? (
						<span
							className="text-[11px]"
							style={{ color: 'var(--editor-accent-muted)' }}
						>
							{t.hint_slideshow_audio_checkpoints}
						</span>
					) : null}

					{store.slideshowTrackChangeSyncEnabled ? (
						<span
							className="text-[11px]"
							style={{ color: 'var(--editor-accent-muted)' }}
						>
							{t.hint_slideshow_track_change_sync}
						</span>
					) : null}

					{!store.slideshowAudioCheckpointsEnabled &&
					!store.slideshowManualTimestampsEnabled &&
					!store.slideshowTrackChangeSyncEnabled ? (
						<div className="flex items-center gap-2">
							<div className="flex-1">
								<Slider
									label={`Interval (${useMinutes ? 'min' : 'sec'})`}
									value={displayInterval}
									min={minInterval}
									max={maxInterval}
									step={stepInterval}
									onChange={handleIntervalChange}
									unit={useMinutes ? 'min' : 's'}
									variant="compact"
									formatValue={value =>
										`${Math.round(value)}${useMinutes ? 'm' : 's'}`
									}
								/>
							</div>
							<Button
								onClick={() => setUseMinutes(prev => !prev)}
								className="mt-4 shrink-0"
								size="sm"
								density="compact"
								variant="secondary"
							>
								{useMinutes ? 'sec' : 'min'}
							</Button>
						</div>
					) : null}
				</div>
			)}
		</>
	);
}
