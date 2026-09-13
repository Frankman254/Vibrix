import { describe, expect, it } from 'vitest';
import { createOfflineAudioAnalysisSourceFromBuffer } from './offlineAudioAnalysis';

const SAMPLE_RATE = 48000;

function monoBuffer(samples: Float32Array): AudioBuffer {
	return {
		length: samples.length,
		numberOfChannels: 1,
		sampleRate: SAMPLE_RATE,
		duration: samples.length / SAMPLE_RATE,
		getChannelData: () => samples
	} as unknown as AudioBuffer;
}

function sine(hz: number, seconds: number, gain = 0.5): Float32Array {
	const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
	for (let index = 0; index < out.length; index += 1) {
		out[index] = gain * Math.sin((2 * Math.PI * hz * index) / SAMPLE_RATE);
	}
	return out;
}

function peakBin(bins: Uint8Array): number {
	let best = 0;
	for (let index = 1; index < bins.length; index += 1) {
		if (bins[index] > bins[best]) best = index;
	}
	return best;
}

describe('offline audio analysis', () => {
	it('reports the waveform the oscilloscope draws', () => {
		const source = createOfflineAudioAnalysisSourceFromBuffer(
			monoBuffer(sine(440, 1)),
			{ fftSize: 2048, smoothingTimeConstant: 0 }
		);
		const snapshot = source.getSnapshotAt(500);
		expect(snapshot.timeDomain).toHaveLength(2048);
		const td = snapshot.timeDomain ?? new Uint8Array(0);
		expect(Math.max(...td)).toBeGreaterThan(180);
		expect(Math.min(...td)).toBeLessThan(76);
	});

	it('puts a tone in the bin the live analyser would', () => {
		const source = createOfflineAudioAnalysisSourceFromBuffer(
			monoBuffer(sine(1500, 1)),
			{ fftSize: 2048, smoothingTimeConstant: 0 }
		);
		const expected = Math.round((1500 * 2048) / SAMPLE_RATE);
		expect(peakBin(source.getSnapshotAt(500).bins)).toBe(expected);
	});

	it('keeps silence at zero and the waveform at the midpoint', () => {
		const source = createOfflineAudioAnalysisSourceFromBuffer(
			monoBuffer(new Float32Array(SAMPLE_RATE)),
			{ fftSize: 2048 }
		);
		const snapshot = source.getSnapshotAt(500);
		expect(Math.max(...snapshot.bins)).toBe(0);
		expect(new Set(snapshot.timeDomain)).toEqual(new Set([128]));
	});

	it('smooths per 60 Hz frame whatever the export frame rate', () => {
		const tone = monoBuffer(sine(1500, 2));
		const bin = Math.round((1500 * 2048) / SAMPLE_RATE);
		const at30 = createOfflineAudioAnalysisSourceFromBuffer(tone, {
			fftSize: 2048,
			smoothingTimeConstant: 0.8
		});
		const at60 = createOfflineAudioAnalysisSourceFromBuffer(tone, {
			fftSize: 2048,
			smoothingTimeConstant: 0.8
		});
		let last30 = 0;
		for (let frame = 1; frame <= 6; frame += 1) {
			last30 = at30.getSnapshotAt(100 + (frame * 1000) / 30).bins[bin];
		}
		let last60 = 0;
		for (let frame = 1; frame <= 12; frame += 1) {
			last60 = at60.getSnapshotAt(100 + (frame * 1000) / 60).bins[bin];
		}
		expect(Math.abs(last30 - last60)).toBeLessThanOrEqual(1);
	});
});
