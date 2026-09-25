import { LEGACY_TAB_KEYS } from '@/config/controlPanelResetKeys';
import {
	createProfileSlotId,
	MAX_SPECTRUM_SLOT_COUNT
} from '@/store/featureProfiles';
import { DEFAULT_STATE } from '@/store/defaultState';
import type {
	ProfileSlot,
	SpectrumProfileSettings,
	WallpaperState
} from '@/types/wallpaper';

export type ProjectExportSectionId =
	| 'backgrounds'
	| 'spectrum'
	| 'logo'
	| 'overlays'
	| 'motion'
	| 'looks'
	| 'track'
	| 'lyrics'
	| 'audio'
	| 'editor';

export type ProjectExportSelection = Record<ProjectExportSectionId, boolean>;

export const PROJECT_EXPORT_SECTION_ORDER: ProjectExportSectionId[] = [
	'backgrounds',
	'spectrum',
	'logo',
	'overlays',
	'motion',
	'looks',
	'track',
	'lyrics',
	'audio',
	'editor'
];

export const DEFAULT_PROJECT_EXPORT_SELECTION: ProjectExportSelection = {
	backgrounds: true,
	spectrum: true,
	logo: true,
	overlays: true,
	motion: true,
	looks: true,
	track: true,
	lyrics: true,
	audio: true,
	editor: true
};

const PROJECT_EXPORT_SECTION_KEYS: Record<
	ProjectExportSectionId,
	(keyof WallpaperState)[]
> = {
	backgrounds: Array.from(
		new Set<keyof WallpaperState>([
			...(LEGACY_TAB_KEYS.presets ?? []),
			'backgroundImages',
			'imageIds',
			'imageUrls',
			'activeImageId',
			'slideshowResetPosition',
			'slideshowManualTimestampsEnabled',
			'slideshowTransitionAnchor',
			'backgroundProfileSlots',
			'sceneSlots',
			'activeSceneSlotId',
			'defaultSceneSlotId',
			'setlists',
			'activeSetlistId'
		])
	),
	spectrum: Array.from(
		new Set<keyof WallpaperState>([
			...(LEGACY_TAB_KEYS.spectrum ?? []),
			'spectrumProfileSlots',
			'spectrumSecondProfileSlots'
		])
	),
	logo: Array.from(
		new Set<keyof WallpaperState>([
			...(LEGACY_TAB_KEYS.logo ?? []),
			'logoId',
			'logoUrl',
			'logoProfileSlots'
		])
	),
	overlays: ['overlays', 'selectedOverlayId'],
	motion: Array.from(
		new Set<keyof WallpaperState>([
			...(LEGACY_TAB_KEYS.particles ?? []),
			...(LEGACY_TAB_KEYS.rain ?? []),
			...(LEGACY_TAB_KEYS.stageFx ?? []),
			'particlesProfileSlots',
			'rainProfileSlots',
			'lightsProfileSlots',
			'cameraFxProfileSlots'
		])
	),
	looks: Array.from(
		new Set<keyof WallpaperState>([
			...(LEGACY_TAB_KEYS.filters ?? []),
			'looksProfileSlots'
		])
	),
	track: Array.from(
		new Set<keyof WallpaperState>([
			...(LEGACY_TAB_KEYS.track ?? []),
			'trackTitleProfileSlots'
		])
	),
	lyrics: Array.from(
		new Set<keyof WallpaperState>([
			...(LEGACY_TAB_KEYS.lyrics ?? []),
			'audioLyricsByTrackAssetId'
		])
	),
	audio: Array.from(
		new Set<keyof WallpaperState>([
			...(LEGACY_TAB_KEYS.audio ?? []),
			'audioReactive',
			'audioSensitivity',
			'audioSourceMode',
			'audioFileAssetId',
			'audioFileName',
			'audioFileVolume',
			'audioFileLoop',
			'audioTracks',
			'activeAudioTrackId',
			'queuedAudioTrackId',
			'audioCrossfadeEnabled',
			'audioCrossfadeSeconds',
			'audioAutoAdvance',
			'audioMixMode',
			'audioTransitionStyle',
			'mediaSessionEnabled'
		])
	),
	editor: Array.from(
		new Set<keyof WallpaperState>([
			...(LEGACY_TAB_KEYS.editor ?? []),
			...(LEGACY_TAB_KEYS.diagnostics ?? []),
			...(LEGACY_TAB_KEYS.perf ?? [])
		])
	)
};

function cloneValue<T>(value: T): T {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value)) as T;
}

function cloneSelection(
	selection: ProjectExportSelection
): ProjectExportSelection {
	return PROJECT_EXPORT_SECTION_ORDER.reduce<ProjectExportSelection>(
		(nextSelection, sectionId) => {
			nextSelection[sectionId] = Boolean(selection[sectionId]);
			return nextSelection;
		},
		{ ...DEFAULT_PROJECT_EXPORT_SELECTION }
	);
}

function resetKeySet(
	state: WallpaperState,
	keys: (keyof WallpaperState)[]
): WallpaperState {
	for (const key of keys) {
		(
			state as Record<
				keyof WallpaperState,
				WallpaperState[keyof WallpaperState]
			>
		)[key] = cloneValue(DEFAULT_STATE[key]);
	}
	return state;
}

function mergeSpectrumProfileSlots(
	currentSlots: ProfileSlot<SpectrumProfileSettings>[],
	importedValue: unknown
): ProfileSlot<SpectrumProfileSettings>[] {
	if (!Array.isArray(importedValue)) return currentSlots;

	// Additive merge — only reached for PARTIAL imports. (Full exports replace
	// state wholesale via the `isFullProjectExportSelection` branch, which keeps
	// slot indices exactly = restore-by-position.) Here we ADD the imported
	// slots without touching any populated current slot: fill empty positions
	// first (so a restore into the default empty slots lands at the top instead
	// of after them — the old "slots missing" bug), then append, skipping
	// content duplicates and capping at the max.
	const nextSlots = cloneValue(currentSlots);
	const existingSignatures = new Set(
		nextSlots
			.filter(slot => slot.values)
			.map(slot => JSON.stringify(slot.values))
	);

	for (const slot of importedValue) {
		if (
			!slot ||
			typeof slot !== 'object' ||
			!('values' in slot) ||
			!slot.values
		) {
			continue;
		}
		const signature = JSON.stringify(slot.values);
		if (existingSignatures.has(signature)) continue;

		const newSlot: ProfileSlot<SpectrumProfileSettings> = {
			id: createProfileSlotId(),
			name:
				typeof slot.name === 'string' && slot.name.trim()
					? slot.name
					: `Imported Spectrum ${nextSlots.length + 1}`,
			values: cloneValue(slot.values as SpectrumProfileSettings)
		};

		const emptyIndex = nextSlots.findIndex(s => !s.values);
		if (emptyIndex !== -1) {
			nextSlots[emptyIndex] = newSlot;
		} else if (nextSlots.length < MAX_SPECTRUM_SLOT_COUNT) {
			nextSlots.push(newSlot);
		} else {
			break;
		}
		existingSignatures.add(signature);
	}

	return nextSlots;
}

export function normalizeProjectExportSelection(
	value: unknown
): ProjectExportSelection {
	if (!value || typeof value !== 'object') {
		return cloneSelection(DEFAULT_PROJECT_EXPORT_SELECTION);
	}

	const record = value as Partial<Record<ProjectExportSectionId, unknown>>;
	return PROJECT_EXPORT_SECTION_ORDER.reduce<ProjectExportSelection>(
		(selection, sectionId) => {
			selection[sectionId] =
				typeof record[sectionId] === 'boolean'
					? record[sectionId]
					: DEFAULT_PROJECT_EXPORT_SELECTION[sectionId];
			return selection;
		},
		{ ...DEFAULT_PROJECT_EXPORT_SELECTION }
	);
}

export function isFullProjectExportSelection(
	selection: ProjectExportSelection
): boolean {
	return PROJECT_EXPORT_SECTION_ORDER.every(
		sectionId => selection[sectionId]
	);
}

export function shouldImportProjectAssetKind(
	selection: ProjectExportSelection,
	kind: 'background' | 'global-background' | 'logo' | 'overlay' | 'audio'
): boolean {
	switch (kind) {
		case 'background':
		case 'global-background':
			return selection.backgrounds;
		case 'logo':
			return selection.logo;
		case 'overlay':
			return selection.overlays;
		case 'audio':
			return selection.audio;
	}
}

export function mergeWallpaperStateForProjectImport(
	currentState: WallpaperState,
	importedState: WallpaperState,
	selection: ProjectExportSelection
): WallpaperState {
	// Shallow copy — `currentState` is sourced from the Zustand store at the
	// call site, which carries setter functions alongside data. `structuredClone`
	// rejects functions and crashes the whole import, so we copy references and
	// only clone the values that get overwritten below.
	const nextState = { ...currentState } as WallpaperState;

	for (const sectionId of PROJECT_EXPORT_SECTION_ORDER) {
		if (!selection[sectionId]) continue;
		for (const key of PROJECT_EXPORT_SECTION_KEYS[sectionId]) {
			// Old export files (made before recent fields like
			// `spectrumManualBindings`, `logoRotationSpeed`, etc were
			// added) lack these keys entirely, which makes `importedState[key]`
			// undefined. Overwriting `nextState[key]` with `undefined` would
			// then crash downstream renderers that assume the field exists.
			// Keep the existing baseline value when the import has nothing.
			const importedValue = importedState[key];
			if (importedValue === undefined) continue;
			if (sectionId === 'spectrum' && key === 'spectrumProfileSlots') {
				nextState.spectrumProfileSlots = mergeSpectrumProfileSlots(
					nextState.spectrumProfileSlots,
					importedValue
				);
				continue;
			}
			if (
				sectionId === 'spectrum' &&
				key === 'spectrumSecondProfileSlots'
			) {
				nextState.spectrumSecondProfileSlots =
					mergeSpectrumProfileSlots(
						nextState.spectrumSecondProfileSlots,
						importedValue
					);
				continue;
			}
			(
				nextState as Record<
					keyof WallpaperState,
					WallpaperState[keyof WallpaperState]
				>
			)[key] = cloneValue(importedValue);
		}
	}

	return nextState;
}

export function getEnabledProjectExportSectionCount(
	selection: ProjectExportSelection
): number {
	return PROJECT_EXPORT_SECTION_ORDER.reduce(
		(count, sectionId) => count + (selection[sectionId] ? 1 : 0),
		0
	);
}

export function filterWallpaperStateForProjectExport(
	sourceState: WallpaperState,
	selection: ProjectExportSelection
): WallpaperState {
	const nextState = cloneValue(sourceState);

	for (const sectionId of PROJECT_EXPORT_SECTION_ORDER) {
		if (selection[sectionId]) continue;
		resetKeySet(nextState, PROJECT_EXPORT_SECTION_KEYS[sectionId]);
	}

	if (!selection.logo) {
		nextState.backgroundImages = nextState.backgroundImages.map(image => ({
			...image,
			logoProfileSlotId: null,
			logoOverride: null
		}));
		nextState.sceneSlots = nextState.sceneSlots.map(scene => ({
			...scene,
			logoSlotId: null
		}));
	}

	if (!selection.spectrum) {
		nextState.backgroundImages = nextState.backgroundImages.map(image => ({
			...image,
			spectrumProfileSlotId: null,
			spectrumOverride: null
		}));
		nextState.sceneSlots = nextState.sceneSlots.map(scene => ({
			...scene,
			spectrumSlotId: null,
			spectrumSecondSlotId: null
		}));
	}

	if (!selection.motion) {
		nextState.backgroundImages = nextState.backgroundImages.map(image => ({
			...image,
			particlesProfileSlotId: null,
			particlesOverride: null,
			rainProfileSlotId: null,
			rainOverride: null
		}));
		nextState.sceneSlots = nextState.sceneSlots.map(scene => ({
			...scene,
			particlesSlotId: null,
			rainSlotId: null
		}));
	}

	if (!selection.looks) {
		nextState.backgroundImages = nextState.backgroundImages.map(image => ({
			...image,
			looksProfileSlotId: null,
			looksOverride: null
		}));
		nextState.sceneSlots = nextState.sceneSlots.map(scene => ({
			...scene,
			looksSlotId: null
		}));
	}

	if (!selection.track) {
		nextState.backgroundImages = nextState.backgroundImages.map(image => ({
			...image,
			trackTitleOverride: null
		}));
		nextState.sceneSlots = nextState.sceneSlots.map(scene => ({
			...scene,
			trackTitleSlotId: null
		}));
	}
	// Camera FX and Lights have no export section of their own, so — exactly
	// like `cameraFxSlotId` / `lightsSlotId` on a scene — the per-image
	// overrides always travel with the project.

	return nextState;
}
