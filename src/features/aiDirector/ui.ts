/**
 * AI Director — React surface.
 *
 * Kept apart from `./index` so the store slice and the migrations can reach
 * the intent model without pulling the editor component tree in behind it.
 * `SceneTab` composes these; the tab shell stays in `tabs/main/`.
 */
export { default as AiDirectorPanel } from './controls/AiDirectorPanel';
export { default as AiBatchPanel } from './controls/AiBatchPanel';
export { default as AiIntentEditor } from './controls/AiIntentEditor';
export { default as AiProviderStatusPanel } from './controls/AiProviderStatusPanel';
