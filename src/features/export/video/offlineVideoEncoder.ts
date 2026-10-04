/**
 * Offline video export — the only module that talks to mediabunny.
 *
 * Wraps WebCodecs encoding and MP4/WebM muxing behind three calls: add a
 * frame, add audio, finish. Everything else in the export (frame loop,
 * progress, UI) stays library-agnostic, so swapping the muxer later touches
 * this file alone.
 */
import {
	AudioBufferSource,
	BufferTarget,
	CanvasSource,
	Mp4OutputFormat,
	Output,
	Quality,
	QUALITY_HIGH,
	StreamTarget,
	WebMOutputFormat,
	canEncodeAudio,
	type StreamTargetChunk
} from 'mediabunny';
import type {
	OfflineEncoderProbe,
	OfflineVideoEncoderPlan,
	VideoEncoderCandidate,
	VideoProbeSize
} from './offlineEncoderNegotiation';

/**
 * The exact `VideoEncoderConfig` mediabunny will hand to WebCodecs for this
 * candidate. Building it here — instead of letting the library derive a codec
 * string from a bitrate guess at first-frame time — is what makes the
 * pre-flight probe and the real encode the same question. Every field the
 * library sets is set here, `framerate` included: Windows H.264 encoders
 * answer differently once a frame rate is in the config, which is how an
 * export could pass its probe and still die three minutes in.
 */
export function buildVideoEncoderConfig(
	candidate: VideoEncoderCandidate,
	size: VideoProbeSize
): VideoEncoderConfig {
	return {
		codec: candidate.codecString,
		width: size.width,
		height: size.height,
		bitrate: candidate.bitrate,
		bitrateMode: 'variable',
		framerate: size.fps,
		alpha: 'discard',
		hardwareAcceleration: candidate.hardwareAcceleration,
		// Mediabunny asks for length-prefixed samples, not Annex B; the probe
		// has to ask for the same thing or it is probing another config.
		...(candidate.videoCodec === 'avc'
			? { avc: { format: 'avc' as const } }
			: candidate.videoCodec === 'hevc'
				? { hevc: { format: 'hevc' as const } }
				: {})
	};
}

/**
 * Capability probe backed by WebCodecs itself. Video goes straight to
 * `VideoEncoder.isConfigSupported()` so the answer covers the whole config;
 * audio stays on mediabunny's helper, which wraps
 * `AudioEncoder.isConfigSupported()` with the same quality the export uses.
 */
export const webCodecsEncoderProbe: OfflineEncoderProbe = {
	async canEncodeVideo(candidate, size) {
		if (typeof VideoEncoder === 'undefined') return false;
		// H.264 and HEVC are 4:2:0: odd dimensions are rejected downstream
		// whatever the probe says.
		if (
			(candidate.videoCodec === 'avc' ||
				candidate.videoCodec === 'hevc') &&
			(size.width % 2 === 1 || size.height % 2 === 1)
		) {
			return false;
		}
		const support = await VideoEncoder.isConfigSupported(
			buildVideoEncoderConfig(candidate, size)
		);
		return support.supported === true;
	},
	canEncodeAudio: (codec, audio) =>
		canEncodeAudio(codec, { ...audio, quality: QUALITY_HIGH })
};

export type OfflineVideoSink =
	| { kind: 'stream'; writable: WritableStream<StreamTargetChunk> }
	| { kind: 'buffer' };

/**
 * Streams the muxer's writes into a file picked with `showSaveFilePicker`.
 *
 * mediabunny closes the stream it is given both when it finishes and when it
 * is cancelled. Closing a file handle commits it, which would leave a broken
 * half-video on disk after Cancel — so the proxy turns a close during a
 * cancelled export into an abort, which discards the file instead.
 */
export function createCancellableFileWritable(
	file: FileSystemWritableFileStream,
	isCancelled: () => boolean
): WritableStream<StreamTargetChunk> {
	return new WritableStream<StreamTargetChunk>({
		write: chunk =>
			file.write({
				type: 'write',
				position: chunk.position,
				data: chunk.data
			}),
		close: () => (isCancelled() ? file.abort() : file.close()),
		abort: reason => file.abort(reason)
	});
}

/**
 * Counts the bytes the muxer pushed into a stream sink so a finished export
 * can report the real file size. Long exports at 4K run to gigabytes; without
 * the number the user has to open the folder and check.
 */
export function createCountingWritable(
	inner: WritableStream<StreamTargetChunk>,
	counter: { bytes: number }
): WritableStream<StreamTargetChunk> {
	const writer = inner.getWriter();
	return new WritableStream<StreamTargetChunk>({
		write: chunk => {
			counter.bytes += chunk.data.byteLength;
			return writer.write(chunk);
		},
		close: () => {
			writer.releaseLock();
			return inner.close();
		},
		abort: reason => {
			writer.releaseLock();
			return inner.abort(reason);
		}
	});
}

export type OfflineVideoEncoder = {
	addFrame(timestampSec: number, durationSec: number): Promise<void>;
	addAudio(buffer: AudioBuffer): Promise<void>;
	/** Resolves with the file for buffer sinks, null for stream sinks. */
	finish(): Promise<Blob | null>;
	cancel(): Promise<void>;
};

export async function createOfflineVideoEncoder(options: {
	canvas: HTMLCanvasElement;
	fps: number;
	plan: OfflineVideoEncoderPlan;
	sink: OfflineVideoSink;
}): Promise<OfflineVideoEncoder> {
	const { canvas, fps, plan, sink } = options;
	const { format, video } = plan;
	const bufferTarget = sink.kind === 'buffer' ? new BufferTarget() : null;
	const target =
		sink.kind === 'stream'
			? new StreamTarget(sink.writable, { chunked: true })
			: bufferTarget!;
	const outputFormat =
		format.container === 'mp4'
			? new Mp4OutputFormat({
					// The file must be playable from its first byte: QuickTime
					// needs the whole `moov` before it shows a duration at all,
					// and opening a 1.3 GB moov-at-end file costs it ~2 minutes.
					// A buffer keeps the index up front in memory; a stream
					// can't seek the whole file back, so it gets a fragmented
					// MP4 whose header ships at the front and whose halves
					// stay playable even mid-write.
					fastStart:
						sink.kind === 'buffer' ? 'in-memory' : 'fragmented'
				})
			: new WebMOutputFormat();

	// No probing here and no fallback: `plan` is a config that already passed
	// `VideoEncoder.isConfigSupported()` in `negotiateOfflineVideoEncoder`,
	// and these fields reproduce it exactly — codec string, VBR bitrate and
	// hardware hint. A mismatch would mean rendering frames into an encoder
	// that then refuses the very first one.
	if (
		canvas.width !== plan.width ||
		canvas.height !== plan.height ||
		fps !== plan.fps
	) {
		throw new Error('offline-export-encoder-plan-mismatch');
	}

	const output = new Output({ format: outputFormat, target });
	const videoSource = new CanvasSource(canvas, {
		codec: format.videoCodec,
		fullCodecString: video.codecString,
		quality: new Quality({
			bitrate: video.bitrate,
			bitrateMode: 'variable'
		}),
		hardwareAcceleration: video.hardwareAcceleration,
		keyFrameInterval: 2
	});
	const audioSource = new AudioBufferSource({
		codec: format.audioCodec,
		quality: QUALITY_HIGH
	});
	output.addVideoTrack(videoSource, { frameRate: fps });
	output.addAudioTrack(audioSource);
	await output.start();

	return {
		addFrame: (timestampSec, durationSec) =>
			videoSource.add(timestampSec, durationSec),
		addAudio: buffer => audioSource.add(buffer),
		async finish() {
			await output.finalize();
			if (!bufferTarget?.buffer) return null;
			return new Blob([bufferTarget.buffer], { type: format.mimeType });
		},
		async cancel() {
			if (output.state === 'canceled' || output.state === 'finalized') {
				return;
			}
			await output.cancel();
		}
	};
}
