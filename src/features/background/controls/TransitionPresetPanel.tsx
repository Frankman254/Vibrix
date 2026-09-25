import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useDialog } from '@/editor/DialogProvider';
import { AdvancedOnly } from '@/editor/UIMode';
import { useT } from '@/lib/i18n';
import { AUDIO_ROUTING_RANGES, SLIDESHOW_RANGES } from '@/config/ranges';
import { Button, Caption, Slider, TextInput, UI_COLORS, FONT } from '@/ui';
import {
	MAX_TRANSITION_PRESETS,
	resolveImageTransitionPresetId
} from '@/features/background/transitionPresets';
import { TRANSITION_LABELS, TRANSITION_TYPES } from './constants';
import BgAudioChannelSelector from './BgAudioChannelSelector';
import { formatDecimal } from './bgFormat';

/**
 * The transition of the active image, as ONE named choice instead of five
 * anonymous dials.
 *
 * The dials are still here, under Advanced, and they still edit the image —
 * moving one drops the image back to "Custom", because at that point it no
 * longer is what the preset says. Saving is explicit, the way every other slot
 * in this app works.
 */
export default function TransitionPresetPanel() {
	const t = useT();
	const { confirm } = useDialog();
	const [draftName, setDraftName] = useState('');
	const [renameId, setRenameId] = useState<string | null>(null);
	const [renameDraft, setRenameDraft] = useState('');

	// Flat on purpose: a nested object rebuilt per call never compares equal
	// under `useShallow` and spins React (see ImageCompositionPanel).
	const store = useWallpaperStore(
		useShallow(s => ({
			activeImageId: s.activeImageId,
			backgroundImages: s.backgroundImages,
			transitionPresets: s.transitionPresets,
			transitionType: s.slideshowTransitionType,
			transitionDuration: s.slideshowTransitionDuration,
			transitionIntensity: s.slideshowTransitionIntensity,
			transitionAudioDrive: s.slideshowTransitionAudioDrive,
			transitionAudioChannel: s.slideshowTransitionAudioChannel,
			transitionAudioSmoothing: s.slideshowTransitionAudioSmoothing,
			setType: s.setSlideshowTransitionType,
			setDuration: s.setSlideshowTransitionDuration,
			setIntensity: s.setSlideshowTransitionIntensity,
			setAudioDrive: s.setSlideshowTransitionAudioDrive,
			setAudioChannel: s.setSlideshowTransitionAudioChannel,
			setAudioSmoothing: s.setSlideshowTransitionAudioSmoothing,
			applyPreset: s.applyTransitionPreset,
			savePreset: s.saveTransitionPreset,
			renamePreset: s.renameTransitionPreset,
			deletePreset: s.deleteTransitionPreset
		}))
	);

	const activeImage =
		store.backgroundImages.find(
			image => image.assetId === store.activeImageId
		) ?? null;
	// The live values are the active image's values (they are mirrored), so an
	// image with no image is not a case this panel can be in.
	const activePresetId = activeImage
		? resolveImageTransitionPresetId(activeImage, store.transitionPresets)
		: null;
	const atLimit = store.transitionPresets.length >= MAX_TRANSITION_PRESETS;

	const handleDelete = async (id: string, name: string) => {
		const ok = await confirm({
			title: t.transition_preset_delete_title,
			message: `${name} — ${t.transition_preset_delete_message}`,
			confirmLabel: t.label_delete,
			tone: 'danger'
		});
		if (ok) store.deletePreset(id);
	};

	return (
		<>
			<Caption>{t.hint_transition_next}</Caption>

			<div className="flex flex-wrap gap-1.5">
				{store.transitionPresets.map(preset => (
					<Button
						key={preset.id}
						size="sm"
						density="compact"
						variant={
							activePresetId === preset.id
								? 'primary'
								: 'secondary'
						}
						active={activePresetId === preset.id}
						onClick={() => store.applyPreset(preset.id)}
					>
						{preset.name}
					</Button>
				))}
				<span
					className="self-center text-[11px]"
					style={{ color: UI_COLORS.fgMute }}
				>
					{activePresetId ? '' : `· ${t.transition_preset_custom}`}
				</span>
			</div>

			<div className="flex items-center gap-1.5">
				<TextInput
					size="xs"
					full
					value={draftName}
					placeholder={t.transition_preset_name_placeholder}
					onChange={event => setDraftName(event.target.value)}
				/>
				<Button
					size="sm"
					density="compact"
					variant="secondary"
					disabled={atLimit}
					onClick={() => {
						store.savePreset(draftName);
						setDraftName('');
					}}
				>
					{t.transition_preset_save}
				</Button>
			</div>
			{atLimit ? <Caption>{t.transition_preset_limit}</Caption> : null}

			<AdvancedOnly>
				<div className="flex flex-col gap-1.5">
					{store.transitionPresets
						.filter(preset => !preset.builtIn)
						.map(preset =>
							renameId === preset.id ? (
								<div
									key={preset.id}
									className="flex items-center gap-1.5"
								>
									<TextInput
										size="xs"
										full
										value={renameDraft}
										onChange={event =>
											setRenameDraft(event.target.value)
										}
									/>
									<Button
										size="sm"
										density="compact"
										variant="secondary"
										onClick={() => {
											store.renamePreset(
												preset.id,
												renameDraft
											);
											setRenameId(null);
										}}
									>
										{t.label_save}
									</Button>
								</div>
							) : (
								<div
									key={preset.id}
									className="flex items-center justify-between gap-1.5"
								>
									<span
										className="min-w-0 truncate text-[11px]"
										style={{ color: UI_COLORS.fgMute }}
									>
										{preset.name}
									</span>
									<div className="flex gap-1.5">
										<Button
											size="sm"
											density="compact"
											variant="ghost"
											onClick={() => {
												setRenameId(preset.id);
												setRenameDraft(preset.name);
											}}
										>
											{t.label_rename}
										</Button>
										<Button
											size="sm"
											density="compact"
											variant="destructive"
											onClick={() =>
												void handleDelete(
													preset.id,
													preset.name
												)
											}
										>
											{t.label_delete}
										</Button>
									</div>
								</div>
							)
						)}
				</div>

				<div className="flex flex-col gap-1">
					<span
						className="uppercase"
						style={{
							color: UI_COLORS.fgMute,
							fontFamily: FONT.mono,
							fontSize: 10,
							fontWeight: 650,
							letterSpacing: '0.1em'
						}}
					>
						{t.label_transition_style}
					</span>
					<div className="flex flex-wrap gap-1.5">
						{TRANSITION_TYPES.map(type => (
							<Button
								key={type}
								size="sm"
								density="compact"
								variant={
									store.transitionType === type
										? 'primary'
										: 'secondary'
								}
								active={store.transitionType === type}
								onClick={() => store.setType(type)}
							>
								{TRANSITION_LABELS[type]}
							</Button>
						))}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<Slider
						label={t.label_transition_duration}
						value={store.transitionDuration}
						{...SLIDESHOW_RANGES.transitionDuration}
						unit="s"
						onChange={store.setDuration}
						variant="compact"
						formatValue={formatDecimal}
					/>
					<Slider
						label={t.label_transition_intensity}
						value={store.transitionIntensity}
						{...SLIDESHOW_RANGES.transitionIntensity}
						onChange={store.setIntensity}
						variant="compact"
						formatValue={formatDecimal}
					/>
				</div>

				<Slider
					label={t.label_transition_audio_drive}
					value={store.transitionAudioDrive}
					{...SLIDESHOW_RANGES.transitionAudioDrive}
					onChange={store.setAudioDrive}
					variant="compact"
					formatValue={formatDecimal}
				/>
				<BgAudioChannelSelector
					value={store.transitionAudioChannel}
					onChange={store.setAudioChannel}
					label={t.label_transition_audio_channel}
				/>
				<Slider
					label={t.label_smoothing}
					value={store.transitionAudioSmoothing}
					{...AUDIO_ROUTING_RANGES.selectedChannelSmoothing}
					onChange={store.setAudioSmoothing}
					variant="compact"
					formatValue={formatDecimal}
				/>
			</AdvancedOnly>
		</>
	);
}
