import { useEffect, useRef, useState } from 'react';
import {
	Plus,
	Camera,
	Sparkles,
	RotateCcw,
	X,
	Pencil,
	Check,
	Layers,
	List,
	Sparkle
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { useTabViewState } from '@/hooks/useTabViewState';
import SetlistsPanel from './scene/SetlistsPanel';
import SceneBindingRow from './scene/SceneBindingRow';
import { AiDirectorPanel, AiBatchPanel } from '@/features/aiDirector/ui';
import { resolveEditorImagePreviewUrl } from '@/lib/editorImagePreviews';
import {
	SectionCard,
	Button,
	EditorTabFooter,
	EditorTabHeader,
	EditorTabLayout,
	IconButton,
	SegmentedControl,
	FloatingPanel,
	UI_COLORS,
	FONT,
	ICON_SIZE
} from '@/ui';
import type { EditorImagePreviewQuality } from '@/types/wallpaper';
import { useIsSimple } from '@/editor/UIMode';
import {
	DiscoveryOnboardingCard,
	type DiscoveryRequestMainTab
} from '../../DiscoveryOnboardingCard';

type SceneSlotFeatureKey =
	| 'spectrumSlotId'
	| 'spectrumSecondSlotId'
	| 'looksSlotId'
	| 'particlesSlotId'
	| 'rainSlotId'
	| 'lightsSlotId'
	| 'cameraFxSlotId'
	| 'logoSlotId'
	| 'trackTitleSlotId';

type FeatureColumn = {
	key: SceneSlotFeatureKey;
	label: string;
};
function buildFeatureColumns(t: ReturnType<typeof useT>): FeatureColumn[] {
	return [
		{ key: 'spectrumSlotId', label: t.spectrum_target_main },
		{ key: 'spectrumSecondSlotId', label: t.spectrum_target_second },
		{ key: 'looksSlotId', label: t.tab_looks },
		{ key: 'particlesSlotId', label: t.tab_particles },
		{ key: 'rainSlotId', label: t.tab_rain },
		{ key: 'lightsSlotId', label: t.tab_lights },
		{ key: 'cameraFxSlotId', label: t.tab_camera },
		{ key: 'logoSlotId', label: t.tab_logo },
		{ key: 'trackTitleSlotId', label: t.tab_track }
	];
}

const SIMPLE_KEYS: SceneSlotFeatureKey[] = ['spectrumSlotId', 'looksSlotId'];

type SceneView = 'scenes' | 'setlists' | 'ai';
const MODERN_SCENE_VIEW_STORAGE_KEY = 'lwag-modern-scene-view';

function isSceneView(value: unknown): value is SceneView {
	return value === 'scenes' || value === 'setlists' || value === 'ai';
}

export default function SceneTab({
	onReset,
	onRequestMainTab
}: {
	onReset: () => void;
	onRequestMainTab?: (tab: DiscoveryRequestMainTab) => void;
}) {
	const t = useT();
	const store = useWallpaperStore(
		useShallow(s => ({
			sceneSlots: s.sceneSlots,
			activeSceneSlotId: s.activeSceneSlotId,
			spectrumProfileSlots: s.spectrumProfileSlots,
			spectrumSecondProfileSlots: s.spectrumSecondProfileSlots,
			looksProfileSlots: s.looksProfileSlots,
			particlesProfileSlots: s.particlesProfileSlots,
			rainProfileSlots: s.rainProfileSlots,
			lightsProfileSlots: s.lightsProfileSlots,
			cameraFxProfileSlots: s.cameraFxProfileSlots,
			logoProfileSlots: s.logoProfileSlots,
			trackTitleProfileSlots: s.trackTitleProfileSlots,
			backgroundImages: s.backgroundImages,
			activeImageId: s.activeImageId,
			editorImagePreviewQuality: s.editorImagePreviewQuality,
			removeSceneSlot: s.removeSceneSlot,
			renameSceneSlot: s.renameSceneSlot,
			applySceneSlotById: s.applySceneSlotById,
			updateSceneSlot: s.updateSceneSlot,
			setBackgroundImageSceneSlotId: s.setBackgroundImageSceneSlotId,
			setActiveImageId: s.setActiveImageId,
			addSceneSlot: s.addSceneSlot,
			captureSceneSlotFromCurrent: s.captureSceneSlotFromCurrent,
			surpriseMe: s.surpriseMe,
			setEditorImagePreviewQuality: s.setEditorImagePreviewQuality
		}))
	);
	const isSimple = useIsSimple();

	const [view, handleViewChange] = useTabViewState<SceneView>(
		'scene',
		'scenes',
		isSceneView,
		{ legacyStorageKey: MODERN_SCENE_VIEW_STORAGE_KEY }
	);

	const [captureSkipped, setCaptureSkipped] = useState<string[] | null>(null);
	const [renameId, setRenameId] = useState<string | null>(null);
	const [renameDraft, setRenameDraft] = useState('');
	const [pendingDeleteSceneId, setPendingDeleteSceneId] = useState<
		string | null
	>(null);
	const [openImageId, setOpenImageId] = useState<string | null>(null);
	const popoverRef = useRef<HTMLDivElement | null>(null);

	// Editing target is intentionally LOCAL — decoupled from
	// `activeSceneSlotId`, which can flip on its own when autocycle moves the
	// slideshow to an image that has (or doesn't have) a scene assigned.
	// Without this, opening a fresh scene to configure it and then having
	// autocycle advance one image would silently close the editor and lose
	// the user's place.
	const [editingSceneId, setEditingSceneId] = useState<string | null>(
		() => store.activeSceneSlotId
	);

	// First-time seed only: if the user hasn't picked an editing target yet
	// and a scene becomes active externally, snap to it. After the user
	// touches anything we stop following activeSceneSlotId.
	const editingTouchedRef = useRef(false);
	useEffect(() => {
		if (editingTouchedRef.current) return;
		if (!editingSceneId && store.activeSceneSlotId) {
			setEditingSceneId(store.activeSceneSlotId);
		}
	}, [store.activeSceneSlotId, editingSceneId]);

	// Drop editingSceneId when its target scene is deleted — otherwise the
	// editor would render against a stale id.
	useEffect(() => {
		if (
			editingSceneId &&
			!store.sceneSlots.some(s => s.id === editingSceneId)
		) {
			setEditingSceneId(null);
		}
	}, [store.sceneSlots, editingSceneId]);

	const activeScene =
		store.sceneSlots.find(s => s.id === editingSceneId) ?? null;
	const isEditingActive =
		!!activeScene && activeScene.id === store.activeSceneSlotId;

	function selectSceneForEditing(sceneId: string) {
		editingTouchedRef.current = true;
		setEditingSceneId(sceneId);
	}

	function activateSceneFromRadio(sceneId: string) {
		editingTouchedRef.current = true;
		setEditingSceneId(sceneId);
		store.applySceneSlotById(sceneId);
	}

	function commitSceneBinding(
		sceneId: string,
		patch: Partial<import('@/types/wallpaper').SceneSlot>
	) {
		store.updateSceneSlot(sceneId, patch);
		// Auto-apply: if the scene being edited is the live one, push the
		// new bindings into the wallpaper immediately so the user sees
		// changes without an extra Apply step. If it's an offline edit on a
		// scene that's not active, only the scene definition updates — the
		// wallpaper stays on whatever is currently applied.
		if (sceneId === store.activeSceneSlotId) {
			store.applySceneSlotById(sceneId);
		}
	}

	const allFeatureColumns = buildFeatureColumns(t);
	const featureColumns = allFeatureColumns.map(col => ({
		...col,
		slots: (() => {
			switch (col.key) {
				case 'spectrumSlotId':
					return store.spectrumProfileSlots;
				case 'spectrumSecondSlotId':
					return store.spectrumSecondProfileSlots;
				case 'looksSlotId':
					return store.looksProfileSlots;
				case 'particlesSlotId':
					return store.particlesProfileSlots;
				case 'rainSlotId':
					return store.rainProfileSlots;
				case 'lightsSlotId':
					return store.lightsProfileSlots;
				case 'cameraFxSlotId':
					return store.cameraFxProfileSlots;
				case 'logoSlotId':
					return store.logoProfileSlots;
				case 'trackTitleSlotId':
					return store.trackTitleProfileSlots;
			}
		})()
	}));

	const visibleColumns = isSimple
		? featureColumns.filter(c => SIMPLE_KEYS.includes(c.key))
		: featureColumns;
	const hiddenColumnCount = featureColumns.length - visibleColumns.length;

	useEffect(() => {
		if (!openImageId) return;
		const handlePointer = (event: PointerEvent) => {
			if (popoverRef.current?.contains(event.target as Node)) return;
			setOpenImageId(null);
		};
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpenImageId(null);
		};
		window.addEventListener('pointerdown', handlePointer);
		window.addEventListener('keydown', handleKey);
		return () => {
			window.removeEventListener('pointerdown', handlePointer);
			window.removeEventListener('keydown', handleKey);
		};
	}, [openImageId]);

	function confirmSceneDelete(sceneId: string) {
		store.removeSceneSlot(sceneId);
		if (renameId === sceneId) setRenameId(null);
		setPendingDeleteSceneId(null);
	}

	function assignSceneToImage(assetId: string, sceneSlotId: string | null) {
		store.setBackgroundImageSceneSlotId(assetId, sceneSlotId);
		store.setActiveImageId(assetId);
		setOpenImageId(null);
	}

	/**
	 * Capture the live look into a new scene. Non-destructive: the scene is
	 * appended but not applied, so what you see keeps rendering unchanged.
	 * `skipped` reports layers whose slot family was full.
	 */
	function handleCaptureScene() {
		const result = store.captureSceneSlotFromCurrent();
		setCaptureSkipped(
			result && result.skipped.length ? result.skipped : null
		);
	}

	const scenesAction = (
		<div className="flex items-center gap-1">
			<IconButton
				size="sm"
				onClick={handleCaptureScene}
				title={t.scene_btn_capture_tooltip}
			>
				<Camera size={ICON_SIZE.sm} />
			</IconButton>
			<IconButton
				size="sm"
				onClick={() => store.addSceneSlot()}
				title={t.scene_btn_new_tooltip}
			>
				<Plus size={ICON_SIZE.sm} />
			</IconButton>
			<IconButton
				size="sm"
				onClick={() => store.surpriseMe()}
				title={t.label_surprise_me}
			>
				<Sparkles size={ICON_SIZE.sm} />
			</IconButton>
		</div>
	);

	return (
		<EditorTabLayout
			header={
				<EditorTabHeader title={t.tab_scene}>
					<SegmentedControl<SceneView>
						value={view}
						onChange={handleViewChange}
						options={[
							{
								value: 'scenes',
								label: t.scene_section_scenes,
								icon: <Layers size={ICON_SIZE.xs} />
							},
							{
								value: 'setlists',
								label: t.scene_section_setlists,
								icon: <List size={ICON_SIZE.xs} />
							},
							{
								value: 'ai',
								label: t.ai_section_title,
								icon: <Sparkle size={ICON_SIZE.xs} />
							}
						]}
						size="sm"
						density="compact"
						full
						ariaLabel={t.scene_tab_aria}
					/>
				</EditorTabHeader>
			}
			footer={
				<EditorTabFooter title={t.label_reset}>
					<Button
						type="button"
						onClick={onReset}
						size="sm"
						density="compact"
						variant="secondary"
						icon={<RotateCcw size={ICON_SIZE.xs} />}
					>
						{t.scene_btn_reset_bindings_tooltip}
					</Button>
				</EditorTabFooter>
			}
		>
			{view === 'setlists' ? <SetlistsPanel /> : null}

			{view === 'ai' ? <AiDirectorPanel /> : null}

			{view === 'ai' && !isSimple ? <AiBatchPanel /> : null}

			{view === 'scenes' ? (
				<>
					<DiscoveryOnboardingCard
						onRequestMainTab={onRequestMainTab}
					/>

					<SectionCard
						title={t.scene_section_scenes}
						subtitle={
							activeScene
								? `${t.scene_subtitle_active_prefix}: ${activeScene.name}`
								: t.scene_subtitle_click_to_activate
						}
						action={scenesAction}
						padded={false}
					>
						{captureSkipped ? (
							<p
								className="px-4 pt-3 text-[11px]"
								style={{ color: UI_COLORS.warn }}
							>
								{t.scene_capture_skipped.replace(
									'{kinds}',
									captureSkipped.join(', ')
								)}
							</p>
						) : null}
						{store.sceneSlots.length === 0 ? (
							<p
								className="px-4 py-3 text-[11px]"
								style={{ color: UI_COLORS.fgMute }}
							>
								{t.scene_empty}
							</p>
						) : (
							<div className="flex flex-col">
								{store.sceneSlots.map((scene, idx) => {
									const isActive =
										store.activeSceneSlotId === scene.id;
									const isEditing =
										editingSceneId === scene.id;
									const isRenaming = renameId === scene.id;
									const isPendingDelete =
										pendingDeleteSceneId === scene.id;
									const boundCount = allFeatureColumns.filter(
										col =>
											scene[col.key] !== null &&
											scene[col.key] !== undefined
									).length;

									return (
										<div
											key={scene.id}
											className="flex items-center gap-2 px-4 py-2"
											style={{
												borderTop:
													idx > 0
														? `1px solid ${UI_COLORS.hairline}`
														: undefined,
												// Editing target gets a soft tint; the
												// live/active scene gets the stronger
												// accent so the radio + bg both signal
												// state separately.
												background: isActive
													? UI_COLORS.accentSoft
													: isEditing
														? UI_COLORS.raised
														: 'transparent'
											}}
										>
											<button
												type="button"
												onClick={() =>
													activateSceneFromRadio(
														scene.id
													)
												}
												title={t.scene_btn_activate}
												className="shrink-0 grid place-items-center"
												style={{
													width: 22,
													height: 22,
													borderRadius: 999,
													border: `2px solid ${isActive ? UI_COLORS.accent : UI_COLORS.border}`,
													background: isActive
														? UI_COLORS.accent
														: 'transparent',
													cursor: 'pointer'
												}}
											>
												{isActive ? (
													<span
														style={{
															width: 8,
															height: 8,
															borderRadius: 999,
															background:
																UI_COLORS.accentFg
														}}
													/>
												) : null}
											</button>

											{isRenaming ? (
												<>
													<input
														value={renameDraft}
														onChange={e =>
															setRenameDraft(
																e.target.value
															)
														}
														onKeyDown={e => {
															if (
																e.key ===
																'Enter'
															) {
																store.renameSceneSlot(
																	scene.id,
																	renameDraft
																);
																setRenameId(
																	null
																);
															}
															if (
																e.key ===
																'Escape'
															)
																setRenameId(
																	null
																);
														}}
														autoFocus
														className="min-w-0 flex-1 rounded px-2 py-1 text-[12px] outline-none"
														style={{
															border: `1px solid ${UI_COLORS.accent}`,
															background:
																UI_COLORS.overlay,
															color: UI_COLORS.fg
														}}
													/>
													<IconButton
														size="sm"
														onClick={() => {
															store.renameSceneSlot(
																scene.id,
																renameDraft
															);
															setRenameId(null);
														}}
														title={t.label_save}
													>
														<Check
															size={ICON_SIZE.sm}
														/>
													</IconButton>
													<IconButton
														size="sm"
														onClick={() =>
															setRenameId(null)
														}
														title={t.label_cancel}
													>
														<X
															size={ICON_SIZE.sm}
														/>
													</IconButton>
												</>
											) : (
												<>
													<button
														type="button"
														onClick={() =>
															selectSceneForEditing(
																scene.id
															)
														}
														onDoubleClick={() => {
															setRenameId(
																scene.id
															);
															setRenameDraft(
																scene.name
															);
														}}
														className="min-w-0 flex-1 truncate text-left text-[13px] font-medium"
														style={{
															color: isActive
																? UI_COLORS.accent
																: UI_COLORS.fg,
															background:
																'transparent',
															border: 0,
															cursor: 'pointer'
														}}
														title={
															t.scene_hint_activate_rename
														}
													>
														{scene.name}
													</button>
													<span
														className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-widest tabular-nums"
														style={{
															background:
																UI_COLORS.accentSoft,
															color: UI_COLORS.accent,
															border: `1px solid ${UI_COLORS.accentBorder}`,
															fontFamily:
																FONT.mono
														}}
													>
														{boundCount}{' '}
														{t.scene_badge_bound}
													</span>
													<IconButton
														size="sm"
														onClick={() => {
															setRenameId(
																scene.id
															);
															setRenameDraft(
																scene.name
															);
														}}
														title={t.label_rename}
													>
														<Pencil
															size={ICON_SIZE.sm}
														/>
													</IconButton>
													{isPendingDelete ? (
														<div className="flex items-center gap-1">
															<Button
																variant="destructive"
																size="sm"
																onClick={() =>
																	confirmSceneDelete(
																		scene.id
																	)
																}
															>
																{t.label_delete}
															</Button>
															<Button
																variant="ghost"
																size="sm"
																onClick={() =>
																	setPendingDeleteSceneId(
																		null
																	)
																}
															>
																{t.label_cancel}
															</Button>
														</div>
													) : (
														<IconButton
															size="sm"
															onClick={() =>
																setPendingDeleteSceneId(
																	scene.id
																)
															}
															title={
																t.scene_btn_delete
															}
														>
															<X
																size={
																	ICON_SIZE.sm
																}
															/>
														</IconButton>
													)}
												</>
											)}
										</div>
									);
								})}
							</div>
						)}
					</SectionCard>

					{activeScene && (
						<SectionCard
							title={t.scene_section_bindings}
							subtitle={t.scene_bindings_subtitle_template.replace(
								'{name}',
								activeScene.name
							)}
							padded={false}
						>
							<div className="flex flex-col gap-2 px-4 py-3">
								{visibleColumns.map(col => (
									<SceneBindingRow
										key={col.key}
										label={col.label}
										value={activeScene[col.key]}
										slots={col.slots}
										onChange={ref =>
											commitSceneBinding(activeScene.id, {
												[col.key]: ref
											} as Partial<typeof activeScene>)
										}
									/>
								))}
								<p
									className="text-[10px]"
									style={{ color: UI_COLORS.fgMute }}
								>
									{t.scene_bindings_hint}
								</p>
								{isSimple && hiddenColumnCount > 0 && (
									<p
										className="text-[10px]"
										style={{ color: UI_COLORS.fgMute }}
									>
										{t.scene_hidden_columns_hint_template.replace(
											'{n}',
											String(hiddenColumnCount)
										)}
									</p>
								)}
								{!isEditingActive ? (
									<div
										className="mt-1 flex items-center justify-between gap-3 rounded px-3 py-2 text-[11px]"
										style={{
											background: UI_COLORS.raised,
											border: `1px solid ${UI_COLORS.hairline}`,
											color: UI_COLORS.fgMute
										}}
									>
										<span>
											{t.scene_offline_editing_notice}
										</span>
										<Button
											variant="primary"
											size="sm"
											onClick={() => {
												if (!activeScene) return;
												activateSceneFromRadio(
													activeScene.id
												);
											}}
										>
											{t.scene_btn_activate_scene}
										</Button>
									</div>
								) : null}
							</div>
						</SectionCard>
					)}

					<SectionCard
						title={t.scene_section_sequence}
						subtitle={t.scene_section_sequence_subtitle}
						padded={false}
						action={
							<SegmentedControl<EditorImagePreviewQuality>
								size="sm"
								value={store.editorImagePreviewQuality}
								onChange={store.setEditorImagePreviewQuality}
								ariaLabel={t.scene_thumbnail_quality_aria}
								options={[
									{
										value: 'optimized',
										label: t.label_quality_optimized
									},
									{
										value: 'original',
										label: t.label_quality_original
									}
								]}
							/>
						}
					>
						<div className="px-4 py-3">
							{store.backgroundImages.length === 0 ? (
								<p
									className="text-[11px]"
									style={{ color: UI_COLORS.fgMute }}
								>
									{t.scene_empty_pool_hint}
								</p>
							) : (
								<div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
									{store.backgroundImages.map(
										(image, index) => {
											const isActive =
												image.assetId ===
												store.activeImageId;
											const isOpen =
												openImageId === image.assetId;
											const assignedScene =
												store.sceneSlots.find(
													s =>
														s.id ===
														image.sceneSlotId
												);
											return (
												<div
													key={image.assetId}
													className="relative flex flex-col gap-1"
												>
													<button
														type="button"
														onClick={() => {
															store.setActiveImageId(
																image.assetId
															);
															setOpenImageId(
																isOpen
																	? null
																	: image.assetId
															);
														}}
														className="relative overflow-hidden"
														style={{
															width: '100%',
															aspectRatio:
																'16 / 10',
															border: `1px solid ${isActive ? UI_COLORS.accent : isOpen ? UI_COLORS.accent : UI_COLORS.border}`,
															borderRadius:
																'var(--editor-radius-md)',
															background:
																UI_COLORS.overlay,
															cursor: 'pointer',
															boxShadow: isActive
																? `0 0 0 1px ${UI_COLORS.accent}, 0 4px 12px ${UI_COLORS.accentSoft}`
																: undefined
														}}
														title={t.scene_image_label_template.replace(
															'{n}',
															String(index + 1)
														)}
													>
														<img
															src={resolveEditorImagePreviewUrl(
																image,
																store.editorImagePreviewQuality,
																isActive
															)}
															alt={t.scene_image_label_template.replace(
																'{n}',
																String(
																	index + 1
																)
															)}
															className="block h-full w-full object-cover"
															loading="lazy"
															decoding="async"
														/>
														{assignedScene ? (
															<div
																className="absolute bottom-0 left-0 right-0 truncate px-1.5 py-0.5 text-[9px] font-medium"
																style={{
																	background:
																		'linear-gradient(0deg, rgba(0,0,0,0.85), rgba(0,0,0,0.3))',
																	color: UI_COLORS.fg
																}}
															>
																{
																	assignedScene.name
																}
															</div>
														) : null}
													</button>
													<div ref={popoverRef}>
														<FloatingPanel
															open={isOpen}
															onClose={() =>
																setOpenImageId(
																	null
																)
															}
															anchor="bottom"
															offset={4}
															style={{
																padding: 6,
																width: 'auto'
															}}
														>
															<div className="flex flex-col gap-1 min-w-40">
																<Button
																	variant={
																		image.sceneSlotId ===
																		null
																			? 'primary'
																			: 'secondary'
																	}
																	size="sm"
																	full
																	onClick={() =>
																		assignSceneToImage(
																			image.assetId,
																			null
																		)
																	}
																>
																	{
																		t.label_none
																	}
																</Button>
																{store.sceneSlots.map(
																	scene => (
																		<Button
																			key={
																				scene.id
																			}
																			variant={
																				image.sceneSlotId ===
																				scene.id
																					? 'primary'
																					: 'secondary'
																			}
																			size="sm"
																			full
																			onClick={() =>
																				assignSceneToImage(
																					image.assetId,
																					scene.id
																				)
																			}
																		>
																			{
																				scene.name
																			}
																		</Button>
																	)
																)}
															</div>
														</FloatingPanel>
													</div>
													<span
														className="text-[10px] tabular-nums"
														style={{
															color: isActive
																? UI_COLORS.accent
																: UI_COLORS.fgMute,
															fontFamily:
																FONT.mono
														}}
													>
														#{index + 1}
														{isActive ? ' ●' : ''}
													</span>
												</div>
											);
										}
									)}
								</div>
							)}
						</div>
					</SectionCard>
				</>
			) : null}
		</EditorTabLayout>
	);
}
