import { useWallpaperStore } from '@/store/wallpaperStore';
import { hydrateComposeBaseState } from '@/store/compositionRuntimeState';
import type { VibrixScoreEnvelope } from '@/features/composition/vibrixScore';
import type { WallpaperState } from '@/types/wallpaper';
import {
	getEditorThemePalette,
	type BackgroundPalette
} from '@/lib/backgroundPalette';

/**
 * The Compose session captured for one export: the score envelope and the
 * frozen base it resolves against, with session-local URLs restored from the
 * live project. The frame loop re-resolves this at every boundary instead of
 * trusting the playhead position the editor happens to be parked on.
 */
export type ComposeExportSession = {
	envelope: VibrixScoreEnvelope;
	base: Readonly<WallpaperState>;
};

export type RenderStateSnapshot = {
	state: Readonly<WallpaperState>;
	palette: BackgroundPalette;
	capturedAtMs: number;
	/** Non-null only when Compose mode was on at capture time. */
	composition: ComposeExportSession | null;
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
	const composition =
		overrides?.composition !== undefined
			? overrides.composition
			: store.composeEnabled &&
				  store.composeScore &&
				  store.composeBaseState
				? Object.freeze({
						envelope: store.composeScore,
						// Same hydration the live runtime does, then the same
						// export-quality pass: the offline evaluator must start
						// from exactly the document the preview resolves against.
						base: Object.freeze(
							withExportQuality(
								hydrateComposeBaseState(
									store.composeBaseState,
									state
								)
							)
						)
					})
				: null;
	const snapshot: RenderStateSnapshot = {
		state: Object.freeze(state),
		palette,
		capturedAtMs:
			overrides?.capturedAtMs ??
			(typeof performance !== 'undefined'
				? performance.now()
				: Date.now()),
		composition
	};
	return Object.freeze(snapshot);
}
