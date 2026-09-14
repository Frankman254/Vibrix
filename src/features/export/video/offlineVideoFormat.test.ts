import { describe, expect, it } from 'vitest';
import {
	computeOfflineExportRatio,
	computeOfflineFrameCount,
	estimateOfflineExportEtaMs,
	estimateOfflineVideoBytes,
	recommendedVideoBitrateFor,
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

describe('recommendedVideoBitrateFor', () => {
	it('matches the quality table', () => {
		expect(
			recommendedVideoBitrateFor({ width: 1920, height: 1080, fps: 30 })
		).toBe(28_000_000);
		// 60 fps pays 1.5x, not 2x: VVR exploits temporal redundancy.
		expect(
			recommendedVideoBitrateFor({ width: 1920, height: 1080, fps: 60 })
		).toBe(42_000_000);
		// Sub-linear in pixels: 4x the pixels costs ~3x the bits.
		expect(
			recommendedVideoBitrateFor({ width: 3840, height: 2160, fps: 30 })
		).toBe(84_900_000);
	});
});

describe('estimateOfflineVideoBytes', () => {
	it('uses the encoder bitrate: 1080p30 ≈ 28 Mbps video + 256 kbps audio', () => {
		const bytes = estimateOfflineVideoBytes({
			width: 1920,
			height: 1080,
			fps: 30,
			durationSec: 60
		});
		// (28e6 + 256e3) / 8 * 60 = 211_920_000 — a bits/bytes slip here
		// silently under-reserves the disk by 8x.
		expect(bytes).toBe(211_920_000);
	});

	it('scales with duration, pixels and frame rate', () => {
		const base = estimateOfflineVideoBytes({
			width: 1920,
			height: 1080,
			fps: 30,
			durationSec: 60
		});
		const doubleDuration = estimateOfflineVideoBytes({
			width: 1920,
			height: 1080,
			fps: 30,
			durationSec: 120
		});
		const halfPixels = estimateOfflineVideoBytes({
			width: 1280,
			height: 720,
			fps: 30,
			durationSec: 60
		});
		const doubleFps = estimateOfflineVideoBytes({
			width: 1920,
			height: 1080,
			fps: 60,
			durationSec: 60
		});
		expect(doubleDuration).toBeGreaterThan(base);
		expect(halfPixels).toBeLessThan(base);
		expect(doubleFps).toBeGreaterThan(base);
	});
});
