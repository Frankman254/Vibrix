import { formatTrackTitle } from '@/lib/audio/trackTitle';
import type { OfflineAudioAnalysisSource } from './offlineAudioAnalysis';
import type { OfflineExportFps } from './offlineExportTypes';
import { buildOfflineContext } from './buildRenderContext';
import { renderFrameAt, type RenderFrameOptions } from './renderFrame';
import { getRenderStateSnapshot } from './getRenderStateSnapshot';
import {
	resetAllRenderSubsystems,
	listRegisteredSubsystems
} from './renderSubsystem';
import { installDefaultRenderSubsystems } from './renderSubsystems';
import { createRenderScope, resetRenderScope } from './renderScope';

export type RunOfflineRenderTestOptions = {
	canvas: HTMLCanvasElement;
	durationMs: number;
	fps: OfflineExportFps;
	width: number;
	height: number;
	audioSource: OfflineAudioAnalysisSource | null;
	trackTitle?: string;
	abortSignal?: AbortSignal;
	onFrame?: (frameIndex: number, totalFrames: number) => void;
	renderOptions?: RenderFrameOptions;
};

export type OfflineRenderTestResult = {
	frameCount: number;
	durationMs: number;
	fps: OfflineExportFps;
	subsystemsRendered: number;
};

export async function runOfflineRenderTest(
	options: RunOfflineRenderTestOptions
): Promise<OfflineRenderTestResult> {
	installDefaultRenderSubsystems();

	const { canvas, durationMs, fps, width, height } = options;
	if (canvas.width !== width) canvas.width = width;
	if (canvas.height !== height) canvas.height = height;

	const target = canvas.getContext('2d');
	if (!target) throw new Error('offline-render-test-canvas-unavailable');

	const snapshot = getRenderStateSnapshot();
	const renderedTrackTitle = formatTrackTitle(options.trackTitle ?? '');
	const trackDurationSeconds = options.audioSource
		? options.audioSource.summary.durationMs / 1000
		: durationMs / 1000;

	resetAllRenderSubsystems();
	const scope = createRenderScope();
	resetRenderScope(scope);
	options.audioSource?.reset();

	const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps));
	const frameStepMs = 1000 / fps;
	let lastTimeMs = 0;

	for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
		options.abortSignal?.throwIfAborted();
		const timeMs = frameIndex * frameStepMs;
		const deltaMs = frameIndex === 0 ? frameStepMs : timeMs - lastTimeMs;
		lastTimeMs = timeMs;

		target.clearRect(0, 0, canvas.width, canvas.height);

		const audio = options.audioSource
			? options.audioSource.getSnapshotAt(timeMs)
			: null;
		const ctx = buildOfflineContext({
			canvas,
			state: snapshot.state,
			palette: snapshot.palette,
			audio,
			resolution: { width, height },
			timeMs,
			deltaMs,
			trackTitle: renderedTrackTitle,
			trackCurrentTime: timeMs / 1000,
			trackDuration: trackDurationSeconds,
			abortSignal: options.abortSignal,
			scope
		});

		renderFrameAt(ctx, options.renderOptions);
		options.onFrame?.(frameIndex, frameCount);

		if (frameIndex % 10 === 0) {
			await Promise.resolve();
		}
	}

	return {
		frameCount,
		durationMs,
		fps,
		subsystemsRendered: listRegisteredSubsystems().length
	};
}
