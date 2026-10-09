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

/**
 * Encoder dimensions for a preset on THIS display.
 *
 * The preset names the short side and nothing else. A wallpaper's target is a
 * monitor running it full screen, so the shape of the file is the shape of that
 * monitor: on a 34" ultrawide `1440p` means 3440×1440, not a 16:9 crop of it.
 * Quality is a separate control (`OFFLINE_EXPORT_QUALITY_PRESETS`) — resolution
 * is geometry, not how many bits each frame gets.
 *
 * Both sides are rounded to even numbers because H.264 chroma is subsampled and
 * an odd dimension is rejected outright, and the whole frame is scaled down
 * when a side would pass what encoders accept (an ultrawide at 2160 asks for
 * 5160 across, which no hardware encoder here will take).
 */
export const MAX_EXPORT_DIMENSION = 4096;

function evenRound(value: number): number {
	return Math.max(2, Math.round(value / 2) * 2);
}

export function resolveExportDimensions(
	presetId: OfflineExportResolutionPresetId,
	metrics: ScreenMetrics | null
): { width: number; height: number } {
	const preset =
		OFFLINE_EXPORT_RESOLUTION_PRESETS.find(item => item.id === presetId) ??
		OFFLINE_EXPORT_RESOLUTION_PRESETS[1]!;
	const aspect =
		metrics && metrics.width > 0 && metrics.height > 0
			? metrics.width / metrics.height
			: preset.width / preset.height;
	let height = preset.height;
	let width = evenRound(height * aspect);
	const overflow = Math.max(
		width / MAX_EXPORT_DIMENSION,
		height / MAX_EXPORT_DIMENSION
	);
	if (overflow > 1) {
		width = evenRound(width / overflow);
		height = evenRound(height / overflow);
	}
	return { width, height: evenRound(height) };
}

/**
 * How many bits per frame, independent of how many pixels. The top rung is the
 * quality table in `offlineVideoFormat` exactly as written; the rungs below it
 * buy back file size and write time on content the eye cannot tell apart at
 * normal viewing distance. It does NOT shorten the render: drawing the frames
 * is the slow part and that cost belongs to the resolution.
 */
export type OfflineExportQualityId = 'low' | 'medium' | 'original';

export type OfflineExportQualityPreset = {
	id: OfflineExportQualityId;
	/** Multiplier on the recommended bitrate for the size being exported. */
	scale: number;
};

export const OFFLINE_EXPORT_QUALITY_PRESETS: OfflineExportQualityPreset[] = [
	// 1440p60: ~19 Mbps. Visible softening on dense particle fields, but a
	// third of the file — the rung for sending somebody the video.
	{ id: 'low', scale: 0.28 },
	// 1440p60: ~33 Mbps, comfortably above the ~24 Mbps where neon edges and
	// particles started to smear in testing. Half the bytes of the top rung.
	{ id: 'medium', scale: 0.5 },
	{ id: 'original', scale: 1 }
];

export function qualityScaleFor(id: OfflineExportQualityId): number {
	return (
		OFFLINE_EXPORT_QUALITY_PRESETS.find(preset => preset.id === id)
			?.scale ?? 1
	);
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
