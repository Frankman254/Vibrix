/**
 * Named transition presets — one control instead of five dials.
 *
 * A transition used to be five per-image numbers with no name, mirrored into a
 * second "global" set that is really the active image's values (see
 * `getBackgroundImageStatePatch`). Asking for "the same transition as that other
 * image" meant copying five values by eye. A preset gives that look a name, and
 * the image just points at it.
 *
 * The dials still edit the IMAGE, not the preset — moving one means "this image
 * is special now", so the image drops back to `Custom`. Saving is explicit
 * (`Save as preset`), the way every other slot in this app works.
 */
import type {
	BackgroundImageItem,
	TransitionPreset,
	TransitionPresetSettings
} from '@/types/wallpaper';

/** The image fields a preset writes. Smoothing stays out on purpose: it is a
 *  global audio-routing setting, not part of how a transition looks. */
export const TRANSITION_PRESET_KEYS = [
	'transitionType',
	'transitionDuration',
	'transitionIntensity',
	'transitionAudioDrive',
	'transitionAudioChannel'
] as const satisfies ReadonlyArray<keyof TransitionPresetSettings>;

export const MAX_TRANSITION_PRESETS = 40;

/** Factory presets. Ids are stable strings, not indexes, so a user preset added
 *  in between never renames somebody else's choice. */
export const BUILT_IN_TRANSITION_PRESETS: readonly TransitionPreset[] = [
	{
		id: 'tp-clean-cut',
		name: 'Clean cut',
		builtIn: true,
		settings: {
			transitionType: 'fade',
			transitionDuration: 0.25,
			transitionIntensity: 0.6,
			transitionAudioDrive: 0,
			transitionAudioChannel: 'bass'
		}
	},
	{
		id: 'tp-soft-fade',
		name: 'Soft fade',
		builtIn: true,
		settings: {
			transitionType: 'fade',
			transitionDuration: 1.6,
			transitionIntensity: 1,
			transitionAudioDrive: 0,
			transitionAudioChannel: 'bass'
		}
	},
	{
		id: 'tp-beat-hit',
		name: 'Beat hit',
		builtIn: true,
		settings: {
			transitionType: 'zoom-in',
			transitionDuration: 0.6,
			transitionIntensity: 1.6,
			transitionAudioDrive: 0.9,
			transitionAudioChannel: 'bass'
		}
	},
	{
		id: 'tp-glitch',
		name: 'Glitch',
		builtIn: true,
		settings: {
			transitionType: 'rgb-shift',
			transitionDuration: 0.5,
			transitionIntensity: 1.8,
			transitionAudioDrive: 0.6,
			transitionAudioChannel: 'hihat'
		}
	}
];

export function createDefaultTransitionPresets(): TransitionPreset[] {
	return BUILT_IN_TRANSITION_PRESETS.map(preset => ({
		...preset,
		settings: { ...preset.settings }
	}));
}

/**
 * Keeps every user preset and re-seeds the factory ones. Persisted data from
 * before this existed has no presets at all; data from a later build may have
 * factory presets the user renamed, and renaming a factory preset is allowed —
 * so a built-in that is already there is left exactly as it is.
 */
export function mergeTransitionPresets(stored: unknown): TransitionPreset[] {
	const list = Array.isArray(stored) ? stored : [];
	const valid = list.filter(isTransitionPreset);
	const missing = BUILT_IN_TRANSITION_PRESETS.filter(
		builtIn => !valid.some(preset => preset.id === builtIn.id)
	).map(preset => ({ ...preset, settings: { ...preset.settings } }));
	return [...missing, ...valid].slice(0, MAX_TRANSITION_PRESETS);
}

function isTransitionPreset(value: unknown): value is TransitionPreset {
	if (typeof value !== 'object' || value === null) return false;
	const preset = value as Partial<TransitionPreset>;
	return (
		typeof preset.id === 'string' &&
		typeof preset.name === 'string' &&
		typeof preset.settings === 'object' &&
		preset.settings !== null
	);
}

/** The settings of the image as a preset body, for "Save as preset". */
export function transitionSettingsFromImage(
	image: Pick<BackgroundImageItem, (typeof TRANSITION_PRESET_KEYS)[number]>
): TransitionPresetSettings {
	return {
		transitionType: image.transitionType,
		transitionDuration: image.transitionDuration,
		transitionIntensity: image.transitionIntensity,
		transitionAudioDrive: image.transitionAudioDrive,
		transitionAudioChannel: image.transitionAudioChannel
	};
}

/** True when the image still matches the preset it points at. */
export function imageMatchesTransitionPreset(
	image: Pick<BackgroundImageItem, (typeof TRANSITION_PRESET_KEYS)[number]>,
	preset: TransitionPreset
): boolean {
	const settings = transitionSettingsFromImage(image);
	return TRANSITION_PRESET_KEYS.every(
		key => settings[key] === preset.settings[key]
	);
}

/**
 * Which preset an image is showing: the one it points at when it still matches,
 * otherwise `null` (= Custom). An image whose stored preset was deleted, or
 * whose dials were moved behind the preset's back, reads as Custom instead of
 * lying about a name.
 */
export function resolveImageTransitionPresetId(
	image: Pick<
		BackgroundImageItem,
		(typeof TRANSITION_PRESET_KEYS)[number] | 'transitionPresetId'
	>,
	presets: readonly TransitionPreset[]
): string | null {
	if (!image.transitionPresetId) return null;
	const preset = presets.find(item => item.id === image.transitionPresetId);
	if (!preset) return null;
	return imageMatchesTransitionPreset(image, preset) ? preset.id : null;
}

/** A name that is not taken yet, so two presets never share one. */
export function uniqueTransitionPresetName(
	requested: string,
	presets: readonly TransitionPreset[]
): string {
	const base = requested.trim() || 'Transition';
	if (!presets.some(preset => preset.name === base)) return base;
	for (let index = 2; index < 1000; index += 1) {
		const candidate = `${base} ${index}`;
		if (!presets.some(preset => preset.name === candidate)) {
			return candidate;
		}
	}
	return `${base} ${Date.now()}`;
}

export function createTransitionPresetId(): string {
	return `tp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
