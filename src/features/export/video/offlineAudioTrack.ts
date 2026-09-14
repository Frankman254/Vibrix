/**
 * Offline video export — the streaming audio track.
 *
 * The export used to decode the whole song into one `AudioBuffer` before the
 * first frame: a 3-hour mix is ~1.8 GB per hour of stereo float32 and crashed
 * the tab. This module keeps the same data flowing instead of holding it:
 * mediabunny decodes the file chunk by chunk and each chunk feeds two
 * forward-only readers.
 *
 * - The audio analysis reads the fft window at the current frame time via
 *   `ensureWindow` + `fillWindow`. It sees a mono mix linearly resampled to
 *   the live analyser's sample rate (bin N covers N × rate / fftSize Hz, so
 *   analysing at any other rate would shift every spectrum bar).
 * - The encoder pulls whole-channel slices with `nextSlice(limitSample)`,
 *   paced by the video clock so encoded audio never runs ahead. Those slices
 *   are the decoder's samples untouched, at the file's native rate: linear
 *   resampling aliases audibly, and the analyser rate is irrelevant to the
 *   listener.
 *
 * Memory stays bounded because each reader drops what it has passed: the
 * analysis ring holds about one fft window, the encoder queue about one slice.
 *
 * The chunk stream is a seam with two adapters: the mediabunny pump here, and
 * hand-built chunk lists in tests.
 */
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

const FALLBACK_SAMPLE_RATE = 44100;
/** One second of audio per encoder slice. */
const AUDIO_SLICE_SECONDS = 1;

export type OfflineAudioTrack = {
	/** The live analyser's rate: `ensureWindow`/`fillWindow`/limits use it. */
	readonly sampleRate: number;
	/** The file's decoded rate: `nextSlice` buffers carry it. */
	readonly nativeSampleRate: number;
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
	 * samples the analysis has passed read as zero (forward-only reader).
	 */
	fillWindow(endSample: number, out: Float32Array): void;
	/**
	 * The next whole-channel slice at `nativeSampleRate`, ending at most at
	 * the native position of `limitSample` (given at `sampleRate`) and at most
	 * one second long, or null when nothing can be emitted under the limit
	 * yet — which after EOF means the track is exhausted. Slices are handed
	 * out in order, never rewound. Only on tracks opened with `feedsEncoder`.
	 */
	nextSlice(limitSample: number): Promise<AudioBuffer | null>;
	dispose(): void;
};

type AudioBlock = {
	/** Absolute index (at the analysis rate) of this block's first sample. */
	startSample: number;
	mono: Float32Array;
};

export type OfflineAudioTrackFromChunksOptions = {
	/** Chunks as the decoder yields them: full quality, native rate, in order. */
	chunks: AsyncIterable<AudioBuffer>;
	nativeSampleRate: number;
	channelCount: number;
	durationSec: number;
	/** What the analysis sees samples at (the live AudioContext's rate). */
	targetSampleRate: number;
	/** Samples a `fillWindow` caller needs behind its window end (the fft size). */
	lookaheadSamples?: number;
	/**
	 * Keep native chunks for `nextSlice`. Off for analysis-only readers, which
	 * would otherwise retain every decoded chunk they pump past.
	 */
	feedsEncoder?: boolean;
	/** Max native samples per `nextSlice`. Defaults to one second. */
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
 * The reader core: resampling, block bookkeeping, and the two reader cursors.
 * Pure logic over an async iterable of decoded chunks, so tests can drive it
 * without WebCodecs.
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
		feedsEncoder = false,
		sliceSamples = Math.max(
			1,
			Math.round(nativeSampleRate * AUDIO_SLICE_SECONDS)
		),
		makeAudioBuffer = makeAudioBufferFromChannels
	} = options;

	const ratio = nativeSampleRate / targetSampleRate;
	const totalSamples = Math.max(
		0,
		Math.round(durationSec * targetSampleRate)
	);

	const iterator = chunks[Symbol.asyncIterator]();
	/**
	 * The current chunk's channel data, read ONCE per chunk. Brave's
	 * fingerprinting protection re-scales an AudioBuffer's samples in place on
	 * every `getChannelData` call, so reading it per sample faded each decoded
	 * chunk towards silence.
	 */
	let current: Float32Array[] | null = null;
	/** Global index (native rate) of the current chunk's first sample. */
	let chunkStart = 0;
	/** Last sample of the previous chunk, per channel (interpolation history). */
	let prevLast: Float32Array[] | null = null;
	let sourceExhausted = false;
	/** Next analysis-rate sample index produced. */
	let produced = 0;

	const blocks: AudioBlock[] = [];
	/** First analysis sample still needed. */
	let analysisFloor = 0;

	/** Native chunks the encoder has not fully consumed, oldest first. */
	const nativeQueue: Float32Array[][] = [];
	/** Global native index of `nativeQueue[0]`'s first sample. */
	let nativeQueueStart = 0;
	/** Next native sample handed to the encoder. */
	let encoderCursor = 0;
	let disposed = false;

	function nativeSample(globalIndex: number, channel: number): number {
		if (current) {
			if (globalIndex === chunkStart - 1 && prevLast) {
				return prevLast[channel][0];
			}
			const data = current[channel];
			const local = globalIndex - chunkStart;
			if (local >= 0 && local < data.length) {
				return data[local];
			}
			// At EOF the interpolation partner of the boundary sample does
			// not exist: hold the last native value so the final target
			// sample is decidable instead of zero-padded.
			if (sourceExhausted && globalIndex === lastNativeIndex() + 1) {
				return data[data.length - 1];
			}
		}
		return 0;
	}

	function lastNativeIndex(): number {
		return current ? chunkStart + current[0].length - 1 : -1;
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
					const data = previous[channel];
					return Float32Array.of(data[data.length - 1]);
				}
			);
			chunkStart += previous[0].length;
		}
		const chunk = next.value;
		current = Array.from({ length: channelCount }, (_unused, channel) =>
			chunk.getChannelData(Math.min(channel, chunk.numberOfChannels - 1))
		);
		if (feedsEncoder) nativeQueue.push(current);
		return true;
	}

	/** Linearly resamples analysis samples [from, to) from the current chunk. */
	function produceRange(from: number, to: number): void {
		const count = to - from;
		const mono = new Float32Array(count);
		for (let offset = 0; offset < count; offset += 1) {
			const position = (from + offset) * ratio;
			const low = Math.floor(position);
			const frac = position - low;
			let sum = 0;
			for (let channel = 0; channel < channelCount; channel += 1) {
				const lowValue = nativeSample(low, channel);
				sum +=
					lowValue +
					(nativeSample(low + 1, channel) - lowValue) * frac;
			}
			mono[offset] = sum / channelCount;
		}
		blocks.push({ startSample: from, mono });
		produced = to;
	}

	/** Past EOF: zero-pad to `stop`, matching the old full-buffer path's
	 * out-of-range reads. */
	function produceTail(stop: number): void {
		if (stop <= produced) return;
		blocks.push({
			startSample: produced,
			mono: new Float32Array(stop - produced)
		});
		produced = stop;
	}

	/** Serialises pumps so the two readers share one decode pull. */
	let pumping: Promise<void> = Promise.resolve();

	function serialised(task: () => Promise<void>): Promise<void> {
		const run = pumping.then(async () => {
			if (disposed) throw new Error('offline-audio-track-disposed');
			await task();
		});
		// Keep the chain alive after a rejection; callers see it via `run`.
		pumping = run.catch(() => undefined);
		return run;
	}

	async function produceThrough(target: number): Promise<void> {
		const stop = Math.min(Math.max(target, 0), totalSamples);
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
	}

	function nativeAvailable(): number {
		return lastNativeIndex() + 1;
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

	function retained(index: number): number {
		if (index < 0 || index >= totalSamples) return 0;
		const block = blockFor(index);
		if (!block) return 0;
		const local = index - block.startSample;
		return local < block.mono.length ? block.mono[local] : 0;
	}

	function dropAnalysed(): void {
		while (
			blocks.length > 0 &&
			blocks[0].startSample + blocks[0].mono.length <= analysisFloor
		) {
			blocks.shift();
		}
	}

	function takeNative(end: number): Float32Array[] {
		const out = Array.from(
			{ length: channelCount },
			() => new Float32Array(end - encoderCursor)
		);
		let written = 0;
		while (encoderCursor < end) {
			const chunk = nativeQueue[0];
			const local = encoderCursor - nativeQueueStart;
			const take = Math.min(chunk[0].length - local, end - encoderCursor);
			for (let channel = 0; channel < channelCount; channel += 1) {
				out[channel].set(
					chunk[channel].subarray(local, local + take),
					written
				);
			}
			written += take;
			encoderCursor += take;
			if (encoderCursor - nativeQueueStart >= chunk[0].length) {
				nativeQueueStart += chunk[0].length;
				nativeQueue.shift();
			}
		}
		return out;
	}

	return {
		sampleRate: targetSampleRate,
		nativeSampleRate,
		channelCount,
		durationSec,
		async ensureWindow(endSample: number) {
			await serialised(() => produceThrough(endSample));
			analysisFloor = Math.max(
				analysisFloor,
				Math.min(endSample, totalSamples) - lookaheadSamples
			);
			dropAnalysed();
		},
		fillWindow(endSample: number, out: Float32Array) {
			const start = endSample - out.length;
			for (let index = 0; index < out.length; index += 1) {
				out[index] = retained(start + index);
			}
		},
		async nextSlice(limitSample: number) {
			if (!feedsEncoder) {
				throw new Error('offline-audio-track-not-encoder');
			}
			const limitNative =
				limitSample === Number.POSITIVE_INFINITY
					? Number.POSITIVE_INFINITY
					: Math.round(limitSample * ratio);
			const want = Math.min(limitNative, encoderCursor + sliceSamples);
			let end = encoderCursor;
			await serialised(async () => {
				// Pulling only through the resampler keeps its chunk history
				// intact; once it is done, drain the rest of the file.
				while (!sourceExhausted && nativeAvailable() < want) {
					if (produced < totalSamples) {
						await produceThrough(
							Math.min(
								totalSamples,
								Math.max(
									produced + 1,
									Math.ceil(want / ratio) + 1
								)
							)
						);
					} else {
						await pullNextChunk();
					}
				}
				end = Math.min(want, nativeAvailable());
			});
			if (end <= encoderCursor) return null;
			return makeAudioBuffer(takeNative(end), nativeSampleRate);
		},
		dispose() {
			disposed = true;
			blocks.length = 0;
			nativeQueue.length = 0;
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
 * Opens an audio file for streaming: metadata and a decoder, no samples. The
 * first audio track wins, matching the previous whole-buffer path. Chunks are
 * assumed contiguous from t=0 (what `AudioBufferSink` yields for a
 * single-audio-track file). Pass `feedsEncoder` when `nextSlice` is used.
 */
export async function openOfflineAudioTrack(
	file: File | Blob,
	options: { fftSize: number; feedsEncoder?: boolean }
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
			lookaheadSamples: options.fftSize,
			feedsEncoder: options.feedsEncoder
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
