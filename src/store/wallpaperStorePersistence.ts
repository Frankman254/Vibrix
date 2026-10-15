import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import { restoreComposeBaseForPersistence } from '@/store/compositionRuntimeState';

export function partializeWallpaperStore(
	state: WallpaperStore
): Partial<WallpaperStore> {
	state = restoreComposeBaseForPersistence(state);
	const {
		audioCaptureState,
		imageUrl,
		globalBackgroundUrl,
		logoUrl,
		imageUrls,
		isPresetDirty,
		backgroundFallbackVisible,
		setBackgroundFallbackVisible,
		sleepModeActive,
		setSleepModeActive,
		controlPanelActiveTab,
		setControlPanelActiveTab,
		activeSpectrumTarget,
		setActiveSpectrumTarget,
		visualTransition,
		calibrationSyntheticGroups,
		aiDraft,
		aiPreviewActive,
		aiPreviewSnapshot,
		...rest
	} = state;

	void audioCaptureState;
	void imageUrl;
	void globalBackgroundUrl;
	void logoUrl;
	void imageUrls;
	void isPresetDirty;
	void backgroundFallbackVisible;
	void setBackgroundFallbackVisible;
	void sleepModeActive;
	void setSleepModeActive;
	void controlPanelActiveTab;
	void setControlPanelActiveTab;
	void activeSpectrumTarget;
	void setActiveSpectrumTarget;
	void visualTransition;
	void calibrationSyntheticGroups;
	// AI Director try-on state: a half-previewed draft surviving a reload would
	// show settings the user never accepted, with no snapshot left to undo them.
	void aiDraft;
	void aiPreviewActive;
	void aiPreviewSnapshot;

	return {
		...rest,
		backgroundImages: state.backgroundImages.map(image => ({
			...image,
			url: null as string | null,
			// Thumbnails are base64 webp data URLs (canvas.toDataURL). Persisting
			// them per image quickly blows the ~5MB localStorage quota — and a
			// failed write silently drops the ENTIRE state (images + every other
			// setting), so a reload falls back to the demo scene. Strip them; the
			// pool thumbnails are regenerated from the IndexedDB blob on restore
			// via hydrateMissingPoolThumbnails().
			thumbnailUrl: null as string | null
		})),
		overlays: state.overlays.map(overlay => ({
			...overlay,
			url: null as string | null
		}))
	};
}
