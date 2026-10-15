import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode
} from 'react';
import {
	createAudioAnalysisState,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';
import { AudioMixEngine } from '@/lib/audio/AudioMixEngine';
import type { IAudioSourceAdapter } from '@/lib/audio/types';
import { useWallpaperStore } from '@/store/wallpaperStore';
import {
	type AudioDataContextValue,
	type RemoteAudioMeta,
	EMPTY_AUDIO_SNAPSHOT,
	supportsDisplayMedia
} from './audioData/audioDataShared';
import { AudioDataContext } from './audioData/audioDataContext';
import { useAudioCaptureController } from './audioData/useAudioCaptureController';
import { useAudioPlaybackEffects } from './audioData/useAudioPlaybackEffects';
import { useAudioPlaylistController } from './audioData/useAudioPlaylistController';
import { useAudioSnapshotRuntime } from './audioData/useAudioSnapshotRuntime';

export function AudioDataProvider({ children }: { children: ReactNode }) {
	const analyzerRef = useRef<IAudioSourceAdapter | null>(null);
	const analysisStateRef = useRef(createAudioAnalysisState());
	const peakRef = useRef(0);
	const snapshotRef = useRef<AudioSnapshot>(EMPTY_AUDIO_SNAPSHOT);
	const remoteSnapshotRef = useRef<AudioSnapshot>(EMPTY_AUDIO_SNAPSHOT);
	const remoteMetaRef = useRef<RemoteAudioMeta>({
		captureMode: supportsDisplayMedia ? 'desktop' : 'microphone',
		isPaused: false,
		fileName: '',
		fileVolume: 1,
		fileLoop: true,
		currentTime: 0,
		duration: 0
	});
	const channelRef = useRef<BroadcastChannel | null>(null);
	const sourceIdRef = useRef(
		`audio-${Math.random().toString(36).slice(2)}-${Date.now()}`
	);
	const lastBroadcastMsRef = useRef(0);
	const systemPausedFileRef = useRef(false);
	const autoRecoveringAudioRef = useRef(false);
	const lastRecoveryAttemptRef = useRef(0);
	const lastTransportInteractionRef = useRef(0);
	const restoredAudioAssetIdRef = useRef<string | null>(null);
	const restoringAudioAssetRef = useRef(false);
	const restoredPlaylistTrackIdRef = useRef<string | null>(null);
	const restoringPlaylistTrackRef = useRef(false);
	const recentTrackIdsRef = useRef<string[]>([]);
	const analysisQueueRef = useRef<Promise<void>>(Promise.resolve());
	const onTrackEndRef = useRef<() => void>(() => {});
	const onCrossfadeCompleteRef = useRef<(id: string) => void>(() => {});
	const engineRef = useRef<AudioMixEngine | null>(null);
	if (!engineRef.current) {
		engineRef.current = new AudioMixEngine(
			{
				onTrackEnd: () => onTrackEndRef.current(),
				onCrossfadeComplete: id => onCrossfadeCompleteRef.current(id)
			},
			2048,
			0.8
		);
	}

	const [captureMode, setCaptureMode] = useState<
		'desktop' | 'microphone' | 'file'
	>(supportsDisplayMedia ? 'desktop' : 'microphone');
	const [isPaused, setIsPaused] = useState(false);
	const [fileVolume, setFileVolumeState] = useState(1.0);
	const [fileLoop, setFileLoopState] = useState(true);

	const audioCaptureState = useWallpaperStore(
		state => state.audioCaptureState
	);
	const setAudioPaused = useWallpaperStore(state => state.setAudioPaused);
	const fftSize = useWallpaperStore(state => state.fftSize);
	const audioSmoothing = useWallpaperStore(state => state.audioSmoothing);

	const markTransportInteraction = useCallback(() => {
		lastTransportInteractionRef.current =
			typeof performance !== 'undefined' ? performance.now() : Date.now();
	}, []);

	// Canonical bridge: the active audio element's REAL play/pause state (incl.
	// transitions driven by native OS media keys, which bypass app commands)
	// flows into the app's canonical paused flags. This is what keeps the
	// analyser snapshot — and therefore the canvas — in sync with audible audio,
	// and what stops the auto-recovery loop from fighting a manual pause.
	const lastSyncedPlayingRef = useRef<boolean | null>(null);
	const syncPlaybackStateFromElement = useCallback(
		(playing: boolean) => {
			if (lastSyncedPlayingRef.current === playing) return;
			lastSyncedPlayingRef.current = playing;
			// Mirror the element's real state into the canonical paused flags.
			// Intentionally does NOT touch systemPausedFileRef — that marker is
			// owned by the explicit system-pause/resume commands.
			markTransportInteraction();
			setIsPaused(!playing);
			setAudioPaused(!playing);
		},
		[markTransportInteraction, setAudioPaused]
	);

	useEffect(() => {
		engineRef.current?.setOnPlaybackStateChange(
			syncPlaybackStateFromElement
		);
	}, [syncPlaybackStateFromElement]);

	const setOnTrackEnd = useCallback((handler: () => void) => {
		onTrackEndRef.current = handler;
	}, []);

	const setOnCrossfadeComplete = useCallback(
		(handler: (id: string) => void) => {
			onCrossfadeCompleteRef.current = handler;
		},
		[]
	);

	const {
		resetAudioAnalysis,
		broadcastEmptyState,
		getAudioSnapshot,
		getAmplitude,
		getPeak,
		getBands,
		getFrequencyBins,
		getTimeDomainBins
	} = useAudioSnapshotRuntime({
		analyzerRef,
		engineRef,
		analysisStateRef,
		peakRef,
		snapshotRef,
		remoteSnapshotRef,
		remoteMetaRef,
		channelRef,
		sourceIdRef,
		lastBroadcastMsRef,
		audioCaptureState,
		captureMode,
		isPaused,
		fileVolume,
		fileLoop,
		fftSize,
		audioSmoothing
	});

	const {
		playTrackById,
		addTrackToPlaylist,
		removeTrackFromPlaylist,
		clearPlaylist,
		queueTrackById,
		playNextTrack,
		playPrevTrack,
		audioTransitionStyle,
		setAudioTransitionStyle
	} = useAudioPlaylistController({
		analyzerRef,
		engineRef,
		systemPausedFileRef,
		restoredPlaylistTrackIdRef,
		recentTrackIdsRef,
		analysisQueueRef,
		resetAudioAnalysis,
		broadcastEmptyState,
		setCaptureMode,
		setIsPaused,
		setFileVolumeState,
		setFileLoopState,
		setAudioPaused,
		setOnTrackEnd,
		setOnCrossfadeComplete
	});

	const {
		activateFileCapture,
		startCapture,
		startFileCapture,
		stopCapture,
		pauseCapture,
		resumeCapture,
		pauseFileForSystem,
		resumeFileFromSystem,
		seek,
		getCurrentTime,
		getDuration,
		setFileVolume,
		setFileLoop,
		getFileName
	} = useAudioCaptureController({
		analyzerRef,
		engineRef,
		systemPausedFileRef,
		restoredAudioAssetIdRef,
		remoteMetaRef,
		captureMode,
		setCaptureMode,
		setIsPaused,
		setFileVolumeState,
		setFileLoopState,
		resetAudioAnalysis,
		broadcastEmptyState,
		markTransportInteraction,
		playTrackById,
		onPlaybackStateChange: syncPlaybackStateFromElement
	});

	useAudioPlaybackEffects({
		analyzerRef,
		engineRef,
		systemPausedFileRef,
		autoRecoveringAudioRef,
		lastRecoveryAttemptRef,
		lastTransportInteractionRef,
		restoredAudioAssetIdRef,
		restoringAudioAssetRef,
		restoredPlaylistTrackIdRef,
		restoringPlaylistTrackRef,
		audioCaptureState,
		captureMode,
		setIsPaused,
		setAudioPaused,
		playTrackById,
		activateFileCapture,
		pauseCapture,
		resumeCapture,
		playNextTrack,
		playPrevTrack
	});

	const triggerMixNow = useCallback(() => {
		engineRef.current?.triggerMixNow();
	}, []);

	const getIsCrossfading = useCallback(
		() => engineRef.current?.getIsCrossfading() ?? false,
		[]
	);

	const getCrossfadeProgress = useCallback(
		() => engineRef.current?.getCrossfadeProgress() ?? 0,
		[]
	);

	const value: AudioDataContextValue = useMemo(
		() => ({
			getAudioSnapshot,
			getAmplitude,
			getPeak,
			getBands,
			getFrequencyBins,
			getTimeDomainBins,
			startCapture,
			startFileCapture,
			stopCapture,
			captureMode,
			isPaused,
			pauseCapture,
			pauseFileForSystem,
			resumeCapture,
			resumeFileFromSystem,
			seek,
			getCurrentTime,
			getDuration,
			setFileVolume,
			setFileLoop,
			getFileName,
			fileVolume,
			fileLoop,
			addTrackToPlaylist,
			removeTrackFromPlaylist,
			clearPlaylist,
			playTrackById,
			playNextTrack,
			playPrevTrack,
			queueTrackById,
			triggerMixNow,
			getIsCrossfading,
			getCrossfadeProgress,
			transitionStyle: audioTransitionStyle,
			setTransitionStyle: setAudioTransitionStyle
		}),
		[
			addTrackToPlaylist,
			audioTransitionStyle,
			captureMode,
			clearPlaylist,
			fileLoop,
			fileVolume,
			getAmplitude,
			getAudioSnapshot,
			getBands,
			getCrossfadeProgress,
			getCurrentTime,
			getDuration,
			getFileName,
			getFrequencyBins,
			getTimeDomainBins,
			getIsCrossfading,
			getPeak,
			isPaused,
			pauseCapture,
			pauseFileForSystem,
			playNextTrack,
			playPrevTrack,
			playTrackById,
			queueTrackById,
			removeTrackFromPlaylist,
			resumeCapture,
			resumeFileFromSystem,
			seek,
			setAudioTransitionStyle,
			setFileLoop,
			setFileVolume,
			startCapture,
			startFileCapture,
			stopCapture,
			triggerMixNow
		]
	);

	return (
		<AudioDataContext.Provider value={value}>
			{children}
		</AudioDataContext.Provider>
	);
}
