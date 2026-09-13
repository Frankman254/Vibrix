import { describe, expect, it } from 'vitest';
import {
	createOfflineExportPlan,
	type OfflineExportPlanState
} from './offlineExportPlanner';
import type { BrowserOfflineExportCapabilities } from './offlineExportTypes';

const CAPABLE: BrowserOfflineExportCapabilities = {
	hasWebCodecs: true,
	hasWebAudio: true,
	hasOffscreenCanvas: true,
	hasMediaRecorder: true,
	hasNativeMp4Recorder: false
};

function baseState(
	overrides: Partial<OfflineExportPlanState> = {}
): OfflineExportPlanState {
	return {
		activeAudioTrackId: null,
		audioFileAssetId: 'asset-1',
		audioFileName: 'song.mp3',
		audioSourceMode: 'file',
		audioTracks: [],
		backgroundImages: [],
		flashLightEnabled: false,
		globalBackgroundEnabled: false,
		logoEnabled: true,
		overlays: [],
		particlesEnabled: false,
		performanceMode: 'medium',
		rainEnabled: false,
		slideshowEnabled: false,
		spectrumEnabled: true,
		stageLightsEnabled: false,
		...overrides
	} as OfflineExportPlanState;
}

function codes(state: OfflineExportPlanState, caps = CAPABLE) {
	return createOfflineExportPlan(state, caps).issues.map(issue => issue.code);
}

describe('createOfflineExportPlan', () => {
	it('is ready when the project only uses exported layers', () => {
		const plan = createOfflineExportPlan(baseState(), CAPABLE);
		expect(plan.status).toBe('ready');
		expect(plan.issues).toEqual([]);
	});

	it('blocks without file audio', () => {
		const plan = createOfflineExportPlan(
			baseState({ audioFileAssetId: null }),
			CAPABLE
		);
		expect(plan.status).toBe('blocked');
		expect(plan.issues[0]?.code).toBe('missing-file-audio');
	});

	it('blocks when the browser cannot encode video', () => {
		const plan = createOfflineExportPlan(baseState(), {
			...CAPABLE,
			hasWebCodecs: false
		});
		expect(plan.status).toBe('blocked');
	});

	it('warns about every enabled layer the export does not draw yet', () => {
		expect(
			codes(
				baseState({
					particlesEnabled: true,
					rainEnabled: true,
					globalBackgroundEnabled: true,
					stageLightsEnabled: true
				})
			)
		).toEqual([
			'export-unsupported-particles',
			'export-unsupported-rain',
			'export-unsupported-global-background',
			'export-unsupported-stage-fx'
		]);
	});

	it('only flags the slideshow when it has more than one image to show', () => {
		const images = [{ enabled: true }, { enabled: true }];
		expect(
			codes(
				baseState({
					slideshowEnabled: true,
					backgroundImages: images.slice(0, 1)
				} as Partial<OfflineExportPlanState>)
			)
		).toEqual([]);
		expect(
			codes(
				baseState({
					slideshowEnabled: true,
					backgroundImages: images
				} as Partial<OfflineExportPlanState>)
			)
		).toEqual(['export-unsupported-slideshow']);
	});
});
