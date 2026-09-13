/**
 * Offline video export — the frame loop.
 *
 * Freezes the project, decodes the audio once, then for every frame
 * `t = i / fps`: analyse the audio at `t`, draw every registered render
 * subsystem into one canvas, hand the canvas to the encoder. Nothing here
 * reads the wall clock for rendering, so the result does not depend on the
 * tab being visible or the machine being fast.
 *
 * Audio is fed to the encoder in one-second slices that trail the video, so
 * the muxer interleaves both tracks as it goes instead of holding a whole
 * song of encoded audio waiting for video.
 */
import { formatTrackTitle } from '@/lib/audio/trackTitle';
import {
	getBackgroundPalette,
	resolvePaletteSourceUrl
} from '@/lib/backgroundPalette';
import { buildOfflineContext } from '../buildRenderContext';
import { getRenderStateSnapshot } from '../getRenderStateSnapshot';
import { createOfflineAudioAnalysisSourceFromBuffer } from '../offlineAudioAnalysis';
import { renderFrameAt } from '../renderFrame';
import {
	prepareAllRenderSubsystems,
	registerRenderSubsystem,
	resetAllRenderSubsystems,
	type RenderSubsystem
} from '../renderSubsystem';
import { installDefaultRenderSubsystems } from '../renderSubsystems';
import {
	createOfflineVideoEncoder,
	type OfflineVideoSink
} from './offlineVideoEncoder';
import {
	computeOfflineExportRatio,
	computeOfflineFrameCount,
	estimateOfflineExportEtaMs,
	type OfflineVideoExportPhase,
	type OfflineVideoExportProgress,
	type OfflineVideoFormat
} from './offlineVideoFormat';

export type RunOfflineVideoExportOptions = {
	audioBuffer: AudioBuffer;
	format: OfflineVideoFormat;
	sink: OfflineVideoSink;
	width: number;
	height: number;
	fps: number;
	trackTitle: string;
	fftSize: number;
	audioChannelSmoothing: number;
	/**
	 * Subsystems owned by the presentation layer (the background renderer
	 * lives under `components/`), injected so this domain never imports it.
	 */
	extraSubsystems?: RenderSubsystem[];
	abortSignal: AbortSignal;
	onProgress?: (progress: OfflineVideoExportProgress) => void;
};

export type OfflineVideoExportResult = {
	blob: Blob | null;
	frameCount: number;
	durationMs: number;
	elapsedMs: number;
};

const AUDIO_SLICE_SECONDS = 1;

function sliceAudioBuffer(
	source: AudioBuffer,
	startSample: number,
	endSample: number
): AudioBuffer {
	const length = Math.max(1, endSample - startSample);
	const slice = new AudioBuffer({
		length,
		numberOfChannels: source.numberOfChannels,
		sampleRate: source.sampleRate
	});
	for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
		slice.copyToChannel(
			source.getChannelData(channel).subarray(startSample, endSample),
			channel
		);
	}
	return slice;
}

// A MessageChannel hop lets React paint the progress bar without going
// through `setTimeout`, which background tabs throttle to once a second.
function yieldToBrowser(): Promise<void> {
	return new Promise(resolve => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => {
			channel.port1.close();
			resolve();
		};
		channel.port2.postMessage(null);
	});
}

export async function runOfflineVideoExport(
	options: RunOfflineVideoExportOptions
): Promise<OfflineVideoExportResult> {
	const { audioBuffer, width, height, fps, abortSignal } = options;
	const startedAt = performance.now();
	let renderStartedAt = startedAt;
	const durationMs = Math.round(audioBuffer.duration * 1000);
	const frameCount = computeOfflineFrameCount(durationMs, fps);

	const report = (phase: OfflineVideoExportPhase, frameIndex = 0) => {
		const now = performance.now();
		options.onProgress?.({
			phase,
			frameIndex,
			frameCount,
			ratio: computeOfflineExportRatio(phase, frameIndex, frameCount),
			elapsedMs: now - startedAt,
			etaMs:
				phase === 'rendering'
					? estimateOfflineExportEtaMs(
							now - renderStartedAt,
							frameIndex,
							frameCount
						)
					: null
		});
	};

	report('preparing');
	installDefaultRenderSubsystems();
	for (const subsystem of options.extraSubsystems ?? []) {
		registerRenderSubsystem(subsystem);
	}

	const frozen = getRenderStateSnapshot();
	// The live layers colour themselves from the palette extracted from the
	// background image (`useBackgroundPalette`), not the editor theme.
	const snapshot = getRenderStateSnapshot({
		palette: await getBackgroundPalette(
			resolvePaletteSourceUrl(frozen.state)
		)
	});
	await prepareAllRenderSubsystems(snapshot.state);
	abortSignal.throwIfAborted();

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const target = canvas.getContext('2d');
	if (!target) throw new Error('offline-export-canvas-unavailable');

	report('decoding');
	const analysis = createOfflineAudioAnalysisSourceFromBuffer(audioBuffer, {
		fftSize: options.fftSize,
		channelSmoothing: options.audioChannelSmoothing
	});
	const encoder = await createOfflineVideoEncoder({
		canvas,
		fps,
		format: options.format,
		sink: options.sink
	});

	try {
		resetAllRenderSubsystems();
		analysis.reset();

		const trackTitle = formatTrackTitle(options.trackTitle);
		const trackDuration = audioBuffer.duration;
		const frameStepMs = 1000 / fps;
		const frameDurationSec = 1 / fps;
		const samplesPerSlice = Math.round(
			audioBuffer.sampleRate * AUDIO_SLICE_SECONDS
		);
		let audioSampleCursor = 0;

		renderStartedAt = performance.now();
		report('rendering');

		for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
			abortSignal.throwIfAborted();
			const timeMs = frameIndex * frameStepMs;

			// MP4 has no alpha: start every frame from opaque black, the same
			// ground the live viewport sits on.
			target.globalCompositeOperation = 'source-over';
			target.globalAlpha = 1;
			target.fillStyle = '#000';
			target.fillRect(0, 0, width, height);

			renderFrameAt(
				buildOfflineContext({
					canvas,
					state: snapshot.state,
					palette: snapshot.palette,
					audio: analysis.getSnapshotAt(timeMs),
					resolution: { width, height },
					timeMs,
					deltaMs: frameStepMs,
					trackTitle,
					trackCurrentTime: timeMs / 1000,
					trackDuration,
					abortSignal
				})
			);

			await encoder.addFrame(timeMs / 1000, frameDurationSec);

			const videoSample = Math.round(
				((timeMs + frameStepMs) / 1000) * audioBuffer.sampleRate
			);
			while (
				audioSampleCursor < audioBuffer.length &&
				audioSampleCursor < videoSample
			) {
				const end = Math.min(
					audioBuffer.length,
					audioSampleCursor + samplesPerSlice
				);
				await encoder.addAudio(
					sliceAudioBuffer(audioBuffer, audioSampleCursor, end)
				);
				audioSampleCursor = end;
			}

			if (frameIndex % 15 === 0) {
				report('rendering', frameIndex);
				await yieldToBrowser();
			}
		}

		while (audioSampleCursor < audioBuffer.length) {
			abortSignal.throwIfAborted();
			const end = Math.min(
				audioBuffer.length,
				audioSampleCursor + samplesPerSlice
			);
			await encoder.addAudio(
				sliceAudioBuffer(audioBuffer, audioSampleCursor, end)
			);
			audioSampleCursor = end;
		}

		report('finalizing', frameCount);
		const blob = await encoder.finish();
		report('done', frameCount);

		return {
			blob,
			frameCount,
			durationMs,
			elapsedMs: performance.now() - startedAt
		};
	} catch (error) {
		await encoder.cancel().catch(() => undefined);
		throw error;
	} finally {
		analysis.dispose();
		canvas.width = 1;
		canvas.height = 1;
	}
}
