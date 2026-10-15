import { FACTORY_DEFAULT_STATE } from '@/store/factoryDefaults';
import { isFactoryLookKey } from '@/store/factoryLookKeys';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import type { WallpaperState } from '@/types/wallpaper';

const COMPOSE_CONTENT_KEYS = [
	'activeImageId',
	'backgroundImages',
	'imageIds',
	'imageUrl',
	'imageUrls',
	'imageFocusX',
	'imageFocusY',
	'globalBackgroundId',
	'globalBackgroundUrl',
	'logoId',
	'logoUrl',
	'overlays',
	'activeSceneSlotId',
	'visualTransition'
] as const satisfies readonly (keyof WallpaperState)[];

const contentKeys = new Set<keyof WallpaperState>(COMPOSE_CONTENT_KEYS);

/**
 * State Compose may project into the live renderer.
 *
 * Audio transport, editor preferences and runtime pause flags are deliberately
 * absent: a visual score must never pause its own clock or rewrite the editor.
 */
export const COMPOSE_RUNTIME_STATE_KEYS = Object.keys(
	FACTORY_DEFAULT_STATE
).filter(
	(key): key is keyof WallpaperState =>
		isFactoryLookKey(key) || contentKeys.has(key as keyof WallpaperState)
);

function assignKey(
	target: Partial<WallpaperState>,
	source: Readonly<WallpaperState>,
	key: keyof WallpaperState
): void {
	(target as Record<keyof WallpaperState, unknown>)[key] = source[key];
}

export function selectComposeRuntimeState(
	state: Readonly<WallpaperState>
): Partial<WallpaperState> {
	const selected: Partial<WallpaperState> = {};
	for (const key of COMPOSE_RUNTIME_STATE_KEYS) {
		assignKey(selected, state, key);
	}
	return selected;
}

/** Only emits keys whose value actually changed, keeping React work at cuts. */
export function buildComposeRuntimePatch(
	current: Readonly<WallpaperState>,
	resolved: Readonly<WallpaperState>
): Partial<WallpaperState> {
	const patch: Partial<WallpaperState> = {};
	for (const key of COMPOSE_RUNTIME_STATE_KEYS) {
		if (Object.is(current[key], resolved[key])) continue;
		assignKey(patch, resolved, key);
	}
	return patch;
}

/**
 * Restores session-local URLs stripped from the persisted Compose base.
 * Identity/configuration still comes from the frozen base; only bytes already
 * restored for the same asset in the live project are borrowed.
 */
export function hydrateComposeBaseState(
	base: Readonly<WallpaperState>,
	live: Readonly<WallpaperState>
): WallpaperState {
	const liveImages = new Map(
		live.backgroundImages.map(image => [image.assetId, image])
	);
	const backgroundImages = base.backgroundImages.map(image => {
		const liveImage = liveImages.get(image.assetId);
		return {
			...image,
			url: liveImage?.url ?? null,
			thumbnailUrl: liveImage?.thumbnailUrl ?? null
		};
	});
	const activeImage = backgroundImages.find(
		image => image.assetId === base.activeImageId
	);
	const liveOverlays = new Map(
		live.overlays.map(overlay => [overlay.id, overlay])
	);

	return {
		...base,
		backgroundImages,
		imageIds: backgroundImages.map(image => image.assetId),
		imageUrls: backgroundImages.flatMap(image =>
			image.url ? [image.url] : []
		),
		imageUrl: activeImage?.url ?? null,
		globalBackgroundUrl:
			base.globalBackgroundId === live.globalBackgroundId
				? live.globalBackgroundUrl
				: null,
		logoUrl: base.logoId === live.logoId ? live.logoUrl : null,
		overlays: base.overlays.map(overlay => ({
			...overlay,
			url: liveOverlays.get(overlay.id)?.url ?? null
		}))
	};
}

export function composeAssetUrlSignature(
	state: Readonly<WallpaperState>
): string {
	return JSON.stringify({
		images: state.backgroundImages.map(image => [image.assetId, image.url]),
		global: [state.globalBackgroundId, state.globalBackgroundUrl],
		logo: [state.logoId, state.logoUrl],
		overlays: state.overlays.map(overlay => [overlay.id, overlay.url])
	});
}

/** Persist the authored base, never the current playhead's projected frame. */
export function restoreComposeBaseForPersistence(
	state: WallpaperStore
): WallpaperStore {
	if (!state.composeEnabled || !state.composeBaseState) return state;
	return {
		...state,
		...selectComposeRuntimeState(state.composeBaseState)
	};
}
