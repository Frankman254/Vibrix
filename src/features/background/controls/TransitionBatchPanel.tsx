import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useDialog } from '@/editor/DialogProvider';
import { useT } from '@/lib/i18n';
import { Button, Caption, Select, Slider } from '@/ui';
import { SLIDESHOW_RANGES } from '@/config/ranges';
import type { SlideshowTransitionType } from '@/types/wallpaper';
import {
	planTransitionBatch,
	transitionBatchImages,
	type TransitionBatchExtras
} from '../transitionBatch';
import { TRANSITION_TYPES, TRANSITION_LABELS } from '../transitionCatalog';
import BgAudioChannelSelector from './BgAudioChannelSelector';

export default function TransitionBatchPanel() {
	const t = useT();
	const { confirm } = useDialog();
	const state = useWallpaperStore(
		useShallow(s => ({
			images: s.backgroundImages,
			setlists: s.setlists,
			activeSetlistId: s.activeSetlistId,
			apply: s.applyTransitionBatch
		}))
	);
	const [scope, setScope] = useState<string | null>(state.activeSetlistId);
	const [selected, setSelected] = useState<SlideshowTransitionType[]>([
		'cross-zoom',
		'diagonal-wipe',
		'iris'
	]);
	const [extras, setExtras] = useState<TransitionBatchExtras>({});
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const images = transitionBatchImages(state.images, state.setlists, scope);
	const scopeName =
		scope === null
			? t.transition_batch_library
			: (state.setlists.find(s => s.id === scope)?.name ??
				t.transition_batch_missing);
	const apply = async () => {
		const plan = planTransitionBatch(images, selected, { ...extras });
		if (!plan) {
			setMessage(t.transition_batch_insufficient);
			return;
		}
		setBusy(true);
		try {
			const parameters = [
				t.label_transition_style,
				...(extras.transitionIntensity !== undefined
					? [t.label_transition_intensity]
					: []),
				...(extras.transitionAudioDrive !== undefined
					? [t.label_transition_audio_drive]
					: []),
				...(extras.transitionAudioChannel !== undefined
					? [t.label_transition_audio_channel]
					: [])
			];
			const ok = await confirm({
				title: t.transition_batch_confirm,
				message: `${scopeName} · ${images.length} ${t.transition_batch_images}\n${parameters.join(', ')}\n${selected.length} ${t.transition_batch_styles}\n${t.transition_batch_confirm_hint}`,
				confirmLabel: t.transition_batch_apply,
				cancelLabel: t.label_cancel,
				tone: 'danger'
			});
			if (!ok) return;
			setMessage(
				state.apply(plan, state.images, state.setlists)
					? `${t.transition_batch_done} ${images.length}`
					: t.transition_batch_stale
			);
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="flex flex-col gap-3">
			<Caption>{t.transition_batch_hint}</Caption>
			<Select
				ariaLabel={t.transition_batch_scope}
				value={scope ?? '__library'}
				onChange={value => {
					setScope(value === '__library' ? null : value);
					setMessage('');
				}}
				options={[
					{ value: '__library', label: t.transition_batch_library },
					...state.setlists.map(s => ({ value: s.id, label: s.name }))
				]}
				full
			/>
			<Caption>{`${images.length} ${t.transition_batch_images} · ${selected.length}/${TRANSITION_TYPES.length} ${t.transition_batch_styles}`}</Caption>
			<div className="flex gap-2">
				<Button
					size="sm"
					onClick={() => setSelected([...TRANSITION_TYPES])}
				>
					{t.transition_batch_all}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => setSelected([])}
				>
					{t.transition_batch_none}
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-1.5">
				{TRANSITION_TYPES.map(type => (
					<Button
						key={type}
						size="sm"
						density="compact"
						aria-pressed={selected.includes(type)}
						active={selected.includes(type)}
						variant={
							selected.includes(type) ? 'primary' : 'secondary'
						}
						onClick={() => {
							setMessage('');
							setSelected(list =>
								list.includes(type)
									? list.filter(item => item !== type)
									: [...list, type]
							);
						}}
					>
						{t[TRANSITION_LABELS[type]]}
					</Button>
				))}
			</div>
			<Caption>{t.transition_batch_preserve}</Caption>
			<details>
				<summary className="cursor-pointer text-xs">
					{t.transition_batch_optional}
				</summary>
				<div className="flex flex-col gap-3 pt-3">
					<label className="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							checked={extras.transitionIntensity !== undefined}
							onChange={event =>
								setExtras(value => ({
									...value,
									transitionIntensity: event.target.checked
										? 1
										: undefined
								}))
							}
						/>
						{t.label_transition_intensity}
					</label>
					{extras.transitionIntensity !== undefined && (
						<Slider
							label={t.label_transition_intensity}
							value={extras.transitionIntensity}
							{...SLIDESHOW_RANGES.transitionIntensity}
							onChange={value =>
								setExtras(e => ({
									...e,
									transitionIntensity: value
								}))
							}
						/>
					)}
					<label className="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							checked={extras.transitionAudioDrive !== undefined}
							onChange={event =>
								setExtras(value => ({
									...value,
									transitionAudioDrive: event.target.checked
										? 0.5
										: undefined
								}))
							}
						/>
						{t.label_transition_audio_drive}
					</label>
					{extras.transitionAudioDrive !== undefined && (
						<Slider
							label={t.label_transition_audio_drive}
							value={extras.transitionAudioDrive}
							{...SLIDESHOW_RANGES.transitionAudioDrive}
							onChange={value =>
								setExtras(e => ({
									...e,
									transitionAudioDrive: value
								}))
							}
						/>
					)}
					<label className="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							checked={
								extras.transitionAudioChannel !== undefined
							}
							onChange={event =>
								setExtras(value => ({
									...value,
									transitionAudioChannel: event.target.checked
										? 'bass'
										: undefined
								}))
							}
						/>
						{t.label_transition_audio_channel}
					</label>
					{extras.transitionAudioChannel !== undefined && (
						<BgAudioChannelSelector
							value={extras.transitionAudioChannel}
							onChange={value =>
								setExtras(e => ({
									...e,
									transitionAudioChannel: value
								}))
							}
							label={t.label_transition_audio_channel}
						/>
					)}
				</div>
			</details>
			<Caption>{t.transition_batch_shared}</Caption>
			<Button
				variant="destructive"
				disabled={busy || !images.length || !selected.length}
				onClick={() => void apply()}
			>
				{t.transition_batch_apply}
			</Button>
			{message && (
				<p role="status" className="text-xs">
					{message}
				</p>
			)}
		</div>
	);
}
