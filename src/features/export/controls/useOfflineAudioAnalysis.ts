import { useState } from 'react';
import { createOfflineAudioAnalysisSourceFromReader } from '@/features/export/offlineAudioAnalysis';
import { openOfflineAudioTrack } from '@/features/export/video/offlineAudioTrack';
import type { OfflineExportAudioAssetRef } from '@/features/export/offlineExportPlanner';
import { loadImageBlob } from '@/lib/db/imageDb';
import { formatBytes, formatDuration } from '@/features/export/exportFileUtils';

export type OfflineAnalysisStatus = 'idle' | 'running' | 'ready' | 'error';

type UseOfflineAudioAnalysisArgs = {
	offlineAudioAsset: OfflineExportAudioAssetRef | null;
	fftSize: number;
	audioSmoothing: number;
};

export function useOfflineAudioAnalysis({
	offlineAudioAsset,
	fftSize,
	audioSmoothing
}: UseOfflineAudioAnalysisArgs) {
	const [offlineAnalysisStatus, setOfflineAnalysisStatus] =
		useState<OfflineAnalysisStatus>('idle');
	const [offlineAnalysisMessage, setOfflineAnalysisMessage] = useState('');
	const canAnalyzeOfflineAudio =
		Boolean(offlineAudioAsset) && offlineAnalysisStatus !== 'running';

	async function analyzeOfflineExportAudio() {
		if (!offlineAudioAsset) {
			setOfflineAnalysisStatus('error');
			setOfflineAnalysisMessage(
				'No imported file or playlist audio found.'
			);
			return;
		}

		try {
			setOfflineAnalysisStatus('running');
			setOfflineAnalysisMessage(
				'Decoding audio and building deterministic snapshot...'
			);
			const blob = await loadImageBlob(offlineAudioAsset.assetId);
			if (!blob) {
				throw new Error('audio-asset-not-found');
			}
			// Streamed path: metadata + one pumped window, never the whole
			// decoded song in RAM.
			const track = await openOfflineAudioTrack(blob, { fftSize });
			const source = createOfflineAudioAnalysisSourceFromReader(track, {
				fftSize,
				smoothingTimeConstant: audioSmoothing
			});

			try {
				const sampleTimeMs = Math.min(
					source.summary.durationMs,
					Math.max(1000, source.summary.durationMs * 0.25)
				);
				await track.ensureWindow(
					Math.round((sampleTimeMs / 1000) * track.sampleRate)
				);
				const snapshot = source.getSnapshotAt(sampleTimeMs);
				setOfflineAnalysisStatus('ready');
				setOfflineAnalysisMessage(
					`${formatDuration(Math.round(source.summary.durationMs / 1000))} · ${snapshot.bins.length} bins · amp ${snapshot.amplitude.toFixed(3)} · decoded ${formatBytes(source.summary.estimatedDecodedBytes)} · memory ${source.summary.memoryRisk}`
				);
			} finally {
				source.dispose();
				track.dispose();
			}
		} catch (error) {
			setOfflineAnalysisStatus('error');
			setOfflineAnalysisMessage(
				error instanceof Error
					? error.message
					: 'offline-audio-analysis-failed'
			);
		}
	}

	return {
		analyzeOfflineExportAudio,
		canAnalyzeOfflineAudio,
		offlineAnalysisMessage,
		offlineAnalysisStatus
	};
}
