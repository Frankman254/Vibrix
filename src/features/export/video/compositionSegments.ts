import {
	compositionActivationKeyAt,
	resolveVisualStateAt
} from '@/features/composition/resolveVisualStateAt';
import {
	getBackgroundPalette,
	resolvePaletteSourceUrl
} from '@/lib/backgroundPalette';
import { selectComposeRuntimeState } from '@/store/compositionRuntimeState';
import type { WallpaperState } from '@/types/wallpaper';
import type { ComposeExportSession } from '../getRenderStateSnapshot';
import { computeOfflineFrameCount } from './offlineVideoFormat';
import type { PreparedSlideshowSegment } from './slideshowSegments';

/**
 * A Compose score resolved into constant-state video segments. The struct is
 * `PreparedSlideshowSegment` so the export runner slices, prepares subsystems
 * and picks the active segment with the exact same code as the slideshow.
 */
export type CompositionSegment = PreparedSlideshowSegment;

/**
 * First frame index whose render time (`frameIndex * frameStepsMs`) reaches
 * `cueTimeMs` under the same comparison the live evaluator uses for cue
 * activation (`cue.startTimeMs > timeMs` deactivates). Starting the scan one
 * floor-step below the exact quotient keeps this correct even when
 * `cueTimeMs / frameStepsMs` lands a hair off an integer: the scan can only
 * cross the single frame the rounding may have moved.
 */
function firstActiveFrame(
	cueTimeMs: number,
	frameStepsMs: number,
	frameCount: number
): number {
	const start = Math.max(0, Math.floor(cueTimeMs / frameStepsMs) - 1);
	for (let f = start; f < frameCount; f += 1) {
		if (f * frameStepsMs >= cueTimeMs) return f;
	}
	return frameCount;
}

/**
 * Frame indices where the resolved visual state can change: one per cue edge
 * (start and end), snapped forward to the first frame the live evaluator would
 * already score the cue active/inactive. Boundaries whose activation key
 * matches the previous kept boundary are dropped — that dedupes cues landing
 * on the same frame and absorbs any residual off-by-one rounding, because a
 * segment that resolved identically to its predecessor is merged, not emitted.
 */
function collectStateChangeBoundaries(
	session: ComposeExportSession,
	frameStepsMs: number,
	frameCount: number
): number[] {
	const enabledTracks = new Set(
		session.envelope.score.tracks
			.filter(track => track.enabled)
			.map(track => track.id)
	);
	const boundaries = new Set<number>([0]);
	for (const cue of session.envelope.score.cues) {
		if (!cue.enabled || !enabledTracks.has(cue.trackId)) continue;
		const after = firstActiveFrame(
			cue.startTimeMs,
			frameStepsMs,
			frameCount
		);
		const end =
			'endTimeMs' in cue
				? firstActiveFrame(cue.endTimeMs, frameStepsMs, frameCount)
				: frameCount;
		if (after >= 0 && after < frameCount) boundaries.add(after);
		if (end >= 0 && end < frameCount) boundaries.add(end);
	}
	const kept: number[] = [];
	let previousKey: string | null = null;
	for (const f of [...boundaries].sort((a, b) => a - b)) {
		const key = compositionActivationKeyAt(
			session.envelope,
			f * frameStepsMs
		);
		if (key === previousKey) continue;
		previousKey = key;
		kept.push(f);
	}
	return kept;
}

/**
 * Resolve a Compose session into constant-state segments for the offline
 * frame loop, mirroring `useComposePlaybackRuntime` per frame: the live
 * renderer shows the store frame with `selectComposeRuntimeState(resolved)`
 * stamped on top, so each segment merges the boundary's projection over the
 * captured project state instead of over the playhead position the editor
 * happens to be parked on. `composeEnabled` rides on every segment state
 * because the live store carries it through the runtime patch, and the
 * canvas uses it to switch image transitions to score-time progress.
 */
export async function buildCompositionSegments(
	session: ComposeExportSession,
	frozen: Readonly<WallpaperState>,
	durationMs: number,
	fps: number
): Promise<CompositionSegment[]> {
	const frameStepsMs = 1000 / fps;
	const frameCount = Math.max(1, computeOfflineFrameCount(durationMs, fps));
	const segments: CompositionSegment[] = [];
	for (const f of collectStateChangeBoundaries(
		session,
		frameStepsMs,
		frameCount
	)) {
		const timeMs = f * frameStepsMs;
		const resolved = resolveVisualStateAt(
			session.base,
			session.envelope,
			timeMs
		);
		const state = Object.freeze({
			...frozen,
			...selectComposeRuntimeState(resolved),
			composeEnabled: true
		}) as Readonly<WallpaperState>;
		segments.push({
			startMs: timeMs,
			imageId: resolved.activeImageId,
			state,
			palette: await getBackgroundPalette(resolvePaletteSourceUrl(state))
		});
	}
	return segments;
}
