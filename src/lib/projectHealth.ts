import type { WallpaperState } from '@/types/wallpaper';

export type ProjectHealthSeverity = 'error' | 'warning';

export type ProjectHealthIssue = {
	code: string;
	severity: ProjectHealthSeverity;
	message: string;
};

export type ProjectHealthReport = {
	status: 'healthy' | 'warning' | 'error';
	errorCount: number;
	warningCount: number;
	issues: ProjectHealthIssue[];
};

export type ProjectHealthState = Pick<
	WallpaperState,
	| 'activeAudioTrackId'
	| 'activeImageId'
	| 'activeSceneSlotId'
	| 'activeSetlistId'
	| 'defaultSceneSlotId'
	| 'audioFileAssetId'
	| 'audioSourceMode'
	| 'audioTracks'
	| 'backgroundImageEnabled'
	| 'backgroundImages'
	| 'globalBackgroundEnabled'
	| 'globalBackgroundId'
	| 'globalBackgroundUrl'
	| 'imageIds'
	| 'logoEnabled'
	| 'logoId'
	| 'logoUrl'
	| 'overlays'
	| 'sceneSlots'
	| 'selectedOverlayId'
	| 'setlists'
	| 'spectrumProfileSlots'
	| 'spectrumSecondProfileSlots'
	| 'looksProfileSlots'
	| 'particlesProfileSlots'
	| 'rainProfileSlots'
	| 'lightsProfileSlots'
	| 'cameraFxProfileSlots'
	| 'logoProfileSlots'
	| 'trackTitleProfileSlots'
>;

function addIssue(
	issues: ProjectHealthIssue[],
	severity: ProjectHealthSeverity,
	code: string,
	message: string
) {
	issues.push({ code, severity, message });
}

function hasSlotValue<T>(
	slots: Array<{ id: string; values: T | null }>,
	ref: import('@/types/wallpaper').SceneSlotRef
): boolean {
	// Only a string ref points at a slot; 'off'/null never reference one.
	if (typeof ref !== 'string') return true;
	return Boolean(slots.find(slot => slot.id === ref)?.values);
}

export function createProjectHealthReport(
	state: ProjectHealthState
): ProjectHealthReport {
	const issues: ProjectHealthIssue[] = [];
	const imageAssetIds = new Set(
		state.backgroundImages.map(image => image.assetId)
	);
	const trackIds = new Set(state.audioTracks.map(track => track.id));
	const sceneSlotIds = new Set(state.sceneSlots.map(slot => slot.id));

	if (
		state.backgroundImageEnabled &&
		state.activeImageId &&
		!imageAssetIds.has(state.activeImageId)
	) {
		addIssue(
			issues,
			'error',
			'active-image-missing',
			'Active background image points to an asset that is no longer in the pool.'
		);
	}

	const missingImageAssets = state.imageIds.filter(
		assetId => !imageAssetIds.has(assetId)
	);
	if (missingImageAssets.length > 0) {
		addIssue(
			issues,
			'warning',
			'background-asset-reference-missing',
			`${missingImageAssets.length} stored background asset reference is not present in the pool.`
		);
	}

	const missingImageUrls = state.backgroundImages.filter(image => !image.url);
	if (missingImageUrls.length > 0) {
		addIssue(
			issues,
			'warning',
			'background-image-url-missing',
			`${missingImageUrls.length} background image needs its local file restored.`
		);
	}

	if (
		state.globalBackgroundEnabled &&
		state.globalBackgroundId &&
		!state.globalBackgroundUrl
	) {
		addIssue(
			issues,
			'warning',
			'global-background-missing',
			'Global background is enabled but its local image is missing.'
		);
	}

	if (state.logoEnabled && state.logoId && !state.logoUrl) {
		addIssue(
			issues,
			'warning',
			'logo-asset-missing',
			'Logo uses an uploaded asset that is missing on this device.'
		);
	}

	if (
		state.selectedOverlayId &&
		!state.overlays.some(overlay => overlay.id === state.selectedOverlayId)
	) {
		addIssue(
			issues,
			'warning',
			'selected-overlay-missing',
			'Selected overlay points to an overlay that no longer exists.'
		);
	}

	const brokenOverlays = state.overlays.filter(
		overlay => overlay.enabled && (!overlay.assetId || !overlay.url)
	);
	if (brokenOverlays.length > 0) {
		addIssue(
			issues,
			'warning',
			'overlay-asset-missing',
			`${brokenOverlays.length} enabled overlay image needs its local file restored.`
		);
	}

	if (
		state.activeAudioTrackId &&
		!state.audioTracks.some(track => track.id === state.activeAudioTrackId)
	) {
		addIssue(
			issues,
			'error',
			'active-audio-track-missing',
			'Active audio track points to a playlist item that no longer exists.'
		);
	}

	const enabledTracksWithoutAssets = state.audioTracks.filter(
		track => track.enabled && !track.assetId
	);
	if (
		state.audioSourceMode === 'file' &&
		!state.audioFileAssetId &&
		state.audioTracks.filter(track => track.enabled).length === 0
	) {
		addIssue(
			issues,
			'warning',
			'file-audio-missing',
			'File audio mode is active but no uploaded audio asset is available.'
		);
	}
	if (enabledTracksWithoutAssets.length > 0) {
		addIssue(
			issues,
			'warning',
			'audio-track-asset-missing',
			`${enabledTracksWithoutAssets.length} enabled playlist track is missing its asset reference.`
		);
	}

	if (
		state.activeSetlistId &&
		!state.setlists.some(setlist => setlist.id === state.activeSetlistId)
	) {
		addIssue(
			issues,
			'error',
			'active-setlist-missing',
			'Active project/setlist id does not exist.'
		);
	}

	for (const setlist of state.setlists) {
		const missingImages = setlist.imageAssetIds.filter(
			assetId => !imageAssetIds.has(assetId)
		);
		const missingTracks = setlist.trackIds.filter(id => !trackIds.has(id));
		if (missingImages.length > 0) {
			addIssue(
				issues,
				'warning',
				'setlist-image-missing',
				`Project "${setlist.name}" references ${missingImages.length} missing image.`
			);
		}
		if (missingTracks.length > 0) {
			addIssue(
				issues,
				'warning',
				'setlist-track-missing',
				`Project "${setlist.name}" references ${missingTracks.length} missing audio track.`
			);
		}
	}

	if (state.activeSceneSlotId && !sceneSlotIds.has(state.activeSceneSlotId)) {
		addIssue(
			issues,
			'warning',
			'active-scene-missing',
			'Active scene slot id does not exist.'
		);
	}

	if (
		state.defaultSceneSlotId &&
		!sceneSlotIds.has(state.defaultSceneSlotId)
	) {
		addIssue(
			issues,
			'warning',
			'default-scene-missing',
			'Default scene slot id does not exist.'
		);
	}

	for (const image of state.backgroundImages) {
		if (image.sceneSlotId && !sceneSlotIds.has(image.sceneSlotId)) {
			addIssue(
				issues,
				'warning',
				'image-scene-missing',
				`Image "${image.originalFileName ?? image.assetId}" references a missing scene slot.`
			);
		}
		if (
			image.logoProfileSlotId != null &&
			!hasSlotValue(state.logoProfileSlots, image.logoProfileSlotId)
		) {
			addIssue(
				issues,
				'warning',
				'image-logo-slot-missing',
				`Image "${image.originalFileName ?? image.assetId}" references an empty logo slot.`
			);
		}
		if (
			image.spectrumProfileSlotId != null &&
			!hasSlotValue(
				state.spectrumProfileSlots,
				image.spectrumProfileSlotId
			)
		) {
			addIssue(
				issues,
				'warning',
				'image-spectrum-slot-missing',
				`Image "${image.originalFileName ?? image.assetId}" references an empty spectrum slot.`
			);
		}
		if (
			image.particlesProfileSlotId != null &&
			!hasSlotValue(
				state.particlesProfileSlots,
				image.particlesProfileSlotId
			)
		) {
			addIssue(
				issues,
				'warning',
				'image-particles-slot-missing',
				`Image "${image.originalFileName ?? image.assetId}" references an empty particles slot.`
			);
		}
		if (
			image.rainProfileSlotId != null &&
			!hasSlotValue(state.rainProfileSlots, image.rainProfileSlotId)
		) {
			addIssue(
				issues,
				'warning',
				'image-rain-slot-missing',
				`Image "${image.originalFileName ?? image.assetId}" references an empty rain slot.`
			);
		}
		if (
			image.looksProfileSlotId != null &&
			!hasSlotValue(state.looksProfileSlots, image.looksProfileSlotId)
		) {
			addIssue(
				issues,
				'warning',
				'image-looks-slot-missing',
				`Image "${image.originalFileName ?? image.assetId}" references an empty looks slot.`
			);
		}
	}

	for (const scene of state.sceneSlots) {
		if (!hasSlotValue(state.spectrumProfileSlots, scene.spectrumSlotId)) {
			addIssue(
				issues,
				'warning',
				'scene-spectrum-slot-missing',
				`Scene "${scene.name}" references an empty spectrum slot.`
			);
		}
		if (
			!hasSlotValue(
				state.spectrumSecondProfileSlots,
				scene.spectrumSecondSlotId
			)
		) {
			addIssue(
				issues,
				'warning',
				'scene-spectrum2-slot-missing',
				`Scene "${scene.name}" references an empty Spectrum 2 slot.`
			);
		}
		if (!hasSlotValue(state.looksProfileSlots, scene.looksSlotId)) {
			addIssue(
				issues,
				'warning',
				'scene-looks-slot-missing',
				`Scene "${scene.name}" references an empty looks slot.`
			);
		}
		if (!hasSlotValue(state.particlesProfileSlots, scene.particlesSlotId)) {
			addIssue(
				issues,
				'warning',
				'scene-particles-slot-missing',
				`Scene "${scene.name}" references an empty particles slot.`
			);
		}
		if (!hasSlotValue(state.rainProfileSlots, scene.rainSlotId)) {
			addIssue(
				issues,
				'warning',
				'scene-rain-slot-missing',
				`Scene "${scene.name}" references an empty rain slot.`
			);
		}
		if (!hasSlotValue(state.lightsProfileSlots, scene.lightsSlotId)) {
			addIssue(
				issues,
				'warning',
				'scene-lights-slot-missing',
				`Scene "${scene.name}" references an empty lights slot.`
			);
		}
		if (!hasSlotValue(state.cameraFxProfileSlots, scene.cameraFxSlotId)) {
			addIssue(
				issues,
				'warning',
				'scene-camera-slot-missing',
				`Scene "${scene.name}" references an empty camera slot.`
			);
		}
		if (!hasSlotValue(state.logoProfileSlots, scene.logoSlotId)) {
			addIssue(
				issues,
				'warning',
				'scene-logo-slot-missing',
				`Scene "${scene.name}" references an empty logo slot.`
			);
		}
		if (
			!hasSlotValue(state.trackTitleProfileSlots, scene.trackTitleSlotId)
		) {
			addIssue(
				issues,
				'warning',
				'scene-track-title-slot-missing',
				`Scene "${scene.name}" references an empty track title slot.`
			);
		}
	}

	const errorCount = issues.filter(
		issue => issue.severity === 'error'
	).length;
	const warningCount = issues.length - errorCount;
	return {
		status:
			errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'healthy',
		errorCount,
		warningCount,
		issues
	};
}
