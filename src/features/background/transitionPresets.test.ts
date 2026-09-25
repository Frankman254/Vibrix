import { describe, it, expect } from 'vitest';
import {
	BUILT_IN_TRANSITION_PRESETS,
	createDefaultTransitionPresets,
	imageMatchesTransitionPreset,
	mergeTransitionPresets,
	resolveImageTransitionPresetId,
	uniqueTransitionPresetName
} from '@/features/background/transitionPresets';
import type { TransitionPreset } from '@/types/wallpaper';

const preset = BUILT_IN_TRANSITION_PRESETS[0]!;

/** Only the five keys the preset covers matter here. */
function imageFrom(
	settings: Partial<TransitionPreset['settings']> = {},
	transitionPresetId: string | null = preset.id
) {
	return {
		...preset.settings,
		...settings,
		transitionPresetId
	};
}

describe('mergeTransitionPresets', () => {
	it('seeds the factory presets when there is nothing stored', () => {
		expect(mergeTransitionPresets(undefined).map(p => p.id)).toEqual(
			BUILT_IN_TRANSITION_PRESETS.map(p => p.id)
		);
	});

	it('keeps user presets and does not duplicate factory ones', () => {
		const stored = [
			...createDefaultTransitionPresets(),
			{
				id: 'tp-mine',
				name: 'Mine',
				builtIn: false,
				settings: preset.settings
			}
		];
		const merged = mergeTransitionPresets(stored);
		expect(merged).toHaveLength(stored.length);
		expect(merged.some(p => p.id === 'tp-mine')).toBe(true);
	});

	it('leaves a renamed factory preset renamed', () => {
		const stored = createDefaultTransitionPresets();
		stored[0]!.name = 'My cut';
		expect(mergeTransitionPresets(stored)[0]!.name).toBe('My cut');
	});

	it('drops entries that are not presets', () => {
		const merged = mergeTransitionPresets([null, 3, { id: 'x' }]);
		expect(merged.map(p => p.id)).toEqual(
			BUILT_IN_TRANSITION_PRESETS.map(p => p.id)
		);
	});
});

describe('resolveImageTransitionPresetId', () => {
	const presets = createDefaultTransitionPresets();

	it('names the preset while the image still matches it', () => {
		expect(resolveImageTransitionPresetId(imageFrom(), presets)).toBe(
			preset.id
		);
	});

	it('reads as Custom once a dial is moved', () => {
		const image = imageFrom({ transitionDuration: 3.3 });
		expect(resolveImageTransitionPresetId(image, presets)).toBeNull();
	});

	it('reads as Custom when the preset was deleted', () => {
		const image = imageFrom({}, 'tp-gone');
		expect(resolveImageTransitionPresetId(image, presets)).toBeNull();
	});

	it('reads as Custom when the image never had a preset', () => {
		expect(
			resolveImageTransitionPresetId(imageFrom({}, null), presets)
		).toBeNull();
	});
});

describe('imageMatchesTransitionPreset', () => {
	it('compares the five dials, not the id', () => {
		expect(imageMatchesTransitionPreset(imageFrom({}, null), preset)).toBe(
			true
		);
		expect(
			imageMatchesTransitionPreset(
				imageFrom({ transitionAudioDrive: 1.2 }),
				preset
			)
		).toBe(false);
	});
});

describe('uniqueTransitionPresetName', () => {
	const presets = createDefaultTransitionPresets();

	it('keeps a free name as it is', () => {
		expect(uniqueTransitionPresetName('Drop', presets)).toBe('Drop');
	});

	it('numbers a taken one instead of shadowing it', () => {
		expect(uniqueTransitionPresetName(preset.name, presets)).toBe(
			`${preset.name} 2`
		);
	});

	it('falls back to a name when given blank input', () => {
		expect(uniqueTransitionPresetName('   ', presets)).toBe('Transition');
	});
});
