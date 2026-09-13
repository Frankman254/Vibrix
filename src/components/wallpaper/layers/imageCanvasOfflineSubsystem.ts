/**
 * The background image, drawn for the offline video export.
 *
 * Reuses `renderImageCanvasFrame` — the exact function the live
 * `ImageLayerCanvas` calls every animation frame — with plain `{ current }`
 * refs in place of React refs and the export clock in place of rAF time. Same
 * geometry, filters, bass zoom and mirror fill as the preview, by
 * construction.
 *
 * A slideshow reaches it as a new `imageUrl` in the frame's state. The image
 * is already decoded, so the switch replays the live load sequence — request,
 * then commit — in one frame, and the renderer's slideshow transition runs as
 * it does in the preview.
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
	beginBackgroundImageRequest,
	commitBackgroundImageLoad,
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

// The live hook mirrors the loaded image into React state; offline there is
// no component to re-render.
const ignoreImageState = () => undefined;

/** The renderer only reads state. A paused or sleeping editor must not blank
 * the export, and Flash Edge follows the live Stage FX driver, which does not
 * run offline. */
function toRenderState(state: Readonly<WallpaperState>): WallpaperStore {
	return {
		...state,
		motionPaused: false,
		sleepModeActive: false,
		bgFlashEdgeEnabled: false
	} as WallpaperStore;
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
	const images = new Map<string, HTMLImageElement>();
	let refs: ImageCanvasRuntimeRefs | null = null;
	let renderStates = new WeakMap<object, WallpaperStore>();
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

	function getRenderState(state: Readonly<WallpaperState>): WallpaperStore {
		let renderState = renderStates.get(state);
		if (!renderState) {
			renderState = toRenderState(state);
			renderStates.set(state, renderState);
		}
		return renderState;
	}

	/** Brings the refs to `url` the way the live hook does once it loads. */
	function switchToImage(
		activeLayer: ImageLayer,
		runtimeRefs: ImageCanvasRuntimeRefs,
		url: string,
		image: HTMLImageElement
	) {
		const requested = beginBackgroundImageRequest(
			{ ...activeLayer, imageUrl: url },
			runtimeRefs,
			ignoreImageState
		);
		if (!requested) return;
		commitBackgroundImageLoad({
			layer: activeLayer,
			requestedUrl: requested,
			loadedImage: image,
			refs: runtimeRefs,
			setImage: ignoreImageState
		});
	}

	return {
		id: 'background',
		async prepare(state, frameStates) {
			images.clear();
			renderStates = new WeakMap();
			layer = findBackgroundLayer(state);
			const urls = new Set<string>();
			for (const frameState of frameStates) {
				if (frameState.backgroundImageEnabled && frameState.imageUrl) {
					urls.add(frameState.imageUrl);
				}
			}
			await Promise.all(
				[...urls].map(async url => {
					const image = await loadImage(url);
					if (image) images.set(url, image);
				})
			);
			refs = layer ? createRuntimeRefs(layer) : null;
		},
		render(ctx) {
			// The export always carries file audio; without it there is no clock
			// worth drawing against.
			const audio = ctx.audio;
			if (!audio || !layer || !refs) return;
			const url = ctx.state.imageUrl;
			const image = url ? images.get(url) : undefined;
			if (!url || !image) return;
			const target = ctx.canvas.getContext('2d');
			const scratch = ensureSurface(
				ctx.resolution.width,
				ctx.resolution.height
			);
			if (!target || !scratch) return;

			if (refs.loadedImageUrlRef.current !== url) {
				switchToImage(layer, refs, url, image);
			}

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
				state: getRenderState(ctx.state)
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
			images.clear();
			refs = null;
			renderStates = new WeakMap();
			layer = null;
		}
	};
}
