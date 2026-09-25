import { describe, it, expect } from 'vitest';
import {
	resolveSceneBindingChange,
	sceneBindingMode
} from '@/features/scenes/sceneSlot';

const slots = [
	{ id: 'a', values: null },
	{ id: 'b', values: { x: 1 } },
	{ id: 'c', values: { x: 2 } }
];

describe('scene binding tri-state', () => {
	it('reads the three states out of the stored ref', () => {
		expect(sceneBindingMode(null)).toBe('keep');
		expect(sceneBindingMode('off')).toBe('off');
		expect(sceneBindingMode('b')).toBe('slot');
	});

	it('keep and off do not depend on the slots', () => {
		expect(resolveSceneBindingChange('keep', 'b', slots)).toBeNull();
		expect(resolveSceneBindingChange('off', 'b', slots)).toBe('off');
		expect(resolveSceneBindingChange('off', null, [])).toBe('off');
	});

	it('pressing slot keeps the current one when it still holds values', () => {
		expect(resolveSceneBindingChange('slot', 'c', slots)).toBe('c');
	});

	it('pressing slot lands on the first usable one, never on an empty slot', () => {
		expect(resolveSceneBindingChange('slot', null, slots)).toBe('b');
		// 'a' exists but is empty: coming from it must not keep it.
		expect(resolveSceneBindingChange('slot', 'a', slots)).toBe('b');
	});

	it('pressing slot with nothing saved is a no-op, not an empty binding', () => {
		expect(
			resolveSceneBindingChange('slot', null, [{ id: 'a', values: null }])
		).toBeUndefined();
		expect(resolveSceneBindingChange('slot', null, [])).toBeUndefined();
	});
});
