import { DEFAULT_STATE } from '@/store/defaultState';
import {
	analyzeImageUrlFocus,
	analyzeImageUrlSaliency,
	loadImageDimensions
} from '@/features/background';
import {
	imagePointToLogoPosition,
	lowMassBoxToLogoPosition,
	logoBoxSizeForViewport,
	spectrumAnnulusInImageSpace
} from '@/features/logo';
import { bestPlacementBox, type SaliencyAvoidRegion } from '@/lib/saliency';
import {
	resolveSpectrumPlacement,
	resolveScaledSpectrumSettings
} from '@/features/spectrum';
import { resolveResponsiveSpectrumSettings } from '@/features/layout/responsiveLayout';
import { resolveImageTransform } from '@/features/background';
import type { BackgroundImageItem } from '@/types/wallpaper';
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
	shuffleBackgroundImages,
	syncActiveBackgroundImage
} from '@/store/backgroundStoreUtils';
import {
	buildActiveImageSelectionPatch,
	buildCoveredAutoFitPatch,
	buildCoverFitAllImagesPatch,
	buildCoverFitPatch
} from '@/store/activeImageSelection';
import type {
	MarkNextSwitchResult,
	WallpaperStore
} from '@/store/wallpaperStoreTypes';
import { resolveSlideshowPool } from '@/features/background/slideshow/slideshowPlayback';
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
 * The radial spectrum figure as an exclusion zone in image space, or `null`
 * when nothing is to be avoided (no image geometry, linear mode, or the
 * spectrum is off). Mirrors the preview's settings pipeline exactly:
 * per-image override → responsive px scaling → user Scale → Follow-Logo
 * placement.
 */
function buildSpectrumAvoidRegion(params: {
	state: WallpaperStore;
	image: BackgroundImageItem;
	imageWidth: number;
	imageHeight: number;
	viewportWidth: number;
	viewportHeight: number;
}): SaliencyAvoidRegion | null {
	const { state, image, viewportWidth, viewportHeight } = params;
	if (image.rotation !== 0) return null; // mapping is rotation-naive
	const effective = {
		...state,
		...(image.logoOverride ?? {}),
		...(image.spectrumOverride ?? {})
	} as WallpaperStore;
	if (!effective.spectrumEnabled) return null;
	if (effective.spectrumMode !== 'radial') return null;
	const responsiveSpectrum = resolveResponsiveSpectrumSettings(
		{
			layoutResponsiveEnabled: effective.layoutResponsiveEnabled,
			layoutReferenceWidth: effective.layoutReferenceWidth,
			layoutReferenceHeight: effective.layoutReferenceHeight,
			spectrumLogoGap: effective.spectrumLogoGap,
			spectrumInnerRadius: effective.spectrumInnerRadius,
			spectrumBarWidth: effective.spectrumBarWidth,
			spectrumMinHeight: effective.spectrumMinHeight,
			spectrumMaxHeight: effective.spectrumMaxHeight,
			spectrumShadowBlur: effective.spectrumShadowBlur,
			spectrumOscilloscopeLineWidth:
				effective.spectrumOscilloscopeLineWidth
		},
		viewportWidth,
		viewportHeight
	);
	const placement = resolveSpectrumPlacement(
		{
			...effective,
			// The placement resolver wants the RESPONSIVE px values, like the
			// stage does.
			spectrumLogoGap: responsiveSpectrum.spectrumLogoGap,
			spectrumInnerRadius: responsiveSpectrum.spectrumInnerRadius
		},
		{ logoScale: Math.max(effective.logoMinScale, 0.75) }
	);
	// Follow-Logo: the ring is always drawn at the logo wherever it goes, so
	// an exclusion zone centered on the logo is self-referential. No avoid.
	if (placement.followLogoEffective) return null;
	const scaled = resolveScaledSpectrumSettings({
		...effective,
		...responsiveSpectrum,
		spectrumInnerRadius: placement.spectrumInnerRadius
	});
	const primary = resolveImageTransform({
		viewportWidth,
		viewportHeight,
		imageWidth: params.imageWidth,
		imageHeight: params.imageHeight,
		fitMode: image.fitMode,
		scale: image.scale,
		positionX: image.positionX,
		positionY: image.positionY,
		rotation: image.rotation,
		mirror: image.mirror,
		// The rect the RENDERER uses: with manual framing on there is no
		// coverage raise, so measuring against a covered rect would put the
		// exclusion zone somewhere nothing is drawn.
		keepCovered: !image.framingManual,
		focusX: image.focusX,
		focusY: image.focusY,
		mirrorFill: image.mirrorFill,
		mirrorFillInvert: image.mirrorFillInvert,
		mirrorFillCount: image.mirrorFillCount,
		layout: effective
	}).drawRects[0];
	if (!primary) return null;
	return spectrumAnnulusInImageSpace({
		spectrumPositionX: placement.spectrumPositionX,
		spectrumPositionY: placement.spectrumPositionY,
		innerRadius: scaled.spectrumInnerRadius,
		maxHeight: scaled.spectrumMaxHeight,
		viewportWidth,
		viewportHeight,
		imageRect: primary
	});
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
	/** The viewport the composition is framed against (see callers). */
	function stageViewport(): { width: number; height: number } {
		// Same window-fallback pattern the auto-placement actions use; the
		// renderer draws against the same css size (record render scale only
		// affects the canvas backing store, not the composition viewport).
		return typeof window === 'undefined'
			? { width: 1920, height: 1080 }
			: { width: window.innerWidth, height: window.innerHeight };
	}

	/**
	 * Coverage is unconditional: refit the active image with the passive
	 * raise-only auto-fit domain logic. Skips when coverageFramingEdited;
	 * race-safe (aborts if the active image changes during load).
	 */
	async function autoFitCoveredActiveImage(): Promise<void> {
		const state = get();
		const activeId = state.activeImageId;
		if (!activeId || state.imageFramingManualEnabled) return;
		const image = state.backgroundImages.find(
			img => img.assetId === activeId
		);
		if (!image?.url || image.coverageFramingEdited) return;
		try {
			const imageSize = await loadImageDimensions(image.url);
			const viewport = stageViewport();
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

	/**
	 * The explicit Cover Fit of the active image (exact covered framing, the
	 * hand-tuned provenance cleared). Named because both the Cover Fit button
	 * and leaving manual framing mode run it.
	 */
	async function coverFitActiveImage(): Promise<void> {
		const state = get();
		const activeId = state.activeImageId;
		const image = state.backgroundImages.find(
			img => img.assetId === activeId
		);
		if (!image?.url) return;
		try {
			const imageSize = await loadImageDimensions(image.url);
			const viewport = stageViewport();
			const current = get();
			if (current.activeImageId !== activeId) return;
			const patch = buildCoverFitPatch(current, imageSize, viewport);
			if (patch) set(patch);
		} catch {
			// Dimension load failed: leave the composition as-is. The
			// renderer-side coverage clamp still guarantees full-bleed.
		}
	}

	return {
		// The switch always hands the user the exact covered framing, in BOTH
		// directions, and it does it now instead of waiting for the next viewport
		// change:
		// - OFF gives the composition back to the coverage math, so it has to
		//   show its effect immediately.
		// - ON stops the render-time coverage raise, so whatever was stored is
		//   suddenly what is drawn. Seeding the cover fit is what makes manual
		//   mode START at the minimum covering scale (the whole point of going
		//   manual) instead of at a stale value the user then has to nudge.
		setImageFramingManualEnabled: v => {
			// Per image, like every other framing decision: the flat key is the
			// ACTIVE image's live value and has to be written back into it.
			set(state => ({
				imageFramingManualEnabled: v,
				...syncActiveBackgroundImage(state, { framingManual: v })
			}));
			void coverFitActiveImage();
		},
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
		// The "mark here" gesture. The end of a clip IS the start of the next
		// one, so marking writes the NEXT image's timestamp — no `end` field
		// anywhere in the model. Returns what happened because the UI has to
		// say which image moved and whether the pool order survived it.
		markNextImageSwitchAt: (timeSec): MarkNextSwitchResult => {
			const state = get();
			const pool = resolveSlideshowPool(
				state.backgroundImages,
				state.setlists,
				state.activeSetlistId
			);
			const activeIndex = pool.findIndex(
				img => img.assetId === state.activeImageId
			);
			const next = activeIndex >= 0 ? pool[activeIndex + 1] : pool[1];
			const markedAt = Math.max(0, timeSec);
			if (!next) {
				return {
					marked: false,
					imageId: null,
					markedAt,
					poolPosition: 0,
					reordered: false,
					enabledManualMode: false
				};
			}

			const enabledManualMode = !state.slideshowManualTimestampsEnabled;
			const nextIndex = pool.findIndex(
				img => img.assetId === next.assetId
			);
			// Marking out of order is allowed — the resolver sorts by time, so
			// the pass simply plays the pool in a different order. That is a
			// legitimate edit, but the UI must say it happened.
			const marks = pool.map((img, index) =>
				img.assetId === next.assetId
					? markedAt
					: (img.playbackSwitchAt ?? null) !== null
						? img.playbackSwitchAt!
						: index === 0
							? 0
							: Number.NaN
			);
			const reordered = marks.some((value, index) => {
				if (index === 0 || Number.isNaN(value)) return false;
				for (let before = 0; before < index; before += 1) {
					const earlier = marks[before]!;
					if (!Number.isNaN(earlier) && earlier > value) return true;
				}
				return false;
			});

			set(current => ({
				slideshowManualTimestampsEnabled: true,
				backgroundImages: current.backgroundImages.map(img =>
					img.assetId === next.assetId
						? { ...img, playbackSwitchAt: markedAt }
						: img
				)
			}));

			return {
				marked: true,
				imageId: next.assetId,
				markedAt,
				poolPosition: nextIndex + 1,
				reordered,
				enabledManualMode
			};
		},
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
			// And the mark follows the picture when asked to, so the logo (with
			// the spectrum, when it follows the logo) lands where THIS image can
			// spare the room instead of on the face.
			if (get().logoFollowImageFocus) {
				void get().applyImageLogoFocus(get().activeImageId);
			}
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
		// Explicit Cover Fit: set the stored framing EXACTLY to the covered
		// composition (scale may shrink as well as grow — this is a deliberate
		// recalculation, unlike the passive raise-only refit) and clear the
		// hand-tuned provenance so later viewport changes keep it fitted.
		// fitMode and focus are untouched.
		autoCoverFitActiveImage: coverFitActiveImage,
		// The same exact fit for EVERY background image, so the whole slideshow
		// lands covered on every viewport. Items whose dimensions fail to load
		// keep their framing (the draw-side clamp still guarantees full-bleed).
		autoCoverFitAllImages: async () => {
			const state = get();
			const images = state.backgroundImages.filter(img => img.url);
			if (images.length === 0) return;
			const viewport = stageViewport();
			const dimsByAssetId: Record<
				string,
				{ width: number; height: number } | undefined
			> = {};
			await Promise.all(
				images.map(async image => {
					try {
						dimsByAssetId[image.assetId] =
							await loadImageDimensions(image.url as string);
					} catch {
						dimsByAssetId[image.assetId] = undefined;
					}
				})
			);
			const current = get();
			const patch = buildCoverFitAllImagesPatch(
				current,
				dimsByAssetId,
				viewport
			);
			if (patch) set(patch);
		},
		autoFitCoveredActiveImage,
		applyImageLogoFocus: async assetId => {
			if (!assetId) return;
			const state = get();
			const image = state.backgroundImages.find(
				item => item.assetId === assetId
			);
			if (!image?.url) return;
			const { logoFocusX: x, logoFocusY: y } = image;
			if (typeof x !== 'number' || typeof y !== 'number') return;
			const viewport = stageViewport();
			try {
				const dimensions = await loadImageDimensions(image.url);
				// The stored point is in IMAGE space, so it has to travel
				// through the image's own draw rect: the same point means a
				// different place on screen once the picture is zoomed or panned.
				const primary = resolveImageTransform({
					viewportWidth: viewport.width,
					viewportHeight: viewport.height,
					imageWidth: dimensions.width,
					imageHeight: dimensions.height,
					fitMode: image.fitMode,
					scale: image.scale,
					positionX: image.positionX,
					positionY: image.positionY,
					rotation: image.rotation,
					mirror: image.mirror,
					// Same rect the renderer draws: manual framing means no
					// coverage raise, and a mark mapped through a rect nobody
					// draws lands next to the thing it was pointing at.
					keepCovered: !image.framingManual,
					focusX: image.focusX,
					focusY: image.focusY,
					mirrorFill: image.mirrorFill,
					mirrorFillInvert: image.mirrorFillInvert,
					mirrorFillCount: image.mirrorFillCount,
					layout: state
				}).drawRects[0];
				if (!primary) return;
				const position = imagePointToLogoPosition({
					point: { x, y },
					imageRect: primary,
					viewportWidth: viewport.width,
					viewportHeight: viewport.height
				});
				set(current =>
					// Still the same image? A slideshow can have moved on while
					// the dimensions were loading.
					current.activeImageId === assetId ||
					current.activeImageId === null
						? {
								logoPositionX: position.x,
								logoPositionY: position.y
							}
						: {}
				);
			} catch {
				// Image unloadable: leave the mark where the user had it.
			}
		},
		setBackgroundImageFaceFocus: (assetId, x, y) =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(image =>
					image.assetId === assetId
						? {
								...image,
								faceFocusX: x,
								faceFocusY: y,
								// Placed by hand: a later re-scan leaves it be.
								faceFocusSource: 'manual' as const
							}
						: image
				)
			})),
		setBackgroundImageLogoFocus: (assetId, x, y) =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(image =>
					image.assetId === assetId
						? {
								...image,
								logoFocusX: x,
								logoFocusY: y,
								logoFocusSource: 'manual' as const
							}
						: image
				)
			})),
		clearBackgroundImageFocus: assetId =>
			set(state => ({
				backgroundImages: state.backgroundImages.map(image =>
					image.assetId === assetId
						? {
								...image,
								faceFocusX: null,
								faceFocusY: null,
								faceFocusSource: 'auto' as const,
								logoFocusX: null,
								logoFocusY: null,
								logoFocusSource: 'auto' as const
							}
						: image
				)
			})),
		analyzeBackgroundImageFocus: async (assetId, options) => {
			const image = get().backgroundImages.find(
				item => item.assetId === assetId
			);
			if (!image?.url) return;
			try {
				const estimate = await analyzeImageUrlFocus(image.url);
				set(state => ({
					backgroundImages: state.backgroundImages.map(item => {
						if (item.assetId !== assetId) return item;
						// A hand-placed point is never overwritten by a scan
						// unless the caller says so explicitly.
						const keepFace =
							item.faceFocusSource === 'manual' &&
							!options?.overwriteManual;
						const keepLogo =
							item.logoFocusSource === 'manual' &&
							!options?.overwriteManual;
						return {
							...item,
							faceFocusX: keepFace
								? item.faceFocusX
								: estimate.face.x,
							faceFocusY: keepFace
								? item.faceFocusY
								: estimate.face.y,
							faceFocusSource: keepFace
								? item.faceFocusSource
								: ('auto' as const),
							logoFocusX: keepLogo
								? item.logoFocusX
								: estimate.logo.x,
							logoFocusY: keepLogo
								? item.logoFocusY
								: estimate.logo.y,
							logoFocusSource: keepLogo
								? item.logoFocusSource
								: ('auto' as const)
						};
					})
				}));
			} catch {
				// Image unloadable: keep whatever the user already had.
			}
		},
		analyzeAllBackgroundImageFocus: async options => {
			const targets = get()
				.backgroundImages.filter(
					image =>
						image.url &&
						(options?.missingOnly === false ||
							image.faceFocusX === null ||
							image.faceFocusY === null)
				)
				.map(image => image.assetId);
			// Sequential on purpose: each analysis is a decode plus a small
			// canvas read, and firing fifty at once stalls the frame that the
			// user is looking at.
			for (const assetId of targets) {
				await get().analyzeBackgroundImageFocus(assetId, options);
			}
		},
		autoFocusActiveImage: async () => {
			const state = get();
			const activeId = state.activeImageId;
			const active = state.backgroundImages.find(
				image => image.assetId === activeId
			);
			if (!active?.url) return;
			try {
				const summary = await analyzeImageUrlSaliency(active.url);
				set(current =>
					current.activeImageId === activeId
						? buildBackgroundImageCollectionPatch(
								current,
								current.backgroundImages.map(image =>
									image.assetId === activeId
										? {
												...image,
												focusX: summary.focus.x,
												focusY: summary.focus.y,
												// Focus is user intent: mark framing
												// edited so the covered auto-fit patch
												// never recenters it on resize.
												coverageFramingEdited: true
											}
										: image
								),
								activeId
							)
						: {}
				);
			} catch {
				// Image unloadable: keep the current focus point.
			}
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
				const [summary, dimensions] = await Promise.all([
					analyzeImageUrlSaliency(active.url),
					loadImageDimensions(active.url)
				]);
				const boxSize = logoBoxSizeForViewport(
					state.logoBaseSize,
					viewportWidth,
					viewportHeight
				);
				const avoid = buildSpectrumAvoidRegion({
					state,
					image: active,
					imageWidth: dimensions.width,
					imageHeight: dimensions.height,
					viewportWidth,
					viewportHeight
				});
				const box = bestPlacementBox(summary.grid, boxSize, {
					avoid: avoid ? [avoid] : []
				});
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
