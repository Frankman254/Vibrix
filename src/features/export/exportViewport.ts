/**
 * The viewport the export measures against, pinned for the whole run.
 *
 * Several render subsystems scale themselves from the LIVE viewport — the
 * particle pixel scale, the Stage FX sizes, the overlay metrics, the Keep
 * Covered refit — because what the editor shows is the thing being reproduced.
 * Reading `window` for that is right, but reading it repeatedly during a run is
 * not: an export takes minutes, and a window the user resizes (or un-maximises)
 * halfway through would change the geometry of frame 40.000 relative to frame
 * 1. The user's own words: at the moment the video starts, the render already
 * has every number it will work with.
 *
 * So `beginExportViewport()` samples the window once, at the click, and every
 * export-side reader goes through `readExportViewport()` instead of the live
 * one. Outside a run it falls through to the live value, which is what the
 * pre-flight UI and the tests want.
 */
import {
	getCurrentViewportResolution,
	type ViewportResolution
} from '@/features/layout/viewportMetrics';

let pinned: ViewportResolution | null = null;

/** Samples the window and pins it. Returns what was pinned. */
export function beginExportViewport(
	override?: ViewportResolution
): ViewportResolution {
	pinned = override ?? getCurrentViewportResolution();
	return pinned;
}

export function readExportViewport(): ViewportResolution {
	return pinned ?? getCurrentViewportResolution();
}

export function endExportViewport(): void {
	pinned = null;
}
