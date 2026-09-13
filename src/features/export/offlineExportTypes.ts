import type { AudioSourceMode } from '@/types/wallpaper';

export const OFFLINE_EXPORT_ARCHITECTURE_VERSION = 1;

export const OFFLINE_EXPORT_FPS_OPTIONS = [30, 60] as const;
export type OfflineExportFps = (typeof OFFLINE_EXPORT_FPS_OPTIONS)[number];

export type OfflineExportResolutionPresetId =
	| '1080p'
	| '1440p'
	| 'ultrawide-1080p'
	| 'ultrawide-1440p';

export type OfflineExportResolutionPreset = {
	id: OfflineExportResolutionPresetId;
	label: string;
	width: number;
	height: number;
};

export const OFFLINE_EXPORT_RESOLUTION_PRESETS: OfflineExportResolutionPreset[] =
	[
		{ id: '1080p', label: '1080p', width: 1920, height: 1080 },
		{ id: '1440p', label: '1440p', width: 2560, height: 1440 },
		{
			id: 'ultrawide-1080p',
			label: 'Ultrawide 1080p',
			width: 2560,
			height: 1080
		},
		{
			id: 'ultrawide-1440p',
			label: 'Ultrawide 1440p',
			width: 3440,
			height: 1440
		}
	];

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
	id:
		| 'webcodecs'
		| 'web-audio'
		| 'offscreen-canvas'
		| 'media-recorder'
		| 'mp4-muxing';
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
	hasMediaRecorder: boolean;
	hasNativeMp4Recorder: boolean;
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
