/**
 * "What does THIS image carry?" — the read-only mirror of
 * `buildActiveImageSelectionPatch`.
 *
 * The answer was spread over three screens (the per-image override rows, the
 * scene assignment block and the HUD PER IMG panel), each telling a piece of
 * the truth, so the same image could look configured in one and untouched in
 * another. This derives the whole precedence in one place, in the same order
 * the patch builder applies it, so the UI never has to guess:
 *
 *   global composition mode (unless the image opts out)
 *     → effective scene (own, else the default scene)
 *       → inline per-image override
 *         → per-image slot binding
 *           → whatever is live in the global controls
 *
 * Keep this file in step with `buildActiveImageSelectionPatch`: it is a
 * description of that function, not a second source of truth.
 */
import {
	findSlotByRef,
	resolveEffectiveSceneSlotId
} from '@/features/scenes/sceneSlot';
import type {
	BackgroundImageItem,
	SceneSlot,
	SceneSlotRef,
	WallpaperState
} from '@/types/wallpaper';

export type CompositionSourceId =
	/** Global composition mode is on: the live controls win everywhere. */
	| 'global-mode'
	/** The effective scene binds a saved slot for this subsystem. */
	| 'scene'
	/** The scene forces the subsystem off. */
	| 'scene-off'
	/** The image carries an inline snapshot of this subsystem. */
	| 'override'
	/** The image points at a saved slot of this subsystem. */
	| 'slot'
	/** Nothing per-image: the global controls are what you see. */
	| 'global';

export type CompositionSubsystemId =
	| 'logo'
	| 'spectrum'
	| 'particles'
	| 'rain'
	| 'looks'
	| 'cameraFx'
	| 'lights'
	| 'trackTitle';

export type CompositionRow = {
	id: CompositionSubsystemId;
	source: CompositionSourceId;
	/** Name of the scene / slot that wins, when there is one to name. */
	detail: string | null;
	/** An inline override is STORED, even if something above it wins today. */
	hasOverride: boolean;
	/** This subsystem supports a per-image inline override. */
	supportsOverride: boolean;
};

export type ImageCompositionSummary = {
	/** Global mode is on AND this image does not opt out of it. */
	globalMode: boolean;
	/** The image opts out of global mode with `ignoreGlobalOverride`. */
	ignoresGlobalMode: boolean;
	sceneName: string | null;
	/** The winning scene comes from the global default, not from the image. */
	usedDefaultScene: boolean;
	rows: CompositionRow[];
};

/** Subsystems in editor reading order, with how a scene and an image name them. */
const SUBSYSTEMS: ReadonlyArray<{
	id: CompositionSubsystemId;
	sceneKey: keyof SceneSlot;
	overrideKey: keyof BackgroundImageItem | null;
	slotKey: keyof BackgroundImageItem | null;
	slots: (
		state: WallpaperState
	) => ReadonlyArray<{ id: string; name: string }>;
}> = [
	{
		id: 'logo',
		sceneKey: 'logoSlotId',
		overrideKey: 'logoOverride',
		slotKey: 'logoProfileSlotId',
		slots: state => state.logoProfileSlots
	},
	{
		id: 'spectrum',
		sceneKey: 'spectrumSlotId',
		overrideKey: 'spectrumOverride',
		slotKey: 'spectrumProfileSlotId',
		slots: state => state.spectrumProfileSlots
	},
	{
		id: 'particles',
		sceneKey: 'particlesSlotId',
		overrideKey: 'particlesOverride',
		slotKey: 'particlesProfileSlotId',
		slots: state => state.particlesProfileSlots
	},
	{
		id: 'rain',
		sceneKey: 'rainSlotId',
		overrideKey: 'rainOverride',
		slotKey: 'rainProfileSlotId',
		slots: state => state.rainProfileSlots
	},
	{
		id: 'looks',
		sceneKey: 'looksSlotId',
		overrideKey: 'looksOverride',
		slotKey: 'looksProfileSlotId',
		slots: state => state.looksProfileSlots
	},
	{
		id: 'cameraFx',
		sceneKey: 'cameraFxSlotId',
		overrideKey: 'cameraFxOverride',
		slotKey: null,
		slots: state => state.cameraFxProfileSlots
	},
	{
		id: 'lights',
		sceneKey: 'lightsSlotId',
		overrideKey: 'lightsOverride',
		slotKey: null,
		slots: state => state.lightsProfileSlots
	},
	{
		id: 'trackTitle',
		sceneKey: 'trackTitleSlotId',
		overrideKey: 'trackTitleOverride',
		slotKey: null,
		slots: state => state.trackTitleProfileSlots
	}
];

export function describeImageComposition(
	state: WallpaperState,
	image: BackgroundImageItem
): ImageCompositionSummary {
	const globalMode =
		state.globalCompositionOverride && !image.ignoreGlobalOverride;
	const { sceneSlotId, usedDefault } = resolveEffectiveSceneSlotId(
		image,
		state
	);
	const scene = sceneSlotId
		? state.sceneSlots.find(slot => slot.id === sceneSlotId)
		: undefined;

	const rows = SUBSYSTEMS.map<CompositionRow>(subsystem => {
		const hasOverride =
			subsystem.overrideKey != null &&
			image[subsystem.overrideKey] != null;
		const base = {
			id: subsystem.id,
			hasOverride,
			supportsOverride: subsystem.overrideKey != null
		};
		if (globalMode) {
			return { ...base, source: 'global-mode', detail: null };
		}
		if (scene) {
			const ref = scene[subsystem.sceneKey] as SceneSlotRef;
			if (ref === 'off') {
				return { ...base, source: 'scene-off', detail: scene.name };
			}
			const slot = findSlotByRef(subsystem.slots(state), ref);
			if (slot) {
				return {
					...base,
					source: 'scene',
					detail: `${scene.name} · ${slot.name}`
				};
			}
			// The scene wins the image but says nothing about this subsystem,
			// so the global controls are still what you see.
			return { ...base, source: 'global', detail: null };
		}
		if (hasOverride) {
			return { ...base, source: 'override', detail: null };
		}
		const slot = subsystem.slotKey
			? findSlotByRef(
					subsystem.slots(state),
					image[subsystem.slotKey] as SceneSlotRef
				)
			: null;
		if (slot) return { ...base, source: 'slot', detail: slot.name };
		return { ...base, source: 'global', detail: null };
	});

	return {
		globalMode,
		ignoresGlobalMode:
			state.globalCompositionOverride &&
			image.ignoreGlobalOverride === true,
		sceneName: scene?.name ?? null,
		usedDefaultScene: usedDefault,
		rows
	};
}
