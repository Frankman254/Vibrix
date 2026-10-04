import type { ProfileSlot } from '@/types/wallpaper';
import {
	buildAuthoringManifest,
	buildImageAuthoringValues,
	type AuthoringManifestOptions,
	type AuthoringManifestSource,
	type VibrixManifestSlot,
	type VibrixSlotFamily
} from './authoringManifest';

export interface VibrixAuthoringSlotSnapshot {
	kind: 'slot';
	id: string;
	family: VibrixSlotFamily;
	name: string;
	revision: string;
	values: unknown;
}

export interface VibrixAuthoringImageSnapshot {
	kind: 'image';
	id: string;
	name: string;
	revision: string;
	values: ReturnType<typeof buildImageAuthoringValues>;
}

export interface VibrixAuthoringPackage {
	format: 'vibrix-authoring';
	packageVersion: 1;
	exportedAt: string;
	manifest: ReturnType<typeof buildAuthoringManifest>;
	snapshots: Array<
		VibrixAuthoringSlotSnapshot | VibrixAuthoringImageSnapshot
	>;
}

type GranularFamily = Exclude<VibrixSlotFamily, 'scene'>;

function slotsFor(
	state: AuthoringManifestSource,
	family: GranularFamily
): ReadonlyArray<ProfileSlot<unknown>> {
	switch (family) {
		case 'spectrum':
			return state.spectrumProfileSlots;
		case 'spectrum-second':
			return state.spectrumSecondProfileSlots;
		case 'looks':
			return state.looksProfileSlots;
		case 'particles':
			return state.particlesProfileSlots;
		case 'rain':
			return state.rainProfileSlots;
		case 'lights':
			return state.lightsProfileSlots;
		case 'camera-fx':
			return state.cameraFxProfileSlots;
		case 'logo':
			return state.logoProfileSlots;
		case 'track-title':
			return state.trackTitleProfileSlots;
		case 'background-zoom':
			return state.backgroundProfileSlots;
		case 'intro-window':
			return state.introProfileSlots;
	}
}

function slotValues(
	state: AuthoringManifestSource,
	manifestSlot: VibrixManifestSlot
): unknown {
	if (manifestSlot.family === 'scene') {
		return { bindings: manifestSlot.bindings ?? {} };
	}
	return (
		slotsFor(state, manifestSlot.family).find(
			slot => slot.id === manifestSlot.id
		)?.values ?? null
	);
}

/**
 * The portable authoring handoff to Lyrixa. It includes enough immutable data
 * to identify and inspect every published object. Original image binaries stay
 * in Vibrix because Vibrix is the renderer; transportable thumbnails live in
 * the embedded manifest.
 */
export function buildAuthoringPackage(
	state: AuthoringManifestSource,
	options: AuthoringManifestOptions
): VibrixAuthoringPackage {
	const manifest = buildAuthoringManifest(state, options);
	const slotSnapshots: VibrixAuthoringSlotSnapshot[] = manifest.slots.map(
		slot => ({
			kind: 'slot',
			id: slot.id,
			family: slot.family,
			name: slot.name,
			revision: slot.revision,
			values: slotValues(state, slot)
		})
	);
	const imageById = new Map(
		(state.backgroundImages ?? []).map(image => [image.assetId, image])
	);
	const imageSnapshots: VibrixAuthoringImageSnapshot[] =
		manifest.images.flatMap(image => {
			const source = imageById.get(image.id);
			return source
				? [
						{
							kind: 'image' as const,
							id: image.id,
							name: image.name,
							revision: image.revision,
							values: buildImageAuthoringValues(source)
						}
					]
				: [];
		});
	return {
		format: 'vibrix-authoring',
		packageVersion: 1,
		exportedAt: options.exportedAt,
		manifest,
		snapshots: [...slotSnapshots, ...imageSnapshots]
	};
}
