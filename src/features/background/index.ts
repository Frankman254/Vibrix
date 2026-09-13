/**
 * Background domain — public surface.
 *
 * The wallpaper's own image: which picture is showing, how it is framed on the
 * screen, and how a pool of them advances over time. Everything outside
 * `features/background/` imports from here or from `./ui`, never from a file
 * inside.
 *
 * See docs/architecture/ARCHITECTURE.md §3 (Ownership).
 *
 * Layout:
 *   domain/     the model: how an image is fitted, covered, mirrored and
 *               centred on a given screen, and what auto-fit should suggest.
 *               Pure — no React, no store, no canvas.
 *   slideshow/  pool playback: which image is effective at a given moment, and
 *               the mounted controller that advances it.
 *   controls/   the Background editor tab and its four sub-views
 *               (Pool / Active / Audio / Global).
 *
 * TWO ENTRY POINTS, same rule as the other domains: `./index` is React-free and
 * store-free so the canvas layers, `store/` and the migrations can use the model
 * without dragging the editor in; `./ui` is the React surface.
 *
 * NOT here, on purpose:
 *   - `components/wallpaper/layers/imageCanvasBackground*` — those draw the
 *     background, but they are plugins into the shared layer engine
 *     (`imageCanvasShared`, `imageCanvasEffects`), which also serves the overlay
 *     layers. Moving them would only swap a `components -> features` edge for a
 *     `features -> components` one.
 *   - `lib/backgroundPalette` and `hooks/useBackgroundPalette` — named for the
 *     background, but 18 and 10 modules respectively sample them as a *colour
 *     source*, from stageFx to lyrics. Shared infrastructure, not domain state.
 *   - `lib/backgroundImages` — the asset store; it belongs here, but four of its
 *     consumers sit in `services/projectSettings`, which would gain a fresh debt edge.
 *     Blocked until that module moves. See ARCHITECTURE.md §6.3.
 *   - `store/slices/backgroundSlice.ts` — stays in `store/` by design (§2).
 */

// ── domain: framing an image on screen ──────────────────────────────────────
export {
	MIRROR_FILL_MAX_DEPTH,
	getImageBaseSize,
	getRotatedHalfExtents,
	resolveImageTransform,
	resolveMinimumCoverScale
} from './domain/resolveImageTransform';
export type {
	ImageDrawRect,
	ImageTransformBounds,
	ResolveImageTransformParams,
	ResolvedImageTransform
} from './domain/resolveImageTransform';

// ── domain: auto-fit suggestions ────────────────────────────────────────────
export {
	clampCoveredCenterPx,
	loadImageDimensions,
	suggestBackgroundAutoFit
} from './domain/backgroundAutoFit';
export type { AutoFitResult } from './domain/backgroundAutoFit';

// ── slideshow playback (model half; the controller is in ./ui) ──────────────
export {
	PLAYBACK_ZERO_EPSILON,
	resolveEffectiveImageForPlayback,
	resolveEffectivePlaybackImageId,
	resolveSlideshowImageIdAtTime,
	resolveSlideshowPool
} from './slideshow/slideshowPlayback';
export type {
	EffectiveImageResolution,
	PlaybackImageResolution,
	SlideshowTimelineSettings
} from './slideshow/slideshowPlayback';
