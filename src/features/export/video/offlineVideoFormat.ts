/**
 * Offline video export — container/codec vocabulary, progress math and the
 * quality bitrate table.
 *
 * Which codec an export actually uses is negotiated in
 * `offlineEncoderNegotiation.ts` (platform-ordered candidates, every one of
 * them confirmed by `VideoEncoder.isConfigSupported()`); the mediabunny
 * wiring lives in `offlineVideoEncoder.ts`. This module stays pure.
 */

export type OfflineVideoContainer = 'mp4' | 'webm';
export type OfflineVideoCodecId = 'avc' | 'hevc' | 'vp9' | 'vp8' | 'av1';
export type OfflineAudioCodecId = 'aac' | 'opus' | 'vorbis';

export type OfflineVideoFormat = {
	container: OfflineVideoContainer;
	videoCodec: OfflineVideoCodecId;
	audioCodec: OfflineAudioCodecId;
	extension: 'mp4' | 'webm';
	mimeType: 'video/mp4' | 'video/webm';
};

export type OfflineVideoExportPhase =
	| 'idle'
	| 'preparing'
	| 'decoding'
	| 'rendering'
	| 'finalizing'
	| 'done'
	| 'cancelled'
	| 'error';

export type OfflineVideoExportProgress = {
	phase: OfflineVideoExportPhase;
	frameIndex: number;
	frameCount: number;
	/** 0..1 across the whole export, not only the frame loop. */
	ratio: number;
	elapsedMs: number;
	etaMs: number | null;
};

export function computeOfflineFrameCount(
	durationMs: number,
	fps: number
): number {
	if (!Number.isFinite(durationMs) || durationMs <= 0 || fps <= 0) return 0;
	return Math.max(1, Math.ceil((durationMs / 1000) * fps));
}

// Decoding is a short burst up front and finalizing a short burst at the end;
// the frame loop is where the time goes, so it owns most of the bar.
const PHASE_WEIGHTS = { before: 0.05, frames: 0.93 } as const;

export function computeOfflineExportRatio(
	phase: OfflineVideoExportPhase,
	frameIndex: number,
	frameCount: number
): number {
	switch (phase) {
		case 'idle':
		case 'preparing':
			return 0;
		case 'decoding':
			return PHASE_WEIGHTS.before / 2;
		case 'rendering': {
			const frames =
				frameCount > 0 ? Math.min(1, frameIndex / frameCount) : 0;
			return PHASE_WEIGHTS.before + frames * PHASE_WEIGHTS.frames;
		}
		case 'finalizing':
			return PHASE_WEIGHTS.before + PHASE_WEIGHTS.frames;
		case 'done':
			return 1;
		default:
			return 0;
	}
}

/**
 * Remaining time from the frame loop's own pace. Null until enough frames
 * have gone by for the estimate to mean something.
 */
export function estimateOfflineExportEtaMs(
	renderElapsedMs: number,
	framesDone: number,
	frameCount: number
): number | null {
	if (framesDone < 10 || renderElapsedMs <= 0 || frameCount <= 0) {
		return null;
	}
	const perFrame = renderElapsedMs / framesDone;
	return Math.max(0, Math.round(perFrame * (frameCount - framesDone)));
}

/**
 * The encoder's video target bitrate (bps) for a preset: 28 Mbps at 1080p30,
 * ×1.5 for 60 fps (motion needs headroom but not a doubling), ×2 for 120 fps
 * (each doubling of the frame rate buys less temporal redundancy to exploit,
 * so the multiplier grows sub-linearly), and pixels^0.8 across resolutions
 * (bigger frames need fewer bits per pixel). 1080p60 lands at 42 Mbps, a
 * little above the ~37 Mbps `QUALITY_HIGH` exports that looked right; the 24
 * Mbps tier before it smeared particles and neon edges. One source of truth:
 * the encoder encodes at exactly this rate and the size estimate below uses
 * it, so the "does it fit?" gate cannot drift from what the file will cost.
 */
export function recommendedVideoBitrateFor(options: {
	width: number;
	height: number;
	fps: number;
	/**
	 * The quality rung, 1 = the table above. Resolution decides how many
	 * pixels; this decides how many bits those pixels get, and the two are
	 * deliberately separate controls — a 1440p ultrawide wallpaper is still a
	 * 1440p ultrawide wallpaper at half the bitrate.
	 */
	qualityScale?: number;
}): number {
	const pixelScale = (options.width * options.height) / (1920 * 1080);
	const fpsScale = options.fps >= 120 ? 2 : options.fps >= 60 ? 1.5 : 1;
	const quality =
		typeof options.qualityScale === 'number' && options.qualityScale > 0
			? options.qualityScale
			: 1;
	const bitrate = 28_000_000 * Math.pow(pixelScale, 0.8) * fpsScale * quality;
	return Math.round(bitrate / 100_000) * 100_000;
}

/**
 * Rough size of the finished file, for the "does it fit?" check before an
 * export starts. Video comes from the encoder's own target bitrate; audio is
 * small but kept generous (256 kbps). Over-estimating only costs a pre-flight
 * warning — under-estimating means a crash mid-write.
 */
export function estimateOfflineVideoBytes(options: {
	width: number;
	height: number;
	fps: number;
	durationSec: number;
	/**
	 * The negotiated encoder bitrate, when one is known. Encoder negotiation
	 * may settle on a lower rung than the table asks for (a hardware encoder
	 * that refuses the top rate still takes a lower one), and the storage
	 * check has to reserve what the file will really cost, not what the
	 * quality table wanted.
	 */
	videoBitsPerSecond?: number;
}): number {
	const videoBitsPerSecond =
		options.videoBitsPerSecond ?? recommendedVideoBitrateFor(options);
	const audioBitsPerSecond = 256_000;
	return Math.ceil(
		((videoBitsPerSecond + audioBitsPerSecond) / 8) * options.durationSec
	);
}
