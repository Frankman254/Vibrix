import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioData } from '@/hooks/useAudioData';
import { useT } from '@/lib/i18n';
import { saveImage, loadImage } from '@/lib/db/imageDb';
import { generatePoolThumbnail } from '@/lib/thumbnailUtils';
import { startDemoProject } from '@/features/demoProject/startDemoProject';

/**
 * First-run guidance shown over an empty wallpaper (no background image yet).
 * Inline overlay — NOT a modal — so the canvas stays visible behind it. The
 * three CTAs are the golden-path entry: load an image, load audio, or one-click
 * the demo project (three painted backgrounds, a synthesised remix with an
 * intro and an ending, the generated montage over both, and the switches that
 * make them move — see `features/demoProject`). Disappears the
 * moment any background image exists; can also be dismissed for the session (no
 * persisted flag, so no store migration needed).
 */
export default function FirstRunEmptyState() {
	const t = useT();
	const { addTrackToPlaylist } = useAudioData();
	const imageInputRef = useRef<HTMLInputElement>(null);
	const audioInputRef = useRef<HTMLInputElement>(null);
	const [dismissed, setDismissed] = useState(false);
	const [busy, setBusy] = useState(false);

	const { hasImages, addImageEntry, setActiveImageId, setImageThumbnailUrl } =
		useWallpaperStore(
			useShallow(s => ({
				hasImages: s.backgroundImages.length > 0,
				addImageEntry: s.addImageEntry,
				setActiveImageId: s.setActiveImageId,
				setImageThumbnailUrl: s.setImageThumbnailUrl
			}))
		);

	if (hasImages || dismissed) return null;

	async function ingestImageFile(file: File, fileName: string) {
		const id = await saveImage(file);
		const url = await loadImage(id);
		if (!url) return;
		addImageEntry(id, url, null, fileName);
		setActiveImageId(id);
		void generatePoolThumbnail(url).then(thumb => {
			if (thumb && thumb !== url) setImageThumbnailUrl(id, thumb);
		});
	}

	async function handleImageFile(file: File | undefined) {
		if (!file) return;
		setBusy(true);
		try {
			await ingestImageFile(file, file.name);
		} finally {
			setBusy(false);
		}
	}

	async function handleAudioFile(file: File | undefined) {
		if (!file) return;
		setBusy(true);
		try {
			await addTrackToPlaylist(file);
		} finally {
			setBusy(false);
		}
	}

	async function startDemo() {
		setBusy(true);
		try {
			await startDemoProject({ addAudioTrack: addTrackToPlaylist });
		} finally {
			setBusy(false);
		}
	}

	const primaryBtn =
		'rounded-md border px-3 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50';
	const secondaryBtn =
		'rounded-md border px-3 py-2 text-[12px] transition-colors hover:bg-white/5 disabled:opacity-50';

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 80,
				pointerEvents: 'none'
			}}
		>
			<div
				className="rounded-xl border p-5 shadow-2xl"
				style={{
					pointerEvents: 'auto',
					maxWidth: 420,
					margin: '0 16px',
					background: 'rgba(12,10,20,0.82)',
					backdropFilter: 'blur(8px)',
					borderColor:
						'var(--editor-accent-border, rgba(120,120,160,0.4))'
				}}
			>
				<h2
					className="text-[15px] font-semibold"
					style={{ color: 'var(--editor-accent-fg, #fff)' }}
				>
					{t.firstrun_title}
				</h2>
				<p
					className="mt-1 text-[12px] leading-relaxed"
					style={{
						color: 'var(--editor-accent-muted, rgba(255,255,255,0.7))'
					}}
				>
					{t.firstrun_body}
				</p>

				<div className="mt-4 flex flex-col gap-2">
					<button
						type="button"
						onClick={startDemo}
						disabled={busy}
						className={primaryBtn}
						style={{
							borderColor: 'var(--editor-active-fg, #2ff7e5)',
							color: 'var(--editor-active-fg, #2ff7e5)'
						}}
					>
						{busy ? t.firstrun_working : t.firstrun_try_demo}
					</button>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => imageInputRef.current?.click()}
							disabled={busy}
							className={`${secondaryBtn} flex-1`}
							style={{
								borderColor:
									'var(--editor-accent-border, rgba(120,120,160,0.4))',
								color: 'var(--editor-accent-fg, #fff)'
							}}
						>
							{t.firstrun_load_image}
						</button>
						<button
							type="button"
							onClick={() => audioInputRef.current?.click()}
							disabled={busy}
							className={`${secondaryBtn} flex-1`}
							style={{
								borderColor:
									'var(--editor-accent-border, rgba(120,120,160,0.4))',
								color: 'var(--editor-accent-fg, #fff)'
							}}
						>
							{t.firstrun_load_audio}
						</button>
					</div>
					<button
						type="button"
						onClick={() => setDismissed(true)}
						className="mt-1 text-[11px] underline-offset-2 hover:underline"
						style={{
							color: 'var(--editor-accent-muted, rgba(255,255,255,0.55))'
						}}
					>
						{t.firstrun_dismiss}
					</button>
				</div>

				<input
					ref={imageInputRef}
					type="file"
					accept="image/*"
					hidden
					onChange={e => {
						void handleImageFile(e.target.files?.[0]);
						e.target.value = '';
					}}
				/>
				<input
					ref={audioInputRef}
					type="file"
					accept="audio/*"
					hidden
					onChange={e => {
						void handleAudioFile(e.target.files?.[0]);
						e.target.value = '';
					}}
				/>
			</div>
		</div>
	);
}
