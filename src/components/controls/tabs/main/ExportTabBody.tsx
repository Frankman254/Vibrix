import { useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/editor/DialogProvider';
import { useAudioContext } from '@/context/useAudioContext';
import { useWallpaperStore } from '@/store/wallpaperStore';
import {
	createOfflineExportPlan,
	resolveOfflineExportAudioAsset,
	getEnabledProjectExportSectionCount,
	type ExportNamingState
} from '@/features/export';
import {
	OfflineExportSection,
	OutputModeLaunchSection,
	ProjectHealthSection,
	ProjectLibrarySection,
	ProjectPackageSection,
	SettingsExportSection,
	VirtualFoldersSection,
	useProjectPackageExport,
	useSettingsExport,
	useOfflineAudioAnalysis,
	useOfflineVideoExport
} from '@/features/export/ui';
import { createOfflineBackgroundSubsystem } from '@/components/wallpaper/layers/imageCanvasOfflineSubsystem';
import { createProjectHealthReport } from '@/lib/projectHealth';
import SectionDivider from '@/ui/SectionDivider';
import { useLocalFolders } from '@/hooks/useLocalFolders';

// Presentation-owned render subsystems the export's frame loop cannot import
// on its own (see `imageCanvasOfflineSubsystem`). One instance for the app.
const OFFLINE_EXPORT_SUBSYSTEMS = [createOfflineBackgroundSubsystem()];

export default function ExportTabBody() {
	const t = useT();
	const { confirm } = useDialog();
	const { stopCapture } = useAudioContext();
	const importRef = useRef<HTMLInputElement | null>(null);
	const projectImportRef = useRef<HTMLInputElement | null>(null);

	const localFolders = useLocalFolders();
	const offlineExportState = useWallpaperStore(
		useShallow(state => ({
			activeAudioTrackId: state.activeAudioTrackId,
			activeImageId: state.activeImageId,
			activeSceneSlotId: state.activeSceneSlotId,
			defaultSceneSlotId: state.defaultSceneSlotId,
			activeSetlistId: state.activeSetlistId,
			audioSmoothing: state.audioSmoothing,
			audioFileAssetId: state.audioFileAssetId,
			audioFileName: state.audioFileName,
			audioSourceMode: state.audioSourceMode,
			audioTracks: state.audioTracks,
			audioLyricsEnabled: state.audioLyricsEnabled,
			audioTrackTitleEnabled: state.audioTrackTitleEnabled,
			backgroundImageEnabled: state.backgroundImageEnabled,
			backgroundImages: state.backgroundImages,
			globalBackgroundEnabled: state.globalBackgroundEnabled,
			globalBackgroundId: state.globalBackgroundId,
			globalBackgroundUrl: state.globalBackgroundUrl,
			imageIds: state.imageIds,
			logoEnabled: state.logoEnabled,
			logoId: state.logoId,
			logoUrl: state.logoUrl,
			logoProfileSlots: state.logoProfileSlots,
			looksProfileSlots: state.looksProfileSlots,
			lightsProfileSlots: state.lightsProfileSlots,
			cameraFxProfileSlots: state.cameraFxProfileSlots,
			cameraMotionEnabled: state.cameraMotionEnabled,
			cameraShakeEnabled: state.cameraShakeEnabled,
			overlays: state.overlays,
			particlesEnabled: state.particlesEnabled,
			particlesProfileSlots: state.particlesProfileSlots,
			performanceMode: state.performanceMode,
			fftSize: state.fftSize,
			flashLightEnabled: state.flashLightEnabled,
			rainEnabled: state.rainEnabled,
			rainProfileSlots: state.rainProfileSlots,
			sceneSlots: state.sceneSlots,
			selectedOverlayId: state.selectedOverlayId,
			setlists: state.setlists,
			slideshowEnabled: state.slideshowEnabled,
			stageLightsEnabled: state.stageLightsEnabled,
			spectrumEnabled: state.spectrumEnabled,
			spectrumProfileSlots: state.spectrumProfileSlots,
			spectrumSecondProfileSlots: state.spectrumSecondProfileSlots,
			trackTitleProfileSlots: state.trackTitleProfileSlots
		}))
	);
	const offlineExportPlan = useMemo(
		() => createOfflineExportPlan(offlineExportState),
		[offlineExportState]
	);
	const exportNamingState = useMemo<ExportNamingState>(
		() => ({
			activeAudioTrackId: offlineExportState.activeAudioTrackId,
			audioFileName: offlineExportState.audioFileName,
			audioTracks: offlineExportState.audioTracks.map(track => ({
				id: track.id,
				name: track.name,
				enabled: track.enabled
			})),
			backgroundImages: offlineExportState.backgroundImages.map(
				image => ({
					enabled: image.enabled
				})
			),
			logoEnabled: offlineExportState.logoEnabled,
			spectrumEnabled: offlineExportState.spectrumEnabled,
			particlesEnabled: offlineExportState.particlesEnabled,
			rainEnabled: offlineExportState.rainEnabled,
			overlays: offlineExportState.overlays.map(overlay => ({
				enabled: overlay.enabled
			})),
			audioLyricsEnabled: offlineExportState.audioLyricsEnabled,
			audioTrackTitleEnabled: offlineExportState.audioTrackTitleEnabled
		}),
		[offlineExportState]
	);
	const offlineAudioAsset = useMemo(
		() => resolveOfflineExportAudioAsset(offlineExportState),
		[offlineExportState]
	);
	const projectHealthReport = useMemo(
		() => createProjectHealthReport(offlineExportState),
		[offlineExportState]
	);
	const projectPackage = useProjectPackageExport({
		exportNamingState,
		confirm,
		stopCapture,
		labels: {
			dialogImportProjectTitle: t.dialog_import_project_title,
			dialogImportProjectMessage: t.dialog_import_project_message,
			importProject: t.label_import_project,
			cancel: t.label_cancel,
			statusProjectExporting: t.status_project_exporting,
			statusProjectImporting: t.status_project_importing
		}
	});
	const settings = useSettingsExport(exportNamingState);
	const offlineAnalysis = useOfflineAudioAnalysis({
		offlineAudioAsset,
		fftSize: offlineExportState.fftSize,
		audioSmoothing: offlineExportState.audioSmoothing
	});

	const videoExport = useOfflineVideoExport({
		offlineAudioAsset,
		exportNamingState,
		trackTitle: offlineAudioAsset?.name ?? '',
		fftSize: offlineExportState.fftSize,
		audioSmoothing: offlineExportState.audioSmoothing,
		extraSubsystems: OFFLINE_EXPORT_SUBSYSTEMS,
		canExport: offlineExportPlan.status !== 'blocked'
	});

	const settingsLabel = {
		idle: t.status_settings_idle,
		saved: t.status_settings_saved,
		imported: t.status_settings_imported,
		warning: t.status_settings_imported_missing_assets,
		error: t.status_settings_error
	}[settings.settingsStatus];
	const projectLabel = {
		idle: t.status_project_idle,
		saved: t.status_project_saved,
		imported: t.status_project_imported,
		warning: t.status_project_imported_missing_assets,
		error: t.status_project_error
	}[projectPackage.projectStatus];

	const offlineExportToneClass =
		offlineExportPlan.status === 'ready'
			? 'text-green-400'
			: offlineExportPlan.status === 'warning'
				? 'text-yellow-400'
				: 'text-red-400';
	const offlineExportVisibleIssues = offlineExportPlan.issues.slice(0, 8);
	const enabledProjectExportSectionCount =
		getEnabledProjectExportSectionCount(
			projectPackage.projectExportSelection
		);

	return (
		<>
			<OutputModeLaunchSection />
			<SettingsExportSection
				importRef={importRef}
				settingsStatus={settings.settingsStatus}
				settingsLabel={settingsLabel}
				settingsMessage={settings.settingsMessage}
				hintSettingsJson={t.hint_settings_json}
				hintSettingsAssets={t.hint_settings_assets}
				exportLabel={t.label_export_settings}
				importLabel={t.label_import_settings}
				onExportSettings={() => void settings.exportSettings()}
				onImportSettings={event =>
					void settings.handleImportSettings(event)
				}
			/>
			<input
				ref={projectImportRef}
				type="file"
				accept=".vibrix,.lwag,application/json"
				className="hidden"
				onChange={event =>
					void projectPackage.handleImportProject(event)
				}
			/>

			<SectionDivider label={t.section_virtual_folders} />
			<VirtualFoldersSection localFolders={localFolders} />

			<SectionDivider label={t.section_project_health} />
			<ProjectHealthSection report={projectHealthReport} />

			<SectionDivider label={t.section_project_library} />
			<ProjectLibrarySection />

			<SectionDivider label={t.section_project_package} />
			<ProjectPackageSection
				projectStatus={projectPackage.projectStatus}
				projectLabel={projectLabel}
				projectMessage={projectPackage.projectMessage}
				projectBusyMode={projectPackage.projectBusyMode}
				projectProgress={projectPackage.projectProgress}
				projectProgressLabel={projectPackage.projectProgressLabel}
				projectExportSelection={projectPackage.projectExportSelection}
				enabledProjectExportSectionCount={
					enabledProjectExportSectionCount
				}
				hintProjectPackage={t.hint_project_package}
				hintProjectPackageAudio={t.hint_project_package_audio}
				exportProjectLabel={t.label_export_project}
				importProjectLabel={t.label_import_project}
				onApplyPreset={projectPackage.applyProjectExportPreset}
				onSetSection={projectPackage.setProjectExportSection}
				onExportProject={() =>
					void projectPackage.exportProjectPackage()
				}
				onImportProject={() => projectImportRef.current?.click()}
			/>

			<SectionDivider label={t.section_offline_export} />
			<OfflineExportSection
				offlineExportPlan={offlineExportPlan}
				offlineExportVisibleIssues={offlineExportVisibleIssues}
				offlineExportToneClass={offlineExportToneClass}
				offlineAnalysisStatus={offlineAnalysis.offlineAnalysisStatus}
				offlineAnalysisMessage={offlineAnalysis.offlineAnalysisMessage}
				canAnalyzeOfflineAudio={offlineAnalysis.canAnalyzeOfflineAudio}
				onAnalyzeOfflineAudio={() =>
					void offlineAnalysis.analyzeOfflineExportAudio()
				}
				resolutionId={videoExport.resolutionId}
				onResolutionChange={videoExport.setResolutionId}
				fps={videoExport.fps}
				onFpsChange={videoExport.setFps}
				format={videoExport.format}
				formatChecked={videoExport.formatChecked}
				progress={videoExport.progress}
				error={videoExport.error}
				storageHint={videoExport.storageHint}
				savedFileName={videoExport.savedFileName}
				savedFileBytes={videoExport.savedFileBytes}
				busy={videoExport.busy}
				canStart={videoExport.canStart}
				onStartExport={() => void videoExport.startExport()}
				onCancelExport={videoExport.cancelExport}
			/>
		</>
	);
}
