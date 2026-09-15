/**
 * Logo domain — public surface.
 *
 * Everything outside `features/logo/` imports from here, never from a file
 * inside. That keeps the internal layout free to change: move a renderer,
 * split a module, rename a helper — as long as this facade still exports the
 * same names, nothing else in the repo needs to know.
 *
 * See docs/architecture/ARCHITECTURE.md §3 (Ownership).
 *
 * Layout:
 *   domain/       position grid math — pure, no React, no store
 *   runtime/      per-frame canvas 2D renderer + its module state
 *   presets/      quick profiles
 *   diagnostics/  telemetry bus + the HUD that reads it
 *   controls/     the logo's own editor UI (exported from `./ui`, not here)
 *
 * Fully migrated: the editor tab moved in once the shared chrome was extracted
 * to `@/editor`. `store/slices/logoSlice.ts` stays in `store/` by design (§2).
 *
 * NOTE — React-free on purpose; the component surface is `./ui`. See the same
 * note in `features/spectrum/index.ts` for why that split exists.
 */

// ── domain ──────────────────────────────────────────────────────────────────
export {
	LOGO_GRID_SHORT_DIVISIONS,
	LOGO_POSITION_NUDGE_STEP,
	LOGO_POSITION_CENTER,
	nudgeLogoAxis,
	nudgeLogoPosition,
	resolveLogoGridDims,
	cellToLogoPosition,
	logoPositionToCell
} from './domain/logoPositionGrid';
export type {
	LogoGridDims,
	LogoGridCell,
	LogoNudgeDirection
} from './domain/logoPositionGrid';
export {
	lowMassBoxToLogoPosition,
	logoBoxSizeForViewport,
	spectrumAnnulusInImageSpace
} from './domain/autoLogoPlacement';

// ── runtime ─────────────────────────────────────────────────────────────────
export {
	drawLogo,
	getSmoothedAmplitude,
	getCachedLogoImage,
	getLogoRotation,
	getLogoRenderState,
	resetLogo,
	resetLogoRotation
} from './runtime/ReactiveLogo';
export {
	createLogoScope,
	resetLogoScope,
	LIVE_LOGO_SCOPE
} from './runtime/logoScope';
export type { LogoScope } from './runtime/logoScope';

// ── presets ─────────────────────────────────────────────────────────────────
export { LOGO_QUICK_PROFILES } from './presets/logoProfiles';
export type { LogoQuickProfile } from './presets/logoProfiles';

// ── diagnostics ─────────────────────────────────────────────────────────────
export {
	publishLogoDiagnosticsTelemetry,
	resetLogoDiagnosticsTelemetry,
	subscribeLogoDiagnosticsTelemetry,
	getLogoDiagnosticsSnapshot
} from './diagnostics/logoDiagnosticsTelemetry';
export type { LogoDiagnosticsSnapshot } from './diagnostics/logoDiagnosticsTelemetry';
