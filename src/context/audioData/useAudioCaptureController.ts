import {
	useCallback,
	type Dispatch,
	type MutableRefObject,
	type SetStateAction
} from 'react';
import { DesktopAudioAnalyzer } from '@/lib/audio/DesktopAudioAnalyzer';
import { MicrophoneAnalyzer } from '@/lib/audio/MicrophoneAnalyzer';
import { FileAudioAnalyzer } from '@/lib/audio/FileAudioAnalyzer';
import { saveImage } from '@/lib/db/imageDb';
import type { IAudioSourceAdapter } from '@/lib/audio/types';
import { AudioMixEngine } from '@/lib/audio/AudioMixEngine';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type { AudioSourceMode } from '@/types/wallpaper';
import { supportsDisplayMedia } from './audioDataShared';
import type { RemoteAudioMeta } from './audioDataShared';

type UseAudioCaptureControllerOptions = {
	analyzerRef: MutableRefObject<IAudioSourceAdapter | null>;
	engineRef: MutableRefObject<AudioMixEngine | null>;
	systemPausedFileRef: MutableRefObject<boolean>;
	restoredAudioAssetIdRef: MutableRefObject<string | null>;
	remoteMetaRef: MutableRefObject<RemoteAudioMeta>;
	captureMode: 'desktop' | 'microphone' | 'file';
	setCaptureMode: Dispatch<SetStateAction<'desktop' | 'microphone' | 'file'>>;
	setIsPaused: Dispatch<SetStateAction<boolean>>;
	setFileVolumeState: Dispatch<SetStateAction<number>>;
	setFileLoopState: Dispatch<SetStateAction<boolean>>;
	resetAudioAnalysis: () => void;
	broadcastEmptyState: () => void;
	markTransportInteraction: () => void;
	playTrackById: (id: string) => Promise<void>;
	onPlaybackStateChange: (playing: boolean) => void;
};

export function useAudioCaptureController({
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
	onPlaybackStateChange
}: UseAudioCaptureControllerOptions) {
	const audioSmoothing = useWallpaperStore(state => state.audioSmoothing);
	const fftSize = useWallpaperStore(state => state.fftSize);
	const audioFileName = useWallpaperStore(state => state.audioFileName);
	const setAudioCaptureState = useWallpaperStore(
		state => state.setAudioCaptureState
	);
	const setAudioSourceMode = useWallpaperStore(
		state => state.setAudioSourceMode
	);
	const setAudioFileAssetId = useWallpaperStore(
		state => state.setAudioFileAssetId
	);
	const setAudioFileName = useWallpaperStore(state => state.setAudioFileName);
	const setPersistedAudioFileVolume = useWallpaperStore(
		state => state.setAudioFileVolume
	);
	const setPersistedAudioFileLoop = useWallpaperStore(
		state => state.setAudioFileLoop
	);
	const setAudioPaused = useWallpaperStore(state => state.setAudioPaused);

	const activateFileCapture = useCallback(
		async function activateFileCapture(
			file: File,
			options?: {
				assetId?: string | null;
				persistAsset?: boolean;
				volume?: number;
				loop?: boolean;
				sourceMode?: AudioSourceMode;
				startPaused?: boolean;
			}
		) {
			systemPausedFileRef.current = false;
			resetAudioAnalysis();
			setAudioPaused(false);
			if (analyzerRef.current) {
				analyzerRef.current.stop();
				analyzerRef.current = null;
			}
			setAudioCaptureState('requesting');

			const nextVolume = options?.volume ?? 1;
			const nextLoop = options?.loop ?? true;

			try {
				const assetId =
					options?.persistAsset === false
						? (options.assetId ?? null)
						: ((options?.assetId ?? (await saveImage(file))) as
								| string
								| null);
				const analyzer = new FileAudioAnalyzer(
					file,
					fftSize,
					audioSmoothing
				);
				await analyzer.start();
				analyzer.setVolume(nextVolume);
				analyzer.setLoop(nextLoop);
				if (options?.startPaused) {
					analyzer.pause();
					systemPausedFileRef.current = true;
				}
				// Wire AFTER the initial start/pause dance so setup transitions
				// don't emit a spurious sync; from here, real element play/pause
				// (incl. native media keys) flows to the canonical paused flags.
				analyzer.setOnPlaybackStateChange?.(onPlaybackStateChange);
				analyzerRef.current = analyzer;
				setCaptureMode('file');
				setIsPaused(Boolean(options?.startPaused));
				setAudioPaused(Boolean(options?.startPaused));
				setFileVolumeState(nextVolume);
				setFileLoopState(nextLoop);
				setAudioSourceMode(options?.sourceMode ?? 'file');
				setAudioFileAssetId(assetId);
				setAudioFileName(file.name);
				setPersistedAudioFileVolume(nextVolume);
				setPersistedAudioFileLoop(nextLoop);
				if (assetId) {
					restoredAudioAssetIdRef.current = assetId;
				}
				setAudioCaptureState('active');
			} catch {
				analyzerRef.current = null;
				setAudioCaptureState('error');
			}
		},
		[
			analyzerRef,
			audioSmoothing,
			fftSize,
			onPlaybackStateChange,
			resetAudioAnalysis,
			restoredAudioAssetIdRef,
			setAudioCaptureState,
			setAudioFileAssetId,
			setAudioFileName,
			setAudioPaused,
			setAudioSourceMode,
			setCaptureMode,
			setFileLoopState,
			setFileVolumeState,
			setIsPaused,
			setPersistedAudioFileLoop,
			setPersistedAudioFileVolume,
			systemPausedFileRef
		]
	);

	const startCapture = useCallback(
		async function startCapture() {
			systemPausedFileRef.current = false;
			resetAudioAnalysis();
			setAudioPaused(false);
			if (analyzerRef.current) {
				analyzerRef.current.stop();
				analyzerRef.current = null;
			}
			setAudioCaptureState('requesting');
			try {
				const analyzer = supportsDisplayMedia
					? new DesktopAudioAnalyzer(fftSize, audioSmoothing)
					: new MicrophoneAnalyzer(fftSize, audioSmoothing);
				await analyzer.start();
				analyzerRef.current = analyzer;
				const nextMode = supportsDisplayMedia
					? 'desktop'
					: 'microphone';
				setCaptureMode(nextMode);
				setAudioSourceMode(nextMode);
				setAudioCaptureState('active');
			} catch (err) {
				analyzerRef.current = null;
				if (err instanceof Error) {
					if (err.message === 'no-audio-track') {
						setAudioCaptureState('no-audio-track');
					} else if (err.name === 'NotAllowedError') {
						setAudioCaptureState('denied');
					} else {
						setAudioCaptureState('error');
					}
				} else {
					setAudioCaptureState('error');
				}
			}
		},
		[
			analyzerRef,
			audioSmoothing,
			fftSize,
			resetAudioAnalysis,
			setAudioCaptureState,
			setAudioPaused,
			setAudioSourceMode,
			setCaptureMode,
			systemPausedFileRef
		]
	);

	const startFileCapture = useCallback(
		async function startFileCapture(file: File) {
			await activateFileCapture(file, {
				persistAsset: true,
				volume: 1,
				loop: true,
				sourceMode: 'file'
			});
		},
		[activateFileCapture]
	);

	const stopCapture = useCallback(
		function stopCapture() {
			analyzerRef.current?.stop();
			analyzerRef.current = null;
			engineRef.current?.stopAll();
			systemPausedFileRef.current = false;
			setAudioPaused(false);
			setAudioSourceMode('none');
			setCaptureMode(supportsDisplayMedia ? 'desktop' : 'microphone');
			setAudioCaptureState('idle');
			setIsPaused(false);
			resetAudioAnalysis();
			broadcastEmptyState();
		},
		[
			analyzerRef,
			broadcastEmptyState,
			engineRef,
			resetAudioAnalysis,
			setAudioCaptureState,
			setAudioPaused,
			setAudioSourceMode,
			setCaptureMode,
			setIsPaused,
			systemPausedFileRef
		]
	);

	const pauseCapture = useCallback(
		function pauseCapture() {
			markTransportInteraction();
			systemPausedFileRef.current = false;
			if (engineRef.current?.hasActive()) {
				engineRef.current.pause();
			} else {
				analyzerRef.current?.pause?.();
			}
			setIsPaused(true);
			setAudioPaused(true);
		},
		[
			analyzerRef,
			engineRef,
			markTransportInteraction,
			setAudioPaused,
			setIsPaused,
			systemPausedFileRef
		]
	);

	const resumeCapture = useCallback(
		function resumeCapture() {
			markTransportInteraction();
			systemPausedFileRef.current = false;
			if (engineRef.current?.hasActive()) {
				engineRef.current.resume();
			} else {
				analyzerRef.current?.resume?.();
			}
			setIsPaused(false);
			setAudioPaused(false);
		},
		[
			analyzerRef,
			engineRef,
			markTransportInteraction,
			setAudioPaused,
			setIsPaused,
			systemPausedFileRef
		]
	);

	const pauseFileForSystem = useCallback(
		function pauseFileForSystem() {
			if (captureMode !== 'file') return;
			markTransportInteraction();
			if (engineRef.current?.hasActive()) {
				engineRef.current.pause();
			} else {
				analyzerRef.current?.pause?.();
			}
			setIsPaused(true);
			systemPausedFileRef.current = true;
			setAudioPaused(true);
		},
		[
			analyzerRef,
			captureMode,
			engineRef,
			markTransportInteraction,
			setAudioPaused,
			setIsPaused,
			systemPausedFileRef
		]
	);

	const resumeFileFromSystem = useCallback(
		function resumeFileFromSystem() {
			if (captureMode !== 'file') return;
			markTransportInteraction();
			if (engineRef.current?.hasActive()) {
				engineRef.current.resume();
			} else {
				const activeId =
					useWallpaperStore.getState().activeAudioTrackId;
				if (analyzerRef.current) {
					analyzerRef.current.resume?.();
				} else if (activeId) {
					void playTrackById(activeId);
				}
			}
			setIsPaused(false);
			systemPausedFileRef.current = false;
			setAudioPaused(false);
		},
		[
			analyzerRef,
			captureMode,
			engineRef,
			markTransportInteraction,
			playTrackById,
			setAudioPaused,
			setIsPaused,
			systemPausedFileRef
		]
	);

	const seek = useCallback(
		function seek(time: number) {
			markTransportInteraction();
			if (engineRef.current?.hasActive()) {
				engineRef.current.seek(time);
			} else {
				analyzerRef.current?.seek?.(time);
			}
		},
		[analyzerRef, engineRef, markTransportInteraction]
	);

	const getCurrentTime = useCallback(
		function getCurrentTime() {
			if (engineRef.current?.hasActive()) {
				return engineRef.current.getCurrentTime();
			}
			return (
				analyzerRef.current?.getCurrentTime?.() ??
				remoteMetaRef.current.currentTime
			);
		},
		[analyzerRef, engineRef, remoteMetaRef]
	);

	const getDuration = useCallback(
		function getDuration() {
			if (engineRef.current?.hasActive()) {
				return engineRef.current.getDuration();
			}
			return (
				analyzerRef.current?.getDuration?.() ??
				remoteMetaRef.current.duration
			);
		},
		[analyzerRef, engineRef, remoteMetaRef]
	);

	const setFileVolume = useCallback(
		function setFileVolume(v: number) {
			setFileVolumeState(v);
			if (engineRef.current?.hasActive()) {
				engineRef.current.setActiveVolume(v);
				const activeId =
					useWallpaperStore.getState().activeAudioTrackId;
				if (activeId) {
					useWallpaperStore
						.getState()
						.updateAudioTrack(activeId, { volume: v });
				}
			} else {
				setPersistedAudioFileVolume(v);
				analyzerRef.current?.setVolume?.(v);
			}
		},
		[
			analyzerRef,
			engineRef,
			setFileVolumeState,
			setPersistedAudioFileVolume
		]
	);

	const setFileLoop = useCallback(
		function setFileLoop(v: boolean) {
			setFileLoopState(v);
			if (engineRef.current?.hasActive()) {
				engineRef.current.setActiveLoop(v);
				const activeId =
					useWallpaperStore.getState().activeAudioTrackId;
				if (activeId) {
					useWallpaperStore
						.getState()
						.updateAudioTrack(activeId, { loop: v });
				}
			} else {
				setPersistedAudioFileLoop(v);
				analyzerRef.current?.setLoop?.(v);
			}
		},
		[analyzerRef, engineRef, setFileLoopState, setPersistedAudioFileLoop]
	);

	const getFileName = useCallback(
		function getFileName() {
			const state = useWallpaperStore.getState();
			const engineActiveTrackId =
				engineRef.current?.getActiveTrackId() ?? null;
			if (engineActiveTrackId) {
				const track = state.audioTracks.find(
					item => item.id === engineActiveTrackId
				);
				if (track?.name) {
					return track.name;
				}
			}
			if (analyzerRef.current) {
				const runtimeFileName = analyzerRef.current.getFileName?.();
				if (runtimeFileName) {
					return runtimeFileName;
				}
			}
			if (state.activeAudioTrackId) {
				const track = state.audioTracks.find(
					item => item.id === state.activeAudioTrackId
				);
				if (track?.name) {
					return track.name;
				}
			}
			return audioFileName ?? remoteMetaRef.current.fileName ?? '';
		},
		[analyzerRef, audioFileName, engineRef, remoteMetaRef]
	);

	return {
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
	};
}
