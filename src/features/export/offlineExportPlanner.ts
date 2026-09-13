import type { WallpaperState } from '@/types/wallpaper';
import {
	OFFLINE_EXPORT_ARCHITECTURE_VERSION,
	OFFLINE_EXPORT_RESOLUTION_PRESETS,
	type BrowserOfflineExportCapabilities,
	type OfflineExportAudioPlan,
	type OfflineExportCapability,
	type OfflineExportIssue,
	type OfflineExportPlan
} from './offlineExportTypes';

export type OfflineExportPlanState = Pick<
	WallpaperState,
	| 'activeAudioTrackId'
	| 'audioFileAssetId'
	| 'audioFileName'
	| 'audioSourceMode'
	| 'audioTracks'
	| 'backgroundImages'
	| 'flashLightEnabled'
	| 'globalBackgroundEnabled'
	| 'logoEnabled'
	| 'overlays'
	| 'particlesEnabled'
	| 'performanceMode'
	| 'rainEnabled'
	| 'slideshowEnabled'
	| 'spectrumEnabled'
	| 'stageLightsEnabled'
>;

export type OfflineExportAudioAssetRef = {
	assetId: string;
	name: string;
	mimeType: string;
	source: 'playlist' | 'single-file';
};

function hasGlobalConstructor(name: string): boolean {
	return typeof globalThis !== 'undefined' && name in globalThis;
}

export function detectBrowserOfflineExportCapabilities(): BrowserOfflineExportCapabilities {
	const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
	return {
		hasWebCodecs: hasGlobalConstructor('VideoEncoder'),
		hasWebAudio:
			hasGlobalConstructor('AudioContext') ||
			hasGlobalConstructor('webkitAudioContext'),
		hasOffscreenCanvas: hasGlobalConstructor('OffscreenCanvas'),
		hasMediaRecorder,
		hasNativeMp4Recorder:
			hasMediaRecorder &&
			MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')
	};
}

function resolveAudioPlan(
	state: OfflineExportPlanState
): OfflineExportAudioPlan {
	const enabledTracks = state.audioTracks.filter(track => track.enabled);
	if (enabledTracks.length > 0) {
		const activeTrack = enabledTracks.find(
			track => track.id === state.activeAudioTrackId
		);
		return {
			kind: 'playlist',
			label:
				activeTrack?.name ??
				`${enabledTracks.length} enabled playlist tracks`,
			trackCount: enabledTracks.length,
			activeTrackId: state.activeAudioTrackId
		};
	}

	if (state.audioFileAssetId) {
		return {
			kind: 'single-file',
			label: state.audioFileName || 'Imported audio file',
			assetId: state.audioFileAssetId
		};
	}

	if (
		state.audioSourceMode === 'desktop' ||
		state.audioSourceMode === 'microphone'
	) {
		return {
			kind: 'live-capture',
			label:
				state.audioSourceMode === 'desktop'
					? 'Desktop capture'
					: 'Microphone capture',
			sourceMode: state.audioSourceMode
		};
	}

	return { kind: 'none', label: 'No file or playlist audio selected' };
}

export function resolveOfflineExportAudioAsset(
	state: OfflineExportPlanState
): OfflineExportAudioAssetRef | null {
	const enabledTracks = state.audioTracks.filter(track => track.enabled);
	if (enabledTracks.length > 0) {
		const track =
			enabledTracks.find(item => item.id === state.activeAudioTrackId) ??
			enabledTracks[0];
		if (!track) return null;
		return {
			assetId: track.assetId,
			name: track.name || 'playlist-track',
			mimeType: track.mimeType || 'audio/mpeg',
			source: 'playlist'
		};
	}

	if (state.audioFileAssetId) {
		return {
			assetId: state.audioFileAssetId,
			name: state.audioFileName || 'audio-file',
			mimeType: 'audio/mpeg',
			source: 'single-file'
		};
	}

	return null;
}

function buildCapabilities(
	capabilities: BrowserOfflineExportCapabilities
): OfflineExportCapability[] {
	return [
		{
			id: 'web-audio',
			label: 'Offline audio decode/analyze',
			available: capabilities.hasWebAudio,
			requiredForMvp: true,
			note: 'Required to make audio-reactive export deterministic.'
		},
		{
			id: 'webcodecs',
			label: 'Frame encoder',
			available: capabilities.hasWebCodecs,
			requiredForMvp: true,
			note: 'Recommended browser primitive for frame-by-frame export.'
		},
		{
			id: 'offscreen-canvas',
			label: 'Worker/offscreen canvas',
			available: capabilities.hasOffscreenCanvas,
			requiredForMvp: false,
			note: 'Useful for scalability, but HTMLCanvas can be the first path.'
		},
		{
			id: 'media-recorder',
			label: 'Legacy preview recorder',
			available: capabilities.hasMediaRecorder,
			requiredForMvp: false,
			note: 'Screen/stream recording fallback, not the target offline path.'
		},
		{
			id: 'mp4-muxing',
			label: 'Native MP4 muxing',
			available: capabilities.hasNativeMp4Recorder,
			requiredForMvp: false,
			note: 'MP4/WebM muxing runs in JavaScript (mediabunny); this flag only reports native MediaRecorder MP4.'
		}
	];
}

function estimateLayerCost(
	state: OfflineExportPlanState
): OfflineExportPlan['estimatedLayerCost'] {
	let cost = 0;
	if (state.spectrumEnabled) cost += 2;
	if (state.logoEnabled) cost += 1;
	if (state.particlesEnabled) cost += 2;
	if (state.rainEnabled) cost += 2;
	if (state.overlays.length > 2) cost += 1;
	if (state.backgroundImages.length > 6) cost += 1;
	if (state.performanceMode === 'high') cost += 1;

	if (cost >= 6) return 'high';
	if (cost >= 3) return 'medium';
	return 'low';
}

/**
 * Layers the live preview draws but the offline export does not yet. Listed
 * so the plan is honest about what the file will contain (Fase 1C adds them).
 */
function buildUnsupportedLayerIssues(
	state: OfflineExportPlanState
): OfflineExportIssue[] {
	const unsupported: Array<[boolean, string, string]> = [
		[
			state.particlesEnabled,
			'export-unsupported-particles',
			'Particles are not included in the exported video yet.'
		],
		[
			state.rainEnabled,
			'export-unsupported-rain',
			'Rain is not included in the exported video yet.'
		],
		[
			state.overlays.some(overlay => overlay.enabled),
			'export-unsupported-overlays',
			'Image overlays are not included in the exported video yet.'
		],
		[
			state.globalBackgroundEnabled,
			'export-unsupported-global-background',
			'The global background is not included in the exported video yet.'
		],
		[
			state.stageLightsEnabled || state.flashLightEnabled,
			'export-unsupported-stage-fx',
			'Stage FX lights are not included in the exported video yet.'
		],
		[
			state.slideshowEnabled &&
				state.backgroundImages.filter(image => image.enabled).length >
					1,
			'export-unsupported-slideshow',
			'The slideshow does not advance in the export; the current image is used for the whole video.'
		]
	];
	return unsupported
		.filter(([active]) => active)
		.map(([, code, message]) => ({ code, severity: 'warning', message }));
}

function buildIssues(
	state: OfflineExportPlanState,
	audio: OfflineExportAudioPlan,
	capabilities: BrowserOfflineExportCapabilities
): OfflineExportIssue[] {
	const issues: OfflineExportIssue[] = [];

	if (audio.kind === 'none') {
		issues.push({
			code: 'missing-file-audio',
			severity: 'blocker',
			message: 'Video export requires imported file or playlist audio.'
		});
	}

	if (audio.kind === 'live-capture') {
		issues.push({
			code: 'live-audio-unsupported',
			severity: 'blocker',
			message:
				'Desktop and microphone capture are live sources and cannot be deterministic offline exports.'
		});
	}

	if (!capabilities.hasWebAudio) {
		issues.push({
			code: 'web-audio-unavailable',
			severity: 'blocker',
			message: 'Web Audio is required for deterministic offline analysis.'
		});
	}

	if (!capabilities.hasWebCodecs) {
		issues.push({
			code: 'webcodecs-unavailable',
			severity: 'blocker',
			message:
				'This browser cannot encode video (WebCodecs). Use a recent Chrome, Edge or Safari, or the screen recorder below.'
		});
	}

	issues.push(...buildUnsupportedLayerIssues(state));
	return issues;
}

export function createOfflineExportPlan(
	state: OfflineExportPlanState,
	capabilities = detectBrowserOfflineExportCapabilities()
): OfflineExportPlan {
	const audio = resolveAudioPlan(state);
	const issues = buildIssues(state, audio, capabilities);
	const hasBlocker = issues.some(issue => issue.severity === 'blocker');
	const hasWarning = issues.some(issue => issue.severity === 'warning');

	return {
		version: OFFLINE_EXPORT_ARCHITECTURE_VERSION,
		status: hasBlocker ? 'blocked' : hasWarning ? 'warning' : 'ready',
		profile: {
			fps: 30,
			resolution: OFFLINE_EXPORT_RESOLUTION_PRESETS[0],
			qualityMode: 'balanced',
			containerTarget: 'mp4-friendly'
		},
		audio,
		capabilities: buildCapabilities(capabilities),
		issues,
		estimatedLayerCost: estimateLayerCost(state),
		implementationStage: 'mvp'
	};
}
