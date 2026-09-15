import { DEFAULT_STATE } from '@/store/defaultState';
import {
	analyzeImageUrlSaliency,
	loadImageDimensions,
	suggestBackgroundAutoFit
} from '@/features/background';
import {
	lowMassBoxToLogoPosition,
	logoBoxSizeForViewport
} from '@/features/logo';
import { lowestMassBox } from '@/lib/saliency';
import { createBackgroundImageItem } from '@/features/background/backgroundImages';
import {
	buildSceneSlotActivationPatch,
	createSceneSlotId,
	normalizeSceneSlotAgainstState,
	resolveEffectiveSceneSlotId
} from '@/features/scenes/sceneSlot';
import { createVisualTransitionSnapshot } from '@/features/visualTransition/visualTransitionCoordinator';
import { invalidateSpectrumPresetMorph } from '@/features/spectrum';
import {
	applyActiveImageConfigToDefaultImages,
	buildBackgroundImageCollectionPatch,
	moveBackgroundImageItem,
	shuffleBackgroundImages
} from '@/store/backgroundStoreUtils';
import {
	buildActiveImageSelectionPatch,
	buildCoveredAutoFitPatch
} from '@/store/activeImageSelection';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import type { StateCreator } from 'zustand';

type WallpaperSet = Parameters<StateCreator<WallpaperStore>>[0];
type WallpaperGet = Parameters<StateCreator<WallpaperStore>>[1];

function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/**
 * Re-applies the ACTIVE image's effective scene and emits a smooth visual
 * transition for the changed subsystems. Call after any change that can alter
 * the active image's effective scene (assign a scene, use default, change the
 * default scene). Pass the already-updated state. Returns an additive patch to
 * merge into the action result; `{}` when there is no active image, and just an
 * `activeSceneSlotId: null` marker when the image resolves to no scene (base
 * visual is left untouched — the safe fallback).
 */
function buildActiveImageSceneReapplyPatch(
	state: WallpaperStore
): Partial<WallpaperStore> {
	const active = state.backgroundImages.find(
		img => img.assetId === state.activeImageId
	);
	if (!active) return {};
	const { sceneSlotId } = resolveEffectiveSceneSlotId(active, state);
	const scene = sceneSlotId
		? state.sceneSlots.find(s => s.id === sceneSlotId)
		: undefined;
	if (!scene) return { activeSceneSlotId: null };
	invalidateSpectrumPresetMorph();
	const normalized = normalizeSceneSlotAgainstState(scene, state);
	const patch: Partial<WallpaperStore> = {
		...buildSceneSlotActivationPatch(state, normalized),
		activeSceneSlotId: scene.id
	};
	patch.visualTransition = createVisualTransitionSnapshot({
		state,
		patch,
		toImageId: state.activeImageId ?? null,
		prefersReducedMotion: prefersReducedMotion()
	});
	return patch;
}

export function createBackgroundCollectionActions(
	set: WallpaperSet,
	get: WallpaperGet
) {
	/**
	 * Keep Covered is per-image, but the covering scale is viewport-dependent:
	 * refit the active image with auto-fit's domain logic. Skips when
	 * coverageFramingEdited; race-safe (aborts if active image/lock change during load).
	 */
	async function autoFitCoveredActiveImage(): Promise<void> {
		const state = get();
		const activeId = state.activeImageId;
		if (!activeId || !state.imageCoverageLockEnabled) return;
		const image = state.backgroundImages.find(
			img => img.assetId === activeId
		);
		if (!image?.url || image.coverageFramingEdited) return;
		try {
			const imageSize = await loadImageDimensions(image.url);
			const viewport =
				typeof window === 'undefined'
					? { width: 1920, height: 1080 }
					: { width: window.innerWidth, height: window.innerHeight };
			const current = get();
			if (current.activeImageId !== activeId) return;
			const patch = buildCoveredAutoFitPatch(
				current,
				imageSize,
				viewport
			);
			if (patch) set(patch);
		} catch {
			// Dimension load failed: leave the composition as-is. The
			// renderer-side coverage clamp still guarantees full-bleed.
		}
	}

	return {
		setImagePlaybackSwitchAt: v =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === state.activeImageId
						? { ...img, playbackSwitchAt: v }
						: img
				)
			})),
		setBackgroundImagePlaybackSwitchAt: (assetId, v) =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img =>
					img.assetId === assetId
						? { ...img, playbackSwitchAt: v }
						: img
				)
			})),
		resetAllManualTimestamps: () =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(img => ({
					...img,
					playbackSwitchAt: null
				}))
			})),
		setActiveImageId: id => {
			set(state => {
				const { patch, appliedScene } = buildActiveImageSelectionPatch(
					state,
					id
				);
				if (appliedScene) invalidateSpectrumPresetMorph();
				patch.visualTransition = createVisualTransitionSnapshot({
					state,
					patch,
					toImageId: patch.activeImageId ?? null,
					prefersReducedMotion: prefersReducedMotion()
				});
				return patch;
			});
			// Keep Covered: the stored composition may not cover this viewport.
			void autoFitCoveredActiveImage();
		},
		applyActiveImageConfigToDefaultImages: () =>
			set(state => applyActiveImageConfigToDefaultImages(state)),
		moveImageEntry: (id, direction) =>
			set(state => {
				const backgroundImages = moveBackgroundImageItem(
					state.backgroundImages,
					id,
					direction
				);
				if (backgroundImages === state.backgroundImages) return state;
				return buildBackgroundImageCollectionPatch(
					state,
					backgroundImages,
					state.activeImageId
				);
			}),
		moveImageEntryToIndex: (id, targetIndex) =>
			set(state => {
				const sourceIndex = state.backgroundImages.findIndex(
					image => image.assetId === id
				);
				if (sourceIndex < 0) return state;
				const clamped = Math.max(
					0,
					Math.min(state.backgroundImages.length - 1, targetIndex)
				);
				if (clamped === sourceIndex) return state;
				const next = [...state.backgroundImages];
				const [moved] = next.splice(sourceIndex, 1);
				if (!moved) return state;
				next.splice(clamped, 0, moved);
				return buildBackgroundImageCollectionPatch(
					state,
					next,
					state.activeImageId
				);
			}),
		setBackgroundImageEntryEnabled: (assetId, enabled) =>
			set(state => {
				const target = state.backgroundImages.find(
					image => image.assetId === assetId
				);
				if (!target || target.enabled === enabled) return state;
				const backgroundImages = state.backgroundImages.map(image =>
					image.assetId === assetId ? { ...image, enabled } : image
				);
				// If we just disabled the active image, jump to the next one
				// that's still enabled (and has a usable url). If none remain,
				// keep activeImageId so the user can re-enable later without
				// losing their selection context.
				let nextActiveImageId = state.activeImageId;
				if (!enabled && state.activeImageId === assetId) {
					const startIndex = backgroundImages.findIndex(
						image => image.assetId === assetId
					);
					const ordered = [
						...backgroundImages.slice(startIndex + 1),
						...backgroundImages.slice(0, startIndex)
					];
					const nextEnabled = ordered.find(
						image => image.enabled && image.url
					);
					if (nextEnabled) nextActiveImageId = nextEnabled.assetId;
				}
				return buildBackgroundImageCollectionPatch(
					state,
					backgroundImages,
					nextActiveImageId
				);
			}),
		shuffleImageEntries: () =>
			set(state => {
				const backgroundImages = shuffleBackgroundImages(
					state.backgroundImages
				);
				if (backgroundImages === state.backgroundImages) return state;
				return buildBackgroundImageCollectionPatch(
					state,
					backgroundImages,
					state.activeImageId
				);
			}),
		setImageUrls: v =>
			set(state => {
				if (v.length === 0) {
					return {
						imageIds: [],
						imageUrls: [],
						backgroundImages: [],
						activeImageId: null,
						imageUrl: null
					};
				}

				const backgroundImages = state.backgroundImages
					.map((image, index) => ({
						...image,
						url: v[index] ?? null
					}))
					.filter(image => image.url !== null);

				return buildBackgroundImageCollectionPatch(
					state,
					backgroundImages,
					state.activeImageId
				);
			}),
		autoFitAllImages: async () => {
			const state = get();
			if (state.backgroundImages.length === 0) return;
			const viewportWidth =
				typeof window === 'undefined' ? 1920 : window.innerWidth;
			const viewportHeight =
				typeof window === 'undefined' ? 1080 : window.innerHeight;
			const activeSetlist = state.activeSetlistId
				? state.setlists.find(
						setlist => setlist.id === state.activeSetlistId
					)
				: null;
			const scopedImageIds = activeSetlist
				? new Set(activeSetlist.imageAssetIds)
				: null;

			const nextImages = await Promise.all(
				state.backgroundImages.map(async image => {
					if (scopedImageIds && !scopedImageIds.has(image.assetId)) {
						return image;
					}
					if (!image.url) return image;

					try {
						const { width, height } = await loadImageDimensions(
							image.url
						);
						const suggestion = suggestBackgroundAutoFit(
							viewportWidth,
							viewportHeight,
							width,
							height,
							image.rotation,
							image.mirrorFill ? (image.mirrorFillCount ?? 0) : 0
						);
						return {
							...image,
							scale: suggestion.scale,
							fitMode: suggestion.fitMode,
							positionX: suggestion.positionX,
							positionY: suggestion.positionY,
							focusX: 0.5,
							focusY: 0.5,
							// Explicit user auto-fit: the composition is machine-
							// owned again, so autofitCoveredActiveImage may manage it.
							coverageFramingEdited: false
						};
					} catch {
						return image;
					}
				})
			);
			set(current =>
				buildBackgroundImageCollectionPatch(
					current,
					nextImages,
					current.activeImageId
				)
			);
		},
		autoFitCoveredActiveImage,
		autoFocusActiveImage: async () => {
			const state = get();
			const activeId = state.activeImageId;
			const active = state.backgroundImages.find(
				image => image.assetId === activeId
			);
			if (!active?.url) return;
			let summary;
			try {
				summary = await analyzeImageUrlSaliency(active.url);
			} catch {
				// Image unloadable: leave the focus point untouched.
				return;
			}
			set(current => {
				if (current.activeImageId !== activeId) return {};
				const focusX = summary.focus.x;
				const focusY = summary.focus.y;
				// Mirrors the manual focus control: focus is user intent, so the
				// framing counts as hand-edited and covered auto-fit won't reset it.
				const backgroundImages = current.backgroundImages.map(image =>
					image.assetId === activeId
						? {
								...image,
								focusX,
								focusY,
								coverageFramingEdited: true
							}
						: image
				);
				return buildBackgroundImageCollectionPatch(
					current,
					backgroundImages,
					activeId
				);
			});
		},
		autoFocusAllImages: async () => {
			const state = get();
			if (state.backgroundImages.length === 0) return;
			const activeSetlist = state.activeSetlistId
				? state.setlists.find(
						setlist => setlist.id === state.activeSetlistId
					)
				: null;
			const scopedImageIds = activeSetlist
				? new Set(activeSetlist.imageAssetIds)
				: null;

			const nextImages = await Promise.all(
				state.backgroundImages.map(async image => {
					if (scopedImageIds && !scopedImageIds.has(image.assetId)) {
						return image;
					}
					if (!image.url) return image;
					try {
						const summary = await analyzeImageUrlSaliency(
							image.url
						);
						return {
							...image,
							focusX: summary.focus.x,
							focusY: summary.focus.y,
							// Focus is user intent: mark framing edited so the
							// covered auto-fit patch never recenters it on resize.
							coverageFramingEdited: true
						};
					} catch {
						return image;
					}
				})
			);
			set(current =>
				buildBackgroundImageCollectionPatch(
					current,
					nextImages,
					current.activeImageId
				)
			);
		},
		autoPlaceLogoForActiveImage: async () => {
			const state = get();
			const activeId = state.activeImageId;
			const active = state.backgroundImages.find(
				image => image.assetId === activeId
			);
			if (!active?.url) return;
			const viewportWidth =
				typeof window === 'undefined' ? 1920 : window.innerWidth;
			const viewportHeight =
				typeof window === 'undefined' ? 1080 : window.innerHeight;
			try {
				const summary = await analyzeImageUrlSaliency(active.url);
				const boxSize = logoBoxSizeForViewport(
					state.logoBaseSize,
					viewportWidth,
					viewportHeight
				);
				const box = lowestMassBox(summary.grid, boxSize);
				const pos = lowMassBoxToLogoPosition(box);
				set(current =>
					current.activeImageId === activeId
						? { logoPositionX: pos.x, logoPositionY: pos.y }
						: {}
				);
			} catch {
				// Image unloadable: keep the current logo placement.
			}
		},
		addImageEntry: (
			id,
			url,
			thumbnailUrl = null,
			originalFileName = null
		) =>
			set(state => {
				const existing = [...state.backgroundImages]
					.reverse()
					.find(image => image.assetId === id);
				const backgroundImage = existing
					? {
							...existing,
							url,
							thumbnailUrl: thumbnailUrl ?? existing.thumbnailUrl,
							originalFileName:
								originalFileName ?? existing.originalFileName
						}
					: createBackgroundImageItem(id, url, thumbnailUrl, {
							originalFileName
						});
				let didInsert = false;
				const backgroundImages = state.backgroundImages.flatMap(
					image => {
						if (image.assetId !== id) return [image];
						if (didInsert) return [];
						didInsert = true;
						return [backgroundImage];
					}
				);
				if (!didInsert) backgroundImages.push(backgroundImage);
				const nextActiveImageId = state.activeImageId ?? id;
				return buildBackgroundImageCollectionPatch(
					state,
					backgroundImages,
					nextActiveImageId
				);
			}),
		setImageThumbnailUrl: (id, thumbnailUrl) =>
			set(state => {
				let didUpdate = false;
				const backgroundImages = state.backgroundImages.map(image => {
					if (
						image.assetId !== id ||
						image.thumbnailUrl === thumbnailUrl
					) {
						return image;
					}

					didUpdate = true;
					return {
						...image,
						thumbnailUrl
					};
				});

				return didUpdate ? { backgroundImages } : state;
			}),
		removeImageEntry: id =>
			set(state => {
				if (!state.backgroundImages.some(image => image.assetId === id))
					return state;
				const backgroundImages = state.backgroundImages.filter(
					image => image.assetId !== id
				);
				const nextActiveImageId =
					state.activeImageId === id
						? (backgroundImages[0]?.assetId ?? null)
						: state.activeImageId;
				return buildBackgroundImageCollectionPatch(
					state,
					backgroundImages,
					nextActiveImageId
				);
			}),
		addOverlay: overlay =>
			set(state => ({
				overlays: [...state.overlays, overlay],
				selectedOverlayId: overlay.id
			})),
		updateOverlay: (id, patch) =>
			set(state => ({
				overlays: state.overlays.map(overlay =>
					overlay.id === id ? { ...overlay, ...patch } : overlay
				)
			})),
		removeOverlay: id =>
			set(state => {
				const overlays = state.overlays.filter(
					overlay => overlay.id !== id
				);
				return {
					overlays,
					selectedOverlayId:
						state.selectedOverlayId === id
							? (overlays[0]?.id ?? null)
							: state.selectedOverlayId
				};
			}),
		setSelectedOverlayId: id => set({ selectedOverlayId: id }),
		setBackgroundImageSceneSlotId: (assetId, sceneSlotId) =>
			set(state => {
				const backgroundImages = state.backgroundImages.map(image =>
					image.assetId === assetId
						? { ...image, sceneSlotId }
						: image
				);
				const result: Partial<WallpaperStore> = { backgroundImages };
				// Re-apply + transition only when the change affects the live image.
				if (assetId === state.activeImageId) {
					Object.assign(
						result,
						buildActiveImageSceneReapplyPatch({
							...state,
							backgroundImages
						})
					);
				}
				return result;
			}),
		assignSceneToImage: (assetId, sceneSlotId) =>
			get().setBackgroundImageSceneSlotId(assetId, sceneSlotId),
		setImageUseDefaultScene: assetId =>
			get().setBackgroundImageSceneSlotId(assetId, null),
		setDefaultSceneSlot: sceneSlotId =>
			set(state => {
				if (
					sceneSlotId !== null &&
					!state.sceneSlots.some(s => s.id === sceneSlotId)
				) {
					return state;
				}
				const result: Partial<WallpaperStore> = {
					defaultSceneSlotId: sceneSlotId
				};
				// Images that ride the default scene need a live re-apply.
				const active = state.backgroundImages.find(
					img => img.assetId === state.activeImageId
				);
				const usesDefault =
					active != null &&
					!state.sceneSlots.some(s => s.id === active.sceneSlotId);
				if (usesDefault) {
					Object.assign(
						result,
						buildActiveImageSceneReapplyPatch({
							...state,
							defaultSceneSlotId: sceneSlotId
						})
					);
				}
				return result;
			}),
		clearDefaultSceneSlot: () => get().setDefaultSceneSlot(null),
		duplicateScene: sceneSlotId =>
			set(state => {
				const source = state.sceneSlots.find(s => s.id === sceneSlotId);
				if (!source) return state;
				const copy = {
					...source,
					id: createSceneSlotId(),
					name: `${source.name} copy`
				};
				return { sceneSlots: [...state.sceneSlots, copy] };
			}),
		resetSceneSlotBindings: () =>
			set(state => ({
				activeSceneSlotId: DEFAULT_STATE.activeSceneSlotId,
				backgroundImages: state.backgroundImages.map(img => ({
					...img,
					sceneSlotId: null
				}))
			}))
	} satisfies Partial<WallpaperStore>;
}
