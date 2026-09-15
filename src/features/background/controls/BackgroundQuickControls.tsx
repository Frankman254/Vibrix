import { IMAGE_RANGES } from '@/config/ranges';
import type { SliderRange } from '@/types/controls';
import { Button, UI_COLORS } from '@/ui';
import BgFitModeSelector from './BgFitModeSelector';
import BgPreciseSliderControl from './BgPreciseSliderControl';
import { SwitchRow } from './activeWallpaperAtoms';
import { formatDecimal } from './bgFormat';

export default function BackgroundQuickControls({
	t,
	imageFitMode,
	imageScale,
	imagePositionX,
	imagePositionY,
	imageRotation,
	imageOpacity,
	imagePositionXRange,
	imagePositionYRange,
	imageMirror,
	imageMirrorFill,
	imageMirrorFillInvert,
	imageMirrorFillCount,
	imageCoverageLockEnabled,
	imageMinScale,
	imageCount,
	onChangeFitMode,
	onChangeScale,
	onChangePositionX,
	onChangePositionY,
	onChangeRotation,
	onChangeOpacity,
	onChangeMirror,
	onChangeMirrorFill,
	onChangeMirrorFillInvert,
	onChangeMirrorFillCount,
	onChangeImageCoverageLockEnabled,
	onAutoFrameActive,
	onAutoFrameAll,
	onResetFraming,
	onDownloadImage
}: {
	t: Record<string, string>;
	imageFitMode: Parameters<typeof BgFitModeSelector>[0]['value'];
	imageScale: number;
	imagePositionX: number;
	imagePositionY: number;
	imageRotation: number;
	imageOpacity: number;
	imagePositionXRange: SliderRange;
	imagePositionYRange: SliderRange;
	imageMirror: boolean;
	imageMirrorFill: boolean;
	imageMirrorFillInvert: boolean;
	imageMirrorFillCount: number;
	imageCoverageLockEnabled: boolean;
	imageMinScale: number;
	imageCount: number;
	onChangeFitMode: (
		value: Parameters<typeof BgFitModeSelector>[0]['value']
	) => void;
	onChangeScale: (value: number) => void;
	onChangePositionX: (value: number) => void;
	onChangePositionY: (value: number) => void;
	onChangeRotation: (value: number) => void;
	onChangeOpacity: (value: number) => void;
	onChangeMirror: (value: boolean) => void;
	onChangeMirrorFill: (value: boolean) => void;
	onChangeMirrorFillInvert: (value: boolean) => void;
	onChangeMirrorFillCount: (value: number) => void;
	onChangeImageCoverageLockEnabled: (value: boolean) => void;
	onAutoFrameActive: () => void;
	onAutoFrameAll: () => void;
	onResetFraming: () => void;
	onDownloadImage: () => void;
}) {
	return (
		<div
			className="flex flex-col gap-2 rounded-(--editor-radius-lg) border p-2"
			style={{
				borderColor: UI_COLORS.border,
				background: 'rgba(0,0,0,0.14)'
			}}
		>
			<div className="flex items-center justify-between gap-2">
				<span
					className="text-[11px] font-semibold uppercase tracking-widest"
					style={{ color: 'var(--editor-accent-soft)' }}
				>
					{t.label_quick_image_framing}
				</span>
				<span
					className="text-[10px] tabular-nums"
					style={{ color: 'var(--editor-accent-muted)' }}
				>
					min {formatDecimal(imageMinScale)}
				</span>
			</div>

			{/* Keep Covered pins the fit to the recomputed full-bleed cover;
			    exposing the selector would let the user pick a mode the lock
			    immediately overwrites. */}
			{imageCoverageLockEnabled ? null : (
				<BgFitModeSelector
					label={t.label_fit_mode}
					value={imageFitMode}
					onChange={onChangeFitMode}
				/>
			)}

			<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
				<SwitchRow
					label={t.label_bg_coverage_lock}
					checked={imageCoverageLockEnabled}
					onChange={onChangeImageCoverageLockEnabled}
				/>
				<SwitchRow
					label={t.label_mirror_image}
					checked={imageMirror}
					onChange={onChangeMirror}
				/>
				<SwitchRow
					label={t.label_mirror_fill}
					checked={imageMirrorFill}
					onChange={onChangeMirrorFill}
				/>
			</div>
			{imageMirrorFill ? (
				<SwitchRow
					label={t.label_mirror_fill_invert}
					checked={imageMirrorFillInvert}
					onChange={onChangeMirrorFillInvert}
				/>
			) : null}

			<div className="grid gap-2 xl:grid-cols-2">
				<BgPreciseSliderControl
					label={t.label_scale}
					value={imageScale}
					range={IMAGE_RANGES.scale}
					onChange={onChangeScale}
					resetValue={1}
					mode="log"
				/>
				<BgPreciseSliderControl
					label={t.label_opacity}
					value={imageOpacity}
					range={IMAGE_RANGES.opacity}
					onChange={onChangeOpacity}
					resetValue={1}
				/>
				<BgPreciseSliderControl
					label={t.label_position_x}
					value={imagePositionX}
					range={imagePositionXRange}
					onChange={onChangePositionX}
					resetValue={0}
				/>
				<BgPreciseSliderControl
					label={t.label_position_y}
					value={imagePositionY}
					range={imagePositionYRange}
					onChange={onChangePositionY}
					resetValue={0}
				/>
				<BgPreciseSliderControl
					label={`${t.label_rotation} (°)`}
					value={imageRotation}
					range={IMAGE_RANGES.rotation}
					unit="°"
					onChange={onChangeRotation}
					resetValue={0}
				/>
				{imageMirrorFill ? (
					<BgPreciseSliderControl
						label={t.label_mirror_fill_count}
						value={imageMirrorFillCount}
						range={{ min: 1, max: 5, step: 1 }}
						onChange={onChangeMirrorFillCount}
						resetValue={1}
					/>
				) : null}
			</div>
			{imageMirrorFill ? (
				<span
					className="text-[11px]"
					style={{ color: 'var(--editor-accent-muted)' }}
				>
					{t.hint_mirror_fill}
				</span>
			) : null}
			{imageCoverageLockEnabled && imageScale <= imageMinScale + 0.001 ? (
				<span
					className="text-[11px]"
					style={{ color: 'var(--editor-accent-muted)' }}
				>
					{t.hint_bg_coverage_min_scale}
				</span>
			) : null}

			<div className="grid grid-cols-2 gap-2">
				<Button
					onClick={onAutoFrameActive}
					size="sm"
					density="compact"
					variant="secondary"
					title={t.hint_auto_frame_current}
					full
				>
					{t.label_auto_frame_current}
				</Button>
				<Button
					onClick={onAutoFrameAll}
					disabled={imageCount === 0}
					size="sm"
					density="compact"
					variant="secondary"
					title={t.hint_auto_frame_all_images}
					full
				>
					{t.label_auto_frame_all_images}
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<Button
					onClick={onResetFraming}
					size="sm"
					density="compact"
					variant="secondary"
					full
				>
					{t.label_reset_framing}
				</Button>
				<Button
					onClick={onDownloadImage}
					disabled={imageCount === 0}
					size="sm"
					density="compact"
					variant="secondary"
					full
				>
					{t.label_download_original_image_asset}
				</Button>
			</div>
		</div>
	);
}
