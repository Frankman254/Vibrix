/**
 * Offline video export — format negotiation and progress math.
 *
 * Pure on purpose: the codec probe is injected, so the preference order
 * (MP4 H.264 + AAC first, WebM as the escape hatch) is unit-tested without a
 * browser. The mediabunny wiring lives in `offlineVideoEncoder.ts`.
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

export type OfflineCodecProbe = {
	canEncodeVideo(
		codec: OfflineVideoCodecId,
		size: { width: number; height: number }
	): Promise<boolean>;
	canEncodeAudio(
		codec: OfflineAudioCodecId,
		audio: { sampleRate: number; numberOfChannels: number }
	): Promise<boolean>;
};

type ContainerCandidate = {
	container: OfflineVideoContainer;
	video: OfflineVideoCodecId[];
	audio: OfflineAudioCodecId[];
};

// MP4 is what YouTube, QuickTime and every editor accept without complaint,
// so it wins whenever the browser can encode anything that fits in it.
const CONTAINER_CANDIDATES: ContainerCandidate[] = [
	{ container: 'mp4', video: ['avc', 'hevc', 'av1'], audio: ['aac', 'opus'] },
	{
		container: 'webm',
		video: ['vp9', 'vp8', 'av1'],
		audio: ['opus', 'vorbis']
	}
];

async function firstSupported<T>(
	candidates: T[],
	probe: (candidate: T) => Promise<boolean>
): Promise<T | null> {
	for (const candidate of candidates) {
		try {
			if (await probe(candidate)) return candidate;
		} catch {
			// A probe that throws is a codec this browser cannot use.
		}
	}
	return null;
}

export async function resolveOfflineVideoFormat(
	probe: OfflineCodecProbe,
	size: { width: number; height: number },
	audio: { sampleRate: number; numberOfChannels: number } = {
		sampleRate: 44100,
		numberOfChannels: 2
	}
): Promise<OfflineVideoFormat | null> {
	for (const candidate of CONTAINER_CANDIDATES) {
		const videoCodec = await firstSupported(candidate.video, codec =>
			probe.canEncodeVideo(codec, size)
		);
		if (!videoCodec) continue;
		const audioCodec = await firstSupported(candidate.audio, codec =>
			probe.canEncodeAudio(codec, audio)
		);
		if (!audioCodec) continue;
		return {
			container: candidate.container,
			videoCodec,
			audioCodec,
			extension: candidate.container,
			mimeType: candidate.container === 'mp4' ? 'video/mp4' : 'video/webm'
		};
	}
	return null;
}

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
