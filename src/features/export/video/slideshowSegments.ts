/**
 * The slideshow, planned for the offline video export.
 *
 * Live, `SlideshowManager` switches the active image while the track plays and
 * `setActiveImageId` applies that image's scene. The export owns its clock, so
 * it walks the frames up front instead: every time the image changes it opens
 * a segment whose frozen state is the previous one with that image selected —
 * the same patch the store applies, chained in the same order.
 */
import {
	loadImageDimensions,
	resolveSlideshowImageIdAtTime
} from '@/features/background';
import { getCurrentViewportResolution } from '@/features/layout/viewportMetrics';
import {
	getBackgroundPalette,
	resolvePaletteSourceUrl,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import {
	buildActiveImageSelectionPatch,
	buildCoveredAutoFitPatch
} from '@/store/activeImageSelection';
import { createVisualTransitionSnapshot } from '@/features/visualTransition/visualTransitionCoordinator';
import type { WallpaperState } from '@/types/wallpaper';
import { computeOfflineFrameCount } from './offlineVideoFormat';

export type SlideshowSegment = {
	startMs: number;
	imageId: string | null;
	state: Readonly<WallpaperState>;
};

export type PreparedSlideshowSegment = SlideshowSegment & {
	/** Live layers colour themselves from the background image's palette. */
	palette: BackgroundPalette;
};

function selectImage(
	state: Readonly<WallpaperState>,
	imageId: string | null,
	startMs: number
): WallpaperState {
	const { patch } = buildActiveImageSelectionPatch(
		state as WallpaperState,
		imageId
	);
	// The same scene fade `setActiveImageId` publishes, started on the video
	// clock instead of the wall clock so the frame loop can time it.
	const visualTransition = createVisualTransitionSnapshot({
		state,
		patch,
		toImageId: patch.activeImageId ?? null,
		startedAtMs: startMs
	});
	return { ...state, ...patch, visualTransition };
}

/**
 * One segment per run of frames that show the same image. The first segment
 * keeps the state as captured when its image is already the active one, so a
 * project without a slideshow exports exactly what the editor shows.
 */
export function buildSlideshowSegments(
	state: Readonly<WallpaperState>,
	durationMs: number,
	fps: number
): SlideshowSegment[] {
	const durationSec = durationMs / 1000;
	const frameCount = Math.max(1, computeOfflineFrameCount(durationMs, fps));
	const segments: SlideshowSegment[] = [];
	let current = state;
	let currentImageId = state.activeImageId;

	for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
		const startMs = (frameIndex * 1000) / fps;
		const imageId = resolveSlideshowImageIdAtTime(
			state,
			startMs / 1000,
			durationSec
		);
		if (segments.length > 0 && imageId === currentImageId) continue;
		if (imageId !== currentImageId) {
			current = Object.freeze(selectImage(current, imageId, startMs));
			currentImageId = imageId;
		}
		segments.push({ startMs, imageId, state: current });
	}
	return segments;
}

/** The segment that covers `timeMs`. Segments are sorted by `startMs`. */
export function findSlideshowSegmentAt<T extends SlideshowSegment>(
	segments: readonly T[],
	timeMs: number
): T {
	let low = 0;
	let high = segments.length - 1;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (segments[mid].startMs <= timeMs) low = mid;
		else high = mid - 1;
	}
	return segments[low];
}

/**
 * Async half: Keep Covered refits each newly selected image to the viewport
 * (as `setActiveImageId` does once the image's size is known) and every
 * segment gets its background palette.
 */
export async function prepareSlideshowSegments(
	segments: readonly SlideshowSegment[],
	capturedState: Readonly<WallpaperState>
): Promise<PreparedSlideshowSegment[]> {
	const viewport = getCurrentViewportResolution();
	const prepared: PreparedSlideshowSegment[] = [];
	for (const segment of segments) {
		let state = segment.state;
		if (state !== capturedState && state.imageUrl) {
			try {
				const imageSize = await loadImageDimensions(state.imageUrl);
				const patch = buildCoveredAutoFitPatch(
					state as WallpaperState,
					imageSize,
					viewport
				);
				if (patch) state = Object.freeze({ ...state, ...patch });
			} catch {
				// Same as live: an unreadable size leaves the framing as saved.
			}
		}
		prepared.push({
			...segment,
			state,
			palette: await getBackgroundPalette(resolvePaletteSourceUrl(state))
		});
	}
	return prepared;
}
