import { describe, expect, it, vi } from 'vitest';
import {
	buildVideoEncoderCandidates,
	negotiateOfflineVideoEncoder,
	type OfflineEncoderProbe,
	type VideoEncoderCandidate
} from './offlineEncoderNegotiation';
import { avcCodecCandidates, vp9CodecCandidates } from './videoCodecStrings';

const QHD60 = { width: 2560, height: 1440, fps: 60 };

function probe(
	accepts: (candidate: VideoEncoderCandidate) => boolean,
	audio: string[] = ['aac', 'opus', 'vorbis']
): OfflineEncoderProbe {
	return {
		canEncodeVideo: async candidate => accepts(candidate),
		canEncodeAudio: async codec => audio.includes(codec)
	};
}

describe('AVC codec strings', () => {
	it('picks the level the macroblock rate actually needs', () => {
		// 1440p60 = 14400 MBs at 864k MB/s: level 5.0 cannot carry the rate,
		// 5.1 can. High profile 5.1 is `avc1.640033`.
		expect(avcCodecCandidates(QHD60)[0]).toEqual({
			codecString: 'avc1.640033',
			profileLabel: 'High 5.1'
		});
		// 1080p60 fits 4.2; 1080p30 fits 4.0.
		expect(
			avcCodecCandidates({ width: 1920, height: 1080, fps: 60 })[0]
				.codecString
		).toBe('avc1.64002a');
		expect(
			avcCodecCandidates({ width: 1920, height: 1080, fps: 30 })[0]
				.codecString
		).toBe('avc1.640028');
		// 4K60 needs 5.2.
		expect(
			avcCodecCandidates({ width: 3840, height: 2160, fps: 60 })[0]
				.codecString
		).toBe('avc1.640034');
	});

	it('falls back through Main, the next level up, then Baseline', () => {
		expect(
			avcCodecCandidates(QHD60).map(choice => choice.profileLabel)
		).toEqual(['High 5.1', 'Main 5.1', 'High 5.2', 'Baseline 5.1']);
	});

	it('never clamps VP9 below a usable level', () => {
		expect(vp9CodecCandidates(QHD60)[0].codecString).toBe('vp09.00.50.08');
	});
});

describe('buildVideoEncoderCandidates', () => {
	it('leads with hardware H.264 High at the quality bitrate on Windows', () => {
		const [first, second] = buildVideoEncoderCandidates({
			platform: 'windows',
			...QHD60
		});
		expect(first).toMatchObject({
			container: 'mp4',
			videoCodec: 'avc',
			codecString: 'avc1.640033',
			hardwareAcceleration: 'prefer-hardware'
		});
		// Same config, one bitrate rung down — the cheapest thing to retry.
		expect(second).toMatchObject({
			codecString: 'avc1.640033',
			hardwareAcceleration: 'prefer-hardware'
		});
		expect(second.bitrate).toBeLessThan(first.bitrate);
	});

	it('exhausts H.264 (hardware then software) before any other codec', () => {
		const candidates = buildVideoEncoderCandidates({
			platform: 'windows',
			...QHD60
		});
		const firstNonAvc = candidates.findIndex(
			candidate => candidate.videoCodec !== 'avc'
		);
		const lastAvc = candidates.reduce(
			(last, candidate, index) =>
				candidate.videoCodec === 'avc' ? index : last,
			-1
		);
		expect(firstNonAvc).toBeGreaterThan(lastAvc);
		expect(
			candidates
				.filter(candidate => candidate.videoCodec === 'avc')
				.map(candidate => candidate.hardwareAcceleration)
		).toContain('prefer-software');
	});

	it('tries HEVC before software H.264 on macOS, and not at all on Linux', () => {
		const mac = buildVideoEncoderCandidates({
			platform: 'macos',
			...QHD60
		});
		const firstHevc = mac.findIndex(c => c.videoCodec === 'hevc');
		const firstSoftwareAvc = mac.findIndex(
			c =>
				c.videoCodec === 'avc' &&
				c.hardwareAcceleration === 'prefer-software'
		);
		expect(firstHevc).toBeGreaterThan(-1);
		expect(firstHevc).toBeLessThan(firstSoftwareAvc);

		const linux = buildVideoEncoderCandidates({
			platform: 'linux',
			...QHD60
		});
		expect(linux.some(c => c.videoCodec === 'hevc')).toBe(false);
		expect(linux.some(c => c.videoCodec === 'vp9')).toBe(true);
	});

	it('never offers a bitrate below the floor', () => {
		for (const candidate of buildVideoEncoderCandidates({
			platform: 'windows',
			width: 1280,
			height: 720,
			fps: 30
		})) {
			expect(candidate.bitrate).toBeGreaterThanOrEqual(8_000_000);
		}
	});
});

describe('negotiateOfflineVideoEncoder', () => {
	it('returns the first config the browser confirms, and nothing else', async () => {
		const plan = await negotiateOfflineVideoEncoder(
			probe(candidate => candidate.codecString === 'avc1.640033'),
			{ platform: 'windows', ...QHD60 }
		);
		expect(plan).toMatchObject({
			platform: 'windows',
			width: 2560,
			height: 1440,
			fps: 60,
			format: { container: 'mp4', videoCodec: 'avc', audioCodec: 'aac' },
			video: {
				codecString: 'avc1.640033',
				profileLabel: 'High 5.1',
				hardwareAcceleration: 'prefer-hardware'
			}
		});
	});

	it('drops to software H.264 when hardware refuses every rung', async () => {
		const plan = await negotiateOfflineVideoEncoder(
			probe(
				candidate =>
					candidate.videoCodec === 'avc' &&
					candidate.hardwareAcceleration === 'prefer-software'
			),
			{ platform: 'windows', ...QHD60 }
		);
		expect(plan?.video.hardwareAcceleration).toBe('prefer-software');
		expect(plan?.format.container).toBe('mp4');
	});

	it('reaches WebM/VP9 rather than failing when MP4 is impossible', async () => {
		const plan = await negotiateOfflineVideoEncoder(
			probe(candidate => candidate.videoCodec === 'vp9', ['opus']),
			{ platform: 'windows', ...QHD60 }
		);
		expect(plan?.format).toMatchObject({
			container: 'webm',
			videoCodec: 'vp9',
			audioCodec: 'opus',
			extension: 'webm',
			mimeType: 'video/webm'
		});
	});

	it('keeps walking when a video codec has no audio partner', async () => {
		// AVC is encodable but MP4's audio codecs are not: a silent MP4 is
		// not the file this export promises.
		const plan = await negotiateOfflineVideoEncoder(
			{
				canEncodeVideo: async () => true,
				canEncodeAudio: async codec => codec === 'vorbis'
			},
			{ platform: 'windows', ...QHD60 }
		);
		expect(plan?.format).toMatchObject({
			container: 'webm',
			audioCodec: 'vorbis'
		});
	});

	it('probes each container audio set only once', async () => {
		const canEncodeAudio = vi.fn(async () => false);
		await negotiateOfflineVideoEncoder(
			{ canEncodeVideo: async () => true, canEncodeAudio },
			{ platform: 'windows', ...QHD60 }
		);
		// mp4 -> aac, opus; webm -> opus, vorbis. Four calls, not one per
		// video candidate.
		expect(canEncodeAudio).toHaveBeenCalledTimes(4);
	});

	it('treats a throwing probe as unsupported instead of failing', async () => {
		const plan = await negotiateOfflineVideoEncoder(
			{
				canEncodeVideo: async candidate => {
					if (candidate.videoCodec === 'avc') {
						throw new Error('boom');
					}
					return candidate.videoCodec === 'vp9';
				},
				canEncodeAudio: async codec => codec === 'opus'
			},
			{ platform: 'windows', ...QHD60 }
		);
		expect(plan?.format.videoCodec).toBe('vp9');
	});

	it('returns null when nothing can be encoded, so no frame is rendered', async () => {
		expect(
			await negotiateOfflineVideoEncoder(
				probe(() => false),
				{
					platform: 'windows',
					...QHD60
				}
			)
		).toBeNull();
	});
});
