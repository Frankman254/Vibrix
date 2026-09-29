import type { StateCreator } from 'zustand';
import type { Setlist } from '@/types/wallpaper';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];
type WallpaperGet = Parameters<StateCreator<WallpaperStore>>[1];
type WallpaperApi = Parameters<StateCreator<WallpaperStore>>[2];

/**
 * Setlists slice — named curations of the global image pool + audio
 * playlist. The library is global; setlists store ID references.
 *
 * Activation behavior (engine + UI both honor this):
 *   - `activeSetlistId == null` → app shows the full pool/playlist
 *     (legacy behavior).
 *   - `activeSetlistId == X`    → pool, playlist, slideshow cycle, audio
 *     auto-advance ALL filter to only the items listed in setlist X.
 *
 * Setlists are NOT destructive — deactivating reveals the full pool again.
 * Deleting an underlying image/track that is referenced by a setlist is
 * tolerated: the dangling id is just ignored at filter time (handled in
 * the engine/UI selectors).
 */

const MAX_SETLISTS = 100;

function makeId(): string {
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID();
	}
	return `setlist-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2, 8)}`;
}

function defaultSetlistName(existing: Setlist[]): string {
	let index = existing.length + 1;
	// Avoid duplicates if the user has deleted middle entries — keep
	// incrementing until we find a free "Setlist N".
	while (existing.some(s => s.name === `Setlist ${index}`)) index += 1;
	return `Setlist ${index}`;
}

function makeSetlist(name: string): Setlist {
	return {
		id: makeId(),
		name,
		imageAssetIds: [],
		trackIds: [],
		createdAt: Date.now()
	};
}

function toggleId(list: string[], id: string): string[] {
	const index = list.indexOf(id);
	if (index >= 0) {
		const next = list.slice();
		next.splice(index, 1);
		return next;
	}
	return [...list, id];
}

export function createSetlistsSlice(
	set: WallpaperSet,
	_get: WallpaperGet,
	_api: WallpaperApi
) {
	return {
		addSetlist: (name?: string): string => {
			const id = makeId();
			set(state => {
				if (state.setlists.length >= MAX_SETLISTS) return state;
				const finalName =
					name?.trim() || defaultSetlistName(state.setlists);
				const setlist: Setlist = {
					id,
					name: finalName,
					imageAssetIds: [],
					trackIds: [],
					createdAt: Date.now()
				};
				return {
					setlists: [...state.setlists, setlist]
				};
			});
			return id;
		},
		renameSetlist: (id: string, name: string) =>
			set(state => ({
				setlists: state.setlists.map(s =>
					s.id === id ? { ...s, name: name.trim() || s.name } : s
				)
			})),
		deleteSetlist: (id: string) =>
			set(state => ({
				setlists: state.setlists.filter(s => s.id !== id),
				// Auto-deactivate if the deleted setlist was active to avoid
				// the engine pointing at a phantom id.
				activeSetlistId:
					state.activeSetlistId === id ? null : state.activeSetlistId
			})),
		setActiveSetlistId: (id: string | null) =>
			set(state => {
				if (id === null) return { activeSetlistId: null };
				const setlist = state.setlists.find(s => s.id === id);
				if (!setlist) return { activeSetlistId: null };
				// If the currently-active image or track isn't a member of
				// the newly-activated setlist, snap to the first member so
				// the user doesn't land on a hidden item.
				const imageMembers = new Set(setlist.imageAssetIds);
				const trackMembers = new Set(setlist.trackIds);
				const nextActiveImageId =
					state.activeImageId && imageMembers.has(state.activeImageId)
						? state.activeImageId
						: (setlist.imageAssetIds[0] ?? null);
				const nextActiveAudioTrackId =
					state.activeAudioTrackId &&
					trackMembers.has(state.activeAudioTrackId)
						? state.activeAudioTrackId
						: (setlist.trackIds[0] ?? null);
				// A setlist is a show, so it may carry its own opening and
				// ending: activating it loads the intro slot it is bound to.
				// Unbound (the default) the windows are left exactly as
				// configured globally.
				const boundIntro = setlist.introSlotId
					? state.introProfileSlots.find(
							slot => slot.id === setlist.introSlotId
						)?.values
					: null;
				return {
					activeSetlistId: id,
					activeImageId: nextActiveImageId,
					activeAudioTrackId: nextActiveAudioTrackId,
					...(boundIntro
						? {
								introSequence: { ...boundIntro.introSequence },
								outroSequence: { ...boundIntro.outroSequence }
							}
						: {})
				};
			}),
		toggleSetlistImage: (id: string, assetId: string) =>
			set(state => ({
				setlists: state.setlists.map(s =>
					s.id === id
						? {
								...s,
								imageAssetIds: toggleId(
									s.imageAssetIds,
									assetId
								)
							}
						: s
				)
			})),
		toggleSetlistTrack: (id: string, trackId: string) =>
			set(state => ({
				setlists: state.setlists.map(s =>
					s.id === id
						? { ...s, trackIds: toggleId(s.trackIds, trackId) }
						: s
				)
			})),
		setSetlistImages: (id: string, assetIds: string[]) =>
			set(state => ({
				setlists: state.setlists.map(s =>
					s.id === id ? { ...s, imageAssetIds: [...assetIds] } : s
				)
			})),
		setSetlistTracks: (id: string, trackIds: string[]) =>
			set(state => ({
				setlists: state.setlists.map(s =>
					s.id === id ? { ...s, trackIds: [...trackIds] } : s
				)
			})),
		bindSetlistIntroSlot: (setlistId: string, slotId: string | null) =>
			set(state => ({
				setlists: state.setlists.map(s =>
					s.id === setlistId ? { ...s, introSlotId: slotId } : s
				)
			})),
		setShowSetlistHud: (v: boolean) => set({ showSetlistHud: v })
	} satisfies Partial<WallpaperStore>;
}

// Exported helpers that read the active setlist's filter — used by engine
// and UI selectors so the logic stays single-source.

export function getActiveSetlist(
	setlists: Setlist[],
	activeSetlistId: string | null
): Setlist | null {
	if (!activeSetlistId) return null;
	return setlists.find(s => s.id === activeSetlistId) ?? null;
}

export function filterImageIdsBySetlist<T extends { assetId: string }>(
	images: T[],
	setlists: Setlist[],
	activeSetlistId: string | null
): T[] {
	const active = getActiveSetlist(setlists, activeSetlistId);
	if (!active) return images;
	const byId = new Map(images.map(img => [img.assetId, img]));
	return active.imageAssetIds
		.map(assetId => byId.get(assetId))
		.filter((img): img is T => img != null);
}

export function filterTrackIdsBySetlist<T extends { id: string }>(
	tracks: T[],
	setlists: Setlist[],
	activeSetlistId: string | null
): T[] {
	const active = getActiveSetlist(setlists, activeSetlistId);
	if (!active) return tracks;
	const byId = new Map(tracks.map(track => [track.id, track]));
	return active.trackIds
		.map(trackId => byId.get(trackId))
		.filter((track): track is T => track != null);
}

// Re-export to keep imports tidy elsewhere — `makeSetlist` is mostly for tests.
export { defaultSetlistName, makeSetlist, MAX_SETLISTS };
