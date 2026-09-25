import { describe, expect, it } from 'vitest';
import {
	cameraTargetForSpectrumPartition,
	partitionDrawsMainSpectrum,
	partitionDrawsSpectrumInstances,
	resolveSpectrumPartitions,
	spectrumCameraSplitActive,
	type SpectrumCameraSplitSource
} from '@/features/spectrum/domain/spectrumCameraSplit';
import { createDefaultSpectrumInstance } from '@/features/spectrum/domain/spectrumInstanceModel';
import { DEFAULT_STATE } from '@/store/defaultState';

function source(
	over: Partial<SpectrumCameraSplitSource> = {}
): SpectrumCameraSplitSource {
	return {
		cameraMotionEnabled: true,
		cameraShakeEnabled: false,
		cameraShakeTargets: [],
		cameraMotionTargets: ['background'],
		motionLayers: DEFAULT_STATE.motionLayers,
		activeMotionLayerId: DEFAULT_STATE.activeMotionLayerId,
		spectrumInstances: [createDefaultSpectrumInstance()],
		...over
	};
}

describe('spectrumCameraSplitActive', () => {
	it('stays off while nothing aims at Spectrum 2 (one canvas)', () => {
		expect(spectrumCameraSplitActive(source())).toBe(false);
		expect(resolveSpectrumPartitions(source())).toEqual(['all']);
	});

	it('splits when the ACTIVE motion layer targets Spectrum 2', () => {
		const state = source({ cameraMotionTargets: ['spectrum-2'] });
		expect(spectrumCameraSplitActive(state)).toBe(true);
		expect(resolveSpectrumPartitions(state)).toEqual(['main', 'instances']);
	});

	it('splits for Screen Shake as well', () => {
		expect(
			spectrumCameraSplitActive(
				source({
					cameraMotionEnabled: false,
					cameraShakeEnabled: true,
					cameraShakeTargets: ['spectrum-2']
				})
			)
		).toBe(true);
	});

	it('does not split for a target of a disabled effect', () => {
		expect(
			spectrumCameraSplitActive(
				source({
					cameraMotionEnabled: false,
					cameraMotionTargets: ['spectrum-2'],
					cameraShakeEnabled: false,
					cameraShakeTargets: ['spectrum-2']
				})
			)
		).toBe(false);
	});

	it('never splits without a second spectrum to move', () => {
		expect(
			spectrumCameraSplitActive(
				source({
					cameraMotionTargets: ['spectrum-2'],
					spectrumInstances: []
				})
			)
		).toBe(false);
	});

	it('returns the same array instance for the same answer', () => {
		// The live viewport keys its canvases off this list.
		expect(resolveSpectrumPartitions(source())).toBe(
			resolveSpectrumPartitions(source())
		);
	});
});

describe('partition helpers', () => {
	it('splits the work with no overlap and no gap', () => {
		expect(partitionDrawsMainSpectrum('all')).toBe(true);
		expect(partitionDrawsSpectrumInstances('all')).toBe(true);
		expect(partitionDrawsMainSpectrum('main')).toBe(true);
		expect(partitionDrawsSpectrumInstances('main')).toBe(false);
		expect(partitionDrawsMainSpectrum('instances')).toBe(false);
		expect(partitionDrawsSpectrumInstances('instances')).toBe(true);
	});

	it('maps each canvas to the camera target that moves it', () => {
		expect(cameraTargetForSpectrumPartition('all')).toBe('spectrum');
		expect(cameraTargetForSpectrumPartition('main')).toBe('spectrum');
		expect(cameraTargetForSpectrumPartition('instances')).toBe(
			'spectrum-2'
		);
	});
});
