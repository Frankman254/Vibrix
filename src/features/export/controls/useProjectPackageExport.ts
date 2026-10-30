import { useState, type ChangeEvent } from 'react';
import {
	applyWallpaperProjectPackage,
	createWallpaperProjectPackageBlob,
	writeWallpaperProjectPackage
} from '@/services/wallpaperPersistenceCoordinator';
import {
	DEFAULT_PROJECT_EXPORT_SELECTION,
	type ProjectExportSectionId,
	type ProjectExportSelection
} from '@/features/export/projectExportSelection';
import { PROJECT_FILE_EXTENSION } from '@/lib/version';
import {
	buildDescriptiveExportFileName,
	downloadBlobFallback,
	formatProgressLabel,
	type SaveFileHandleLike,
	type SaveFilePickerOptions,
	type ExportNamingState
} from '@/features/export/exportFileUtils';

type ProjectWritableResult =
	| {
			kind: 'writer';
			writer: Awaited<ReturnType<SaveFileHandleLike['createWritable']>>;
	  }
	| { kind: 'unavailable' }
	| { kind: 'cancelled' };

async function pickProjectWritable(
	fileName: string
): Promise<ProjectWritableResult> {
	const picker = (
		window as Window & {
			showSaveFilePicker?: (
				options?: SaveFilePickerOptions
			) => Promise<SaveFileHandleLike>;
		}
	).showSaveFilePicker;
	if (!picker) return { kind: 'unavailable' };
	try {
		const handle = await picker({
			suggestedName: fileName,
			types: [
				{
					description: 'Vibrix project package',
					accept: {
						'application/x-vibrix-project': ['.vibrix']
					}
				}
			]
		});
		return { kind: 'writer', writer: await handle.createWritable() };
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			return { kind: 'cancelled' };
		}
		throw error;
	}
}

export type ProjectStatus = 'idle' | 'saved' | 'imported' | 'warning' | 'error';
export type ProjectBusyMode = 'idle' | 'exporting' | 'importing';

type ConfirmProjectImport = (options: {
	title: string;
	message: string;
	confirmLabel: string;
	cancelLabel: string;
	tone: 'warning';
}) => Promise<boolean>;

type UseProjectPackageExportArgs = {
	exportNamingState: ExportNamingState;
	labels: {
		dialogImportProjectTitle: string;
		dialogImportProjectMessage: string;
		importProject: string;
		cancel: string;
		statusProjectExporting: string;
		statusProjectImporting: string;
	};
	confirm: ConfirmProjectImport;
	stopCapture: () => void;
};

export function useProjectPackageExport({
	exportNamingState,
	labels,
	confirm,
	stopCapture
}: UseProjectPackageExportArgs) {
	const [projectStatus, setProjectStatus] = useState<ProjectStatus>('idle');
	const [projectMessage, setProjectMessage] = useState('');
	const [projectBusyMode, setProjectBusyMode] =
		useState<ProjectBusyMode>('idle');
	const [projectExportSelection, setProjectExportSelection] =
		useState<ProjectExportSelection>(DEFAULT_PROJECT_EXPORT_SELECTION);
	const [projectProgress, setProjectProgress] = useState(0);
	const [projectProgressLabel, setProjectProgressLabel] = useState('');

	async function exportProjectPackage() {
		try {
			setProjectBusyMode('exporting');
			setProjectProgress(0);
			setProjectProgressLabel(labels.statusProjectExporting);
			const fileName = buildDescriptiveExportFileName({
				kind: 'project',
				state: exportNamingState,
				selection: projectExportSelection,
				extension: PROJECT_FILE_EXTENSION
			});
			const picked = await pickProjectWritable(fileName);
			if (picked.kind === 'cancelled') return;
			if (picked.kind === 'writer') {
				try {
					await writeWallpaperProjectPackage(picked.writer, {
						selection: projectExportSelection,
						onProgress: progress => {
							setProjectProgress(progress.percent);
							setProjectProgressLabel(
								formatProgressLabel(progress)
							);
						}
					});
					await picked.writer.close();
				} catch (error) {
					await picked.writer.abort?.().catch(() => undefined);
					throw error;
				}
			} else {
				const { blob } = await createWallpaperProjectPackageBlob({
					selection: projectExportSelection,
					onProgress: progress => {
						setProjectProgress(progress.percent);
						setProjectProgressLabel(formatProgressLabel(progress));
					}
				});
				downloadBlobFallback(blob, fileName);
			}
			setProjectStatus('saved');
			setProjectMessage('');
		} catch (error) {
			setProjectStatus('error');
			setProjectMessage(
				error instanceof Error ? error.message : 'project-export-failed'
			);
		} finally {
			setProjectBusyMode('idle');
			setProjectProgress(0);
			setProjectProgressLabel('');
		}
	}

	function setProjectExportSection(
		sectionId: ProjectExportSectionId,
		value: boolean
	) {
		setProjectExportSelection(current => ({
			...current,
			[sectionId]: value
		}));
	}

	function applyProjectExportPreset(
		preset: 'all' | 'no-images' | 'spectrum-only' | 'logo-only'
	) {
		switch (preset) {
			case 'all':
				setProjectExportSelection(DEFAULT_PROJECT_EXPORT_SELECTION);
				return;
			case 'no-images':
				setProjectExportSelection({
					...DEFAULT_PROJECT_EXPORT_SELECTION,
					backgrounds: false
				});
				return;
			case 'spectrum-only':
				setProjectExportSelection({
					backgrounds: false,
					spectrum: true,
					logo: false,
					overlays: false,
					motion: false,
					looks: false,
					track: false,
					lyrics: false,
					intro: false,
					audio: false,
					editor: false
				});
				return;
			case 'logo-only':
				setProjectExportSelection({
					backgrounds: false,
					spectrum: false,
					logo: true,
					overlays: false,
					motion: false,
					looks: false,
					track: false,
					lyrics: false,
					intro: false,
					audio: false,
					editor: false
				});
		}
	}

	async function handleImportProject(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;

		const shouldImport = await confirm({
			title: labels.dialogImportProjectTitle,
			message: labels.dialogImportProjectMessage,
			confirmLabel: labels.importProject,
			cancelLabel: labels.cancel,
			tone: 'warning'
		});
		if (!shouldImport) return;

		try {
			setProjectBusyMode('importing');
			setProjectProgress(0);
			setProjectProgressLabel(labels.statusProjectImporting);
			stopCapture();
			const { missingAssets, importedAssets, expectedAssets } =
				await applyWallpaperProjectPackage(file, {
					hardReset: true,
					onProgress: progress => {
						setProjectProgress(progress.percent);
						setProjectProgressLabel(formatProgressLabel(progress));
					}
				});
			setProjectStatus(
				missingAssets || importedAssets < expectedAssets
					? 'warning'
					: 'imported'
			);
			setProjectMessage(
				importedAssets > 0
					? `${importedAssets}/${expectedAssets} assets imported`
					: ''
			);
		} catch (error) {
			setProjectStatus('error');
			setProjectMessage(
				error instanceof Error ? error.message : 'project-import-failed'
			);
		} finally {
			setProjectBusyMode('idle');
			setProjectProgress(0);
			setProjectProgressLabel('');
		}
	}

	return {
		applyProjectExportPreset,
		exportProjectPackage,
		handleImportProject,
		projectBusyMode,
		projectExportSelection,
		projectMessage,
		projectProgress,
		projectProgressLabel,
		projectStatus,
		setProjectExportSection
	};
}
