import { describe, expect, it } from 'vitest';
import { migrateWallpaperStore } from '@/store/wallpaperStoreMigrations';
import { DEFAULT_STATE } from '@/store/defaultState';
import { createDefaultIntroSequence, resolveIntroFrame } from './introPlan';
import type { IntroSequenceSettings } from '@/types/wallpaper';

/**
 * Spectrum 1 and Spectrum 2 inside the intro window.
 *
 * The user's report was that the window's spectrum was "mixed": one picker over
 * one list, so Spectrum 2's own saved slots were unreachable and there was no
 * way to ask for both figures. These tests pin the two halves of the fix — the
 * plan draws each bank independently, and an old project keeps the figure it
 * already had.
 */

const VIEWPORT = { width: 1920, height: 1080 } as const;

function frameWith(patch: Partial<IntroSequenceSettings>) {
	return resolveIntroFrame({
		kind: 'intro',
		settings: { ...createDefaultIntroSequence('intro'), ...patch },
		progress: 0.5,
		viewport: VIEWPORT,
		cardCount: 4
	});
}

describe('the intro window spectrums', () => {
	it('draws each bank on its own, and both at once', () => {
		expect(
			frameWith({
				spectrumPrimaryEnabled: true,
				spectrumPrimarySlotId: 's1'
			}).spectrums.map(plan => [plan.bank, plan.slotId])
		).toEqual([['primary', 's1']]);
		expect(
			frameWith({
				spectrumSecondEnabled: true,
				spectrumSecondSlotId: 's2'
			}).spectrums.map(plan => [plan.bank, plan.slotId])
		).toEqual([['second', 's2']]);
		expect(
			frameWith({
				spectrumPrimaryEnabled: true,
				spectrumPrimarySlotId: 's1',
				spectrumSecondEnabled: true,
				spectrumSecondSlotId: 's2'
			}).spectrums.map(plan => plan.bank)
		).toEqual(['primary', 'second']);
	});

	it('draws nothing for a bank that is on with no slot picked', () => {
		expect(
			frameWith({
				spectrumPrimaryEnabled: true,
				spectrumPrimarySlotId: null,
				spectrumSecondEnabled: true,
				spectrumSecondSlotId: null
			}).spectrums
		).toEqual([]);
	});

	it('shares the wave and the centring across both figures', () => {
		const frame = frameWith({
			spectrumPrimaryEnabled: true,
			spectrumPrimarySlotId: 's1',
			spectrumSecondEnabled: true,
			spectrumSecondSlotId: 's2',
			spectrumCentered: false,
			spectrumWaveSpeed: 2,
			spectrumWaveIntensity: 0.5
		});
		for (const plan of frame.spectrums) {
			expect(plan.centered).toBe(false);
			expect(plan.waveSpeed).toBe(2);
			expect(plan.waveIntensity).toBe(0.5);
		}
	});

	it('v139 points the old slot index at the same Spectrum 1 slot', () => {
		const slots = [
			{ id: 'slot-empty', name: 'Empty', values: null },
			{
				id: 'slot-hype',
				name: 'Hype',
				values:
					DEFAULT_STATE.spectrumProfileSlots.find(slot => slot.values)
						?.values ?? null
			}
		];
		const legacyWindow = {
			...createDefaultIntroSequence('intro'),
			spectrumSource: 'slot',
			spectrumSlotIndex: 1
		} as unknown as IntroSequenceSettings;
		const migrated = migrateWallpaperStore(
			{
				...DEFAULT_STATE,
				spectrumProfileSlots: slots,
				introSequence: legacyWindow,
				outroSequence: legacyWindow
			} as never,
			138
		);
		expect(migrated.introSequence.spectrumPrimaryEnabled).toBe(true);
		expect(migrated.introSequence.spectrumPrimarySlotId).toBe('slot-hype');
		expect(migrated.introSequence.spectrumSecondEnabled).toBe(false);
		expect(migrated.introSequence.spectrumSecondSlotId).toBeNull();
		expect(
			(migrated.outroSequence as unknown as Record<string, unknown>)
				.spectrumSlotIndex
		).toBeUndefined();
	});

	it('v139 leaves a window that asked for no figure switched off', () => {
		const migrated = migrateWallpaperStore(
			{
				...DEFAULT_STATE,
				introSequence: {
					...createDefaultIntroSequence('intro'),
					spectrumSource: 'none',
					spectrumSlotIndex: 0
				} as unknown as IntroSequenceSettings
			} as never,
			138
		);
		expect(migrated.introSequence.spectrumPrimaryEnabled).toBe(false);
	});
});
