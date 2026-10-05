import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRuntimeUiMode } from '@/runtime/useRuntimeUiMode';
import { useOutputPerformanceStore } from '@/runtime/outputPerformanceStore';
import { resolveOutputCanvasBacking } from '@/runtime/outputRenderQuality';
import { useOutputFpsDebugVisible } from '@/runtime/outputDebugOverlay';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioData } from '@/hooks/useAudioData';
import { classifyAnalyserState } from '@/context/audioData/playbackDiagnostics';
import {
	formatStorageBytes,
	formatStorageEstimate,
	readStorageEstimate,
	type StorageEstimateSnapshot
} from '@/lib/db/storageDiagnostics';
import { persistedStateWriter } from '@/store/persistedStateStorage';
import {
	getMediaTrackDiagnostics,
	getMediaTrackDiagnosticsVersion,
	subscribeMediaTrackDiagnostics
} from '@/context/audioData/mediaTrackRuntime';

/** How often the overlay refreshes the quota numbers. */
const STORAGE_POLL_MS = 5_000;

type FrameSample = {
	fps: number;
	frameMs: number;
	/** Peak analyser amplitude observed over the sample window (0–1). */
	peakAmplitude: number;
};

function measureFps(sampleAmplitude: () => number): Promise<FrameSample> {
	return new Promise(resolve => {
		const samples: number[] = [];
		let last = performance.now();
		let frames = 0;
		let peakAmplitude = 0;
		const start = last;

		function tick(now: number) {
			frames += 1;
			samples.push(now - last);
			peakAmplitude = Math.max(peakAmplitude, sampleAmplitude());
			last = now;
			if (now - start < 900) {
				requestAnimationFrame(tick);
				return;
			}
			const avgFrame =
				samples.reduce((a, b) => a + b, 0) /
				Math.max(samples.length, 1);
			const elapsedSec = (now - start) / 1000;
			resolve({
				fps: frames / Math.max(elapsedSec, 0.001),
				frameMs: avgFrame,
				peakAmplitude
			});
		}

		requestAnimationFrame(tick);
	});
}

/** DEV-only output shell diagnostics. */
export default function OutputModeDevDiagnostics({
	editorShellMounted,
	hudMounted,
	diagnosticsMounted
}: {
	editorShellMounted: boolean;
	hudMounted: boolean;
	diagnosticsMounted: boolean;
}) {
	const { mode } = useRuntimeUiMode();
	const recordingRenderScale = useOutputPerformanceStore(
		s => s.recordingRenderScale
	);
	const performanceMode = useWallpaperStore(s => s.performanceMode);
	const audioPaused = useWallpaperStore(s => s.audioPaused);
	const audioCaptureState = useWallpaperStore(s => s.audioCaptureState);
	const activeAudioTrackId = useWallpaperStore(s => s.activeAudioTrackId);
	const audioTracks = useWallpaperStore(s => s.audioTracks);
	useSyncExternalStore(
		subscribeMediaTrackDiagnostics,
		getMediaTrackDiagnosticsVersion,
		getMediaTrackDiagnosticsVersion
	);
	const trackDiag = getMediaTrackDiagnostics();
	const { getAmplitude } = useAudioData();
	const debugVisible = useOutputFpsDebugVisible();
	const [sample, setSample] = useState<FrameSample | null>(null);
	// Storage is the one diagnostic that explains two unrelated-looking
	// symptoms at once: a failed export and "changes are not being saved". Both
	// draw on the same per-origin quota, so the numbers belong on screen next
	// to the render stats rather than only in the console.
	const [storage, setStorage] = useState<StorageEstimateSnapshot | null>(
		null
	);
	const [writerStats, setWriterStats] = useState(() =>
		persistedStateWriter.getStats()
	);
	const mountedRef = useRef(true);
	const getAmplitudeRef = useRef(getAmplitude);
	getAmplitudeRef.current = getAmplitude;

	// Gated on `debugVisible` because the early return below is a RENDER guard,
	// not an effect guard: without this dependency the sampler kept a permanent
	// RAF loop alive measuring frames for an overlay nobody was looking at. In
	// DEV this component is always mounted, so that cost was always paid.
	useEffect(() => {
		if (!debugVisible) return undefined;
		mountedRef.current = true;
		let raf = 0;
		const run = async () => {
			const next = await measureFps(() => getAmplitudeRef.current());
			if (mountedRef.current) setSample(next);
			raf = window.requestAnimationFrame(() => {
				void run();
			});
		};
		void run();
		return () => {
			mountedRef.current = false;
			cancelAnimationFrame(raf);
		};
	}, [debugVisible]);

	// Same `debugVisible` gate as the sampler: no polling for an overlay
	// nobody is looking at.
	useEffect(() => {
		if (!debugVisible) return undefined;
		let active = true;
		const read = () => {
			setWriterStats(persistedStateWriter.getStats());
			void readStorageEstimate().then(next => {
				if (active) setStorage(next);
			});
		};
		read();
		const id = window.setInterval(read, STORAGE_POLL_MS);
		return () => {
			active = false;
			window.clearInterval(id);
		};
	}, [debugVisible]);

	// Opt-in only: DEV builds always show it; production builds (the OBS
	// recording target) show it via `?debug=fps` or the Ctrl+Shift+F toggle.
	// Never visible by default, so it can't leak into a real recording.
	if (!debugVisible) return null;

	const backing = resolveOutputCanvasBacking();
	const mediaSessionState =
		typeof navigator !== 'undefined' && 'mediaSession' in navigator
			? navigator.mediaSession.playbackState
			: 'unsupported';
	const diagnosis = classifyAnalyserState({
		captureState: audioCaptureState,
		audioPaused,
		peakAmplitude: sample?.peakAmplitude ?? 0
	});
	const analyserActive = diagnosis === 'playing-active';
	// The diagnostic signature of the canvas-frozen bug: app says playing, audio
	// is meant to be audible, but the analyser produces no signal.
	const audioPlayingButAnalyserInactive = diagnosis === 'playing-inactive';

	const trackIndex = audioTracks.findIndex(t => t.id === activeAudioTrackId);
	const currentTrackTitle =
		trackIndex >= 0
			? audioTracks[trackIndex]!.name.replace(/\.[^.]+$/, '')
			: 'none';

	return (
		<div className="pointer-events-none fixed bottom-3 left-3 z-[130] rounded border border-white/15 bg-black/70 px-3 py-2 font-mono text-[10px] leading-relaxed text-white/75">
			<div>output mode: {mode}</div>
			<div>perf mode: {performanceMode}</div>
			<div>editor shell mounted: {editorShellMounted ? 'yes' : 'no'}</div>
			<div>HUD mounted: {hudMounted ? 'yes' : 'no'}</div>
			<div>diagnostics mounted: {diagnosticsMounted ? 'yes' : 'no'}</div>
			<div>
				backing: {backing.backingWidth}×{backing.backingHeight} · css:{' '}
				{backing.cssWidth}×{backing.cssHeight}
			</div>
			<div>
				DPR: {backing.effectiveDpr.toFixed(2)} · render scale:{' '}
				{recordingRenderScale.toFixed(2)}
			</div>
			<div>
				approx FPS: {sample ? sample.fps.toFixed(1) : '…'} · frame:{' '}
				{sample ? `${sample.frameMs.toFixed(2)} ms` : '…'}
			</div>
			<div className="mt-1 border-t border-white/10 pt-1">
				audio: {audioCaptureState} ·{' '}
				{audioPaused ? 'paused' : 'playing'}
			</div>
			<div>
				track: {currentTrackTitle} ·{' '}
				{trackIndex >= 0 ? trackIndex + 1 : 0}/{audioTracks.length}
			</div>
			<div>mediaSession: {mediaSessionState}</div>
			<div>
				last cmd: {trackDiag.lastResolvedCommand ?? '—'} (
				{trackDiag.lastTrackCommandSource ?? '—'}) · dedupe:{' '}
				{trackDiag.lastSuppressedByDedupe === null
					? '—'
					: trackDiag.lastSuppressedByDedupe
						? 'suppressed'
						: 'ran'}
			</div>
			<div>
				last media-session: {trackDiag.lastMediaSessionAction ?? '—'}
			</div>
			<div>
				last key: {trackDiag.lastKeyboardEventKey ?? '—'} /{' '}
				{trackDiag.lastKeyboardEventCode ?? '—'} ·{' '}
				{trackDiag.lastKeyboardModifiers ?? '—'}
			</div>
			<div>
				analyser peak: {sample ? sample.peakAmplitude.toFixed(3) : '…'}{' '}
				· {analyserActive ? 'active' : 'inactive'}
			</div>
			{audioPlayingButAnalyserInactive ? (
				<div className="text-amber-400">
					⚠ audio playing but analyser inactive
				</div>
			) : null}
			<div className="mt-1 border-t border-white/10 pt-1">
				storage: {storage ? formatStorageEstimate(storage) : '…'}
			</div>
			<div>
				state saves: {writerStats.writes} · coalesced:{' '}
				{writerStats.coalesced} · pending:{' '}
				{writerStats.pendingKeys.length}
				{writerStats.lastWriteAt === null
					? ''
					: ` · last ${Math.round((Date.now() - writerStats.lastWriteAt) / 1000)}s ago`}
			</div>
			{writerStats.suspended ? (
				<div className="text-amber-400">
					⚠ auto-save paused ({writerStats.lastErrorName ?? 'error'})
					— project kept in memory
				</div>
			) : null}
			{storage && storage.availableBytes !== null ? (
				<div
					className={
						storage.availableBytes < 2 * 1024 * 1024 * 1024
							? 'text-amber-400'
							: 'text-white/60'
					}
				>
					headroom: {formatStorageBytes(storage.availableBytes)}
				</div>
			) : null}
			<div className="mt-1 text-white/40">Ctrl+Shift+F to hide</div>
		</div>
	);
}
