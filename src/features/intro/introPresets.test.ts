import { describe, expect, it } from 'vitest';
import { INTRO_PRESETS, findIntroPreset } from './introPresets';
import { createDefaultIntroSequence } from './introPlan';

describe('INTRO_PRESETS', () => {
	it('never touches what belongs to the user', () => {
		// A look may not switch the window on, rewrite the text, repoint the
		// spectrum slots or throw away the hand-picked images.
		const forbidden = [
			'enabled',
			'titleText',
			'taglineText',
			'imageAssetIds',
			'imageSourceMode',
			'spectrumPrimaryEnabled',
			'spectrumPrimarySlotId',
			'spectrumSecondEnabled',
			'spectrumSecondSlotId'
		];
		for (const preset of INTRO_PRESETS) {
			for (const key of forbidden) {
				expect(Object.hasOwn(preset.patch, key)).toBe(false);
			}
		}
	});

	it('patches keys the settings actually have', () => {
		const base = createDefaultIntroSequence('intro');
		for (const preset of INTRO_PRESETS) {
			for (const key of Object.keys(preset.patch)) {
				expect(Object.hasOwn(base, key)).toBe(true);
			}
		}
	});

	it('has unique ids and is looked up by id', () => {
		const ids = INTRO_PRESETS.map(preset => preset.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(findIntroPreset('neon')?.id).toBe('neon');
		expect(findIntroPreset('nope')).toBeNull();
	});
});
