/**
 * Offline video export — the frame loop.
 *
 * Freezes the project, plans the slideshow into per-image segments
 * (`slideshowSegments`), decodes the audio once, then for every frame
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
import { getCurrentViewportResolution } from '@/features/layout/viewportMetrics';
import {
	collectBundleFontSpecs,
	loadTrackFonts
} from '@/lib/canvasText/trackFonts';
import { pinRenderClock } from '@/lib/visual/renderClock';
import { buildOfflineContext } from '../buildRenderContext';
import { getRenderStateSnapshot } from '../getRenderStateSnapshot';
import { createOfflineAudioAnalysisSourceFromReader } from '../offlineAudioAnalysis';
import type { OfflineAudioTrack } from './offlineAudioTrack';
import { renderFrameAt } from '../renderFrame';
import {
	prepareAllRenderSubsystems,
	releaseRenderSubsystems,
	registerRenderSubsystem,
	resetAllRenderSubsystems,
	type RenderSubsystem
} from '../renderSubsystem';
import { installDefaultRenderSubsystems } from '../renderSubsystems';
import { createRenderScope, resetRenderScope } from '../renderScope';
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
import { createOfflineCameraFx } from './offlineCameraFx';
import {
	buildSlideshowSegments,
	findSlideshowSegmentAt,
	prepareSlideshowSegments
} from './slideshowSegments';

export type RunOfflineVideoExportOptions = {
	audioTrack: OfflineAudioTrack;
	format: OfflineVideoFormat;
	sink: OfflineVideoSink;
	width: number;
	height: number;
	fps: number;
	trackTitle: string;
	fftSize: number;
	audioSmoothing: number;
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

// The streaming track hands the encoder whole-channel slices itself; the
// runner only paces them by the video clock.

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
	const { audioTrack, width, height, fps, abortSignal } = options;
	const startedAt = performance.now();
	let renderStartedAt = startedAt;
	const durationMs = Math.round(audioTrack.durationSec * 1000);
	const frameCount = computeOfflineFrameCount(durationMs, fps);
	const renderScope = createRenderScope();

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
	const segments = await prepareSlideshowSegments(
		buildSlideshowSegments(frozen.state, durationMs, fps),
		frozen.state
	);
	// Lyrics and the track title paint web fonts on frame 0: load every face
	// first, or the opening frames fall back to system fonts.
	await loadTrackFonts(
		Object.values(frozen.state.audioLyricsByTrackAssetId ?? {}).flatMap(
			entry =>
				entry?.lyrixaBundle
					? collectBundleFontSpecs(entry.lyrixaBundle)
					: []
		)
	);
	await prepareAllRenderSubsystems(
		segments[0].state,
		segments.map(segment => segment.state)
	);
	abortSignal.throwIfAborted();

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const target = canvas.getContext('2d');
	if (!target) throw new Error('offline-export-canvas-unavailable');

	report('decoding');
	const analysis = createOfflineAudioAnalysisSourceFromReader(audioTrack, {
		fftSize: options.fftSize,
		smoothingTimeConstant: options.audioSmoothing
	});
	const encoder = await createOfflineVideoEncoder({
		canvas,
		fps,
		format: options.format,
		sink: options.sink
	});

	const cameraFx = createOfflineCameraFx(
		Math.min(
			getCurrentViewportResolution().width,
			getCurrentViewportResolution().height
		)
	);

	try {
		resetAllRenderSubsystems();
		// Own per-domain draw state for this run: the export must not advance
		// the live viewport's spectrum/logo/flash animation, and vice versa.
		resetRenderScope(renderScope);
		analysis.reset();

		const trackTitle = formatTrackTitle(options.trackTitle);
		const trackDuration = audioTrack.durationSec;
		const frameStepMs = 1000 / fps;
		const frameDurationSec = 1 / fps;
		const sampleRate = audioTrack.sampleRate;

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

			const segment = findSlideshowSegmentAt(segments, timeMs);
			// The analysis reads forward-only windows; pump the decode first.
			await audioTrack.ensureWindow(
				Math.round((timeMs / 1000) * sampleRate)
			);
			const audio = analysis.getSnapshotAt(timeMs);
			const resolveLayerTransform = cameraFx.step({
				state: segment.state,
				audio,
				timeMs,
				deltaMs: frameStepMs,
				resolution: { width, height }
			});
			// Pinned only while the frame draws: the live preview keeps real
			// time across the awaits below.
			pinRenderClock(timeMs);
			try {
				renderFrameAt(
					buildOfflineContext({
						canvas,
						state: segment.state,
						palette: segment.palette,
						audio,
						resolution: { width, height },
						timeMs,
						deltaMs: frameStepMs,
						trackTitle,
						trackCurrentTime: timeMs / 1000,
						trackDuration,
						abortSignal,
						scope: renderScope
					}),
					{ resolveLayerTransform }
				);
			} finally {
				pinRenderClock(null);
			}

			await encoder.addFrame(timeMs / 1000, frameDurationSec);

			// Encode audio up to the frame's end: the track stops at whatever
			// fits under the video clock, so audio never runs ahead of video.
			const videoSample = Math.round(
				((timeMs + frameStepMs) / 1000) * sampleRate
			);
			for (;;) {
				const slice = await audioTrack.nextSlice(videoSample);
				if (!slice) break;
				await encoder.addAudio(slice);
			}

			if (frameIndex % 15 === 0) {
				report('rendering', frameIndex);
				await yieldToBrowser();
			}
		}

		for (;;) {
			abortSignal.throwIfAborted();
			const slice = await audioTrack.nextSlice(Number.POSITIVE_INFINITY);
			if (!slice) break;
			await encoder.addAudio(slice);
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
		releaseRenderSubsystems();
		canvas.width = 1;
		canvas.height = 1;
	}
}
