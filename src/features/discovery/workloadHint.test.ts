import { describe, expect, it } from 'vitest';
import type { SpectrumInstance, WallpaperState } from '@/types/wallpaper';
import { DEFAULT_STATE } from '@/store/defaultState';
import { createDefaultSpectrumInstanceSettings } from '@/features/spectrum';
import { getVisualWorkloadHint } from './workloadHint';

function makeInstance(
	overrides: Partial<SpectrumInstance> = {}
): SpectrumInstance {
	return {
		...createDefaultSpectrumInstanceSettings(),
		id: 'instance-1',
		enabled: true,
		...overrides
	} as SpectrumInstance;
}

function makeState(overrides: Partial<WallpaperState> = {}): WallpaperState {
	return {
		...DEFAULT_STATE,
		performanceMode: 'high',
		spectrumEnabled: true,
		spectrumMainVisible: true,
		spectrumFamily: 'classic',
		spectrumMotionTrails: 0,
		spectrumGhostFrames: 0,
		spectrumAfterglow: 0,
		spectrumInstances: [],
		particlesEnabled: false,
		rainEnabled: false,
		...overrides
	};
}

describe('getVisualWorkloadHint', () => {
	it('stays quiet on a plain classic spectrum', () => {
		expect(getVisualWorkloadHint(makeState())).toBe('none');
	});

	it('flags a costly family on the main spectrum', () => {
		expect(
			getVisualWorkloadHint(makeState({ spectrumFamily: 'tunnel' }))
		).toBe('heavy');
	});

	it('ignores the main spectrum cost when it is hidden', () => {
		expect(
			getVisualWorkloadHint(
				makeState({
					spectrumFamily: 'tunnel',
					spectrumMainVisible: false
				})
			)
		).toBe('none');
	});

	it('flags a costly instance even when the main spectrum is hidden', () => {
		expect(
			getVisualWorkloadHint(
				makeState({
					spectrumMainVisible: false,
					spectrumInstances: [
						makeInstance({ spectrumFamily: 'liquid' })
					]
				})
			)
		).toBe('heavy');
	});

	it('flags two drawn spectrums even when both are cheap', () => {
		expect(
			getVisualWorkloadHint(
				makeState({ spectrumInstances: [makeInstance()] })
			)
		).toBe('heavy');
	});

	it('does not count a disabled or transparent instance', () => {
		expect(
			getVisualWorkloadHint(
				makeState({
					spectrumInstances: [
						makeInstance({ id: 'a', enabled: false }),
						makeInstance({ id: 'b', spectrumOpacity: 0 })
					]
				})
			)
		).toBe('none');
	});

	it('never nags in low performance mode', () => {
		expect(
			getVisualWorkloadHint(
				makeState({
					performanceMode: 'low',
					spectrumFamily: 'tunnel',
					spectrumInstances: [makeInstance()]
				})
			)
		).toBe('none');
	});
});
