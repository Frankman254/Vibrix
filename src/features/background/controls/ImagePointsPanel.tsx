/**
 * The THREE points of an image, in one panel directly under the preview.
 *
 *  - **Focus**: the framing point. How this picture is composed on screen —
 *    what stays in frame when the stage crops it.
 *  - **Face**: where the subject's face is. An annotation ABOUT the image, used
 *    by anything that has to crop around it (the intro's panels, for one).
 *  - **Mark**: the calm place a logo (and the spectrum, when it follows the
 *    logo) can sit without landing on that face.
 *
 * They used to be two stacked sections with six sliders between them, which
 * pushed the controls below the fold: «si estan muy abajo los controles no
 * puedo ver en tiempo real donde quedaria». So only ONE point is edited at a
 * time — the selector picks it, the preview right above shows every marker —
 * and the panel stays short enough that the preview never leaves the screen.
 *
 * Reads the store directly for the annotations instead of taking a dozen more
 * props: the framing panel above already threads twenty, and none of them are
 * about this.
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button, Caption, SegmentedControl, UI_COLORS } from '@/ui';
import { useT } from '@/lib/i18n';
import { useIsAdvanced } from '@/editor/UIMode';
import ToggleControl from '@/editor/ToggleControl';
import { useWallpaperStore } from '@/store/wallpaperStore';
import BgPreciseSliderControl from './BgPreciseSliderControl';
import type { ImageFocusPointKind } from './InteractiveImagePreview';

/** Which of the three points the panel is editing right now. */
export type ImagePointKind = 'focus' | ImageFocusPointKind;

export default function ImagePointsPanel({
	t,
	focusX,
	focusY,
	pickMode,
	onPickModeChange,
	onCenterFocus,
	onAutoFocus,
	onChangeFocusPoint
}: {
	t: Record<string, string>;
	focusX: number | null;
	focusY: number | null;
	/** The point a click on the preview places, armed from here. */
	pickMode: ImagePointKind | null;
	onPickModeChange: (mode: ImagePointKind | null) => void;
	onCenterFocus: () => void;
	onAutoFocus: () => void;
	onChangeFocusPoint: (x: number | null, y: number | null) => void;
}) {
	const tr = useT();
	const isAdvanced = useIsAdvanced();
	const [point, setPoint] = useState<ImagePointKind>('focus');
	const [busy, setBusy] = useState(false);
	const store = useWallpaperStore(
		useShallow(s => ({
			activeImageId: s.activeImageId,
			backgroundImages: s.backgroundImages,
			setFaceFocus: s.setBackgroundImageFaceFocus,
			setLogoFocus: s.setBackgroundImageLogoFocus,
			clearFocus: s.clearBackgroundImageFocus,
			analyze: s.analyzeBackgroundImageFocus,
			analyzeAll: s.analyzeAllBackgroundImageFocus,
			logoFollowImageFocus: s.logoFollowImageFocus,
			setLogoFollowImageFocus: s.setLogoFollowImageFocus,
			applyImageLogoFocus: s.applyImageLogoFocus
		}))
	);
	const image = store.backgroundImages.find(
		item => item.assetId === store.activeImageId
	);
	if (!image?.url) return null;

	// Every task that can move the mark ends by re-applying it, because the
	// logo only moves on screen when the follow switch is on.
	const run = async (task: () => Promise<void>) => {
		setBusy(true);
		try {
			await task();
			if (store.logoFollowImageFocus) {
				await store.applyImageLogoFocus(image.assetId);
			}
		} finally {
			setBusy(false);
		}
	};

	const armed = pickMode === point;
	const arm = () => onPickModeChange(armed ? null : point);

	return (
		<div
			className="flex flex-col gap-2 rounded-(--editor-radius-md) border px-2 py-2"
			style={{
				borderColor: UI_COLORS.border,
				background: 'rgba(0,0,0,0.12)'
			}}
		>
			<SegmentedControl<ImagePointKind>
				value={point}
				onChange={next => {
					setPoint(next);
					// Arming carries over: switching point while a pick is armed
					// would otherwise place the OTHER point on the next click.
					if (pickMode) onPickModeChange(next);
				}}
				options={[
					{ value: 'focus', label: tr.image_points_focus },
					{ value: 'face', label: tr.image_points_face },
					{ value: 'logo', label: tr.image_points_mark }
				]}
				size="sm"
				density="compact"
				full
				ariaLabel={tr.image_points_title}
			/>
			<div className="grid grid-cols-2 gap-2">
				<Button
					onClick={arm}
					size="sm"
					density="compact"
					variant={armed ? 'primary' : 'secondary'}
					disabled={busy}
					title={tr.image_points_pick_hint}
					full
				>
					{armed
						? tr.focus_points_pick_done
						: tr.image_points_pick_here}
				</Button>
				{point === 'focus' ? (
					<Button
						onClick={onCenterFocus}
						size="sm"
						density="compact"
						variant="secondary"
						title={t.hint_image_focus_point}
						full
					>
						{t.label_center_focus}
					</Button>
				) : (
					<Button
						onClick={() =>
							void run(() =>
								store.analyze(image.assetId, {
									overwriteManual: true
								})
							)
						}
						size="sm"
						density="compact"
						variant="secondary"
						disabled={busy}
						title={tr.focus_points_scan_t}
						full
					>
						{tr.focus_points_scan}
					</Button>
				)}
				{point === 'focus' ? (
					<Button
						onClick={() => onChangeFocusPoint(null, null)}
						size="sm"
						density="compact"
						variant="secondary"
						title={t.hint_image_focus_point}
						full
					>
						{t.label_clear_focus}
					</Button>
				) : (
					<Button
						onClick={() => void run(() => store.analyzeAll())}
						size="sm"
						density="compact"
						variant="secondary"
						disabled={busy}
						title={tr.focus_points_scan_all_t}
						full
					>
						{tr.focus_points_scan_all}
					</Button>
				)}
				{point === 'focus' ? (
					<Button
						onClick={onAutoFocus}
						size="sm"
						density="compact"
						variant="secondary"
						title={t.hint_auto_focus}
						full
					>
						{t.label_auto_focus}
					</Button>
				) : (
					<Button
						onClick={() => store.clearFocus(image.assetId)}
						size="sm"
						density="compact"
						variant="secondary"
						disabled={busy}
						full
					>
						{tr.focus_points_clear}
					</Button>
				)}
			</div>
			{point === 'focus' && !isAdvanced ? null : (
				<div className="grid gap-2 sm:grid-cols-2">
					<BgPreciseSliderControl
						label={
							point === 'focus'
								? tr.image_points_focus_x
								: point === 'face'
									? tr.focus_points_face_x
									: tr.focus_points_logo_x
						}
						value={
							point === 'focus'
								? (focusX ?? 0.5)
								: point === 'face'
									? (image.faceFocusX ?? 0.5)
									: (image.logoFocusX ?? 0.5)
						}
						range={{ min: 0, max: 1, step: 0.01 }}
						onChange={value => {
							if (point === 'focus') {
								onChangeFocusPoint(value, focusY ?? 0.5);
								return;
							}
							if (point === 'face') {
								store.setFaceFocus(
									image.assetId,
									value,
									image.faceFocusY ?? 0.5
								);
								return;
							}
							void run(async () =>
								store.setLogoFocus(
									image.assetId,
									value,
									image.logoFocusY ?? 0.5
								)
							);
						}}
						resetValue={0.5}
					/>
					<BgPreciseSliderControl
						label={
							point === 'focus'
								? tr.image_points_focus_y
								: point === 'face'
									? tr.focus_points_face_y
									: tr.focus_points_logo_y
						}
						value={
							point === 'focus'
								? (focusY ?? 0.5)
								: point === 'face'
									? (image.faceFocusY ?? 0.5)
									: (image.logoFocusY ?? 0.5)
						}
						range={{ min: 0, max: 1, step: 0.01 }}
						onChange={value => {
							if (point === 'focus') {
								onChangeFocusPoint(focusX ?? 0.5, value);
								return;
							}
							if (point === 'face') {
								store.setFaceFocus(
									image.assetId,
									image.faceFocusX ?? 0.5,
									value
								);
								return;
							}
							void run(async () =>
								store.setLogoFocus(
									image.assetId,
									image.logoFocusX ?? 0.5,
									value
								)
							);
						}}
						resetValue={0.5}
					/>
				</div>
			)}
			{/* The switch that makes the mark focus actually move the logo. It
			    also lives in the Logo tab, but this is where the point is
			    placed, so this is where the user looks for it. */}
			{point === 'logo' ? (
				<ToggleControl
					label={tr.logo_follow_image_focus}
					value={store.logoFollowImageFocus}
					onChange={value => {
						store.setLogoFollowImageFocus(value);
						if (value) {
							void store.applyImageLogoFocus(image.assetId);
						}
					}}
					tooltip={tr.logo_follow_image_focus_t}
				/>
			) : null}
			<Caption>
				{armed
					? tr.image_points_pick_hint
					: point === 'focus'
						? t.hint_image_focus_point
						: image.faceFocusX === null
							? tr.focus_points_unmeasured
							: image.faceFocusSource === 'manual'
								? tr.focus_points_manual
								: tr.focus_points_auto}
			</Caption>
		</div>
	);
}
