import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRestoreWallpaperAssets } from '@/hooks/useRestoreWallpaperAssets';
import {
	formatStorageBytes,
	formatStorageEstimate,
	readStorageEstimate
} from '@/lib/db/storageDiagnostics';
import { sweepStaleOpfsExports } from '@/features/export/video/offlineOpfsSink';

/**
 * Collect scratch files abandoned by exports that never finished.
 *
 * A 1440p60 export that dies partway leaves gigabytes in OPFS, and those bytes
 * count against the same per-origin quota as the project state — so the next
 * session starts with a storage that refuses to save anything. The sweep used
 * to run only on the OPFS export path, which a Chrome user (who gets the save
 * picker and streams to their own disk) never reaches, so the debris was never
 * collected at all.
 *
 * Only this module's own `vibrix-export-*` files, and only ones untouched for
 * minutes — no project data is ever deleted to reclaim space, and an export
 * running in another tab is left alone.
 */
function useReclaimAbandonedExportFiles(enabled: boolean) {
	useEffect(() => {
		if (!enabled) return;
		void (async () => {
			const swept = await sweepStaleOpfsExports();
			if (swept.removed > 0) {
				console.info(
					`[vibrix] Reclaimed ${formatStorageBytes(swept.reclaimedBytes)} from ${swept.removed} abandoned export file(s).`
				);
			}
			if (import.meta.env.DEV) {
				console.info(
					`[vibrix] storage: ${formatStorageEstimate(await readStorageEstimate())}`
				);
			}
		})();
	}, [enabled]);
}

/** Restores persisted assets once for the shared provider tree. */
export default function AppAssetBootstrap() {
	const { pathname } = useLocation();
	const isMiniPreview =
		pathname === '/preview' &&
		typeof window !== 'undefined' &&
		window.location.hash.includes('mini=1');

	useRestoreWallpaperAssets(!isMiniPreview);
	// The mini preview is a second window on the same origin; letting it sweep
	// too would have two tabs racing over the same directory for no gain.
	useReclaimAbandonedExportFiles(!isMiniPreview);
	return null;
}
