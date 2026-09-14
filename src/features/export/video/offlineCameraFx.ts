/**
 * Camera FX for the offline export. Steps the same motion and shake as the
 * live `CameraFxStage` on the video clock and turns each layer's CSS offset
 * into a canvas transform at the export resolution.
 */
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import {
	createCameraFxRuntime,
	isCameraFxActive,
	resolveCameraLayerOffset,
	stepCameraFx
} from '@/features/stageFx/render';
import type { WallpaperState } from '@/types/wallpaper';
import { SUBSYSTEM_CAMERA_LAYER } from '../frameComposition';
import type {
	RenderResolution,
	RenderSubsystemId
} from '../renderFrameContext';
import type { LayerTransform } from '../renderFrame';

/** Delta above this is a seek or first frame, not a step (matches live). */
const MAX_STEP_SEC = 0.1;

/** Small deterministic PRNG so shake roughness exports the same every time. */
function createSeededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export type OfflineCameraFx = {
	/** Steps one frame; returns the per-layer transform for `renderFrameAt`. */
	step(input: {
		state: Readonly<WallpaperState>;
		audio: AudioSnapshot | null;
		timeMs: number;
		deltaMs: number;
		resolution: RenderResolution;
	}): ((id: RenderSubsystemId) => LayerTransform | null) | undefined;
};

/**
 * `viewportMin` is the short side of the live viewport the pixel amounts
 * were tuned on; offsets scale with the export's short side.
 */
export function createOfflineCameraFx(viewportMin: number): OfflineCameraFx {
	const runtime = createCameraFxRuntime();
	const random = createSeededRandom(0x5eed);

	return {
		step({ state, audio, timeMs, deltaMs, resolution }) {
			if (!isCameraFxActive(state)) return undefined;
			const outputMin = Math.min(resolution.width, resolution.height);
			const pixelScale = viewportMin > 0 ? outputMin / viewportMin : 1;
			const frame = stepCameraFx(
				runtime,
				state,
				() => audio,
				timeMs,
				Math.min(deltaMs / 1000, MAX_STEP_SEC),
				{
					width: resolution.width / pixelScale,
					height: resolution.height / pixelScale
				},
				random
			);
			return id => {
				const layer = SUBSYSTEM_CAMERA_LAYER[id];
				if (!layer) return null;
				const offset = resolveCameraLayerOffset(frame, state, layer);
				if (!offset) return null;
				return {
					tx: offset.tx * pixelScale,
					ty: offset.ty * pixelScale,
					scale: offset.scale
				};
			};
		}
	};
}
