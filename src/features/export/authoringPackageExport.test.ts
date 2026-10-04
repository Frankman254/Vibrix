import { describe, expect, it, vi } from 'vitest';
import type { WallpaperState } from '@/types/wallpaper';
import { CONTRACT_FIXTURE_STATE } from '@/features/scenes/authoringManifestFixture';
import { createAuthoringPackageBlob } from './authoringPackageExport';

describe('createAuthoringPackageBlob', () => {
	it('turns a browser-local thumbnail into a transportable preview', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					new Blob([new Uint8Array([1, 2, 3])], {
						type: 'image/webp'
					})
				)
		) as unknown as typeof fetch;
		const { blob, authoringPackage } = await createAuthoringPackageBlob(
			{
				...CONTRACT_FIXTURE_STATE,
				backgroundImages: [
					{
						assetId: 'image-a',
						url: 'blob:original',
						thumbnailUrl: 'blob:thumbnail',
						originalFileName: 'cover.png',
						enabled: true,
						playbackSwitchAt: null,
						sceneSlotId: null
					}
				]
			} as unknown as WallpaperState,
			{
				exportedAt: '2026-10-04T00:00:00.000Z',
				projectName: 'Demo'
			},
			fetchImpl
		);
		expect(authoringPackage.manifest.images[0].thumbnailDataUrl).toBe(
			'data:image/webp;base64,AQID'
		);
		expect(blob.type).toBe('application/x-vibrix-authoring+json');
		expect(JSON.parse(await blob.text()).format).toBe('vibrix-authoring');
	});
});
