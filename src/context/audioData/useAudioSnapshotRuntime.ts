import { useCallback, useEffect, type MutableRefObject } from 'react';
import {
	analyzeAudioChannels,
	createAudioAnalysisState,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';
import type { IAudioSourceAdapter } from '@/lib/audio/types';
import { AudioMixEngine } from '@/lib/audio/AudioMixEngine';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type { AudioCaptureState } from '@/types/wallpaper';
import {
	AUDIO_SYNC_CHANNEL,
	AUDIO_SYNC_INTERVAL_MS,
	AUDIO_SYNC_STALE_MS,
	type AudioSyncMessage,
	EMPTY_AUDIO_SNAPSHOT,
	type RemoteAudioMeta
} from './audioDataShared';

type UseAudioSnapshotRuntimeOptions = {
	analyzerRef: MutableRefObject<IAudioSourceAdapter | null>;
	engineRef: MutableRefObject<AudioMixEngine | null>;
	analysisStateRef: MutableRefObject<
		ReturnType<typeof createAudioAnalysisState>
	>;
	peakRef: MutableRefObject<number>;
	snapshotRef: MutableRefObject<AudioSnapshot>;
	remoteSnapshotRef: MutableRefObject<AudioSnapshot>;
	remoteMetaRef: MutableRefObject<RemoteAudioMeta>;
	channelRef: MutableRefObject<BroadcastChannel | null>;
	sourceIdRef: MutableRefObject<string>;
	lastBroadcastMsRef: MutableRefObject<number>;
	audioCaptureState: AudioCaptureState;
	captureMode: 'desktop' | 'microphone' | 'file';
	isPaused: boolean;
	fileVolume: number;
	fileLoop: boolean;
	fftSize: number;
	audioSmoothing: number;
};

export function useAudioSnapshotRuntime({
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
}: UseAudioSnapshotRuntimeOptions) {
	const resetAudioAnalysis = useCallback(
		function resetAudioAnalysis() {
			analysisStateRef.current = createAudioAnalysisState();
			peakRef.current = 0;
			snapshotRef.current = {
				...EMPTY_AUDIO_SNAPSHOT,
				bins: new Uint8Array(0),
				channels: { ...EMPTY_AUDIO_SNAPSHOT.channels }
			};
		},
		[analysisStateRef, peakRef, snapshotRef]
	);

	const broadcastSnapshot = useCallback(
		(snapshot: AudioSnapshot) => {
			const channel = channelRef.current;
			if (!channel) return;
			const now =
				typeof performance !== 'undefined'
					? performance.now()
					: Date.now();
			if (now - lastBroadcastMsRef.current < AUDIO_SYNC_INTERVAL_MS) {
				return;
			}
			lastBroadcastMsRef.current = now;
			const hasEngine = engineRef.current?.hasActive() ?? false;

			// `timeDomain` is intentionally NOT cloned into the cross-tab
			// payload — only the local oscilloscope renderer consumes it
			// and the extra ~2 KB per frame is wasteful over BroadcastChannel.
			channel.postMessage({
				sourceId: sourceIdRef.current,
				snapshot: {
					...snapshot,
					bins: new Uint8Array(snapshot.bins),
					timeDomain: undefined,
					channels: { ...snapshot.channels }
				},
				captureMode,
				isPaused,
				fileName: analyzerRef.current?.getFileName?.() ?? '',
				fileVolume,
				fileLoop,
				currentTime: hasEngine
					? (engineRef.current?.getCurrentTime() ?? 0)
					: (analyzerRef.current?.getCurrentTime?.() ?? 0),
				duration: hasEngine
					? (engineRef.current?.getDuration() ?? 0)
					: (analyzerRef.current?.getDuration?.() ?? 0)
			} satisfies AudioSyncMessage);
		},
		[
			analyzerRef,
			captureMode,
			channelRef,
			engineRef,
			fileLoop,
			fileVolume,
			isPaused,
			lastBroadcastMsRef,
			sourceIdRef
		]
	);

	const broadcastEmptyState = useCallback(() => {
		const channel = channelRef.current;
		if (!channel) return;

		channel.postMessage({
			sourceId: sourceIdRef.current,
			snapshot: {
				...EMPTY_AUDIO_SNAPSHOT,
				bins: new Uint8Array(0),
				channels: { ...EMPTY_AUDIO_SNAPSHOT.channels },
				timestampMs:
					typeof performance !== 'undefined'
						? performance.now()
						: Date.now()
			},
			captureMode,
			isPaused: true,
			fileName: '',
			fileVolume,
			fileLoop,
			currentTime: 0,
			duration: 0
		} satisfies AudioSyncMessage);
	}, [captureMode, channelRef, fileLoop, fileVolume, sourceIdRef]);

	useEffect(() => {
		if (typeof BroadcastChannel === 'undefined') return undefined;

		const channel = new BroadcastChannel(AUDIO_SYNC_CHANNEL);
		channelRef.current = channel;

		const handleMessage = (event: MessageEvent<AudioSyncMessage>) => {
			const payload = event.data;
			if (!payload || payload.sourceId === sourceIdRef.current) return;
			if (analyzerRef.current || engineRef.current?.hasActive()) return;

			remoteSnapshotRef.current = {
				...payload.snapshot,
				bins: new Uint8Array(payload.snapshot.bins),
				channels: { ...payload.snapshot.channels }
			};
			remoteMetaRef.current = {
				captureMode: payload.captureMode,
				isPaused: payload.isPaused,
				fileName: payload.fileName,
				fileVolume: payload.fileVolume,
				fileLoop: payload.fileLoop,
				currentTime: payload.currentTime,
				duration: payload.duration
			};
		};

		channel.addEventListener('message', handleMessage);

		return () => {
			channel.removeEventListener('message', handleMessage);
			channel.close();
			channelRef.current = null;
		};
	}, [
		analyzerRef,
		channelRef,
		engineRef,
		remoteMetaRef,
		remoteSnapshotRef,
		sourceIdRef
	]);

	useEffect(() => {
		if (audioCaptureState === 'idle' && analyzerRef.current) {
			analyzerRef.current.stop();
			analyzerRef.current = null;
			resetAudioAnalysis();
			broadcastEmptyState();
		}
	}, [
		analyzerRef,
		audioCaptureState,
		broadcastEmptyState,
		resetAudioAnalysis
	]);

	useEffect(() => {
		const analyzer = analyzerRef.current;
		const engine = engineRef.current;
		return () => {
			analyzer?.stop();
			engine?.stopAll();
			resetAudioAnalysis();
		};
	}, [analyzerRef, engineRef, resetAudioAnalysis]);

	useEffect(() => {
		analyzerRef.current?.setAnalysisConfig?.(fftSize, audioSmoothing);
		engineRef.current?.setAnalysisConfig(fftSize, audioSmoothing);
	}, [analyzerRef, audioSmoothing, engineRef, fftSize]);

	const getAudioSnapshot = useCallback(() => {
		const store = useWallpaperStore.getState();
		const fileTransportPaused = captureMode === 'file' && isPaused;
		if (store.audioPaused || fileTransportPaused) {
			return {
				...EMPTY_AUDIO_SNAPSHOT,
				bins: new Uint8Array(0),
				channels: { ...EMPTY_AUDIO_SNAPSHOT.channels },
				timestampMs:
					typeof performance !== 'undefined' ? performance.now() : 0
			};
		}

		const timestampMs =
			typeof performance !== 'undefined' ? performance.now() : Date.now();
		const hasEngine = engineRef.current?.hasActive() ?? false;

		if (!hasEngine && !analyzerRef.current) {
			if (
				remoteSnapshotRef.current.timestampMs > 0 &&
				timestampMs - remoteSnapshotRef.current.timestampMs <
					AUDIO_SYNC_STALE_MS
			) {
				return remoteSnapshotRef.current;
			}

			return {
				...EMPTY_AUDIO_SNAPSHOT,
				bins: new Uint8Array(0),
				channels: { ...EMPTY_AUDIO_SNAPSHOT.channels },
				timestampMs
			};
		}

		if (
			snapshotRef.current.timestampMs > 0 &&
			timestampMs - snapshotRef.current.timestampMs < 8
		) {
			return snapshotRef.current;
		}

		const bins = hasEngine
			? (engineRef.current?.getMixedBins() ?? new Uint8Array(0))
			: (analyzerRef.current?.getFrequencyBins() ?? new Uint8Array(0));
		const timeDomain = hasEngine
			? (engineRef.current?.getMixedTimeDomainBins() ?? new Uint8Array(0))
			: (analyzerRef.current?.getTimeDomainBins?.() ?? new Uint8Array(0));
		let amplitude = 0;
		if (bins.length > 0) {
			let sum = 0;
			for (let index = 0; index < bins.length; index += 1) {
				sum += bins[index] ?? 0;
			}
			amplitude = sum / bins.length / 255;
		}

		peakRef.current = Math.max(peakRef.current * 0.98, amplitude);
		// Channel smoothing is NOT applied here on purpose: each subsystem
		// owns its own smoothing because a spectrum needs different physics
		// than a background zoom. The snapshot exposes raw per-frame channel
		// levels; consumers apply their own EMA via `resolveAudioChannelValue`
		// or `createAudioEnvelope`.
		const channels = analyzeAudioChannels(
			bins,
			analysisStateRef.current,
			0,
			timestampMs
		);

		snapshotRef.current = {
			bins,
			timeDomain,
			amplitude,
			peak: peakRef.current,
			channels: { ...channels },
			timestampMs
		};
		broadcastSnapshot(snapshotRef.current);

		return snapshotRef.current;
	}, [
		analyzerRef,
		analysisStateRef,
		broadcastSnapshot,
		captureMode,
		engineRef,
		isPaused,
		peakRef,
		remoteSnapshotRef,
		snapshotRef
	]);

	const getAmplitude = useCallback(
		() => getAudioSnapshot().amplitude,
		[getAudioSnapshot]
	);
	const getPeak = useCallback(
		() => getAudioSnapshot().peak,
		[getAudioSnapshot]
	);
	const getBands = useCallback(() => {
		const snapshot = getAudioSnapshot();
		return {
			bass: snapshot.channels.bass,
			mid: snapshot.channels.instrumental,
			treble: snapshot.channels.hihat
		};
	}, [getAudioSnapshot]);
	const getFrequencyBins = useCallback(
		() => getAudioSnapshot().bins,
		[getAudioSnapshot]
	);
	const getTimeDomainBins = useCallback(() => {
		if (isPaused) return new Uint8Array(0);
		if (engineRef.current?.hasActive()) {
			return engineRef.current.getMixedTimeDomainBins();
		}
		return analyzerRef.current?.getTimeDomainBins?.() ?? new Uint8Array(0);
	}, [analyzerRef, engineRef, isPaused]);

	useEffect(() => {
		if (audioCaptureState !== 'active') return undefined;

		let raf = 0;
		let alive = true;
		const tick = () => {
			if (!alive) return;
			if (engineRef.current?.hasActive()) {
				engineRef.current.tick();
				getAudioSnapshot();
			} else if (analyzerRef.current) {
				getAudioSnapshot();
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);

		return () => {
			alive = false;
			cancelAnimationFrame(raf);
		};
	}, [analyzerRef, audioCaptureState, engineRef, getAudioSnapshot]);

	return {
		resetAudioAnalysis,
		broadcastEmptyState,
		getAudioSnapshot,
		getAmplitude,
		getPeak,
		getBands,
		getFrequencyBins,
		getTimeDomainBins
	};
}
