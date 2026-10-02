import type { SceneSlot } from '@/types/wallpaper';

/**
 * The declared source state behind the shared contract fixture.
 *
 * It lives in its own module, and not inside the test, for one reason: the
 * fixture in `docs/features/VIBRIX_AUTHORING_CONTRACT.md` carries derived
 * hashes, and a hash is only a legitimate contract constant if the input that
 * produces it is published too. Anyone can regenerate the documented manifest
 * from this.
 *
 * Deliberately minimal — a real default state has dozens of empty slots, which
 * would make the fixture unreadable without testing anything extra.
 */
function scene(
	id: string,
	name: string,
	refs: Partial<Omit<SceneSlot, 'id' | 'name'>>
): SceneSlot {
	return {
		id,
		name,
		spectrumSlotId: null,
		spectrumSecondSlotId: null,
		looksSlotId: null,
		particlesSlotId: null,
		rainSlotId: null,
		lightsSlotId: null,
		cameraFxSlotId: null,
		logoSlotId: null,
		trackTitleSlotId: null,
		...refs
	};
}

export const CONTRACT_FIXTURE_STATE = {
	sceneSlots: [
		scene('scene-a', 'Verse', {
			spectrumSlotId: 'spec-1',
			looksSlotId: 'look-1',
			particlesSlotId: 'off'
		}),
		scene('scene-b', 'Chorus', {
			spectrumSlotId: 'spec-2',
			looksSlotId: 'look-1'
		}),
		scene('scene-c', 'Bridge', {})
	],
	spectrumProfileSlots: [
		{ id: 'spec-1', name: 'Bars tight', values: { spectrumBars: 64 } },
		{ id: 'spec-2', name: 'Bars wide', values: { spectrumBars: 24 } }
	],
	spectrumSecondProfileSlots: [],
	looksProfileSlots: [
		{ id: 'look-1', name: 'Warm grade', values: { filterSepia: 0.3 } }
	],
	particlesProfileSlots: [],
	rainProfileSlots: [],
	lightsProfileSlots: [],
	cameraFxProfileSlots: [],
	logoProfileSlots: [],
	trackTitleProfileSlots: [],
	backgroundProfileSlots: [
		{ id: 'bgz-1', name: 'Punchy', values: { bgZoomAudioPunch: 0.8 } }
	],
	introProfileSlots: [
		{ id: 'intro-1', name: 'Title fade', values: { introDurationSec: 3 } }
	]
};
