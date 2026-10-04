import { useAudioContext } from '@/context/useAudioContext';
import { useDialog } from '@/editor/DialogProvider';
import { useT } from '@/lib/i18n';
import {
	filterImageIdsBySetlist,
	getActiveSetlist
} from '@/store/slices/setlistsSlice';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { Button } from '@/ui';
import { useShallow } from 'zustand/react/shallow';

export default function SlideshowHudControls() {
	const t = useT();
	const { confirm } = useDialog();
	const { getCurrentTime } = useAudioContext();
	const store = useWallpaperStore(
		useShallow(state => ({
			backgroundImages: state.backgroundImages,
			setlists: state.setlists,
			activeSetlistId: state.activeSetlistId,
			markNextImageSwitchAt: state.markNextImageSwitchAt,
			resetAllManualTimestamps: state.resetAllManualTimestamps
		}))
	);
	const activeSetlist = getActiveSetlist(
		store.setlists,
		store.activeSetlistId
	);

	function markHere() {
		store.markNextImageSwitchAt(Math.max(0, getCurrentTime()));
	}

	async function distributeEqually() {
		const accepted = await confirm({
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
		});
		if (!accepted) return;

		const imageIds = activeSetlist
			? filterImageIdsBySetlist(
					store.backgroundImages,
					store.setlists,
					store.activeSetlistId
				).map(image => image.assetId)
			: undefined;
		store.resetAllManualTimestamps(imageIds);
	}

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1">
			<Button
				size="sm"
				density="compact"
				variant="secondary"
				onClick={markHere}
				title={t.hint_slideshow_mark_here}
			>
				{t.label_slideshow_mark_here}
			</Button>
			<Button
				size="sm"
				density="compact"
				variant="ghost"
				onClick={() => void distributeEqually()}
				title={t.slideshow_modes_hint}
			>
				{t.slideshow_hud_equal}
			</Button>
		</div>
	);
}
