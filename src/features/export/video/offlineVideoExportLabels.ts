/**
 * Status lines for the offline video export, shared by the Export panel and
 * the editor's global progress bar. Same run, same words, one place to change.
 */
import { formatBytes, formatDuration } from '@/features/export/exportFileUtils';
import type { Translations } from '@/lib/i18n';
import type {
	OfflineStorageHint,
	OfflineVideoExportError
} from '@/features/export/video/offlineVideoExportRuntime';
import type { OfflineVideoExportProgress } from '@/features/export/video/offlineVideoFormat';

export function offlineExportPhaseLabel(
	t: Translations,
	progress: OfflineVideoExportProgress
): string {
	switch (progress.phase) {
		case 'preparing':
			return t.offline_phase_preparing;
		case 'decoding':
			return t.offline_phase_decoding;
		case 'rendering': {
			const frames = t.offline_phase_rendering
				.replace('{done}', String(progress.frameIndex))
				.replace('{total}', String(progress.frameCount));
			return progress.etaMs === null
				? frames
				: `${frames} · ${t.offline_eta.replace(
						'{time}',
						formatDuration(Math.ceil(progress.etaMs / 1000))
					)}`;
		}
		case 'finalizing':
			return t.offline_phase_finalizing;
		case 'cancelled':
			return t.offline_phase_cancelled;
		default:
			return '';
	}
}

export function offlineExportErrorLabel(
	t: Translations,
	error: OfflineVideoExportError,
	storageHint: OfflineStorageHint | null
): string {
	switch (error) {
		case 'no-audio':
			return t.offline_issue_missing_file_audio;
		case 'no-encoder':
			return t.offline_error_no_encoder;
		case 'audio-not-found':
			return t.offline_error_audio_not_found;
		case 'insufficient-storage': {
			// The numbers turn "free up space" into an actionable demand.
			if (!storageHint) return t.offline_error_insufficient_storage;
			const detail = t.offline_error_insufficient_storage_detail
				.replace('{needed}', formatBytes(storageHint.neededBytes))
				.replace(
					'{free}',
					storageHint.freeBytes === null
						? t.offline_storage_free_unknown
						: formatBytes(storageHint.freeBytes)
				);
			return `${t.offline_error_insufficient_storage} ${detail}`;
		}
		default:
			return t.offline_error_failed;
	}
}

export function offlineExportSavedLabel(
	t: Translations,
	savedFileName: string,
	savedFileBytes: number | null
): string {
	return (savedFileBytes ? t.offline_done_size : t.offline_done)
		.replace('{name}', savedFileName)
		.replace('{size}', savedFileBytes ? formatBytes(savedFileBytes) : '');
}
