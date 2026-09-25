import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => void mem.set(k, v),
	removeItem: (k: string) => void mem.delete(k),
	clear: () => void mem.clear()
};

const { useWallpaperStore } = await import('@/store/wallpaperStore');
const { DEFAULT_STATE } = await import('@/store/defaultState');
const { LOOKS_PROFILE_KEYS } = await import('@/store/featureProfiles');
const { migrateWallpaperStore } =
	await import('@/store/wallpaperStoreMigrations');
const { FILTER_LOOK_PRESETS, RGB_SHIFT_AUDIO_KEYS } =
	await import('@/features/filterLooks/filterLooks');

const store = () => useWallpaperStore.getState();

/** A routing nobody would land on by accident. */
const LOUD = {
	rgbShiftAudioReactive: true,
	rgbShiftAudioSensitivity: 0.021,
	rgbShiftAudioChannel: 'kick' as const,
	rgbShiftAudioSmoothing: 0.07,
	rgbShiftAudioAttack: 0.95,
	rgbShiftAudioRelease: 0.09,
	rgbShiftAudioReactivitySpeed: 1.45,
	rgbShiftAudioPeakWindow: 0.8,
	rgbShiftAudioPeakFloor: 0.04,
	rgbShiftAudioPunch: 0.85
};

describe('Looks slots capture the whole RGB shift', () => {
	beforeEach(() => {
		useWallpaperStore.setState({
			...DEFAULT_STATE,
			looksProfileSlots: []
		});
	});

	it('round-trips the audio routing through a saved slot', () => {
		useWallpaperStore.setState({ rgbShift: 0.017, ...LOUD });
		const index = store().saveCurrentLooksAsNewSlot();
		expect(index).toBe(0);

		// Wander far away, then come back via the slot.
		useWallpaperStore.setState({
			rgbShift: 0,
			rgbShiftAudioReactive: false,
			rgbShiftAudioChannel: 'vocal',
			rgbShiftAudioPunch: 0.1
		});
		store().loadLooksProfileSlot(0);

		const after = store();
		expect(after.rgbShift).toBeCloseTo(0.017);
		for (const key of RGB_SHIFT_AUDIO_KEYS) {
			expect(after[key]).toEqual(LOUD[key]);
		}
	});

	it('does not let one slot inherit the previous slot’s routing', () => {
		useWallpaperStore.setState({ ...LOUD });
		store().saveCurrentLooksAsNewSlot();
		useWallpaperStore.setState({
			rgbShiftAudioReactive: false,
			rgbShiftAudioChannel: 'bass',
			rgbShiftAudioPunch: 0.15
		});
		store().saveCurrentLooksAsNewSlot();

		store().loadLooksProfileSlot(0);
		expect(store().rgbShiftAudioChannel).toBe('kick');
		store().loadLooksProfileSlot(1);
		expect(store().rgbShiftAudioChannel).toBe('bass');
		expect(store().rgbShiftAudioReactive).toBe(false);
	});

	it('gives every built-in look its own audio character', () => {
		for (const preset of FILTER_LOOK_PRESETS) {
			for (const key of RGB_SHIFT_AUDIO_KEYS) {
				expect(
					preset.settings[key],
					`${preset.id} is missing ${key}`
				).toBeDefined();
			}
		}
		// Not all the same value, or the keys would be decoration.
		const channels = new Set(
			FILTER_LOOK_PRESETS.map(p => p.settings.rgbShiftAudioChannel)
		);
		expect(channels.size).toBeGreaterThan(1);
	});

	it('applies the routing when a built-in look is applied', () => {
		useWallpaperStore.setState({ ...LOUD });
		const glass = FILTER_LOOK_PRESETS.find(p => p.id === 'glass-mist');
		expect(glass).toBeDefined();
		store().applyFilterLook(glass!);

		expect(store().rgbShiftAudioReactive).toBe(
			glass!.settings.rgbShiftAudioReactive
		);
		expect(store().rgbShiftAudioPunch).toBe(
			glass!.settings.rgbShiftAudioPunch
		);
	});

	it('resets every Looks key, not the handful someone remembered', () => {
		useWallpaperStore.setState({
			...LOUD,
			scanlinesEnabled: !DEFAULT_STATE.scanlinesEnabled,
			filterBloom: 0.77
		});
		store().resetFiltersToDefaults();

		const after = store() as unknown as Record<string, unknown>;
		for (const key of LOOKS_PROFILE_KEYS) {
			expect(after[key], `${key} survived the reset`).toEqual(
				(DEFAULT_STATE as unknown as Record<string, unknown>)[key]
			);
		}
	});
});

describe('migration to v109 + v110', () => {
	it('backfills stored slots from the globals that were in effect', () => {
		const persisted = {
			...DEFAULT_STATE,
			...LOUD,
			looksProfileSlots: [
				{
					id: 'slot-a',
					name: 'Pre-v109',
					// Exactly what a v108 slot held: no audio routing.
					values: { rgbShift: 0.005, filterBloom: 0.3 }
				}
			],
			customFilterLookSettings: { rgbShift: 0.002 }
		};

		const migrated = migrateWallpaperStore(persisted, 108) as unknown as {
			looksProfileSlots: Array<{
				name: string;
				values: Record<string, unknown>;
			}>;
			customFilterLookSettings: Record<string, unknown> | null;
		};

		const values = migrated.looksProfileSlots[0]!.values;
		for (const key of RGB_SHIFT_AUDIO_KEYS) {
			expect(values[key], `slot missing ${key}`).toEqual(LOUD[key]);
		}
		// The slot's own values are untouched.
		expect(values.rgbShift).toBe(0.005);

		// v110 folds the legacy single Custom look into the same slot bank —
		// with the routing v109 had just backfilled onto it, not without.
		expect(migrated.customFilterLookSettings).toBeNull();
		const folded = migrated.looksProfileSlots.find(
			slot => slot.name === 'Custom Look'
		);
		expect(
			folded,
			'the legacy custom look was not folded in'
		).toBeDefined();
		expect(folded!.values.rgbShift).toBe(0.002);
		expect(folded!.values.rgbShiftAudioChannel).toBe('kick');
	});

	it('v110 reuses an empty slot and never drops the look when the bank is full', async () => {
		const { MAX_LOOKS_SLOT_COUNT } =
			await import('@/store/featureProfiles');
		const full = Array.from({ length: MAX_LOOKS_SLOT_COUNT }, (_, i) => ({
			id: `slot-${i}`,
			name: `Look ${i}`,
			values: { rgbShift: 0.001 }
		}));

		const withGap = migrateWallpaperStore(
			{
				...DEFAULT_STATE,
				looksProfileSlots: full.map((slot, i) =>
					i === 7 ? { ...slot, values: null } : slot
				),
				customFilterLookSettings: { rgbShift: 0.004 }
			},
			109
		) as unknown as {
			looksProfileSlots: Array<{
				name: string;
				values: Record<string, unknown> | null;
			}>;
			customFilterLookSettings: unknown;
		};
		expect(withGap.looksProfileSlots).toHaveLength(MAX_LOOKS_SLOT_COUNT);
		expect(withGap.looksProfileSlots[7]!.name).toBe('Custom Look');
		expect(withGap.looksProfileSlots[7]!.values!.rgbShift).toBe(0.004);
		expect(withGap.customFilterLookSettings).toBeNull();

		const noRoom = migrateWallpaperStore(
			{
				...DEFAULT_STATE,
				looksProfileSlots: full,
				customFilterLookSettings: { rgbShift: 0.004 }
			},
			109
		) as unknown as {
			customFilterLookSettings: Record<string, unknown> | null;
		};
		// Kept in the legacy field rather than discarded.
		expect(noRoom.customFilterLookSettings?.rgbShift).toBe(0.004);
	});
});

describe('Looks slots carry the whole effect-layer stack', () => {
	beforeEach(() => {
		useWallpaperStore.setState({
			...DEFAULT_STATE,
			effectLayers: DEFAULT_STATE.effectLayers.map(layer => ({
				...layer,
				targets: [...layer.targets],
				settings: { ...layer.settings }
			})),
			filterTargets: [...DEFAULT_STATE.filterTargets],
			looksProfileSlots: []
		});
	});

	it('brings every layer back, not just the one being edited', () => {
		// Layer 1 treats the background; layer 2 treats the spectrum. This is
		// the composition a slot used to lose.
		useWallpaperStore.setState({ filterBrightness: 1.6 });
		store().addEffectLayer();
		store().setFilterTargets(['spectrum']);
		useWallpaperStore.setState({ filterBrightness: 0.4 });
		const index = store().saveCurrentLooksAsNewSlot();
		expect(index).toBe(0);
		const savedLayerCount = store().effectLayers.length;
		expect(savedLayerCount).toBe(2);

		// Tear the composition down to a single layer, then restore it.
		store().removeEffectLayer(store().effectLayers[1]!.id);
		useWallpaperStore.setState({ filterBrightness: 1 });
		expect(store().effectLayers).toHaveLength(1);

		store().loadLooksProfileSlot(0);
		const after = store();
		expect(after.effectLayers).toHaveLength(2);
		expect(after.effectLayers[0]!.settings.filterBrightness).toBeCloseTo(
			1.6
		);
		expect(after.effectLayers[1]!.targets).toEqual(['spectrum']);
	});

	it('saves the active layer as it is now, not as its stale snapshot', () => {
		// The active layer's array entry is only refreshed when the user
		// switches away; saving must fold the live values in first.
		useWallpaperStore.setState({ filterBrightness: 1.9 });
		store().saveCurrentLooksAsNewSlot();
		const saved = store().looksProfileSlots[0]!.values!;
		const activeId = store().activeEffectLayerId;
		const savedActive = saved.effectLayers.find(
			layer => layer.id === activeId
		);
		expect(savedActive?.settings.filterBrightness).toBeCloseTo(1.9);
	});

	it('turns a slot saved before layers existed into a single layer', () => {
		// A pre-v120 slot: flat keys only, no stack.
		useWallpaperStore.setState({
			looksProfileSlots: [
				{
					id: 'legacy-slot',
					name: 'Legacy',
					values: {
						filterTargets: ['logo'],
						filterBrightness: 1.75
					} as unknown as NonNullable<
						ReturnType<typeof store>['looksProfileSlots'][number]
					>['values']
				}
			]
		});
		// Two layers live, so a wrong hydration would leave the second one
		// holding the legacy values.
		store().addEffectLayer();
		store().loadLooksProfileSlot(0);

		const after = store();
		expect(after.effectLayers).toHaveLength(1);
		expect(after.effectLayers[0]!.targets).toEqual(['logo']);
		expect(after.filterBrightness).toBeCloseTo(1.75);
	});

	it('keeps every LOOKS_PROFILE_KEYS entry addressable', () => {
		expect(LOOKS_PROFILE_KEYS).toContain('effectLayers');
		expect(LOOKS_PROFILE_KEYS).toContain('activeEffectLayerId');
	});
});
