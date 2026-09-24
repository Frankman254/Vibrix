/**
 * The effect-layer list in the Looks tab.
 *
 * One row per layer, top-down in resolution order: when two layers name the
 * same target, the higher row wins and they never blend. Selecting a row is
 * what the rest of the tab edits — the sliders below always belong to the
 * highlighted layer.
 */
import { useShallow } from 'zustand/react/shallow';
import {
	ArrowDown,
	ArrowUp,
	Copy,
	Eye,
	EyeOff,
	Plus,
	Trash2
} from 'lucide-react';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { MAX_EFFECT_LAYER_COUNT } from '@/features/filterLooks/effectLayers';
import type { FilterTarget } from '@/types/wallpaper';
import {
	Button,
	Caption,
	IconButton,
	SectionCard,
	UI_COLORS,
	ICON_SIZE
} from '@/ui';
import { useDialog } from '@/editor/DialogProvider';

export default function EffectLayerStack({
	targetLabels
}: {
	targetLabels: Record<FilterTarget, string>;
}) {
	const t = useT();
	const { confirm } = useDialog();
	const store = useWallpaperStore(
		useShallow(s => ({
			effectLayers: s.effectLayers,
			activeEffectLayerId: s.activeEffectLayerId,
			filterTargets: s.filterTargets,
			addEffectLayer: s.addEffectLayer,
			duplicateEffectLayer: s.duplicateEffectLayer,
			removeEffectLayer: s.removeEffectLayer,
			selectEffectLayer: s.selectEffectLayer,
			setEffectLayerEnabled: s.setEffectLayerEnabled,
			renameEffectLayer: s.renameEffectLayer,
			moveEffectLayer: s.moveEffectLayer
		}))
	);

	const atCeiling = store.effectLayers.length >= MAX_EFFECT_LAYER_COUNT;

	async function removeLayer(id: string, name: string) {
		const approved = await confirm({
			title: t.confirm_delete_effect_layer_title,
			message: t.confirm_delete_effect_layer_message.replace(
				'{name}',
				name
			),
			confirmLabel: t.label_delete,
			cancelLabel: t.label_cancel,
			tone: 'danger'
		});
		if (approved) store.removeEffectLayer(id);
	}

	return (
		<SectionCard
			title={t.looks_layers_section}
			subtitle={t.looks_layers_hint}
			density="compact"
			action={
				<Button
					type="button"
					onClick={() => store.addEffectLayer()}
					disabled={atCeiling}
					size="sm"
					density="compact"
					variant="primary"
					icon={<Plus size={ICON_SIZE.xs} />}
				>
					{t.looks_layers_add}
				</Button>
			}
		>
			<div className="flex flex-col gap-1.5">
				{store.effectLayers.map((layer, index) => {
					const isActive = layer.id === store.activeEffectLayerId;
					// The active layer's live targets are the legacy key, not
					// its snapshot, so the row must read the same source the
					// renderers do.
					const targets = isActive
						? store.filterTargets
						: layer.targets;
					const fallbackName = t.looks_layers_default_name.replace(
						'{index}',
						String(index + 1)
					);
					const name = layer.name.trim() || fallbackName;
					return (
						<div
							key={layer.id}
							className="flex flex-col gap-1 px-2 py-1.5"
							style={{
								borderRadius: 'var(--editor-radius-md)',
								border: `1px solid ${
									isActive
										? UI_COLORS.accentBorder
										: UI_COLORS.border
								}`,
								background: isActive
									? UI_COLORS.accentSoft
									: UI_COLORS.raised,
								opacity: layer.enabled ? 1 : 0.55
							}}
						>
							<div className="flex min-w-0 items-center gap-1">
								<button
									type="button"
									onClick={() =>
										store.selectEffectLayer(layer.id)
									}
									className="min-w-0 flex-1 truncate text-left text-[11px]"
									style={{
										color: isActive
											? UI_COLORS.accent
											: UI_COLORS.fg
									}}
								>
									{name}
								</button>
								<IconButton
									type="button"
									aria-label={
										layer.enabled
											? t.looks_layers_disable
											: t.looks_layers_enable
									}
									onClick={() =>
										store.setEffectLayerEnabled(
											layer.id,
											!layer.enabled
										)
									}
									size="sm"
								>
									{layer.enabled ? (
										<Eye size={ICON_SIZE.xs} />
									) : (
										<EyeOff size={ICON_SIZE.xs} />
									)}
								</IconButton>
								<IconButton
									type="button"
									aria-label={t.looks_layers_move_up}
									onClick={() =>
										store.moveEffectLayer(layer.id, 'up')
									}
									disabled={index === 0}
									size="sm"
								>
									<ArrowUp size={ICON_SIZE.xs} />
								</IconButton>
								<IconButton
									type="button"
									aria-label={t.looks_layers_move_down}
									onClick={() =>
										store.moveEffectLayer(layer.id, 'down')
									}
									disabled={
										index === store.effectLayers.length - 1
									}
									size="sm"
								>
									<ArrowDown size={ICON_SIZE.xs} />
								</IconButton>
								<IconButton
									type="button"
									aria-label={t.looks_layers_duplicate}
									onClick={() =>
										store.duplicateEffectLayer(layer.id)
									}
									disabled={atCeiling}
									size="sm"
								>
									<Copy size={ICON_SIZE.xs} />
								</IconButton>
								<IconButton
									type="button"
									aria-label={t.looks_layers_remove}
									onClick={() => removeLayer(layer.id, name)}
									disabled={store.effectLayers.length <= 1}
									variant="destructive"
									size="sm"
								>
									<Trash2 size={ICON_SIZE.xs} />
								</IconButton>
							</div>
							<div className="flex min-w-0 items-center gap-1">
								<input
									type="text"
									value={layer.name}
									placeholder={fallbackName}
									onChange={event =>
										store.renameEffectLayer(
											layer.id,
											event.target.value
										)
									}
									className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[10px] outline-none"
									style={{
										borderRadius: 'var(--editor-radius-sm)',
										border: `1px solid ${UI_COLORS.border}`,
										color: UI_COLORS.fg
									}}
								/>
							</div>
							<Caption>
								{targets.length === 0
									? t.looks_layers_no_targets
									: targets
											.map(target => targetLabels[target])
											.join(' · ')}
							</Caption>
						</div>
					);
				})}
			</div>
		</SectionCard>
	);
}
