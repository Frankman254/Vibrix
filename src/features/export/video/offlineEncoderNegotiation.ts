/**
 * Offline video export — encoder negotiation.
 *
 * The export used to pick a codec *family* ("avc") and let the muxer invent a
 * profile, level and rate control on the first frame. That works on macOS and
 * fails on Windows: the pre-flight probe ran without a frame rate, the real
 * encoder config carried one, and a 1440p60 stream at the quality bitrate
 * landed outside what the Media Foundation H.264 encoder accepts — so the
 * export died several minutes in, with frames already rendered.
 *
 * So: the platform only *orders* the candidates (Windows wants H.264 first,
 * macOS may also have HEVC, WebM is everyone's escape hatch), and the choice
 * itself is always made by `VideoEncoder.isConfigSupported()` on the exact
 * config the encoder will later be handed — same codec string, same bitrate,
 * same frame rate, same hardware hint. Nothing assumes a codec exists because
 * of the operating system, and no frame is rendered until one config passed.
 *
 * Pure on purpose: the probe is injected, so the whole priority ladder is
 * unit-tested without a browser. The WebCodecs probe lives in
 * `offlineVideoEncoder.ts`.
 */
import {
	detectRuntimePlatform,
	type RuntimePlatform
} from '@/lib/env/platform';
import {
	avcCodecCandidates,
	hevcCodecCandidates,
	vp9CodecCandidates,
	type AvcCodecChoice
} from './videoCodecStrings';
import {
	recommendedVideoBitrateFor,
	type OfflineAudioCodecId,
	type OfflineVideoContainer,
	type OfflineVideoFormat,
	type OfflineVideoCodecId
} from './offlineVideoFormat';

export type HardwareAccelerationHint = 'prefer-hardware' | 'prefer-software';

export type VideoEncoderCandidate = {
	container: OfflineVideoContainer;
	videoCodec: OfflineVideoCodecId;
	/** The full WebCodecs codec string, e.g. `avc1.640033`. */
	codecString: string;
	/** Human profile+level, e.g. `High 5.1`, for the diagnostics line. */
	profileLabel: string;
	bitrate: number;
	hardwareAcceleration: HardwareAccelerationHint;
};

export type VideoProbeSize = {
	width: number;
	height: number;
	fps: number;
	/** The chosen quality rung; 1 (or omitted) is the full quality table. */
	qualityScale?: number;
};

export type OfflineEncoderProbe = {
	canEncodeVideo(
		candidate: VideoEncoderCandidate,
		size: VideoProbeSize
	): Promise<boolean>;
	canEncodeAudio(
		codec: OfflineAudioCodecId,
		audio: { sampleRate: number; numberOfChannels: number }
	): Promise<boolean>;
};

/**
 * The negotiated result: everything the encoder needs, and everything the
 * diagnostics line shows. One object so the panel cannot describe a config
 * the encoder is not using.
 */
export type OfflineVideoEncoderPlan = {
	format: OfflineVideoFormat;
	video: VideoEncoderCandidate;
	platform: RuntimePlatform;
	width: number;
	height: number;
	fps: number;
};

type CodecFamily = 'avc' | 'hevc' | 'vp9';

type CodecTier = {
	family: CodecFamily;
	acceleration: HardwareAccelerationHint;
};

/**
 * Candidate order per platform. A *preference*, never a claim of support:
 * every tier below still has to pass the probe, and a platform we cannot
 * identify simply gets the conservative H.264-then-WebM order.
 *
 * - Windows: Media Foundation exposes H.264 on effectively every GPU, so
 *   hardware AVC first, software AVC next; HEVC exists on some Intel/NVIDIA
 *   parts and only matters after that.
 * - macOS: VideoToolbox gives hardware AVC and, on Apple silicon, hardware
 *   HEVC — worth trying before dropping to software AVC.
 * - Linux: VA-API hardware H.264 when the browser exposes it at all, then
 *   software H.264, with VP9/WebM as a real secondary format rather than a
 *   last resort.
 */
const PLATFORM_TIERS: Record<RuntimePlatform, CodecTier[]> = {
	windows: [
		{ family: 'avc', acceleration: 'prefer-hardware' },
		{ family: 'avc', acceleration: 'prefer-software' },
		{ family: 'hevc', acceleration: 'prefer-hardware' },
		{ family: 'vp9', acceleration: 'prefer-hardware' },
		{ family: 'vp9', acceleration: 'prefer-software' }
	],
	macos: [
		{ family: 'avc', acceleration: 'prefer-hardware' },
		{ family: 'hevc', acceleration: 'prefer-hardware' },
		{ family: 'avc', acceleration: 'prefer-software' },
		{ family: 'vp9', acceleration: 'prefer-software' }
	],
	linux: [
		{ family: 'avc', acceleration: 'prefer-hardware' },
		{ family: 'avc', acceleration: 'prefer-software' },
		{ family: 'vp9', acceleration: 'prefer-hardware' },
		{ family: 'vp9', acceleration: 'prefer-software' }
	],
	other: [
		{ family: 'avc', acceleration: 'prefer-hardware' },
		{ family: 'avc', acceleration: 'prefer-software' },
		{ family: 'vp9', acceleration: 'prefer-hardware' },
		{ family: 'vp9', acceleration: 'prefer-software' }
	]
};

const FAMILY_SPEC: Record<
	CodecFamily,
	{
		container: OfflineVideoContainer;
		videoCodec: OfflineVideoCodecId;
		strings: (size: VideoProbeSize) => AvcCodecChoice[];
	}
> = {
	avc: {
		container: 'mp4',
		videoCodec: 'avc',
		strings: avcCodecCandidates
	},
	hevc: {
		container: 'mp4',
		videoCodec: 'hevc',
		strings: hevcCodecCandidates
	},
	vp9: {
		container: 'webm',
		videoCodec: 'vp9',
		strings: vp9CodecCandidates
	}
};

/**
 * Bitrate ladder around the quality target. The first rung is the bitrate the
 * export actually wants (see `recommendedVideoBitrateFor`); the lower rungs
 * exist because a hardware encoder that refuses 63 Mbps will often take 44,
 * and a slightly softer file beats a failed export. Never below the floor —
 * at that point the WebM tier is the better trade.
 */
const BITRATE_SCALES = [1, 0.7, 0.5] as const;
const MIN_BITRATE = 8_000_000;

function bitrateLadder(size: VideoProbeSize): number[] {
	const target = recommendedVideoBitrateFor(size);
	// The floor is a guard against a degenerate ladder, not a quality policy:
	// a deliberately low rung may legitimately sit under it.
	const floor = Math.min(MIN_BITRATE, target);
	const rungs = BITRATE_SCALES.map(scale =>
		Math.max(floor, Math.round((target * scale) / 100_000) * 100_000)
	);
	return [...new Set(rungs)];
}

/**
 * Every candidate config to try, best first. Exported so a test (and the
 * diagnostics UI, if it ever wants to list them) sees the same ladder the
 * negotiation walks.
 */
export function buildVideoEncoderCandidates(options: {
	platform: RuntimePlatform;
	width: number;
	height: number;
	fps: number;
	qualityScale?: number;
}): VideoEncoderCandidate[] {
	const size = {
		width: options.width,
		height: options.height,
		fps: options.fps,
		qualityScale: options.qualityScale
	};
	const bitrates = bitrateLadder(size);
	const candidates: VideoEncoderCandidate[] = [];
	const seen = new Set<string>();
	for (const tier of PLATFORM_TIERS[options.platform]) {
		const spec = FAMILY_SPEC[tier.family];
		for (const choice of spec.strings(size)) {
			for (const bitrate of bitrates) {
				const key = `${choice.codecString}|${bitrate}|${tier.acceleration}`;
				if (seen.has(key)) continue;
				seen.add(key);
				candidates.push({
					container: spec.container,
					videoCodec: spec.videoCodec,
					codecString: choice.codecString,
					profileLabel: choice.profileLabel,
					bitrate,
					hardwareAcceleration: tier.acceleration
				});
			}
		}
	}
	return candidates;
}

/** Audio codecs each container can carry, in preference order. */
const CONTAINER_AUDIO: Record<OfflineVideoContainer, OfflineAudioCodecId[]> = {
	mp4: ['aac', 'opus'],
	webm: ['opus', 'vorbis']
};

async function firstSupportedAudio(
	probe: OfflineEncoderProbe,
	container: OfflineVideoContainer,
	audio: { sampleRate: number; numberOfChannels: number }
): Promise<OfflineAudioCodecId | null> {
	for (const codec of CONTAINER_AUDIO[container]) {
		try {
			if (await probe.canEncodeAudio(codec, audio)) return codec;
		} catch {
			// A probe that throws is a codec this browser cannot use.
		}
	}
	return null;
}

/**
 * Walks the platform-ordered candidate ladder and returns the first config
 * the browser confirms it can encode, paired with an audio codec the chosen
 * container can carry. `null` means WebCodecs cannot encode this project at
 * this resolution at all — and then no frame is rendered.
 */
export async function negotiateOfflineVideoEncoder(
	probe: OfflineEncoderProbe,
	options: {
		width: number;
		height: number;
		fps: number;
		qualityScale?: number;
		platform?: RuntimePlatform;
		audio?: { sampleRate: number; numberOfChannels: number };
	}
): Promise<OfflineVideoEncoderPlan | null> {
	const platform = options.platform ?? detectRuntimePlatform();
	const audio = options.audio ?? { sampleRate: 44100, numberOfChannels: 2 };
	const size = {
		width: options.width,
		height: options.height,
		fps: options.fps,
		qualityScale: options.qualityScale
	};
	// One audio probe per container, not per video candidate: the AAC answer
	// does not change because the video level did.
	const audioByContainer = new Map<
		OfflineVideoContainer,
		OfflineAudioCodecId | null
	>();

	for (const candidate of buildVideoEncoderCandidates({
		platform,
		...size
	})) {
		let supported = false;
		try {
			supported = await probe.canEncodeVideo(candidate, size);
		} catch {
			// Unknown config fields type-error on some browsers: not supported.
			supported = false;
		}
		if (!supported) continue;
		if (!audioByContainer.has(candidate.container)) {
			audioByContainer.set(
				candidate.container,
				await firstSupportedAudio(probe, candidate.container, audio)
			);
		}
		const audioCodec = audioByContainer.get(candidate.container);
		// A video codec with no audio partner cannot produce the file this
		// export promises, so keep walking rather than shipping a silent one.
		if (!audioCodec) continue;
		return {
			format: {
				container: candidate.container,
				videoCodec: candidate.videoCodec,
				audioCodec,
				extension: candidate.container,
				mimeType:
					candidate.container === 'mp4' ? 'video/mp4' : 'video/webm'
			},
			video: candidate,
			platform,
			...size
		};
	}
	return null;
}
