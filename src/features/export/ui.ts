/**
 * Export domain — React surface.
 *
 * The seven panels of the Export tab plus the four hooks that drive them.
 * Only `tabs/main/ExportTabBody` consumes this: that shell composes the
 * sections and owns the tab's layout, which is editor furniture, while
 * everything it stacks now belongs to the domain.
 *
 * Kept apart from `./index` so that the store, the migrations and the
 * persistence coordinator can reach the export model without pulling the
 * editor component tree into their module graph.
 */
export { default as OfflineExportSection } from './controls/OfflineExportSection';
export { default as OutputModeLaunchSection } from './controls/OutputModeLaunchSection';
export { default as ProjectHealthSection } from './controls/ProjectHealthSection';
export { default as ProjectLibrarySection } from './controls/ProjectLibrarySection';
export { default as ProjectPackageSection } from './controls/ProjectPackageSection';
export { default as SettingsExportSection } from './controls/SettingsExportSection';
export { default as VirtualFoldersSection } from './controls/VirtualFoldersSection';
export { default as VibrixAuthoringSection } from './controls/VibrixAuthoringSection';

export { useProjectPackageExport } from './controls/useProjectPackageExport';
export type {
	ProjectStatus,
	ProjectBusyMode
} from './controls/useProjectPackageExport';
export { useSettingsExport } from './controls/useSettingsExport';
export type { SettingsStatus } from './controls/useSettingsExport';
export { useOfflineAudioAnalysis } from './controls/useOfflineAudioAnalysis';
export type { OfflineAnalysisStatus } from './controls/useOfflineAudioAnalysis';
export { useOfflineVideoExport } from './controls/useOfflineVideoExport';
export type { OfflineVideoExportError } from './controls/useOfflineVideoExport';
