import { describe, expect, it } from 'vitest';
import { createBackgroundImageItem } from '../backgroundImages';
import {
	preserveTimingSlotsAfterReorder,
	projectEnabledImagesOntoTimingSlots,
	resolveTimingSlotMarks
} from './slideshowTimingSlots';

function images() {
	return [0, 10, 20, 30].map((time, index) => ({
		...createBackgroundImageItem(`img-${index}`, `virtual://${index}`),
		playbackSwitchAt: time
	}));
}

describe('positional slideshow timing slots', () => {
	it('changes occupants without moving slot times when the pool is reordered', () => {
		const source = images();
		const reordered = [source[3]!, source[0]!, source[1]!, source[2]!];
		const result = preserveTimingSlotsAfterReorder(source, reordered);
		expect(result.map(image => image.assetId)).toEqual([
			'img-3',
			'img-0',
			'img-1',
			'img-2'
		]);
		expect(result.map(image => image.playbackSwitchAt)).toEqual([
			0, 10, 20, 30
		]);
	});

	it('lets the next enabled image occupy a disabled image slot', () => {
		const source = images();
		source[1] = { ...source[1]!, enabled: false };
		const compacted = projectEnabledImagesOntoTimingSlots(source);
		expect(compacted.map(image => image.assetId)).toEqual([
			'img-0',
			'img-2',
			'img-3'
		]);
		expect(compacted.map(image => image.playbackSwitchAt)).toEqual([
			0, 10, 20
		]);

		const restored = projectEnabledImagesOntoTimingSlots(
			source.map(image => ({ ...image, enabled: true }))
		);
		expect(restored.map(image => image.playbackSwitchAt)).toEqual([
			0, 10, 20, 30
		]);
	});

	it('orders crossed boundaries while preserving pool occupant order', () => {
		const source = images();
		source[1] = { ...source[1]!, playbackSwitchAt: 80 };
		source[2] = { ...source[2]!, playbackSwitchAt: 20 };
		source[3] = { ...source[3]!, playbackSwitchAt: 55 };
		expect(resolveTimingSlotMarks(source, 100)).toEqual([0, 20, 55, 80]);
	});
});
