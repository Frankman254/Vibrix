/**
 * The global composition mode.
 *
 * With it on, what is on screen wins: changing image no longer applies that
 * image's scene, overrides or slot bindings. Nothing stored is erased — the
 * mode is a veto, not a write — so turning it off brings every image's own
 * composition straight back. The only action here that writes is "save to
 * all", and it asks first.
 */
import { useShallow } from 'zustand/react/shallow';
import { Save } from 'lucide-react';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { Button, Caption, SectionCard, ICON_SIZE } from '@/ui';
import ToggleControl from '@/editor/ToggleControl';
import { useDialog } from '@/editor/DialogProvider';

export default function GlobalCompositionSection() {
	const t = useT();
	const { confirm } = useDialog();
	const store = useWallpaperStore(
		useShallow(s => ({
			globalCompositionOverride: s.globalCompositionOverride,
			backgroundImages: s.backgroundImages,
			activeImageId: s.activeImageId,
			setGlobalCompositionOverride: s.setGlobalCompositionOverride,
			setImageIgnoreGlobalOverride: s.setImageIgnoreGlobalOverride,
			captureCompositionToAllImages: s.captureCompositionToAllImages
		}))
	);
	const activeImage = store.backgroundImages.find(
		image => image.assetId === store.activeImageId
	);

	async function saveToAll() {
		const count = store.backgroundImages.length;
		if (count === 0) return;
		const approved = await confirm({
			title: t.confirm_save_composition_all_title,
			message: t.confirm_save_composition_all_message.replace(
				'{count}',
				String(count)
			),
			confirmLabel: t.label_save,
			cancelLabel: t.label_cancel,
			tone: 'danger'
		});
		if (approved) store.captureCompositionToAllImages();
	}

	return (
		<SectionCard
			title={t.global_composition_title}
			subtitle={t.global_composition_hint}
			density="compact"
		>
			<div className="flex flex-col gap-2">
				<ToggleControl
					label={t.global_composition_toggle}
					value={store.globalCompositionOverride}
					onChange={store.setGlobalCompositionOverride}
					tooltip={t.global_composition_tooltip}
				/>
				{store.globalCompositionOverride && activeImage ? (
					<ToggleControl
						label={t.global_composition_image_opt_out}
						value={activeImage.ignoreGlobalOverride === true}
						onChange={store.setImageIgnoreGlobalOverride}
						tooltip={t.global_composition_image_opt_out_tooltip}
					/>
				) : null}
				<Button
					type="button"
					onClick={() => void saveToAll()}
					disabled={store.backgroundImages.length === 0}
					variant="destructive"
					size="sm"
					density="compact"
					icon={<Save size={ICON_SIZE.xs} />}
				>
					{t.global_composition_save_all.replace(
						'{count}',
						String(store.backgroundImages.length)
					)}
				</Button>
				<Caption>{t.global_composition_save_all_hint}</Caption>
			</div>
		</SectionCard>
	);
}
