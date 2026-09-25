import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioContext } from '@/context/useAudioContext';
import { useT } from '@/lib/i18n';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { Button } from '@/ui';

const NOTICE_MS = 4000;

function formatTime(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(total / 60);
	const secs = total % 60;
	return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * The "mark here" gesture: the current playback time becomes the start of the
 * NEXT image. Lives outside the manual-timestamps block on purpose — it is how
 * the user discovers the mode, and pressing it turns the mode on.
 */
export default function SlideshowMarkControl() {
	const t = useT();
	const markNextImageSwitchAt = useWallpaperStore(
		state => state.markNextImageSwitchAt
	);
	const anchor = useWallpaperStore(state => state.slideshowTransitionAnchor);
	const { getCurrentTime } = useAudioContext();
	const timerRef = useRef(0);
	const [notice, setNotice] = useState<string | null>(null);

	const markHere = useCallback(() => {
		const result = markNextImageSwitchAt(Math.max(0, getCurrentTime()));
		const message = !result.marked
			? t.slideshow_mark_last_image
			: t.slideshow_marked_toast
					.replace('{index}', String(result.poolPosition))
					.replace('{time}', formatTime(result.markedAt))
					.replace(
						'{anchor}',
						anchor === 'end'
							? t.slideshow_marked_anchor_end
							: anchor === 'center'
								? t.slideshow_marked_anchor_center
								: ''
					);
		setNotice(
			result.enabledManualMode
				? `${message} · ${t.slideshow_mark_enabled_manual}`
				: message
		);
		window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
	}, [
		anchor,
		getCurrentTime,
		markNextImageSwitchAt,
		t.slideshow_mark_enabled_manual,
		t.slideshow_mark_last_image,
		t.slideshow_marked_anchor_center,
		t.slideshow_marked_anchor_end,
		t.slideshow_marked_toast
	]);

	// Marking by hand with the mouse while the song plays is exactly the part
	// that feels wrong, so `M` does it — unless the user is typing somewhere.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'm' && event.key !== 'M') return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName;
			if (
				tag === 'INPUT' ||
				tag === 'TEXTAREA' ||
				tag === 'SELECT' ||
				target?.isContentEditable
			) {
				return;
			}
			event.preventDefault();
			markHere();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [markHere]);

	useEffect(() => () => window.clearTimeout(timerRef.current), []);

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<Button
					onClick={markHere}
					size="sm"
					density="compact"
					variant="primary"
					title={t.hint_slideshow_mark_here}
				>
					{t.label_slideshow_mark_here} · M
				</Button>
				<span
					className="flex-1 text-[10px] leading-snug"
					style={{ color: 'var(--editor-accent-muted)' }}
				>
					{t.hint_slideshow_mark_here}
				</span>
			</div>
			{notice ? (
				<div
					className="rounded border px-2.5 py-1.5 text-[11px]"
					style={{
						borderColor: 'rgba(120, 220, 160, 0.45)',
						background: 'rgba(120, 220, 160, 0.10)',
						color: 'var(--editor-accent-fg)'
					}}
				>
					{notice}
				</div>
			) : null}
		</div>
	);
}
