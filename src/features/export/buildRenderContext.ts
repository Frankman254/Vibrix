import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { WallpaperState } from '@/types/wallpaper';
import type { BackgroundPalette } from '@/lib/backgroundPalette';
import type {
	RenderFrameContext,
	RenderResolution
} from './renderFrameContext';
import type { RenderScope } from './renderScope';

export type LiveContextInput = {
	canvas: HTMLCanvasElement;
	state: Readonly<WallpaperState>;
	palette: BackgroundPalette;
	audio: AudioSnapshot | null;
	resolution: RenderResolution;
	timeMs: number;
	deltaMs: number;
	trackTitle?: string;
	trackCurrentTime?: number;
	trackDuration?: number;
};

export type OfflineContextInput = LiveContextInput & {
	abortSignal?: AbortSignal;
	/** The export run's scoped draw state; every offline frame carries it. */
	scope: RenderScope;
};

export function buildLiveContext(input: LiveContextInput): RenderFrameContext {
	return {
		timeMs: input.timeMs,
		deltaMs: input.deltaMs,
		audio: input.audio,
		resolution: input.resolution,
		isOffline: false,
		state: input.state,
		palette: input.palette,
		canvas: input.canvas,
		trackTitle: input.trackTitle ?? '',
		trackCurrentTime: input.trackCurrentTime ?? 0,
		trackDuration: input.trackDuration ?? 0
	};
}

export function buildOfflineContext(
	input: OfflineContextInput
): RenderFrameContext {
	return {
		timeMs: input.timeMs,
		deltaMs: input.deltaMs,
		audio: input.audio,
		resolution: input.resolution,
		isOffline: true,
		state: input.state,
		palette: input.palette,
		canvas: input.canvas,
		trackTitle: input.trackTitle ?? '',
		trackCurrentTime: input.trackCurrentTime ?? 0,
		trackDuration: input.trackDuration ?? 0,
		abortSignal: input.abortSignal,
		scope: input.scope
	};
}
