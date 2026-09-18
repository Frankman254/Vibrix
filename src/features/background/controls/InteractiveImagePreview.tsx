import {
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent
} from 'react';
import { resolveImageTransform } from '@/features/background/domain/resolveImageTransform';
import { useT } from '@/lib/i18n';
import type BgFitModeSelector from './BgFitModeSelector';

function getScreenAspect(): number {
	if (typeof window === 'undefined') return 16 / 9;
	return Math.max(0.1, window.innerWidth / Math.max(1, window.innerHeight));
}

/**
 * Editor preview for the active background image. The frame matches the
 * SCREEN aspect ratio so "what you see is what the wallpaper renders" —
 * coverage in the preview == coverage on the live wallpaper. All transform
 * math goes through `resolveImageTransform` so it agrees with the renderer
 * and the position sliders.
 *
 * The focus point is driven exclusively by the Focus X/Y sliders below the
 * preview; the preview itself is pan-only (drag pans positionX/Y). The
 * yellow dot is a read-only visualizer of where the bass-zoom anchor lands
 * on screen.
 */
export default function InteractiveImagePreview({
	imageUrl,
	fitMode,
	keepCovered,
	scale,
	positionX,
	positionY,
	focusX,
	focusY,
	rotation,
	mirror,
	mirrorFill,
	mirrorFillInvert,
	mirrorFillCount,
	layoutResponsiveEnabled,
	layoutBackgroundReframeEnabled,
	layoutReferenceWidth,
	layoutReferenceHeight,
	pickFocusActive,
	onChangePositionX,
	onChangePositionY,
	onPickFocus
}: {
	imageUrl: string;
	fitMode: Parameters<typeof BgFitModeSelector>[0]['value'];
	/** False in manual framing mode: the preview drops the coverage clamp too. */
	keepCovered: boolean;
	scale: number;
	positionX: number;
	positionY: number;
	focusX: number | null;
	focusY: number | null;
	rotation: number;
	mirror: boolean;
	mirrorFill: boolean;
	mirrorFillInvert: boolean;
	mirrorFillCount: number;
	layoutResponsiveEnabled: boolean;
	layoutBackgroundReframeEnabled: boolean;
	layoutReferenceWidth: number;
	layoutReferenceHeight: number;
	pickFocusActive: boolean;
	onChangePositionX: (value: number) => void;
	onChangePositionY: (value: number) => void;
	onPickFocus: (x: number, y: number) => void;
}) {
	const t = useT();
	const frameRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef({
		pointerId: -1,
		startClientX: 0,
		startClientY: 0,
		startPositionX: 0,
		startPositionY: 0
	});
	const [viewportSize, setViewportSize] = useState({ width: 1, height: 224 });
	const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
	const [screenAspect, setScreenAspect] = useState(getScreenAspect);

	useEffect(() => {
		const element = frameRef.current;
		if (!element || typeof ResizeObserver === 'undefined') return undefined;
		const observer = new ResizeObserver(entries => {
			const entry = entries[0];
			if (!entry) return;
			setViewportSize({
				width: Math.max(1, entry.contentRect.width),
				height: Math.max(1, entry.contentRect.height)
			});
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return undefined;
		const handle = () => setScreenAspect(getScreenAspect());
		window.addEventListener('resize', handle);
		return () => window.removeEventListener('resize', handle);
	}, []);

	const transform = resolveImageTransform({
		viewportWidth: viewportSize.width,
		viewportHeight: viewportSize.height,
		imageWidth: imageSize.width,
		imageHeight: imageSize.height,
		scale,
		rotation,
		positionX,
		positionY,
		fitMode,
		mirror,
		keepCovered,
		focusX,
		focusY,
		mirrorFill,
		mirrorFillInvert,
		mirrorFillCount,
		layout: {
			layoutResponsiveEnabled,
			layoutBackgroundReframeEnabled,
			layoutReferenceWidth,
			layoutReferenceHeight
		}
	});
	const hasFocus = focusX != null && focusY != null;
	const focusMarkerX =
		viewportSize.width / 2 +
		transform.effectivePositionX * viewportSize.width * 0.5;
	const focusMarkerY =
		viewportSize.height / 2 -
		transform.effectivePositionY * viewportSize.height * 0.5;

	function clamp01(value: number) {
		return Math.min(1, Math.max(0, value));
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (pickFocusActive) {
			const rect = event.currentTarget.getBoundingClientRect();
			const pointX =
				((event.clientX - rect.left) / Math.max(1, rect.width)) *
				viewportSize.width;
			const pointY =
				((event.clientY - rect.top) / Math.max(1, rect.height)) *
				viewportSize.height;
			const dx = pointX - transform.centerX;
			const dy = pointY - transform.centerY;
			const radians = (transform.effectiveRotation * Math.PI) / 180;
			const cos = Math.cos(radians);
			const sin = Math.sin(radians);
			const localX = dx * cos + dy * sin;
			const localY = -dx * sin + dy * cos;
			const nextFocusX = clamp01(
				(localX - transform.compositionMinX) /
					Math.max(1, transform.compositionWidth)
			);
			const nextFocusY = clamp01(
				(localY - transform.compositionMinY) /
					Math.max(1, transform.compositionHeight)
			);
			onPickFocus(nextFocusX, nextFocusY);
			return;
		}

		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startPositionX: transform.effectivePositionX,
			startPositionY: transform.effectivePositionY
		};
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (dragRef.current.pointerId !== event.pointerId) return;
		const deltaX = event.clientX - dragRef.current.startClientX;
		const deltaY = event.clientY - dragRef.current.startClientY;
		// Raw new position; the store handler re-clamps to the legal
		// coverage window, so the image stops at the edge when coverage
		// is on.
		onChangePositionX(
			dragRef.current.startPositionX + deltaX / (viewportSize.width * 0.5)
		);
		onChangePositionY(
			dragRef.current.startPositionY -
				deltaY / (viewportSize.height * 0.5)
		);
	}

	function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
		if (dragRef.current.pointerId !== event.pointerId) return;
		event.currentTarget.releasePointerCapture(event.pointerId);
		dragRef.current.pointerId = -1;
	}

	return (
		<div
			ref={frameRef}
			className="relative w-full overflow-hidden rounded border"
			style={{
				aspectRatio: String(screenAspect),
				maxHeight: '60vh',
				borderColor: 'var(--editor-accent-border)',
				background:
					'radial-gradient(circle at center, rgba(255,255,255,0.05), rgba(255,255,255,0.015) 45%, rgba(0,0,0,0.16) 100%)',
				cursor: pickFocusActive ? 'crosshair' : 'grab'
			}}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerEnd}
			onPointerCancel={handlePointerEnd}
		>
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						'linear-gradient(to right, transparent calc(50% - 0.5px), rgba(255,255,255,0.14) 50%, transparent calc(50% + 0.5px)), linear-gradient(to bottom, transparent calc(50% - 0.5px), rgba(255,255,255,0.14) 50%, transparent calc(50% + 0.5px))'
				}}
			/>
			{transform.drawRects.map((rect, index) => (
				<img
					key={`${rect.kind}-${index}`}
					src={imageUrl}
					alt=""
					draggable={false}
					onLoad={
						index === 0
							? event =>
									setImageSize({
										width:
											event.currentTarget.naturalWidth ||
											1,
										height:
											event.currentTarget.naturalHeight ||
											1
									})
							: undefined
					}
					className="pointer-events-none absolute max-w-none select-none"
					style={{
						left: rect.cx - rect.width / 2,
						top: rect.cy - rect.height / 2,
						width: rect.width,
						height: rect.height,
						transform: `rotate(${rect.rotation}deg)${rect.mirror ? ' scaleX(-1)' : ''}${rect.mirrorY ? ' scaleY(-1)' : ''}`,
						transformOrigin: 'center center'
					}}
				/>
			))}
			<div
				aria-hidden
				title={t.bg_preview_focus_anchor}
				className="pointer-events-none absolute h-5 w-5 rounded-full border"
				style={{
					left: focusMarkerX - 10,
					top: focusMarkerY - 10,
					borderColor: hasFocus
						? 'var(--editor-active-fg)'
						: 'var(--editor-accent-soft)',
					borderWidth: 2,
					background: 'rgba(0,0,0,0.28)',
					boxShadow: hasFocus
						? '0 0 0 1px rgba(0,0,0,0.55), 0 0 12px rgba(255,188,66,0.45)'
						: '0 0 0 1px rgba(0,0,0,0.45), 0 0 8px rgba(255,255,255,0.15)'
				}}
			>
				<span
					className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
					style={{
						background: hasFocus
							? 'var(--editor-active-fg)'
							: 'var(--editor-accent-soft)'
					}}
				/>
			</div>
			<div
				className="pointer-events-none absolute bottom-2 left-2 rounded border px-2 py-1 text-[10px] leading-tight"
				style={{
					borderColor: 'var(--editor-accent-border)',
					background: 'rgba(0,0,0,0.42)',
					color: 'var(--editor-accent-soft)'
				}}
			>
				{pickFocusActive
					? 'Click to set focus point'
					: 'Drag to pan — kept covered · Dot = bass-zoom anchor'}
			</div>
		</div>
	);
}
