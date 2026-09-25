/**
 * The motion-layer list in the Motion tab.
 *
 * One row per layer, top-down in resolution order: when two layers name the
 * same target, the higher row moves it and they never blend. Selecting a row is
 * what the dials below edit — the movement shown always belongs to the
 * highlighted layer. Same component shape as `EffectLayerStack` in the Looks
 * tab on purpose: it is the same idea applied to movement.
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
import { MAX_MOTION_LAYER_COUNT } from '@/features/stageFx/motionLayers';
import type { CameraMotionTarget } from '@/features/stageFx/stageFxConfig';
import {
	Button,
	Caption,
	IconButton,
	SectionCard,
	UI_COLORS,
	ICON_SIZE
} from '@/ui';
import { useDialog } from '@/editor/DialogProvider';

export default function MotionLayerStack({
	targetLabels
}: {
	targetLabels: Record<CameraMotionTarget, string>;
}) {
	const t = useT();
	const { confirm } = useDialog();
	const store = useWallpaperStore(
		useShallow(s => ({
			motionLayers: s.motionLayers,
			activeMotionLayerId: s.activeMotionLayerId,
			cameraMotionTargets: s.cameraMotionTargets,
			addMotionLayer: s.addMotionLayer,
			duplicateMotionLayer: s.duplicateMotionLayer,
			removeMotionLayer: s.removeMotionLayer,
			selectMotionLayer: s.selectMotionLayer,
			setMotionLayerEnabled: s.setMotionLayerEnabled,
			renameMotionLayer: s.renameMotionLayer,
			moveMotionLayer: s.moveMotionLayer
		}))
	);

	const atCeiling = store.motionLayers.length >= MAX_MOTION_LAYER_COUNT;

	async function removeLayer(id: string, name: string) {
		const approved = await confirm({
			title: t.confirm_delete_motion_layer_title,
			message: t.confirm_delete_motion_layer_message.replace(
				'{name}',
				name
			),
			confirmLabel: t.label_delete,
			cancelLabel: t.label_cancel,
			tone: 'danger'
		});
		if (approved) store.removeMotionLayer(id);
	}

	return (
		<SectionCard
			title={t.motion_layers_section}
			subtitle={t.motion_layers_hint}
			density="compact"
			action={
				<Button
					type="button"
					onClick={() => store.addMotionLayer()}
					disabled={atCeiling}
					size="sm"
					density="compact"
					variant="primary"
					icon={<Plus size={ICON_SIZE.xs} />}
				>
					{t.motion_layers_add}
				</Button>
			}
		>
			<div className="flex flex-col gap-1.5">
				{store.motionLayers.map((layer, index) => {
					const isActive = layer.id === store.activeMotionLayerId;
					// The active layer's live targets are the flat key, not its
					// snapshot, so the row reads the same source the renderer
					// does.
					const targets = isActive
						? store.cameraMotionTargets
						: layer.targets;
					const fallbackName = t.motion_layers_default_name.replace(
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
										store.selectMotionLayer(layer.id)
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
											? t.motion_layers_disable
											: t.motion_layers_enable
									}
									onClick={() =>
										store.setMotionLayerEnabled(
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
									aria-label={t.motion_layers_move_up}
									onClick={() =>
										store.moveMotionLayer(layer.id, 'up')
									}
									disabled={index === 0}
									size="sm"
								>
									<ArrowUp size={ICON_SIZE.xs} />
								</IconButton>
								<IconButton
									type="button"
									aria-label={t.motion_layers_move_down}
									onClick={() =>
										store.moveMotionLayer(layer.id, 'down')
									}
									disabled={
										index === store.motionLayers.length - 1
									}
									size="sm"
								>
									<ArrowDown size={ICON_SIZE.xs} />
								</IconButton>
								<IconButton
									type="button"
									aria-label={t.motion_layers_duplicate}
									onClick={() =>
										store.duplicateMotionLayer(layer.id)
									}
									disabled={atCeiling}
									size="sm"
								>
									<Copy size={ICON_SIZE.xs} />
								</IconButton>
								<IconButton
									type="button"
									aria-label={t.motion_layers_remove}
									onClick={() => removeLayer(layer.id, name)}
									disabled={store.motionLayers.length <= 1}
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
										store.renameMotionLayer(
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
									? t.motion_layers_no_targets
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
