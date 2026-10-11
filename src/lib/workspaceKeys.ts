import type { WallpaperState } from '@/types/wallpaper';

/**
 * State that belongs to THIS EDITOR ON THIS MACHINE, not to the wallpaper.
 *
 * These keys live in the same store as the project (moving them out would be a
 * large refactor of `wallpaperStore` for little gain), but they must never
 * travel inside a `.vibrix`. Before this list, all 51 were exported: opening
 * someone else's project silently replaced your editor theme, UI scale,
 * sidebar state, HUD size and position, and every diagnostic toggle.
 *
 * The test for what belongs here is a single question:
 *
 *   "If I send this project to another person, should this value change for
 *    them?"
 *
 * Editor chrome → no, it is theirs. Anything the wallpaper renders → yes.
 *
 * Deliberately NOT listed (they are project state even though they look like
 * selections): `activeImageId`, `activeSceneSlotId`, `activeSetlistId`,
 * `activeFilterLookId`, `activeAudioTrackId`, `activePreset` — which image or
 * scene a project opens on is part of the project. `selectedOverlayId` is left
 * in for now: it is an editor selection, but the overlays panel already
 * re-selects the front-most overlay when it points at nothing, so excluding it
 * would buy nothing and change behaviour.
 */
export const WORKSPACE_ONLY_KEYS = [
	// Editor shell appearance and layout
	'editorSidebarCollapsed',
	'editorTheme',
	'editorThemeColorSource',
	'editorCornerRadius',
	'editorControlCornerRadius',
	'editorUiScale',
	'editorShowPreciseNumericControls',
	'editorCompactSlotIcons',
	'editorImagePreviewQuality',
	'editorManualAccentColor',
	'editorManualSecondaryColor',
	'editorManualBackdropColor',
	'editorManualTextPrimaryColor',
	'editorManualTextSecondaryColor',
	'editorManualBackdropOpacity',
	'editorManualBlurPx',
	'editorManualSurfaceOpacity',
	'editorManualItemOpacity',

	// Where the control panel sits and what it is showing
	'controlPanelAnchor',
	'controlPanelOffsetX',
	'controlPanelOffsetY',
	'controlPanelActiveTab',

	// Quick Actions HUD — editor chrome, never rendered in output mode
	'quickActionsEnabled',
	'quickActionsPositionX',
	'quickActionsPositionY',
	'quickActionsLauncherPositionX',
	'quickActionsLauncherPositionY',
	'quickActionsBackdropOpacity',
	'quickActionsBlurPx',
	'quickActionsScale',
	'quickActionsLauncherSize',
	'quickActionsColorSource',
	'quickActionsManualAccentColor',
	'quickActionsManualSecondaryColor',
	'quickActionsManualBackdropColor',
	'quickActionsManualTextPrimaryColor',
	'quickActionsManualTextSecondaryColor',
	'quickActionsManualSurfaceOpacity',
	'quickActionsManualItemOpacity',
	'hudLiquidGlassEnabled',

	// Diagnostic overlays — a debugging preference, not a look
	'showBackgroundScaleMeter',
	'showSpectrumDiagnosticsHud',
	'showLogoDiagnosticsHud',
	'showSpectrumManualHud',
	'showSetlistHud',
	'showFps',
	'fpsOverlayAnchor',

	// Transient editor selections
	'activeSpectrumTarget',
	'activeTool'
] as const satisfies readonly (keyof WallpaperState)[];

const WORKSPACE_ONLY_KEY_SET: ReadonlySet<string> = new Set(
	WORKSPACE_ONLY_KEYS
);

export function isWorkspaceOnlyKey(key: string): boolean {
	return WORKSPACE_ONLY_KEY_SET.has(key);
}
