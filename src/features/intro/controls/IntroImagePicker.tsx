/**
 * Picking BY HAND which images an intro / ending window shows.
 *
 * The automatic mode takes the head (or the tail) of the setlist, which is what
 * a set is for — but «deberíamos poder seleccionar las imágenes que queramos […]
 * y que no las saque automáticamente», so this grid picks them explicitly.
 *
 * Clicking appends, clicking again removes, and the badge shows the POSITION in
 * the montage: the order of this list is the order the window draws them, which
 * is what maps an image onto the opening, the middle or the closing third of the
 * window. The grid lists the whole collection, not the active setlist, so a
 * hand-picked image is not lost when the setlist filter changes.
 */
import { Caption, Button, UI_COLORS } from '@/ui';
import { useT } from '@/lib/i18n';
import { resolveEditorImagePreviewUrl } from '@/lib/editorImagePreviews';
import type {
	BackgroundImageItem,
	EditorImagePreviewQuality
} from '@/types/wallpaper';
import { INTRO_IMAGE_COUNT_RANGE } from '../introPlan';

export default function IntroImagePicker({
	images,
	previewQuality,
	selected,
	onChange
}: {
	images: readonly BackgroundImageItem[];
	previewQuality: EditorImagePreviewQuality;
	selected: readonly string[];
	onChange: (next: string[]) => void;
}) {
	const t = useT();
	const order = new Map(selected.map((assetId, index) => [assetId, index]));
	const full = selected.length >= INTRO_IMAGE_COUNT_RANGE.max;

	const toggle = (assetId: string) => {
		if (order.has(assetId)) {
			onChange(selected.filter(id => id !== assetId));
			return;
		}
		if (full) return;
		onChange([...selected, assetId]);
	};

	if (images.length === 0) {
		return <Caption>{t.intro_no_images}</Caption>;
	}

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between gap-2">
				<Caption>
					{t.intro_picked_count
						.replace('{used}', String(selected.length))
						.replace('{pool}', String(images.length))}
				</Caption>
				{selected.length > 0 ? (
					<Button
						size="sm"
						variant="ghost"
						onClick={() => onChange([])}
					>
						{t.intro_picked_clear}
					</Button>
				) : null}
			</div>
			<div
				className="grid gap-1"
				style={{
					gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))'
				}}
			>
				{images.map(image => {
					const position = order.get(image.assetId);
					const picked = position !== undefined;
					const previewUrl = resolveEditorImagePreviewUrl(
						image,
						previewQuality,
						false
					);
					return (
						<button
							key={image.assetId}
							type="button"
							onClick={() => toggle(image.assetId)}
							className="relative aspect-square overflow-hidden rounded border transition"
							style={{
								borderColor: picked
									? UI_COLORS.accent
									: UI_COLORS.border,
								opacity: picked ? 1 : full ? 0.3 : 0.55,
								cursor:
									!picked && full ? 'not-allowed' : 'pointer'
							}}
							title={
								picked
									? t.intro_picked_remove
									: t.intro_picked_add
							}
						>
							{previewUrl ? (
								<img
									src={previewUrl}
									alt=""
									className="h-full w-full object-cover"
									loading="lazy"
								/>
							) : (
								<div
									className="h-full w-full"
									style={{ background: UI_COLORS.shell }}
								/>
							)}
							{picked ? (
								<span
									className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
									style={{
										background: UI_COLORS.accent,
										color: UI_COLORS.accentFg
									}}
								>
									{position + 1}
								</span>
							) : null}
						</button>
					);
				})}
			</div>
		</div>
	);
}
