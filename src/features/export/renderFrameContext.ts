import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { WallpaperState } from '@/types/wallpaper';
import type { BackgroundPalette } from '@/lib/backgroundPalette';

export type RenderResolution = {
	width: number;
	height: number;
};

export type RenderFrameContext = {
	timeMs: number;
	deltaMs: number;
	audio: AudioSnapshot | null;
	resolution: RenderResolution;
	isOffline: boolean;
	state: Readonly<WallpaperState>;
	palette: BackgroundPalette;
	canvas: HTMLCanvasElement;
	trackTitle: string;
	trackCurrentTime: number;
	trackDuration: number;
	abortSignal?: AbortSignal;
};

export type RenderSubsystemId =
	| 'globalBackground'
	| 'background'
	| 'stageLights'
	| 'looks'
	| 'motion'
	| 'particles'
	| 'rain'
	| 'spectrum'
	| 'logo'
	| 'trackTitle'
	| 'lyrics'
	| 'overlays'
	| 'flashLight'
	| 'hud';

export const RENDER_SUBSYSTEM_ORDER: readonly RenderSubsystemId[] = [
	'globalBackground',
	'background',
	'stageLights',
	'looks',
	'motion',
	'particles',
	'rain',
	'spectrum',
	'logo',
	'trackTitle',
	'lyrics',
	'overlays',
	'flashLight',
	'hud'
] as const;
