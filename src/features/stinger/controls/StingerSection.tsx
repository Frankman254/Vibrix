/**
 * The generated intro and ending.
 *
 * One card per window with the same four decisions: how long it lasts, how the
 * montage is arranged, how many of the setlist's images it uses and from which
 * end of the setlist it takes them. Everything else is derived — the system
 * builds the montage from the selected setlist, in the setlist's own order.
 *
 * It lives in the Export tab because it is a decision about the video: the
 * windows cover the head and the tail of the timeline without adding a second
 * to it, so the audio never drifts.
 */
import { useShallow } from 'zustand/react/shallow';
import { Caption, SectionCard, SegmentedControl } from '@/ui';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import ToggleControl from '@/editor/ToggleControl';
import { MotionSlider as Slider } from '@/editor/MotionSharedControls';
import { formatDecimal } from '@/editor/motionTabUtils';
import { resolveSlideshowPool } from '@/features/background';
import {
	STINGER_DURATION_RANGE,
	STINGER_IMAGE_COUNT_RANGE,
	createDefaultStinger,
	pickStingerImages
} from '@/features/stinger/stingerPlan';
import type {
	StingerKind,
	StingerOrder,
	StingerStyle
} from '@/types/wallpaper';

function StingerWindowCard({ kind }: { kind: StingerKind }) {
	const t = useT();
	const settings = useWallpaperStore(s =>
		kind === 'intro' ? s.introStinger : s.outroStinger
	);
	const setStinger = useWallpaperStore(s => s.setStinger);
	const poolSize = useWallpaperStore(
		useShallow(
			s =>
				resolveSlideshowPool(
					s.backgroundImages,
					s.setlists,
					s.activeSetlistId
				).length
		)
	);
	const factory = createDefaultStinger(kind);
	// What the montage will actually show: asking for more images than the
	// setlist holds is not an error, it just uses what there is.
	const used = pickStingerImages(
		Array.from({ length: poolSize }, (_, i) => ({ assetId: String(i) })),
		settings
	).length;

	return (
		<SectionCard
			title={
				kind === 'intro' ? t.stinger_intro_title : t.stinger_outro_title
			}
			subtitle={
				kind === 'intro' ? t.stinger_intro_hint : t.stinger_outro_hint
			}
			density="compact"
		>
			<div className="flex flex-col gap-2">
				<ToggleControl
					label={t.stinger_enabled}
					value={settings.enabled}
					onChange={enabled => setStinger(kind, { enabled })}
					tooltip={t.stinger_enabled_tooltip}
				/>
				{settings.enabled ? (
					<>
						<Slider
							label={t.stinger_duration}
							value={settings.durationSec}
							min={STINGER_DURATION_RANGE.min}
							max={STINGER_DURATION_RANGE.max}
							step={0.5}
							onChange={durationSec =>
								setStinger(kind, { durationSec })
							}
							defaultValue={factory.durationSec}
							variant="macro"
							formatValue={formatDecimal}
						/>
						<SegmentedControl<StingerStyle>
							value={settings.style}
							onChange={style => setStinger(kind, { style })}
							options={[
								{
									value: 'fade-stack',
									label: t.stinger_style_fade
								},
								{
									value: 'slide-strip',
									label: t.stinger_style_strip
								},
								{
									value: 'grid-reveal',
									label: t.stinger_style_grid
								}
							]}
						/>
						<Slider
							label={t.stinger_image_count}
							value={settings.imageCount}
							min={STINGER_IMAGE_COUNT_RANGE.min}
							max={STINGER_IMAGE_COUNT_RANGE.max}
							step={1}
							onChange={imageCount =>
								setStinger(kind, { imageCount })
							}
							defaultValue={factory.imageCount}
							variant="compact"
						/>
						<SegmentedControl<StingerOrder>
							value={settings.order}
							onChange={order => setStinger(kind, { order })}
							options={[
								{
									value: 'setlist',
									label: t.stinger_order_first
								},
								{
									value: 'setlist-reverse',
									label: t.stinger_order_last
								}
							]}
						/>
						<Caption>
							{poolSize === 0
								? t.stinger_no_images
								: t.stinger_uses_images
										.replace('{used}', String(used))
										.replace('{pool}', String(poolSize))}
						</Caption>
					</>
				) : null}
			</div>
		</SectionCard>
	);
}

export default function StingerSection() {
	return (
		<div className="flex flex-col gap-2">
			<StingerWindowCard kind="intro" />
			<StingerWindowCard kind="outro" />
		</div>
	);
}
