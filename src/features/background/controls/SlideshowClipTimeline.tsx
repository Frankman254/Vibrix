import {
	buildTimelineClips,
	formatTimelineTimestamp,
	parseTimelineTimestamp,
	resolveTimelineScrollLeft
} from '../slideshow/slideshowTimeline';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioContext } from '@/context/useAudioContext';
import { useT } from '@/lib/i18n';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { resolveEditorImagePreviewUrl } from '@/lib/editorImagePreviews';
import { resolveSlideshowPool } from '../slideshow/slideshowPlayback';
import { Button } from '@/ui';

const MIN_CLIP_DURATION = 0.5;
const MIN_CLIP_WIDTH_PX = 220;
const MIN_TIMELINE_WIDTH_PX = 960;
const MIN_TICK_GAP_PX = 140;
const CLIP_COLORS = [
	'#ff6b6b',
	'#ffd43b',
	'#51cf66',
	'#4dabf7',
	'#cc5de8',
	'#ff922b',
	'#20c997',
	'#f06595'
];

type DragMode = 'move' | 'resize-start' | 'resize-end';

type DragState = {
	pointerId: number;
	clipIndex: number;
	mode: DragMode;
	originStart: number;
	originEnd: number;
	originTime: number;
} | null;

type TimelineTick = {
	leftPx: number;
	label: string;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function formatTime(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}
	return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function resolveTimelineWidth(
	duration: number,
	clipCount: number,
	viewportWidth: number
) {
	if (duration <= 0 || clipCount <= 0) {
		return Math.max(viewportWidth, MIN_TIMELINE_WIDTH_PX);
	}

	const durationWidth = duration * 0.6;
	const clipWidth = clipCount * MIN_CLIP_WIDTH_PX;
	return Math.max(
		viewportWidth,
		MIN_TIMELINE_WIDTH_PX,
		durationWidth,
		clipWidth
	);
}

function resolveTickStep(duration: number, timelineWidth: number) {
	if (duration <= 0 || timelineWidth <= 0) return 1;
	const targetTicks = Math.max(
		2,
		Math.floor(timelineWidth / MIN_TICK_GAP_PX)
	);
	const roughStep = duration / targetTicks;
	const candidates = [
		1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600
	];
	return candidates.find(step => step >= roughStep) ?? 3600;
}

function buildTimelineTicks(
	duration: number,
	timelineWidth: number
): TimelineTick[] {
	if (duration <= 0 || timelineWidth <= 0) return [];
	const step = resolveTickStep(duration, timelineWidth);
	const ticks: TimelineTick[] = [];
	for (let time = 0; time < duration; time += step) {
		ticks.push({
			leftPx: (time / duration) * timelineWidth,
			label: formatTime(time)
		});
	}
	ticks.push({
		leftPx: timelineWidth,
		label: formatTime(duration)
	});
	return ticks;
}

export default function SlideshowClipTimeline() {
	const {
		backgroundImages,
		activeImageId,
		slideshowManualTimestampsEnabled,
		editorImagePreviewQuality,
		setlists,
		activeSetlistId,
		setActiveImageId,
		setBackgroundImagePlaybackSwitchAt
	} = useWallpaperStore();
	const t = useT();
	const { getDuration, getCurrentTime } = useAudioContext();
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const trackRef = useRef<HTMLDivElement | null>(null);
	const rafRef = useRef(0);
	const dragStateRef = useRef<DragState>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [duration, setDuration] = useState(0);
	const [playheadTime, setPlayheadTime] = useState(0);
	const [viewportWidth, setViewportWidth] = useState(MIN_TIMELINE_WIDTH_PX);
	const visibleBackgroundImages = useMemo(
		() => resolveSlideshowPool(backgroundImages, setlists, activeSetlistId),
		[backgroundImages, setlists, activeSetlistId]
	);
	const clips = useMemo(
		() =>
			buildTimelineClips(
				visibleBackgroundImages,
				duration,
				slideshowManualTimestampsEnabled
			),
		[visibleBackgroundImages, duration, slideshowManualTimestampsEnabled]
	);
	const timelineWidth = useMemo(
		() => resolveTimelineWidth(duration, clips.length, viewportWidth),
		[clips.length, duration, viewportWidth]
	);
	const ticks = useMemo(
		() => buildTimelineTicks(duration, timelineWidth),
		[duration, timelineWidth]
	);

	useEffect(() => {
		let alive = true;
		const tick = () => {
			if (!alive) return;
			setDuration(Math.max(0, getDuration()));
			setPlayheadTime(Math.max(0, getCurrentTime()));
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => {
			alive = false;
			cancelAnimationFrame(rafRef.current);
		};
	}, [getCurrentTime, getDuration]);

	useEffect(() => {
		const element = viewportRef.current;
		if (!element) return;

		const updateWidth = () => {
			setViewportWidth(
				Math.max(element.clientWidth, MIN_TIMELINE_WIDTH_PX)
			);
		};

		updateWidth();
		const observer = new ResizeObserver(updateWidth);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const timeFromClientX = useCallback(
		(clientX: number) => {
			const rect = trackRef.current?.getBoundingClientRect();
			if (!rect || rect.width <= 0 || duration <= 0) return 0;
			const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
			return ratio * duration;
		},
		[duration]
	);

	const applyClipMutation = useCallback(
		(clipIndex: number, mode: DragMode, nextTime: number) => {
			const clip = clips[clipIndex];
			if (!clip) return;

			if (mode === 'resize-start') {
				if (clipIndex === 0) return;
				const previousClip = clips[clipIndex - 1];
				const minStart = (previousClip?.start ?? 0) + MIN_CLIP_DURATION;
				const maxStart = clip.end - MIN_CLIP_DURATION;
				setBackgroundImagePlaybackSwitchAt(
					clip.assetId,
					clamp(nextTime, minStart, maxStart)
				);
				return;
			}

			if (mode === 'resize-end') {
				const nextClip = clips[clipIndex + 1];
				if (!nextClip) return;
				const nextNextStart = clips[clipIndex + 2]?.start ?? duration;
				const minEnd = clip.start + MIN_CLIP_DURATION;
				const maxEnd = nextNextStart - MIN_CLIP_DURATION;
				setBackgroundImagePlaybackSwitchAt(
					nextClip.assetId,
					clamp(nextTime, minEnd, maxEnd)
				);
				return;
			}

			const dragState = dragStateRef.current;
			if (!dragState) return;
			const delta = nextTime - dragState.originTime;
			const clipDuration = dragState.originEnd - dragState.originStart;

			if (clipIndex === 0) {
				const nextClip = clips[clipIndex + 1];
				if (!nextClip) return;
				const nextNextStart = clips[clipIndex + 2]?.start ?? duration;
				const nextEnd = clamp(
					dragState.originEnd + delta,
					MIN_CLIP_DURATION,
					nextNextStart - MIN_CLIP_DURATION
				);
				setBackgroundImagePlaybackSwitchAt(nextClip.assetId, nextEnd);
				return;
			}

			if (clipIndex === clips.length - 1) {
				const previousStart = clips[clipIndex - 1]?.start ?? 0;
				const nextStart = clamp(
					dragState.originStart + delta,
					previousStart + MIN_CLIP_DURATION,
					duration - MIN_CLIP_DURATION
				);
				setBackgroundImagePlaybackSwitchAt(clip.assetId, nextStart);
				return;
			}

			const nextClip = clips[clipIndex + 1];
			if (!nextClip) return;
			const previousStart = clips[clipIndex - 1]?.start ?? 0;
			const nextNextStart = clips[clipIndex + 2]?.start ?? duration;
			const nextStart = clamp(
				dragState.originStart + delta,
				previousStart + MIN_CLIP_DURATION,
				nextNextStart - MIN_CLIP_DURATION - clipDuration
			);
			setBackgroundImagePlaybackSwitchAt(clip.assetId, nextStart);
			setBackgroundImagePlaybackSwitchAt(
				nextClip.assetId,
				nextStart + clipDuration
			);
		},
		[clips, duration, setBackgroundImagePlaybackSwitchAt]
	);

	const handlePointerDown = useCallback(
		(
			event: React.PointerEvent<HTMLDivElement>,
			clipIndex: number,
			mode: DragMode
		) => {
			const clip = clips[clipIndex];
			if (!clip) return;
			setSelectedId(clip.assetId);
			if (!slideshowManualTimestampsEnabled) return;
			event.stopPropagation();
			event.currentTarget.setPointerCapture(event.pointerId);
			dragStateRef.current = {
				pointerId: event.pointerId,
				clipIndex,
				mode,
				originStart: clip.start,
				originEnd: clip.end,
				originTime: timeFromClientX(event.clientX)
			};
			setActiveImageId(clip.assetId);
		},
		[
			clips,
			setActiveImageId,
			timeFromClientX,
			slideshowManualTimestampsEnabled
		]
	);

	const clearDragState = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (dragStateRef.current?.pointerId !== event.pointerId) return;
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			dragStateRef.current = null;
		},
		[]
	);

	const handleTrackPointerMove = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const dragState = dragStateRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) return;
			applyClipMutation(
				dragState.clipIndex,
				dragState.mode,
				timeFromClientX(event.clientX)
			);
		},
		[applyClipMutation, timeFromClientX]
	);

	const showTime = useCallback(
		(time: number, selectContainingClip: boolean) => {
			const viewport = viewportRef.current;
			if (!viewport) return;
			viewport.scrollTo({
				left: resolveTimelineScrollLeft(
					time,
					duration,
					timelineWidth,
					viewport.clientWidth
				),
				behavior: 'smooth'
			});
			if (selectContainingClip) {
				const clip =
					clips.find(item => time >= item.start && time < item.end) ??
					clips.at(-1);
				if (clip) setSelectedId(clip.assetId);
			}
		},
		[clips, duration, timelineWidth]
	);

	if (duration <= 0 || clips.length === 0) {
		return (
			<div
				className="rounded border px-2.5 py-2 text-[11px]"
				style={{
					borderColor: 'var(--editor-accent-border)',
					background: 'var(--editor-surface-bg)',
					color: 'var(--editor-accent-muted)'
				}}
			>
				{t.slideshow_load_audio}
			</div>
		);
	}

	const selectedClip =
		clips.find(clip => clip.assetId === (selectedId ?? activeImageId)) ??
		clips[0];
	const playheadLeftPx = clamp(playheadTime / duration, 0, 1) * timelineWidth;

	return (
		<div className="flex flex-col gap-2">
			{slideshowManualTimestampsEnabled && selectedClip && (
				<div className="flex flex-wrap items-center gap-2 text-[11px]">
					<select
						aria-label={t.slideshow_image_label}
						value={selectedClip.assetId}
						onChange={event => {
							const nextId = event.target.value;
							setSelectedId(nextId);
							const clip = clips.find(
								item => item.assetId === nextId
							);
							if (clip)
								showTime((clip.start + clip.end) / 2, false);
						}}
						className="rounded border bg-[var(--editor-surface-bg)] p-1"
					>
						{clips.map(clip => (
							<option key={clip.assetId} value={clip.assetId}>
								IMG {clip.poolIndex + 1}
							</option>
						))}
					</select>
					{(['resize-start', 'resize-end'] as const).map(mode => {
						const value =
							mode === 'resize-start'
								? selectedClip.start
								: selectedClip.end;
						const disabled =
							mode === 'resize-start'
								? selectedClip.index === 0
								: selectedClip.index === clips.length - 1;
						return (
							<label
								key={mode}
								className="flex items-center gap-1"
							>
								{mode === 'resize-start'
									? t.slideshow_start_seconds
									: t.slideshow_end_seconds}
								<input
									key={`${selectedClip.assetId}-${value}`}
									type="text"
									inputMode="decimal"
									defaultValue={formatTimelineTimestamp(
										value
									)}
									disabled={disabled}
									className="w-24 rounded border bg-[var(--editor-surface-bg)] p-1"
									onKeyDown={event => {
										if (event.key === 'Enter')
											event.currentTarget.blur();
									}}
									onBlur={event => {
										const next = parseTimelineTimestamp(
											event.currentTarget.value
										);
										if (
											next != null &&
											next <= duration &&
											next !== Number(value.toFixed(3))
										)
											applyClipMutation(
												selectedClip.index,
												mode,
												next
											);
										event.currentTarget.value =
											formatTimelineTimestamp(value);
									}}
								/>
							</label>
						);
					})}
				</div>
			)}

			<div
				className="flex flex-wrap items-center justify-between gap-2 text-[10px] tabular-nums"
				style={{ color: 'var(--editor-accent-muted)' }}
			>
				<span>0:00</span>
				<Button
					onClick={() => showTime(playheadTime, true)}
					size="sm"
					density="compact"
					variant="secondary"
					title={t.slideshow_jump_to_playhead_hint}
				>
					{t.slideshow_jump_to_playhead.replace(
						'{time}',
						formatTime(playheadTime)
					)}
				</Button>
				<span>{formatTime(duration)}</span>
			</div>
			<div
				ref={viewportRef}
				className="timeline-scroll overflow-x-auto overflow-y-hidden rounded border pb-2"
				style={{
					borderColor: 'var(--editor-accent-border)',
					scrollbarGutter: 'stable both-edges',
					background:
						'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))'
				}}
			>
				<div
					ref={trackRef}
					className="relative h-32 select-none"
					style={{ width: timelineWidth, minWidth: '100%' }}
					onPointerMove={handleTrackPointerMove}
					onPointerUp={clearDragState}
					onPointerCancel={clearDragState}
					onLostPointerCapture={clearDragState}
				>
					<div
						className="pointer-events-none absolute inset-y-0 w-px"
						style={{
							left: playheadLeftPx,
							background: 'rgba(255,255,255,0.9)',
							boxShadow: '0 0 6px rgba(255,255,255,0.5)',
							zIndex: 30
						}}
					/>
					<div className="pointer-events-none absolute inset-x-0 top-0 h-7">
						{ticks.map((tick, index) => (
							<div
								key={`${tick.leftPx}-${index}`}
								className="absolute inset-y-0 border-l"
								style={{
									left: tick.leftPx,
									borderColor: 'rgba(255,255,255,0.08)'
								}}
							>
								<span
									className="absolute left-1 top-1 text-[9px] tabular-nums"
									style={{
										color: 'var(--editor-accent-muted)'
									}}
								>
									{tick.label}
								</span>
							</div>
						))}
					</div>
					<div className="absolute inset-x-0 bottom-0 top-8 px-2 py-2">
						{clips.map(clip => {
							const leftPx =
								(clip.start / duration) * timelineWidth;
							const rightPx =
								(clip.end / duration) * timelineWidth;
							const widthPx = Math.max(rightPx - leftPx, 1);
							const color =
								CLIP_COLORS[clip.index % CLIP_COLORS.length]!;
							const isActive = activeImageId === clip.assetId;
							const previewUrl = resolveEditorImagePreviewUrl(
								{
									url: clip.imageUrl,
									thumbnailUrl: clip.thumbnailUrl
								},
								editorImagePreviewQuality,
								isActive
							);
							return (
								<div
									key={clip.assetId}
									className="absolute top-0 h-[76px] overflow-hidden rounded border"
									style={{
										left: leftPx,
										width: widthPx,
										borderColor: isActive
											? '#fff'
											: 'rgba(255,255,255,0.16)',
										background: previewUrl
											? `linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.48)), url("${previewUrl}") center / cover`
											: color,
										boxShadow: isActive
											? `0 0 0 1px ${color}, 0 0 18px ${color}66`
											: undefined,
										opacity: clip.enabled ? 1 : 0.42
									}}
									onPointerDown={event =>
										handlePointerDown(
											event,
											clip.index,
											'move'
										)
									}
									onClick={() =>
										setActiveImageId(clip.assetId)
									}
									title={`Image ${clip.poolIndex + 1} · ${formatTime(clip.start)} - ${formatTime(clip.end)}`}
								>
									{slideshowManualTimestampsEnabled &&
									clip.index > 0 ? (
										<div
											className="absolute inset-y-0 left-0 z-20 w-3 cursor-ew-resize"
											onPointerDown={event =>
												handlePointerDown(
													event,
													clip.index,
													'resize-start'
												)
											}
										/>
									) : null}
									{slideshowManualTimestampsEnabled &&
									clip.index < clips.length - 1 ? (
										<div
											className="absolute inset-y-0 right-0 z-20 w-3 cursor-ew-resize"
											onPointerDown={event =>
												handlePointerDown(
													event,
													clip.index,
													'resize-end'
												)
											}
										/>
									) : null}
									<div className="pointer-events-none flex h-full flex-col justify-between bg-black/25 px-3 py-2">
										<div className="flex items-center justify-between gap-2">
											<span className="truncate text-[12px] font-semibold text-white">
												IMG {clip.poolIndex + 1}
											</span>
											<span className="text-[10px] text-white/85">
												{clip.isManual
													? 'manual'
													: 'auto'}
											</span>
										</div>
										<div className="text-[10px] tabular-nums text-white/90">
											{formatTime(clip.start)} -{' '}
											{formatTime(clip.end)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
			<div
				className="rounded border px-2.5 py-2 text-[11px] leading-snug"
				style={{
					borderColor: 'var(--editor-accent-border)',
					background: 'var(--editor-surface-bg)',
					color: 'var(--editor-accent-muted)'
				}}
			>
				{t.slideshow_timeline_hint}
			</div>
		</div>
	);
}
