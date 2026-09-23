import { useState } from 'react';
import WallpaperViewport from '@/components/wallpaper/WallpaperViewport';
import ControlPanel from '@/components/controls/ControlPanel';
import DragModeOverlay from '@/components/wallpaper/DragModeOverlay';
import { usePresetDirtyTracker } from '@/hooks/usePresetDirtyTracker';
import { useBroadcastWallpaperChanges } from '@/hooks/useWallpaperPreviewSync';
import { useWindowPresentationControls } from '@/hooks/useWindowPresentationControls';
import OutputModeDevDiagnostics from '@/components/app/OutputModeDevDiagnostics';
import { useRuntimeUiMode } from '@/runtime/useRuntimeUiMode';
import StoragePersistenceNotice from '@/components/app/StoragePersistenceNotice';
import OfflineExportProgressBar from '@/components/app/OfflineExportProgressBar';

export default function EditorPage() {
	const [panelOpen, setPanelOpen] = useState(false);
	const [overlayOpen, setOverlayOpen] = useState(false);
	const { isEditMode } = useRuntimeUiMode();
	const { isMiniPlayerOpen, toggleMiniPlayer } =
		useWindowPresentationControls();
	usePresetDirtyTracker();
	useBroadcastWallpaperChanges();

	const editorOnlyMode = isMiniPlayerOpen;
	const effectivePanelOpen = !editorOnlyMode && panelOpen;
	const effectiveOverlayOpen = editorOnlyMode || overlayOpen;

	return (
		<>
			<WallpaperViewport
				editorMode
				interactionVisible={
					!editorOnlyMode && (panelOpen || overlayOpen)
				}
				sceneVisible={!editorOnlyMode}
			/>
			<ControlPanel
				open={effectivePanelOpen}
				maximized={effectiveOverlayOpen}
				forceMaximized={editorOnlyMode}
				onOpenChange={setPanelOpen}
				onMaximizedChange={setOverlayOpen}
				onForceClose={() => void toggleMiniPlayer()}
			/>
			<DragModeOverlay />
			<OfflineExportProgressBar />
			<StoragePersistenceNotice />
			{import.meta.env.DEV && isEditMode ? (
				<OutputModeDevDiagnostics
					editorShellMounted
					hudMounted
					diagnosticsMounted
				/>
			) : null}
		</>
	);
}
