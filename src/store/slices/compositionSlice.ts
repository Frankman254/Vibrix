import type { StateCreator } from 'zustand';
import type { VibrixScoreEnvelope } from '@/features/composition/vibrixScore';
import { FACTORY_DEFAULT_STATE } from '@/store/factoryDefaults';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import type { WallpaperState } from '@/types/wallpaper';

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];
type WallpaperGet = Parameters<StateCreator<WallpaperStore>>[1];
type WallpaperApi = Parameters<StateCreator<WallpaperStore>>[2];

const WALLPAPER_STATE_KEYS = Object.keys(FACTORY_DEFAULT_STATE) as Array<
	keyof WallpaperState
>;

function cloneValue<T>(value: T): T {
	if (typeof structuredClone === 'function') return structuredClone(value);
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Captures the document Compose evaluates from without retaining live asset
 * URLs or an animation already in flight. Asset ids remain, so W3 can hydrate
 * the runtime URLs from the live project without changing this authored base.
 */
export function captureComposeBaseState(state: WallpaperStore): WallpaperState {
	const base = {} as WallpaperState;
	for (const key of WALLPAPER_STATE_KEYS) {
		(base as unknown as Record<string, unknown>)[key] = cloneValue(
			state[key]
		);
	}

	base.imageUrl = null;
	base.imageUrls = [];
	base.globalBackgroundUrl = null;
	base.logoUrl = null;
	base.visualTransition = null;
	base.backgroundImages = base.backgroundImages.map(image => ({
		...image,
		url: null,
		thumbnailUrl: null
	}));
	base.overlays = base.overlays.map(overlay => ({ ...overlay, url: null }));
	return base;
}

export function createCompositionSlice(
	set: WallpaperSet,
	_get: WallpaperGet,
	_api: WallpaperApi
) {
	return {
		composeScore: null,
		composeBaseState: null,
		composeEnabled: false,
		stageComposeScore: (score: VibrixScoreEnvelope) =>
			set(state => ({
				composeScore: cloneValue(score),
				composeBaseState: captureComposeBaseState(state),
				composeEnabled: false
			})),
		setComposeEnabled: (enabled: boolean) =>
			set(state => ({
				composeEnabled:
					enabled && state.composeScore && state.composeBaseState
						? true
						: false
			})),
		clearComposeSession: () =>
			set({
				composeScore: null,
				composeBaseState: null,
				composeEnabled: false
			})
	} satisfies Partial<WallpaperStore>;
}
