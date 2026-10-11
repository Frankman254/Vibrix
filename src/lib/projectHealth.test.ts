import { describe, expect, it } from 'vitest';
import type { BackgroundImageItem } from '@/types/wallpaper';
import {
	createProjectHealthReport,
	type ProjectHealthState
} from './projectHealth';

/**
 * `lib/` is a leaf zone, so these fixtures cannot import the store defaults or
 * the background factory. Only the fields `createProjectHealthReport` actually
 * reads are spelled out; the cast keeps the rest of the state out of the test.
 */
const EMPTY_STATE = {
	activeAudioTrackId: null,
	activeImageId: null,
	activeSceneSlotId: null,
	activeSetlistId: null,
	defaultSceneSlotId: null,
	audioFileAssetId: 'audio-1',
	audioSourceMode: 'file',
	audioTracks: [],
	backgroundImageEnabled: true,
	backgroundImages: [],
	globalBackgroundEnabled: false,
	globalBackgroundId: null,
	globalBackgroundUrl: null,
	imageIds: [],
	logoEnabled: false,
	logoId: null,
	logoUrl: null,
	overlays: [],
	sceneSlots: [],
	selectedOverlayId: null,
	setlists: [],
	spectrumProfileSlots: [],
	spectrumSecondProfileSlots: [],
	looksProfileSlots: [],
	particlesProfileSlots: [],
	rainProfileSlots: [],
	lightsProfileSlots: [],
	cameraFxProfileSlots: [],
	logoProfileSlots: [],
	trackTitleProfileSlots: []
} as unknown as ProjectHealthState;

const IMAGE = {
	assetId: 'asset-1',
	url: 'blob:one',
	originalFileName: 'one.png',
	sceneSlotId: null
} as unknown as BackgroundImageItem;

/**
 * A scene binds subsystems by slot id; an image carries inline snapshots and
 * its own `sceneSlotId`. There is no per-image slot reference to dangle, so
 * the empty-slot checks live entirely on the scene side.
 */
function scene(overrides: Record<string, unknown>) {
	return {
		id: 'scene-1',
		name: 'Scene 1',
		spectrumSlotId: null,
		spectrumSecondSlotId: null,
		looksSlotId: null,
		particlesSlotId: null,
		rainSlotId: null,
		lightsSlotId: null,
		cameraFxSlotId: null,
		logoSlotId: null,
		trackTitleSlotId: null,
		...overrides
	} as never;
}

function codesFor(overrides: Partial<ProjectHealthState>): string[] {
	return createProjectHealthReport({
		...EMPTY_STATE,
		...overrides
	}).issues.map(issue => issue.code);
}

/** A slot whose `values` are filled; the report only checks truthiness. */
function filledSlot(id: string) {
	return { id, name: id, values: {} } as never;
}

function emptySlot(id: string) {
	return { id, name: id, values: null } as never;
}

describe('createProjectHealthReport — scene slot bindings', () => {
	it('reports nothing for a pool image with no scene', () => {
		const report = createProjectHealthReport({
			...EMPTY_STATE,
			backgroundImages: [IMAGE],
			imageIds: ['asset-1']
		});
		expect(report.status).toBe('healthy');
		expect(report.issues).toEqual([]);
	});

	it('flags an image pointing at a scene that no longer exists', () => {
		expect(
			codesFor({
				backgroundImages: [
					{ ...IMAGE, sceneSlotId: 'gone' } as BackgroundImageItem
				],
				imageIds: ['asset-1']
			})
		).toContain('image-scene-missing');
	});

	it('flags an empty particles slot', () => {
		expect(
			codesFor({
				sceneSlots: [scene({ particlesSlotId: 'slot-p' })],
				particlesProfileSlots: [emptySlot('slot-p')]
			})
		).toContain('scene-particles-slot-missing');
	});

	it('flags an empty rain slot', () => {
		expect(
			codesFor({
				sceneSlots: [scene({ rainSlotId: 'slot-r' })],
				rainProfileSlots: [emptySlot('slot-r')]
			})
		).toContain('scene-rain-slot-missing');
	});

	it('flags an empty looks slot', () => {
		expect(
			codesFor({
				sceneSlots: [scene({ looksSlotId: 'slot-l' })],
				looksProfileSlots: [emptySlot('slot-l')]
			})
		).toContain('scene-looks-slot-missing');
	});

	it('flags a reference to a slot that no longer exists at all', () => {
		expect(
			codesFor({ sceneSlots: [scene({ rainSlotId: 'gone' })] })
		).toContain('scene-rain-slot-missing');
	});

	it('stays quiet when the referenced slot has values', () => {
		expect(
			codesFor({
				sceneSlots: [scene({ rainSlotId: 'slot-r' })],
				rainProfileSlots: [filledSlot('slot-r')]
			})
		).not.toContain('scene-rain-slot-missing');
	});

	it("stays quiet for a scene that binds nothing — 'off' is not a slot", () => {
		expect(
			codesFor({ sceneSlots: [scene({ rainSlotId: 'off' })] })
		).not.toContain('scene-rain-slot-missing');
	});
});
