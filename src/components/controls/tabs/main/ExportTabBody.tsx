import { useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useT } from '@/lib/i18n';
import { useWindowPresentationControls } from '@/hooks/useWindowPresentationControls';
import { useDialog } from '@/editor/DialogProvider';
import { useAudioContext } from '@/context/useAudioContext';
import { useWallpaperStore } from '@/store/wallpaperStore';
import {
	createOfflineExportPlan,
	resolveOfflineExportAudioAsset,
	getEnabledProjectExportSectionCount,
	formatDuration,
	type ExportNamingState
} from '@/features/export';
import {
	OfflineExportSection,
	OutputModeLaunchSection,
	ProjectHealthSection,
	ProjectLibrarySection,
	ProjectPackageSection,
	RecordingToolsSection,
	SettingsExportSection,
	VirtualFoldersSection,
	RECORDING_FPS_OPTIONS,
	useRecordingExport,
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
	const {
		isFullscreen,
		fullscreenSupported,
		miniPlayerSupport,
		isMiniPlayerOpen,
		canExpandMiniPlayer,
		expandMiniPlayer,
		toggleFullscreen,
		toggleMiniPlayer
	} = useWindowPresentationControls();
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
			audioChannelSmoothing: state.audioChannelSmoothing,
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
	const recording = useRecordingExport(exportNamingState);
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
		audioChannelSmoothing: offlineExportState.audioChannelSmoothing
	});

	const videoExport = useOfflineVideoExport({
		offlineAudioAsset,
		exportNamingState,
		trackTitle: offlineAudioAsset?.name ?? '',
		fftSize: offlineExportState.fftSize,
		audioChannelSmoothing: offlineExportState.audioChannelSmoothing,
		extraSubsystems: OFFLINE_EXPORT_SUBSYSTEMS,
		canExport: offlineExportPlan.status !== 'blocked'
	});

	const statusLabel = {
		idle: t.status_record_idle,
		recording: `${t.status_recording} ${formatDuration(recording.elapsedSeconds)}`,
		saved: t.status_record_saved,
		error: t.status_record_error
	}[recording.status];

	const recordingErrorLabel =
		recording.errorMessage === 'capture-ended-early'
			? t.status_capture_ended_early
			: recording.errorMessage === 'screen-capture-denied'
				? t.status_screen_capture_denied
				: recording.errorMessage;

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

	const miniPlayerHint =
		miniPlayerSupport === 'document-pip'
			? t.hint_mini_player_document_pip
			: miniPlayerSupport === 'popup'
				? t.hint_mini_player_popup
				: t.hint_mini_player_unavailable;
	const offlineExportToneClass =
		offlineExportPlan.status === 'ready'
			? 'text-green-400'
			: offlineExportPlan.status === 'warning'
				? 'text-yellow-400'
				: 'text-red-400';
	const offlineExportVisibleIssues = offlineExportPlan.issues.slice(0, 6);
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
				savedFileName={videoExport.savedFileName}
				busy={videoExport.busy}
				canStart={videoExport.canStart}
				onStartExport={() => void videoExport.startExport()}
				onCancelExport={videoExport.cancelExport}
			/>

			<RecordingToolsSection
				status={recording.status}
				statusLabel={statusLabel}
				errorMessage={recordingErrorLabel}
				hintRecordPreview={t.hint_record_preview}
				hintRecordFormat={t.hint_record_format}
				sectionRecordingToolsLabel={t.section_recording_tools}
				sectionWindowToolsLabel={t.section_window_tools}
				labelWindowModes={t.label_window_modes}
				miniPlayerHint={miniPlayerHint}
				fullscreenSupported={fullscreenSupported}
				isFullscreen={isFullscreen}
				isMiniPlayerOpen={isMiniPlayerOpen}
				canExpandMiniPlayer={canExpandMiniPlayer}
				labelEnterFullscreen={t.label_enter_fullscreen}
				labelExitFullscreen={t.label_exit_fullscreen}
				labelOpenMiniPlayer={t.label_open_mini_player}
				labelCloseMiniPlayer={t.label_close_mini_player}
				labelExpandMiniPlayer={t.label_expand_mini_player}
				labelRecordFormat={t.label_record_format}
				supportedFormats={recording.supportedFormats}
				formatId={recording.formatId}
				onFormatIdChange={recording.setFormatId}
				labelRecordFps={t.label_record_fps}
				fpsOptions={RECORDING_FPS_OPTIONS}
				fps={recording.fps}
				onFpsChange={value =>
					recording.setFps(
						value as (typeof RECORDING_FPS_OPTIONS)[number]
					)
				}
				labelRecordBitrate={t.label_record_bitrate}
				bitrateMbps={recording.bitrateMbps}
				onBitrateChange={recording.setBitrateMbps}
				labelRecordAudio={t.label_record_audio}
				includeAudio={recording.includeAudio}
				onIncludeAudioChange={recording.setIncludeAudio}
				fullscreenAfterCapture={recording.fullscreenAfterCapture}
				onFullscreenAfterCaptureChange={
					recording.setFullscreenAfterCapture
				}
				labelRecordFullscreenAfter={t.label_record_fullscreen_after}
				hintRecordFullscreenAfter={t.hint_record_fullscreen_after}
				labelStartRecording={t.label_start_recording}
				labelStopRecording={t.label_stop_recording}
				hasMediaRecorder={recording.hasMediaRecorder}
				onToggleFullscreen={() => void toggleFullscreen()}
				onToggleMiniPlayer={() => void toggleMiniPlayer()}
				onExpandMiniPlayer={() => void expandMiniPlayer()}
				onStartRecording={() => void recording.startRecording()}
				onStopRecording={recording.stopRecording}
			/>
		</>
	);
}
