import type { VisualTransitionSnapshot } from '@/types/wallpaper';

let active = false;
let playheadMs = 0;

export function setComposePlaybackClock(
	enabled: boolean,
	timeMs: number
): void {
	active = enabled;
	playheadMs = Math.max(0, timeMs);
}

export function visualTransitionClockMs(
	transition: VisualTransitionSnapshot
): number {
	return active && transition.id.startsWith('compose-')
		? playheadMs
		: Date.now();
}
