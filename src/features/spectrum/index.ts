/**
 * Spectrum domain — public surface.
 *
 * The largest domain in the project (~18k LOC across 80 files). Everything
 * outside `features/spectrum/` imports from here, never from a file inside;
 * that is what lets the internals be reorganised without a repo-wide rewrite.
 *
 * See docs/architecture/ARCHITECTURE.md §3 (Ownership).
 *
 * Layout:
 *   domain/      the model: instances, targets, families, state transforms.
 *                Pure — no React, no canvas.
 *   runtime/     per-frame engine: the draw entry point, placement, profile
 *                hydration, frame effects.
 *   renderers/   one folder per family (linear, radial, oscilloscope, tunnel,
 *                liquid, orbital, spiral).
 *   geometry/    radial shape math shared by the renderers.
 *   color/       palette sampling and rotation.
 *   effects/     glow, neon, rgb-split, echo…
 *   presets/     tunnel / liquid / frame-memory / demo profile payloads.
 *   manual/      keyboard-driven spectrum (audio/max/add/manual modes) + HUD.
 *   diagnostics/ telemetry bus + HUD.
 *   controls/    the spectrum editor tab and its panels.
 *
 * This surface is deliberately the set that external callers actually use, not
 * everything the domain defines. Adding to it is a decision, not a reflex: if a
 * module is only needed inside the domain, it stays internal.
 *
 * THREE ENTRY POINTS, and the split is load-bearing, not cosmetic:
 *
 *   ./index    the model. React-free AND store-free, so `lib/`, `store/` and
 *              the migrations can use it without dragging anything else in.
 *   ./render   the canvas draw path (`drawSpectrum` + the family renderers).
 *   ./ui       the React surface (the editor tab, the HUDs).
 *
 * Both splits were forced by real failures, not taste. Exporting the editor
 * tab from here made `store/featureProfiles` pull the whole component tree into
 * its module graph and crashed 18 test suites on circular initialisation;
 * exporting `drawSpectrum` put `store/` in a cycle with itself, because the
 * renderer read render policy off the store. The store cycle is now gone (the
 * renderer takes a `SpectrumRenderPolicy` argument), but `./render` stays split
 * on weight alone — see its own header. Keep components and the renderer out of
 * this file.
 *
 * This file also owns the domain's factory defaults (`DEFAULT_SPECTRUM_STATE`).
 * `store/defaultState` spreads them into `DEFAULT_STATE`; the flow is one-way, and
 * putting it back the other way is what created the cycle in the first place.
 */

// ── domain model ────────────────────────────────────────────────────────────
export { DEFAULT_SPECTRUM_STATE } from './domain/spectrumDefaults';
export {
	SECOND_SPECTRUM_INSTANCE_ID,
	SPECTRUM_INSTANCE_SETTING_KEYS,
	convertLegacySpectrumCloneState,
	createDefaultSpectrumInstance,
	createDefaultSpectrumInstanceSettings,
	getSpectrumInstanceRuntimeKey,
	hasLegacySpectrumCloneData
} from './domain/spectrumInstanceModel';
export {
	applySpectrumTargetSettings,
	defaultSpectrumTargetSettings,
	extractSpectrumTargetSettings,
	isSpectrumSlotActiveForTarget,
	pickSpectrumInstanceSettings,
	readSlotTargetSettings,
	selectSpectrumActiveProfileIndexForTarget,
	writeSlotTargetSettings
} from './domain/spectrumTargetProfile';
export type { SpectrumProfileTarget } from './domain/spectrumTargetProfile';
export {
	buildSpectrumMacroPatch,
	normalizeSpectrumSettings
} from './domain/spectrumStateTransforms';
export {
	normalizeSpectrumFamily,
	normalizeSpectrumShape
} from './domain/spectrumControlConfig';
export {
	readPersistedSpectrumTarget,
	writePersistedSpectrumTarget
} from './domain/spectrumTargetPreference';
export { resolveSpectrumVisualAccentsCompat } from './domain/spectrumVisualAccentsCompat';
export type { SpectrumVisualAccentsCompat } from './domain/spectrumVisualAccentsCompat';
export { DEFAULT_SHOCKWAVE_BAND_THRESHOLDS } from './domain/shockwaveCalibration';

// ── runtime (model-side only; the draw path lives in ./render) ──────────────
export {
	createSpectrumRuntimeState,
	createSpectrumScope,
	resetSpectrumScope,
	LIVE_SPECTRUM_SCOPE
} from './runtime/spectrumRuntime';
export type {
	SpectrumRuntimeState,
	SpectrumScope,
	SpectrumSettings
} from './runtime/spectrumRuntime';
export {
	applySpectrumPlacementToState,
	resolveSpectrumPlacement
} from './runtime/spectrumPlacement';
export { hydrateSpectrumProfileValues } from './runtime/spectrumProfileHydrate';
export { invalidateSpectrumPresetMorph } from './runtime/spectrumPresetTransition';

// ── geometry / color ────────────────────────────────────────────────────────
export {
	MAX_LOGO_FIT_INFLATION,
	RADIAL_SHAPE_IDS
} from './geometry/radialGeometry';
export {
	getRotateRgbPhase,
	sampleWrappedPaletteColor
} from './color/spectrumColor';

// ── presets ─────────────────────────────────────────────────────────────────
export { buildSpectrumTunnelPresetPatch } from './presets/spectrumTunnelPresets';
export { buildSpectrumLiquidPresetPatch } from './presets/spectrumLiquidPresets';
export { buildSpectrumFrameMemoryPresetPatch } from './presets/spectrumFrameMemoryPresets';
export type {
	SpectrumFrameMemoryPresetId,
	SpectrumFrameMemoryTarget
} from './presets/spectrumFrameMemoryPresets';
export {
	DEFAULT_SPECTRUM_LIQUID_LAYERS,
	getSpectrumLiquidLayerFieldKey,
	getSpectrumLiquidLayerPixelateFieldKey,
	getSpectrumLiquidLayerRigidShapeFieldKey,
	getSpectrumLiquidLayerShapeFieldKey
} from './presets/spectrumLiquidLayers';
export type { SpectrumLiquidLayerParamKey } from './presets/spectrumLiquidLayers';
export {
	SPECTRUM_PROFILE_ECHO_SPARKS,
	SPECTRUM_PROFILE_NEON_GLITCH,
	SPECTRUM_VISUAL_ACCENTS_DEMO_PROFILE_SLOTS
} from './presets/spectrumVisualAccentsDemoProfiles';

// ── diagnostics (telemetry only — the HUD is React, see ./ui) ───────────────
export {
	clearSpectrumDiagnosticsClone,
	clearSpectrumDiagnosticsPrimary
} from './diagnostics/spectrumDiagnosticsTelemetry';
