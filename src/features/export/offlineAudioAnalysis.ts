import {
	analyzeAudioChannels,
	createAudioAnalysisState,
	type AudioAnalysisState,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';

export type OfflineAudioMemoryRisk = 'low' | 'medium' | 'high';

export type OfflineAudioAnalysisOptions = {
	fftSize?: number;
	channelSmoothing?: number;
	minDecibels?: number;
	maxDecibels?: number;
};

export type OfflineAudioAnalysisSummary = {
	durationMs: number;
	sampleRate: number;
	channelCount: number;
	fftSize: number;
	frequencyBinCount: number;
	estimatedDecodedBytes: number;
	memoryRisk: OfflineAudioMemoryRisk;
};

export interface OfflineAudioAnalysisSource {
	readonly summary: OfflineAudioAnalysisSummary;
	getSnapshotAt(timeMs: number): AudioSnapshot;
	reset(): void;
	dispose(): void;
}

const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_MIN_DECIBELS = -90;
const DEFAULT_MAX_DECIBELS = -10;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function normalizeFftSize(value: number | undefined): number {
	const requested = clamp(value ?? DEFAULT_FFT_SIZE, 512, 8192);
	let power = 512;
	while (power * 2 <= requested) power *= 2;
	return power;
}

function estimateMemoryRisk(bytes: number): OfflineAudioMemoryRisk {
	if (bytes >= 512 * 1024 * 1024) return 'high';
	if (bytes >= 192 * 1024 * 1024) return 'medium';
	return 'low';
}

function createHannWindow(size: number): Float32Array {
	const out = new Float32Array(size);
	for (let index = 0; index < size; index += 1) {
		out[index] =
			0.5 * (1 - Math.cos((2 * Math.PI * index) / Math.max(1, size - 1)));
	}
	return out;
}

function mixToMono(buffer: AudioBuffer): Float32Array {
	const out = new Float32Array(buffer.length);
	for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
		const input = buffer.getChannelData(channel);
		for (let index = 0; index < input.length; index += 1) {
			out[index] += input[index] / buffer.numberOfChannels;
		}
	}
	return out;
}

function bitReverse(real: Float32Array, imag: Float32Array): void {
	const n = real.length;
	let reversed = 0;
	for (let index = 1; index < n; index += 1) {
		let bit = n >> 1;
		while ((reversed & bit) !== 0) {
			reversed ^= bit;
			bit >>= 1;
		}
		reversed ^= bit;

		if (index < reversed) {
			const realValue = real[index];
			real[index] = real[reversed];
			real[reversed] = realValue;
			const imagValue = imag[index];
			imag[index] = imag[reversed];
			imag[reversed] = imagValue;
		}
	}
}

function fft(real: Float32Array, imag: Float32Array): void {
	const n = real.length;
	bitReverse(real, imag);

	for (let size = 2; size <= n; size <<= 1) {
		const halfSize = size >> 1;
		const tableStep = (-2 * Math.PI) / size;

		for (let start = 0; start < n; start += size) {
			for (let offset = 0; offset < halfSize; offset += 1) {
				const angle = tableStep * offset;
				const wr = Math.cos(angle);
				const wi = Math.sin(angle);
				const even = start + offset;
				const odd = even + halfSize;
				const tr = wr * real[odd] - wi * imag[odd];
				const ti = wr * imag[odd] + wi * real[odd];

				real[odd] = real[even] - tr;
				imag[odd] = imag[even] - ti;
				real[even] += tr;
				imag[even] += ti;
			}
		}
	}
}

class PcmOfflineAudioAnalysisSource implements OfflineAudioAnalysisSource {
	readonly summary: OfflineAudioAnalysisSummary;
	private readonly mono: Float32Array;
	private readonly window: Float32Array;
	private readonly real: Float32Array;
	private readonly imag: Float32Array;
	private readonly bins: Uint8Array;
	private readonly channelSmoothing: number;
	private readonly minDecibels: number;
	private readonly maxDecibels: number;
	private channelState: AudioAnalysisState;
	private lastTimeMs = Number.NEGATIVE_INFINITY;
	private peak = 0;
	private disposed = false;

	constructor(
		mono: Float32Array,
		summary: OfflineAudioAnalysisSummary,
		options: Required<OfflineAudioAnalysisOptions>
	) {
		this.mono = mono;
		this.summary = summary;
		this.window = createHannWindow(summary.fftSize);
		this.real = new Float32Array(summary.fftSize);
		this.imag = new Float32Array(summary.fftSize);
		this.bins = new Uint8Array(summary.frequencyBinCount);
		this.channelSmoothing = clamp(options.channelSmoothing, 0, 0.99);
		this.minDecibels = options.minDecibels;
		this.maxDecibels = Math.max(
			options.minDecibels + 1,
			options.maxDecibels
		);
		this.channelState = createAudioAnalysisState();
	}

	reset(): void {
		this.channelState = createAudioAnalysisState();
		this.lastTimeMs = Number.NEGATIVE_INFINITY;
		this.peak = 0;
	}

	dispose(): void {
		this.disposed = true;
		this.mono.fill(0);
		this.real.fill(0);
		this.imag.fill(0);
		this.bins.fill(0);
	}

	getSnapshotAt(timeMs: number): AudioSnapshot {
		if (this.disposed) {
			throw new Error('offline-audio-analysis-source-disposed');
		}

		const clampedTimeMs = clamp(timeMs, 0, this.summary.durationMs);
		if (clampedTimeMs + 0.001 < this.lastTimeMs) {
			this.reset();
		}
		this.lastTimeMs = clampedTimeMs;

		const centerSample = Math.round(
			(clampedTimeMs / 1000) * this.summary.sampleRate
		);
		const startSample = centerSample - Math.floor(this.summary.fftSize / 2);
		let sumBins = 0;

		for (let index = 0; index < this.summary.fftSize; index += 1) {
			const sampleIndex = startSample + index;
			this.real[index] =
				(sampleIndex >= 0 && sampleIndex < this.mono.length
					? this.mono[sampleIndex]
					: 0) * this.window[index];
			this.imag[index] = 0;
		}

		fft(this.real, this.imag);

		for (
			let index = 0;
			index < this.summary.frequencyBinCount;
			index += 1
		) {
			const magnitude =
				Math.hypot(this.real[index], this.imag[index]) /
				(this.summary.fftSize / 2);
			const decibels = 20 * Math.log10(Math.max(magnitude, 1e-8));
			const normalized = clamp(
				(decibels - this.minDecibels) /
					(this.maxDecibels - this.minDecibels),
				0,
				1
			);
			const bin = Math.round(normalized * 255);
			this.bins[index] = bin;
			sumBins += bin;
		}

		const amplitude =
			this.bins.length > 0 ? sumBins / this.bins.length / 255 : 0;
		this.peak = Math.max(this.peak * 0.98, amplitude);

		return {
			bins: new Uint8Array(this.bins),
			amplitude,
			peak: this.peak,
			channels: analyzeAudioChannels(
				this.bins,
				this.channelState,
				this.channelSmoothing,
				clampedTimeMs
			),
			timestampMs: clampedTimeMs
		};
	}
}

/**
 * Decodes an audio file once. The export keeps this buffer for the encoder
 * (original channels) and hands it to the analysis source, which mixes it to
 * mono — so the file is never decoded twice.
 */
export async function decodeOfflineAudioFile(
	file: File | Blob
): Promise<AudioBuffer> {
	if (typeof OfflineAudioContext === 'undefined') {
		throw new Error('offline-audio-context-unavailable');
	}
	const arrayBuffer = await file.arrayBuffer();
	const decodeContext = new OfflineAudioContext(1, 1, 44100);
	return decodeContext.decodeAudioData(arrayBuffer);
}

export function createOfflineAudioAnalysisSourceFromBuffer(
	decoded: AudioBuffer,
	options: OfflineAudioAnalysisOptions = {}
): OfflineAudioAnalysisSource {
	const fftSize = normalizeFftSize(options.fftSize);
	const estimatedDecodedBytes =
		decoded.length *
		decoded.numberOfChannels *
		Float32Array.BYTES_PER_ELEMENT;
	const summary: OfflineAudioAnalysisSummary = {
		durationMs: Math.round(decoded.duration * 1000),
		sampleRate: decoded.sampleRate,
		channelCount: decoded.numberOfChannels,
		fftSize,
		frequencyBinCount: fftSize / 2,
		estimatedDecodedBytes,
		memoryRisk: estimateMemoryRisk(estimatedDecodedBytes)
	};

	return new PcmOfflineAudioAnalysisSource(mixToMono(decoded), summary, {
		fftSize,
		channelSmoothing: options.channelSmoothing ?? 0.72,
		minDecibels: options.minDecibels ?? DEFAULT_MIN_DECIBELS,
		maxDecibels: options.maxDecibels ?? DEFAULT_MAX_DECIBELS
	});
}

export async function createOfflineAudioAnalysisSource(
	file: File | Blob,
	options: OfflineAudioAnalysisOptions = {}
): Promise<OfflineAudioAnalysisSource> {
	const decoded = await decodeOfflineAudioFile(file);
	return createOfflineAudioAnalysisSourceFromBuffer(decoded, options);
}
