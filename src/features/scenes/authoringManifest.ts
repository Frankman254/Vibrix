import type {
	BackgroundImageItem,
	ProfileSlot,
	SceneSlot,
	SceneSlotRef,
	WallpaperState
} from '@/types/wallpaper';
import { APP_VERSION, STORE_PERSIST_VERSION } from '@/lib/version';
import { EMPTY_REVISION, manifestRevision, revisionOf } from './slotRevision';
import { normalizeSlotRef } from './sceneSlot';

/**
 * Vibrix's half of the authoring contract: publish the catalogue of slots so
 * Lyrixa can compose a timeline out of them.
 *
 * Contract and shared fixture: `docs/features/VIBRIX_AUTHORING_CONTRACT.md`.
 *
 * Pure and total — no clock, no randomness, no store read. `exportedAt` and
 * `projectName` are injected precisely so a test can compare a whole manifest
 * by value; a `Date.now()` in here would make that impossible.
 */

/**
 * The families that exist. Verified against `src/types/wallpaper.ts`, and this
 * list is the authority: two names that look like they belong here do not.
 *
 * `motion` is absent because it was **deleted**, not forgotten —
 * `wallpaperStoreMigrations.ts` drops `motionProfileSlots`; particles and rain
 * are composed separately now, so a `motion` cue could never resolve.
 *
 * `calibration` is absent on purpose and must stay absent: calibration belongs
 * to the screen and the machine of whoever edited, so a score that carried it
 * would recalibrate someone else's display on import.
 */
export const VIBRIX_SLOT_FAMILIES = [
	'scene',
	'spectrum',
	'spectrum-second',
	'looks',
	'particles',
	'rain',
	'lights',
	'camera-fx',
	'logo',
	'track-title',
	'background-zoom',
	'intro-window'
] as const;

export type VibrixSlotFamily = (typeof VIBRIX_SLOT_FAMILIES)[number];

export interface VibrixManifestSlot {
	id: string;
	family: VibrixSlotFamily;
	name: string;
	/** `'empty'` when the slot holds no values. */
	revision: string;
	/** Only on `family: 'scene'`: which granular slot each subsystem points at.
	 *  `'off'` = force it off; **key absent = "do not touch"** (the `null` of
	 *  `SceneSlotRef`). Flattening those two is the expensive bug here. */
	bindings?: Partial<Record<VibrixSlotFamily, string | 'off'>>;
	/** False for `background-zoom`: no scene can reference it. */
	sceneBindable: boolean;
	/** False for `intro-window`: it covers the head of the track by design, so
	 *  it cannot be placed at an arbitrary instant. */
	cueable: boolean;
}

export interface VibrixManifestImage {
	id: string;
	kind: 'image';
	name: string;
	revision: string;
	enabled: boolean;
	sceneSlotId: string | null;
	/** Only transportable previews. Browser-local `blob:` URLs are omitted. */
	thumbnailDataUrl?: string;
}

export interface VibrixAuthoringManifest {
	schemaVersion: 2;
	app: 'Vibrix';
	exportKind: 'vibrix-manifest';
	exportedAt: string;
	rendererVersion: string;
	storePersistVersion: number;
	projectName: string;
	revision: string;
	slots: VibrixManifestSlot[];
	images: VibrixManifestImage[];
}

/**
 * Exactly the state the manifest is derived from, and nothing else.
 *
 * Narrower than `WallpaperState` on purpose: with this type the function
 * provably cannot reach `calibrationProfileSlots` (or anything else it has no
 * business publishing), so that rule is enforced by the compiler instead of by
 * a comment and a test. A full `WallpaperState` still satisfies it.
 */
export type AuthoringManifestSource = Pick<
	WallpaperState,
	| 'sceneSlots'
	| 'spectrumProfileSlots'
	| 'spectrumSecondProfileSlots'
	| 'looksProfileSlots'
	| 'particlesProfileSlots'
	| 'rainProfileSlots'
	| 'lightsProfileSlots'
	| 'cameraFxProfileSlots'
	| 'logoProfileSlots'
	| 'trackTitleProfileSlots'
	| 'backgroundProfileSlots'
	| 'introProfileSlots'
	| 'backgroundImages'
>;

export interface AuthoringManifestOptions {
	/** ISO 8601. Injected so the result is comparable by value. */
	exportedAt: string;
	/** Vibrix keeps no project name in the store, so the caller supplies it. */
	projectName: string;
}

/** A binding the scene still names but that resolves to nothing. */
export interface DroppedBindingWarning {
	sceneId: string;
	sceneName: string;
	family: VibrixSlotFamily;
	missingSlotId: string;
}

export interface AuthoringManifestReport {
	manifest: VibrixAuthoringManifest;
	/**
	 * Bindings left out because their target no longer exists.
	 *
	 * This is not hypothetical: slot banks are truncated to their cap when a
	 * persisted project carries more slots than this build allows, and a
	 * partial project import can replace the slot arrays while keeping
	 * `sceneSlots`. Vibrix itself already treats such a reference as "no
	 * change" (`normalizeSlotRef`), so the manifest has to agree — and
	 * Lyrixa's parser rejects a whole manifest that names a slot it cannot
	 * find, which would turn one stale reference into "the file will not load".
	 */
	droppedBindings: DroppedBindingWarning[];
}

/** The scene-ref key on `SceneSlot` for each bindable family. */
const SCENE_REF_KEYS = {
	spectrum: 'spectrumSlotId',
	'spectrum-second': 'spectrumSecondSlotId',
	looks: 'looksSlotId',
	particles: 'particlesSlotId',
	rain: 'rainSlotId',
	lights: 'lightsSlotId',
	'camera-fx': 'cameraFxSlotId',
	logo: 'logoSlotId',
	'track-title': 'trackTitleSlotId'
} as const satisfies Partial<Record<VibrixSlotFamily, keyof SceneSlot>>;

type BindableFamily = keyof typeof SCENE_REF_KEYS;

const BINDABLE_FAMILIES = Object.keys(SCENE_REF_KEYS) as BindableFamily[];

type SlotArrayFamily = Exclude<VibrixSlotFamily, 'scene'>;

function slotArrayFor(
	state: AuthoringManifestSource,
	family: SlotArrayFamily
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

/** `background-zoom` is the bass-zoom envelope, not "which image is on screen",
 *  and no scene references it. Publishing it as non-bindable is what stops
 *  Lyrixa's UI from promising to change the background from a timeline. */
function isSceneBindable(family: VibrixSlotFamily): boolean {
	return (BINDABLE_FAMILIES as VibrixSlotFamily[]).includes(family);
}

function isCueable(family: VibrixSlotFamily): boolean {
	return family !== 'intro-window';
}

function readRef(scene: SceneSlot, family: BindableFamily): SceneSlotRef {
	return scene[SCENE_REF_KEYS[family]];
}

/**
 * A scene's revision folds in the revisions of the slots it binds, not just
 * its own references.
 *
 * Without that fold the detector has a hole wide enough to drive through:
 * editing the *values* of a bound spectrum slot leaves the scene's references
 * untouched, so its revision would not move, so Lyrixa would report the cue as
 * `Current` while the frame it produces has changed. The whole point of the
 * revision is to refuse that silence.
 */
function sceneRevision(
	bindings: Partial<Record<VibrixSlotFamily, string | 'off'>>,
	revisionBySlotId: Map<string, string>
): string {
	const entries = Object.entries(bindings) as Array<
		[VibrixSlotFamily, string | 'off']
	>;
	if (entries.length === 0) return EMPTY_REVISION;
	return manifestRevision(
		entries.map(([family, target]) =>
			target === 'off'
				? `${family}=off`
				: `${family}=${target}@${revisionBySlotId.get(target) ?? EMPTY_REVISION}`
		)
	);
}

/**
 * The stable, visual part of an image. URLs are browser transport, the file
 * name is presentation, and `playbackSwitchAt` belongs to the legacy
 * slideshow timeline that Compose replaces. Everything else can change the
 * rendered result and therefore moves the revision.
 */
export function buildImageAuthoringValues(image: BackgroundImageItem) {
	const {
		url: _url,
		thumbnailUrl: _thumbnailUrl,
		originalFileName: _originalFileName,
		playbackSwitchAt: _playbackSwitchAt,
		...visualValues
	} = image;
	return visualValues;
}

function imageRevision(image: BackgroundImageItem): string {
	return revisionOf(buildImageAuthoringValues(image));
}

function buildManifestImages(
	state: AuthoringManifestSource
): VibrixManifestImage[] {
	const sceneIds = new Set(state.sceneSlots.map(scene => scene.id));
	return (state.backgroundImages ?? []).map((image, index) => ({
		id: image.assetId,
		kind: 'image',
		name: image.originalFileName?.trim() || `Image ${index + 1}`,
		revision: imageRevision(image),
		enabled: image.enabled,
		sceneSlotId:
			image.sceneSlotId && sceneIds.has(image.sceneSlotId)
				? image.sceneSlotId
				: null,
		...(image.thumbnailUrl?.startsWith('data:image/')
			? { thumbnailDataUrl: image.thumbnailUrl }
			: {})
	}));
}

/**
 * Build the manifest, and report what had to be left out.
 *
 * Every slot is listed, including empty ones (with `revision: 'empty'`), so
 * Lyrixa can explain why a row is disabled instead of just not showing it.
 */
export function buildAuthoringManifestReport(
	state: AuthoringManifestSource,
	options: AuthoringManifestOptions
): AuthoringManifestReport {
	const granularSlots: VibrixManifestSlot[] = [];
	const revisionBySlotId = new Map<string, string>();

	for (const family of VIBRIX_SLOT_FAMILIES) {
		if (family === 'scene') continue;
		for (const slot of slotArrayFor(state, family)) {
			const revision = revisionOf(slot.values);
			revisionBySlotId.set(slot.id, revision);
			granularSlots.push({
				id: slot.id,
				family,
				name: slot.name,
				revision,
				sceneBindable: isSceneBindable(family),
				cueable: isCueable(family)
			});
		}
	}

	const droppedBindings: DroppedBindingWarning[] = [];
	const sceneSlots: VibrixManifestSlot[] = state.sceneSlots.map(scene => {
		const bindings: Partial<Record<VibrixSlotFamily, string | 'off'>> = {};
		for (const family of BINDABLE_FAMILIES) {
			const raw = readRef(scene, family);
			const normalized = normalizeSlotRef(
				raw,
				slotArrayFor(state, family)
			);
			if (normalized === null) {
				// `null` means "do not touch this subsystem", so the key is
				// omitted. A reference that *was* a slot id and normalized away
				// is a different story, and gets reported.
				if (typeof raw === 'string' && raw !== 'off') {
					droppedBindings.push({
						sceneId: scene.id,
						sceneName: scene.name,
						family,
						missingSlotId: raw
					});
				}
				continue;
			}
			bindings[family] = normalized;
		}
		const hasBindings = Object.keys(bindings).length > 0;
		return {
			id: scene.id,
			family: 'scene' as const,
			name: scene.name,
			revision: sceneRevision(bindings, revisionBySlotId),
			sceneBindable: false,
			cueable: true,
			...(hasBindings ? { bindings } : {})
		};
	});

	const slots = [...sceneSlots, ...granularSlots];
	const images = buildManifestImages(state);

	return {
		manifest: {
			schemaVersion: 2,
			app: 'Vibrix',
			exportKind: 'vibrix-manifest',
			exportedAt: options.exportedAt,
			rendererVersion: APP_VERSION,
			storePersistVersion: STORE_PERSIST_VERSION,
			projectName: options.projectName,
			// Content only: a rename must not move this either, or every rename
			// would look like "the catalogue changed".
			revision: manifestRevision([
				...slots.map(slot => slot.revision),
				...images.map(image => image.revision)
			]),
			slots,
			images
		},
		droppedBindings
	};
}

/** The manifest alone, for callers that have nothing to do with a warning. */
export function buildAuthoringManifest(
	state: AuthoringManifestSource,
	options: AuthoringManifestOptions
): VibrixAuthoringManifest {
	return buildAuthoringManifestReport(state, options).manifest;
}
