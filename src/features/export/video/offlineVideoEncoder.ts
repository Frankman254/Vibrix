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
	QUALITY_HIGH,
	StreamTarget,
	WebMOutputFormat,
	canEncodeAudio,
	canEncodeVideo,
	type StreamTargetChunk
} from 'mediabunny';
import type {
	OfflineCodecProbe,
	OfflineVideoFormat
} from './offlineVideoFormat';

export const mediabunnyCodecProbe: OfflineCodecProbe = {
	canEncodeVideo: (codec, size) =>
		canEncodeVideo(codec, { ...size, quality: QUALITY_HIGH }),
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
	format: OfflineVideoFormat;
	sink: OfflineVideoSink;
}): Promise<OfflineVideoEncoder> {
	const { canvas, fps, format, sink } = options;
	const bufferTarget = sink.kind === 'buffer' ? new BufferTarget() : null;
	const target =
		sink.kind === 'stream'
			? new StreamTarget(sink.writable, { chunked: true })
			: bufferTarget!;
	const outputFormat =
		format.container === 'mp4'
			? new Mp4OutputFormat({
					// A stream can seek back to patch the header; a buffer keeps
					// the index up front so the file plays while downloading.
					fastStart: sink.kind === 'buffer' ? 'in-memory' : false
				})
			: new WebMOutputFormat();

	const output = new Output({ format: outputFormat, target });
	const videoSource = new CanvasSource(canvas, {
		codec: format.videoCodec,
		quality: QUALITY_HIGH,
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
