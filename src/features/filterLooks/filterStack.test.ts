import { describe, expect, it } from 'vitest';
import {
	isFilterTargetActive,
	resolveFilterStack,
	type FilterStackSource
} from '@/features/filterLooks/filterStack';
import { FILTER_LOOK_PRESET_KEYS } from '@/features/filterLooks/filterLooks';
import { DEFAULT_STATE } from '@/store/defaultState';

function sourceWith(
	targets: FilterStackSource['filterTargets'],
	overrides: Partial<FilterStackSource> = {}
): FilterStackSource {
	return {
		...(DEFAULT_STATE as unknown as FilterStackSource),
		filterTargets: targets,
		...overrides
	};
}

describe('filterStack', () => {
	it('reports a layer as filtered only while it is a target', () => {
		const state = sourceWith(['background', 'spectrum']);
		expect(isFilterTargetActive(state, 'background')).toBe(true);
		expect(isFilterTargetActive(state, 'spectrum')).toBe(true);
		expect(isFilterTargetActive(state, 'logo')).toBe(false);
	});

	it('resolves null for a layer nothing targets', () => {
		expect(resolveFilterStack(sourceWith(['background']), 'logo')).toBe(
			null
		);
	});

	it('carries every look-owned value into the resolved stack', () => {
		const state = sourceWith(['logo'], {
			filterSaturation: 1.75,
			filterHueRotate: 42
		});
		const stack = resolveFilterStack(state, 'logo');
		expect(stack).not.toBe(null);
		for (const key of FILTER_LOOK_PRESET_KEYS) {
			expect(stack?.[key]).toEqual(state[key]);
		}
		expect(stack?.filterSaturation).toBe(1.75);
	});

	it('hands back a copy so a renderer cannot write into the store', () => {
		const state = sourceWith(['logo']);
		const stack = resolveFilterStack(state, 'logo');
		expect(stack).not.toBe(state);
		expect(resolveFilterStack(state, 'logo')).not.toBe(stack);
	});
});
