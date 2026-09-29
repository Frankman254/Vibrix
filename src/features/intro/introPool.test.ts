import { describe, expect, it } from 'vitest';
import type {
	BackgroundImageItem,
	IntroSequenceSettings,
	Setlist
} from '@/types/wallpaper';
import { createDefaultIntroSequence } from './introPlan';
import { resolveIntroPaletteUrl, resolveIntroPool } from './introPool';

function image(assetId: string): BackgroundImageItem {
	return { assetId, url: `blob:${assetId}` } as BackgroundImageItem;
}

function setlist(imageAssetIds: string[]): Setlist {
	return {
		id: 'set-1',
		name: 'Set',
		imageAssetIds,
		trackIds: [],
		createdAt: 0
	} as Setlist;
}

const COLLECTION = [image('a'), image('b'), image('c')];

function settings(
	patch: Partial<IntroSequenceSettings>
): IntroSequenceSettings {
	return { ...createDefaultIntroSequence('intro'), ...patch };
}

describe('resolveIntroPool', () => {
	it('is the active setlist when the images are automatic', () => {
		const pool = resolveIntroPool(
			{
				backgroundImages: COLLECTION,
				setlists: [setlist(['c', 'b'])],
				activeSetlistId: 'set-1'
			},
			settings({ imageSourceMode: 'setlist' })
		);
		expect(pool.map(item => item.assetId)).toEqual(['c', 'b']);
	});

	it('is the WHOLE collection when the images are hand-picked', () => {
		// A picked image must still be drawn when the setlist filters it out.
		const pool = resolveIntroPool(
			{
				backgroundImages: COLLECTION,
				setlists: [setlist(['c'])],
				activeSetlistId: 'set-1'
			},
			settings({ imageSourceMode: 'manual', imageAssetIds: ['a'] })
		);
		expect(pool.map(item => item.assetId)).toEqual(['a', 'b', 'c']);
	});
});

describe('resolveIntroPaletteUrl', () => {
	it('is the FIRST image of the setlist, never the hand-picked one', () => {
		const state = {
			backgroundImages: COLLECTION,
			setlists: [setlist(['c', 'a'])],
			activeSetlistId: 'set-1'
		};
		expect(resolveIntroPaletteUrl(state)).toBe('blob:c');
	});

	it('is null when there is no image at all', () => {
		expect(
			resolveIntroPaletteUrl({
				backgroundImages: [],
				setlists: [],
				activeSetlistId: null
			})
		).toBeNull();
	});
});
