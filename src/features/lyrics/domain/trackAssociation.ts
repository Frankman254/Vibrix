import type { AudioPlaylistTrack, WallpaperState } from '@/types/wallpaper';
import type { LyrixaLyricsBundleEnvelope } from './lyrixaBundleTypes';
import type { AudioLyricsTrackEntry, LyricsTrackReference } from './types';

const DURATION_TOLERANCE_MS = 2_000;

function normalizedTrackName(value: string): string {
	return value
		.trim()
		.toLocaleLowerCase()
		.replace(/\.[a-z0-9]{2,5}$/i, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

export function createLyricsTrackReference(
	track: Pick<AudioPlaylistTrack, 'name' | 'fileKey' | 'durationMs'>
): LyricsTrackReference {
	return {
		name: track.name,
		...(track.fileKey ? { fileKey: track.fileKey } : {}),
		...(track.durationMs && track.durationMs > 0
			? { durationMs: track.durationMs }
			: {})
	};
}

function referenceMatchesTrack(
	reference: LyricsTrackReference,
	track: Pick<AudioPlaylistTrack, 'name' | 'fileKey' | 'durationMs'>
): boolean {
	if (reference.fileKey && track.fileKey) {
		return reference.fileKey === track.fileKey;
	}
	if (
		normalizedTrackName(reference.name) !== normalizedTrackName(track.name)
	) {
		return false;
	}
	if (!reference.durationMs || !track.durationMs) return true;
	return (
		Math.abs(reference.durationMs - track.durationMs) <=
		DURATION_TOLERANCE_MS
	);
}

/** Resolve a direct binding first, then reconnect an audio file re-imported
 * under a new asset id using the lightweight identity carried by its lyrics. */
export function resolveAudioLyricsEntry(
	state: Pick<WallpaperState, 'audioTracks' | 'audioLyricsByTrackAssetId'>,
	assetId: string | null
): AudioLyricsTrackEntry | undefined {
	const binding = resolveAudioLyricsBinding(state, assetId);
	return binding?.entry;
}

export function resolveAudioLyricsBinding(
	state: Pick<WallpaperState, 'audioTracks' | 'audioLyricsByTrackAssetId'>,
	assetId: string | null
): { assetId: string; entry: AudioLyricsTrackEntry } | undefined {
	if (!assetId) return undefined;
	const direct = state.audioLyricsByTrackAssetId[assetId];
	if (direct) return { assetId, entry: direct };
	const track = state.audioTracks.find(item => item.assetId === assetId);
	if (!track) return undefined;
	for (const [boundAssetId, entry] of Object.entries(
		state.audioLyricsByTrackAssetId
	)) {
		if (
			entry.targetTrack &&
			referenceMatchesTrack(entry.targetTrack, track)
		) {
			return { assetId: boundAssetId, entry };
		}
	}
	return undefined;
}

export function resolveLyricsDurationMs(
	bundle: LyrixaLyricsBundleEnvelope | null | undefined
): number | null {
	const sourceDuration = bundle?.sourceTrack?.durationMs;
	if (sourceDuration && sourceDuration > 0) return sourceDuration;
	let lastClipEndMs = 0;
	for (const clip of bundle?.project.clips ?? []) {
		if (Number.isFinite(clip.endTime)) {
			lastClipEndMs = Math.max(lastClipEndMs, clip.endTime * 1_000);
		}
	}
	return lastClipEndMs > 0 ? lastClipEndMs : null;
}

export type LyricsDurationMismatch = {
	trackDurationMs: number;
	lyricsDurationMs: number;
	differenceMs: number;
};

export function compareLyricsTrackDuration(
	trackDurationMs: number | null | undefined,
	bundle: LyrixaLyricsBundleEnvelope | null | undefined
): LyricsDurationMismatch | null {
	if (!trackDurationMs || trackDurationMs <= 0) return null;
	const lyricsDurationMs = resolveLyricsDurationMs(bundle);
	if (!lyricsDurationMs) return null;
	const differenceMs = Math.abs(trackDurationMs - lyricsDurationMs);
	const toleranceMs = Math.max(DURATION_TOLERANCE_MS, trackDurationMs * 0.01);
	return differenceMs > toleranceMs
		? { trackDurationMs, lyricsDurationMs, differenceMs }
		: null;
}
