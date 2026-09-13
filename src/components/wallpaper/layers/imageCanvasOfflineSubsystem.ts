/**
 * The background image, drawn for the offline video export.
 *
 * Reuses `renderImageCanvasFrame` — the exact function the live
 * `ImageLayerCanvas` calls every animation frame — with plain `{ current }`
 * refs in place of React refs and the export clock in place of rAF time. Same
 * geometry, filters, bass zoom and mirror fill as the preview, by
 * construction.
 *
 * Lives next to the live renderer because `features/export` may not import
 * `components/`; the Export tab injects it into the frame loop instead.
 */
import { createAudioChannelSelectionState } from '@/lib/audio/audioChannels';
import { buildSceneLayers } from '@/lib/layers';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import type { WallpaperState } from '@/types/wallpaper';
import { createAudioEnvelope } from '@/utils/audioEnvelope';
import type { ImageLayer } from '@/features/background/imageLayerGeometry';
import type { RenderSubsystem } from '@/features/export';
import {
	renderImageCanvasFrame,
	type ImageCanvasRuntimeRefs
} from './imageCanvasRuntime';
import {
	createInitialBackgroundSnapshot,
	createInitialBackgroundTransitionSnapshot
} from './imageCanvasBackgroundTransitionState';

type Surface = {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
};

function findBackgroundLayer(
	state: Readonly<WallpaperState>
): ImageLayer | null {
	const layer = buildSceneLayers(state as WallpaperState).find(
		item => item.type === 'background-image'
	);
	return layer && layer.type === 'background-image' ? layer : null;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
	const image = new Image();
	image.decoding = 'async';
	image.src = url;
	try {
		await image.decode();
		return image;
	} catch {
		return null;
	}
}

function createRuntimeRefs(layer: ImageLayer): ImageCanvasRuntimeRefs {
	return {
		layerRef: { current: layer },
		// The export has no pointer: parallax rests at the centre.
		mouseRef: { current: { x: 0, y: 0 } },
		smoothedMouseRef: { current: { x: 0, y: 0 } },
		imageRef: { current: null },
		loadedImageUrlRef: { current: null },
		previousBackgroundImageRef: { current: null },
		previousBackgroundParamsRef: {
			current: createInitialBackgroundSnapshot(layer)
		},
		renderedBackgroundParamsRef: {
			current: createInitialBackgroundSnapshot(layer)
		},
		previousBackgroundTransitionRef: {
			current: createInitialBackgroundTransitionSnapshot(layer)
		},
		renderedBackgroundTransitionRef: {
			current: createInitialBackgroundTransitionSnapshot(layer)
		},
		currentRequestedBackgroundUrlRef: { current: layer.imageUrl },
		transitionStartRef: { current: null },
		lastFrameTimeRef: { current: 0 },
		effectiveTimeRef: { current: 0 },
		backgroundEnvelopeRef: { current: createAudioEnvelope() },
		rgbShiftEnvelopeRef: { current: createAudioEnvelope() },
		imageChannelSelectionRef: {
			current: createAudioChannelSelectionState('kick')
		},
		transitionChannelSelectionRef: {
			current: createAudioChannelSelectionState('instrumental')
		},
		rgbShiftChannelSelectionRef: {
			current: createAudioChannelSelectionState('hihat')
		}
	};
}

export function createOfflineBackgroundSubsystem(): RenderSubsystem {
	let layer: ImageLayer | null = null;
	let image: HTMLImageElement | null = null;
	let refs: ImageCanvasRuntimeRefs | null = null;
	let renderState: WallpaperStore | null = null;
	let surface: Surface | null = null;

	function ensureSurface(width: number, height: number): Surface | null {
		if (!surface) {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) return null;
			surface = { canvas, ctx };
		}
		if (surface.canvas.width !== width) surface.canvas.width = width;
		if (surface.canvas.height !== height) surface.canvas.height = height;
		return surface;
	}

	return {
		id: 'background',
		async prepare(state) {
			layer = findBackgroundLayer(state);
			image =
				layer?.enabled && layer.imageUrl
					? await loadImage(layer.imageUrl)
					: null;
			// The renderer only reads state. A paused or sleeping editor must
			// not blank the export, and Flash Edge follows the live Stage FX
			// driver, which does not run offline.
			renderState = {
				...state,
				motionPaused: false,
				sleepModeActive: false,
				bgFlashEdgeEnabled: false
			} as WallpaperStore;
			refs = layer ? createRuntimeRefs(layer) : null;
		},
		render(ctx) {
			// The export always carries file audio; without it there is no clock
			// worth drawing against.
			const audio = ctx.audio;
			if (!audio || !layer || !image || !refs || !renderState) return;
			const target = ctx.canvas.getContext('2d');
			const scratch = ensureSurface(
				ctx.resolution.width,
				ctx.resolution.height
			);
			if (!target || !scratch) return;

			refs.imageRef.current = image;
			refs.loadedImageUrlRef.current = layer.imageUrl;

			renderImageCanvasFrame({
				// +1 keeps frame 0 off the renderer's "first frame" sentinel,
				// so frame 1 sees a real delta instead of another zero.
				now: ctx.timeMs + 1,
				canvas: scratch.canvas,
				ctx: scratch.ctx,
				loadedImage: image,
				renderBaseImage: true,
				getAudioSnapshot: () => audio,
				runtimeRefs: refs,
				state: renderState
			});
			target.drawImage(scratch.canvas, 0, 0);
		},
		reset() {
			if (layer) refs = createRuntimeRefs(layer);
		},
		dispose() {
			if (surface) {
				surface.canvas.width = 1;
				surface.canvas.height = 1;
			}
			surface = null;
			image = null;
			refs = null;
			renderState = null;
			layer = null;
		}
	};
}
