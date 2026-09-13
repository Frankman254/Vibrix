/**
 * Background domain — canvas draw path.
 *
 * A third entry point alongside `./index` (pure model) and `./ui` (React),
 * split by consumer like `features/spectrum/render.ts`: `./index` is imported
 * by `store/`, and the canvas post-processing below has no business in that
 * graph. The live global-background view and the offline exporter import this.
 */
export {
	drawGlobalBackgroundFrame,
	hasAnimatedGlobalBackgroundFilter,
	resolveGlobalBackgroundDrawPlan
} from './globalBackgroundDraw';
export type {
	GlobalBackgroundDrawPlan,
	GlobalBackgroundDrawSettings
} from './globalBackgroundDraw';
