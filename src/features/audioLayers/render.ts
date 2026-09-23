/**
 * Audio overlay layers — canvas draw path.
 *
 * Everything the wallpaper paints *on top of* the background in reaction to
 * audio: the track title, the Now Playing widget, and the registry that maps
 * a layer id to whoever draws it. Roughly 2.2k LOC of pure canvas code.
 *
 * It used to live in `components/audio/`, which made it presentation by
 * filing rather than by nature — only one file there was ever React. The
 * damage was not cosmetic: the offline exporter has to draw these same layers
 * into an offscreen canvas, so `features/export` was importing UP into
 * `components/`, the one direction the contract forbids. Two of the last
 * three debt edges in the repo were exactly that.
 *
 * There is only a `./render` entry point and no `./index`, because this domain
 * has no pure model yet: its settings live in `WallpaperState` and its
 * geometry in `lib/canvas`. If model logic appears, add `index.ts` and keep
 * the canvas out of it.
 *
 * The React half stays behind on purpose: `components/audio/layers/
 * AudioLayerCanvas.tsx` owns the <canvas>, the render loop and the hooks that
 * feed it. A domain owns the drawing, not the mounting.
 */
export {
	renderAudioLayerFrame,
	createAudioLayerFrameRenderState
} from './render/audioLayerFrameRenderer';
export type {
	RenderableAudioLayer,
	AudioLayerFrameRenderState,
	AudioLayerFrameRenderInput
} from './render/audioLayerFrameRenderer';
export { drawOverlayLayer } from './render/overlayLayerRegistry';
export type { OverlayRenderContext } from './render/overlayLayerRegistry';
export { drawTrackTitleOverlay } from './render/trackTitleOverlay';
export { drawNowPlayingWidget } from './render/nowPlayingWidget';
export type {
	NowPlayingData,
	NowPlayingWidgetSettings
} from './render/nowPlayingWidget';
export {
	createTrackTitleScope,
	resetTrackTitleScope,
	LIVE_TRACK_TITLE_SCOPE
} from './render/trackTitleScope';
export type { TrackTitleScope } from './render/trackTitleScope';
export { getCoverImage, clearCoverImageCache } from './render/coverImageCache';
