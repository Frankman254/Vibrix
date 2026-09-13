/**
 * Export domain — pure model.
 *
 * Planning, selection and file naming: everything the app needs to *decide*
 * what an export contains, with no React and no canvas. `store/` and
 * `services/wallpaperPersistenceCoordinator` import this to merge and filter a
 * project on import/export; the editor panel imports it to price a plan
 * before anything is drawn.
 *
 * The two sibling entry points are `./ui` (the editor panel) and `./render`
 * (the offline frame renderer). Split by consumer for the reason spelled out
 * in `features/spectrum/render.ts`: the render half is canvas code that a
 * migration has no business loading.
 */

// --- What a project export contains -------------------------------------
export {
	PROJECT_EXPORT_SECTION_ORDER,
	DEFAULT_PROJECT_EXPORT_SELECTION,
	normalizeProjectExportSelection,
	isFullProjectExportSelection,
	shouldImportProjectAssetKind,
	mergeWallpaperStateForProjectImport,
	getEnabledProjectExportSectionCount,
	filterWallpaperStateForProjectExport
} from './projectExportSelection';
export type {
	ProjectExportSectionId,
	ProjectExportSelection
} from './projectExportSelection';

// --- Offline video export: the plan, not the pixels ----------------------
export {
	createOfflineExportPlan,
	resolveOfflineExportAudioAsset,
	detectBrowserOfflineExportCapabilities
} from './offlineExportPlanner';
export type {
	OfflineExportPlanState,
	OfflineExportAudioAssetRef
} from './offlineExportPlanner';
export {
	OFFLINE_EXPORT_ARCHITECTURE_VERSION,
	OFFLINE_EXPORT_FPS_OPTIONS,
	OFFLINE_EXPORT_RESOLUTION_PRESETS
} from './offlineExportTypes';
export type {
	OfflineExportFps,
	OfflineExportPlan,
	OfflineExportProfile,
	OfflineExportAudioPlan,
	OfflineExportIssue,
	OfflineExportQualityMode,
	OfflineExportContainerTarget,
	OfflineExportReadinessStatus,
	OfflineExportResolutionPresetId,
	BrowserOfflineExportCapabilities,
	OfflineRenderFrameContext
} from './offlineExportTypes';
export { createOfflineAudioAnalysisSource } from './offlineAudioAnalysis';
export type {
	OfflineAudioAnalysisSource,
	OfflineAudioAnalysisSummary,
	OfflineAudioMemoryRisk
} from './offlineAudioAnalysis';

export type { RenderSubsystem } from './renderSubsystem';
export type { RenderFrameContext } from './renderFrameContext';

// --- Naming and saving files --------------------------------------------
export {
	formatDuration,
	formatBytes,
	formatProgressLabel,
	buildDescriptiveExportFileName,
	saveBlobWithPicker,
	downloadBlobFallback
} from './exportFileUtils';
export type {
	ExportNamingState,
	SaveFileHandleLike,
	SaveFilePickerOptions
} from './exportFileUtils';
