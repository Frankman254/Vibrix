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
	sceneSlotId: null,
	logoProfileSlotId: null,
	spectrumProfileSlotId: null,
	particlesProfileSlotId: null,
	rainProfileSlotId: null,
	looksProfileSlotId: null
} as unknown as BackgroundImageItem;

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

describe('createProjectHealthReport — per-image profile slots', () => {
	it('reports nothing for a pool image with no slot references', () => {
		const report = createProjectHealthReport({
			...EMPTY_STATE,
			backgroundImages: [IMAGE],
			imageIds: ['asset-1']
		});
		expect(report.status).toBe('healthy');
		expect(report.issues).toEqual([]);
	});

	it('flags an empty particles slot', () => {
		expect(
			codesFor({
				backgroundImages: [
					{ ...IMAGE, particlesProfileSlotId: 'slot-p' }
				],
				imageIds: ['asset-1'],
				particlesProfileSlots: [emptySlot('slot-p')]
			})
		).toContain('image-particles-slot-missing');
	});

	it('flags an empty rain slot', () => {
		expect(
			codesFor({
				backgroundImages: [{ ...IMAGE, rainProfileSlotId: 'slot-r' }],
				imageIds: ['asset-1'],
				rainProfileSlots: [emptySlot('slot-r')]
			})
		).toContain('image-rain-slot-missing');
	});

	it('flags an empty looks slot', () => {
		expect(
			codesFor({
				backgroundImages: [{ ...IMAGE, looksProfileSlotId: 'slot-l' }],
				imageIds: ['asset-1'],
				looksProfileSlots: [emptySlot('slot-l')]
			})
		).toContain('image-looks-slot-missing');
	});

	it('flags a reference to a slot that no longer exists at all', () => {
		expect(
			codesFor({
				backgroundImages: [{ ...IMAGE, rainProfileSlotId: 'gone' }],
				imageIds: ['asset-1']
			})
		).toContain('image-rain-slot-missing');
	});

	it('stays quiet when the referenced slot has values', () => {
		expect(
			codesFor({
				backgroundImages: [{ ...IMAGE, rainProfileSlotId: 'slot-r' }],
				imageIds: ['asset-1'],
				rainProfileSlots: [filledSlot('slot-r')]
			})
		).not.toContain('image-rain-slot-missing');
	});
});
