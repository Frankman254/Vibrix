import { buildOverlayLayers } from '@/lib/layers';
import { formatTrackTitle } from '@/lib/audio/trackTitle';
import {
	getEditorThemePalette,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import { resetLogo } from '@/features/logo';
import { resetSpectrum } from '@/features/spectrum/render';
import {
	createAudioLayerFrameRenderState,
	renderAudioLayerFrame,
	type AudioLayerFrameRenderState,
	type RenderableAudioLayer
} from '@/features/audioLayers/render';
import type { WallpaperState } from '@/types/wallpaper';
import type { OfflineAudioAnalysisSource } from './offlineAudioAnalysis';
import type { OfflineRenderFrameContext } from './offlineExportTypes';

type ScratchLayerSurface = {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	frameState: AudioLayerFrameRenderState;
};

export type OfflineAudioLayerRenderSessionOptions = {
	canvas: HTMLCanvasElement;
	state: WallpaperState;
	audioSource: OfflineAudioAnalysisSource;
	backgroundPalette?: BackgroundPalette;
	trackTitle?: string;
};

export interface OfflineAudioLayerRenderSession {
	renderFrame(context: OfflineRenderFrameContext): void;
	dispose(): void;
}

function isRenderableAudioLayer(layer: {
	type: string;
	enabled: boolean;
}): layer is RenderableAudioLayer {
	return (
		layer.enabled &&
		(layer.type === 'logo' ||
			layer.type === 'spectrum' ||
			layer.type === 'track-title' ||
			layer.type === 'lyrics')
	);
}

function ensureCanvasSize(
	canvas: HTMLCanvasElement,
	width: number,
	height: number
) {
	if (canvas.width !== width) canvas.width = width;
	if (canvas.height !== height) canvas.height = height;
}

function createScratchSurface(
	width: number,
	height: number
): ScratchLayerSurface {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('offline-audio-layer-canvas-unavailable');
	return {
		canvas,
		ctx,
		frameState: createAudioLayerFrameRenderState()
	};
}

export function createOfflineAudioLayerRenderSession({
	canvas,
	state,
	audioSource,
	backgroundPalette,
	trackTitle
}: OfflineAudioLayerRenderSessionOptions): OfflineAudioLayerRenderSession {
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('offline-export-canvas-context-unavailable');

	const palette =
		backgroundPalette ?? getEditorThemePalette(state.editorTheme);
	const renderedTrackTitle = formatTrackTitle(trackTitle ?? '');
	const audioLayers = buildOverlayLayers(state)
		.filter(isRenderableAudioLayer)
		.sort((a, b) => a.zIndex - b.zIndex);
	const scratchSurfaces = new Map<string, ScratchLayerSurface>();

	// Current logo/spectrum renderers still keep runtime state in module scope.
	// Resetting here makes a standalone export session deterministic from frame 0.
	resetLogo();
	resetSpectrum();
	audioSource.reset();

	function getScratchSurface(layerId: string): ScratchLayerSurface {
		const existing = scratchSurfaces.get(layerId);
		if (existing) {
			ensureCanvasSize(existing.canvas, canvas.width, canvas.height);
			return existing;
		}

		const created = createScratchSurface(canvas.width, canvas.height);
		scratchSurfaces.set(layerId, created);
		return created;
	}

	return {
		renderFrame(frameContext: OfflineRenderFrameContext) {
			frameContext.abortSignal?.throwIfAborted();
			ensureCanvasSize(canvas, frameContext.width, frameContext.height);
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			const audio = audioSource.getSnapshotAt(frameContext.timeMs);
			const trackCurrentTime = frameContext.timeMs / 1000;
			const trackDuration = audioSource.summary.durationMs / 1000;
			const dt = frameContext.deltaMs / 1000;

			for (const layer of audioLayers) {
				frameContext.abortSignal?.throwIfAborted();
				const scratch = getScratchSurface(layer.id);
				scratch.ctx.clearRect(
					0,
					0,
					scratch.canvas.width,
					scratch.canvas.height
				);
				renderAudioLayerFrame({
					ctx: scratch.ctx,
					canvas: scratch.canvas,
					layer,
					state,
					audio,
					dt,
					timeMs: frameContext.timeMs,
					palette,
					trackTitle: renderedTrackTitle,
					trackCurrentTime,
					trackDuration,
					frameState: scratch.frameState
				});
				ctx.drawImage(scratch.canvas, 0, 0);
			}
		},
		dispose() {
			scratchSurfaces.forEach(surface => {
				surface.ctx.clearRect(
					0,
					0,
					surface.canvas.width,
					surface.canvas.height
				);
				surface.canvas.width = 1;
				surface.canvas.height = 1;
			});
			scratchSurfaces.clear();
			audioSource.dispose();
		}
	};
}
