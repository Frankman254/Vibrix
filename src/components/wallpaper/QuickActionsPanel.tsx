import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent
} from 'react';
import { useAudioData } from '@/hooks/useAudioData';
import { useT } from '@/lib/i18n';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import { useWindowPresentationControls } from '@/hooks/useWindowPresentationControls';
import { useEnterOutputMode } from '@/runtime/useEnterOutputMode';
import {
	EDITOR_THEME_CLASSES,
	getEditorRadiusVars,
	getScopedEditorThemeColorVars
} from '@/editor/editorTheme';
import {
	QuickActionsGroupedPanel,
	QuickActionsHeader,
	QuickActionsLayersPanel,
	QuickActionsShortcutsPanel,
	QuickActionsSlotsPanel,
	QuickActionsThemePanel
} from '@/components/wallpaper/quickActions/QuickActionsPanels';
import QuickActionsPerImagePanel from '@/components/wallpaper/quickActions/QuickActionsPerImagePanel';
import { QuickActionsLogoPositionGrid } from '@/features/logo/ui';
import QuickActionsShell from '@/components/wallpaper/quickActions/QuickActionsShell';
import MediaDock from '@/components/controls/MediaDock';
import {
	PANEL_MARGIN,
	type ExpandPanel
} from '@/components/wallpaper/quickActions/quickActionsShared';
import { useQuickActionsLayout } from '@/components/wallpaper/quickActions/useQuickActionsLayout';
import { useQuickActionsState } from '@/components/wallpaper/quickActions/useQuickActionsState';
import { useQuickActionsViewModel } from '@/components/wallpaper/quickActions/useQuickActionsViewModel';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { APP_LOGO_URL } from '@/config/appLogo';
import { Move } from 'lucide-react';

type HudDragState = {
	kind: 'panel' | 'launcher';
	pointerId: number;
	captureTarget: Element | null;
	startClientX: number;
	startClientY: number;
	startLeft: number;
	startTop: number;
	elementWidth: number;
	elementHeight: number;
	viewportWidth: number;
	viewportHeight: number;
};

export default function QuickActionsPanel() {
	const t = useT();
	const state = useQuickActionsState();
	const enableDragMode = useWallpaperStore(s => s.enableDragMode);
	const activeTool = useWallpaperStore(s => s.activeTool);
	const setQuickActionsPositionX = useWallpaperStore(
		s => s.setQuickActionsPositionX
	);
	const setQuickActionsPositionY = useWallpaperStore(
		s => s.setQuickActionsPositionY
	);
	const setQuickActionsLauncherPositionX = useWallpaperStore(
		s => s.setQuickActionsLauncherPositionX
	);
	const setQuickActionsLauncherPositionY = useWallpaperStore(
		s => s.setQuickActionsLauncherPositionY
	);
	const audio = useAudioData();
	const backgroundPalette = useBackgroundPalette();
	const { isFullscreen, fullscreenSupported, toggleFullscreen } =
		useWindowPresentationControls();
	const { goPresentation } = useEnterOutputMode();
	const [isOpen, setIsOpen] = useState(true);
	const [expandPanel, setExpandPanel] = useState<ExpandPanel>(null);
	const hudDragRef = useRef<HudDragState | null>(null);

	const toggleExpand = useCallback((panel: Exclude<ExpandPanel, null>) => {
		setExpandPanel(prev => (prev === panel ? null : panel));
	}, []);

	// HUD is a sibling of the editor with its own color source + manual palette.
	// Theme selection is shared, but HUD visual tokens are independent.
	const themeVars = getScopedEditorThemeColorVars(
		state.quickActionsColorSource,
		backgroundPalette,
		state.editorTheme,
		{
			accent: state.quickActionsManualAccentColor,
			secondary: state.quickActionsManualSecondaryColor,
			backdrop: state.quickActionsManualBackdropColor,
			textPrimary: state.quickActionsManualTextPrimaryColor,
			textSecondary: state.quickActionsManualTextSecondaryColor
		},
		{
			backdropOpacity: state.quickActionsBackdropOpacity,
			blurPx: state.quickActionsBlurPx,
			surfaceOpacity: state.quickActionsManualSurfaceOpacity,
			itemOpacity: state.quickActionsManualItemOpacity
		}
	);
	const radiusVars = getEditorRadiusVars(
		state.editorCornerRadius,
		state.editorControlCornerRadius
	);
	const usesRainbowChrome =
		state.editorTheme === 'rainbow' &&
		state.quickActionsColorSource === 'theme';
	const theme = EDITOR_THEME_CLASSES[state.editorTheme];
	const headerInsetStyle = {
		paddingInline: 'max(10px, calc(var(--editor-radius-xl) * 0.24))',
		paddingTop: 'max(6px, calc(var(--editor-radius-xl) * 0.18))'
	} as const;
	const hudDragEnabled = enableDragMode && activeTool === 'hud';

	const {
		panelRef,
		launcherRef,
		launcherIconPx,
		panelStyle,
		launcherStyle,
		maxScrollAreaHeight
	} = useQuickActionsLayout({
		isOpen,
		expandPanel,
		quickActionsScale: state.quickActionsScale,
		quickActionsPositionX: state.quickActionsPositionX,
		quickActionsPositionY: state.quickActionsPositionY,
		quickActionsLauncherSize: state.quickActionsLauncherSize,
		layoutResponsiveEnabled: state.layoutResponsiveEnabled,
		layoutReferenceWidth: state.layoutReferenceWidth,
		layoutReferenceHeight: state.layoutReferenceHeight,
		quickActionsLauncherPositionX: state.quickActionsLauncherPositionX,
		quickActionsLauncherPositionY: state.quickActionsLauncherPositionY
	});

	// Drag handlers live in refs so they keep a stable identity across renders.
	// Recreating them per-render would cause add/removeEventListener thrash and,
	// worse, leak listeners when a callback identity drifts mid-drag.
	const handleHudPointerMoveRef = useRef<(event: PointerEvent) => void>(
		() => {}
	);
	const finishHudDragRef = useRef<() => void>(() => {});

	handleHudPointerMoveRef.current = (event: PointerEvent) => {
		const drag = hudDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		if (event.cancelable) event.preventDefault();

		const dx = event.clientX - drag.startClientX;
		const dy = event.clientY - drag.startClientY;
		const maxLeft = Math.max(
			PANEL_MARGIN,
			drag.viewportWidth - drag.elementWidth - PANEL_MARGIN
		);
		const maxTop = Math.max(
			PANEL_MARGIN,
			drag.viewportHeight - drag.elementHeight - PANEL_MARGIN
		);
		const nextLeft = Math.min(
			maxLeft,
			Math.max(PANEL_MARGIN, drag.startLeft + dx)
		);
		const nextTop = Math.min(
			maxTop,
			Math.max(PANEL_MARGIN, drag.startTop + dy)
		);
		const usableWidth = Math.max(
			0,
			drag.viewportWidth - drag.elementWidth - PANEL_MARGIN * 2
		);
		const usableHeight = Math.max(
			0,
			drag.viewportHeight - drag.elementHeight - PANEL_MARGIN * 2
		);
		const nextNormX =
			usableWidth > 0 ? (nextLeft - PANEL_MARGIN) / usableWidth : 0;
		const nextNormY =
			usableHeight > 0 ? (nextTop - PANEL_MARGIN) / usableHeight : 0;

		if (drag.kind === 'panel') {
			setQuickActionsPositionX(nextNormX);
			setQuickActionsPositionY(nextNormY);
			return;
		}

		setQuickActionsLauncherPositionX(nextNormX);
		setQuickActionsLauncherPositionY(nextNormY);
	};

	finishHudDragRef.current = () => {
		const drag = hudDragRef.current;
		window.removeEventListener('pointermove', stableMoveHandler);
		window.removeEventListener('pointerup', stableEndHandler);
		window.removeEventListener('pointercancel', stableEndHandler);
		if (
			drag?.captureTarget &&
			'releasePointerCapture' in drag.captureTarget
		) {
			try {
				(drag.captureTarget as Element).releasePointerCapture(
					drag.pointerId
				);
			} catch {
				// element may already be detached — safe to ignore
			}
		}
		hudDragRef.current = null;
	};

	const stableMoveHandler = useCallback((event: PointerEvent) => {
		handleHudPointerMoveRef.current(event);
	}, []);
	const stableEndHandler = useCallback(() => {
		finishHudDragRef.current();
	}, []);

	const startHudDrag = useCallback(
		(
			event: ReactPointerEvent<HTMLElement>,
			kind: HudDragState['kind'],
			element: HTMLDivElement | HTMLButtonElement | null
		) => {
			if (!hudDragEnabled || !element) return;
			if (event.cancelable) event.preventDefault();
			const captureTarget = event.currentTarget;
			captureTarget.setPointerCapture?.(event.pointerId);
			const rect = element.getBoundingClientRect();
			hudDragRef.current = {
				kind,
				pointerId: event.pointerId,
				captureTarget,
				startClientX: event.clientX,
				startClientY: event.clientY,
				startLeft: rect.left,
				startTop: rect.top,
				elementWidth: rect.width,
				elementHeight: rect.height,
				viewportWidth: window.innerWidth,
				viewportHeight: window.innerHeight
			};
			window.addEventListener('pointermove', stableMoveHandler, {
				passive: false
			});
			window.addEventListener('pointerup', stableEndHandler);
			window.addEventListener('pointercancel', stableEndHandler);
		},
		[hudDragEnabled, stableEndHandler, stableMoveHandler]
	);

	useEffect(
		() => () => {
			finishHudDragRef.current();
		},
		[]
	);

	const {
		headerActions,
		imageLabel,
		imageNav,
		spectrumNav,
		looksNav,
		particlesNav,
		layerActions,
		looksActions,
		looksSlots,
		spectrumActions,
		spectrumSlots,
		motionActions,
		dragActions,
		particlesSlots,
		rainSlots,
		lightsSlots,
		cameraSlots,
		audioActions,
		logoShortcutActions,
		logoSlots,
		titleActions,
		titleSlots,
		systemActions,
		statusLabel,
		themeActions,
		colorSourceActions,
		spectrumColorSourceShortcut,
		logoColorSourceShortcut,
		motionColorSourceShortcut,
		titleColorSourceShortcut,
		editorShellColorSourceShortcut,
		globalColorSourceShortcut
	} = useQuickActionsViewModel({
		state,
		t,
		audio,
		expandPanel,
		toggleExpand,
		isFullscreen,
		fullscreenSupported,
		toggleFullscreen,
		goPresentation
	});

	if (!state.quickActionsEnabled) return null;

	return (
		<QuickActionsShell
			containerStyle={{ ...themeVars, ...radiusVars }}
			isOpen={isOpen}
			panelRef={panelRef}
			panelStyle={panelStyle}
			panelFrameClassName={`${usesRainbowChrome ? theme.panelShell : ''}`}
			panelFrameStyle={{
				borderRadius: 'var(--editor-radius-xl)',
				border: '1px solid var(--editor-shell-border)',
				background: !usesRainbowChrome
					? 'linear-gradient(180deg, color-mix(in srgb, var(--editor-hud-bg) 94%, transparent), color-mix(in srgb, var(--editor-shell-bg) 90%, transparent))'
					: undefined,
				backdropFilter: 'blur(var(--editor-shell-blur)) saturate(145%)',
				WebkitBackdropFilter:
					'blur(var(--editor-shell-blur)) saturate(145%)',
				boxShadow:
					'0 22px 48px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.07)'
			}}
			panelContentClassName={`relative flex min-h-0 w-full flex-col px-5 pb-4 ${hudDragEnabled ? 'pt-11' : 'pt-4'}`}
			launcherRef={launcherRef}
			launcherStyle={{
				...launcherStyle,
				borderColor: isOpen
					? 'var(--editor-button-border)'
					: 'var(--editor-shell-border)',
				background: !usesRainbowChrome
					? isOpen
						? 'linear-gradient(180deg, color-mix(in srgb, var(--editor-button-bg) 92%, transparent), color-mix(in srgb, var(--editor-shell-bg) 88%, transparent))'
						: 'linear-gradient(180deg, color-mix(in srgb, var(--editor-button-bg) 82%, transparent), color-mix(in srgb, var(--editor-shell-bg) 86%, transparent))'
					: undefined,
				color: 'var(--editor-accent-soft)',
				backdropFilter: 'blur(var(--editor-shell-blur)) saturate(145%)',
				WebkitBackdropFilter:
					'blur(var(--editor-shell-blur)) saturate(145%)',
				boxShadow: isOpen
					? '0 18px 42px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.10)'
					: '0 18px 42px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)'
			}}
			launcherClassName={`pointer-events-auto absolute z-10 flex items-center justify-center border shadow-2xl transition-all duration-300 hover:-translate-y-0.5 ${
				usesRainbowChrome ? theme.launcher : ''
			}`}
			launcherTitle={t.label_quick_actions}
			onToggle={() => setIsOpen(prev => !prev)}
			panelOverlayChildren={
				hudDragEnabled ? (
					<div
						onPointerDown={event =>
							startHudDrag(event, 'panel', panelRef.current)
						}
						aria-label={t.hud_drag_tooltip}
						title={t.hud_drag_tooltip}
						className="pointer-events-auto absolute left-2 right-2 top-2 flex h-7 items-center justify-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider"
						style={{
							borderRadius: 'var(--editor-radius-sm)',
							cursor: 'grab',
							background:
								'color-mix(in srgb, var(--editor-active-bg) 88%, var(--editor-shell-bg))',
							border: '1px dashed color-mix(in srgb, var(--editor-accent-color) 55%, transparent)'
						}}
					>
						<Move size={11} strokeWidth={2.25} />
						{t.qa_drag_hud_handle}
					</div>
				) : undefined
			}
			panelChildren={
				<div
					className="editor-scroll scrollbar-none flex flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-contain"
					style={{ maxHeight: maxScrollAreaHeight }}
				>
					<div style={headerInsetStyle}>
						<QuickActionsHeader
							statusLabel={statusLabel}
							trackLabel=""
							secondaryContent={null}
							actions={headerActions}
							isRainbow={usesRainbowChrome}
							compact
						/>
					</div>

					{expandPanel === 'drag' && (
						<QuickActionsGroupedPanel
							groups={[
								{
									label: t.qa_drag_select_target,
									actions: dragActions
								}
							]}
							isRainbow={usesRainbowChrome}
							dense
						/>
					)}

					{expandPanel === 'layers' && (
						<QuickActionsLayersPanel
							actions={layerActions}
							isRainbow={usesRainbowChrome}
						/>
					)}

					{expandPanel === 'looks' && (
						<QuickActionsShortcutsPanel
							actions={looksActions}
							isRainbow={usesRainbowChrome}
						/>
					)}

					{expandPanel === 'looks_slots' &&
						state.looksProfileSlots.length > 0 && (
							<QuickActionsSlotsPanel
								slots={looksSlots}
								isRainbow={usesRainbowChrome}
							/>
						)}

					{expandPanel === 'spectrum' && (
						<QuickActionsShortcutsPanel
							actions={spectrumActions}
							isRainbow={usesRainbowChrome}
							colorSourceShortcut={spectrumColorSourceShortcut}
							colorSourceLabel={t.spectrum_color_source_both}
						/>
					)}

					{expandPanel === 'spectrum_slots' &&
						spectrumSlots.length > 0 && (
							<QuickActionsSlotsPanel
								slots={spectrumSlots}
								isRainbow={usesRainbowChrome}
							/>
						)}

					{/*
					 * The Motion shortcuts stay on screen while one of its slot
					 * banks is open. Opening "Camera slots" used to REPLACE this
					 * panel, so picking a slot meant losing the toggles and
					 * clicking MOTION again — the segmentation the user
					 * complained about. Now the bank opens underneath it.
					 */}
					{(expandPanel === 'motion' ||
						expandPanel === 'particles_slots' ||
						expandPanel === 'rain_slots' ||
						expandPanel === 'lights_slots' ||
						expandPanel === 'camera_slots') && (
						<QuickActionsGroupedPanel
							groups={motionActions}
							isRainbow={usesRainbowChrome}
							colorSourceShortcut={motionColorSourceShortcut}
							colorSourceLabel={t.label_color_source}
							dense
						/>
					)}

					{expandPanel === 'particles_slots' &&
						state.particlesProfileSlots.length > 0 && (
							<QuickActionsSlotsPanel
								slots={particlesSlots}
								isRainbow={usesRainbowChrome}
							/>
						)}

					{expandPanel === 'rain_slots' &&
						state.rainProfileSlots.length > 0 && (
							<QuickActionsSlotsPanel
								slots={rainSlots}
								isRainbow={usesRainbowChrome}
							/>
						)}

					{expandPanel === 'lights_slots' &&
						state.lightsProfileSlots.length > 0 && (
							<QuickActionsSlotsPanel
								slots={lightsSlots}
								isRainbow={usesRainbowChrome}
							/>
						)}

					{expandPanel === 'camera_slots' &&
						state.cameraFxProfileSlots.length > 0 && (
							<QuickActionsSlotsPanel
								slots={cameraSlots}
								isRainbow={usesRainbowChrome}
							/>
						)}

					{expandPanel === 'audio' && (
						<QuickActionsShortcutsPanel
							actions={audioActions}
							isRainbow={usesRainbowChrome}
						/>
					)}

					{expandPanel === 'logo' && (
						<QuickActionsShortcutsPanel
							actions={logoShortcutActions}
							isRainbow={usesRainbowChrome}
							colorSourceShortcut={logoColorSourceShortcut}
							colorSourceLabel={t.label_color_source}
						/>
					)}

					{expandPanel === 'logo_position' && (
						<QuickActionsLogoPositionGrid
							logoPositionX={state.logoPositionX}
							logoPositionY={state.logoPositionY}
							setLogoPositionX={state.setLogoPositionX}
							setLogoPositionY={state.setLogoPositionY}
							isRainbow={usesRainbowChrome}
						/>
					)}

					{expandPanel === 'title' && (
						<QuickActionsShortcutsPanel
							actions={titleActions}
							isRainbow={usesRainbowChrome}
							colorSourceShortcut={titleColorSourceShortcut}
							colorSourceLabel={t.label_color_source}
						/>
					)}

					{expandPanel === 'title_slots' &&
						state.trackTitleProfileSlots.length > 0 && (
							<QuickActionsSlotsPanel
								slots={titleSlots}
								isRainbow={usesRainbowChrome}
							/>
						)}

					{expandPanel === 'system' && (
						<QuickActionsShortcutsPanel
							actions={systemActions}
							isRainbow={usesRainbowChrome}
						/>
					)}

					{expandPanel === 'quickEdit' && (
						<QuickActionsPerImagePanel />
					)}

					{expandPanel === 'logo_slots' &&
						state.logoProfileSlots.length > 0 && (
							<QuickActionsSlotsPanel
								slots={logoSlots}
								isRainbow={usesRainbowChrome}
							/>
						)}

					{expandPanel === 'themes' && (
						<QuickActionsThemePanel
							themeActions={themeActions}
							colorSourceActions={colorSourceActions}
							editorShellColorSourceShortcut={
								editorShellColorSourceShortcut
							}
							globalColorSourceShortcut={
								globalColorSourceShortcut
							}
							isRainbow={usesRainbowChrome}
						/>
					)}

					<MediaDock
						imageLabel={imageLabel}
						isRainbow={usesRainbowChrome}
						imageNav={imageNav}
						spectrumNav={spectrumNav}
						looksNav={looksNav}
						particlesNav={particlesNav}
						hudSafeInset
					/>
				</div>
			}
			launcherChildren={
				<img
					src={APP_LOGO_URL}
					alt=""
					className="rounded-full object-contain opacity-95 ring-1"
					style={{
						width: launcherIconPx,
						height: launcherIconPx,
						borderColor: 'var(--editor-shell-border)'
					}}
				/>
			}
			launcherOverlayChildren={
				hudDragEnabled ? (
					<span
						onPointerDown={event =>
							startHudDrag(event, 'launcher', launcherRef.current)
						}
						aria-label={t.hud_drag_launcher_tooltip}
						title={t.hud_drag_launcher_tooltip}
						className="h-full w-full"
						style={{
							borderRadius: '999px',
							cursor: 'grab',
							background:
								'color-mix(in srgb, var(--editor-active-bg) 12%, transparent)',
							border: '1px dashed color-mix(in srgb, var(--editor-accent-color) 55%, transparent)'
						}}
					/>
				) : undefined
			}
		/>
	);
}
