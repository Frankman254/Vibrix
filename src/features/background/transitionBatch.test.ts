import { describe, expect, it } from 'vitest';
import type { BackgroundImageItem, Setlist } from '@/types/wallpaper';
import {
	applyTransitionBatchPlan,
	planTransitionBatch,
	transitionBatchImages
} from './transitionBatch';
import { transitionMaskAlpha } from './transitionMasks';
import { TRANSITION_TYPES } from './transitionCatalog';

const images = (n: number) =>
	Array.from(
		{ length: n },
		(_, i) =>
			({
				assetId: String(i),
				url: `${i}.png`,
				enabled: true,
				transitionType: 'fade',
				transitionDuration: 0.2 + i / 10,
				playbackSwitchAt: i * 8,
				transitionIntensity: 0.7,
				transitionAudioDrive: 0.3
			}) as BackgroundImageItem
	);

describe('transition distribution', () => {
	it('preserves target order, ignores deleted ids and fails closed for deleted setlists', () => {
		const pool = images(5);
		const sets = [
			{ id: 's', imageAssetIds: ['3', '1', 'deleted', '3'] }
		] as Setlist[];
		expect(
			transitionBatchImages(pool, sets, 's').map(i => i.assetId)
		).toEqual(['3', '1']);
		expect(transitionBatchImages(pool, sets, 'missing')).toEqual([]);
	});
	it('rejects impossible odd two-color loops without returning a partial plan', () => {
		expect(
			planTransitionBatch(images(5), ['iris', 'cross-zoom'])
		).toBeNull();
		expect(planTransitionBatch(images(2), ['iris', 'iris'])).toBeNull();
		expect(planTransitionBatch(images(0), ['iris'])).toBeNull();
	});
	it('never repeats neighbours including loop closure, across many sizes and palettes', () => {
		for (let n = 2; n < 100; n++) {
			const selected =
				n % 2
					? TRANSITION_TYPES.slice(0, 3)
					: TRANSITION_TYPES.slice(0, 2);
			const plan = planTransitionBatch(images(n), selected)!;
			expect(plan).not.toBeNull();
			plan.assignments.forEach((item, i, arr) => {
				expect(selected).toContain(item.type);
				expect(item.type).not.toBe(arr[(i + 1) % arr.length].type);
			});
		}
	});
	it('also protects adjacency when disabled images are skipped', () => {
		const pool = images(8);
		pool[1].enabled = false;
		pool[5].enabled = false;
		const plan = planTransitionBatch(pool, TRANSITION_TYPES)!;
		const active = plan.assignments.filter(
			a => pool.find(i => i.assetId === a.assetId)!.enabled
		);
		active.forEach((a, i) =>
			expect(a.type).not.toBe(active[(i + 1) % active.length].type)
		);
	});
	it('preserves durations, timestamps, non-target images and unchecked parameters', () => {
		const pool = images(4);
		const plan = planTransitionBatch(
			pool.slice(0, 3),
			['iris', 'cross-zoom', 'wave'],
			{ transitionAudioDrive: 0.9 }
		)!;
		const result = applyTransitionBatchPlan(pool, plan);
		expect(result[3]).toBe(pool[3]);
		result.slice(0, 3).forEach((image, i) => {
			expect(image.transitionDuration).toBe(pool[i].transitionDuration);
			expect(image.playbackSwitchAt).toBe(pool[i].playbackSwitchAt);
			expect(image.transitionIntensity).toBe(0.7);
			expect(image.transitionAudioDrive).toBe(0.9);
		});
	});
});

describe('transition mask continuity', () => {
	it.each(TRANSITION_TYPES)(
		'%s has clean endpoints and bounded deterministic alpha',
		type => {
			for (const aspect of [16 / 9, 9 / 16])
				for (const x of [0, 0.2, 0.5, 1])
					for (const y of [0, 0.5, 1]) {
						expect(
							transitionMaskAlpha(type, x, y, 0, 2.5, aspect)
						).toBe(0);
						expect(
							transitionMaskAlpha(type, x, y, 1, 2.5, aspect)
						).toBe(1);
						const value = transitionMaskAlpha(
							type,
							x,
							y,
							0.4,
							2.5,
							aspect
						);
						expect(value).toBeGreaterThanOrEqual(0);
						expect(value).toBeLessThanOrEqual(1);
					}
		}
	);
	it('reverses the iris spatial order', () => {
		expect(transitionMaskAlpha('iris', 0.5, 0.5, 0.4, 1, 16 / 9)).toBe(1);
		expect(
			transitionMaskAlpha('iris-close', 0.5, 0.5, 0.4, 1, 16 / 9)
		).toBe(0);
	});
});
