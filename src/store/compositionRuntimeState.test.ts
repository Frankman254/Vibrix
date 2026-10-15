import { describe, expect, it } from 'vitest';
import { createBackgroundImageItem } from '@/features/background/backgroundImages';
import { cloneFactoryDefaultState } from '@/store/factoryDefaults';
import {
	buildComposeRuntimePatch,
	hydrateComposeBaseState,
	restoreComposeBaseForPersistence
} from './compositionRuntimeState';
import type { WallpaperStore } from './wallpaperStoreTypes';

describe('Compose runtime state', () => {
	it('hydrates URLs by asset identity without borrowing live configuration', () => {
		const base = cloneFactoryDefaultState();
		base.backgroundImages = [
			createBackgroundImageItem('image-a', null, null, { scale: 1.4 })
		];
		base.activeImageId = 'image-a';
		const live = cloneFactoryDefaultState();
		live.backgroundImages = [
			createBackgroundImageItem(
				'image-a',
				'blob:restored',
				'data:image/a',
				{
					scale: 9
				}
			)
		];

		const hydrated = hydrateComposeBaseState(base, live);
		expect(hydrated.imageUrl).toBe('blob:restored');
		expect(hydrated.imageUrls).toEqual(['blob:restored']);
		expect(hydrated.backgroundImages[0]).toMatchObject({
			url: 'blob:restored',
			thumbnailUrl: 'data:image/a',
			scale: 1.4
		});
	});

	it('patches visual state without touching the audio transport', () => {
		const current = cloneFactoryDefaultState();
		const resolved = cloneFactoryDefaultState();
		resolved.logoBaseSize = current.logoBaseSize + 10;
		resolved.audioPaused = !current.audioPaused;

		const patch = buildComposeRuntimePatch(current, resolved);
		expect(patch.logoBaseSize).toBe(resolved.logoBaseSize);
		expect(patch).not.toHaveProperty('audioPaused');
	});

	it('substitutes the frozen base when persistence sees a projected frame', () => {
		const base = cloneFactoryDefaultState();
		base.logoBaseSize = 20;
		const live = {
			...cloneFactoryDefaultState(),
			logoBaseSize: 80,
			composeEnabled: true,
			composeBaseState: base
		} as WallpaperStore;

		const persisted = restoreComposeBaseForPersistence(live);
		expect(persisted.logoBaseSize).toBe(20);
		expect(live.logoBaseSize).toBe(80);
	});
});
