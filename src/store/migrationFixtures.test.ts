import { describe, expect, it } from 'vitest';
import {
	MIGRATION_FIXTURES,
	type MigrationFixture
} from '@/lib/testing/migrationFixtures';
import { RADIAL_SHAPE_IDS } from '@/features/spectrum';
import { migrateWallpaperStore } from './wallpaperStoreMigrations';
import type { WallpaperStore } from './wallpaperStoreTypes';

/**
 * Runs every representative saved project through the current migration chain.
 *
 * "It did not throw" is not the bar. A migration that silently drops a bound
 * profile, resets a palette or retargets a scene is the failure mode that
 * actually costs a user their work, so these assert on values.
 */

const migrate = (fixture: MigrationFixture): WallpaperStore =>
	migrateWallpaperStore(
		structuredClone(fixture.state) as never,
		fixture.version
	);

const slotNamed = <T>(
	slots: ReadonlyArray<{ id: string; name: string; values: T | null }>,
	name: string
) => slots.find(slot => slot.name === name);

describe.each(MIGRATION_FIXTURES)('$label', fixture => {
	const migrated = migrate(fixture as MigrationFixture);

	it('keeps both background images, in order, with their metadata', () => {
		expect(migrated.backgroundImages.map(i => i.assetId)).toEqual([
			'img-sunset',
			'img-night'
		]);
		expect(migrated.backgroundImages[0]?.originalFileName).toBe(
			'sunset.png'
		);
		expect(migrated.backgroundImages[0]?.playbackSwitchAt).toBe(12);
		expect(migrated.backgroundImages[1]?.playbackSwitchAt).toBe(90);
		expect(migrated.activeImageId).toBe('img-sunset');
	});

	it('keeps the user profile slots the project actually saved', () => {
		expect(
			slotNamed(migrated.spectrumProfileSlots, 'Calm')?.values
		).toMatchObject({ spectrumBarCount: 64 });
		expect(
			slotNamed(migrated.spectrumProfileSlots, 'Hype')?.values
		).toMatchObject({ spectrumBarCount: 200 });
		expect(
			slotNamed(migrated.logoProfileSlots, 'Big logo')?.values
		).toMatchObject({ logoBaseSize: 300 });
	});

	it('resolves every binding to the slot it was meant to point at', () => {
		// The whole point of v104: whatever the save used (index or id), the
		// binding must land on the SAME named slot. Scenes are where a binding
		// lives now — the per-image one was retired — so they carry the test.
		const hype = slotNamed(migrated.spectrumProfileSlots, 'Hype');
		const bigLogo = slotNamed(migrated.logoProfileSlots, 'Big logo');

		for (const image of migrated.backgroundImages) {
			const raw = image as unknown as Record<string, unknown>;
			expect(raw.spectrumProfileSlotId).toBeUndefined();
			expect(raw.logoProfileSlotId).toBeUndefined();
		}

		const scene = migrated.sceneSlots.find(s => s.id === 'scene-main');
		expect(scene, 'the saved scene survived').toBeDefined();
		expect(scene?.spectrumSlotId).toBe(hype?.id);
		expect(scene?.logoSlotId).toBe(bigLogo?.id);
		// 3-state semantics: 'off' and null are distinct from a slot ref.
		expect(scene?.particlesSlotId).toBe('off');
		expect(scene?.rainSlotId).toBeNull();
	});

	it('gives every slot a stable, unique id', () => {
		for (const family of [
			migrated.spectrumProfileSlots,
			migrated.spectrumSecondProfileSlots,
			migrated.logoProfileSlots
		]) {
			const ids = family.map(slot => slot.id);
			expect(ids.every(Boolean)).toBe(true);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	it('keeps Spectrum 1 visual identity', () => {
		expect(migrated.spectrumEnabled).toBe(true);
		expect(migrated.spectrumOpacity).toBe(0.77);
		expect(migrated.spectrumBarCount).toBe(128);
		expect(migrated.spectrumInnerRadius).toBe(140);
		expect(migrated.spectrumMode).toBe('radial');
	});

	it('keeps Spectrum 2 independent of Spectrum 1', () => {
		expect(migrated.spectrumSecondProfileSlots.length).toBeGreaterThan(0);
		for (const second of migrated.spectrumSecondProfileSlots) {
			const main = migrated.spectrumProfileSlots.find(
				slot => slot.id === second.id
			);
			expect(
				main,
				'S1 and S2 must never share a slot id'
			).toBeUndefined();
			const twin = migrated.spectrumProfileSlots.find(
				slot => slot.name === second.name
			);
			if (twin?.values && second.values) {
				expect(
					twin.values,
					'S1 and S2 must not share a values object'
				).not.toBe(second.values);
			}
		}
	});

	it('keeps audio, logo, track title and lyrics settings', () => {
		expect(migrated.audioFileLoop).toBe(true);
		expect(migrated.logoEnabled).toBe(true);
		expect(migrated.logoBaseSize).toBe(180);
		expect(migrated.logoPositionX).toBe(-0.4);
		expect(migrated.logoPositionY).toBe(0.25);
		expect(migrated.audioTrackTitleEnabled).toBe(true);
		expect(migrated.audioLyricsEnabled).toBe(true);
		expect(migrated.audioLyricsFontSize).toBe(42);
	});

	it('keeps overlays with their placement', () => {
		const overlay = migrated.overlays.find(o => o.id === 'ov-1');
		expect(overlay, 'the saved overlay survived').toBeDefined();
		expect(overlay?.assetId).toBe('ov-asset-1');
		expect(overlay?.scale).toBe(1.4);
		expect(overlay?.rotation).toBe(15);
		expect(overlay?.opacity).toBe(0.8);
		expect(overlay?.zIndex).toBe(92);
	});

	it('lands on a radial shape the renderer can actually draw', () => {
		expect(RADIAL_SHAPE_IDS).toContain(migrated.spectrumRadialShape);
		for (const instance of migrated.spectrumInstances) {
			expect(RADIAL_SHAPE_IDS).toContain(instance.spectrumRadialShape);
		}
		for (const slot of [
			...migrated.spectrumProfileSlots,
			...migrated.spectrumSecondProfileSlots
		]) {
			if (!slot.values?.spectrumRadialShape) continue;
			expect(RADIAL_SHAPE_IDS).toContain(slot.values.spectrumRadialShape);
		}
	});

	it('leaves no required key undefined', () => {
		for (const key of [
			'spectrumRadialSharpness',
			'spectrumRadialShape',
			'defaultSceneSlotId',
			'spectrumLiquidLayer1Pixelate',
			'spectrumPixelate'
		] as const) {
			expect(
				(migrated as unknown as Record<string, unknown>)[key],
				key
			).not.toBeUndefined();
		}
		expect(typeof migrated.spectrumRadialSharpness).toBe('number');
		expect(Number.isFinite(migrated.spectrumRadialSharpness)).toBe(true);
	});

	it('is idempotent — re-migrating changes nothing', () => {
		const again = migrateWallpaperStore(
			structuredClone(migrated) as never,
			106
		);
		expect(again.spectrumProfileSlots.map(s => s.id)).toEqual(
			migrated.spectrumProfileSlots.map(s => s.id)
		);
		expect(again.sceneSlots[0]?.spectrumSlotId).toBe(
			migrated.sceneSlots[0]?.spectrumSlotId
		);
		expect(again.spectrumRadialShape).toBe(migrated.spectrumRadialShape);
	});
});

describe('per-version specifics', () => {
	const byVersion = (version: number) =>
		migrate(MIGRATION_FIXTURES.find(f => f.version === version)!);

	it('v96: rescues the legacy Motion bundle into particles + rain slots', () => {
		const migrated = byVersion(96);
		expect(
			slotNamed(migrated.particlesProfileSlots, 'Storm')?.values
		).toMatchObject({ particleCount: 321 });
		expect(
			slotNamed(migrated.rainProfileSlots, 'Storm')?.values
		).toMatchObject({ rainDropCount: 777 });
		expect(
			(migrated as unknown as Record<string, unknown>).motionProfileSlots
		).toBeUndefined();
	});

	it('v96: rescues the per-image Spectrum 2 override as a named S2 slot', () => {
		const migrated = byVersion(96);
		const rescued = migrated.spectrumSecondProfileSlots.find(
			slot => slot.values?.spectrumOpacity === 0.42
		);
		expect(
			rescued,
			'the per-image S2 override became a slot'
		).toBeDefined();
		for (const image of migrated.backgroundImages) {
			expect(
				(image as unknown as Record<string, unknown>)
					.spectrumSecondOverride
			).toBeUndefined();
		}
	});

	it('v96: retired radial shape is remapped, not left broken', () => {
		// The fixture saved `moon`, which no longer exists.
		expect(byVersion(96).spectrumRadialShape).toBe('oval');
	});

	it('v96: keeps the pixelate post-process settings', () => {
		const migrated = byVersion(96);
		expect(migrated.spectrumPixelate).toBe(true);
		expect(migrated.spectrumPixelateScale).toBe(4);
	});

	it('v97+: an existing S2 bank is never overwritten by S1', () => {
		for (const version of [97, 98, 99, 102, 103]) {
			const migrated = byVersion(version);
			expect(
				slotNamed(migrated.spectrumSecondProfileSlots, 'S2 Only')
					?.values,
				`v${version}`
			).toMatchObject({ spectrumOpacity: 0.12 });
			// S1's own slots must not have been replaced by S2's.
			expect(
				slotNamed(migrated.spectrumProfileSlots, 'Calm'),
				`v${version}`
			).toBeDefined();
		}
	});

	it('v98+: keeps defaultSceneSlotId pointing at a scene that exists', () => {
		for (const version of [98, 99, 102, 103, 104, 105, 106]) {
			const migrated = byVersion(version);
			expect(migrated.defaultSceneSlotId, `v${version}`).toBe(
				'scene-main'
			);
			expect(
				migrated.sceneSlots.some(
					s => s.id === migrated.defaultSceneSlotId
				),
				`v${version} default scene resolves`
			).toBe(true);
		}
	});

	it('v99: backfills a sparse Spectrum 2 instance without losing its values', () => {
		const instance = byVersion(99).spectrumInstances[0];
		expect(instance?.spectrumOpacity).toBe(0.33);
		expect(instance?.spectrumRadialSharpness).toBe(0);
		expect(instance?.spectrumRadialShape).toBeDefined();
	});

	it('v107: drops the removed canvas liquid-glass keys from saved stores', () => {
		for (const version of [96, 102, 106]) {
			const migrated = byVersion(version) as Record<string, unknown>;
			expect('nowPlayingLiquidGlassBlur' in migrated, `v${version}`).toBe(
				false
			);
			expect(
				'audioLyricsLiquidGlassEnabled' in migrated,
				`v${version}`
			).toBe(false);
		}
	});

	it('v107: keeps the CSS-only HUD glass toggle, which was NOT removed', () => {
		expect(typeof byVersion(106).hudLiquidGlassEnabled).toBe('boolean');
	});

	it('v108: drops every Edge Glow key from saved stores', () => {
		// The fixtures predate the removal but never carried these keys, so
		// inject a realistic pair and prove the strip actually runs. Without
		// this the 28 dead keys would ride along in saved projects forever.
		const fixture = MIGRATION_FIXTURES.find(f => f.version === 106)!;
		const withEdgeGlow = {
			...structuredClone(fixture.state),
			logoEdgeGlowEnabled: true,
			logoEdgeGlowIntensity: 1.2,
			logoEdgeGlowColor: '#00eeff',
			bgEdgeGlowEnabled: true,
			bgEdgeGlowRadius: 32,
			bgEdgeGlowBlendMode: 'lighter'
		};
		const migrated = migrateWallpaperStore(
			withEdgeGlow as never,
			fixture.version
		) as unknown as Record<string, unknown>;

		expect(
			Object.keys(migrated).filter(
				k => k.startsWith('logoEdgeGlow') || k.startsWith('bgEdgeGlow')
			)
		).toEqual([]);
	});

	it('v108: keeps Flash Edge, which replaced Edge Glow and is NOT removed', () => {
		const migrated = byVersion(106) as unknown as Record<string, unknown>;
		expect(typeof migrated.logoFlashEdgeEnabled).toBe('boolean');
		expect(typeof migrated.bgFlashEdgeEnabled).toBe('boolean');
	});

	it('v104+: id bindings pass through without being re-minted', () => {
		for (const version of [104, 105, 106]) {
			const migrated = byVersion(version);
			// Banks are padded to their default length; the saved slots must
			// keep their ids and stay at the front.
			expect(
				migrated.spectrumProfileSlots.slice(0, 2).map(s => s.id),
				`v${version}`
			).toEqual(['slot-calm', 'slot-hype']);
			expect(migrated.sceneSlots[0]?.spectrumSlotId, `v${version}`).toBe(
				'slot-hype'
			);
		}
	});

	it('v105+: keeps per-liquid-layer pixelate flags', () => {
		const migrated = byVersion(105);
		expect(migrated.spectrumLiquidLayer1Pixelate).toBe(true);
		expect(migrated.spectrumLiquidLayer3Pixelate).toBe(true);
		expect(migrated.spectrumLiquidLayer2Pixelate).toBe(false);
	});

	it('v106: a current save survives untouched, sharpness included', () => {
		const migrated = byVersion(106);
		expect(migrated.spectrumRadialSharpness).toBe(0.65);
		expect(migrated.spectrumRadialShape).toBe('star6');
	});
});

describe('binding stability under slot churn', () => {
	/**
	 * The reason v104 exists. A binding must follow the slot itself, not its
	 * position, so reordering or deleting a neighbour cannot retarget it.
	 */
	const migrated = migrate(
		MIGRATION_FIXTURES.find(f => f.version === 96)! as MigrationFixture
	);

	it('survives reordering the slot array', () => {
		const boundId = migrated.sceneSlots[0]?.spectrumSlotId;
		const reordered = [...migrated.spectrumProfileSlots].reverse();
		expect(reordered.find(slot => slot.id === boundId)?.name).toBe('Hype');
	});

	it('survives deleting an unrelated slot', () => {
		const boundId = migrated.sceneSlots[0]?.spectrumSlotId;
		const remaining = migrated.spectrumProfileSlots.filter(
			slot => slot.name !== 'Calm'
		);
		expect(remaining.find(slot => slot.id === boundId)?.name).toBe('Hype');
	});

	it('resolves to nothing — not to the wrong slot — when its slot is deleted', () => {
		const boundId = migrated.sceneSlots[0]?.spectrumSlotId;
		const remaining = migrated.spectrumProfileSlots.filter(
			slot => slot.id !== boundId
		);
		expect(remaining.find(slot => slot.id === boundId)).toBeUndefined();
	});
});
