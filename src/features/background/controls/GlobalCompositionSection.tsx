/**
 * The global composition mode.
 *
 * With it on, the global layer wins: changing image no longer applies that
 * image's scene, overrides or slot bindings. Nothing stored is erased — the
 * mode is a veto, not a write — so turning it off brings every image's own
 * composition straight back.
 *
 * What the mode applies is a global SLOT: capture the screen into one, and it
 * is applied over every image. There is deliberately no action here that writes
 * into the images; the button that used to do it replaced the per-image work of
 * a whole pool in one click, and slots make it unnecessary.
 */
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { Button, Caption, SectionCard } from '@/ui';
import ToggleControl from '@/editor/ToggleControl';
import ProfileSlotsEditor from '@/editor/ProfileSlotsEditor';
import { MAX_GLOBAL_COMPOSITION_SLOT_COUNT } from '@/store/featureProfiles';

export default function GlobalCompositionSection() {
	const t = useT();
	const store = useWallpaperStore(
		useShallow(s => ({
			globalCompositionOverride: s.globalCompositionOverride,
			globalCompositionSlots: s.globalCompositionSlots,
			activeGlobalCompositionSlotId: s.activeGlobalCompositionSlotId,
			backgroundImages: s.backgroundImages,
			activeImageId: s.activeImageId,
			setGlobalCompositionOverride: s.setGlobalCompositionOverride,
			setImageIgnoreGlobalOverride: s.setImageIgnoreGlobalOverride,
			setActiveGlobalCompositionSlotId:
				s.setActiveGlobalCompositionSlotId,
			captureGlobalCompositionSlot: s.captureGlobalCompositionSlot,
			applyGlobalCompositionSlot: s.applyGlobalCompositionSlot,
			addGlobalCompositionSlot: s.addGlobalCompositionSlot,
			deleteGlobalCompositionSlot: s.deleteGlobalCompositionSlot
		}))
	);
	const activeImage = store.backgroundImages.find(
		image => image.assetId === store.activeImageId
	);
	const activeIndex = store.globalCompositionSlots.findIndex(
		slot => slot.id === store.activeGlobalCompositionSlotId
	);

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
				<ProfileSlotsEditor
					title={t.global_composition_slots_title}
					hint={t.global_composition_slots_hint}
					slots={store.globalCompositionSlots}
					activeIndex={activeIndex >= 0 ? activeIndex : null}
					onSave={store.captureGlobalCompositionSlot}
					onLoad={store.applyGlobalCompositionSlot}
					loadLabel={t.global_composition_slot_load}
					saveLabel={t.global_composition_slot_save}
					slotLabel={t.global_composition_slot_label}
					emptyLabel={t.global_composition_slot_empty}
					activeLabel={t.global_composition_slot_active}
					onAdd={store.addGlobalCompositionSlot}
					onDelete={store.deleteGlobalCompositionSlot}
					maxSlots={MAX_GLOBAL_COMPOSITION_SLOT_COUNT}
				/>
				{activeIndex >= 0 ? (
					<Button
						type="button"
						onClick={() =>
							store.setActiveGlobalCompositionSlotId(null)
						}
						variant="secondary"
						size="sm"
						density="compact"
					>
						{t.global_composition_slot_none}
					</Button>
				) : null}
				<Caption>{t.global_composition_slot_none_hint}</Caption>
			</div>
		</SectionCard>
	);
}
