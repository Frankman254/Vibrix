import { useEffect, useRef, useState } from 'react';
import {
	loadImageDimensions,
	suggestBackgroundAutoFit
} from '@/features/background/domain/backgroundAutoFit';
import { resolveEditorImagePreviewUrl } from '@/lib/editorImagePreviews';
import { useT } from '@/lib/i18n';
import { useAudioContext } from '@/context/useAudioContext';
import { UI_COLORS } from '@/ui';
import ActiveWallpaperSection from './ActiveWallpaperSection';
import GlobalBackgroundSection from './GlobalBackgroundSection';
import SlideshowPoolSection from './SlideshowPoolSection';
import BgZoomAudioSection from './BgZoomAudioSection';
import { FlashEdgeSection } from '@/features/flashEdge/controls/FlashEdgeSection';
import { useBackgroundPositionRanges } from './useBackgroundPositionRanges';
import { useCoverageLockedImageTransform } from './useCoverageLockedImageTransform';
import { useBackgroundImageActions } from './useBackgroundImageActions';
import { BackgroundViewTabs } from './backgroundViewTabs';
import {
	readPersistedBgView,
	writePersistedBgView,
	type BgView
} from './backgroundViewState';
import { moveIdToIndex, shuffleIds } from './backgroundImageOrder';
import { useBackgroundStore } from './useBackgroundStore';
import { useIsSimple } from '@/editor/UIMode';
import {
	filterImageIdsBySetlist,
	getActiveSetlist
} from '@/store/slices/setlistsSlice';

export default function BackgroundTab({
	view: controlledView,
	onViewChange,
	hideViewTabs = false
}: {
	view?: BgView;
	onViewChange?: (view: BgView) => void;
	hideViewTabs?: boolean;
} = {}) {
	const t = useT();
	const isSimple = useIsSimple();
	// Audio sub-view is only meaningful when the user has access to
	// advanced controls — Simple mode would expose attack/release/etc.
	const canShowAudio = !isSimple;
	const [internalView, setInternalView] = useState<BgView>(() =>
		readPersistedBgView(canShowAudio)
	);
	const view = controlledView ?? internalView;

	function handleViewChange(next: BgView) {
		const safe = next === 'audio' && !canShowAudio ? 'pool' : next;
		if (controlledView === undefined) setInternalView(safe);
		onViewChange?.(safe);
		writePersistedBgView(safe);
	}

	// If the user toggles Simple while sitting on the Audio sub-view, bounce
	// back to Pool. Avoid trapping them on a hidden tab.
	useEffect(() => {
		if (view === 'audio' && !canShowAudio) {
			if (controlledView === undefined) setInternalView('pool');
			onViewChange?.('pool');
			writePersistedBgView('pool');
		}
	}, [view, canShowAudio, controlledView, onViewChange]);

	const store = useBackgroundStore();
	const { getDuration } = useAudioContext();
	const [trackDuration, setTrackDuration] = useState(0);
	const multiRef = useRef<HTMLInputElement>(null);
	const globalRef = useRef<HTMLInputElement>(null);
	const [showPoolThumbnails, setShowPoolThumbnails] = useState(true);
	const currentActiveSetlistId = store.activeSetlistId;
	const currentActiveImageId = store.activeImageId;
	const setCurrentActiveImageId = store.setActiveImageId;
	// Pool display subset: with an active setlist, non-members are hidden
	// entirely. The full `store.backgroundImages` array stays for internal
	// lookups (active-image resolution, navigation by id).
	const visibleBackgroundImages = filterImageIdsBySetlist(
		store.backgroundImages,
		store.setlists,
		store.activeSetlistId
	);
	const visibleImageIds = visibleBackgroundImages.map(image => image.assetId);
	const activeSetlist = getActiveSetlist(
		store.setlists,
		store.activeSetlistId
	);
	const activeImage =
		visibleBackgroundImages.find(
			image => image.assetId === store.activeImageId
		) ??
		visibleBackgroundImages[0] ??
		null;
	const activeImageIndex = activeImage
		? visibleBackgroundImages.findIndex(
				image => image.assetId === activeImage.assetId
			)
		: -1;

	const activeImagePositionRanges = useBackgroundPositionRanges({
		url: activeImage?.url ?? null,
		fitMode: store.imageFitMode,
		scale: store.imageScale,
		positionX: store.imagePositionX,
		positionY: store.imagePositionY,
		layoutResponsiveEnabled: store.layoutResponsiveEnabled,
		layoutBackgroundReframeEnabled: store.layoutBackgroundReframeEnabled,
		layoutReferenceWidth: store.layoutReferenceWidth,
		layoutReferenceHeight: store.layoutReferenceHeight,
		mirror: store.imageMirror,
		rotation: store.imageRotation,
		keepCovered: store.imageCoverageLockEnabled,
		focusX: store.imageFocusX,
		focusY: store.imageFocusY,
		mirrorFill: store.imageMirrorFill,
		mirrorFillInvert: store.imageMirrorFillInvert,
		mirrorFillCount: store.imageMirrorFillCount
	});
	const globalBackgroundPositionRanges = useBackgroundPositionRanges({
		url: store.globalBackgroundUrl,
		fitMode: store.globalBackgroundFitMode,
		scale: store.globalBackgroundScale,
		positionX: store.globalBackgroundPositionX,
		positionY: store.globalBackgroundPositionY,
		layoutResponsiveEnabled: store.layoutResponsiveEnabled,
		layoutBackgroundReframeEnabled: store.layoutBackgroundReframeEnabled,
		layoutReferenceWidth: store.layoutReferenceWidth,
		layoutReferenceHeight: store.layoutReferenceHeight
	});
	const {
		handleChangeFitMode,
		handleChangePositionX,
		handleChangePositionY,
		handleChangeScale,
		handleToggleCoverageLock,
		handleToggleMirrorFill
	} = useCoverageLockedImageTransform(store, activeImagePositionRanges);
	const {
		clearAllImages,
		downloadActiveImage,
		handleGlobalBackgroundFile,
		handleMultiFiles,
		handleVirtualImageSelect,
		removeGlobalBackground,
		removeImage
	} = useBackgroundImageActions({
		activeImage,
		activeSetlist,
		store
	});

	useEffect(() => {
		const interval = setInterval(() => {
			const d = getDuration();
			if (d > 0 && d !== trackDuration) {
				setTrackDuration(d);
			}
		}, 500);
		return () => clearInterval(interval);
	}, [getDuration, trackDuration]);

	useEffect(() => {
		if (!currentActiveSetlistId) return;
		const nextActive = visibleBackgroundImages[0]?.assetId ?? null;
		if (
			visibleBackgroundImages.some(
				image => image.assetId === currentActiveImageId
			)
		) {
			return;
		}
		if (currentActiveImageId !== nextActive) {
			setCurrentActiveImageId(nextActive);
		}
	}, [
		currentActiveSetlistId,
		currentActiveImageId,
		setCurrentActiveImageId,
		visibleBackgroundImages
	]);

	const calculatedSwitchAt =
		store.slideshowManualTimestampsEnabled &&
		activeImageIndex >= 0 &&
		trackDuration > 0
			? (trackDuration / Math.max(visibleBackgroundImages.length, 1)) *
				activeImageIndex
			: null;

	function setActiveSetlistImageOrder(nextVisibleIds: string[]) {
		if (!activeSetlist) return;
		const visible = new Set(visibleImageIds);
		const hiddenOrDanglingIds = activeSetlist.imageAssetIds.filter(
			assetId => !visible.has(assetId)
		);
		store.setSetlistImages(activeSetlist.id, [
			...nextVisibleIds,
			...hiddenOrDanglingIds
		]);
	}

	function moveVisibleImageToIndex(assetId: string, targetIndex: number) {
		if (activeSetlist) {
			setActiveSetlistImageOrder(
				moveIdToIndex(visibleImageIds, assetId, targetIndex)
			);
			return;
		}
		store.moveImageEntryToIndex(assetId, targetIndex);
	}

	function shuffleVisibleImages() {
		if (activeSetlist) {
			setActiveSetlistImageOrder(shuffleIds(visibleImageIds));
			return;
		}
		store.shuffleImageEntries();
	}

	function moveActiveVisibleImage(direction: -1 | 1) {
		if (!activeImage) return;
		if (activeSetlist) {
			const targetIndex = activeImageIndex + direction;
			if (targetIndex < 0 || targetIndex >= visibleImageIds.length)
				return;
			setActiveSetlistImageOrder(
				moveIdToIndex(visibleImageIds, activeImage.assetId, targetIndex)
			);
			return;
		}
		store.moveImageEntry(activeImage.assetId, direction);
	}

	function handleChangeRotation(value: number) {
		store.setActiveImageFramingEdited(true);
		store.setImageRotation(value);
	}

	async function autoFitActiveImage() {
		if (!activeImage?.url) return;
		const { width, height } = await loadImageDimensions(activeImage.url);
		const suggestion = suggestBackgroundAutoFit(
			window.innerWidth,
			window.innerHeight,
			width,
			height,
			store.imageRotation,
			store.imageMirrorFill ? store.imageMirrorFillCount : 0
		);

		// Explicit auto-fit: the composition becomes machine-owned again.
		store.setActiveImageFramingEdited(false);
		store.setImageFitMode(suggestion.fitMode);
		store.setImageScale(suggestion.scale);
		store.setImagePositionX(suggestion.positionX);
		store.setImagePositionY(suggestion.positionY);
		store.setImageFocusPoint(null, null);
	}

	function cycleActiveImage(direction: -1 | 1) {
		// Prev/next walk the setlist-filtered list — same one the pool
		// grid renders.
		if (visibleBackgroundImages.length < 2) return;
		const baseIndex = activeImageIndex >= 0 ? activeImageIndex : 0;
		const nextIndex =
			(baseIndex + direction + visibleBackgroundImages.length) %
			visibleBackgroundImages.length;
		const nextImage = visibleBackgroundImages[nextIndex];
		if (nextImage) store.setActiveImageId(nextImage.assetId);
	}

	return (
		<>
			{hideViewTabs ? null : (
				<div
					className="sticky top-0 z-20 -mx-1 px-1 pb-2 pt-1"
					style={{
						background: `linear-gradient(to bottom, ${UI_COLORS.shell} 0%, ${UI_COLORS.shell} 78%, transparent 100%)`
					}}
				>
					<BackgroundViewTabs
						view={view}
						onChange={handleViewChange}
						canShowAudio={canShowAudio}
					/>
				</div>
			)}
			{view === 'active' ? (
				<ActiveWallpaperSection
					t={t}
					activeImage={activeImage}
					activeImageIndex={activeImageIndex}
					imageCount={visibleBackgroundImages.length}
					imageFitMode={store.imageFitMode}
					imageScale={store.imageScale}
					imagePositionX={store.imagePositionX}
					imagePositionY={store.imagePositionY}
					imageFocusX={store.imageFocusX}
					imageFocusY={store.imageFocusY}
					imageRotation={store.imageRotation}
					imagePositionXRange={activeImagePositionRanges.positionX}
					imagePositionYRange={activeImagePositionRanges.positionY}
					imageOpacity={store.imageOpacity}
					imageMirror={store.imageMirror}
					imageMirrorFill={store.imageMirrorFill}
					imageMirrorFillInvert={store.imageMirrorFillInvert}
					imageMirrorFillCount={store.imageMirrorFillCount}
					imageCoverageLockEnabled={store.imageCoverageLockEnabled}
					layoutResponsiveEnabled={store.layoutResponsiveEnabled}
					layoutBackgroundReframeEnabled={
						store.layoutBackgroundReframeEnabled
					}
					layoutReferenceWidth={store.layoutReferenceWidth}
					layoutReferenceHeight={store.layoutReferenceHeight}
					imagePreviewUrl={resolveEditorImagePreviewUrl(
						activeImage,
						store.editorImagePreviewQuality,
						true
					)}
					transitionType={store.slideshowTransitionType}
					transitionDuration={store.slideshowTransitionDuration}
					transitionIntensity={store.slideshowTransitionIntensity}
					transitionAudioDrive={store.slideshowTransitionAudioDrive}
					transitionAudioChannel={
						store.slideshowTransitionAudioChannel
					}
					transitionAudioSmoothing={
						store.slideshowTransitionAudioSmoothing
					}
					onUploadClick={() => multiRef.current?.click()}
					onPreviousImage={() => cycleActiveImage(-1)}
					onNextImage={() => cycleActiveImage(1)}
					onDownloadImage={() => void downloadActiveImage()}
					onChangeFitMode={handleChangeFitMode}
					onChangeScale={handleChangeScale}
					onChangePositionX={handleChangePositionX}
					onChangePositionY={handleChangePositionY}
					onChangeFocusPoint={(x, y) => {
						store.setActiveImageFramingEdited(true);
						store.setImageFocusPoint(x, y);
					}}
					onCenterFocus={() => {
						// Mirror Fill is symmetric around the original tile, so
						// centering the full composition is the same normalized
						// origin in both free and keep-covered modes.
						store.setImageFocusPoint(null, null);
						handleChangePositionX(0);
						handleChangePositionY(0);
					}}
					onChangeRotation={handleChangeRotation}
					onChangeOpacity={store.setImageOpacity}
					onChangeMirror={store.setImageMirror}
					onChangeMirrorFill={handleToggleMirrorFill}
					onChangeMirrorFillInvert={store.setImageMirrorFillInvert}
					onChangeMirrorFillCount={store.setImageMirrorFillCount}
					imageMinScale={activeImagePositionRanges.minScale}
					onChangeImageCoverageLockEnabled={handleToggleCoverageLock}
					onChangeTransitionType={store.setSlideshowTransitionType}
					onChangeTransitionDuration={
						store.setSlideshowTransitionDuration
					}
					onChangeTransitionIntensity={
						store.setSlideshowTransitionIntensity
					}
					onChangeTransitionAudioDrive={
						store.setSlideshowTransitionAudioDrive
					}
					onChangeTransitionAudioChannel={
						store.setSlideshowTransitionAudioChannel
					}
					onChangeTransitionAudioSmoothing={
						store.setSlideshowTransitionAudioSmoothing
					}
					slideshowManualTimestampsEnabled={
						store.slideshowManualTimestampsEnabled
					}
					onCaptureLogoOverride={store.captureImageLogoOverride}
					onClearLogoOverride={() => store.setImageLogoOverride(null)}
					onCaptureSpectrumOverride={
						store.captureImageSpectrumOverride
					}
					onClearSpectrumOverride={() =>
						store.setImageSpectrumOverride(null)
					}
					onCaptureParticlesOverride={
						store.captureImageParticlesOverride
					}
					onClearParticlesOverride={() =>
						store.setImageParticlesOverride(null)
					}
					onCaptureRainOverride={store.captureImageRainOverride}
					onClearRainOverride={() => store.setImageRainOverride(null)}
					onCaptureLooksOverride={store.captureImageLooksOverride}
					onClearLooksOverride={() =>
						store.setImageLooksOverride(null)
					}
					onChangePlaybackSwitchAt={value => {
						if (!activeImage) return;
						store.setBackgroundImagePlaybackSwitchAt(
							activeImage.assetId,
							value
						);
					}}
					calculatedSwitchAt={calculatedSwitchAt}
					onAutoFitAllImages={() => void store.autoFitAllImages()}
					onAutoFocusActiveImage={() =>
						void store.autoFocusActiveImage()
					}
					onAutoFocusAllImages={() => void store.autoFocusAllImages()}
					onAutoFitActiveImage={() => void autoFitActiveImage()}
				/>
			) : null}

			{view === 'pool' ? (
				<SlideshowPoolSection
					t={t}
					imageIds={activeSetlist ? visibleImageIds : store.imageIds}
					backgroundImages={visibleBackgroundImages}
					activeImage={activeImage}
					activeImageIndex={activeImageIndex}
					imagePreviewQuality={store.editorImagePreviewQuality}
					showPoolThumbnails={showPoolThumbnails}
					onToggleShowThumbnails={setShowPoolThumbnails}
					onMultiUploadClick={() => multiRef.current?.click()}
					onVirtualImageSelect={handleVirtualImageSelect}
					onClearAllImages={() => void clearAllImages()}
					onSetActiveImage={store.setActiveImageId}
					onSetEntryEnabled={store.setBackgroundImageEntryEnabled}
					onMoveEntryToIndex={moveVisibleImageToIndex}
					onRemoveImage={assetId => void removeImage(assetId)}
					onMoveLeft={() => moveActiveVisibleImage(-1)}
					onMoveRight={() => moveActiveVisibleImage(1)}
					onShuffle={shuffleVisibleImages}
					onAutoFitAll={() => void store.autoFitAllImages()}
					onAutoFocusAll={() => void store.autoFocusAllImages()}
				/>
			) : null}
			<input
				ref={multiRef}
				type="file"
				accept="image/*"
				multiple
				onChange={handleMultiFiles}
				className="hidden"
			/>

			{view === 'audio' && canShowAudio ? (
				<>
					<BgZoomAudioSection />
					<FlashEdgeSection target="bg" />
				</>
			) : null}

			{view === 'global' ? (
				<GlobalBackgroundSection
					t={t}
					globalBackgroundId={store.globalBackgroundId}
					globalBackgroundUrl={store.globalBackgroundUrl}
					globalBackgroundEnabled={store.globalBackgroundEnabled}
					globalBackgroundFitMode={store.globalBackgroundFitMode}
					globalBackgroundScale={store.globalBackgroundScale}
					globalBackgroundPositionX={store.globalBackgroundPositionX}
					globalBackgroundPositionY={store.globalBackgroundPositionY}
					globalBackgroundPositionXRange={
						globalBackgroundPositionRanges.positionX
					}
					globalBackgroundPositionYRange={
						globalBackgroundPositionRanges.positionY
					}
					globalBackgroundOpacity={store.globalBackgroundOpacity}
					globalBackgroundBrightness={
						store.globalBackgroundBrightness
					}
					globalBackgroundContrast={store.globalBackgroundContrast}
					globalBackgroundSaturation={
						store.globalBackgroundSaturation
					}
					globalBackgroundBlur={store.globalBackgroundBlur}
					globalBackgroundHueRotate={store.globalBackgroundHueRotate}
					onUploadClick={() => globalRef.current?.click()}
					onRemove={() => void removeGlobalBackground()}
					onToggleEnabled={store.setGlobalBackgroundEnabled}
					onChangeFitMode={store.setGlobalBackgroundFitMode}
					onChangeScale={store.setGlobalBackgroundScale}
					onChangePositionX={store.setGlobalBackgroundPositionX}
					onChangePositionY={store.setGlobalBackgroundPositionY}
					onChangeOpacity={store.setGlobalBackgroundOpacity}
					onChangeBrightness={store.setGlobalBackgroundBrightness}
					onChangeContrast={store.setGlobalBackgroundContrast}
					onChangeSaturation={store.setGlobalBackgroundSaturation}
					onChangeBlur={store.setGlobalBackgroundBlur}
					onChangeHueRotate={store.setGlobalBackgroundHueRotate}
				/>
			) : null}
			{/* Hidden file input lives outside the conditional so its
			    `ref={globalRef}` survives sub-view switches (the input must
			    not unmount mid-upload-flow). */}
			<input
				ref={globalRef}
				type="file"
				accept="image/*"
				onChange={handleGlobalBackgroundFile}
				className="hidden"
			/>
		</>
	);
}
