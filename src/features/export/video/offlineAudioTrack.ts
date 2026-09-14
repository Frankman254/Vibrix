/**
 * Offline video export — the streaming audio track.
 *
 * The export used to decode the whole song into one `AudioBuffer` before the
 * first frame: a 3-hour mix is ~1.8 GB per hour of stereo float32 and crashed
 * the tab. This module keeps the same data flowing instead of holding it:
 * mediabunny decodes the file chunk by chunk, a linear resampler moves each
 * chunk to the live analyser's sample rate (bin N covers N × rate / fftSize
 * Hz, so analysing at any other rate would shift every spectrum bar), and the
 * result lands in a block ring with two monotone reader cursors:
 *
 * - the audio analysis reads the fft window at the current frame time via
 *   `ensureWindow` + `fillWindow`, and
 * - the encoder pulls whole-channel slices with `nextSlice(limitSample)`,
 *   paced by the video clock so encoded audio never runs ahead.
 *
 * Memory stays bounded because blocks are only dropped once BOTH cursors have
 * passed them: the ring holds roughly one slice plus one fft window.
 *
 * The chunk stream is a seam with two adapters: the mediabunny pump here, and
 * hand-built chunk lists in tests.
 */
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

const FALLBACK_SAMPLE_RATE = 44100;
/** One second of audio per encoder slice, at the track's rate. */
const AUDIO_SLICE_SECONDS = 1;

export type OfflineAudioTrack = {
	/** The live analyser's rate; both readers see samples at this rate. */
	readonly sampleRate: number;
	readonly channelCount: number;
	readonly durationSec: number;
	/**
	 * Decodes ahead until the sample `endSample - 1` is available (clamped to
	 * the track end; past it, readers see held-last/zero fill).
	 */
	ensureWindow(endSample: number): Promise<void>;
	/**
	 * Copies `[endSample - out.length, endSample)` of the mono mix into `out`,
	 * zero-padding outside the track. Call after `ensureWindow(endSample)`;
	 * samples both readers have passed read as zero (forward-only readers).
	 */
	fillWindow(endSample: number, out: Float32Array): void;
	/**
	 * The next whole-channel slice at `sampleRate`, covering at most
	 * `[cursor, min(limitSample, cursor + oneSecond))`, or null when nothing
	 * can be emitted under `limitSample` yet — which after EOF means the
	 * track is exhausted. Slices are handed out in order, never rewound.
	 */
	nextSlice(limitSample: number): Promise<AudioBuffer | null>;
	dispose(): void;
};

type AudioBlock = {
	/** Absolute index (at the track rate) of this block's first sample. */
	startSample: number;
	channels: Float32Array[];
	mono: Float32Array;
};

export type OfflineAudioTrackFromChunksOptions = {
	/** Chunks as the decoder yields them: full quality, native rate, in order. */
	chunks: AsyncIterable<AudioBuffer>;
	nativeSampleRate: number;
	channelCount: number;
	durationSec: number;
	/** What the readers see samples at (the live AudioContext's rate). */
	targetSampleRate: number;
	/** Samples a `fillWindow` caller needs behind its window end (the fft size). */
	lookaheadSamples?: number;
	/** Max samples per `nextSlice`. Defaults to one second. */
	sliceSamples?: number;
	/** Overridable for tests (no `AudioBuffer` in node); production uses it. */
	makeAudioBuffer?: (
		channels: Float32Array[],
		sampleRate: number
	) => AudioBuffer;
};

function makeAudioBufferFromChannels(
	channels: Float32Array[],
	sampleRate: number
): AudioBuffer {
	const buffer = new AudioBuffer({
		length: Math.max(1, channels[0].length),
		numberOfChannels: channels.length,
		sampleRate
	});
	for (let channel = 0; channel < channels.length; channel += 1) {
		buffer.getChannelData(channel).set(channels[channel]);
	}
	return buffer;
}

/**
 * The window-ring core: resampling, block bookkeeping, and the two reader
 * cursors. Pure logic over an async iterable of decoded chunks, so tests can
 * drive it without WebCodecs.
 */
export function createOfflineAudioTrackFromChunks(
	options: OfflineAudioTrackFromChunksOptions
): OfflineAudioTrack {
	const {
		chunks,
		nativeSampleRate,
		channelCount,
		durationSec,
		targetSampleRate,
		lookaheadSamples = 8192,
		sliceSamples = Math.max(
			1,
			Math.round(targetSampleRate * AUDIO_SLICE_SECONDS)
		),
		makeAudioBuffer = makeAudioBufferFromChannels
	} = options;

	const ratio = nativeSampleRate / targetSampleRate;
	const totalSamples = Math.max(
		0,
		Math.round(durationSec * targetSampleRate)
	);

	const iterator = chunks[Symbol.asyncIterator]();
	let current: AudioBuffer | null = null;
	/** Global index (native rate) of the current chunk's first sample. */
	let chunkStart = 0;
	/** Last sample of the previous chunk, per channel (interpolation history). */
	let prevLast: Float32Array[] | null = null;
	let sourceExhausted = false;
	/** Next target-rate sample index produced. */
	let produced = 0;

	const blocks: AudioBlock[] = [];
	/** First retained sample index (both cursors are at or above it). */
	let analysisFloor = 0;
	let encoderCursor = 0;
	let disposed = false;

	function nativeSample(globalIndex: number, channel: number): number {
		if (current) {
			if (globalIndex === chunkStart - 1 && prevLast) {
				return prevLast[channel][0];
			}
			const local = globalIndex - chunkStart;
			if (local >= 0 && local < current.length) {
				return current.getChannelData(channel)[local];
			}
			// At EOF the interpolation partner of the boundary sample does
			// not exist: hold the last native value so the final target
			// sample is decidable instead of zero-padded.
			if (sourceExhausted && globalIndex === lastNativeIndex() + 1) {
				return current.getChannelData(channel)[current.length - 1];
			}
		}
		return 0;
	}

	function lastNativeIndex(): number {
		return current ? chunkStart + current.length - 1 : -1;
	}

	async function pullNextChunk(): Promise<boolean> {
		const next = await iterator.next();
		if (next.done) {
			sourceExhausted = true;
			return false;
		}
		const previous = current;
		if (previous) {
			prevLast = Array.from(
				{ length: channelCount },
				(_unused, channel) => {
					const data = previous.getChannelData(channel);
					return Float32Array.of(data[data.length - 1]);
				}
			);
			chunkStart += previous.length;
		}
		current = next.value;
		return true;
	}

	/** Linearly resamples target samples [from, to) from the current chunk. */
	function produceRange(from: number, to: number): void {
		const count = to - from;
		const channels = Array.from(
			{ length: channelCount },
			() => new Float32Array(count)
		);
		const mono = new Float32Array(count);
		for (let offset = 0; offset < count; offset += 1) {
			const position = (from + offset) * ratio;
			const low = Math.floor(position);
			const frac = position - low;
			let sum = 0;
			for (let channel = 0; channel < channelCount; channel += 1) {
				const lowValue = nativeSample(low, channel);
				const value =
					lowValue +
					(nativeSample(low + 1, channel) - lowValue) * frac;
				channels[channel][offset] = value;
				sum += value / channelCount;
			}
			mono[offset] = sum;
		}
		blocks.push({ startSample: from, channels, mono });
		produced = to;
	}

	/** Past EOF: zero-pad to `stop`, matching the old full-buffer path's
	 * out-of-range reads (the analysis zero-pads; the encoder never asks
	 * beyond `durationSec`). */
	function produceTail(stop: number): void {
		if (stop <= produced) return;
		const channels = Array.from(
			{ length: channelCount },
			() => new Float32Array(stop - produced)
		);
		blocks.push({
			startSample: produced,
			channels,
			mono: new Float32Array(stop - produced)
		});
		produced = stop;
	}

	/** Serialises pumps so the two cursors share one decode pull. */
	let pumping: Promise<void> = Promise.resolve();

	function pumpThrough(target: number): Promise<void> {
		const stop = Math.min(Math.max(target, 0), totalSamples);
		const run = pumping.then(async () => {
			if (disposed) throw new Error('offline-audio-track-disposed');
			while (produced < stop) {
				if (!current && !sourceExhausted && !(await pullNextChunk())) {
					continue;
				}
				// A target sample j is decidable once native floor(j*ratio)+1
				// exists — held at EOF — i.e. while j*ratio < last+1.
				const last = lastNativeIndex() + (sourceExhausted ? 1 : 0);
				const to = Math.min(stop, Math.ceil(last / ratio));
				if (to > produced) {
					produceRange(produced, to);
				} else if (sourceExhausted) {
					// Metadata over-reported the decode length: zero-pad the
					// rest, matching the old full-buffer path's OOB reads.
					produceTail(stop);
					break;
				} else if (!(await pullNextChunk())) {
					continue;
				}
			}
		});
		// Keep the chain alive after a rejection; callers see it via `run`.
		pumping = run.catch(() => undefined);
		return run;
	}

	function blockFor(index: number): AudioBlock | undefined {
		// Blocks are contiguous and ordered; binary-search the last start ≤ index.
		let low = 0;
		let high = blocks.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (blocks[mid].startSample <= index) low = mid;
			else high = mid - 1;
		}
		const block = blocks[low];
		return block && block.startSample <= index ? block : undefined;
	}

	function retained(index: number, channel: number | null): number {
		if (index < 0 || index >= totalSamples) return 0;
		const block = blockFor(index);
		if (!block || index < block.startSample) return 0;
		const local = index - block.startSample;
		if (local >= block.mono.length) return 0;
		return channel === null
			? block.mono[local]
			: block.channels[channel][local];
	}

	/** Drops everything both cursors have passed. */
	function dropConsumed(): void {
		const floor = Math.min(analysisFloor, encoderCursor);
		while (
			blocks.length > 0 &&
			blocks[0].startSample + blocks[0].mono.length <= floor
		) {
			blocks.shift();
		}
	}

	return {
		sampleRate: targetSampleRate,
		channelCount,
		durationSec,
		async ensureWindow(endSample: number) {
			await pumpThrough(endSample);
			analysisFloor = Math.max(
				analysisFloor,
				Math.min(endSample, totalSamples) - lookaheadSamples
			);
			dropConsumed();
		},
		fillWindow(endSample: number, out: Float32Array) {
			const start = endSample - out.length;
			for (let index = 0; index < out.length; index += 1) {
				out[index] = retained(start + index, null);
			}
		},
		async nextSlice(limitSample: number) {
			const want = Math.min(limitSample, encoderCursor + sliceSamples);
			await pumpThrough(want);
			const end = Math.min(want, produced);
			if (end <= encoderCursor) return null;
			const channels: Float32Array[] = [];
			for (let channel = 0; channel < channelCount; channel += 1) {
				const data = new Float32Array(end - encoderCursor);
				for (let index = 0; index < data.length; index += 1) {
					data[index] = retained(encoderCursor + index, channel);
				}
				channels.push(data);
			}
			encoderCursor = end;
			dropConsumed();
			return makeAudioBuffer(channels, targetSampleRate);
		},
		dispose() {
			disposed = true;
			blocks.length = 0;
			current = null;
			void iterator.return?.(undefined);
		}
	};
}

/**
 * The rate a default `AudioContext` runs at on this device — the rate the
 * live analyser sees the track at. Bin N covers N × rate / fftSize Hz, so
 * analysing at another rate would shift every spectrum bar.
 */
async function resolveLiveSampleRate(): Promise<number> {
	if (typeof AudioContext === 'undefined') return FALLBACK_SAMPLE_RATE;
	try {
		const context = new AudioContext();
		const rate = context.sampleRate;
		await context.close();
		return rate > 0 ? rate : FALLBACK_SAMPLE_RATE;
	} catch {
		return FALLBACK_SAMPLE_RATE;
	}
}

/**
 * Opens an audio file for streaming export: metadata and a decoder, no
 * samples. The first audio track wins, matching the previous whole-buffer
 * path. Chunks are assumed contiguous from t=0 (what `AudioBufferSink`
 * yields for a single-audio-track file).
 */
export async function openOfflineAudioTrack(
	file: File | Blob,
	options: { fftSize: number }
): Promise<OfflineAudioTrack> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file)
	});
	try {
		const [track] = await input.getAudioTracks();
		if (!track) throw new Error('offline-audio-track-missing');
		const durationSec =
			(await track.getDurationFromMetadata()) ??
			(await track.computeDuration());
		const nativeSampleRate = await track.getSampleRate();
		const targetSampleRate = await resolveLiveSampleRate();
		const sink = new AudioBufferSink(track);
		const base = createOfflineAudioTrackFromChunks({
			chunks: (async function* () {
				for await (const wrapped of sink.buffers()) {
					yield wrapped.buffer;
				}
			})(),
			nativeSampleRate,
			channelCount: track.numberOfChannels,
			durationSec,
			targetSampleRate,
			lookaheadSamples: options.fftSize
		});
		return {
			...base,
			dispose() {
				base.dispose();
				input.dispose();
			}
		};
	} catch (error) {
		input.dispose();
		throw error;
	}
}
