import { useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
	X,
	Play,
	Pause,
	Maximize2,
	Minimize2,
	SlidersHorizontal,
	Sparkles,
	Wrench,
	Activity,
	PanelLeftClose,
	PanelLeftOpen
} from 'lucide-react';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import type { WallpaperState } from '@/types/wallpaper';
import {
	EDITOR_THEME_CLASSES,
	getEditorRadiusVars,
	getScopedEditorThemeColorVars
} from '@/editor/editorTheme';
import { useWindowPresentationControls } from '@/hooks/useWindowPresentationControls';
import { useAudioContext } from '@/context/useAudioContext';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import { APP_VERSION } from '@/lib/version';
import { ControlTabSuspense } from './controlTabsLazy';
import { useDialog } from '@/editor/DialogProvider';
import {
	confirmResetOverlayLayout,
	confirmResetTab,
	resolveEditorOverlayResetLabel
} from '@/editor/confirmCritical';
import SceneTab from './tabs/main/SceneTab';
import { SpectrumTab } from '@/features/spectrum/ui';
import FiltersTab from './tabs/main/LooksTab';
import MotionTab from './tabs/main/MotionTab';
import AudioTab from './tabs/main/AudioTab';
import TrackTitleTab from './tabs/main/TrackTitleTab';
import { LyricsTab } from '@/features/lyrics/ui';
import EditorTab from './tabs/main/EditorTab';
import DiagnosticsTab from './tabs/main/DiagnosticsTab';
import ExportTab from './tabs/main/OutputTab';
import IntroTab from './tabs/main/IntroTab';
import PerfTab from './tabs/main/PerformanceTab';
import { BackgroundTab as BackgroundPanel } from '@/features/background/ui';
import LayersTab from './tabs/main/layers/LayerStackPanel';
import OverlaysTab from './tabs/main/layers/OverlaysPanel';
import EditorOverlayInsightsPane from './tabs/main/editor/EditorOverlayInsightsPane';
import { EDITOR_OVERLAY_TAB_KEYS } from '@/config/controlPanelResetKeys';
import IconButton from '@/ui/IconButton';
import {
	EDITOR_SIDEBAR,
	EDITOR_SIDEBAR_GROUP_LABEL_CLASS,
	ICON_SIZE,
	getEditorSidebarAsideStyle,
	getEditorSidebarGroupLabelStyle
} from '@/editor/designTokens';
import { useIsAdvanced } from '@/editor/UIMode';
import { SegmentedControl, SidebarNav, TabFade } from '@/ui';
import {
	EDITOR_NAV_GROUP_LABEL_KEY,
	getMaximizedGroups,
	type EditorNavEntry,
	type EditorNavGroup
} from './editorNavigationRegistry';

/**
 * SectionId stays a narrow subset of EditorNavId — every value here is also a
 * registry id, but the registry's compact-only `advanced` container is not a
 * valid section in the maximized editor. Keeping it explicit makes the
 * switch statement below exhaustive and lets renderActiveSection stay
 * structurally honest.
 */
type SectionId =
	| 'scene'
	| 'layers'
	| 'presets'
	| 'overlays'
	| 'spectrum'
	| 'looks'
	| 'motion'
	| 'logo'
	| 'track'
	| 'intro'
	| 'lyrics'
	| 'audio'
	| 'editor'
	| 'diagnostics'
	| 'export'
	| 'perf';

export default function EditorOverlay({ onClose }: { onClose: () => void }) {
	const t = useT();
	const { confirm } = useDialog();
	const {
		resetSection,
		resetSceneSlotBindings,
		language,
		setLanguage,
		overlays,
		selectedOverlayId,
		updateOverlay,
		editorTheme,
		editorThemeColorSource,
		editorCornerRadius,
		editorControlCornerRadius,
		editorManualAccentColor,
		editorManualSecondaryColor,
		editorManualBackdropColor,
		editorManualTextPrimaryColor,
		editorManualTextSecondaryColor,
		editorManualBackdropOpacity,
		editorManualBlurPx,
		editorManualSurfaceOpacity,
		editorManualItemOpacity,
		audioPaused,
		motionPaused,
		setAudioPaused,
		setMotionPaused,
		uiMode,
		setUIMode,
		logoUrl,
		editorUiScale,
		editorSidebarCollapsed,
		setEditorSidebarCollapsed
	} = useWallpaperStore(
		useShallow(s => ({
			resetSection: s.resetSection,
			resetSceneSlotBindings: s.resetSceneSlotBindings,
			language: s.language,
			setLanguage: s.setLanguage,
			overlays: s.overlays,
			selectedOverlayId: s.selectedOverlayId,
			updateOverlay: s.updateOverlay,
			editorTheme: s.editorTheme,
			editorThemeColorSource: s.editorThemeColorSource,
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
			audioPaused: s.audioPaused,
			motionPaused: s.motionPaused,
			setAudioPaused: s.setAudioPaused,
			setMotionPaused: s.setMotionPaused,
			uiMode: s.uiMode,
			setUIMode: s.setUIMode,
			logoUrl: s.logoUrl,
			editorUiScale: s.editorUiScale,
			editorSidebarCollapsed: s.editorSidebarCollapsed,
			setEditorSidebarCollapsed: s.setEditorSidebarCollapsed
		}))
	);
	const { isFullscreen, fullscreenSupported, toggleFullscreen } =
		useWindowPresentationControls();
	const { captureMode, isPaused, pauseFileForSystem, resumeFileFromSystem } =
		useAudioContext();
	const isAdvanced = useIsAdvanced();
	const theme = EDITOR_THEME_CLASSES[editorTheme];
	const safeEditorUiScale = Math.min(2, Math.max(0.7, editorUiScale ?? 1));
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

	const [activeSection, setActiveSection] = useState<SectionId>('scene');

	function makeReset(tabId: string) {
		return async () => {
			if (tabId === 'overlays') {
				const selected = overlays.find(
					overlay => overlay.id === selectedOverlayId
				);
				if (!selected) return;
				if (
					!(await confirmResetOverlayLayout(
						confirm,
						t,
						selected.name
					))
				) {
					return;
				}
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
				return;
			}

			const sectionLabel = resolveEditorOverlayResetLabel(tabId, t);
			if (!(await confirmResetTab(confirm, t, sectionLabel))) return;

			if (tabId === 'scene') {
				resetSceneSlotBindings();
				return;
			}
			if (tabId === 'layers') {
				resetSection(
					(
						[
							...(EDITOR_OVERLAY_TAB_KEYS.presets ?? []),
							...(EDITOR_OVERLAY_TAB_KEYS.layers ?? [])
						] as (keyof WallpaperState)[]
					).filter(
						k => !['imageUrl', 'logoUrl'].includes(k as string)
					)
				);
				const selected = overlays.find(
					overlay => overlay.id === selectedOverlayId
				);
				if (selected) {
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
				return;
			}

			resetSection(
				(EDITOR_OVERLAY_TAB_KEYS[tabId] ?? []).filter(
					k => !['imageUrl', 'logoUrl'].includes(k as string)
				)
			);
		};
	}

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

	const iconSize = EDITOR_SIDEBAR.itemIconSize;

	type SidebarItem = {
		id: SectionId;
		label: string;
		icon: React.ReactNode;
		advancedOnly: boolean;
	};
	type SidebarGroup = {
		group: EditorNavGroup;
		label: string;
		advancedOnly: boolean;
		items: SidebarItem[];
	};

	function entryToSectionItem(entry: EditorNavEntry): SidebarItem {
		const Icon = entry.icon;
		return {
			// Every showInMaximized entry is a SectionId by construction.
			id: entry.id as SectionId,
			label:
				(t as unknown as Record<string, string>)[entry.labelKey] ??
				entry.id,
			icon: <Icon size={iconSize} />,
			advancedOnly: entry.advancedOnly === true
		};
	}

	// Sidebar groups come from the shared editor nav registry — same icons,
	// labels and Simple/Advanced visibility as the compact ControlPanel.
	const sidebarGroups: SidebarGroup[] = getMaximizedGroups().map(group => ({
		group: group.group,
		label:
			(t as unknown as Record<string, string>)[
				EDITOR_NAV_GROUP_LABEL_KEY[group.group]
			] ?? group.group,
		advancedOnly: group.advancedOnly,
		items: group.items.map(entryToSectionItem)
	}));

	const visibleGroups = isAdvanced
		? sidebarGroups
		: sidebarGroups
				.map(g => ({
					...g,
					// Drop advancedOnly items even from non-advancedOnly
					// groups (e.g. Motion inside Effects) so Simple mode hides
					// exactly the same things in both editors.
					items: g.items.filter(item => !item.advancedOnly)
				}))
				.filter(g => !g.advancedOnly && g.items.length > 0);

	const allVisibleIds = visibleGroups.flatMap(g => g.items.map(i => i.id));
	const effectiveActive: SectionId = allVisibleIds.includes(activeSection)
		? activeSection
		: 'scene';

	const activeLabel =
		visibleGroups.flatMap(g => g.items).find(i => i.id === effectiveActive)
			?.label ?? t.tab_scene;
	const sidebarCollapsed = editorSidebarCollapsed;
	const expandedEditorVars = {
		'--bg-preview-height': 'clamp(320px, 28vw, 560px)',
		'--bg-control-gap': '0.75rem',
		'--bg-stepper-size': '2.4rem',
		'--bg-input-height': '2.4rem',
		'--bg-slider-hit-height': '2.4rem',
		'--bg-slider-track-height': '6px',
		'--bg-slider-thumb-size': '16px',
		'--profile-slot-card-min': '220px',
		'--profile-slot-row-padding': '0.625rem 0.75rem',
		'--profile-slot-row-min-h': '2.5rem',
		'--section-card-compact-header-padding': '14px 16px',
		'--section-card-compact-body-padding': '18px',
		'--editor-slot-gap': '0.5rem'
	} as CSSProperties;

	function renderActiveSection() {
		switch (effectiveActive) {
			case 'scene':
				return <SceneTab onReset={() => void makeReset('scene')} />;
			case 'layers':
				return <LayersTab />;
			case 'presets':
				return <BackgroundPanel />;
			case 'overlays':
				return (
					<OverlaysTab onReset={() => void makeReset('overlays')} />
				);
			case 'spectrum':
				return (
					<SpectrumTab
						onReset={() => void makeReset('spectrum')}
						onResetLogo={() => void makeReset('logo')}
					/>
				);
			case 'looks':
				// Reset bucket stays 'filters' to keep the existing
				// EDITOR_OVERLAY_TAB_KEYS dict entry working — the nav id is
				// `looks` (registry-canonical), the reset key is the legacy
				// state-keys bucket name.
				return <FiltersTab onReset={() => void makeReset('filters')} />;
			case 'motion':
				return (
					<MotionTab
						onResetParticles={() => void makeReset('particles')()}
						onResetRain={() => void makeReset('rain')()}
					/>
				);
			case 'track':
				return (
					<TrackTitleTab onReset={() => void makeReset('track')} />
				);
			case 'intro':
				return <IntroTab />;
			case 'lyrics':
				return <LyricsTab onReset={() => void makeReset('lyrics')} />;
			case 'audio':
				return <AudioTab onReset={() => void makeReset('audio')} />;
			case 'editor':
				return <EditorTab onReset={() => void makeReset('editor')} />;
			case 'diagnostics':
				return (
					<DiagnosticsTab
						onReset={() => void makeReset('diagnostics')}
					/>
				);
			case 'export':
				return <ExportTab />;
			case 'perf':
				return <PerfTab />;
			default:
				return null;
		}
	}

	return (
		<div
			className={`fixed inset-0 z-[100] flex max-h-dvh max-w-dvw flex-col overflow-hidden p-3 ${theme.overlayShell}`}
			style={{
				background: 'linear-gradient(180deg, #070a12, #05070d)',
				// Keep the expanded editor stable while the wallpaper canvas keeps
				// rendering behind it. A viewport-sized backdrop-filter forces the
				// browser to resample the animated canvas on every scroll repaint,
				// which shows up as flicker on heavy spectrum families.
				backdropFilter: 'none',
				WebkitBackdropFilter: 'none',
				...themeVars,
				...radiusVars,
				...expandedEditorVars
			}}
		>
			<div
				className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden"
				style={
					safeEditorUiScale === 1
						? undefined
						: {
								width: `calc(100% / ${safeEditorUiScale})`,
								height: `calc(100% / ${safeEditorUiScale})`,
								maxWidth: `calc(100% / ${safeEditorUiScale})`,
								maxHeight: `calc(100% / ${safeEditorUiScale})`,
								transform: `scale(${safeEditorUiScale})`,
								transformOrigin: 'top left'
							}
				}
			>
				<div
					className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border"
					style={{
						borderRadius: 'var(--editor-radius-xl)',
						borderColor: 'var(--editor-shell-border)',
						background: 'linear-gradient(180deg, #0a0f1b, #070b14)',
						boxShadow:
							'0 26px 70px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.06)'
					}}
				>
					<header
						className="flex shrink-0 items-center gap-4 border-b px-5 py-4"
						style={{
							borderBottomColor: 'var(--editor-header-border)',
							background:
								'linear-gradient(180deg, color-mix(in srgb, var(--editor-header-bg) 94%, transparent), color-mix(in srgb, var(--editor-shell-bg) 92%, transparent))'
						}}
					>
						<div
							className="grid h-10 w-10 shrink-0 place-items-center border"
							style={{
								borderRadius: 'var(--editor-radius-lg)',
								borderColor: 'var(--editor-accent-border)',
								background: 'var(--editor-active-bg)',
								color: 'var(--editor-active-fg)'
							}}
						>
							{logoUrl ? (
								<img
									src={logoUrl}
									alt=""
									className="h-7 w-7 rounded object-cover"
								/>
							) : (
								<Activity size={18} strokeWidth={2.35} />
							)}
						</div>
						<div className="min-w-0">
							<h1
								className={`truncate text-[16px] font-bold leading-tight ${theme.panelTitle}`}
								style={{ color: 'var(--editor-accent-fg)' }}
							>
								{t.title}
							</h1>
							<p
								className="truncate text-[11px] leading-tight"
								style={{
									color: 'var(--editor-accent-muted)',
									fontFamily:
										'"JetBrains Mono", ui-monospace, SFMono-Regular, monospace'
								}}
							>
								{activeLabel} ·{' '}
								{isAdvanced ? 'Advanced' : 'Simple'} · v
								{APP_VERSION} · {t.autoSaved}
							</p>
						</div>

						<div className="ml-auto flex items-center gap-2">
							<SegmentedControl
								size="md"
								value={uiMode}
								onChange={setUIMode}
								options={[
									{
										value: 'simple',
										label: 'Simple',
										icon: <Sparkles size={13} />
									},
									{
										value: 'advanced',
										label: 'Advanced',
										icon: <SlidersHorizontal size={13} />
									}
								]}
							/>
							<IconButton
								onClick={toggleHeaderAudioPause}
								title={t.hint_pause_audio_only}
							>
								{effectiveAudioPaused ? (
									<Play size={ICON_SIZE.sm} />
								) : (
									<Pause size={ICON_SIZE.sm} />
								)}
							</IconButton>
							{isAdvanced && (
								<IconButton
									variant="warning"
									onClick={toggleHeaderPauseAll}
									title={t.hint_pause_all}
								>
									{effectiveAudioPaused || motionPaused ? (
										<Play size={ICON_SIZE.sm} />
									) : (
										<Pause size={ICON_SIZE.sm} />
									)}
								</IconButton>
							)}
							{fullscreenSupported ? (
								<IconButton
									onClick={() => void toggleFullscreen()}
									title={
										isFullscreen
											? t.label_exit_fullscreen
											: t.label_enter_fullscreen
									}
								>
									{isFullscreen ? (
										<Minimize2 size={ICON_SIZE.sm} />
									) : (
										<Maximize2 size={ICON_SIZE.sm} />
									)}
								</IconButton>
							) : null}
							{isAdvanced && (
								<button
									onClick={() =>
										setLanguage(
											language === 'en' ? 'es' : 'en'
										)
									}
									className="h-8 rounded border px-2 text-[11px] font-semibold transition-colors"
									style={{
										borderRadius: 'var(--editor-radius-md)',
										background: 'var(--editor-button-bg)',
										borderColor:
											'var(--editor-button-border)',
										color: 'var(--editor-button-fg)'
									}}
									title={t.editor_toggle_language_tooltip}
								>
									{language === 'en' ? 'ES' : 'EN'}
								</button>
							)}
							<IconButton
								onClick={onClose}
								title={t.editor_close_full_tooltip}
							>
								<X size={ICON_SIZE.sm} />
							</IconButton>
						</div>
					</header>

					<div className="flex min-h-0 min-w-0 flex-1">
						<aside
							className={`editor-scroll flex shrink-0 flex-col overflow-y-auto border-r ${EDITOR_SIDEBAR.padding} ${EDITOR_SIDEBAR.gap}`}
							style={{
								width: sidebarCollapsed ? 48 : 176,
								minWidth: sidebarCollapsed ? 48 : 136,
								maxWidth: sidebarCollapsed ? 48 : 208,
								...getEditorSidebarAsideStyle()
							}}
						>
							<div
								className={EDITOR_SIDEBAR.collapseRowClass}
								style={{
									borderColor:
										'var(--editor-header-border, rgba(255, 255, 255, 0.06))'
								}}
							>
								<IconButton
									onClick={() =>
										setEditorSidebarCollapsed(
											!sidebarCollapsed
										)
									}
									title={
										sidebarCollapsed
											? 'Expand sidebar'
											: 'Collapse sidebar'
									}
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
							{visibleGroups.map(group => (
								<div key={group.group} className="min-w-0">
									{!sidebarCollapsed ? (
										<div
											className={
												EDITOR_SIDEBAR_GROUP_LABEL_CLASS
											}
											style={getEditorSidebarGroupLabelStyle()}
										>
											{group.label}
										</div>
									) : null}
									<SidebarNav<SectionId>
										items={group.items}
										value={effectiveActive}
										onChange={setActiveSection}
										compact={sidebarCollapsed}
										density="compact"
										ariaLabel={`${group.label} editor tabs`}
									/>
								</div>
							))}
						</aside>

						<div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
							<main
								className="editor-scroll min-h-0 min-w-0 overflow-y-auto overflow-x-hidden"
								style={{
									// Avoid a nested promoted scroll layer over the animated
									// wallpaper; compositor invalidation can appear as flicker.
									contain: 'layout style',
									background: '#070b14',
									scrollbarWidth: 'thin',
									scrollbarColor:
										'var(--editor-accent-border, rgba(80,160,200,0.35)) transparent'
								}}
							>
								{/*
								 * Readability constraint: cap the content column at a
								 * comfortable reading width even on 4K displays. Sliders +
								 * SectionCards beyond ~920px start to look "stretched debug
								 * panel" instead of Figma / Ableton-class chrome. The 2xl
								 * breakpoint bumps it slightly for ultra-wide setups but
								 * still keeps slider tracks from going infinite.
								 */}
								<div className="mx-auto flex w-full max-w-[920px] min-w-0 flex-col gap-5 px-5 py-5 xl:px-8 xl:py-6 2xl:max-w-[1080px]">
									<div className="flex items-center gap-2">
										<Wrench
											size={ICON_SIZE.sm}
											style={{
												color: 'var(--editor-accent-muted)'
											}}
										/>
										<h2
											className={`text-[13px] font-bold uppercase tracking-[0.16em] ${theme.panelTitle}`}
											style={{
												color: 'var(--editor-accent-soft)'
											}}
										>
											{activeLabel}
										</h2>
									</div>
									<ControlTabSuspense>
										<TabFade tabKey={effectiveActive}>
											{renderActiveSection()}
										</TabFade>
									</ControlTabSuspense>
								</div>
							</main>
							<aside
								className="editor-scroll hidden min-h-0 min-w-0 overflow-y-auto overflow-x-hidden border-l xl:block"
								style={{
									borderLeftColor:
										'var(--editor-header-border, rgba(255,255,255,0.06))',
									background:
										'color-mix(in srgb, var(--editor-shell-bg) 92%, #000 8%)',
									scrollbarWidth: 'thin',
									scrollbarColor:
										'var(--editor-accent-border, rgba(80,160,200,0.35)) transparent'
								}}
							>
								<div className="flex flex-col gap-3 px-4 py-5">
									<ControlTabSuspense>
										<EditorOverlayInsightsPane />
									</ControlTabSuspense>
								</div>
							</aside>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
