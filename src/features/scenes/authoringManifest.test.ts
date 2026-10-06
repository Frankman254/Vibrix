import { describe, expect, it } from 'vitest';
import type { WallpaperState } from '@/types/wallpaper';
import { APP_VERSION, STORE_PERSIST_VERSION } from '@/lib/version';
import {
	VIBRIX_SLOT_FAMILIES,
	buildAuthoringManifest,
	buildAuthoringManifestReport
} from './authoringManifest';
import { CONTRACT_FIXTURE_STATE } from './authoringManifestFixture';

const OPTIONS = {
	exportedAt: '2026-10-02T00:00:00.000Z',
	projectName: 'Demo'
};

function build(state: unknown = CONTRACT_FIXTURE_STATE) {
	return buildAuthoringManifest(state as WallpaperState, OPTIONS);
}

/**
 * The shared fixture from `docs/features/VIBRIX_AUTHORING_CONTRACT.md`, which
 * Lyrixa validates its parser against. If this comparison fails, the two repos
 * have drifted and the doc is the thing to settle it — that is the whole point
 * of keeping it literal on both sides.
 *
 * The `revision` values are derived from `CONTRACT_FIXTURE_STATE`, so they are
 * reproducible rather than decorative.
 */
const CONTRACT_FIXTURE = {
	schemaVersion: 2,
	app: 'Vibrix',
	exportKind: 'vibrix-manifest',
	exportedAt: '2026-10-02T00:00:00.000Z',
	rendererVersion: '0.7.0-alpha',
	storePersistVersion: 150,
	projectName: 'Demo',
	revision: '169bbe48d6a777',
	slots: [
		{
			id: 'scene-a',
			family: 'scene',
			name: 'Verse',
			revision: '06f5cbdcbb8aad',
			sceneBindable: false,
			cueable: true,
			bindings: {
				spectrum: 'spec-1',
				looks: 'look-1',
				particles: 'off'
			}
		},
		{
			id: 'scene-b',
			family: 'scene',
			name: 'Chorus',
			revision: '1badfdd9cedaf2',
			sceneBindable: false,
			cueable: true,
			bindings: { spectrum: 'spec-2', looks: 'look-1' }
		},
		{
			id: 'scene-c',
			family: 'scene',
			name: 'Bridge',
			revision: 'empty',
			sceneBindable: false,
			cueable: true
		},
		{
			id: 'spec-1',
			family: 'spectrum',
			name: 'Bars tight',
			revision: '0f79ebd4d5f3e6',
			sceneBindable: true,
			cueable: true
		},
		{
			id: 'spec-2',
			family: 'spectrum',
			name: 'Bars wide',
			revision: '037549f677038c',
			sceneBindable: true,
			cueable: true
		},
		{
			id: 'look-1',
			family: 'looks',
			name: 'Warm grade',
			revision: '09cffd31a5fce4',
			sceneBindable: true,
			cueable: true
		},
		{
			id: 'bgz-1',
			family: 'background-zoom',
			name: 'Punchy',
			revision: '16fbe6c624044d',
			sceneBindable: false,
			cueable: true
		},
		{
			id: 'intro-1',
			family: 'intro-window',
			name: 'Title fade',
			revision: '05ea8b323e0e09',
			sceneBindable: false,
			cueable: false
		}
	],
	images: []
};

describe('buildAuthoringManifest', () => {
	it('reproduces the shared contract fixture exactly', () => {
		expect(build()).toEqual(CONTRACT_FIXTURE);
	});

	it('serializes to the same JSON, keys and order included', () => {
		// `toEqual` ignores key order; the file Lyrixa reads does not, and the
		// doc shows a specific order. Compare the bytes too.
		expect(JSON.stringify(build(), null, '\t')).toBe(
			JSON.stringify(CONTRACT_FIXTURE, null, '\t')
		);
	});

	it('stamps the build it came from', () => {
		const manifest = build();
		expect(manifest.rendererVersion).toBe(APP_VERSION);
		expect(manifest.storePersistVersion).toBe(STORE_PERSIST_VERSION);
	});

	it('never publishes calibration, and has no motion family at all', () => {
		expect(VIBRIX_SLOT_FAMILIES).not.toContain('calibration');
		expect(VIBRIX_SLOT_FAMILIES).not.toContain('motion');
		expect(VIBRIX_SLOT_FAMILIES).not.toContain('background');
		const families = new Set(build().slots.map(slot => slot.family));
		for (const family of families) {
			expect(VIBRIX_SLOT_FAMILIES).toContain(family);
		}
	});

	it('ignores calibrationProfileSlots even when the state carries them', () => {
		const withCalibration = {
			...CONTRACT_FIXTURE_STATE,
			calibrationProfileSlots: [
				{ id: 'cal-1', name: 'My screen', values: { gamma: 2.2 } }
			]
		};
		expect(
			build(withCalibration).slots.some(slot => slot.id === 'cal-1')
		).toBe(false);
	});

	it('omits a null binding and keeps an explicit off', () => {
		const sceneA = build().slots.find(slot => slot.id === 'scene-a');
		const sceneB = build().slots.find(slot => slot.id === 'scene-b');
		expect(sceneA?.bindings?.particles).toBe('off');
		// scene-a leaves rain/lights/logo at `null`: "do not touch".
		expect(Object.hasOwn(sceneA?.bindings ?? {}, 'rain')).toBe(false);
		expect(Object.hasOwn(sceneB?.bindings ?? {}, 'particles')).toBe(false);
	});

	it('lists an empty slot instead of hiding it', () => {
		const state = {
			...CONTRACT_FIXTURE_STATE,
			logoProfileSlots: [{ id: 'logo-1', name: 'Logo 1', values: null }]
		};
		const slot = build(state).slots.find(entry => entry.id === 'logo-1');
		expect(slot?.revision).toBe('empty');
	});

	it('marks background-zoom unbindable and intro-window uncueable', () => {
		const slots = build().slots;
		expect(slots.find(slot => slot.id === 'bgz-1')?.sceneBindable).toBe(
			false
		);
		expect(slots.find(slot => slot.id === 'intro-1')?.cueable).toBe(false);
		expect(slots.find(slot => slot.id === 'spec-1')?.sceneBindable).toBe(
			true
		);
	});

	it('treats every scene as cueable but never scene-bindable', () => {
		for (const scene of build().slots.filter(
			slot => slot.family === 'scene'
		)) {
			expect(scene.cueable).toBe(true);
			expect(scene.sceneBindable).toBe(false);
		}
	});
});

describe('revisions as a change detector', () => {
	it('does not move when a slot is renamed', () => {
		const renamed = {
			...CONTRACT_FIXTURE_STATE,
			spectrumProfileSlots: [
				{
					...CONTRACT_FIXTURE_STATE.spectrumProfileSlots[0],
					name: 'Something else entirely'
				},
				CONTRACT_FIXTURE_STATE.spectrumProfileSlots[1]
			]
		};
		expect(build(renamed).revision).toBe(build().revision);
		expect(
			build(renamed).slots.find(slot => slot.id === 'spec-1')?.revision
		).toBe(build().slots.find(slot => slot.id === 'spec-1')?.revision);
	});

	it('moves when a slot value changes', () => {
		const edited = {
			...CONTRACT_FIXTURE_STATE,
			spectrumProfileSlots: [
				{
					id: 'spec-1',
					name: 'Bars tight',
					values: { spectrumBars: 65 }
				},
				CONTRACT_FIXTURE_STATE.spectrumProfileSlots[1]
			]
		};
		expect(
			build(edited).slots.find(slot => slot.id === 'spec-1')?.revision
		).not.toBe(build().slots.find(slot => slot.id === 'spec-1')?.revision);
		expect(build(edited).revision).not.toBe(build().revision);
	});

	it('moves a scene when a slot it binds is edited, not only when rebound', () => {
		// The hole this closes: scene-a's own references are untouched here, so
		// a revision over references alone would still read `Current` while the
		// frame it produces has changed.
		const edited = {
			...CONTRACT_FIXTURE_STATE,
			spectrumProfileSlots: [
				{
					id: 'spec-1',
					name: 'Bars tight',
					values: { spectrumBars: 65 }
				},
				CONTRACT_FIXTURE_STATE.spectrumProfileSlots[1]
			]
		};
		const before = build().slots.find(slot => slot.id === 'scene-a');
		const after = build(edited).slots.find(slot => slot.id === 'scene-a');
		expect(after?.bindings).toEqual(before?.bindings);
		expect(after?.revision).not.toBe(before?.revision);
	});

	it('does not move a scene that does not bind the edited slot', () => {
		const edited = {
			...CONTRACT_FIXTURE_STATE,
			spectrumProfileSlots: [
				CONTRACT_FIXTURE_STATE.spectrumProfileSlots[0],
				{
					id: 'spec-2',
					name: 'Bars wide',
					values: { spectrumBars: 25 }
				}
			]
		};
		// scene-a binds spec-1, not spec-2.
		expect(
			build(edited).slots.find(slot => slot.id === 'scene-a')?.revision
		).toBe(build().slots.find(slot => slot.id === 'scene-a')?.revision);
	});
});

describe('image authoring objects', () => {
	const image = {
		assetId: 'image-a',
		url: 'blob:original',
		thumbnailUrl: 'blob:thumbnail',
		originalFileName: 'cover.png',
		enabled: true,
		scale: 1,
		positionX: 0,
		positionY: 0,
		opacity: 1,
		transitionType: 'fade',
		transitionDuration: 1.2,
		transitionIntensity: 1,
		transitionAudioDrive: 0,
		transitionAudioChannel: 'master',
		transitionLayerTargets: ['background'],
		playbackSwitchAt: 42,
		sceneSlotId: 'scene-a'
	};

	function withImage(patch: Record<string, unknown> = {}) {
		return build({
			...CONTRACT_FIXTURE_STATE,
			backgroundImages: [{ ...image, ...patch }]
		});
	}

	it('publishes images separately from slot families', () => {
		const manifest = withImage();
		expect(manifest.images).toEqual([
			expect.objectContaining({
				id: 'image-a',
				kind: 'image',
				name: 'cover.png',
				enabled: true,
				sceneSlotId: 'scene-a'
			})
		]);
		expect(manifest.slots.some(slot => slot.id === 'image-a')).toBe(false);
	});

	it('keeps the revision stable across rename, URLs and legacy timestamps', () => {
		const before = withImage().images[0].revision;
		const after = withImage({
			originalFileName: 'renamed.jpg',
			url: 'blob:another-original',
			thumbnailUrl: 'blob:another-thumbnail',
			playbackSwitchAt: 180
		}).images[0].revision;
		expect(after).toBe(before);
	});

	it('moves the image and catalogue revisions when its visual setup changes', () => {
		const before = withImage();
		const after = withImage({ transitionType: 'wipe-left' });
		expect(after.images[0].revision).not.toBe(before.images[0].revision);
		expect(after.revision).not.toBe(before.revision);
	});

	it('only publishes transportable thumbnail data and drops a dangling scene', () => {
		expect(withImage().images[0]).not.toHaveProperty('thumbnailDataUrl');
		const dataUrl = 'data:image/webp;base64,AAAA';
		const published = withImage({
			thumbnailUrl: dataUrl,
			sceneSlotId: 'scene-deleted'
		}).images[0];
		expect(published.thumbnailDataUrl).toBe(dataUrl);
		expect(published.sceneSlotId).toBeNull();
	});
});

describe('bindings that no longer resolve', () => {
	const stale = {
		...CONTRACT_FIXTURE_STATE,
		sceneSlots: [
			{
				...CONTRACT_FIXTURE_STATE.sceneSlots[0],
				logoSlotId: 'logo-deleted'
			},
			...CONTRACT_FIXTURE_STATE.sceneSlots.slice(1)
		]
	};

	it('drops the binding instead of naming a slot the file does not contain', () => {
		// Lyrixa's parser rejects the whole manifest when a scene names a slot
		// it cannot find, so emitting the stale id would turn one dangling
		// reference into "the file will not load".
		const sceneA = build(stale).slots.find(slot => slot.id === 'scene-a');
		expect(Object.hasOwn(sceneA?.bindings ?? {}, 'logo')).toBe(false);
	});

	it('every scene binding resolves to a published slot of that family', () => {
		const manifest = build(stale);
		const byId = new Map(manifest.slots.map(slot => [slot.id, slot]));
		for (const scene of manifest.slots.filter(
			slot => slot.family === 'scene'
		)) {
			for (const [family, target] of Object.entries(
				scene.bindings ?? {}
			)) {
				if (target === 'off') continue;
				const published = byId.get(target);
				expect(published).toBeDefined();
				expect(published?.family).toBe(family);
				expect(published?.sceneBindable).toBe(true);
			}
		}
	});

	it('reports what it dropped rather than losing it quietly', () => {
		const report = buildAuthoringManifestReport(
			stale as unknown as WallpaperState,
			OPTIONS
		);
		expect(report.droppedBindings).toEqual([
			{
				sceneId: 'scene-a',
				sceneName: 'Verse',
				family: 'logo',
				missingSlotId: 'logo-deleted'
			}
		]);
	});

	it('does not report an intentional null or off as a dropped binding', () => {
		expect(
			buildAuthoringManifestReport(
				CONTRACT_FIXTURE_STATE as unknown as WallpaperState,
				OPTIONS
			).droppedBindings
		).toEqual([]);
	});
});

describe('purity', () => {
	it('returns the same value for the same input', () => {
		expect(build()).toEqual(build());
	});

	it('does not mutate the state it was given', () => {
		const snapshot = JSON.stringify(CONTRACT_FIXTURE_STATE);
		build();
		expect(JSON.stringify(CONTRACT_FIXTURE_STATE)).toBe(snapshot);
	});

	it('survives an empty project without inventing slots', () => {
		const empty = {
			sceneSlots: [],
			spectrumProfileSlots: [],
			spectrumSecondProfileSlots: [],
			looksProfileSlots: [],
			particlesProfileSlots: [],
			rainProfileSlots: [],
			lightsProfileSlots: [],
			cameraFxProfileSlots: [],
			logoProfileSlots: [],
			trackTitleProfileSlots: [],
			backgroundProfileSlots: [],
			introProfileSlots: []
		};
		const manifest = build(empty);
		expect(manifest.slots).toEqual([]);
		expect(manifest.revision).toMatch(/^[0-9a-f]{14}$/);
	});
});
