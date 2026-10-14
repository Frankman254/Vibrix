import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackgroundImageItem } from '@/features/background/backgroundImages';
import type { VibrixScoreEnvelope } from '@/features/composition/vibrixScore';
import { partializeWallpaperStore } from '@/store/wallpaperStorePersistence';

const local = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (key: string) => local.get(key) ?? null,
	setItem: (key: string, value: string) => void local.set(key, value),
	removeItem: (key: string) => void local.delete(key),
	clear: () => void local.clear()
};

const { useWallpaperStore } = await import('@/store/wallpaperStore');

function score(): VibrixScoreEnvelope {
	return {
		app: 'Lyrixa',
		exportKind: 'vibrix-score',
		schemaVersion: 2,
		exportedAt: '2026-10-13T00:00:00.000Z',
		projectName: 'Compose fixture',
		sourceTrack: null,
		renderer: { minimumVersion: '0.7.0-alpha' },
		score: { tracks: [], cues: [] },
		dependencies: []
	};
}

describe('Compose session store', () => {
	beforeEach(() => {
		useWallpaperStore.getState().clearComposeSession();
		useWallpaperStore.setState({
			activeImageId: 'image-a',
			imageUrl: 'blob:http://vibrix/active',
			imageUrls: ['blob:http://vibrix/active'],
			logoUrl: 'blob:http://vibrix/logo',
			globalBackgroundUrl: 'blob:http://vibrix/global',
			backgroundImages: [
				createBackgroundImageItem(
					'image-a',
					'blob:http://vibrix/active',
					'data:image/webp;base64,preview'
				)
			]
		});
	});

	it('stages a detached, transport-safe base without enabling Compose', () => {
		const imported = score();
		useWallpaperStore.getState().stageComposeScore(imported);

		const staged = useWallpaperStore.getState();
		expect(staged.composeEnabled).toBe(false);
		expect(staged.composeScore).toEqual(imported);
		expect(staged.composeScore).not.toBe(imported);
		expect(staged.composeBaseState?.activeImageId).toBe('image-a');
		expect(staged.composeBaseState?.imageUrl).toBeNull();
		expect(staged.composeBaseState?.imageUrls).toEqual([]);
		expect(staged.composeBaseState?.logoUrl).toBeNull();
		expect(staged.composeBaseState?.globalBackgroundUrl).toBeNull();
		expect(staged.composeBaseState?.backgroundImages[0]).toMatchObject({
			assetId: 'image-a',
			url: null,
			thumbnailUrl: null
		});

		useWallpaperStore.setState({ activeImageId: 'image-b' });
		imported.projectName = 'mutated outside';
		expect(
			useWallpaperStore.getState().composeBaseState?.activeImageId
		).toBe('image-a');
		expect(useWallpaperStore.getState().composeScore?.projectName).toBe(
			'Compose fixture'
		);
	});

	it('only enables a complete staged session and keeps it persisted', () => {
		useWallpaperStore.getState().setComposeEnabled(true);
		expect(useWallpaperStore.getState().composeEnabled).toBe(false);

		useWallpaperStore.getState().stageComposeScore(score());
		useWallpaperStore.getState().setComposeEnabled(true);
		expect(useWallpaperStore.getState().composeEnabled).toBe(true);

		const persisted = partializeWallpaperStore(
			useWallpaperStore.getState()
		);
		expect(persisted.composeEnabled).toBe(true);
		expect(persisted.composeScore?.projectName).toBe('Compose fixture');
		expect(persisted.composeBaseState?.activeImageId).toBe('image-a');
	});

	it('disables or clears the session without touching the live document', () => {
		useWallpaperStore.getState().stageComposeScore(score());
		useWallpaperStore.getState().setComposeEnabled(true);
		useWallpaperStore.getState().setComposeEnabled(false);
		expect(useWallpaperStore.getState().composeEnabled).toBe(false);
		expect(useWallpaperStore.getState().composeScore).not.toBeNull();

		useWallpaperStore.getState().clearComposeSession();
		expect(useWallpaperStore.getState().composeScore).toBeNull();
		expect(useWallpaperStore.getState().composeBaseState).toBeNull();
		expect(useWallpaperStore.getState().activeImageId).toBe('image-a');
	});
});
