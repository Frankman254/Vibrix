import type {
	AudioSourceMode,
	OfflineExportFps,
	OfflineExportResolutionPresetId
} from '@/types/wallpaper';

export type { OfflineExportFps, OfflineExportResolutionPresetId };

export const OFFLINE_EXPORT_ARCHITECTURE_VERSION = 1;

export const OFFLINE_EXPORT_FPS_OPTIONS = [
	30, 60, 120
] as const satisfies readonly OfflineExportFps[];

export type OfflineExportResolutionPreset = {
	id: OfflineExportResolutionPresetId;
	label: string;
	width: number;
	height: number;
};

export const OFFLINE_EXPORT_RESOLUTION_PRESETS: OfflineExportResolutionPreset[] =
	[
		{ id: '720p', label: '720p', width: 1280, height: 720 },
		{ id: '1080p', label: '1080p', width: 1920, height: 1080 },
		{ id: '1440p', label: '1440p', width: 2560, height: 1440 },
		{ id: '4k', label: '4K', width: 3840, height: 2160 }
	];

/** Physical pixels of the display, as the browser reports them. */
export type ScreenMetrics = {
	/** CSS pixels of the screen, before the device pixel ratio. */
	width: number;
	height: number;
	devicePixelRatio: number;
};

/**
 * How far below a preset's height a screen may fall and still pick it. A
 * 1392-pixel-tall panel is a 1440p screen with the taskbar taken out (96.7% of
 * it), and exporting it at 1080p would throw away resolution the display
 * actually has. Deliberately tight: at 10% a 14" MacBook Pro (3024×1964) came
 * out as 4K, which is the opposite of matching the screen.
 */
const SCREEN_MATCH_TOLERANCE = 0.95;

export function readScreenMetrics(): ScreenMetrics | null {
	if (typeof window === 'undefined' || !window.screen) return null;
	const { width, height } = window.screen;
	if (!(width > 0) || !(height > 0)) return null;
	return {
		width,
		height,
		devicePixelRatio: window.devicePixelRatio || 1
	};
}

/**
 * The preset that matches this display: the largest one the screen can
 * actually show, never larger.
 *
 * `screen.width/height` are CSS pixels, so a Retina or scaled Windows display
 * reports far fewer than it has — the device pixel ratio is what turns them
 * back into real ones. Measured on the SHORT side, because every preset is
 * 16:9 and a portrait or ultrawide panel would otherwise be read as a much
 * bigger screen than it is.
 *
 * Deliberately capped at the largest preset rather than extrapolating: 4K is
 * the top rung, and an 8K display asking for an export nothing can encode is
 * not a better answer than 4K.
 */
export function resolutionPresetForScreen(
	metrics: ScreenMetrics | null
): OfflineExportResolutionPresetId {
	const fallback: OfflineExportResolutionPresetId = '1080p';
	if (!metrics) return fallback;
	const dpr = metrics.devicePixelRatio > 0 ? metrics.devicePixelRatio : 1;
	const shortSide = Math.min(metrics.width, metrics.height) * dpr;
	let best: OfflineExportResolutionPresetId | null = null;
	for (const preset of OFFLINE_EXPORT_RESOLUTION_PRESETS) {
		if (shortSide >= preset.height * SCREEN_MATCH_TOLERANCE) {
			best = preset.id;
		}
	}
	// Below 720p (a small or heavily scaled panel) the smallest preset is still
	// the honest answer — there is nothing lower to offer.
	return best ?? OFFLINE_EXPORT_RESOLUTION_PRESETS[0]!.id;
}

export type OfflineExportQualityMode = 'draft' | 'balanced' | 'production';
export type OfflineExportContainerTarget = 'mp4-friendly' | 'webm';
export type OfflineExportReadinessStatus = 'ready' | 'warning' | 'blocked';
export type OfflineExportIssueSeverity = 'blocker' | 'warning' | 'info';

export type OfflineExportProfile = {
	fps: OfflineExportFps;
	resolution: OfflineExportResolutionPreset;
	qualityMode: OfflineExportQualityMode;
	containerTarget: OfflineExportContainerTarget;
};

export type OfflineExportAudioPlan =
	| {
			kind: 'playlist';
			label: string;
			trackCount: number;
			activeTrackId: string | null;
	  }
	| {
			kind: 'single-file';
			label: string;
			assetId: string;
	  }
	| {
			kind: 'live-capture';
			label: string;
			sourceMode: Extract<AudioSourceMode, 'desktop' | 'microphone'>;
	  }
	| {
			kind: 'none';
			label: string;
	  };

export type OfflineExportCapability = {
	id: 'webcodecs' | 'web-audio' | 'offscreen-canvas';
	label: string;
	available: boolean;
	requiredForMvp: boolean;
	note: string;
};

export type OfflineExportIssue = {
	code: string;
	severity: OfflineExportIssueSeverity;
	message: string;
};

export type OfflineExportPlan = {
	version: typeof OFFLINE_EXPORT_ARCHITECTURE_VERSION;
	status: OfflineExportReadinessStatus;
	profile: OfflineExportProfile;
	audio: OfflineExportAudioPlan;
	capabilities: OfflineExportCapability[];
	issues: OfflineExportIssue[];
	estimatedLayerCost: 'low' | 'medium' | 'high';
	implementationStage: 'mvp';
};

export type BrowserOfflineExportCapabilities = {
	hasWebCodecs: boolean;
	hasWebAudio: boolean;
	hasOffscreenCanvas: boolean;
};

export type OfflineRenderFrameContext = {
	frameIndex: number;
	timeMs: number;
	deltaMs: number;
	fps: OfflineExportFps;
	width: number;
	height: number;
	abortSignal?: AbortSignal;
};
