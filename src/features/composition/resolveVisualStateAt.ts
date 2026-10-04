import { buildSceneSlotActivationPatch } from '@/features/scenes/sceneSlot';
import { buildActiveImageSelectionPatch } from '@/store/activeImageSelection';
import type { SceneSlot, WallpaperState } from '@/types/wallpaper';
import type {
	CompositionCue,
	CompositionTargetV2,
	VibrixScoreEnvelope,
	VibrixTimelineKind
} from './vibrixScore';

type GranularFamily = Exclude<VibrixTimelineKind, 'scene' | 'image'>;

type NormalizedActivation = {
	cue: CompositionCue;
	family: VibrixTimelineKind;
	target:
		| { kind: 'item'; id: string }
		| { kind: 'inherit'; family: GranularFamily };
};

const FAMILY_ORDER: Record<VibrixTimelineKind, number> = {
	scene: 0,
	image: 1,
	spectrum: 2,
	'spectrum-second': 3,
	looks: 4,
	particles: 5,
	rain: 6,
	lights: 7,
	'camera-fx': 8,
	logo: 9,
	'track-title': 10,
	'background-zoom': 11,
	'intro-window': 12
};

function normalizedActivation(cue: CompositionCue): NormalizedActivation {
	if ('slotId' in cue.target) {
		return {
			cue,
			family:
				cue.target.kind === 'scene'
					? 'scene'
					: (cue.target.family ?? 'scene'),
			target: { kind: 'item', id: cue.target.slotId }
		};
	}
	if (cue.target.kind === 'inherit') {
		return {
			cue,
			family: cue.target.family,
			target: {
				kind: 'inherit',
				family: cue.target.family as GranularFamily
			}
		};
	}
	return {
		cue,
		family: cue.target.family,
		target: { kind: 'item', id: cue.target.id }
	};
}

function activeCues(envelope: VibrixScoreEnvelope, timeMs: number) {
	const enabledTracks = new Set(
		envelope.score.tracks
			.filter(track => track.enabled)
			.map(track => track.id)
	);
	return envelope.score.cues
		.filter(cue => {
			if (!cue.enabled || !enabledTracks.has(cue.trackId)) return false;
			if (cue.startTimeMs > timeMs) return false;
			return !('endTimeMs' in cue) || timeMs < cue.endTimeMs;
		})
		.map(normalizedActivation)
		.sort((a, b) => {
			if (a.cue.startTimeMs !== b.cue.startTimeMs) {
				return a.cue.startTimeMs - b.cue.startTimeMs;
			}
			if (a.cue.priority !== b.cue.priority) {
				return a.cue.priority - b.cue.priority;
			}
			const familyOrder = FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family];
			return familyOrder || a.cue.id.localeCompare(b.cue.id);
		});
}

function applyPatch(
	state: Readonly<WallpaperState>,
	patch: Partial<WallpaperState>
): WallpaperState {
	return { ...state, ...patch } as WallpaperState;
}

function blankScene(): SceneSlot {
	return {
		id: 'compose-granular',
		name: 'Compose granular activation',
		spectrumSlotId: null,
		spectrumSecondSlotId: null,
		looksSlotId: null,
		particlesSlotId: null,
		rainSlotId: null,
		lightsSlotId: null,
		cameraFxSlotId: null,
		logoSlotId: null,
		trackTitleSlotId: null
	};
}

function granularPatch(
	state: WallpaperState,
	family: GranularFamily,
	slotId: string
): Partial<WallpaperState> {
	if (family === 'background-zoom') {
		return (
			state.backgroundProfileSlots.find(slot => slot.id === slotId)
				?.values ?? {}
		);
	}
	if (family === 'intro-window') return {};
	const scene = blankScene();
	switch (family) {
		case 'spectrum':
			scene.spectrumSlotId = slotId;
			break;
		case 'spectrum-second':
			scene.spectrumSecondSlotId = slotId;
			break;
		case 'looks':
			scene.looksSlotId = slotId;
			break;
		case 'particles':
			scene.particlesSlotId = slotId;
			break;
		case 'rain':
			scene.rainSlotId = slotId;
			break;
		case 'lights':
			scene.lightsSlotId = slotId;
			break;
		case 'camera-fx':
			scene.cameraFxSlotId = slotId;
			break;
		case 'logo':
			scene.logoSlotId = slotId;
			break;
		case 'track-title':
			scene.trackTitleSlotId = slotId;
			break;
	}
	return buildSceneSlotActivationPatch(state, scene);
}

function applyAggregate(
	state: WallpaperState,
	activation: NormalizedActivation
): WallpaperState {
	if (activation.target.kind !== 'item') return state;
	const targetId = activation.target.id;
	if (activation.family === 'scene') {
		const scene = state.sceneSlots.find(slot => slot.id === targetId);
		return scene
			? applyPatch(state, {
					...buildSceneSlotActivationPatch(state, scene),
					activeSceneSlotId: scene.id
				})
			: state;
	}
	if (activation.family === 'image') {
		return applyPatch(
			state,
			buildActiveImageSelectionPatch(state, targetId).patch
		);
	}
	return state;
}

function reapplyGranularOverrides(
	aggregate: WallpaperState,
	overrides: ReadonlyMap<GranularFamily, string>
): WallpaperState {
	let resolved = aggregate;
	for (const [family, slotId] of overrides) {
		resolved = applyPatch(
			resolved,
			granularPatch(resolved, family, slotId)
		);
	}
	return resolved;
}

/**
 * Deterministically resolves the visual document at one playhead position.
 * It never reads or writes the live store. Scene and Image update the aggregate
 * document; granular lanes remain on top until another slot or `inherit`
 * changes that family.
 */
export function resolveVisualStateAt(
	base: Readonly<WallpaperState>,
	envelope: VibrixScoreEnvelope,
	timeMs: number
): WallpaperState {
	let aggregate = { ...base } as WallpaperState;
	let resolved = aggregate;
	const granularOverrides = new Map<GranularFamily, string>();

	for (const activation of activeCues(envelope, Math.max(0, timeMs))) {
		if (activation.family === 'scene' || activation.family === 'image') {
			aggregate = applyAggregate(aggregate, activation);
			resolved = reapplyGranularOverrides(aggregate, granularOverrides);
			continue;
		}
		const family = activation.family as GranularFamily;
		if (activation.target.kind === 'inherit') {
			granularOverrides.delete(family);
		} else {
			granularOverrides.set(family, activation.target.id);
		}
		resolved = reapplyGranularOverrides(aggregate, granularOverrides);
	}

	return resolved;
}

/** Type guard shared by callers that need the sustained v2 target shape. */
export function isCompositionTargetV2(
	target: CompositionCue['target']
): target is CompositionTargetV2 {
	return !('slotId' in target);
}
