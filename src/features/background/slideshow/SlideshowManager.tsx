import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioContext } from '@/context/useAudioContext';
import {
	filterImageIdsBySetlist,
	getActiveSetlist
} from '@/store/slices/setlistsSlice';
import {
	buildManualSwitchSchedule,
	resolveEffectiveImageForPlayback,
	resolveSlideshowPool
} from './slideshowPlayback';

// Set window.__SLIDESHOW_DEBUG__ = true in the browser console to enable.
const isDebug = () =>
	typeof window !== 'undefined' &&
	!!(window as unknown as Record<string, unknown>)['__SLIDESHOW_DEBUG__'];

function dbg(label: string, data: Record<string, unknown>) {
	if (!isDebug()) return;
	console.debug(`[slideshow] ${label}`, data);
}

/** Cycles through background images using the active image item. Renders nothing. */
export default function SlideshowManager() {
	const {
		backgroundImages,
		activeImageId,
		slideshowEnabled,
		slideshowInterval,
		slideshowAudioCheckpointsEnabled,
		slideshowTrackChangeSyncEnabled,
		slideshowManualTimestampsEnabled,
		slideshowTransitionDuration,
		audioTracks,
		activeAudioTrackId,
		motionPaused,
		sleepModeActive,
		setlists,
		activeSetlistId
	} = useWallpaperStore(
		useShallow(s => ({
			backgroundImages: s.backgroundImages,
			activeImageId: s.activeImageId,
			slideshowEnabled: s.slideshowEnabled,
			slideshowInterval: s.slideshowInterval,
			slideshowAudioCheckpointsEnabled:
				s.slideshowAudioCheckpointsEnabled,
			slideshowTrackChangeSyncEnabled: s.slideshowTrackChangeSyncEnabled,
			slideshowManualTimestampsEnabled:
				s.slideshowManualTimestampsEnabled,
			slideshowTransitionDuration: s.slideshowTransitionDuration,
			audioTracks: s.audioTracks,
			activeAudioTrackId: s.activeAudioTrackId,
			motionPaused: s.motionPaused,
			sleepModeActive: s.sleepModeActive,
			setlists: s.setlists,
			activeSetlistId: s.activeSetlistId
		}))
	);
	const { captureMode, getCurrentTime, getDuration } = useAudioContext();
	const lastTrackSyncIdRef = useRef<string | null>(null);
	// Track the last assetId the auto-sync committed so manual changes between
	// checkpoint boundaries are preserved (we only override when the computed
	// target itself changes, not just when it differs from activeImageId).
	const lastCheckpointIdRef = useRef<string | null>(null);
	const lastTimestampAssetIdRef = useRef<string | null>(null);
	// When a setlist is active, both the slideshow image cycle and the audio
	// playlist auto-advance must filter to setlist members ONLY. The user
	// expects strict isolation — non-members shouldn't even show up.
	const slideshowIds = useMemo(() => {
		const enabled = backgroundImages.filter(
			image => image.url && image.enabled
		);
		const filtered = filterImageIdsBySetlist(
			enabled,
			setlists,
			activeSetlistId
		);
		return filtered.map(image => image.assetId);
	}, [backgroundImages, setlists, activeSetlistId]);
	const enabledTrackIds = useMemo(() => {
		const enabled = audioTracks.filter(track => track.enabled);
		const active = getActiveSetlist(setlists, activeSetlistId);
		if (!active) return enabled.map(track => track.id);
		const allowed = new Set(active.trackIds);
		return enabled
			.filter(track => allowed.has(track.id))
			.map(track => track.id);
	}, [audioTracks, setlists, activeSetlistId]);

	const useAudioCheckpointSync =
		slideshowEnabled &&
		slideshowAudioCheckpointsEnabled &&
		captureMode === 'file' &&
		slideshowIds.length >= 2 &&
		!slideshowManualTimestampsEnabled;

	const useManualTimestamps =
		slideshowEnabled &&
		slideshowManualTimestampsEnabled &&
		captureMode === 'file' &&
		slideshowIds.length >= 1;

	const autoModeKey = JSON.stringify([
		activeAudioTrackId,
		activeSetlistId,
		slideshowEnabled,
		slideshowAudioCheckpointsEnabled,
		slideshowManualTimestampsEnabled,
		slideshowIds
	]);
	const scheduleKey = JSON.stringify(
		slideshowIds.map(assetId => {
			const image = backgroundImages.find(
				item => item.assetId === assetId
			);
			return [
				assetId,
				image?.playbackSwitchAt,
				image?.transitionDuration
			];
		})
	);
	const previousAutoModeKeyRef = useRef(autoModeKey);

	// ── Auto-playback cursor synchronization ───────────────────────────────────
	// A track, mode or pool change must re-apply the resolved image on the next
	// tick. A timing edit is different: keep the cursor at the target for the
	// current position so editing/saving a transition cannot undo a manual
	// Prev/Next preview before the next real boundary.
	useEffect(() => {
		if (previousAutoModeKeyRef.current !== autoModeKey) {
			previousAutoModeKeyRef.current = autoModeKey;
			lastCheckpointIdRef.current = null;
			lastTimestampAssetIdRef.current = null;
			dbg('refs-invalidated', { activeAudioTrackId, activeSetlistId });
			return;
		}

		const state = useWallpaperStore.getState();
		const currentTime = Math.max(0, getCurrentTime());
		const duration = getDuration();
		const common = {
			images: state.backgroundImages,
			setlists: state.setlists,
			activeSetlistId: state.activeSetlistId,
			currentTime,
			duration,
			slideshowEnabled: state.slideshowEnabled
		};
		lastCheckpointIdRef.current = resolveEffectiveImageForPlayback({
			...common,
			manualTimestampsEnabled: false,
			lastAutoTargetId: null
		}).targetImageId;
		lastTimestampAssetIdRef.current = resolveEffectiveImageForPlayback({
			...common,
			manualTimestampsEnabled: true,
			lastAutoTargetId: null,
			defaultTransitionDuration: state.slideshowTransitionDuration
		}).targetImageId;
		dbg('refs-reseeded-after-timing-edit', {
			currentTime,
			checkpointTarget: lastCheckpointIdRef.current,
			timestampTarget: lastTimestampAssetIdRef.current
		});
	}, [
		autoModeKey,
		activeAudioTrackId,
		activeSetlistId,
		getCurrentTime,
		getDuration,
		scheduleKey,
		slideshowTransitionDuration
	]);

	// ── Zero-position reset (timer / track-sync modes) ────────────────────
	// Polling modes (checkpoint, timestamp) handle forceApply internally.
	// Timer mode and track-sync mode have no polling loop, so we snap to
	// image 1/N here when the pool changes and playback is at position 0.
	// getCurrentTime is a stable ref-backed function — intentionally excluded
	// from deps so this fires on structural changes only, not every poll tick.
	useEffect(() => {
		if (!slideshowEnabled || slideshowIds.length < 1) return;
		// Skip for polling modes — their ticks enforce forceApply themselves.
		if (useAudioCheckpointSync || useManualTimestamps) return;
		const state = useWallpaperStore.getState();
		const resolution = resolveEffectiveImageForPlayback({
			images: state.backgroundImages,
			setlists: state.setlists,
			activeSetlistId: state.activeSetlistId,
			currentTime: getCurrentTime(),
			duration: getDuration(),
			slideshowEnabled: true,
			manualTimestampsEnabled: false,
			lastAutoTargetId: lastCheckpointIdRef.current
		});
		if (resolution.forceApply && resolution.targetImageId) {
			const prevId = state.activeImageId;
			if (prevId !== resolution.targetImageId) {
				state.setActiveImageId(resolution.targetImageId);
			}
			lastCheckpointIdRef.current = resolution.targetImageId;
			lastTimestampAssetIdRef.current = resolution.targetImageId;
			dbg('zero-position-reset', {
				prevActiveImageId: prevId,
				targetImageId: resolution.targetImageId,
				slideshowIds,
				currentTime: getCurrentTime()
			});
		}
		// `getCurrentTime` / `getDuration` are read imperatively for "now" and
		// are useCallback'd on refs alone, so their identity is stable for the
		// provider's lifetime — listing them adds churn without removing any
		// staleness. The rule reports on the dependency array, so the disable
		// belongs here; the previous one sat on the closing bracket and
		// suppressed nothing.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		slideshowEnabled,
		slideshowIds,
		useAudioCheckpointSync,
		useManualTimestamps
	]);

	// ── Timer-based interval mode ──────────────────────────────────────────
	useEffect(() => {
		if (
			!slideshowEnabled ||
			useAudioCheckpointSync ||
			useManualTimestamps ||
			slideshowTrackChangeSyncEnabled ||
			motionPaused ||
			sleepModeActive ||
			slideshowIds.length < 2
		)
			return;

		const timeoutId = window.setTimeout(
			() => {
				const state = useWallpaperStore.getState();
				const items = filterImageIdsBySetlist(
					state.backgroundImages.filter(
						image => image.url && image.enabled
					),
					state.setlists,
					state.activeSetlistId
				);
				if (items.length < 2) return;
				const currentIndex = Math.max(
					0,
					items.findIndex(
						image => image.assetId === state.activeImageId
					)
				);
				const nextItem = items[(currentIndex + 1) % items.length];
				state.setActiveImageId(nextItem.assetId);
			},
			Math.max(1, slideshowInterval) * 1000
		);

		return () => clearTimeout(timeoutId);
	}, [
		activeImageId,
		motionPaused,
		sleepModeActive,
		slideshowEnabled,
		slideshowTrackChangeSyncEnabled,
		slideshowIds,
		slideshowInterval,
		useAudioCheckpointSync,
		useManualTimestamps
	]);

	// ── Audio checkpoint mode (proportional to track duration) ────────────
	useEffect(() => {
		if (
			!useAudioCheckpointSync ||
			motionPaused ||
			sleepModeActive ||
			slideshowIds.length < 2
		)
			return;

		let cancelled = false;
		let timeoutId = 0;
		const tick = () => {
			if (cancelled) return;
			const currentTime = Math.max(0, getCurrentTime());
			const duration = getDuration();

			// Use the resolver so forceApply at position 0 is always respected,
			// even when lastCheckpointIdRef already holds the first image id
			// (e.g. user manually moved away, then scrubbed back to 0).
			const state = useWallpaperStore.getState();
			const resolution = resolveEffectiveImageForPlayback({
				images: state.backgroundImages,
				setlists: state.setlists,
				activeSetlistId: state.activeSetlistId,
				currentTime,
				duration,
				slideshowEnabled: true,
				manualTimestampsEnabled: false,
				lastAutoTargetId: lastCheckpointIdRef.current
			});

			if (resolution.shouldApply && resolution.targetImageId) {
				dbg('checkpoint-apply', {
					...resolution,
					currentTime,
					duration,
					prevRef: lastCheckpointIdRef.current
				});
				lastCheckpointIdRef.current = resolution.targetImageId;
				state.setActiveImageId(resolution.targetImageId);
			}

			// Schedule the next tick at checkpoint-boundary precision when
			// duration is known, or at a slow fallback while waiting for audio.
			if (duration > 0) {
				const checkpointDuration =
					duration / Math.max(slideshowIds.length, 1);
				const timeIntoCheckpoint =
					checkpointDuration > 0
						? currentTime % checkpointDuration
						: 0;
				const timeToNextCheckpoint =
					checkpointDuration - timeIntoCheckpoint;
				const nextDelayMs =
					timeToNextCheckpoint < 0.35
						? 80
						: timeToNextCheckpoint < 1.5
							? 160
							: 320;
				timeoutId = window.setTimeout(tick, nextDelayMs);
			} else {
				timeoutId = window.setTimeout(tick, 500);
			}
		};

		timeoutId = window.setTimeout(tick, 180);
		return () => {
			cancelled = true;
			window.clearTimeout(timeoutId);
		};
	}, [
		getCurrentTime,
		getDuration,
		motionPaused,
		sleepModeActive,
		slideshowIds,
		useAudioCheckpointSync
	]);

	// ── Manual timestamps mode ─────────────────────────────────────────────
	useEffect(() => {
		if (!useManualTimestamps || motionPaused || sleepModeActive) return;

		let cancelled = false;
		let timeoutId = 0;
		const tick = () => {
			if (cancelled) return;
			const currentTime = Math.max(0, getCurrentTime());
			const duration = getDuration();

			// Use the resolver for the apply decision — this correctly enforces
			// forceApply at position 0 even when lastTimestampAssetIdRef already
			// holds the first image id (e.g. user scrubbed back to 0 after
			// manually moving to a later image).
			const state = useWallpaperStore.getState();
			const resolution = resolveEffectiveImageForPlayback({
				images: state.backgroundImages,
				setlists: state.setlists,
				activeSetlistId: state.activeSetlistId,
				currentTime,
				duration,
				slideshowEnabled: true,
				manualTimestampsEnabled: true,
				lastAutoTargetId: lastTimestampAssetIdRef.current,
				defaultTransitionDuration: state.slideshowTransitionDuration
			});

			if (resolution.shouldApply && resolution.targetImageId) {
				dbg('timestamp-apply', {
					...resolution,
					currentTime,
					prevRef: lastTimestampAssetIdRef.current
				});
				lastTimestampAssetIdRef.current = resolution.targetImageId;
				if (state.activeImageId !== resolution.targetImageId) {
					state.setActiveImageId(resolution.targetImageId);
				}
			}

			// Schedule next tick: find the next switch boundary from the very
			// same schedule the resolver uses, including transition look-ahead,
			// so the poller never sleeps through a switch that fires early.
			const nextSwitch = buildManualSwitchSchedule({
				pool: resolveSlideshowPool(
					backgroundImages,
					setlists,
					activeSetlistId
				),
				duration,
				defaultTransitionDuration: slideshowTransitionDuration
			}).find(entry => entry.switchAt > currentTime);
			const timeToNext = nextSwitch
				? nextSwitch.switchAt - currentTime
				: 2;
			const delayMs =
				timeToNext < 0.35 ? 80 : timeToNext < 1.5 ? 160 : 400;
			timeoutId = window.setTimeout(tick, delayMs);
		};

		timeoutId = window.setTimeout(tick, 100);
		return () => {
			cancelled = true;
			window.clearTimeout(timeoutId);
		};
	}, [
		getCurrentTime,
		getDuration,
		motionPaused,
		sleepModeActive,
		backgroundImages,
		setlists,
		activeSetlistId,
		slideshowTransitionDuration,
		useManualTimestamps
	]);

	// ── Track change sync mode ─────────────────────────────────────────────
	useEffect(() => {
		if (
			!slideshowEnabled ||
			!slideshowTrackChangeSyncEnabled ||
			motionPaused ||
			sleepModeActive ||
			slideshowIds.length < 2 ||
			enabledTrackIds.length < 2 ||
			!activeAudioTrackId
		) {
			lastTrackSyncIdRef.current = activeAudioTrackId ?? null;
			return;
		}
		if (lastTrackSyncIdRef.current === activeAudioTrackId) return;
		lastTrackSyncIdRef.current = activeAudioTrackId;

		const trackIndex = enabledTrackIds.findIndex(
			id => id === activeAudioTrackId
		);
		if (trackIndex < 0) return;
		const nextId = slideshowIds[trackIndex % slideshowIds.length];
		if (nextId && nextId !== useWallpaperStore.getState().activeImageId) {
			useWallpaperStore.getState().setActiveImageId(nextId);
		}
	}, [
		activeAudioTrackId,
		enabledTrackIds,
		motionPaused,
		sleepModeActive,
		slideshowEnabled,
		slideshowIds,
		slideshowTrackChangeSyncEnabled
	]);

	return null;
}
