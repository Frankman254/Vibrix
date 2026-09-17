import { restoreWallpaperAssets } from '@/services/restoreWallpaperAssets';
import {
	createBackgroundImageItem,
	isBackgroundImageUsingDefaultLayout
} from '@/features/background/backgroundImages';
import { DEFAULT_STATE } from '@/store/defaultState';
import {
	FACTORY_DEFAULT_STATE,
	cloneFactoryDefaultState,
	getFactoryDefaultValue
} from '@/store/factoryDefaults';
import { useWallpaperStore } from '@/store/wallpaperStore';
import {
	LEGACY_PROJECT_FORMATS,
	LEGACY_SETTINGS_FORMATS,
	PROJECT_FORMAT,
	SETTINGS_FORMAT,
	SETTINGS_SCHEMA_VERSION,
	STORE_PERSIST_VERSION
} from '@/lib/version';
import { migrateWallpaperStore } from '@/store/wallpaperStoreMigrations';
import { isWorkspaceOnlyKey } from '@/lib/workspaceKeys';
import type {
	BackgroundImageItem,
	OverlayImageItem,
	WallpaperState
} from '@/types/wallpaper';

type SettingsEnvelope = {
	format: typeof SETTINGS_FORMAT;
	version: typeof SETTINGS_SCHEMA_VERSION;
	/** Store shape version of `state` at export time. Imports run the store
	 *  migration chain from this version, so old files (index-based slot
	 *  bindings, retired keys) land correctly on the current shape. */
	storePersistVersion: number;
	exportedAt: string;
	assetsIncluded: false;
	state: WallpaperState;
};

const WALLPAPER_STATE_KEYS = Object.keys(FACTORY_DEFAULT_STATE) as Array<
	keyof WallpaperState
>;

function createBaseState(): WallpaperState {
	return {
		...cloneFactoryDefaultState(),
		backgroundImages: [],
		imageIds: [],
		imageUrls: [],
		overlays: [],
		customPresets: { ...FACTORY_DEFAULT_STATE.customPresets },
		layerZIndices: { ...FACTORY_DEFAULT_STATE.layerZIndices }
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function normalizeAudioReactiveChannel(
	value: unknown,
	fallback: OverlayImageItem['audioOpacityChannel']
): OverlayImageItem['audioOpacityChannel'] {
	if (
		value === 'auto' ||
		value === 'kick' ||
		value === 'instrumental' ||
		value === 'bass' ||
		value === 'hihat' ||
		value === 'vocal' ||
		value === 'full'
	) {
		return value;
	}
	return fallback;
}

const NULLABLE_STRING_KEYS = new Set<keyof WallpaperState>([
	'imageUrl',
	'globalBackgroundId',
	'globalBackgroundUrl',
	'logoId',
	'logoUrl',
	'audioFileAssetId',
	'activeImageId',
	'selectedOverlayId'
]);

function getCompatibleStateValue<K extends keyof WallpaperState>(
	key: K,
	value: unknown
): WallpaperState[K] | undefined {
	const fallback = getFactoryDefaultValue(key);

	if (NULLABLE_STRING_KEYS.has(key)) {
		return (
			value === null || typeof value === 'string' ? value : undefined
		) as WallpaperState[K] | undefined;
	}

	if (Array.isArray(fallback)) {
		return (Array.isArray(value) ? value : undefined) as
			| WallpaperState[K]
			| undefined;
	}

	if (typeof fallback === 'number') {
		return (
			typeof value === 'number' && Number.isFinite(value)
				? value
				: undefined
		) as WallpaperState[K] | undefined;
	}

	if (typeof fallback === 'boolean') {
		return (typeof value === 'boolean' ? value : undefined) as
			| WallpaperState[K]
			| undefined;
	}

	if (typeof fallback === 'string') {
		return (typeof value === 'string' ? value : undefined) as
			| WallpaperState[K]
			| undefined;
	}

	if (isRecord(fallback)) {
		return (isRecord(value) ? value : undefined) as
			| WallpaperState[K]
			| undefined;
	}

	// A `null` factory default carries no type to check against, and every
	// branch above needs one — so these used to fall through to `undefined`
	// and be dropped on import. `NULLABLE_STRING_KEYS` above was the manual
	// workaround, and it went stale the moment a nullable key was added
	// without touching it: `defaultSceneSlotId`, `activeSceneSlotId`,
	// `activeSetlistId`, `activeFilterLookId`, `customFilterLookSettings`,
	// `imageFocusX/Y` and the playlist position were all silently lost every
	// time a user re-imported their own project.
	//
	// Nullable keys hold strings, numbers or objects depending on the key, so
	// accept any of those (plus `null`) and reject only what cannot be a
	// legitimate exported value.
	if (fallback === null) {
		const acceptable =
			value === null ||
			typeof value === 'string' ||
			typeof value === 'number' ||
			typeof value === 'boolean' ||
			Array.isArray(value) ||
			isRecord(value);
		return (acceptable ? value : undefined) as
			| WallpaperState[K]
			| undefined;
	}

	return undefined;
}

function normalizeBackgroundImages(
	source: Partial<WallpaperState>
): BackgroundImageItem[] {
	const fallback = {
		scale: source.imageScale ?? DEFAULT_STATE.imageScale,
		positionX: source.imagePositionX ?? DEFAULT_STATE.imagePositionX,
		positionY: source.imagePositionY ?? DEFAULT_STATE.imagePositionY,
		focusX: source.imageFocusX ?? DEFAULT_STATE.imageFocusX,
		focusY: source.imageFocusY ?? DEFAULT_STATE.imageFocusY,
		rotation: source.imageRotation ?? DEFAULT_STATE.imageRotation,
		fitMode: source.imageFitMode ?? DEFAULT_STATE.imageFitMode,
		mirror: source.imageMirror ?? DEFAULT_STATE.imageMirror,
		mirrorFill: source.imageMirrorFill ?? DEFAULT_STATE.imageMirrorFill,
		mirrorFillInvert:
			source.imageMirrorFillInvert ?? DEFAULT_STATE.imageMirrorFillInvert,
		mirrorFillCount:
			source.imageMirrorFillCount ?? DEFAULT_STATE.imageMirrorFillCount,
		opacity: source.imageOpacity ?? DEFAULT_STATE.imageOpacity,
		bassReactive:
			source.imageBassReactive ?? DEFAULT_STATE.imageBassReactive,
		bassIntensity:
			source.imageBassScaleIntensity ??
			DEFAULT_STATE.imageBassScaleIntensity,
		audioReactiveDecay:
			source.imageAudioReactiveDecay ??
			DEFAULT_STATE.imageAudioReactiveDecay,
		audioChannel:
			source.imageAudioChannel ?? DEFAULT_STATE.imageAudioChannel,
		transitionType:
			source.slideshowTransitionType ??
			DEFAULT_STATE.slideshowTransitionType,
		transitionDuration:
			source.slideshowTransitionDuration ??
			DEFAULT_STATE.slideshowTransitionDuration,
		transitionIntensity:
			source.slideshowTransitionIntensity ??
			DEFAULT_STATE.slideshowTransitionIntensity,
		transitionAudioDrive:
			source.slideshowTransitionAudioDrive ??
			DEFAULT_STATE.slideshowTransitionAudioDrive
	};

	const fromState =
		Array.isArray(source.backgroundImages) &&
		source.backgroundImages.length > 0
			? source.backgroundImages
			: Array.isArray(source.imageIds)
				? source.imageIds.map(assetId => ({ assetId }))
				: [];

	return fromState
		.filter(
			(
				image
			): image is Partial<BackgroundImageItem> & { assetId: string } =>
				isRecord(image) &&
				typeof image.assetId === 'string' &&
				image.assetId.length > 0
		)
		.map(image => {
			const item = createBackgroundImageItem(
				image.assetId,
				null,
				typeof image.thumbnailUrl === 'string'
					? image.thumbnailUrl
					: null,
				{
					originalFileName:
						typeof image.originalFileName === 'string'
							? image.originalFileName
							: null,
					scale:
						typeof image.scale === 'number'
							? image.scale
							: fallback.scale,
					positionX:
						typeof image.positionX === 'number'
							? image.positionX
							: fallback.positionX,
					positionY:
						typeof image.positionY === 'number'
							? image.positionY
							: fallback.positionY,
					focusX:
						typeof image.focusX === 'number'
							? image.focusX
							: fallback.focusX,
					focusY:
						typeof image.focusY === 'number'
							? image.focusY
							: fallback.focusY,
					rotation:
						typeof image.rotation === 'number'
							? image.rotation
							: fallback.rotation,
					fitMode: image.fitMode ?? fallback.fitMode,
					mirror:
						typeof image.mirror === 'boolean'
							? image.mirror
							: fallback.mirror,
					mirrorFill:
						typeof image.mirrorFill === 'boolean'
							? image.mirrorFill
							: fallback.mirrorFill,
					mirrorFillInvert:
						typeof image.mirrorFillInvert === 'boolean'
							? image.mirrorFillInvert
							: fallback.mirrorFillInvert,
					mirrorFillCount:
						typeof image.mirrorFillCount === 'number'
							? image.mirrorFillCount
							: fallback.mirrorFillCount,
					opacity:
						typeof image.opacity === 'number'
							? image.opacity
							: fallback.opacity,
					bassReactive:
						typeof image.bassReactive === 'boolean'
							? image.bassReactive
							: fallback.bassReactive,
					bassIntensity:
						typeof image.bassIntensity === 'number'
							? image.bassIntensity
							: fallback.bassIntensity,
					audioReactiveDecay:
						typeof image.audioReactiveDecay === 'number'
							? image.audioReactiveDecay
							: fallback.audioReactiveDecay,
					audioChannel: image.audioChannel ?? fallback.audioChannel,
					transitionType:
						image.transitionType ?? fallback.transitionType,
					transitionDuration:
						typeof image.transitionDuration === 'number'
							? image.transitionDuration
							: fallback.transitionDuration,
					transitionIntensity:
						typeof image.transitionIntensity === 'number'
							? image.transitionIntensity
							: fallback.transitionIntensity,
					transitionAudioDrive:
						typeof image.transitionAudioDrive === 'number'
							? image.transitionAudioDrive
							: fallback.transitionAudioDrive,
					transitionAudioChannel:
						image.transitionAudioChannel ??
						source.slideshowTransitionAudioChannel ??
						DEFAULT_STATE.slideshowTransitionAudioChannel,
					logoProfileSlotId: image.logoProfileSlotId ?? null,
					spectrumProfileSlotId: image.spectrumProfileSlotId ?? null,
					logoOverride: image.logoOverride ?? null,
					spectrumOverride: image.spectrumOverride ?? null,
					playbackSwitchAt: image.playbackSwitchAt ?? null,
					sceneSlotId:
						typeof (image as { sceneSlotId?: unknown })
							.sceneSlotId === 'string'
							? (image as { sceneSlotId: string }).sceneSlotId
							: null
				}
			);
			// Saved provenance boolean respected; else derive from layout so
			// custom framing is never machine-overwritten by auto-fit.
			return typeof image.coverageFramingEdited === 'boolean'
				? {
						...item,
						coverageFramingEdited: image.coverageFramingEdited
					}
				: {
						...item,
						coverageFramingEdited:
							!isBackgroundImageUsingDefaultLayout(item)
					};
		});
}

function normalizeOverlays(
	source: Partial<WallpaperState>
): OverlayImageItem[] {
	if (!Array.isArray(source.overlays)) return [];

	return source.overlays.reduce<OverlayImageItem[]>((acc, overlay, index) => {
		if (
			!isRecord(overlay) ||
			typeof overlay.id !== 'string' ||
			overlay.id.length === 0 ||
			typeof overlay.assetId !== 'string' ||
			overlay.assetId.length === 0
		) {
			return acc;
		}

		acc.push({
			id: overlay.id,
			assetId: overlay.assetId,
			name:
				typeof overlay.name === 'string' && overlay.name.length > 0
					? overlay.name
					: `Overlay ${index + 1}`,
			url: null,
			enabled:
				typeof overlay.enabled === 'boolean' ? overlay.enabled : true,
			zIndex: typeof overlay.zIndex === 'number' ? overlay.zIndex : 90,
			positionX:
				typeof overlay.positionX === 'number' ? overlay.positionX : 0,
			positionY:
				typeof overlay.positionY === 'number' ? overlay.positionY : 0,
			scale: typeof overlay.scale === 'number' ? overlay.scale : 1,
			rotation:
				typeof overlay.rotation === 'number' ? overlay.rotation : 0,
			opacity: typeof overlay.opacity === 'number' ? overlay.opacity : 1,
			blendMode: overlay.blendMode ?? 'normal',
			cropShape: overlay.cropShape ?? 'rectangle',
			edgeFade:
				typeof overlay.edgeFade === 'number' ? overlay.edgeFade : 0.08,
			edgeBlur:
				typeof overlay.edgeBlur === 'number' ? overlay.edgeBlur : 0,
			edgeGlow:
				typeof overlay.edgeGlow === 'number' ? overlay.edgeGlow : 0.12,
			width: typeof overlay.width === 'number' ? overlay.width : 320,
			height: typeof overlay.height === 'number' ? overlay.height : 320,
			audioOpacityReactive:
				typeof overlay.audioOpacityReactive === 'boolean'
					? overlay.audioOpacityReactive
					: true,
			audioOpacityAmount:
				typeof overlay.audioOpacityAmount === 'number'
					? overlay.audioOpacityAmount
					: 0.35,
			audioOpacityInvert:
				typeof overlay.audioOpacityInvert === 'boolean'
					? overlay.audioOpacityInvert
					: false,
			audioOpacityChannel: normalizeAudioReactiveChannel(
				overlay.audioOpacityChannel,
				'kick'
			)
		});

		return acc;
	}, []);
}

function normalizeWallpaperState(
	candidate: Partial<WallpaperState>
): WallpaperState {
	const nextState = createBaseState();

	for (const key of WALLPAPER_STATE_KEYS) {
		if (!(key in candidate)) continue;
		// Editor chrome stays on the machine it belongs to. `createBaseState()`
		// already seeded this key from the CURRENT editor, so skipping it here
		// serves both directions at once: an export never carries the author's
		// theme/HUD/layout, and an import never overwrites the reader's.
		if (isWorkspaceOnlyKey(key)) continue;
		const compatibleValue = getCompatibleStateValue(key, candidate[key]);
		if (compatibleValue !== undefined) {
			(nextState as Record<string, unknown>)[key] =
				compatibleValue as unknown;
		}
	}

	nextState.audioCaptureState = DEFAULT_STATE.audioCaptureState;
	nextState.audioPaused = DEFAULT_STATE.audioPaused;
	nextState.motionPaused = DEFAULT_STATE.motionPaused;
	nextState.visualTransition = null;
	// Spectrum is always on in an imported project — if it was accidentally
	// disabled at export time, the import should not silently stay broken.
	nextState.spectrumEnabled = true;
	nextState.imageUrl = null;
	nextState.imageUrls = [];
	nextState.globalBackgroundUrl = null;
	nextState.logoUrl = getFactoryDefaultValue('logoUrl');
	nextState.isPresetDirty = false;
	nextState.backgroundImages = normalizeBackgroundImages(candidate);
	nextState.overlays = normalizeOverlays(candidate);
	nextState.imageIds = nextState.backgroundImages.map(image => image.assetId);

	const activeImageId =
		nextState.activeImageId &&
		nextState.backgroundImages.some(
			image => image.assetId === nextState.activeImageId
		)
			? nextState.activeImageId
			: (nextState.backgroundImages[0]?.assetId ?? null);
	const activeImage =
		nextState.backgroundImages.find(
			image => image.assetId === activeImageId
		) ?? null;

	nextState.activeImageId = activeImageId;
	nextState.imageScale = activeImage?.scale ?? nextState.imageScale;
	nextState.imagePositionX =
		activeImage?.positionX ?? nextState.imagePositionX;
	nextState.imagePositionY =
		activeImage?.positionY ?? nextState.imagePositionY;
	nextState.imageFocusX = activeImage?.focusX ?? nextState.imageFocusX;
	nextState.imageFocusY = activeImage?.focusY ?? nextState.imageFocusY;
	nextState.imageOpacity = activeImage?.opacity ?? nextState.imageOpacity;
	nextState.imageBassReactive =
		activeImage?.bassReactive ?? nextState.imageBassReactive;
	nextState.imageBassScaleIntensity =
		activeImage?.bassIntensity ?? nextState.imageBassScaleIntensity;
	nextState.imageAudioReactiveDecay =
		activeImage?.audioReactiveDecay ?? nextState.imageAudioReactiveDecay;
	nextState.imageAudioChannel =
		activeImage?.audioChannel ?? nextState.imageAudioChannel;
	nextState.imageFitMode = activeImage?.fitMode ?? nextState.imageFitMode;
	nextState.imageMirror = activeImage?.mirror ?? nextState.imageMirror;
	nextState.imageMirrorFill =
		activeImage?.mirrorFill ?? nextState.imageMirrorFill;
	nextState.imageMirrorFillInvert =
		activeImage?.mirrorFillInvert ?? nextState.imageMirrorFillInvert;
	nextState.imageMirrorFillCount =
		activeImage?.mirrorFillCount ?? nextState.imageMirrorFillCount;
	nextState.imageRotation = activeImage?.rotation ?? nextState.imageRotation;
	nextState.slideshowTransitionType =
		activeImage?.transitionType ?? nextState.slideshowTransitionType;
	nextState.slideshowTransitionDuration =
		activeImage?.transitionDuration ??
		nextState.slideshowTransitionDuration;
	nextState.slideshowTransitionIntensity =
		activeImage?.transitionIntensity ??
		nextState.slideshowTransitionIntensity;
	nextState.slideshowTransitionAudioDrive =
		activeImage?.transitionAudioDrive ??
		nextState.slideshowTransitionAudioDrive;
	nextState.slideshowTransitionAudioChannel =
		activeImage?.transitionAudioChannel ??
		nextState.slideshowTransitionAudioChannel;
	nextState.selectedOverlayId =
		nextState.selectedOverlayId &&
		nextState.overlays.some(
			overlay => overlay.id === nextState.selectedOverlayId
		)
			? nextState.selectedOverlayId
			: (nextState.overlays[0]?.id ?? null);
	nextState.customPresets = isRecord(candidate.customPresets)
		? (candidate.customPresets as WallpaperState['customPresets'])
		: { ...DEFAULT_STATE.customPresets };
	nextState.layerZIndices = isRecord(candidate.layerZIndices)
		? (candidate.layerZIndices as WallpaperState['layerZIndices'])
		: { ...DEFAULT_STATE.layerZIndices };

	return nextState;
}

export function buildWallpaperSettingsExport(
	sourceState?: Partial<WallpaperState> | WallpaperState
): SettingsEnvelope {
	const state = normalizeWallpaperState(
		sourceState ?? useWallpaperStore.getState()
	);
	return {
		format: SETTINGS_FORMAT,
		version: SETTINGS_SCHEMA_VERSION,
		storePersistVersion: STORE_PERSIST_VERSION,
		exportedAt: new Date().toISOString(),
		assetsIncluded: false,
		state
	};
}

export function createWallpaperSettingsJson(): string {
	return JSON.stringify(buildWallpaperSettingsExport(), null, 2);
}

/** Every format tag an import may carry: the current pair plus the pre-rename
 *  tags. A project envelope's tag is accepted here too — that has always been
 *  the case, and the `state` guard below is what actually decides the shape. */
const READABLE_SETTINGS_FORMATS: readonly string[] = [
	SETTINGS_FORMAT,
	PROJECT_FORMAT,
	...LEGACY_SETTINGS_FORMATS,
	...LEGACY_PROJECT_FORMATS
];

function isReadableSettingsFormat(format: unknown): boolean {
	return (
		typeof format === 'string' && READABLE_SETTINGS_FORMATS.includes(format)
	);
}

export function parseWallpaperSettingsJson(raw: string): WallpaperState {
	const parsed = JSON.parse(raw) as unknown;
	if (!isRecord(parsed)) {
		throw new Error('invalid-settings-file');
	}

	if ('format' in parsed && !isReadableSettingsFormat(parsed.format)) {
		throw new Error('invalid-settings-file');
	}

	const candidate =
		isReadableSettingsFormat(parsed.format) && isRecord(parsed.state)
			? (parsed.state as Partial<WallpaperState>)
			: (parsed as Partial<WallpaperState>);

	// Run the store migration chain from the file's recorded shape version
	// (files older than the field migrate from 0, same as an old localStorage
	// payload) so legacy shapes land on the current model before normalizing.
	const storePersistVersion =
		typeof parsed.storePersistVersion === 'number'
			? parsed.storePersistVersion
			: 0;
	const migrated = migrateWallpaperStore(candidate, storePersistVersion);

	return normalizeWallpaperState(migrated);
}

export async function applyWallpaperSettingsJson(
	raw: string
): Promise<{ missingAssets: boolean }> {
	const nextState = parseWallpaperSettingsJson(raw);
	useWallpaperStore.setState(nextState);
	await restoreWallpaperAssets();

	const restoredState = useWallpaperStore.getState();
	const missingAssets =
		nextState.backgroundImages.length >
			restoredState.backgroundImages.length ||
		nextState.overlays.length > restoredState.overlays.length ||
		(Boolean(nextState.logoId) && !restoredState.logoUrl) ||
		(Boolean(nextState.globalBackgroundId) &&
			!restoredState.globalBackgroundUrl);

	return { missingAssets };
}
