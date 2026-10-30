import { describe, expect, it } from 'vitest';
import { STORE_PERSIST_VERSION } from '@/lib/version';
import { migrateWallpaperStore } from './wallpaperStoreMigrations';

/**
 * The persisted lyrics overrides go through a field whitelist, so any new
 * override key is silently dropped on rehydrate until it is listed there.
 */
function migrateOverrides(override: Record<string, unknown>) {
	const migrated = migrateWallpaperStore(
		{
			audioLyricsByTrackAssetId: {
				'track-1': {
					mode: 'auto',
					rawText: '',
					lyrixaRenderMode: 'bundle',
					lyrixaLayerOverrides: { 'layer-1': override }
				}
			}
		},
		STORE_PERSIST_VERSION
	);
	return migrated.audioLyricsByTrackAssetId['track-1']
		?.lyrixaLayerOverrides?.['layer-1'];
}

describe('lyrics layer color overrides persistence', () => {
	it('keeps the lightweight song identity across a rehydrate', () => {
		const migrated = migrateWallpaperStore(
			{
				audioLyricsByTrackAssetId: {
					'asset-1': {
						mode: 'lrc',
						rawText: '[00:01]Hi',
						targetTrack: {
							name: 'Artist - Song.mp3',
							fileKey: 'song::100::200',
							durationMs: 180_000
						}
					}
				}
			},
			STORE_PERSIST_VERSION
		);

		expect(
			migrated.audioLyricsByTrackAssetId['asset-1']?.targetTrack
		).toEqual({
			name: 'Artist - Song.mp3',
			fileKey: 'song::100::200',
			durationMs: 180_000
		});
	});

	it('keeps the color modes and secondary colors across a rehydrate', () => {
		expect(
			migrateOverrides({
				textColor: '#ff0000',
				textColorMode: 'gradient',
				textColorSecondary: '#0000ff',
				glowColor: '#00ffff',
				glowColorMode: 'rainbow',
				glowColorSecondary: '#ffff00'
			})
		).toEqual({
			textColor: '#ff0000',
			textColorMode: 'gradient',
			textColorSecondary: '#0000ff',
			glowColor: '#00ffff',
			glowColorMode: 'rainbow',
			glowColorSecondary: '#ffff00'
		});
	});

	it('leaves a legacy single-color override untouched (no mode ⇒ solid)', () => {
		expect(
			migrateOverrides({ textColor: '#ffffff', glowColor: '#00ffff' })
		).toEqual({ textColor: '#ffffff', glowColor: '#00ffff' });
	});

	it('keeps the color source of each of the three slots', () => {
		expect(
			migrateOverrides({
				textColorSource: 'image',
				strokeColor: '#010101',
				strokeColorMode: 'gradient',
				strokeColorSecondary: '#020202',
				strokeColorSource: 'theme',
				strokeWidth: 4,
				glowColorSource: 'manual'
			})
		).toEqual({
			textColorSource: 'image',
			strokeColor: '#010101',
			strokeColorMode: 'gradient',
			strokeColorSecondary: '#020202',
			strokeColorSource: 'theme',
			strokeWidth: 4,
			glowColorSource: 'manual'
		});
	});

	it('drops a malformed mode or source instead of persisting it', () => {
		expect(
			migrateOverrides({
				textColor: '#ffffff',
				textColorMode: 'plaid',
				glowColorSource: 'wallpaper'
			})
		).toEqual({ textColor: '#ffffff' });
	});
});
