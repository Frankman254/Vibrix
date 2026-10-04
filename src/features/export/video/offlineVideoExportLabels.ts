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
import type { OfflineVideoEncoderPlan } from '@/features/export/video/offlineEncoderNegotiation';
import { platformName } from '@/lib/env/platform';

/** Codec families as people name them, not as WebCodecs spells them. */
const CODEC_NAMES: Record<string, string> = {
	avc: 'H.264',
	hevc: 'H.265',
	vp9: 'VP9',
	vp8: 'VP8',
	av1: 'AV1'
};

function megabits(bitsPerSecond: number): string {
	const mbps = bitsPerSecond / 1_000_000;
	const rounded = mbps >= 10 ? Math.round(mbps) : Math.round(mbps * 10) / 10;
	return `${rounded} Mbps`;
}

/**
 * The exact configuration the export will use, in one line:
 * `Windows 11 · H.264 High 5.1 · 2560×1440 · 60 FPS · Hardware acceleration ·
 * 24 Mbps`.
 *
 * Built from the negotiated plan, never from the resolution controls, so the
 * panel cannot advertise a config the encoder is not running. `platformLabel`
 * is the refined display name when the browser gave one away (Windows 11 vs
 * Windows 10); it falls back to the coarse platform the negotiation used.
 */
export function offlineEncoderSummary(
	t: Translations,
	plan: OfflineVideoEncoderPlan,
	platformLabel?: string
): string {
	const codec = CODEC_NAMES[plan.video.videoCodec] ?? plan.video.videoCodec;
	return [
		platformLabel || platformName(plan.platform),
		`${codec} ${plan.video.profileLabel}`,
		`${plan.width}\u00d7${plan.height}`,
		`${plan.fps} FPS`,
		plan.video.hardwareAcceleration === 'prefer-hardware'
			? t.offline_encoder_hardware
			: t.offline_encoder_software,
		megabits(plan.video.bitrate)
	]
		.filter(Boolean)
		.join(' \u00b7 ');
}

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
