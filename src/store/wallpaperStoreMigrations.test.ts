import { describe, expect, it } from 'vitest';
import {
	createDefaultSpectrumInstance,
	SPECTRUM_INSTANCE_SETTING_KEYS
} from '@/features/spectrum';
import type { SpectrumInstance } from '@/types/wallpaper';
import { APP_LOGO_URL, LEGACY_APP_LOGO_URL } from '@/config/appLogo';
import { CANONICAL_FACTORY_LOGO_URL } from '@/lib/canonicalFactoryPresets';
import { migrateWallpaperStore } from './wallpaperStoreMigrations';

describe('migrateWallpaperStore spectrum instances', () => {
	it('backfills every current Spectrum 2 key without overwriting saved values', () => {
		const legacyInstance = {
			id: 'legacy-s2',
			enabled: true,
			spectrumOpacity: 0.37
		} as Partial<SpectrumInstance> as SpectrumInstance;
		const migrated = migrateWallpaperStore(
			{ spectrumInstances: [legacyInstance] },
			90
		);
		const instance = migrated.spectrumInstances[0];

		expect(instance?.spectrumOpacity).toBe(0.37);
		expect(instance?.spectrumScale).toBe(
			createDefaultSpectrumInstance().spectrumScale
		);
		for (const key of SPECTRUM_INSTANCE_SETTING_KEYS) {
			expect(instance?.[key], key).not.toBeUndefined();
		}
	});
});

describe('migrateWallpaperStore v103 legacy pruning', () => {
	it('splits saved legacy Motion bundles into particles + rain slots and drops the key', () => {
		const migrated = migrateWallpaperStore(
			{
				motionProfileSlots: [
					{ name: 'Empty', values: null },
					{
						name: 'My Vibe',
						values: {
							particleCount: 321,
							particleOpacity: 0.66,
							rainEnabled: true,
							rainDropCount: 777
						}
					}
				]
			},
			102
		);

		expect(
			(migrated as Record<string, unknown>).motionProfileSlots
		).toBeUndefined();
		const particlesSlot = migrated.particlesProfileSlots.find(
			slot => slot.name === 'My Vibe'
		);
		expect(particlesSlot?.values?.particleCount).toBe(321);
		expect(particlesSlot?.values?.particleOpacity).toBe(0.66);
		const rainSlot = migrated.rainProfileSlots.find(
			slot => slot.name === 'My Vibe'
		);
		expect(rainSlot?.values?.rainDropCount).toBe(777);
		// Empty slots (values: null) are not converted.
		expect(
			migrated.particlesProfileSlots.some(slot => slot.name === 'Empty')
		).toBe(false);
	});

	it('does not re-convert Motion bundles for stores already at v103+', () => {
		const migrated = migrateWallpaperStore(
			{
				motionProfileSlots: [
					{ name: 'Stale', values: { particleCount: 9 } }
				]
			},
			103
		);
		expect(
			migrated.particlesProfileSlots.some(slot => slot.name === 'Stale')
		).toBe(false);
		expect(
			(migrated as Record<string, unknown>).motionProfileSlots
		).toBeUndefined();
	});

	it('v104: converts index-based scene bindings to the ids of the slots they pointed at', () => {
		const migrated = migrateWallpaperStore(
			{
				spectrumProfileSlots: [
					{ name: 'Spec A', values: { spectrumBarCount: 11 } },
					{ name: 'Spec B', values: { spectrumBarCount: 22 } }
				],
				looksProfileSlots: [{ name: 'Look A', values: null }],
				sceneSlots: [
					{
						id: 'scene-1',
						name: 'Legacy scene',
						spectrumSlotIndex: 1,
						looksSlotIndex: 0,
						particlesSlotIndex: 'off',
						rainSlotIndex: null
					}
				]
			} as never,
			103
		);

		const scene = migrated.sceneSlots[0]!;
		// The binding must point at the SAME slot the index pointed at…
		expect(scene.spectrumSlotId).toBe(migrated.spectrumProfileSlots[1]!.id);
		expect(scene.looksSlotId).toBe(migrated.looksProfileSlots[0]!.id);
		// …and 3-state semantics survive.
		expect(scene.particlesSlotId).toBe('off');
		expect(scene.rainSlotId).toBeNull();
		// Every slot got a stable id minted.
		for (const slot of migrated.spectrumProfileSlots) {
			expect(slot.id).toBeTruthy();
		}
	});

	it('v104: converts per-image slot indexes to ids and keeps id-based refs intact', () => {
		const migrated = migrateWallpaperStore(
			{
				logoProfileSlots: [
					{ name: 'Logo A', values: null },
					{ name: 'Logo B', values: { logoScale: 2 } }
				],
				backgroundImages: [
					{
						assetId: 'img-1',
						name: 'Pic',
						url: null,
						logoProfileSlotIndex: 1
					}
				]
			} as never,
			103
		);

		expect(migrated.backgroundImages[0]!.logoProfileSlotId).toBe(
			migrated.logoProfileSlots[1]!.id
		);
	});

	it('v104: id-based refs pass through untouched (idempotent re-migration)', () => {
		const once = migrateWallpaperStore(
			{
				spectrumProfileSlots: [
					{ name: 'Spec A', values: { spectrumBarCount: 11 } }
				],
				sceneSlots: [{ id: 'scene-1', name: 'S', spectrumSlotIndex: 0 }]
			} as never,
			103
		);
		const boundId = once.sceneSlots[0]!.spectrumSlotId;
		const twice = migrateWallpaperStore(
			JSON.parse(JSON.stringify(once)) as never,
			104
		);
		expect(twice.sceneSlots[0]!.spectrumSlotId).toBe(boundId);
	});

	it('preserves per-image Spectrum 2 overrides as named S2 profile slots and strips the key', () => {
		const migrated = migrateWallpaperStore(
			{
				backgroundImages: [
					{
						assetId: 'img-1',
						name: 'Sunset',
						url: null,
						spectrumSecondOverride: { spectrumOpacity: 0.42 }
					}
				]
			},
			102
		);

		const slot = migrated.spectrumSecondProfileSlots.find(
			s => s.name === 'S2 · Sunset'
		);
		expect(slot?.values?.spectrumOpacity).toBe(0.42);
		for (const image of migrated.backgroundImages) {
			expect(
				(image as unknown as Record<string, unknown>)
					.spectrumSecondOverride
			).toBeUndefined();
		}
	});
});

describe('migrateWallpaperStore v106 retired radial shapes', () => {
	it('rehomes a retired shape everywhere a spectrum shape can be saved', () => {
		const migrated = migrateWallpaperStore(
			{
				spectrumRadialShape: 'cardioid',
				spectrumInstances: [
					// The retired ids are gone from the union, which is the
					// point — only stale saved data can still carry them.
					{
						id: 'legacy-s2',
						enabled: true,
						spectrumRadialShape: 'heart'
					} as unknown as SpectrumInstance
				],
				spectrumProfileSlots: [
					{
						id: 'slot-1',
						name: 'Saved look',
						values: { spectrumRadialShape: 'wings' }
					}
				]
			} as never,
			105
		);

		expect(migrated.spectrumRadialShape).toBe('oval');
		expect(migrated.spectrumInstances[0]?.spectrumRadialShape).toBe('oval');
		expect(
			migrated.spectrumProfileSlots[0]?.values?.spectrumRadialShape
		).toBe('lens');
	});

	it('keeps valid shapes untouched and seeds the new sharpness key', () => {
		const migrated = migrateWallpaperStore(
			{ spectrumRadialShape: 'star6' } as never,
			105
		);

		expect(migrated.spectrumRadialShape).toBe('star6');
		expect(migrated.spectrumRadialSharpness).toBe(0);
	});
});

describe('migrateWallpaperStore — payloads with no recorded version', () => {
	/**
	 * A missing version used to be read as "no version gate applies", so the
	 * version-gated conversions were skipped while the unconditional cleanup
	 * right after them still deleted the legacy keys. The user's saved data
	 * went straight in the bin. Unknown must mean OLDEST, not newest.
	 */
	const legacyPayload = () =>
		({
			motionProfileSlots: [
				{
					name: 'My Vibe',
					values: {
						particleCount: 321,
						rainEnabled: true,
						rainDropCount: 777
					}
				}
			],
			backgroundImages: [
				{
					assetId: 'img1',
					name: 'A',
					spectrumSecondOverride: { spectrumOpacity: 0.42 }
				}
			]
		}) as never;

	it('converts legacy Motion bundles when the version is missing', () => {
		const migrated = migrateWallpaperStore(legacyPayload(), undefined);

		const particles = migrated.particlesProfileSlots.find(
			slot => slot.name === 'My Vibe'
		);
		const rain = migrated.rainProfileSlots.find(
			slot => slot.name === 'My Vibe'
		);
		expect(particles?.values?.particleCount).toBe(321);
		expect(rain?.values?.rainDropCount).toBe(777);
		expect(
			(migrated as Record<string, unknown>).motionProfileSlots
		).toBeUndefined();
	});

	it('preserves per-image Spectrum 2 overrides when the version is missing', () => {
		const migrated = migrateWallpaperStore(legacyPayload(), undefined);

		const rescued = migrated.spectrumSecondProfileSlots.filter(
			slot => slot.values !== null && slot.name.includes('A')
		);
		expect(rescued.length).toBeGreaterThan(0);
		expect(rescued[0]?.values?.spectrumOpacity).toBe(0.42);
	});

	it('matches what an explicit version 0 produces', () => {
		const implicit = migrateWallpaperStore(legacyPayload(), undefined);
		const explicit = migrateWallpaperStore(legacyPayload(), 0);

		expect(implicit.particlesProfileSlots.map(s => s.name)).toEqual(
			explicit.particlesProfileSlots.map(s => s.name)
		);
		expect(implicit.rainProfileSlots.map(s => s.name)).toEqual(
			explicit.rainProfileSlots.map(s => s.name)
		);
	});
});

describe('migrateWallpaperStore — Spectrum 1 / Spectrum 2 independence', () => {
	it('shares no mutable reference when S2 is seeded from S1 (v97)', () => {
		const migrated = migrateWallpaperStore(
			{
				spectrumProfileSlots: [
					{
						name: 'Mine',
						values: {
							spectrumOpacity: 0.11,
							spectrumRainbowColors: ['#111111', '#222222']
						}
					}
				]
			} as never,
			96
		);

		const main = migrated.spectrumProfileSlots[0]!;
		const second = migrated.spectrumSecondProfileSlots[0]!;

		expect(main.id).not.toBe(second.id);
		expect(main.values).not.toBe(second.values);
		expect(second.values?.spectrumOpacity).toBe(0.11);

		// The hydrate whitelist is what guarantees independence, and its one
		// nested object must be rebuilt per bank rather than shared. Adding a
		// nested array to that whitelist without cloning would fail here.
		expect(main.values?.spectrumShockwaveBandThresholds).not.toBe(
			second.values?.spectrumShockwaveBandThresholds
		);
		for (const [key, value] of Object.entries(second.values ?? {})) {
			if (value === null || typeof value !== 'object') continue;
			expect(
				(main.values as unknown as Record<string, unknown>)[key],
				`S1 and S2 share the mutable "${key}"`
			).not.toBe(value);
		}

		// Mutating S1 must not reach S2.
		main.values!.spectrumOpacity = 0.99;
		expect(second.values?.spectrumOpacity).toBe(0.11);
	});

	it('leaves an existing S2 bank alone instead of reseeding from S1', () => {
		const migrated = migrateWallpaperStore(
			{
				spectrumProfileSlots: [{ name: 'Main only', values: null }],
				spectrumSecondProfileSlots: [
					{ id: 's2', name: 'Second only', values: null }
				]
			} as never,
			104
		);

		expect(migrated.spectrumSecondProfileSlots[0]?.name).toBe(
			'Second only'
		);
		expect(migrated.spectrumProfileSlots[0]?.name).toBe('Main only');
	});
});

describe('migrateWallpaperStore — spectrumRadialSharpness sanitising', () => {
	const sharpness = (value: unknown) =>
		migrateWallpaperStore({ spectrumRadialSharpness: value } as never, 105)
			.spectrumRadialSharpness;

	it('keeps values inside the slider range', () => {
		expect(sharpness(0)).toBe(0);
		expect(sharpness(0.5)).toBe(0.5);
		expect(sharpness(1)).toBe(1);
	});

	it('clamps values outside the range', () => {
		expect(sharpness(-5)).toBe(0);
		expect(sharpness(99)).toBe(1);
	});

	it('replaces non-finite and non-numeric values instead of persisting them', () => {
		// NaN survives JSON as `null` and a string reaches the slider verbatim;
		// both render a broken control.
		expect(sharpness(NaN)).toBe(0);
		expect(sharpness('x')).toBe(0);
		expect(sharpness(Infinity)).toBe(0);
	});

	it('seeds the default when the key is absent', () => {
		expect(
			migrateWallpaperStore({} as never, 105).spectrumRadialSharpness
		).toBe(0);
	});
});

describe('migrateWallpaperStore v111 factory logo', () => {
	it.each([LEGACY_APP_LOGO_URL, CANONICAL_FACTORY_LOGO_URL])(
		'migrates the previous factory mark %s to the cache-safe Vibrix URL',
		logoUrl => {
			const migrated = migrateWallpaperStore(
				{ logoId: null, logoUrl } as never,
				110
			);
			expect(migrated.logoUrl).toBe(APP_LOGO_URL);
		}
	);

	it('does not replace a user-uploaded logo', () => {
		const migrated = migrateWallpaperStore(
			{ logoId: 'user-logo', logoUrl: 'blob:user-logo' } as never,
			110
		);
		expect(migrated.logoUrl).toBe('blob:user-logo');
		expect(migrated.logoId).toBe('user-logo');
	});
});

describe('migrateWallpaperStore v112 logo variant', () => {
	it('backfills the automatic variant in live state and saved logo snapshots', () => {
		const migrated = migrateWallpaperStore(
			{
				logoProfileSlots: [
					{ id: 'logo-slot', name: 'Logo 1', values: {} }
				],
				backgroundImages: [
					{
						assetId: 'image-1',
						logoOverride: {}
					}
				]
			} as never,
			111
		);

		expect(migrated.logoVariantMode).toBe('auto');
		expect(migrated.logoProfileSlots[0]?.values?.logoVariantMode).toBe(
			'auto'
		);
		expect(
			migrated.backgroundImages[0]?.logoOverride?.logoVariantMode
		).toBe('auto');
	});

	it('preserves an explicitly selected variant', () => {
		const migrated = migrateWallpaperStore(
			{ logoVariantMode: 'pixel' } as never,
			111
		);
		expect(migrated.logoVariantMode).toBe('pixel');
	});
});

describe('migrateWallpaperStore v113 framing provenance', () => {
	it('derives the flag from a custom persisted framing', () => {
		const migrated = migrateWallpaperStore(
			{
				backgroundImages: [
					{ assetId: 'img-1', scale: 1.5, positionX: 0.2 }
				]
			} as never,
			112
		);
		expect(migrated.backgroundImages[0]?.coverageFramingEdited).toBe(true);
	});

	it('derives false for a default persisted framing', () => {
		const migrated = migrateWallpaperStore(
			{
				backgroundImages: [
					{
						assetId: 'img-1',
						scale: 1,
						positionX: 0,
						positionY: 0,
						focusX: null,
						focusY: null
					}
				]
			} as never,
			112
		);
		expect(migrated.backgroundImages[0]?.coverageFramingEdited).toBe(false);
	});

	it('respects an explicitly saved flag', () => {
		const migrated = migrateWallpaperStore(
			{
				backgroundImages: [
					{ assetId: 'img-1', scale: 1, coverageFramingEdited: true }
				]
			} as never,
			112
		);
		expect(migrated.backgroundImages[0]?.coverageFramingEdited).toBe(true);
	});
});

describe('migrateWallpaperStore v141 per-image framing switches', () => {
	it('copies the old globals into every stored image', () => {
		const migrated = migrateWallpaperStore(
			{
				imageFramingManualEnabled: true,
				logoFollowImageFocus: true,
				backgroundImages: [{ assetId: 'img-1' }, { assetId: 'img-2' }]
			} as never,
			140
		);
		for (const image of migrated.backgroundImages) {
			expect(image.framingManual).toBe(true);
			expect(image.logoFollowsFocus).toBe(true);
		}
	});

	it('leaves an already per-image value alone', () => {
		const migrated = migrateWallpaperStore(
			{
				imageFramingManualEnabled: true,
				logoFollowImageFocus: false,
				backgroundImages: [
					{
						assetId: 'img-1',
						framingManual: false,
						logoFollowsFocus: true
					}
				]
			} as never,
			140
		);
		expect(migrated.backgroundImages[0]?.framingManual).toBe(false);
		expect(migrated.backgroundImages[0]?.logoFollowsFocus).toBe(true);
	});
});
