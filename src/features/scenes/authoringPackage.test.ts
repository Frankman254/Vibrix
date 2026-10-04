import { describe, expect, it } from 'vitest';
import type { WallpaperState } from '@/types/wallpaper';
import { CONTRACT_FIXTURE_STATE } from './authoringManifestFixture';
import { buildAuthoringPackage } from './authoringPackage';

const OPTIONS = {
	exportedAt: '2026-10-03T00:00:00.000Z',
	projectName: 'Demo'
};

describe('buildAuthoringPackage', () => {
	it('embeds the v2 manifest and immutable snapshots with matching revisions', () => {
		const pkg = buildAuthoringPackage(
			{
				...CONTRACT_FIXTURE_STATE,
				backgroundImages: [
					{
						assetId: 'image-a',
						url: 'blob:private-original',
						thumbnailUrl: 'blob:private-thumbnail',
						originalFileName: 'cover.png',
						enabled: true,
						scale: 1,
						positionX: 0,
						positionY: 0,
						opacity: 1,
						transitionType: 'fade',
						transitionDuration: 1,
						playbackSwitchAt: 10,
						sceneSlotId: 'scene-a'
					}
				]
			} as unknown as WallpaperState,
			OPTIONS
		);
		expect(pkg.format).toBe('vibrix-authoring');
		expect(pkg.manifest.schemaVersion).toBe(2);
		for (const item of [...pkg.manifest.slots, ...pkg.manifest.images]) {
			expect(
				pkg.snapshots.find(snapshot => snapshot.id === item.id)
					?.revision
			).toBe(item.revision);
		}
		const image = pkg.snapshots.find(snapshot => snapshot.kind === 'image');
		expect(image?.values).not.toHaveProperty('url');
		expect(image?.values).not.toHaveProperty('thumbnailUrl');
		expect(image?.values).not.toHaveProperty('playbackSwitchAt');
	});
});
