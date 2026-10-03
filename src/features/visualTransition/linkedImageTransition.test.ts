import { describe, expect, it } from 'vitest';
import { createBackgroundImageItem } from '@/features/background/backgroundImages';
import { createVisualTransitionSnapshot } from './visualTransitionCoordinator';
import {
	linkedImageTransition,
	linkedTransitionProgress
} from './linkedImageTransition';
import { resolveTransitionAlpha } from '@/features/export/frameComposition';
import { resolveSpectrumPartitions } from '@/features/spectrum/domain/spectrumCameraSplit';
import { DEFAULT_STATE } from '@/store/defaultState';

function fixture() {
	const from = createBackgroundImageItem('from', 'a.png', null, {
		transitionType: 'cross-zoom',
		transitionDuration: 1.8,
		transitionLayerTargets: ['spectrum2', 'logo']
	});
	const to = createBackgroundImageItem('to', 'b.png', null, {
		transitionType: 'iris',
		transitionDuration: 0.3
	});
	const state = {
		...DEFAULT_STATE,
		performanceMode: 'low' as const,
		activeImageId: 'from',
		backgroundImages: [from, to]
	};
	const transition = createVisualTransitionSnapshot({
		state,
		patch: { spectrumEnabled: false, logoEnabled: false },
		toImageId: 'to',
		startedAtMs: 1000
	})!;
	return { from, to, state, transition };
}

describe('image transitions linked to audio layers', () => {
	it('freezes outgoing settings, only for selected targets, independently of performance fade', () => {
		const { from, transition } = fixture();
		expect(transition.durationMs).toBe(220);
		expect(linkedImageTransition(transition, 'spectrum')).toBeNull();
		expect(linkedImageTransition(transition, 'spectrum2')).toMatchObject({
			transitionType: 'cross-zoom',
			transitionDuration: 1.8
		});
		from.transitionLayerTargets.length = 0;
		from.transitionDuration = 4;
		expect(transition.imageTransition?.targets).toEqual([
			'spectrum2',
			'logo'
		]);
		expect(linkedTransitionProgress(transition, 1900)).toBeCloseTo(0.5);
		expect(linkedTransitionProgress(transition, 2800)).toBe(1);
	});
	it('avoids applying the automatic fade on top of the selected effect in export', () => {
		const { state, transition } = fixture();
		const next = { ...state, visualTransition: transition };
		expect(resolveTransitionAlpha(next, 'spectrum2', 1000)).toBe(1);
		expect(resolveTransitionAlpha(next, 'logo', 1000)).toBe(1);
		expect(resolveTransitionAlpha(next, 'spectrum', 1000)).toBe(0);
	});
	it('keeps two stable spectrum roots even when instances are disabled or the next image is unlinked', () => {
		const { state, to } = fixture();
		const nextState = { ...state, activeImageId: to.assetId };
		expect(
			resolveSpectrumPartitions({ ...state, spectrumInstances: [] })
		).toEqual(['main', 'instances']);
		expect(resolveSpectrumPartitions(nextState)).toEqual([
			'main',
			'instances'
		]);
	});
	it('does not link scene-only edits, unchecked images or reduced motion', () => {
		const { state } = fixture();
		const base = {
			state,
			patch: { logoEnabled: true },
			toImageId: 'to',
			startedAtMs: 0
		};
		expect(
			createVisualTransitionSnapshot({
				...base,
				prefersReducedMotion: true
			})?.imageTransition
		).toBeUndefined();
		expect(
			createVisualTransitionSnapshot({ ...base, toImageId: 'from' })
				?.imageTransition
		).toBeUndefined();
		expect(
			createVisualTransitionSnapshot({
				...base,
				state: { ...state, activeImageId: 'to' },
				toImageId: 'from'
			})?.imageTransition
		).toBeUndefined();
	});
});
