/**
 * Background domain — React surface.
 *
 * Split from `./index` for the reason documented in
 * `features/spectrum/index.ts`: model consumers (`store/`, the canvas layers,
 * migrations) must be able to reach the framing math without pulling the editor
 * component tree into their module graph.
 */
export { default as BackgroundTab } from './controls/BackgroundTab';
export { BackgroundViewTabs } from './controls/backgroundViewTabs';
export {
	readPersistedBgView,
	writePersistedBgView
} from './controls/backgroundViewState';
export type { BgView } from './controls/backgroundViewState';
export { default as SlideshowManager } from './slideshow/SlideshowManager';

export { default as SlideshowHudControls } from './controls/SlideshowHudControls';
