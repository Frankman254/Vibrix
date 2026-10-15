import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VisualTransitionSnapshot } from '@/types/wallpaper';
import {
	setComposePlaybackClock,
	visualTransitionClockMs
} from './composePlaybackClock';

const transition = {
	id: 'compose-image-cue-b',
	fromImageId: 'image-a',
	toImageId: 'image-b',
	startedAtMs: 1000,
	durationMs: 500,
	easing: 'smoothstep',
	subsystems: []
} satisfies VisualTransitionSnapshot;

describe('Compose playback clock', () => {
	afterEach(() => {
		setComposePlaybackClock(false, 0);
		vi.restoreAllMocks();
	});

	it('uses the absolute score playhead for Compose transitions', () => {
		setComposePlaybackClock(true, 1250);
		expect(visualTransitionClockMs(transition)).toBe(1250);
	});

	it('keeps wall-clock transitions unchanged outside Compose', () => {
		vi.spyOn(Date, 'now').mockReturnValue(9000);
		setComposePlaybackClock(false, 0);
		expect(visualTransitionClockMs(transition)).toBe(9000);
	});
});
