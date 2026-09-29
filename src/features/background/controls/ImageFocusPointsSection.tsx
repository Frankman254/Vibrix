/**
 * The two per-image focus ANNOTATIONS: where the face is, and where a mark can
 * sit.
 *
 * Deliberately separate from the framing focus above it: that one is how this
 * image is composed on screen, these two describe what is IN the image so other
 * features can use it — the intro's panels crop around the face, and the logo
 * (with the spectrum, when it follows the logo) starts somewhere the picture can
 * spare. The estimate is a heuristic, so every number here is editable and a
 * hand-placed point is never overwritten by a re-scan.
 *
 * Reads the store directly instead of taking a dozen props: the panel above it
 * already threads twenty, and none of them are about this.
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button, Caption, UI_COLORS } from '@/ui';
import { useT } from '@/lib/i18n';
import { useWallpaperStore } from '@/store/wallpaperStore';
import BgPreciseSliderControl from './BgPreciseSliderControl';

export default function ImageFocusPointsSection() {
	const t = useT();
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
			applyImageLogoFocus: s.applyImageLogoFocus
		}))
	);
	const image = store.backgroundImages.find(
		item => item.assetId === store.activeImageId
	);
	if (!image?.url) return null;

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

	return (
		<div
			className="flex flex-col gap-2 rounded-(--editor-radius-md) border px-2 py-2"
			style={{
				borderColor: UI_COLORS.border,
				background: 'rgba(0,0,0,0.12)'
			}}
		>
			<span
				className="text-[11px] font-semibold uppercase tracking-widest"
				style={{ color: 'var(--editor-accent-soft)' }}
			>
				{t.focus_points_title}
			</span>
			<Caption>{t.focus_points_hint}</Caption>
			<div className="grid grid-cols-2 gap-2">
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
					title={t.focus_points_scan_t}
					full
				>
					{t.focus_points_scan}
				</Button>
				<Button
					onClick={() => void run(() => store.analyzeAll())}
					size="sm"
					density="compact"
					variant="secondary"
					disabled={busy}
					title={t.focus_points_scan_all_t}
					full
				>
					{t.focus_points_scan_all}
				</Button>
			</div>
			<div className="grid gap-2 sm:grid-cols-2">
				<BgPreciseSliderControl
					label={t.focus_points_face_x}
					value={image.faceFocusX ?? 0.5}
					range={{ min: 0, max: 1, step: 0.01 }}
					onChange={value =>
						store.setFaceFocus(
							image.assetId,
							value,
							image.faceFocusY ?? 0.5
						)
					}
					resetValue={0.5}
				/>
				<BgPreciseSliderControl
					label={t.focus_points_face_y}
					value={image.faceFocusY ?? 0.5}
					range={{ min: 0, max: 1, step: 0.01 }}
					onChange={value =>
						store.setFaceFocus(
							image.assetId,
							image.faceFocusX ?? 0.5,
							value
						)
					}
					resetValue={0.5}
				/>
				<BgPreciseSliderControl
					label={t.focus_points_logo_x}
					value={image.logoFocusX ?? 0.5}
					range={{ min: 0, max: 1, step: 0.01 }}
					onChange={value =>
						void run(async () =>
							store.setLogoFocus(
								image.assetId,
								value,
								image.logoFocusY ?? 0.5
							)
						)
					}
					resetValue={0.5}
				/>
				<BgPreciseSliderControl
					label={t.focus_points_logo_y}
					value={image.logoFocusY ?? 0.5}
					range={{ min: 0, max: 1, step: 0.01 }}
					onChange={value =>
						void run(async () =>
							store.setLogoFocus(
								image.assetId,
								image.logoFocusX ?? 0.5,
								value
							)
						)
					}
					resetValue={0.5}
				/>
			</div>
			<div className="flex items-center justify-between gap-2">
				<Caption>
					{image.faceFocusX === null
						? t.focus_points_unmeasured
						: image.faceFocusSource === 'manual'
							? t.focus_points_manual
							: t.focus_points_auto}
				</Caption>
				<Button
					onClick={() => store.clearFocus(image.assetId)}
					size="sm"
					density="compact"
					variant="secondary"
					disabled={busy}
				>
					{t.focus_points_clear}
				</Button>
			</div>
		</div>
	);
}
