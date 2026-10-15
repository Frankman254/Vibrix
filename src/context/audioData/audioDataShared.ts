import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { AudioTransitionStyle } from '@/types/wallpaper';

export const supportsDisplayMedia =
	typeof navigator !== 'undefined' &&
	typeof navigator.mediaDevices?.getDisplayMedia === 'function';

export const AUDIO_SYNC_CHANNEL = 'vibrix-audio-sync';
export const AUDIO_SYNC_STALE_MS = 250;
export const AUDIO_SYNC_INTERVAL_MS = 33;
export const AUDIO_TRANSPORT_GRACE_MS = 1500;
export const LARGE_TRACK_ANALYSIS_THRESHOLD_BYTES = 20 * 1024 * 1024;
export const HUGE_TRACK_ANALYSIS_THRESHOLD_BYTES = 50 * 1024 * 1024;

export type AudioSyncMessage = {
	sourceId: string;
	snapshot: AudioSnapshot;
	captureMode: 'desktop' | 'microphone' | 'file';
	isPaused: boolean;
	fileName: string;
	fileVolume: number;
	fileLoop: boolean;
	currentTime: number;
	duration: number;
};

export type RemoteAudioMeta = {
	captureMode: 'desktop' | 'microphone' | 'file';
	isPaused: boolean;
	fileName: string;
	fileVolume: number;
	fileLoop: boolean;
	currentTime: number;
	duration: number;
};

export interface AudioDataContextValue {
	getAudioSnapshot: () => AudioSnapshot;
	getAmplitude: () => number;
	getPeak: () => number;
	getBands: () => { bass: number; mid: number; treble: number };
	getFrequencyBins: () => Uint8Array;
	getTimeDomainBins: () => Uint8Array;
	startCapture: () => Promise<void>;
	startFileCapture: (file: File) => Promise<void>;
	stopCapture: () => void;
	captureMode: 'desktop' | 'microphone' | 'file';
	isPaused: boolean;
	pauseCapture: () => void;
	resumeCapture: () => void;
	pauseFileForSystem: () => void;
	resumeFileFromSystem: () => void;
	seek: (time: number) => void;
	getCurrentTime: () => number;
	getDuration: () => number;
	setFileVolume: (v: number) => void;
	setFileLoop: (v: boolean) => void;
	getFileName: () => string;
	fileVolume: number;
	fileLoop: boolean;
	addTrackToPlaylist: (
		file: File,
		assetIdOverride?: string
	) => Promise<'added' | 'duplicate'>;
	removeTrackFromPlaylist: (id: string) => void;
	clearPlaylist: () => void;
	playTrackById: (id: string) => Promise<void>;
	playNextTrack: () => Promise<void>;
	playPrevTrack: () => Promise<void>;
	queueTrackById: (id: string) => Promise<void>;
	triggerMixNow: () => void;
	getIsCrossfading: () => boolean;
	getCrossfadeProgress: () => number;
	transitionStyle: AudioTransitionStyle;
	setTransitionStyle: (v: AudioTransitionStyle) => void;
}

export const EMPTY_AUDIO_SNAPSHOT: AudioSnapshot = {
	bins: new Uint8Array(0),
	amplitude: 0,
	peak: 0,
	channels: {
		full: 0,
		kick: 0,
		instrumental: 0,
		bass: 0,
		hihat: 0,
		vocal: 0
	},
	timestampMs: 0
};
