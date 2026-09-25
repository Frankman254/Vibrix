import { useWallpaperStore } from '@/store/wallpaperStore';
import BackgroundScaleMeter from '@/components/wallpaper/BackgroundScaleMeter';
import { SpectrumDiagnosticsHud } from '@/features/spectrum/ui';
import { SpectrumManualHud } from '@/features/spectrum/ui';
import { LogoDiagnosticsHud } from '@/features/logo/ui';
import SetlistHud from '@/components/wallpaper/SetlistHud';
import GlobalCompositionHud from '@/components/wallpaper/GlobalCompositionHud';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import {
	getEditorRadiusVars,
	getScopedEditorThemeColorVars
} from '@/editor/editorTheme';

export default function DiagnosticsHudStack() {
	const showBg = useWallpaperStore(s => s.showBackgroundScaleMeter);
	const showSpectrum = useWallpaperStore(s => s.showSpectrumDiagnosticsHud);
	const showLogo = useWallpaperStore(s => s.showLogoDiagnosticsHud);
	// Manual HUD is gated by mode rather than a diagnostic toggle — it
	// surfaces whenever the user has enabled hybrid/manual drive AND kept
	// the indicator on, so they always know hotkeys are live.
	const spectrumDriveMode = useWallpaperStore(s => s.spectrumDriveMode);
	const showManual = useWallpaperStore(s => s.showSpectrumManualHud);
	const manualActive = spectrumDriveMode !== 'audio' && showManual;
	// Setlist HUD: visible when (a) a setlist is active AND (b) the user
	// has kept the indicator on. The toggle lives in the Setlists panel.
	const activeSetlistId = useWallpaperStore(s => s.activeSetlistId);
	const showSetlistHud = useWallpaperStore(s => s.showSetlistHud);
	const setlistActive = activeSetlistId !== null && showSetlistHud;
	// No toggle for this one: while the global mode ignores every per-image
	// composition, the user has to be able to see that it is on.
	const globalCompositionOverride = useWallpaperStore(
		s => s.globalCompositionOverride
	);
	const editorTheme = useWallpaperStore(s => s.editorTheme);
	const editorCornerRadius = useWallpaperStore(s => s.editorCornerRadius);
	const editorControlCornerRadius = useWallpaperStore(
		s => s.editorControlCornerRadius
	);
	const editorThemeColorSource = useWallpaperStore(
		s => s.editorThemeColorSource
	);
	const editorManualAccentColor = useWallpaperStore(
		s => s.editorManualAccentColor
	);
	const editorManualSecondaryColor = useWallpaperStore(
		s => s.editorManualSecondaryColor
	);
	const editorManualBackdropColor = useWallpaperStore(
		s => s.editorManualBackdropColor
	);
	const editorManualTextPrimaryColor = useWallpaperStore(
		s => s.editorManualTextPrimaryColor
	);
	const editorManualTextSecondaryColor = useWallpaperStore(
		s => s.editorManualTextSecondaryColor
	);
	const editorManualBackdropOpacity = useWallpaperStore(
		s => s.editorManualBackdropOpacity
	);
	const editorManualBlurPx = useWallpaperStore(s => s.editorManualBlurPx);
	const editorManualSurfaceOpacity = useWallpaperStore(
		s => s.editorManualSurfaceOpacity
	);
	const editorManualItemOpacity = useWallpaperStore(
		s => s.editorManualItemOpacity
	);
	const diagnosticsHudPositionX = useWallpaperStore(
		s => s.diagnosticsHudPositionX
	);
	const diagnosticsHudPositionY = useWallpaperStore(
		s => s.diagnosticsHudPositionY
	);
	const backgroundPalette = useBackgroundPalette();
	const themeVars = getScopedEditorThemeColorVars(
		editorThemeColorSource,
		backgroundPalette,
		editorTheme,
		{
			accent: editorManualAccentColor,
			secondary: editorManualSecondaryColor,
			backdrop: editorManualBackdropColor,
			textPrimary: editorManualTextPrimaryColor,
			textSecondary: editorManualTextSecondaryColor
		},
		{
			backdropOpacity: editorManualBackdropOpacity,
			blurPx: editorManualBlurPx,
			surfaceOpacity: editorManualSurfaceOpacity,
			itemOpacity: editorManualItemOpacity
		}
	);
	const radiusVars = getEditorRadiusVars(
		editorCornerRadius,
		editorControlCornerRadius
	);

	if (
		!showBg &&
		!showSpectrum &&
		!showLogo &&
		!manualActive &&
		!setlistActive &&
		!globalCompositionOverride
	) {
		return null;
	}

	return (
		<div
			className="pointer-events-none fixed z-130 flex w-[min(calc(100vw-1.5rem),288px)] flex-col gap-2"
			style={{
				left: `${diagnosticsHudPositionX * 100}%`,
				top: `${diagnosticsHudPositionY * 100}%`,
				...themeVars,
				...radiusVars
			}}
		>
			{globalCompositionOverride ? <GlobalCompositionHud /> : null}
			{setlistActive ? <SetlistHud /> : null}
			{showBg ? <BackgroundScaleMeter /> : null}
			{showSpectrum ? <SpectrumDiagnosticsHud /> : null}
			{manualActive ? <SpectrumManualHud /> : null}
			{showLogo ? <LogoDiagnosticsHud /> : null}
		</div>
	);
}
