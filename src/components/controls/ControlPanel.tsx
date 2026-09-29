import { useEffect, useRef, useState } from 'react';
import {
	X,
	Play,
	Pause,
	Maximize2,
	Minimize2,
	LayoutGrid,
	Zap,
	MousePointer,
	AudioWaveform,
	Image as ImageIcon,
	SlidersHorizontal,
	Move,
	Activity,
	Sparkles,
	PanelLeftClose,
	PanelLeftOpen,
	Type,
	FileText
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import EditorOverlay from './EditorOverlay';
import {
	getEditorRadiusVars,
	getScopedEditorThemeColorVars
} from '@/editor/editorTheme';
import { useWindowPresentationControls } from '@/hooks/useWindowPresentationControls';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAudioContext } from '@/context/useAudioContext';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import { APP_VERSION } from '@/lib/version';
import { ControlTabSuspense } from './controlTabsLazy';
import VisualWorkloadBanner from './VisualWorkloadBanner';
import {
	PANEL_ANCHOR_OVERLAY_CLASS,
	PANEL_ANCHOR_WRAPPER_CLASS
} from './controlPanelAnchorStyles';
import {
	ADVANCED_RESET_KEYS,
	LEGACY_TAB_KEYS,
	MAIN_TAB_RESET_KEYS,
	resolveCanvasInteractionTab,
	type AdvancedSubTab,
	type MainTabId
} from '@/config/controlPanelResetKeys';
import type { ActiveTool } from '@/types/wallpaper';
import {
	panelKey,
	readWorkspaceState,
	writeWorkspaceState,
	type WorkspaceState
} from '@/editor/workspace/workspaceState';
import { useWorkspaceSubTab } from '@/editor/workspace/useWorkspaceSubTab';
import { WorkspacePanel } from '@/editor/workspace/WorkspacePanel';
import {
	Button,
	IconButton,
	SegmentedControl,
	SidebarNav,
	TabFade,
	Toolbar,
	ToolbarDivider,
	ToolbarGroup,
	UI_COLORS,
	FONT,
	GLOW,
	ICON_SIZE,
	type SidebarNavItem
} from '@/ui';
import SceneTab from './tabs/main/SceneTab';
import LooksTab from './tabs/main/LooksTab';
import { SpectrumTab } from '@/features/spectrum/ui';
import LayersTab from './tabs/main/LayersTab';
import MotionTab from './tabs/main/MotionTab';
import AudioTab from './tabs/main/AudioTab';
import DiagnosticsTab from './tabs/main/DiagnosticsTab';
import PerformanceTab from './tabs/main/PerformanceTab';
import TrackTitleTab from './tabs/main/TrackTitleTab';
import EditorTab from './tabs/main/EditorTab';
import { LyricsTab } from '@/features/lyrics/ui';
import OutputTab from './tabs/main/OutputTab';
import IntroTab from './tabs/main/IntroTab';
import { CalibrationTab } from '@/features/calibration/ui';
import {
	getCompactAdvancedSubEntries,
	getCompactMainEntries,
	type EditorNavEntry
} from './editorNavigationRegistry';
import CommandPalette, { type CommandPaletteAction } from './CommandPalette';
import { useEnterOutputMode } from '@/runtime/useEnterOutputMode';
import { useDialog } from '@/editor/DialogProvider';
import {
	confirmResetTab,
	resolveResetSectionLabel
} from '@/editor/confirmCritical';
import {
	EDITOR_SIDEBAR,
	getEditorSidebarAsideStyle
} from '@/editor/designTokens';

interface ControlPanelProps {
	open: boolean;
	maximized: boolean;
	forceMaximized?: boolean;
	onOpenChange: (value: boolean) => void;
	onMaximizedChange: (value: boolean) => void;
	onForceClose?: () => void;
}

type EditorScrollPosition = {
	top: number;
	left: number;
};

type EditorScrollMap = Record<string, EditorScrollPosition>;

const MODERN_EDITOR_SCROLL_STORAGE_KEY = 'vibrix-editor-scroll-map';

function readEditorScrollMap(): EditorScrollMap {
	if (typeof window === 'undefined') return {};
	try {
		const parsed = JSON.parse(
			window.localStorage.getItem(MODERN_EDITOR_SCROLL_STORAGE_KEY) ??
				'{}'
		);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return {};
		}
		return Object.fromEntries(
			Object.entries(parsed)
				.map(([key, value]) => {
					if (!value || typeof value !== 'object') return null;
					const candidate = value as Partial<EditorScrollPosition>;
					const top = Number(candidate.top);
					const left = Number(candidate.left);
					if (!Number.isFinite(top) || !Number.isFinite(left)) {
						return null;
					}
					return [
						key,
						{ top: Math.max(0, top), left: Math.max(0, left) }
					];
				})
				.filter((entry): entry is [string, EditorScrollPosition] =>
					Array.isArray(entry)
				)
		);
	} catch {
		return {};
	}
}

function writeEditorScrollMap(scrollMap: EditorScrollMap) {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(
			MODERN_EDITOR_SCROLL_STORAGE_KEY,
			JSON.stringify(scrollMap)
		);
	} catch {
		/* localStorage unavailable — scroll restore is optional */
	}
}

/** Tab ids valid at runtime. `Record<MainTabId, …>` makes TS keep these whole. */
const MAIN_TAB_IDS = Object.keys(MAIN_TAB_RESET_KEYS) as MainTabId[];
const ADVANCED_SUB_IDS = Object.keys(ADVANCED_RESET_KEYS) as AdvancedSubTab[];

const ADVANCED_TAB_KEY = 'advanced';

/**
 * Restores where the user was, refusing anything that is not a tab we still
 * ship — a renamed or removed tab must land on the default, never on a blank
 * panel.
 */
function restoreMainTab(workspace: WorkspaceState): MainTabId {
	const stored = workspace.navigation.mainTab;
	return MAIN_TAB_IDS.includes(stored as MainTabId)
		? (stored as MainTabId)
		: 'scene';
}

function restoreAdvancedSub(workspace: WorkspaceState): AdvancedSubTab {
	const stored = workspace.navigation.subTabs[ADVANCED_TAB_KEY];
	return ADVANCED_SUB_IDS.includes(stored as AdvancedSubTab)
		? (stored as AdvancedSubTab)
		: 'track';
}

function rememberNavigation(tab: MainTabId, advancedSub: AdvancedSubTab) {
	const workspace = readWorkspaceState();
	writeWorkspaceState({
		...workspace,
		navigation: {
			mainTab: tab,
			subTabs: { ...workspace.navigation.subTabs, advanced: advancedSub }
		}
	});
}

/**
 * Translates a registry entry into the SidebarNavItem shape used by the
 * compact horizontal nav. Size is parameterised because the main row uses
 * `md` icons while the Advanced sub-row uses `xs`.
 */
function navEntryToSidebarItem<T extends string>(
	entry: EditorNavEntry,
	labels: Record<string, string>,
	iconSize: number
): SidebarNavItem<T> {
	const Icon = entry.icon;
	return {
		id: entry.id as T,
		label: labels[entry.labelKey] ?? entry.id,
		icon: <Icon size={iconSize} />
	};
}

export default function ControlPanel({
	open,
	maximized,
	forceMaximized = false,
	onOpenChange,
	onMaximizedChange,
	onForceClose
}: ControlPanelProps) {
	// Restored from the workspace, not the project: reopening the editor should
	// land where the user left off, and that preference must not travel inside
	// a `.vibrix`. Unknown ids fall back rather than restoring a dead tab.
	const [tab, setTab] = useState<MainTabId>(() =>
		restoreMainTab(readWorkspaceState())
	);
	const [advancedSub, setAdvancedSub] = useState<AdvancedSubTab>(() =>
		restoreAdvancedSub(readWorkspaceState())
	);

	useEffect(() => {
		rememberNavigation(tab, advancedSub);
	}, [tab, advancedSub]);
	const contentScrollRef = useRef<HTMLDivElement | null>(null);
	const scrollMapRef = useRef<EditorScrollMap>(readEditorScrollMap());
	const scrollPersistTimeoutRef = useRef<number | null>(null);
	const isNarrowViewport = useMediaQuery('(max-width: 480px)');
	const sidebarCollapsedManual = useWallpaperStore(
		s => s.editorSidebarCollapsed
	);
	const setSidebarCollapsed = useWallpaperStore(
		s => s.setEditorSidebarCollapsed
	);
	// On narrow viewports the sidebar is forced collapsed; the user toggle
	// only matters again once the viewport widens back out.
	const sidebarCollapsed = sidebarCollapsedManual || isNarrowViewport;
	const [paletteOpen, setPaletteOpen] = useState(false);
	useEffect(() => {
		function onKeyDown(event: globalThis.KeyboardEvent) {
			const isCmdK =
				(event.metaKey || event.ctrlKey) &&
				!event.shiftKey &&
				!event.altKey &&
				(event.key === 'k' || event.key === 'K');
			if (isCmdK) {
				event.preventDefault();
				setPaletteOpen(o => !o);
			}
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);
	const setControlPanelActiveTab = useWallpaperStore(
		s => s.setControlPanelActiveTab
	);
	useEffect(() => {
		setControlPanelActiveTab(resolveCanvasInteractionTab(tab, advancedSub));
		return () => setControlPanelActiveTab(null);
	}, [tab, advancedSub, setControlPanelActiveTab]);
	const t = useT();
	const { goPresentation, goRecording } = useEnterOutputMode();
	const { confirm } = useDialog();
	const {
		language,
		selectedOverlayId,
		overlays,
		controlPanelAnchor,
		controlPanelOffsetX,
		controlPanelOffsetY,
		editorTheme,
		editorThemeColorSource,
		editorCornerRadius,
		editorControlCornerRadius,
		editorUiScale,
		editorManualAccentColor,
		editorManualSecondaryColor,
		editorManualBackdropColor,
		editorManualTextPrimaryColor,
		editorManualTextSecondaryColor,
		editorManualBackdropOpacity,
		editorManualBlurPx,
		editorManualSurfaceOpacity,
		editorManualItemOpacity,
		logoUrl,
		audioPaused,
		motionPaused,
		uiMode,
		enableDragMode,
		activeTool
	} = useWallpaperStore(
		useShallow(s => ({
			language: s.language,
			selectedOverlayId: s.selectedOverlayId,
			overlays: s.overlays,
			controlPanelAnchor: s.controlPanelAnchor,
			controlPanelOffsetX: s.controlPanelOffsetX,
			controlPanelOffsetY: s.controlPanelOffsetY,
			editorTheme: s.editorTheme,
			editorThemeColorSource: s.editorThemeColorSource,
			editorUiScale: s.editorUiScale,
			editorCornerRadius: s.editorCornerRadius,
			editorControlCornerRadius: s.editorControlCornerRadius,
			editorManualAccentColor: s.editorManualAccentColor,
			editorManualSecondaryColor: s.editorManualSecondaryColor,
			editorManualBackdropColor: s.editorManualBackdropColor,
			editorManualTextPrimaryColor: s.editorManualTextPrimaryColor,
			editorManualTextSecondaryColor: s.editorManualTextSecondaryColor,
			editorManualBackdropOpacity: s.editorManualBackdropOpacity,
			editorManualBlurPx: s.editorManualBlurPx,
			editorManualSurfaceOpacity: s.editorManualSurfaceOpacity,
			editorManualItemOpacity: s.editorManualItemOpacity,
			logoUrl: s.logoUrl,
			audioPaused: s.audioPaused,
			motionPaused: s.motionPaused,
			uiMode: s.uiMode,
			enableDragMode: s.enableDragMode,
			activeTool: s.activeTool
		}))
	);
	const resetSection = useWallpaperStore(s => s.resetSection);
	const resetSceneSlotBindings = useWallpaperStore(
		s => s.resetSceneSlotBindings
	);
	const setLanguage = useWallpaperStore(s => s.setLanguage);
	const updateOverlay = useWallpaperStore(s => s.updateOverlay);
	const setSelectedOverlayId = useWallpaperStore(s => s.setSelectedOverlayId);
	const setAudioPaused = useWallpaperStore(s => s.setAudioPaused);
	const setMotionPaused = useWallpaperStore(s => s.setMotionPaused);
	const setUIMode = useWallpaperStore(s => s.setUIMode);
	const setEnableDragMode = useWallpaperStore(s => s.setEnableDragMode);
	const setActiveTool = useWallpaperStore(s => s.setActiveTool);
	const setControlPanelOffset = useWallpaperStore(
		s => s.setControlPanelOffset
	);

	// Drag-to-move handler for the editor panel header. We track from
	// (mouseStart, offsetStart) so the panel moves 1:1 with the cursor and
	// double-click on the drag handle resets the offset to the anchor.
	const dragOffsetStartRef = useRef<{
		mouseX: number;
		mouseY: number;
		offsetX: number;
		offsetY: number;
	} | null>(null);
	function beginPanelDrag(event: React.PointerEvent<HTMLElement>) {
		// Only respond to primary button + skip when the user is interacting
		// with a real control inside the header (button, input, etc.).
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('button, input, select, textarea, [role="button"]'))
			return;
		dragOffsetStartRef.current = {
			mouseX: event.clientX,
			mouseY: event.clientY,
			offsetX: controlPanelOffsetX,
			offsetY: controlPanelOffsetY
		};
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}
	function updatePanelDrag(event: React.PointerEvent<HTMLElement>) {
		const start = dragOffsetStartRef.current;
		if (!start) return;
		setControlPanelOffset(
			start.offsetX + (event.clientX - start.mouseX),
			start.offsetY + (event.clientY - start.mouseY)
		);
	}
	function endPanelDrag(event: React.PointerEvent<HTMLElement>) {
		if (!dragOffsetStartRef.current) return;
		dragOffsetStartRef.current = null;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(
				event.pointerId
			);
		} catch {
			/* pointer was already released */
		}
	}
	function resetPanelOffset() {
		setControlPanelOffset(0, 0);
	}
	const { isFullscreen, fullscreenSupported, toggleFullscreen } =
		useWindowPresentationControls();
	const { captureMode, isPaused, pauseFileForSystem, resumeFileFromSystem } =
		useAudioContext();
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
	const effectiveAudioPaused =
		captureMode === 'file' ? isPaused || audioPaused : audioPaused;
	// One route drives both the workspace panel context (which sections are
	// expanded) and the scroll bucket, so the two can never drift apart.
	//
	// Now that every tab records its sub-view in the shared workspace, the
	// shell can read it and append it: `spectrum/style` rather than plain
	// `spectrum`. Before, all of Spectrum's sub-views shared one scroll bucket
	// and switching between them dropped the user at another view's offset.
	const tabRoute =
		tab === 'advanced' ? panelKey('advanced', advancedSub) : tab;
	const activeSubView = useWorkspaceSubTab(tabRoute);
	const workspaceRoute = panelKey(tabRoute, activeSubView);
	// Maximised and docked are different geometries; sharing a bucket restored
	// an offset from the other layout and dropped the user somewhere arbitrary.
	const activeScrollKey = `${workspaceRoute}${
		maximized || forceMaximized ? '@max' : ''
	}`;

	useEffect(() => {
		return () => {
			if (
				scrollPersistTimeoutRef.current !== null &&
				typeof window !== 'undefined'
			) {
				window.clearTimeout(scrollPersistTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!open && !maximized && !forceMaximized) return;
		const node = contentScrollRef.current;
		if (!node || typeof window === 'undefined') return;
		const nextPosition = scrollMapRef.current[activeScrollKey] ?? {
			top: 0,
			left: 0
		};
		const frame = window.requestAnimationFrame(() => {
			node.scrollTop = nextPosition.top;
			node.scrollLeft = nextPosition.left;
		});
		return () => window.cancelAnimationFrame(frame);
	}, [activeScrollKey, forceMaximized, maximized, open]);

	function persistEditorScrollPosition(node: HTMLDivElement) {
		// Scroll is a hot path. Mutate the ref entry in place and serialize only
		// after scrolling settles; cloning the whole map on every wheel tick adds
		// avoidable main-thread work beside the animated wallpaper canvas.
		scrollMapRef.current[activeScrollKey] = {
			top: node.scrollTop,
			left: node.scrollLeft
		};
		if (typeof window === 'undefined') {
			return;
		}
		if (scrollPersistTimeoutRef.current !== null) {
			window.clearTimeout(scrollPersistTimeoutRef.current);
		}
		scrollPersistTimeoutRef.current = window.setTimeout(() => {
			scrollPersistTimeoutRef.current = null;
			writeEditorScrollMap(scrollMapRef.current);
		}, 220);
	}

	useEffect(() => {
		if (!open && !maximized) {
			setSelectedOverlayId(null);
		}
	}, [maximized, open, setSelectedOverlayId]);

	function toggleHeaderAudioPause() {
		const nextPaused = !effectiveAudioPaused;
		setAudioPaused(nextPaused);
		if (captureMode === 'file') {
			if (nextPaused) pauseFileForSystem();
			else resumeFileFromSystem();
		}
	}

	function toggleHeaderPauseAll() {
		const shouldResumeAll = effectiveAudioPaused || motionPaused;
		const nextPaused = !shouldResumeAll;
		setAudioPaused(nextPaused);
		setMotionPaused(nextPaused);
		if (captureMode === 'file') {
			if (shouldResumeAll) resumeFileFromSystem();
			else pauseFileForSystem();
		}
	}

	// Main tabs + Advanced sub-tabs come from the shared editor nav registry
	// so the compact ControlPanel and the maximized EditorOverlay always
	// agree on icons, labels, and Simple/Advanced visibility. Local layout
	// (horizontal nav vs sidebar groups) stays each editor's concern.
	const MAIN_TABS = getCompactMainEntries().map(entry =>
		navEntryToSidebarItem<MainTabId>(
			entry,
			t as unknown as Record<string, string>,
			EDITOR_SIDEBAR.itemIconSize
		)
	);
	const simpleHiddenMainIds = new Set(
		getCompactMainEntries()
			.filter(e => e.advancedOnly)
			.map(e => e.id as MainTabId)
	);

	const visibleTabs =
		uiMode === 'simple'
			? MAIN_TABS.filter(item => !simpleHiddenMainIds.has(item.id))
			: MAIN_TABS;

	useEffect(() => {
		if (uiMode === 'simple' && simpleHiddenMainIds.has(tab)) {
			setTab('scene');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [uiMode]);

	const ADVANCED_TABS = getCompactAdvancedSubEntries().map(entry =>
		navEntryToSidebarItem<AdvancedSubTab>(
			entry,
			t as unknown as Record<string, string>,
			EDITOR_SIDEBAR.subItemIconSize
		)
	);

	function resetSelectedOverlayLayout() {
		const selected = overlays.find(
			overlay => overlay.id === selectedOverlayId
		);
		if (!selected) return;
		updateOverlay(selected.id, {
			enabled: true,
			positionX: 0,
			positionY: 0,
			scale: 1,
			rotation: 0,
			opacity: 1,
			blendMode: 'normal',
			cropShape: 'rectangle',
			edgeFade: 0.08,
			edgeBlur: 0,
			edgeGlow: 0.12,
			audioOpacityReactive: true,
			audioOpacityAmount: 0.35,
			audioOpacityInvert: false,
			audioOpacityChannel: 'kick'
		});
	}

	function applyResetTab() {
		if (tab === 'scene') {
			resetSceneSlotBindings();
			return;
		}
		if (tab === 'layers') {
			resetSection(
				MAIN_TAB_RESET_KEYS.layers.filter(
					k => !['imageUrl', 'logoUrl'].includes(k as string)
				)
			);
			resetSelectedOverlayLayout();
			return;
		}
		if (tab === 'advanced') {
			resetSection(
				ADVANCED_RESET_KEYS[advancedSub].filter(
					k => !['imageUrl', 'logoUrl'].includes(k as string)
				)
			);
			return;
		}
		resetSection(
			MAIN_TAB_RESET_KEYS[tab].filter(
				k => !['imageUrl', 'logoUrl'].includes(k as string)
			)
		);
	}

	async function handleResetTab() {
		const sectionLabel = resolveResetSectionLabel(tab, advancedSub, t);
		if (!(await confirmResetTab(confirm, t, sectionLabel))) return;
		applyResetTab();
	}

	async function handleResetMotionSection(
		sectionLabel: string,
		keys: Parameters<typeof resetSection>[0]
	) {
		if (!(await confirmResetTab(confirm, t, sectionLabel))) return;
		resetSection(
			keys.filter(k => !['imageUrl', 'logoUrl'].includes(k as string))
		);
	}

	const safeUiScale = Math.min(2, Math.max(0.7, editorUiScale ?? 1));
	const panelTransformOrigin = controlPanelAnchor.startsWith('top')
		? controlPanelAnchor.endsWith('left')
			? 'top left'
			: 'top right'
		: controlPanelAnchor.endsWith('left')
			? 'bottom left'
			: 'bottom right';
	const panelInset =
		'max(0.5rem, env(safe-area-inset-left)) + max(0.5rem, env(safe-area-inset-right))';
	const baseMaxRem = 30;
	const panelWidth = `min(${baseMaxRem}rem, calc((100vw - (${panelInset})) / ${safeUiScale}))`;
	// Vertical reserved space for: wrapper anchor offset (2rem) + panel anchor
	// offset relative to wrapper (3rem) + 1rem visual safety. Total:
	//   top anchors:    wrapper top-12 (3rem) + panel top-12 (3rem) + 1rem = 7rem
	//   bottom anchors: wrapper bottom-8 (2rem) + panel bottom-12 (3rem) + 1rem = 6rem
	// Anything smaller pushes the panel past the viewport edge (was 3/4rem and
	// caused visible overflow on heavy tabs).
	const verticalMarginRem = controlPanelAnchor.startsWith('top') ? 7 : 6;
	const panelMaxHeight = `calc((100dvh - ${verticalMarginRem}rem) / ${safeUiScale})`;
	const panelScaleStyle =
		safeUiScale === 1
			? undefined
			: {
					transform: `scale(${safeUiScale})`,
					transformOrigin: panelTransformOrigin
				};

	const TOOL_ITEMS: {
		id: ActiveTool;
		icon: React.ReactNode;
		label: string;
	}[] = [
		{
			id: 'none',
			icon: <MousePointer size={ICON_SIZE.xs} />,
			label: 'Select'
		},
		{ id: 'logo', icon: <ImageIcon size={ICON_SIZE.xs} />, label: 'Logo' },
		{
			id: 'spectrum',
			icon: <AudioWaveform size={ICON_SIZE.xs} />,
			label: 'Spectrum'
		},
		{
			id: 'track-title',
			icon: <Type size={ICON_SIZE.xs} />,
			label: 'Track'
		},
		{
			id: 'lyrics',
			icon: <FileText size={ICON_SIZE.xs} />,
			label: 'Lyrics'
		},
		{
			id: 'hud',
			icon: <SlidersHorizontal size={ICON_SIZE.xs} />,
			label: 'HUD'
		}
	];

	const paletteActions: CommandPaletteAction[] = [
		{
			id: 'output:presentation',
			label: t.label_presentation_mode,
			group: 'Output',
			keywords: ['presentation', 'obs', 'live', 'output', 'clean'],
			run: () => {
				onOpenChange(false);
				onMaximizedChange(false);
				goPresentation();
			}
		},
		{
			id: 'output:recording',
			label: t.label_recording_mode,
			group: 'Output',
			keywords: ['recording', 'capture', 'output', 'clean'],
			run: () => {
				onOpenChange(false);
				onMaximizedChange(false);
				goRecording();
			}
		},
		...visibleTabs.map(item => ({
			id: `main:${item.id}`,
			label: typeof item.label === 'string' ? item.label : item.id,
			group: 'Main',
			icon: item.icon,
			keywords: [item.id],
			run: () => {
				setTab(item.id);
			}
		})),
		...ADVANCED_TABS.map(item => ({
			id: `advanced:${item.id}`,
			label: typeof item.label === 'string' ? item.label : item.id,
			group: 'Advanced',
			icon: item.icon,
			keywords: [item.id, 'advanced'],
			run: () => {
				setTab('advanced');
				setAdvancedSub(item.id);
			}
		}))
	];

	return (
		<>
			<CommandPalette
				open={paletteOpen}
				onClose={() => setPaletteOpen(false)}
				actions={paletteActions}
			/>
			{(maximized || forceMaximized) && (
				<EditorOverlay
					onClose={() => {
						if (forceMaximized && onForceClose) {
							onForceClose();
							return;
						}
						onMaximizedChange(false);
					}}
				/>
			)}
			{!forceMaximized ? (
				<div
					// Same contract as the HUD: an armed drag tool must never
					// capture pointer events over the editor's own controls.
					data-drag-blocker=""
					className={`fixed z-50 ${PANEL_ANCHOR_WRAPPER_CLASS[controlPanelAnchor]}`}
					style={{
						...(themeVars as React.CSSProperties),
						transform:
							controlPanelOffsetX !== 0 ||
							controlPanelOffsetY !== 0
								? `translate(${controlPanelOffsetX}px, ${controlPanelOffsetY}px)`
								: undefined
					}}
				>
					{/* Launcher: square accent button matching the design (Activity icon over accent) */}
					<button
						onClick={() => onOpenChange(!open)}
						className="group h-11 w-11 transition-all duration-200 sm:h-10 sm:w-10 inline-flex items-center justify-center"
						style={{
							borderRadius: 'var(--editor-radius-lg)',
							background: UI_COLORS.accent,
							color: UI_COLORS.accentFg,
							border: `1px solid ${UI_COLORS.accentBorder}`,
							boxShadow: GLOW.panel,
							...radiusVars
						}}
						title={open ? 'Close panel' : 'Open editor'}
					>
						{logoUrl && !open ? (
							<img
								src={logoUrl}
								alt=""
								className="h-6 w-6 rounded-full object-cover opacity-90"
							/>
						) : open ? (
							<X size={18} />
						) : (
							<Activity size={16} strokeWidth={2.5} />
						)}
					</button>

					{open && (
						<div
							className={`absolute box-border flex min-w-0 flex-col overflow-x-hidden ${PANEL_ANCHOR_OVERLAY_CLASS[controlPanelAnchor]}`}
							style={{
								maxHeight: panelMaxHeight,
								borderRadius: 'var(--editor-radius-xl)',
								width: panelWidth,
								background:
									'linear-gradient(180deg, #0a0f1b, #070b14)',
								border: `1px solid ${UI_COLORS.borderStrong}`,
								// Avoid full-panel backdrop sampling over the animated canvas.
								// Scrolling large Spectrum panels over Liquid/Scope/Tunnel can
								// otherwise force expensive repaints and visible flicker.
								backdropFilter: 'none',
								WebkitBackdropFilter: 'none',
								boxShadow: GLOW.modal,
								color: UI_COLORS.fg,
								...themeVars,
								...radiusVars,
								...panelScaleStyle
							}}
						>
							{/* ── Header (design's gradient overlay strip) — also the drag handle ── */}
							<div
								onPointerDown={beginPanelDrag}
								onPointerMove={updatePanelDrag}
								onPointerUp={endPanelDrag}
								onPointerCancel={endPanelDrag}
								onDoubleClick={event => {
									const target = event.target as HTMLElement;
									if (
										target.closest(
											'button, input, select, textarea, [role="button"]'
										)
									)
										return;
									resetPanelOffset();
								}}
								className="cursor-grab active:cursor-grabbing"
								title="Drag to move · double-click to snap back"
							>
								<Toolbar
									density="compact"
									className="flex-nowrap gap-1 px-2 py-1"
									style={{
										background: `linear-gradient(180deg, ${UI_COLORS.sheen}, transparent)`,
										borderBottom:
											'1px solid color-mix(in srgb, var(--editor-tag-border) 45%, transparent)',
										borderRadius:
											'var(--editor-radius-xl) var(--editor-radius-xl) 0 0',
										borderLeft: 0,
										borderRight: 0,
										borderTop: 0,
										boxShadow: 'none',
										backdropFilter: 'none',
										WebkitBackdropFilter: 'none'
									}}
								>
									<div
										className="grid place-items-center shrink-0"
										style={{
											width: 22,
											height: 22,
											borderRadius:
												'var(--editor-radius-md)',
											background: 'var(--vibrix-accent)',
											color: 'var(--editor-active-fg)'
										}}
									>
										{logoUrl ? (
											<img
												src={logoUrl}
												alt=""
												className="h-3.5 w-3.5 rounded object-cover"
											/>
										) : (
											<Activity
												size={13}
												strokeWidth={2.5}
											/>
										)}
									</div>
									<div className="mr-auto min-w-0">
										<span
											className="block truncate text-[11px] font-semibold leading-none"
											style={{
												color: 'var(--editor-accent-fg)'
											}}
										>
											{t.title}
										</span>
										<span
											className="block truncate text-[9px] leading-none"
											style={{
												color: 'var(--editor-accent-muted)',
												fontFamily: FONT.mono
											}}
										>
											v{APP_VERSION}
										</span>
									</div>
									<ToolbarGroup
										density="compact"
										className="ml-auto flex-nowrap justify-end"
									>
										<SegmentedControl
											size="sm"
											density="compact"
											value={uiMode}
											onChange={v => setUIMode(v)}
											options={[
												{
													value: 'simple',
													label: 'Simple',
													icon: <Sparkles size={11} />
												},
												{
													value: 'advanced',
													label: 'Adv',
													icon: (
														<SlidersHorizontal
															size={11}
														/>
													)
												}
											]}
										/>
										<ToolbarDivider className="hidden sm:block" />
										<IconButton
											density="compact"
											size="sm"
											active={enableDragMode}
											onClick={() =>
												setEnableDragMode(
													!enableDragMode
												)
											}
											title={
												enableDragMode
													? 'Drag mode on — click to disable'
													: 'Enable drag mode'
											}
										>
											<Move size={ICON_SIZE.sm} />
										</IconButton>
										<IconButton
											density="compact"
											size="sm"
											onClick={toggleHeaderAudioPause}
											title={t.hint_pause_audio_only}
										>
											{effectiveAudioPaused ? (
												<Play size={ICON_SIZE.sm} />
											) : (
												<Pause size={ICON_SIZE.sm} />
											)}
										</IconButton>
										{uiMode === 'advanced' && (
											<IconButton
												density="compact"
												size="sm"
												variant="warning"
												onClick={toggleHeaderPauseAll}
												title={t.hint_pause_all}
											>
												{effectiveAudioPaused ||
												motionPaused ? (
													<Play size={ICON_SIZE.sm} />
												) : (
													<Pause
														size={ICON_SIZE.sm}
													/>
												)}
											</IconButton>
										)}
										{fullscreenSupported ? (
											<IconButton
												density="compact"
												size="sm"
												onClick={() =>
													void toggleFullscreen()
												}
												title={
													isFullscreen
														? t.label_exit_fullscreen
														: t.label_enter_fullscreen
												}
											>
												{isFullscreen ? (
													<Minimize2
														size={ICON_SIZE.sm}
													/>
												) : (
													<Maximize2
														size={ICON_SIZE.sm}
													/>
												)}
											</IconButton>
										) : null}
										{uiMode === 'advanced' && (
											<IconButton
												density="compact"
												size="sm"
												onClick={() =>
													setLanguage(
														language === 'en'
															? 'es'
															: 'en'
													)
												}
												title={
													t.editor_toggle_language_tooltip
												}
											>
												<span className="text-[10px] font-semibold">
													{language === 'en'
														? 'ES'
														: 'EN'}
												</span>
											</IconButton>
										)}
										<IconButton
											density="compact"
											size="sm"
											onClick={() =>
												onMaximizedChange(true)
											}
											title={
												t.label_open_editor_workspace
											}
										>
											<LayoutGrid size={ICON_SIZE.sm} />
										</IconButton>
									</ToolbarGroup>
								</Toolbar>
							</div>

							{/* ── Drag-mode tool bar ── */}
							{enableDragMode && (
								<Toolbar
									density="compact"
									className="gap-1 px-0.5 py-1"
									style={{
										background: UI_COLORS.overlay,
										borderBottom:
											'1px solid color-mix(in srgb, var(--editor-tag-border) 40%, transparent)',
										borderLeft: 0,
										borderRight: 0,
										borderTop: 0,
										borderRadius: 0,
										boxShadow: 'none',
										backdropFilter: 'none',
										WebkitBackdropFilter: 'none'
									}}
								>
									<Zap
										size={10}
										style={{
											color: 'var(--editor-accent-muted)'
										}}
									/>
									<span
										className="text-[9px] mr-1.5 uppercase tracking-widest"
										style={{
											color: 'var(--editor-accent-muted)'
										}}
									>
										Active tool
									</span>
									<ToolbarGroup
										density="compact"
										className="flex-wrap"
									>
										{TOOL_ITEMS.map(tool => (
											<Button
												key={tool.id}
												onClick={() =>
													setActiveTool(tool.id)
												}
												variant={
													activeTool === tool.id
														? 'primary'
														: 'ghost'
												}
												size="sm"
												density="compact"
												icon={tool.icon}
												active={activeTool === tool.id}
											>
												{tool.label}
											</Button>
										))}
									</ToolbarGroup>
								</Toolbar>
							)}

							{/* ── Mode banner (design's persistent indicator) ── */}
							<div
								className="flex items-center gap-1 px-2 py-px uppercase tracking-[0.08em] text-[9px]"
								style={{
									background: 'transparent',
									borderBottom: `1px solid ${UI_COLORS.hairline}`,
									color:
										uiMode === 'advanced'
											? UI_COLORS.accent
											: UI_COLORS.fgMute,
									fontFamily: FONT.mono
								}}
							>
								{uiMode === 'advanced' ? (
									<>
										<SlidersHorizontal size={10} />
										Advanced
									</>
								) : (
									<>
										<Sparkles size={10} />
										Simple
									</>
								)}
							</div>

							{/* ── Split: vertical sidebar + content scroll ── */}
							<div className="flex flex-1 min-h-0 min-w-0">
								{/* Sidebar (vertical nav) — collapsible */}
								<aside
									className={`shrink-0 flex flex-col overflow-y-auto border-r ${EDITOR_SIDEBAR.padding} ${EDITOR_SIDEBAR.gap}`}
									style={{
										width: sidebarCollapsed
											? 38
											: 'max-content',
										minWidth: sidebarCollapsed ? 38 : 96,
										maxWidth: sidebarCollapsed ? 38 : 160,
										...getEditorSidebarAsideStyle()
									}}
								>
									<div
										className={
											EDITOR_SIDEBAR.collapseRowClass
										}
										style={{
											borderColor:
												'var(--editor-header-border, rgba(255, 255, 255, 0.06))'
										}}
									>
										<IconButton
											type="button"
											onClick={() =>
												setSidebarCollapsed(
													!sidebarCollapsedManual
												)
											}
											title={
												sidebarCollapsed
													? 'Expand sidebar'
													: 'Collapse sidebar'
											}
											aria-label={
												sidebarCollapsed
													? 'Expand sidebar'
													: 'Collapse sidebar'
											}
											size="sm"
											density="compact"
											variant="default"
										>
											{sidebarCollapsed ? (
												<PanelLeftOpen
													size={
														EDITOR_SIDEBAR.collapseIconSize
													}
												/>
											) : (
												<PanelLeftClose
													size={
														EDITOR_SIDEBAR.collapseIconSize
													}
												/>
											)}
										</IconButton>
									</div>
									<SidebarNav<MainTabId>
										items={visibleTabs}
										value={tab}
										onChange={setTab}
										compact={sidebarCollapsed}
										density="compact"
										ariaLabel={t.editor_tabs_aria}
									/>
									{tab === 'advanced' ? (
										<div
											className="mt-1 border-t pt-1"
											style={{
												borderColor:
													'var(--editor-header-border, rgba(255, 255, 255, 0.06))'
											}}
										>
											<SidebarNav<AdvancedSubTab>
												items={ADVANCED_TABS}
												value={advancedSub}
												onChange={setAdvancedSub}
												compact={sidebarCollapsed}
												density="compact"
												ariaLabel={
													t.editor_advanced_tools_aria
												}
											/>
										</div>
									) : null}
								</aside>

								{/* Tab content scroll body */}
								<div
									ref={contentScrollRef}
									onScroll={event =>
										persistEditorScrollPosition(
											event.currentTarget
										)
									}
									className="editor-scroll flex flex-1 min-h-0 min-w-0 flex-col gap-1 overflow-x-hidden overflow-y-auto px-1.5 pt-1 pb-1.5"
									style={
										{
											// Keep scroll repaints in the editor tree. Promoting
											// this nested scroller to a GPU layer can flash the
											// animated wallpaper composite during fast wheel input.
											contain: 'layout style',
											background: '#070b14',
											'--section-card-compact-header-padding':
												'6px 8px',
											'--section-card-compact-body-padding':
												'8px'
										} as React.CSSProperties
									}
								>
									<VisualWorkloadBanner />
									<ControlTabSuspense>
										<WorkspacePanel id={workspaceRoute}>
											<TabFade tabKey={activeScrollKey}>
												{tab === 'scene' && (
													<SceneTab
														onReset={() =>
															void handleResetTab()
														}
														onRequestMainTab={
															setTab
														}
													/>
												)}
												{tab === 'spectrum' && (
													<SpectrumTab
														onReset={() =>
															void handleResetTab()
														}
														onResetLogo={() =>
															void handleResetMotionSection(
																t.tab_logo,
																LEGACY_TAB_KEYS.logo ??
																	[]
															)
														}
													/>
												)}
												{tab === 'looks' && (
													<LooksTab
														onReset={() =>
															void handleResetTab()
														}
													/>
												)}
												{tab === 'layers' && (
													<LayersTab
														onReset={() =>
															void handleResetTab()
														}
													/>
												)}
												{tab === 'motion' && (
													<MotionTab
														onResetParticles={() =>
															void handleResetMotionSection(
																t.tab_particles,
																LEGACY_TAB_KEYS.particles ??
																	[]
															)
														}
														onResetRain={() =>
															void handleResetMotionSection(
																t.tab_rain,
																LEGACY_TAB_KEYS.rain ??
																	[]
															)
														}
													/>
												)}
												{tab === 'audio' && (
													<AudioTab
														onReset={() =>
															void handleResetTab()
														}
													/>
												)}
												{tab === 'advanced' &&
													advancedSub === 'track' && (
														<TrackTitleTab
															onReset={() =>
																void handleResetTab()
															}
														/>
													)}
												{tab === 'advanced' &&
													advancedSub ===
														'lyrics' && (
														<LyricsTab
															onReset={() =>
																void handleResetTab()
															}
														/>
													)}
												{tab === 'advanced' &&
													advancedSub ===
														'calibration' && (
														<CalibrationTab
															onReset={() =>
																void handleResetTab()
															}
														/>
													)}
												{tab === 'advanced' &&
													advancedSub ===
														'diagnostics' && (
														<DiagnosticsTab
															onReset={() =>
																void handleResetTab()
															}
														/>
													)}
												{tab === 'advanced' &&
													advancedSub ===
														'editor' && (
														<EditorTab
															onReset={() =>
																void handleResetTab()
															}
														/>
													)}
												{tab === 'advanced' &&
													advancedSub === 'intro' && (
														<IntroTab />
													)}
												{tab === 'advanced' &&
													advancedSub ===
														'export' && (
														<OutputTab />
													)}
												{tab === 'advanced' &&
													advancedSub === 'perf' && (
														<PerformanceTab />
													)}
											</TabFade>
										</WorkspacePanel>
									</ControlTabSuspense>
								</div>
							</div>
						</div>
					)}
				</div>
			) : null}
		</>
	);
}
