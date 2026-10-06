import { useMemo, useState } from 'react';
import { useT } from '@/lib/i18n';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useDialog } from '@/editor/DialogProvider';
import { Button, Slider, ToggleSwitch, UI_COLORS } from '@/ui';
import SlideshowClipTimeline from './SlideshowClipTimeline';
import SlideshowMarkControl from './SlideshowMarkControl';
import {
	filterImageIdsBySetlist,
	getActiveSetlist
} from '@/store/slices/setlistsSlice';

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
	async function resetTimings() {
		if (
			!(await confirm({
				title: t.confirm_reset_slideshow_timestamps_title,
				message: activeSetlist
					? t.slideshow_reset_setlist_message.replace(
							'{name}',
							activeSetlist.name
						)
					: t.slideshow_reset_message,
				confirmLabel: t.label_confirm_reset,
				cancelLabel: t.label_cancel,
				tone: 'warning'
			}))
		)
			return;
		store.resetAllManualTimestamps(
			activeSetlist
				? visibleImages.map(image => image.assetId)
				: undefined
		);
	}

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
			<Button
				onClick={() => void resetTimings()}
				size="sm"
				variant="secondary"
			>
				{t.slideshow_reset_equal}
			</Button>
			<span className="text-[11px]" style={{ color: UI_COLORS.fgMute }}>
				{t.slideshow_modes_hint}
			</span>
			{store.slideshowEnabled && (
				<div className="flex flex-col gap-2">
					{/* Above the mode switches on purpose: pressing it turns
					    manual timestamps on, which is how the mode is found. */}
					<SlideshowMarkControl />
					<div className="flex flex-col gap-2">
						<SwitchRow
							label={t.label_slideshow_audio_checkpoints}
							checked={store.slideshowAudioCheckpointsEnabled}
							onChange={store.setSlideshowAudioCheckpointsEnabled}
							tooltip={t.hint_slideshow_audio_checkpoints}
						/>
						<SwitchRow
							label={t.slideshow_manual_label}
							checked={store.slideshowManualTimestampsEnabled}
							onChange={store.setSlideshowManualTimestampsEnabled}
							tooltip={t.slideshow_modes_hint}
						/>
						<SwitchRow
							label={t.label_slideshow_track_change_sync}
							checked={store.slideshowTrackChangeSyncEnabled}
							onChange={store.setSlideshowTrackChangeSyncEnabled}
							tooltip={t.hint_slideshow_track_change_sync}
						/>
					</div>

					{(store.slideshowManualTimestampsEnabled ||
						store.slideshowAudioCheckpointsEnabled) && (
						<SlideshowClipTimeline />
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
