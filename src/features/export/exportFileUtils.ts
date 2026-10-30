import type { ProjectPackageProgress } from '@/services/wallpaperPersistenceCoordinator';
import type { ProjectExportSelection } from '@/features/export/projectExportSelection';

export type SavePickerAcceptMap = Record<string, string[]>;

export type SaveFilePickerOptions = {
	suggestedName?: string;
	types?: Array<{
		description?: string;
		accept: SavePickerAcceptMap;
	}>;
};

export type SaveFileHandleLike = {
	createWritable: () => Promise<{
		write: (data: Blob) => Promise<void>;
		close: () => Promise<void>;
		abort?: () => Promise<void>;
	}>;
};

export type ExportNamingState = {
	activeAudioTrackId: string | null;
	audioFileName: string;
	audioTracks: Array<{ id: string; name: string; enabled: boolean }>;
	backgroundImages: Array<{ enabled: boolean }>;
	logoEnabled: boolean;
	spectrumEnabled: boolean;
	particlesEnabled: boolean;
	rainEnabled: boolean;
	overlays: Array<{ enabled: boolean }>;
	audioLyricsEnabled: boolean;
	audioTrackTitleEnabled: boolean;
};

export function formatDuration(totalSeconds: number): string {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatProgressLabel(progress: ProjectPackageProgress): string {
	return `${Math.round(progress.percent * 100)}% · ${progress.message}`;
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${Math.round(bytes / 1024)} KB`;
}

function sanitizeFileNameSegment(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\.[a-z0-9]+$/i, '')
		.replace(/[^a-z0-9]+/gi, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase();
}

function buildExportStamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

function resolvePrimaryTrackLabel(state: ExportNamingState): string {
	const activeTrack = state.audioTracks.find(
		track => track.id === state.activeAudioTrackId
	);
	const candidate = activeTrack?.name || state.audioFileName || 'untitled';
	return sanitizeFileNameSegment(candidate) || 'untitled';
}

function buildVisualTagList(
	state: ExportNamingState,
	options?: {
		selection?: ProjectExportSelection;
	}
): string[] {
	const selection = options?.selection;
	const tags: string[] = [];
	const backgroundsEnabled =
		selection?.backgrounds ?? state.backgroundImages.length > 0;
	const enabledBackgrounds = state.backgroundImages.filter(
		image => image.enabled
	).length;
	const overlaysEnabled =
		selection?.overlays ?? state.overlays.some(overlay => overlay.enabled);
	const enabledOverlays = state.overlays.filter(
		overlay => overlay.enabled
	).length;

	if (backgroundsEnabled && enabledBackgrounds > 0) {
		tags.push(enabledBackgrounds > 1 ? `bg${enabledBackgrounds}` : 'bg');
	}
	if (
		(selection?.spectrum ?? state.spectrumEnabled) &&
		state.spectrumEnabled
	) {
		tags.push('spectrum');
	}
	if ((selection?.logo ?? state.logoEnabled) && state.logoEnabled) {
		tags.push('logo');
	}
	if (
		(selection?.motion ?? state.particlesEnabled) &&
		state.particlesEnabled
	) {
		tags.push('particles');
	}
	if ((selection?.motion ?? state.rainEnabled) && state.rainEnabled) {
		tags.push('rain');
	}
	if (overlaysEnabled && enabledOverlays > 0) {
		tags.push(enabledOverlays > 1 ? `ov${enabledOverlays}` : 'overlay');
	}
	if (
		(selection?.track ?? state.audioTrackTitleEnabled) &&
		state.audioTrackTitleEnabled
	) {
		tags.push('track-info');
	}
	if (
		(selection?.lyrics ?? state.audioLyricsEnabled) &&
		state.audioLyricsEnabled
	) {
		tags.push('lyrics');
	}
	if (
		selection?.audio ??
		Boolean(state.audioFileName || state.audioTracks.length > 0)
	) {
		tags.push('audio');
	}

	return tags.length > 0 ? tags : ['visual'];
}

export function buildDescriptiveExportFileName(options: {
	kind: 'recording' | 'settings' | 'project';
	state: ExportNamingState;
	extension: string;
	selection?: ProjectExportSelection;
	fps?: string;
}): string {
	const baseTrack = resolvePrimaryTrackLabel(options.state);
	const tags = buildVisualTagList(options.state, {
		selection: options.selection
	}).slice(0, 4);
	const modeTag =
		options.kind === 'project'
			? 'project'
			: options.kind === 'settings'
				? 'settings'
				: options.fps
					? `${options.fps}fps`
					: 'capture';
	const sections = [baseTrack, ...tags, modeTag].filter(Boolean);
	return `${sections.join('_')}_${buildExportStamp()}.${options.extension}`;
}

export async function saveBlobWithPicker(
	blob: Blob,
	fileName: string,
	options?: {
		description?: string;
		mimeType?: string;
	}
): Promise<boolean> {
	const picker = (
		window as Window & {
			showSaveFilePicker?: (
				options?: SaveFilePickerOptions
			) => Promise<SaveFileHandleLike>;
		}
	).showSaveFilePicker;

	if (!picker) {
		return false;
	}

	try {
		const extension = fileName.includes('.')
			? `.${fileName.split('.').pop()!.toLowerCase()}`
			: '';
		const handle = await picker({
			suggestedName: fileName,
			types:
				extension && options?.mimeType
					? [
							{
								description:
									options.description ?? 'Exported file',
								accept: {
									[options.mimeType]: [extension]
								}
							}
						]
					: undefined
		});
		const writable = await handle.createWritable();
		await writable.write(blob);
		await writable.close();
		return true;
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			return true;
		}
		throw error;
	}
}

export function downloadBlobFallback(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
