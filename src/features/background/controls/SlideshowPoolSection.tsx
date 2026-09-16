import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, GripVertical, MoreHorizontal } from 'lucide-react';
import { useDialog } from '@/editor/DialogProvider';
import type {
	BackgroundImageItem,
	EditorImagePreviewQuality
} from '@/types/wallpaper';
import { resolveEditorImagePreviewUrl } from '@/lib/editorImagePreviews';
import BgSectionCard from './BgSectionCard';
import BgSlideshowControls from './BgSlideshowControls';
import { useLocalFolders } from '@/hooks/useLocalFolders';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import {
	Button,
	FloatingPanel,
	IconButton,
	ICON_SIZE,
	ToggleSwitch,
	UI_COLORS,
	FONT
} from '@/ui';
import { CollapsibleSection } from '@/editor';

// Drop position relative to a card. `before` and `after` keep the dragged
// card sibling-adjacent, so the user can place it at the start or end without
// moving onto a neighbouring card.
type DropEdge = 'before' | 'after';

function SwitchRow({
	label,
	checked,
	onChange,
	tooltip
}: {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
	tooltip?: string;
}) {
	return (
		<div
			className="flex items-center justify-between gap-3 rounded-[var(--editor-radius-md)] border px-3 py-2"
			style={{
				borderColor: UI_COLORS.border,
				background: UI_COLORS.raised
			}}
			title={tooltip}
		>
			<span
				className="min-w-0 text-[12px] font-medium"
				style={{ color: UI_COLORS.fg }}
			>
				{label}
			</span>
			<ToggleSwitch
				checked={checked}
				onChange={onChange}
				size="sm"
				ariaLabel={label}
			/>
		</div>
	);
}

const PoolImageCard = memo(function PoolImageCard({
	image,
	imageIndex,
	isActive,
	isDragSource,
	dropEdge,
	imagePreviewQuality,
	onSetActive,
	onSetEnabled,
	onRemove,
	onDragStart,
	onDragOver,
	onDragLeave,
	onDrop,
	onDragEnd
}: {
	image: BackgroundImageItem;
	imageIndex: number;
	isActive: boolean;
	isDragSource: boolean;
	dropEdge: DropEdge | null;
	imagePreviewQuality: EditorImagePreviewQuality;
	onSetActive: (id: string) => void;
	onSetEnabled: (id: string, enabled: boolean) => void;
	onRemove: (assetId: string) => void;
	onDragStart: (assetId: string) => void;
	onDragOver: (event: React.DragEvent, assetId: string) => void;
	onDragLeave: (assetId: string) => void;
	onDrop: (event: React.DragEvent, assetId: string) => void;
	onDragEnd: () => void;
}) {
	const enabled = image.enabled;
	const t = useT();
	return (
		<div
			className={`relative group aspect-video ${
				isDragSource ? 'opacity-40' : ''
			}`}
			draggable
			onDragStart={event => {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('text/plain', image.assetId);
				onDragStart(image.assetId);
			}}
			onDragOver={event => onDragOver(event, image.assetId)}
			onDragLeave={() => onDragLeave(image.assetId)}
			onDrop={event => onDrop(event, image.assetId)}
			onDragEnd={onDragEnd}
		>
			<img
				src={resolveEditorImagePreviewUrl(
					image,
					imagePreviewQuality,
					isActive
				)}
				alt=""
				loading="lazy"
				onClick={() => onSetActive(image.assetId)}
				className={`w-full h-full cursor-pointer rounded object-cover transition-all border-2 ${
					isActive
						? 'border-cyan-500 scale-[1.02]'
						: 'border-transparent hover:border-gray-500'
				}`}
				style={{ opacity: enabled ? 1 : 0.35 }}
			/>

			{/* Drop indicator — vertical rail rendered on the active drop edge */}
			{dropEdge ? (
				<div
					className={`pointer-events-none absolute top-0 bottom-0 w-0.5 rounded-full ${
						dropEdge === 'before' ? '-left-1' : '-right-1'
					}`}
					style={{
						background: 'var(--editor-accent-color)',
						boxShadow: '0 0 8px var(--editor-accent-color)'
					}}
				/>
			) : null}

			{/* Drag handle — top-left, hover (always shown on touch) */}
			<div
				className="pointer-events-none absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/55 text-white opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
				title={t.bg_pool_drag_reorder}
			>
				<GripVertical size={11} strokeWidth={2.25} />
			</div>

			{/* Enable/disable toggle — top-right, hover */}
			<button
				type="button"
				onClick={event => {
					event.stopPropagation();
					onSetEnabled(image.assetId, !enabled);
				}}
				className={`absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded text-[10px] leading-none transition-opacity ${
					enabled
						? 'bg-black/55 text-white opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100'
						: 'bg-amber-500/85 text-black opacity-100'
				}`}
				title={
					enabled
						? 'Disable image (skip in slideshow)'
						: 'Enable image'
				}
				aria-label={enabled ? 'Disable image' : 'Enable image'}
			>
				{enabled ? <Eye size={11} /> : <EyeOff size={11} />}
			</button>

			{/* Remove — bottom-right, hover */}
			<button
				type="button"
				onClick={event => {
					event.stopPropagation();
					onRemove(image.assetId);
				}}
				className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600/90 text-xs leading-none text-white opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
				aria-label="Remove image"
			>
				×
			</button>

			{/* Index badge — bottom-left */}
			<span
				className="pointer-events-none absolute bottom-0 left-0 rounded-tr px-1.5 py-0.5 text-[9px] font-medium tracking-wider"
				style={{
					background: enabled
						? 'rgba(0,0,0,0.7)'
						: 'rgba(146, 64, 14, 0.85)',
					color: 'white'
				}}
			>
				{enabled ? imageIndex + 1 : 'OFF'}
			</span>
		</div>
	);
});

function SlideshowPoolSection({
	t,
	imageIds,
	backgroundImages,
	activeImage,
	activeImageIndex,
	imagePreviewQuality,
	showPoolThumbnails,
	onToggleShowThumbnails,
	onMultiUploadClick,
	onClearAllImages,
	onSetActiveImage,
	onSetEntryEnabled,
	onMoveEntryToIndex,
	onRemoveImage,
	onMoveLeft,
	onMoveRight,
	onShuffle,
	onVirtualImageSelect
}: {
	t: Record<string, string>;
	imageIds: string[];
	backgroundImages: BackgroundImageItem[];
	activeImage: BackgroundImageItem | null;
	activeImageIndex: number;
	imagePreviewQuality: EditorImagePreviewQuality;
	showPoolThumbnails: boolean;
	onToggleShowThumbnails: (value: boolean) => void;
	onMultiUploadClick: () => void;
	onClearAllImages: () => void;
	onSetActiveImage: (id: string) => void;
	onSetEntryEnabled: (id: string, enabled: boolean) => void;
	onMoveEntryToIndex: (id: string, targetIndex: number) => void;
	onRemoveImage: (assetId: string) => void;
	onMoveLeft: () => void;
	onMoveRight: () => void;
	onShuffle: () => void;
	onVirtualImageSelect: (virtualId: string, fileName: string) => void;
}) {
	const { confirm } = useDialog();
	const [moreMenuOpen, setMoreMenuOpen] = useState(false);
	const localFolders = useLocalFolders();
	const virtualFoldersEnabled = useWallpaperStore(
		state => state.virtualFoldersEnabled
	);
	const setVirtualFoldersEnabled = useWallpaperStore(
		state => state.setVirtualFoldersEnabled
	);

	// Stable callbacks so memoised PoolImageCards keep their props referentially
	// equal across BgTab re-renders.
	const onRemoveImageRef = useRef(onRemoveImage);
	const onSetEntryEnabledRef = useRef(onSetEntryEnabled);
	useEffect(() => {
		onRemoveImageRef.current = onRemoveImage;
		onSetEntryEnabledRef.current = onSetEntryEnabled;
	});
	const stableOnRemove = useCallback(
		(assetId: string) => {
			void (async () => {
				const ok = await confirm({
					title: t.label_remove_image,
					message: t.confirm_remove_image_asset,
					confirmLabel: t.label_remove_image,
					cancelLabel: t.label_cancel,
					tone: 'warning'
				});
				if (!ok) return;
				onRemoveImageRef.current(assetId);
			})();
		},
		[confirm, t]
	);
	const stableOnSetEnabled = useCallback((id: string, enabled: boolean) => {
		onSetEntryEnabledRef.current(id, enabled);
	}, []);

	// Drag state lives here so PoolImageCard stays memoised; it only re-renders
	// the source card and the current target.
	const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
	const [dropTarget, setDropTarget] = useState<{
		assetId: string;
		edge: DropEdge;
	} | null>(null);

	const handleDragStart = useCallback((assetId: string) => {
		setDraggedAssetId(assetId);
		setDropTarget(null);
	}, []);

	const handleDragOver = useCallback(
		(event: React.DragEvent, assetId: string) => {
			if (!draggedAssetId || draggedAssetId === assetId) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = 'move';
			const rect = event.currentTarget.getBoundingClientRect();
			const edge: DropEdge =
				event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
			setDropTarget(prev =>
				prev?.assetId === assetId && prev.edge === edge
					? prev
					: { assetId, edge }
			);
		},
		[draggedAssetId]
	);

	const handleDragLeave = useCallback((assetId: string) => {
		setDropTarget(prev => (prev?.assetId === assetId ? null : prev));
	}, []);

	const handleDrop = useCallback(
		(event: React.DragEvent, targetAssetId: string) => {
			event.preventDefault();
			const sourceAssetId =
				draggedAssetId ||
				event.dataTransfer.getData('text/plain') ||
				null;
			setDraggedAssetId(null);
			const edge = dropTarget?.edge ?? 'after';
			setDropTarget(null);
			if (!sourceAssetId || sourceAssetId === targetAssetId) return;

			const sourceIndex = backgroundImages.findIndex(
				image => image.assetId === sourceAssetId
			);
			const targetIndex = backgroundImages.findIndex(
				image => image.assetId === targetAssetId
			);
			if (sourceIndex < 0 || targetIndex < 0) return;
			let insertionIndex = targetIndex + (edge === 'after' ? 1 : 0);
			// Removing the source first shifts later indices left by one.
			if (sourceIndex < insertionIndex) insertionIndex -= 1;
			if (insertionIndex === sourceIndex) return;
			onMoveEntryToIndex(sourceAssetId, insertionIndex);
		},
		[backgroundImages, draggedAssetId, dropTarget, onMoveEntryToIndex]
	);

	const handleDragEnd = useCallback(() => {
		setDraggedAssetId(null);
		setDropTarget(null);
	}, []);

	async function handleShuffle() {
		const ok = await confirm({
			title: t.label_shuffle_order,
			message: t.confirm_shuffle_order,
			confirmLabel: t.label_shuffle_order,
			cancelLabel: t.label_cancel,
			tone: 'warning'
		});
		if (!ok) return;
		onShuffle();
	}

	async function handleClearAll() {
		const ok = await confirm({
			title: 'Clear image pool?',
			message: `This removes ALL ${imageIds.length} image${imageIds.length === 1 ? '' : 's'} from the pool. Local file URLs cannot be re-loaded automatically — you would have to re-pick the files from disk. This action cannot be undone.`,
			confirmLabel: 'Clear pool',
			cancelLabel: t.label_cancel,
			tone: 'danger'
		});
		if (!ok) return;
		onClearAllImages();
	}

	const hasPool = backgroundImages.length > 0;

	return (
		<BgSectionCard
			title={t.label_slideshow_pool}
			hint={t.hint_slideshow_pool}
		>
			{/* ── Header: upload + clear ─────────────────────────────────── */}
			<div className="flex gap-2">
				<Button
					onClick={onMultiUploadClick}
					size="sm"
					density="compact"
					variant="primary"
					full
				>
					{t.upload_images}
				</Button>
				{imageIds.length > 0 && (
					<Button
						onClick={() => void handleClearAll()}
						size="sm"
						density="compact"
						variant="destructive"
						title={t.bg_pool_remove_all}
					>
						{t.label_clear}
					</Button>
				)}
			</div>

			{/* ── Pool grid + per-pool actions ───────────────────────────── */}
			{hasPool && showPoolThumbnails && (
				<div className="flex flex-col gap-2">
					<div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 max-h-[18rem] overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
						{backgroundImages.map((image, imageIndex) => (
							<PoolImageCard
								key={image.assetId}
								image={image}
								imageIndex={imageIndex}
								isActive={
									activeImage?.assetId === image.assetId
								}
								isDragSource={draggedAssetId === image.assetId}
								dropEdge={
									dropTarget?.assetId === image.assetId
										? dropTarget.edge
										: null
								}
								imagePreviewQuality={imagePreviewQuality}
								onSetActive={onSetActiveImage}
								onSetEnabled={stableOnSetEnabled}
								onRemove={stableOnRemove}
								onDragStart={handleDragStart}
								onDragOver={handleDragOver}
								onDragLeave={handleDragLeave}
								onDrop={handleDrop}
								onDragEnd={handleDragEnd}
							/>
						))}
					</div>
					<span
						className="text-[10px]"
						style={{ color: UI_COLORS.fgFaint }}
					>
						{backgroundImages.length} {t.label_images_loaded}
					</span>
				</div>
			)}
			{hasPool && !showPoolThumbnails && (
				<span
					className="text-[11px]"
					style={{ color: UI_COLORS.fgMute }}
				>
					{backgroundImages.length} {t.label_images_loaded}
				</span>
			)}

			{/* Pool actions live in a single popover menu so the panel
			    isn't dominated by 4 secondary buttons. The grid + Upload +
			    Clear + Show-thumbnails toggle stay visible as primary
			    flow; everything else (reorder, shuffle, bulk auto-fit)
			    opens on demand. */}
			{hasPool && backgroundImages.length > 1 && (
				<div className="relative flex justify-end">
					<IconButton
						size="sm"
						density="compact"
						onClick={() => setMoreMenuOpen(open => !open)}
						title={t.bg_pool_more_actions}
						aria-expanded={moreMenuOpen}
					>
						<MoreHorizontal size={ICON_SIZE.sm} />
					</IconButton>
					<FloatingPanel
						open={moreMenuOpen}
						onClose={() => setMoreMenuOpen(false)}
						anchor="bottom"
						className="min-w-[14rem] p-2"
					>
						<div className="flex flex-col gap-1.5">
							<Button
								onClick={() => {
									onMoveLeft();
									setMoreMenuOpen(false);
								}}
								disabled={activeImageIndex <= 0}
								size="sm"
								density="compact"
								variant="secondary"
								full
							>
								{t.label_move_left}
							</Button>
							<Button
								onClick={() => {
									onMoveRight();
									setMoreMenuOpen(false);
								}}
								disabled={
									activeImageIndex < 0 ||
									activeImageIndex >=
										backgroundImages.length - 1
								}
								size="sm"
								density="compact"
								variant="secondary"
								full
							>
								{t.label_move_right}
							</Button>
							<Button
								onClick={() => {
									setMoreMenuOpen(false);
									void handleShuffle();
								}}
								size="sm"
								density="compact"
								variant="secondary"
								full
							>
								{t.label_shuffle_order}
							</Button>
							<span
								className="text-[10px] px-1 pt-1"
								style={{ color: UI_COLORS.fgMute }}
							>
								{t.hint_shuffle_order}
							</span>
						</div>
					</FloatingPanel>
				</div>
			)}

			{/* ── View toggle ────────────────────────────────────────────── */}
			{hasPool && (
				<SwitchRow
					label={t.label_show_bg_thumbnails}
					checked={showPoolThumbnails}
					onChange={onToggleShowThumbnails}
					tooltip={t.hint_show_bg_thumbnails}
				/>
			)}

			{/* ── Virtual folders (collapsible, off the main flow) ───────── */}
			<CollapsibleSection
				title={t.label_enable_virtual_folders ?? 'Virtual Folders'}
				defaultOpen={false}
				dense
			>
				<div className="flex flex-col gap-2">
					<SwitchRow
						label={
							t.label_enable_virtual_folders ??
							'Enable Virtual Folders'
						}
						checked={virtualFoldersEnabled}
						onChange={setVirtualFoldersEnabled}
						tooltip={
							t.hint_virtual_folders ??
							'Scan local folders without copying files into the browser storage.'
						}
					/>
					{virtualFoldersEnabled &&
						localFolders.imageFolderLoaded &&
						localFolders.imageFiles.length > 0 && (
							<div
								className="flex flex-col gap-2 rounded border px-2 py-2"
								style={{
									borderColor: 'var(--editor-button-border)',
									background: 'var(--editor-surface-bg)'
								}}
							>
								<div
									className="flex justify-between items-center pb-1 border-b"
									style={{
										borderColor:
											'var(--editor-accent-border)'
									}}
								>
									<span
										className="text-[10px]"
										style={{
											color: UI_COLORS.fg,
											fontFamily: FONT.mono
										}}
									>
										{t.label_virtual_image_folder ??
											'Virtual Folder'}{' '}
										({localFolders.imageFiles.length})
									</span>
									<Button
										onClick={() => {
											for (const fileConf of localFolders.imageFiles) {
												onVirtualImageSelect(
													fileConf.virtualId,
													fileConf.name
												);
											}
										}}
										className="ml-2 flex-shrink-0"
										size="sm"
										density="compact"
										variant="primary"
									>
										Add All
									</Button>
								</div>
								<div className="flex flex-col max-h-32 overflow-y-auto gap-0.5 pr-1 mt-1 custom-scrollbar">
									{localFolders.imageFiles.map(f => (
										<button
											key={f.virtualId}
											onClick={() =>
												onVirtualImageSelect(
													f.virtualId,
													f.name
												)
											}
											className="flex justify-between items-center px-1.5 py-1 text-xs rounded transition-colors text-left group"
											style={{
												color: 'var(--editor-button-fg)'
											}}
											onMouseEnter={e =>
												(e.currentTarget.style.background =
													'var(--editor-button-bg)')
											}
											onMouseLeave={e =>
												(e.currentTarget.style.background =
													'transparent')
											}
										>
											<span className="truncate pr-2">
												{f.name}
											</span>
											<span
												className="text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
												style={{
													color: UI_COLORS.accent
												}}
											>
												Add
											</span>
										</button>
									))}
								</div>
							</div>
						)}
				</div>
			</CollapsibleSection>

			{/* ── Slideshow timing (BgSlideshowControls) ─────────────────── */}
			{backgroundImages.length > 1 ? (
				<div className="flex flex-col gap-2">
					<div
						className="border-t pt-2 text-[10px] uppercase tracking-[0.12em]"
						style={{
							borderColor: UI_COLORS.hairline,
							color: UI_COLORS.fgMute,
							fontFamily: FONT.mono
						}}
					>
						{t.section_slideshow}
					</div>
					<BgSlideshowControls />
				</div>
			) : (
				<span
					className="text-[11px]"
					style={{ color: UI_COLORS.fgMute }}
				>
					{t.hint_slideshow_pool}
				</span>
			)}
		</BgSectionCard>
	);
}

export default memo(
	SlideshowPoolSection,
	(prev, next) =>
		prev.backgroundImages === next.backgroundImages &&
		prev.imageIds === next.imageIds &&
		prev.activeImage === next.activeImage &&
		prev.activeImageIndex === next.activeImageIndex &&
		prev.imagePreviewQuality === next.imagePreviewQuality &&
		prev.showPoolThumbnails === next.showPoolThumbnails &&
		prev.onSetEntryEnabled === next.onSetEntryEnabled &&
		prev.onMoveEntryToIndex === next.onMoveEntryToIndex &&
		prev.t === next.t
);
