import type { BackgroundImageItem } from '@/types/wallpaper';
import { buildManualSwitchSchedule } from './slideshowPlayback';

export type TimelineClip = {
	poolIndex: number;
	assetId: string;
	index: number;
	start: number;
	end: number;
	isManual: boolean;
	imageUrl: string | null;
	thumbnailUrl: string | null;
	enabled: boolean;
};

/** Timeline spans represent timestamp anchors, not the start of their fades. */
export function buildTimelineClips(
	pool: BackgroundImageItem[],
	duration: number,
	manual: boolean
): TimelineClip[] {
	if (!Number.isFinite(duration) || duration <= 0) return [];
	const images = manual
		? pool
		: pool.map(image => ({ ...image, playbackSwitchAt: null }));
	const schedule = buildManualSwitchSchedule({ pool: images, duration });
	const clamp = (time: number) => Math.min(duration, Math.max(0, time));
	return schedule.map(({ image, markedAt }, index) => ({
		assetId: image.assetId,
		index,
		poolIndex: pool.findIndex(item => item.assetId === image.assetId),
		start: index === 0 ? 0 : clamp(markedAt),
		end: clamp(schedule[index + 1]?.markedAt ?? duration),
		isManual: image.playbackSwitchAt != null,
		imageUrl: image.url,
		thumbnailUrl: image.thumbnailUrl,
		enabled: image.enabled
	}));
}
