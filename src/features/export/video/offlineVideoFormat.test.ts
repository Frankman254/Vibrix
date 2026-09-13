import { describe, expect, it } from 'vitest';
import {
	computeOfflineExportRatio,
	computeOfflineFrameCount,
	estimateOfflineExportEtaMs,
	resolveOfflineVideoFormat,
	type OfflineAudioCodecId,
	type OfflineCodecProbe,
	type OfflineVideoCodecId
} from './offlineVideoFormat';

function probeFor(
	video: OfflineVideoCodecId[],
	audio: OfflineAudioCodecId[]
): OfflineCodecProbe {
	return {
		canEncodeVideo: async codec => video.includes(codec),
		canEncodeAudio: async codec => audio.includes(codec)
	};
}

const SIZE = { width: 1920, height: 1080 };

describe('resolveOfflineVideoFormat', () => {
	it('prefers MP4 with H.264 and AAC', async () => {
		const format = await resolveOfflineVideoFormat(
			probeFor(['avc', 'vp9'], ['aac', 'opus']),
			SIZE
		);
		expect(format).toMatchObject({
			container: 'mp4',
			videoCodec: 'avc',
			audioCodec: 'aac',
			mimeType: 'video/mp4'
		});
	});

	it('keeps MP4 with Opus when AAC cannot be encoded', async () => {
		const format = await resolveOfflineVideoFormat(
			probeFor(['avc'], ['opus']),
			SIZE
		);
		expect(format).toMatchObject({ container: 'mp4', audioCodec: 'opus' });
	});

	it('falls back to WebM when no MP4 video codec is available', async () => {
		const format = await resolveOfflineVideoFormat(
			probeFor(['vp9'], ['opus']),
			SIZE
		);
		expect(format).toMatchObject({
			container: 'webm',
			videoCodec: 'vp9',
			extension: 'webm'
		});
	});

	it('treats a throwing probe as unsupported', async () => {
		const format = await resolveOfflineVideoFormat(
			{
				canEncodeVideo: async codec => {
					if (codec === 'avc') throw new Error('boom');
					return codec === 'vp8';
				},
				canEncodeAudio: async codec => codec === 'vorbis'
			},
			SIZE
		);
		expect(format).toMatchObject({ container: 'webm', videoCodec: 'vp8' });
	});

	it('returns null when nothing can be encoded', async () => {
		expect(
			await resolveOfflineVideoFormat(probeFor([], []), SIZE)
		).toBeNull();
	});
});

describe('offline export progress math', () => {
	it('counts every frame needed to cover the audio', () => {
		expect(computeOfflineFrameCount(180_000, 30)).toBe(5400);
		expect(computeOfflineFrameCount(1_010, 30)).toBe(31);
		expect(computeOfflineFrameCount(0, 30)).toBe(0);
	});

	it('moves the bar monotonically through the phases', () => {
		const ratios = [
			computeOfflineExportRatio('preparing', 0, 100),
			computeOfflineExportRatio('decoding', 0, 100),
			computeOfflineExportRatio('rendering', 0, 100),
			computeOfflineExportRatio('rendering', 50, 100),
			computeOfflineExportRatio('rendering', 100, 100),
			computeOfflineExportRatio('finalizing', 100, 100),
			computeOfflineExportRatio('done', 100, 100)
		];
		for (let index = 1; index < ratios.length; index += 1) {
			expect(ratios[index]).toBeGreaterThanOrEqual(ratios[index - 1]);
		}
		expect(ratios.at(-1)).toBe(1);
	});

	it('only estimates the remaining time once the pace is known', () => {
		expect(estimateOfflineExportEtaMs(500, 5, 100)).toBeNull();
		expect(estimateOfflineExportEtaMs(1_000, 10, 100)).toBe(9_000);
	});
});
