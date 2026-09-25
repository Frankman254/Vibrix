import { buildOverlayLayers } from '@/lib/layers';
import {
	createAudioLayerFrameRenderState,
	renderAudioLayerFrame,
	type AudioLayerFrameRenderState,
	type RenderableAudioLayer
} from '@/features/audioLayers/render';
import {
	resolveSpectrumPartitions,
	type SpectrumDrawPartition
} from '@/features/spectrum/domain/spectrumCameraSplit';
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
	id: 'logo' | 'spectrum' | 'spectrum2' | 'trackTitle' | 'lyrics',
	matches: (type: string) => boolean,
	/**
	 * Which spectrums this subsystem draws, per frame. `null` means "nothing
	 * this frame" — that is the state of `spectrum2` while the camera is not
	 * splitting the two, so the live viewport and the export agree on who draws
	 * what without either of them duplicating pixels.
	 */
	resolvePartition: (
		ctx: RenderFrameContext
	) => SpectrumDrawPartition | null = () => 'all'
): RenderSubsystem {
	return {
		id,
		render(ctx: RenderFrameContext) {
			if (!ctx.audio) return;
			const target = ctx.canvas.getContext('2d');
			if (!target) return;

			const partition = resolvePartition(ctx);
			if (partition === null) return;

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
					frameState: surface.frameState,
					spectrumPartition: partition,
					logoScope: ctx.scope?.logo,
					spectrumScope: ctx.scope?.spectrum,
					flashEdge: ctx.scope?.flashEdge,
					trackTitleScope: ctx.scope?.trackTitle
				});
				target.drawImage(surface.canvas, 0, 0);
			}
		},
		reset() {
			// Per-domain draw state resets with the run's RenderScope
			// (resetRenderScope in the runner); resetting the module globals
			// here used to wipe the *live* viewport's state at export start.
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
	type => type === 'spectrum',
	ctx =>
		resolveSpectrumPartitions(ctx.state).includes('main') ? 'main' : 'all'
);

/** The second canvas, alive only while the camera moves Spectrum 2 apart. */
export const spectrum2Subsystem = makeAudioLayerSubsystem(
	'spectrum2',
	type => type === 'spectrum',
	ctx =>
		resolveSpectrumPartitions(ctx.state).includes('instances')
			? 'instances'
			: null
);
export const trackTitleSubsystem = makeAudioLayerSubsystem(
	'trackTitle',
	type => type === 'track-title'
);
export const lyricsSubsystem = makeAudioLayerSubsystem(
	'lyrics',
	type => type === 'lyrics'
);
