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

export function formatTimelineTimestamp(seconds: number): string {
	const safe = Math.round(Math.max(0, seconds) * 1000) / 1000;
	const wholeMinutes = Math.floor(safe / 60);
	const remaining = safe - wholeMinutes * 60;
	const [wholeSeconds = '0', decimals = ''] = remaining.toFixed(3).split('.');
	const fraction = decimals.replace(/0+$/, '');
	const secondText = `${wholeSeconds.padStart(2, '0')}${fraction ? `.${fraction}` : ''}`;
	return `${wholeMinutes}:${secondText}`;
}

export function parseTimelineTimestamp(value: string): number | null {
	const normalized = value.trim().replace(',', '.');
	if (!normalized) return null;
	const parts = normalized.split(':');
	if (parts.length < 1 || parts.length > 3) return null;
	if (parts.some(part => part.trim() === '')) return null;
	const numbers = parts.map(Number);
	if (numbers.some(part => !Number.isFinite(part) || part < 0)) return null;
	if (numbers.length === 1) return numbers[0] ?? null;
	const seconds = numbers.at(-1) ?? 0;
	const minutes = numbers.at(-2) ?? 0;
	if (seconds >= 60 || (numbers.length === 3 && minutes >= 60)) return null;
	const hours = numbers.length === 3 ? (numbers[0] ?? 0) : 0;
	return hours * 3600 + minutes * 60 + seconds;
}

export function resolveTimelineScrollLeft(
	time: number,
	duration: number,
	timelineWidth: number,
	viewportWidth: number
): number {
	if (duration <= 0 || timelineWidth <= viewportWidth) return 0;
	const playhead = Math.min(duration, Math.max(0, time));
	const centered = (playhead / duration) * timelineWidth - viewportWidth / 2;
	return Math.min(timelineWidth - viewportWidth, Math.max(0, centered));
}

/** Timeline spans use full-visibility marks, not the earlier fade start. */
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
