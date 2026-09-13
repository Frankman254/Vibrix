/**
 * The clock time-based visuals read (colour rotation). Live it is
 * `performance.now()`. The offline export pins it to each frame's position in
 * the track, so a colour cycle advances with the video however long a frame
 * takes to render.
 */
let pinnedNowMs: number | null = null;

export function getRenderNowMs(): number {
	if (pinnedNowMs !== null) return pinnedNowMs;
	return typeof performance === 'undefined' ? 0 : performance.now();
}

/** Pins the render clock to `nowMs`; `null` returns it to real time. */
export function pinRenderClock(nowMs: number | null): void {
	pinnedNowMs = nowMs;
}
