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
import { readExportViewport } from '@/features/export/exportViewport';
import {
	getBackgroundPalette,
	resolvePaletteSourceUrl,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import {
	buildActiveImageSelectionPatch,
	buildCoveredAutoFitPatch
} from '@/store/activeImageSelection';
import { resolveImageLogoPosition } from '@/store/imageLogoFocus';
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
 * Async half: the two side effects `setActiveImageId` fires once the image's
 * size is known — the Keep Covered refit and "the mark follows the picture" —
 * plus each segment's background palette.
 *
 * The mark matters more than it looks. The switch does not make the renderer
 * read the mark; it moves `logoPositionX/Y` on every image switch. The
 * selection patch above RESTORES that pair from the image's scene / override /
 * logo slot, so a prepare step that skipped the mark would leave every segment
 * showing the slot's stored position — the logo (and the spectrum, when it
 * follows the logo) parked on the face the mark exists to avoid, for the whole
 * video, while the editor shows it correctly placed.
 */
export async function prepareSlideshowSegments(
	segments: readonly SlideshowSegment[],
	capturedState: Readonly<WallpaperState>
): Promise<PreparedSlideshowSegment[]> {
	const viewport = readExportViewport();
	const prepared: PreparedSlideshowSegment[] = [];
	for (const segment of segments) {
		let state = segment.state;
		// The captured segment is the editor's own live state: its framing and
		// its mark are already applied, and re-deriving them would overwrite a
		// logo the user dragged by hand after the last image switch.
		if (state !== capturedState && state.imageUrl) {
			try {
				const imageSize = await loadImageDimensions(state.imageUrl);
				const patch = buildCoveredAutoFitPatch(
					state as WallpaperState,
					imageSize,
					viewport
				);
				if (patch) state = Object.freeze({ ...state, ...patch });
				if (state.logoFollowImageFocus) {
					// Read the entry back out of the refitted state: the mark
					// maps through the rect the renderer actually draws.
					const image = state.backgroundImages.find(
						item => item.assetId === segment.imageId
					);
					const position = image
						? resolveImageLogoPosition({
								image,
								imageSize,
								viewport,
								layout: state
							})
						: null;
					if (position) {
						state = Object.freeze({
							...state,
							logoPositionX: position.x,
							logoPositionY: position.y
						});
					}
				}
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
