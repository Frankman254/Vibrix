/**
 * Per-scope track-title state.
 *
 * The marquee offsets (and the cached text canvases) used to be module
 * globals shared by the live viewport and the offline export: while a video
 * rendered, the on-screen rAF loop kept advancing the SAME offset with
 * wall-clock deltas, so every exported frame got the export's delta plus
 * however much real time had passed — the title scrolled far too fast and
 * jumped between frames. An export must be deterministic: same project, same
 * frames, whatever the machine is doing.
 *
 * Same shape as `features/logo`'s `LogoScope`: live components use the
 * default scope, each export run creates its own.
 */

/** One marquee line of the Now Playing widget. */
export type MarqueeLineRuntime = {
	text: string;
	offset: number;
};

/** One line of the legacy (free-mode) overlay, with its rendered-text cache. */
export type TrackTextRuntime = {
	offset: number;
	lastText: string;
	cacheKey: string;
	renderedCanvas: HTMLCanvasElement | null;
	measuredWidth: number;
	canvasPaddingX: number;
	logicalCanvasWidth: number;
	logicalCanvasHeight: number;
};

export type TrackTitleScope = {
	widgetTitle: MarqueeLineRuntime;
	widgetArtist: MarqueeLineRuntime;
	overlayTitle: TrackTextRuntime;
	overlayTime: TrackTextRuntime;
};

function createMarqueeLineRuntime(): MarqueeLineRuntime {
	return { text: '', offset: 0 };
}

function createTrackTextRuntime(): TrackTextRuntime {
	return {
		offset: 0,
		lastText: '',
		cacheKey: '',
		renderedCanvas: null,
		measuredWidth: 0,
		canvasPaddingX: 0,
		logicalCanvasWidth: 0,
		logicalCanvasHeight: 0
	};
}

export function resetTrackTextRuntime(runtime: TrackTextRuntime): void {
	runtime.offset = 0;
	runtime.lastText = '';
	runtime.cacheKey = '';
	runtime.renderedCanvas = null;
	runtime.measuredWidth = 0;
	runtime.canvasPaddingX = 0;
	runtime.logicalCanvasWidth = 0;
	runtime.logicalCanvasHeight = 0;
}

export function createTrackTitleScope(): TrackTitleScope {
	return {
		widgetTitle: createMarqueeLineRuntime(),
		widgetArtist: createMarqueeLineRuntime(),
		overlayTitle: createTrackTextRuntime(),
		overlayTime: createTrackTextRuntime()
	};
}

/** The scope live components use when no scope is threaded to them. */
export const LIVE_TRACK_TITLE_SCOPE: TrackTitleScope = createTrackTitleScope();

export function resetTrackTitleScope(scope: TrackTitleScope): void {
	scope.widgetTitle.text = '';
	scope.widgetTitle.offset = 0;
	scope.widgetArtist.text = '';
	scope.widgetArtist.offset = 0;
	resetTrackTextRuntime(scope.overlayTitle);
	resetTrackTextRuntime(scope.overlayTime);
}
