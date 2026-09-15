import { useState, type ReactNode } from 'react';
import type { BackgroundImageItem } from '@/types/wallpaper';
import type { SliderRange } from '@/types/controls';
import { Button } from '@/ui';
import BgFitModeSelector from './BgFitModeSelector';
import BgSectionCard from './BgSectionCard';
import BackgroundQuickControls from './BackgroundQuickControls';
import FocusQuickControls from './FocusQuickControls';
import InteractiveImagePreview from './InteractiveImagePreview';

export default function BackgroundCardShell({
	t,
	activeImage,
	activeImageIndex,
	imageCount,
	onUploadClick,
	onPreviousImage,
	onNextImage,
	onDownloadImage,
	children,
	imageFitMode,
	imageScale,
	imagePositionX,
	imagePositionY,
	imagePositionXRange,
	imagePositionYRange,
	imageFocusX,
	imageFocusY,
	imageRotation,
	imageOpacity,
	imagePreviewUrl,
	imageMirror,
	imageMirrorFill,
	imageMirrorFillInvert,
	imageMirrorFillCount,
	coverageLockActive,
	layoutResponsiveEnabled,
	layoutBackgroundReframeEnabled,
	layoutReferenceWidth,
	layoutReferenceHeight,
	onChangePositionX,
	onChangePositionY,
	onChangeFocusPoint,
	onChangeFitMode,
	onChangeScale,
	onChangeRotation,
	onChangeOpacity,
	onChangeMirror,
	onChangeMirrorFill,
	onChangeMirrorFillInvert,
	onChangeMirrorFillCount,
	onChangeImageCoverageLockEnabled,
	onAutoFrameActive,
	onAutoFrameAll,
	onAutoFocusActiveImage,
	imageMinScale,
	onResetFraming,
	onCenterFocus
}: {
	t: Record<string, string>;
	activeImage: BackgroundImageItem | null;
	activeImageIndex: number;
	imageCount: number;
	onUploadClick: () => void;
	onPreviousImage: () => void;
	onNextImage: () => void;
	onDownloadImage: () => void;
	children: ReactNode;
	imageFitMode: Parameters<typeof BgFitModeSelector>[0]['value'];
	imageScale: number;
	imagePositionX: number;
	imagePositionY: number;
	imagePositionXRange: SliderRange;
	imagePositionYRange: SliderRange;
	imageFocusX: number | null;
	imageFocusY: number | null;
	imageRotation: number;
	imageOpacity: number;
	imagePreviewUrl: string;
	imageMirror: boolean;
	imageMirrorFill: boolean;
	imageMirrorFillInvert: boolean;
	imageMirrorFillCount: number;
	coverageLockActive: boolean;
	layoutResponsiveEnabled: boolean;
	layoutBackgroundReframeEnabled: boolean;
	layoutReferenceWidth: number;
	layoutReferenceHeight: number;
	onChangePositionX: (value: number) => void;
	onChangePositionY: (value: number) => void;
	onChangeFocusPoint: (x: number | null, y: number | null) => void;
	onChangeFitMode: (
		value: Parameters<typeof BgFitModeSelector>[0]['value']
	) => void;
	onChangeScale: (value: number) => void;
	onChangeRotation: (value: number) => void;
	onChangeOpacity: (value: number) => void;
	onChangeMirror: (value: boolean) => void;
	onChangeMirrorFill: (value: boolean) => void;
	onChangeMirrorFillInvert: (value: boolean) => void;
	onChangeMirrorFillCount: (value: number) => void;
	onChangeImageCoverageLockEnabled: (value: boolean) => void;
	onAutoFrameActive: () => void;
	onAutoFrameAll: () => void;
	onAutoFocusActiveImage: () => void;
	imageMinScale: number;
	onResetFraming: () => void;
	onCenterFocus: () => void;
}) {
	const [pickFocusActive, setPickFocusActive] = useState(false);

	return (
		<BgSectionCard
			title={t.label_active_wallpaper}
			hint={
				activeImage ? t.hint_per_image_settings : t.hint_slideshow_pool
			}
		>
			<div className="flex flex-col gap-3">
				{activeImage ? (
					<div className="flex min-w-0 flex-col gap-1.5">
						{activeImageIndex >= 0 ? (
							<span
								className="text-[11px]"
								style={{
									color: 'var(--editor-accent-muted)'
								}}
							>
								{t.label_image_order} {activeImageIndex + 1} /{' '}
								{imageCount}
							</span>
						) : null}
						<div className="grid grid-cols-3 gap-2">
							<Button
								onClick={onPreviousImage}
								disabled={imageCount < 2}
								size="sm"
								density="compact"
								variant="secondary"
								full
							>
								{t.label_previous_image}
							</Button>
							<Button
								onClick={onUploadClick}
								size="sm"
								density="compact"
								variant="primary"
								full
							>
								{t.upload_images}
							</Button>
							<Button
								onClick={onNextImage}
								disabled={imageCount < 2}
								size="sm"
								density="compact"
								variant="secondary"
								full
							>
								{t.label_next_image}
							</Button>
						</div>
					</div>
				) : null}

				{activeImage?.url ? (
					<InteractiveImagePreview
						imageUrl={imagePreviewUrl || activeImage.url}
						fitMode={imageFitMode}
						scale={imageScale}
						positionX={imagePositionX}
						positionY={imagePositionY}
						focusX={imageFocusX}
						focusY={imageFocusY}
						rotation={imageRotation}
						mirror={imageMirror}
						mirrorFill={imageMirrorFill}
						mirrorFillInvert={imageMirrorFillInvert}
						mirrorFillCount={imageMirrorFillCount}
						coverageLockActive={coverageLockActive}
						layoutResponsiveEnabled={layoutResponsiveEnabled}
						layoutBackgroundReframeEnabled={
							layoutBackgroundReframeEnabled
						}
						layoutReferenceWidth={layoutReferenceWidth}
						layoutReferenceHeight={layoutReferenceHeight}
						pickFocusActive={pickFocusActive}
						onChangePositionX={onChangePositionX}
						onChangePositionY={onChangePositionY}
						onPickFocus={(x, y) => {
							onChangeFocusPoint(x, y);
							setPickFocusActive(false);
						}}
					/>
				) : (
					<Button
						onClick={onUploadClick}
						size="md"
						variant="primary"
						full
						className="h-14"
					>
						{t.upload_images}
					</Button>
				)}

				{activeImage?.url ? (
					<FocusQuickControls
						t={t}
						focusX={imageFocusX}
						focusY={imageFocusY}
						pickFocusActive={pickFocusActive}
						onPickFocus={() =>
							setPickFocusActive(current => !current)
						}
						onCenterFocus={() => {
							onCenterFocus();
							setPickFocusActive(false);
						}}
						onAutoFocus={() => {
							onAutoFocusActiveImage();
							setPickFocusActive(false);
						}}
						onChangeFocusPoint={(x, y) => {
							onChangeFocusPoint(x, y);
							setPickFocusActive(false);
						}}
					/>
				) : null}

				{activeImage?.url ? (
					<BackgroundQuickControls
						t={t}
						imageFitMode={imageFitMode}
						imageScale={imageScale}
						imagePositionX={imagePositionX}
						imagePositionY={imagePositionY}
						imageRotation={imageRotation}
						imageOpacity={imageOpacity}
						imagePositionXRange={imagePositionXRange}
						imagePositionYRange={imagePositionYRange}
						imageMirror={imageMirror}
						imageMirrorFill={imageMirrorFill}
						imageMirrorFillInvert={imageMirrorFillInvert}
						imageMirrorFillCount={imageMirrorFillCount}
						imageCoverageLockEnabled={coverageLockActive}
						imageMinScale={imageMinScale}
						imageCount={imageCount}
						onChangeFitMode={onChangeFitMode}
						onChangeScale={onChangeScale}
						onChangePositionX={onChangePositionX}
						onChangePositionY={onChangePositionY}
						onChangeRotation={onChangeRotation}
						onChangeOpacity={onChangeOpacity}
						onChangeMirror={onChangeMirror}
						onChangeMirrorFill={onChangeMirrorFill}
						onChangeMirrorFillInvert={onChangeMirrorFillInvert}
						onChangeMirrorFillCount={onChangeMirrorFillCount}
						onChangeImageCoverageLockEnabled={
							onChangeImageCoverageLockEnabled
						}
						onAutoFrameActive={onAutoFrameActive}
						onAutoFrameAll={onAutoFrameAll}
						onResetFraming={onResetFraming}
						onDownloadImage={onDownloadImage}
					/>
				) : null}

				<div className="flex min-w-0 flex-1 flex-col gap-2">
					{activeImageIndex < 0 ? (
						<span
							className="text-[11px]"
							style={{ color: 'var(--editor-accent-muted)' }}
						>
							{t.hint_slideshow_pool}
						</span>
					) : null}

					{children}
				</div>
			</div>
		</BgSectionCard>
	);
}
