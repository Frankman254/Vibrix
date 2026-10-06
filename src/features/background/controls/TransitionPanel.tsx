import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AUDIO_ROUTING_RANGES, SLIDESHOW_RANGES } from '@/config/ranges';
import { AdvancedOnly } from '@/editor/UIMode';
import { TRANSITION_REVERSE } from '@/features/background/transitionCatalog';
import { useT } from '@/lib/i18n';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type { ImageTransitionLayerTarget } from '@/types/wallpaper';
import { Button, Caption, FONT, Slider, ToggleSwitch, UI_COLORS } from '@/ui';
import BgAudioChannelSelector from './BgAudioChannelSelector';
import { formatDecimal } from './bgFormat';
import { TRANSITION_LABELS, TRANSITION_TYPES } from './constants';
import TransitionBatchPanel from './TransitionBatchPanel';

const LINKED_TARGETS: readonly ImageTransitionLayerTarget[] = [
	'spectrum',
	'spectrum2',
	'logo'
];

function ActiveImageTransitionPanel() {
	const t = useT();
	const store = useWallpaperStore(
		useShallow(state => ({
			activeImageId: state.activeImageId,
			backgroundImages: state.backgroundImages,
			transitionType: state.slideshowTransitionType,
			transitionDuration: state.slideshowTransitionDuration,
			transitionIntensity: state.slideshowTransitionIntensity,
			transitionAudioDrive: state.slideshowTransitionAudioDrive,
			transitionAudioChannel: state.slideshowTransitionAudioChannel,
			transitionAudioSmoothing: state.slideshowTransitionAudioSmoothing,
			setType: state.setSlideshowTransitionType,
			setDuration: state.setSlideshowTransitionDuration,
			setIntensity: state.setSlideshowTransitionIntensity,
			setAudioDrive: state.setSlideshowTransitionAudioDrive,
			setAudioChannel: state.setSlideshowTransitionAudioChannel,
			setAudioSmoothing: state.setSlideshowTransitionAudioSmoothing,
			setLayerTargets: state.setImageTransitionLayerTargets
		}))
	);
	const activeImage =
		store.backgroundImages.find(
			image => image.assetId === store.activeImageId
		) ?? null;
	const targets = activeImage?.transitionLayerTargets ?? [];
	const transitionEverything = LINKED_TARGETS.every(target =>
		targets.includes(target)
	);

	function toggleTarget(target: ImageTransitionLayerTarget) {
		store.setLayerTargets(
			targets.includes(target)
				? targets.filter(item => item !== target)
				: [...targets, target]
		);
	}

	return (
		<>
			<Caption>{t.hint_transition_next}</Caption>

			<div
				className="flex items-center justify-between gap-3 rounded-[var(--editor-radius-md)] border px-3 py-2"
				style={{
					borderColor: UI_COLORS.border,
					background: UI_COLORS.raised
				}}
			>
				<div className="min-w-0">
					<div className="text-xs font-semibold">
						{t.transition_all_layers}
					</div>
					<Caption>{t.transition_all_layers_hint}</Caption>
				</div>
				<ToggleSwitch
					checked={transitionEverything}
					disabled={!activeImage}
					onChange={enabled =>
						store.setLayerTargets(
							enabled ? [...LINKED_TARGETS] : []
						)
					}
					size="sm"
					ariaLabel={t.transition_all_layers}
				/>
			</div>

			{!transitionEverything ? (
				<div className="flex flex-col gap-1.5">
					<Caption>{t.transition_choose_layers}</Caption>
					<div className="grid grid-cols-3 gap-1.5">
						{(
							[
								['spectrum', t.transition_target_spectrum1],
								['spectrum2', t.transition_target_spectrum2],
								['logo', t.transition_target_logo]
							] as const
						).map(([target, label]) => {
							const active = targets.includes(target);
							return (
								<Button
									key={target}
									size="sm"
									density="compact"
									variant={active ? 'primary' : 'secondary'}
									active={active}
									disabled={!activeImage}
									onClick={() => toggleTarget(target)}
								>
									{label}
								</Button>
							);
						})}
					</div>
				</div>
			) : null}

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
				<div className="grid grid-cols-2 gap-1.5">
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
							{t[TRANSITION_LABELS[type]]}
						</Button>
					))}
				</div>
			</div>

			{TRANSITION_REVERSE[store.transitionType] ? (
				<Button
					size="sm"
					variant="secondary"
					onClick={() =>
						store.setType(TRANSITION_REVERSE[store.transitionType]!)
					}
				>
					{t.transition_reverse}
				</Button>
			) : null}

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

			<AdvancedOnly>
				<div className="flex flex-col gap-2">
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
				</div>
			</AdvancedOnly>
		</>
	);
}

export default function TransitionPanel() {
	const t = useT();
	const [tab, setTab] = useState<'image' | 'global'>('image');
	return (
		<div className="flex flex-col gap-3">
			<div
				role="tablist"
				aria-label={t.label_transition_style}
				className="grid grid-cols-2 gap-2"
			>
				<Button
					role="tab"
					aria-selected={tab === 'image'}
					active={tab === 'image'}
					onClick={() => setTab('image')}
				>
					{t.transition_tab_image}
				</Button>
				<Button
					role="tab"
					aria-selected={tab === 'global'}
					active={tab === 'global'}
					onClick={() => setTab('global')}
				>
					{t.transition_tab_global}
				</Button>
			</div>
			<div role="tabpanel" hidden={tab !== 'image'}>
				<div className="flex flex-col gap-3">
					<ActiveImageTransitionPanel />
				</div>
			</div>
			<div role="tabpanel" hidden={tab !== 'global'}>
				<TransitionBatchPanel />
			</div>
		</div>
	);
}
