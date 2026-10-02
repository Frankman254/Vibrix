import { describe, expect, it } from 'vitest';
import { EMPTY_REVISION, manifestRevision, revisionOf } from './slotRevision';

describe('revisionOf', () => {
	it('ignores key order at every level', () => {
		const a = {
			spectrumBars: 64,
			nested: { alpha: 1, beta: [1, 2], gamma: { deep: true } }
		};
		const b = {
			nested: { gamma: { deep: true }, beta: [1, 2], alpha: 1 },
			spectrumBars: 64
		};
		expect(revisionOf(a)).toBe(revisionOf(b));
	});

	it('changes when any value changes, however deep', () => {
		const base = { nested: { alpha: 1, list: [1, 2, 3] } };
		expect(revisionOf(base)).not.toBe(
			revisionOf({ nested: { alpha: 2, list: [1, 2, 3] } })
		);
		expect(revisionOf(base)).not.toBe(
			revisionOf({ nested: { alpha: 1, list: [1, 2, 4] } })
		);
	});

	it('treats array order as content', () => {
		expect(revisionOf({ list: [1, 2] })).not.toBe(
			revisionOf({ list: [2, 1] })
		);
	});

	it('does not see the slot name, because it only ever receives values', () => {
		// The contract's rule, expressed the only way it can be: the function
		// takes `values`, so a rename cannot reach it. Same values, two names:
		const values = { looksContrast: 1.2 };
		const renamed = { id: 'look-1', name: 'Cold grade', values };
		const original = { id: 'look-1', name: 'Warm grade', values };
		expect(revisionOf(original.values)).toBe(revisionOf(renamed.values));
	});

	it('reports an empty slot instead of hashing nothing', () => {
		expect(revisionOf(null)).toBe(EMPTY_REVISION);
		expect(revisionOf(undefined)).toBe(EMPTY_REVISION);
	});

	it('does not confuse a string with the number that prints the same', () => {
		expect(revisionOf({ value: '1' })).not.toBe(revisionOf({ value: 1 }));
	});

	it('treats an absent key and an explicit undefined as the same content', () => {
		expect(revisionOf({ a: 1 })).toBe(revisionOf({ a: 1, b: undefined }));
	});

	it('distinguishes null from undefined, which the store does too', () => {
		expect(revisionOf({ a: null })).not.toBe(revisionOf({ a: 1 }));
		// `{ a: null }` is a stored "no value"; `{}` is a missing key.
		expect(revisionOf({ a: null })).not.toBe(revisionOf({}));
	});

	it('is stable across calls and hex-shaped', () => {
		const values = { spectrumBars: 64, spectrumGlow: 0.5 };
		const first = revisionOf(values);
		expect(revisionOf(values)).toBe(first);
		expect(first).toMatch(/^[0-9a-f]{14}$/);
	});
});

describe('manifestRevision', () => {
	it('does not depend on the order the slots were visited in', () => {
		expect(manifestRevision(['aaa', 'bbb', 'ccc'])).toBe(
			manifestRevision(['ccc', 'aaa', 'bbb'])
		);
	});

	it('changes when any member revision changes', () => {
		expect(manifestRevision(['aaa', 'bbb'])).not.toBe(
			manifestRevision(['aaa', 'bbc'])
		);
	});

	it('separates "one empty slot" from "no slots at all"', () => {
		expect(manifestRevision([EMPTY_REVISION])).not.toBe(
			manifestRevision([])
		);
	});
});
