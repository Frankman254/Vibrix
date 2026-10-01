import { describe, expect, it } from 'vitest';
import { stepOption } from './stepOption';

const opts = [
	{ value: 'a', label: 'A' },
	{ value: 'b', label: 'B', disabled: true },
	{ value: 'c', label: 'C' },
	{ value: 'd', label: 'D' }
];

describe('stepOption', () => {
	it('moves to the neighbour in each direction', () => {
		expect(stepOption(opts, 'c', 1)?.value).toBe('d');
		expect(stepOption(opts, 'd', -1)?.value).toBe('c');
	});

	/** Stepping onto a refused option would either no-op or apply it anyway. */
	it('skips over disabled options instead of landing on them', () => {
		expect(stepOption(opts, 'a', 1)?.value).toBe('c');
		expect(stepOption(opts, 'c', -1)?.value).toBe('a');
	});

	/**
	 * No wrap on purpose: with 120 saved slots, «next» at the end jumping to the
	 * first one is a leap across the whole bank, never what the hand expects.
	 * The arrow goes dead instead.
	 */
	it('stops at both ends rather than wrapping round', () => {
		expect(stepOption(opts, 'a', -1)).toBeUndefined();
		expect(stepOption(opts, 'd', 1)).toBeUndefined();
	});

	/** A slot deleted under the picker leaves a value with no neighbours. */
	it('gives nothing when the current value is not in the list', () => {
		expect(stepOption(opts, 'zzz', 1)).toBeUndefined();
		expect(stepOption(opts, null, -1)).toBeUndefined();
		expect(stepOption([], 'a', 1)).toBeUndefined();
	});

	/** A run of disabled options at the end must not resurrect the arrow. */
	it('goes dead when only disabled options remain that way', () => {
		const tail = [
			{ value: 1, label: 'one' },
			{ value: 2, label: 'two', disabled: true },
			{ value: 3, label: 'three', disabled: true }
		];
		expect(stepOption(tail, 1, 1)).toBeUndefined();
	});
});
