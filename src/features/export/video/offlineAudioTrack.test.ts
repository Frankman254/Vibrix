import { describe, expect, it } from 'vitest';
import {
	createOfflineAudioAnalysisSourceFromBuffer,
	createOfflineAudioAnalysisSourceFromReader
} from '../offlineAudioAnalysis';
import {
	createOfflineAudioTrackFromChunks,
	type OfflineAudioTrackFromChunksOptions
} from './offlineAudioTrack';

const SAMPLE_RATE = 48000;

/** node has no AudioBuffer; the track lets tests inject their own. */
type FakeBuffer = {
	length: number;
	sampleRate: number;
	numberOfChannels: number;
	duration: number;
	getChannelData: (channel: number) => Float32Array;
};

function fakeBuffer(channels: Float32Array[], sampleRate: number): FakeBuffer {
	return {
		length: channels[0].length,
		sampleRate,
		numberOfChannels: channels.length,
		duration: channels[0].length / sampleRate,
		getChannelData: channel => channels[channel]
	};
}

function asFake(slice: AudioBuffer | null): FakeBuffer {
	return slice as unknown as FakeBuffer;
}

function sine(hz: number, seconds: number, rate = SAMPLE_RATE): Float32Array {
	const out = new Float32Array(Math.round(seconds * rate));
	for (let index = 0; index < out.length; index += 1) {
		out[index] = 0.5 * Math.sin((2 * Math.PI * hz * index) / rate);
	}
	return out;
}

function chunkRamp(total: number, chunkLength: number): Float32Array[] {
	const data = new Float32Array(total);
	for (let index = 0; index < total; index += 1) {
		data[index] = index / total;
	}
	const chunks: Float32Array[] = [];
	for (let start = 0; start < total; start += chunkLength) {
		chunks.push(data.subarray(start, Math.min(total, start + chunkLength)));
	}
	return chunks;
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
	const merged = new Float32Array(
		chunks.reduce((total, chunk) => total + chunk.length, 0)
	);
	let cursor = 0;
	for (const chunk of chunks) {
		merged.set(chunk, cursor);
		cursor += chunk.length;
	}
	return merged;
}

async function* chunkStream(
	chunks: Float32Array[]
): AsyncGenerator<AudioBuffer> {
	for (const chunk of chunks) {
		yield fakeBuffer([chunk], SAMPLE_RATE) as unknown as AudioBuffer;
	}
}

function makeTrack(options: Partial<OfflineAudioTrackFromChunksOptions>) {
	return createOfflineAudioTrackFromChunks({
		chunks: chunkStream(chunkRamp(SAMPLE_RATE * 2, 5_000)),
		nativeSampleRate: SAMPLE_RATE,
		channelCount: 1,
		durationSec: 2,
		targetSampleRate: SAMPLE_RATE,
		lookaheadSamples: 2048,
		...options,
		makeAudioBuffer: (channels, sampleRate) =>
			fakeBuffer(channels, sampleRate) as unknown as AudioBuffer
	});
}

describe('offline audio track', () => {
	it('makes the analysis see the same waveform as the whole buffer', async () => {
		const tone = sine(440, 2);
		const whole = fakeBuffer([tone], SAMPLE_RATE) as unknown as AudioBuffer;
		const track = makeTrack({
			chunks: chunkStream([
				tone.subarray(0, 30_000),
				tone.subarray(30_000, 60_000),
				tone.subarray(60_000)
			])
		});
		const buffered = createOfflineAudioAnalysisSourceFromBuffer(whole, {
			fftSize: 2048,
			smoothingTimeConstant: 0.8
		});
		const streamed = createOfflineAudioAnalysisSourceFromReader(track, {
			fftSize: 2048,
			smoothingTimeConstant: 0.8
		});

		for (let frame = 1; frame <= 40; frame += 1) {
			const timeMs = frame * 50;
			await track.ensureWindow(Math.round((timeMs / 1000) * SAMPLE_RATE));
			expect(streamed.getSnapshotAt(timeMs)).toEqual(
				buffered.getSnapshotAt(timeMs)
			);
		}
	});

	it('linearly resamples chunk data to the target rate', async () => {
		// A ramp at 48k sampled at 24k must equal the ramp read at even
		// native indices (frac = 0 there, so the values are exact).
		const chunks = chunkRamp(48_000, 7_000);
		const track = makeTrack({
			chunks: chunkStream(chunks),
			targetSampleRate: 24_000,
			sliceSamples: 4_000
		});
		const data = asFake(await track.nextSlice(4_000)).getChannelData(0);
		expect(data.length).toBe(4_000);
		const merged = mergeChunks(chunks);
		for (let index = 0; index < 4_000; index += 1) {
			expect(data[index]).toBeCloseTo(merged[index * 2], 6);
		}
	});

	it('hands out slices that cover the track exactly, in order', async () => {
		const track = makeTrack({ sliceSamples: 10_000 });
		const merged = mergeChunks(chunkRamp(SAMPLE_RATE * 2, 5_000));
		let cursor = 0;
		for (;;) {
			const slice = await track.nextSlice(Number.POSITIVE_INFINITY);
			if (!slice) break;
			const buffer = asFake(slice);
			// Content proves the slices butt against each other in order.
			expect(buffer.getChannelData(0)[0]).toBeCloseTo(
				cursor / (SAMPLE_RATE * 2),
				6
			);
			cursor += buffer.length;
			expect(cursor).toBeLessThanOrEqual(SAMPLE_RATE * 2);
		}
		expect(cursor).toBe(SAMPLE_RATE * 2);
		expect(merged.length).toBe(SAMPLE_RATE * 2);
	});

	it('paces slices under the video clock and waits past the limit', async () => {
		const track = makeTrack({ sliceSamples: 10_000 });
		const first = asFake(await track.nextSlice(3_500));
		expect(first.length).toBe(3_500);
		// Nothing new is producible under the same limit yet.
		expect(await track.nextSlice(3_500)).toBeNull();
		const second = asFake(await track.nextSlice(12_000));
		expect(second.length).toBe(12_000 - 3_500);
		expect(second.getChannelData(0)[0]).toBeCloseTo(
			3_500 / (SAMPLE_RATE * 2),
			6
		);
	});

	it('holds the final sample so the whole track stays decidable', async () => {
		// Upsampling: the last target sample interpolates one native sample
		// past EOF; without the EOF hold it would read zero.
		const track = makeTrack({
			chunks: chunkStream(chunkRamp(30_000, 7_000)),
			durationSec: 30_000 / SAMPLE_RATE,
			targetSampleRate: 96_000,
			sliceSamples: 96_000
		});
		const slice = asFake(await track.nextSlice(Number.POSITIVE_INFINITY));
		expect(slice.length).toBe(60_000);
		// A rising ramp: the last value must sit near the ramp's end, not 0.
		expect(slice.getChannelData(0)[slice.length - 1]).toBeGreaterThan(0.9);
	});

	it('rejects pumps after dispose', async () => {
		const track = makeTrack({});
		await track.ensureWindow(1_000);
		track.dispose();
		await expect(track.ensureWindow(2_000)).rejects.toThrow(
			'offline-audio-track-disposed'
		);
	});
});
