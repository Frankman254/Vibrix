import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FACTORY_DEFAULT_STATE } from '@/store/factoryDefaults';
import {
	createAiDirectorSlice,
	createAudioPlaylistSlice,
	createAudioSlice,
	createAudioLyricsSlice,
	createBackgroundSlice,
	createCalibrationSlice,
	createLayoutSlice,
	createLogoSlice,
	createParticlesRainSlice,
	createSetlistsSlice,
	createStageCameraSlice,
	createSpectrumSlice,
	createSystemSlice
} from '@/store/storeSlices';
import { migrateWallpaperStore } from '@/store/wallpaperStoreMigrations';
import { partializeWallpaperStore } from '@/store/wallpaperStorePersistence';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import { STORE_PERSIST_VERSION } from '@/lib/version';
import { persistedStateWriter } from '@/store/persistedStateStorage';

/**
 * Scene state persists to IndexedDB, not localStorage.
 *
 * localStorage caps out around 5 MB, which a real project (a large image pool
 * plus its slots, scenes and setlists) reaches — and its failure mode is
 * invisible: the write throws, the session keeps running from memory, and the
 * work vanishes on reload. `indexedDbStorage` migrates an existing
 * localStorage state across on first read and falls back to localStorage when
 * IndexedDB is unavailable, so no install loses its project either way.
 *
 * Writes are debounced and coalesced on the way out (see
 * `createPersistedStateWriter`): dragging a slider used to serialize the whole
 * project on every frame, and once the quota was full it retried on every
 * mutation forever. Saving is therefore eventual — call `flushPersistedState()`
 * where a moment has to be committed immediately.
 *
 * Consequence to know about: IndexedDB is asynchronous, so hydration now
 * happens a tick after mount instead of during it. The store starts at factory
 * defaults for that tick — read `useWallpaperStore.persist.hasHydrated()` (or
 * `onFinishHydration`) anywhere that must not act on pre-hydration state.
 */
const safeStorage = persistedStateWriter.storage;

export const useWallpaperStore = create<WallpaperStore>()(
	persist(
		(set, get, api) => ({
			...FACTORY_DEFAULT_STATE,
			...createBackgroundSlice(set, get, api),
			...createAudioSlice(set, get, api),
			...createAudioLyricsSlice(set, get, api),
			...createAudioPlaylistSlice(set, get, api),
			...createLayoutSlice(set, get, api),
			...createSpectrumSlice(set, get, api),
			...createLogoSlice(set, get, api),
			...createParticlesRainSlice(set, get, api),
			...createSystemSlice(set, get, api),
			...createCalibrationSlice(set, get, api),
			...createSetlistsSlice(set, get, api),
			...createStageCameraSlice(set, get, api),
			...createAiDirectorSlice(set, get, api)
		}),
		{
			name: 'vibrix-state',
			version: STORE_PERSIST_VERSION,
			migrate: migrateWallpaperStore,
			partialize: partializeWallpaperStore,
			storage: createJSONStorage(() => safeStorage)
		}
	)
);

export type { WallpaperStore } from '@/store/wallpaperStoreTypes';
