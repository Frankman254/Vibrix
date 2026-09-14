import { useWallpaperStore } from '@/store/wallpaperStore';
import type { WallpaperState } from '@/types/wallpaper';
import {
	getEditorThemePalette,
	type BackgroundPalette
} from '@/lib/backgroundPalette';

export type RenderStateSnapshot = {
	state: Readonly<WallpaperState>;
	palette: BackgroundPalette;
	capturedAtMs: number;
};

function pickStateFields(
	store: ReturnType<typeof useWallpaperStore.getState>
): WallpaperState {
	const snapshot: Record<string, unknown> = {};
	for (const key of Object.keys(store)) {
		const value = (store as unknown as Record<string, unknown>)[key];
		if (typeof value !== 'function') {
			snapshot[key] = value;
		}
	}
	return snapshot as unknown as WallpaperState;
}

/**
 * The export owns its clock, so the real-time budget does not apply: every
 * layer renders at full quality (no `low`/`medium` blur, wave or effect caps)
 * however the editor is tuned to keep the live preview smooth. A paused or
 * sleeping editor must not freeze the video either, and calibration's
 * synthetic pulse must not stand in for the track.
 */
function withExportQuality(state: WallpaperState): WallpaperState {
	return {
		...state,
		performanceMode: 'high',
		motionPaused: false,
		sleepModeActive: false,
		calibrationSyntheticGroups: {},
		// A fade in flight is timed on the wall clock; the video starts settled.
		visualTransition: null
	};
}

export function getRenderStateSnapshot(
	overrides?: Partial<RenderStateSnapshot>
): RenderStateSnapshot {
	const store = useWallpaperStore.getState();
	const state = withExportQuality(pickStateFields(store));
	const palette =
		overrides?.palette ?? getEditorThemePalette(state.editorTheme);
	const snapshot: RenderStateSnapshot = {
		state: Object.freeze(state),
		palette,
		capturedAtMs:
			overrides?.capturedAtMs ??
			(typeof performance !== 'undefined'
				? performance.now()
				: Date.now())
	};
	return Object.freeze(snapshot);
}
