import type { StateCreator } from 'zustand';
import type { Setlist, WallpaperState } from '@/types/wallpaper';
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

type IntroWindowState = Pick<
	WallpaperState,
	'introSequence' | 'outroSequence' | 'setlistIntroFallback'
>;

/**
 * The intro / ending a given setlist puts on screen, and what to do with the
 * project's own windows while it does.
 *
 * A setlist is a curation, not a destructive edit: deactivating one reveals
 * the whole pool again, and its intro obeys the same rule. So activating a
 * setlist bound to an intro slot PARKS the project's windows in
 * `setlistIntroFallback` before installing the slot's, and anything that
 * leaves a bound setlist — deactivating, switching to an unbound one, deleting
 * it, unbinding the slot — puts them back and clears the park.
 *
 * Parking only ever happens once: switching straight from one bound setlist to
 * another must not overwrite the project's windows with the first setlist's.
 *
 * Every entry point routes through here, because the three bugs this closes
 * were three call sites that each handled a different part of it.
 */
function resolveSetlistIntroWindows(
	state: IntroWindowState & Pick<WallpaperState, 'introProfileSlots'>,
	setlist: Setlist | null
): Partial<IntroWindowState> {
	const bound = setlist?.introSlotId
		? (state.introProfileSlots.find(slot => slot.id === setlist.introSlotId)
				?.values ?? null)
		: null;

	if (!bound) {
		// Unbound, or no setlist at all: restore whatever was parked. With
		// nothing parked the windows are already the project's own.
		if (!state.setlistIntroFallback) return {};
		return {
			introSequence: { ...state.setlistIntroFallback.introSequence },
			outroSequence: { ...state.setlistIntroFallback.outroSequence },
			setlistIntroFallback: null
		};
	}

	return {
		introSequence: { ...bound.introSequence },
		outroSequence: { ...bound.outroSequence },
		setlistIntroFallback: state.setlistIntroFallback ?? {
			introSequence: { ...state.introSequence },
			outroSequence: { ...state.outroSequence }
		}
	};
}

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
					state.activeSetlistId === id ? null : state.activeSetlistId,
				// Deleting the show that installed its intro leaves the
				// project's own windows behind, same as deactivating it.
				...(state.activeSetlistId === id
					? resolveSetlistIntroWindows(state, null)
					: {})
			})),
		setActiveSetlistId: (id: string | null) =>
			set(state => {
				const setlist =
					id === null
						? null
						: (state.setlists.find(s => s.id === id) ?? null);
				if (!setlist) {
					return {
						activeSetlistId: null,
						...resolveSetlistIntroWindows(state, null)
					};
				}
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
				// ending: activating it loads the intro slot it is bound to
				// and parks the project's own. Unbound, the project's windows
				// come back.
				return {
					activeSetlistId: setlist.id,
					activeImageId: nextActiveImageId,
					activeAudioTrackId: nextActiveAudioTrackId,
					...resolveSetlistIntroWindows(state, setlist)
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
			set(state => {
				const setlists = state.setlists.map(s =>
					s.id === setlistId ? { ...s, introSlotId: slotId } : s
				);
				// Binding is only ever offered for the ACTIVE setlist, so it
				// has to take effect now — recording the id and waiting for a
				// deactivate/reactivate round trip looked like a dead control.
				if (state.activeSetlistId !== setlistId) return { setlists };
				const bound = setlists.find(s => s.id === setlistId) ?? null;
				return {
					setlists,
					...resolveSetlistIntroWindows(state, bound)
				};
			}),
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
