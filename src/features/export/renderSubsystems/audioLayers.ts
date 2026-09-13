import { buildOverlayLayers } from '@/lib/layers';
import {
	createAudioLayerFrameRenderState,
	renderAudioLayerFrame,
	type AudioLayerFrameRenderState,
	type RenderableAudioLayer
} from '@/features/audioLayers/render';
import { resetLogo } from '@/features/logo';
import { resetSpectrum } from '@/features/spectrum/render';
import type { RenderFrameContext } from '../renderFrameContext';
import type { RenderSubsystem } from '../renderSubsystem';

type ScratchSurface = {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	frameState: AudioLayerFrameRenderState;
};

const surfaces = new Map<string, ScratchSurface>();

function ensureSize(canvas: HTMLCanvasElement, width: number, height: number) {
	if (canvas.width !== width) canvas.width = width;
	if (canvas.height !== height) canvas.height = height;
}

function getSurface(id: string, width: number, height: number): ScratchSurface {
	const existing = surfaces.get(id);
	if (existing) {
		ensureSize(existing.canvas, width, height);
		return existing;
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('audio-layer-subsystem-canvas-unavailable');
	const surface: ScratchSurface = {
		canvas,
		ctx,
		frameState: createAudioLayerFrameRenderState()
	};
	surfaces.set(id, surface);
	return surface;
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

function makeAudioLayerSubsystem(
	id: 'logo' | 'spectrum' | 'trackTitle' | 'lyrics',
	matches: (type: string) => boolean
): RenderSubsystem {
	return {
		id,
		render(ctx: RenderFrameContext) {
			if (!ctx.audio) return;
			const target = ctx.canvas.getContext('2d');
			if (!target) return;

			const layers = buildOverlayLayers(ctx.state)
				.filter(isRenderableAudioLayer)
				.filter(layer => matches(layer.type))
				.sort((a, b) => a.zIndex - b.zIndex);

			const dt = ctx.deltaMs / 1000;

			for (const layer of layers) {
				const surface = getSurface(
					`${id}:${layer.id}`,
					ctx.resolution.width,
					ctx.resolution.height
				);
				surface.ctx.clearRect(
					0,
					0,
					surface.canvas.width,
					surface.canvas.height
				);
				renderAudioLayerFrame({
					ctx: surface.ctx,
					canvas: surface.canvas,
					layer,
					state: ctx.state,
					audio: ctx.audio,
					dt,
					timeMs: ctx.timeMs,
					palette: ctx.palette,
					trackTitle: ctx.trackTitle,
					trackCurrentTime: ctx.trackCurrentTime,
					trackDuration: ctx.trackDuration,
					frameState: surface.frameState
				});
				target.drawImage(surface.canvas, 0, 0);
			}
		},
		reset() {
			if (id === 'logo') resetLogo();
			if (id === 'spectrum') resetSpectrum();
			for (const [key, surface] of surfaces) {
				if (key.startsWith(`${id}:`)) {
					surface.frameState = createAudioLayerFrameRenderState();
				}
			}
		},
		dispose() {
			for (const [key, surface] of [...surfaces]) {
				if (key.startsWith(`${id}:`)) {
					surface.canvas.width = 1;
					surface.canvas.height = 1;
					surfaces.delete(key);
				}
			}
		}
	};
}

export const logoSubsystem = makeAudioLayerSubsystem(
	'logo',
	type => type === 'logo'
);
export const spectrumSubsystem = makeAudioLayerSubsystem(
	'spectrum',
	type => type === 'spectrum'
);
export const trackTitleSubsystem = makeAudioLayerSubsystem(
	'trackTitle',
	type => type === 'track-title'
);
export const lyricsSubsystem = makeAudioLayerSubsystem(
	'lyrics',
	type => type === 'lyrics'
);
