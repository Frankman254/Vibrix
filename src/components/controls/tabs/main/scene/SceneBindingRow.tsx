import { useT } from '@/lib/i18n';
import { Select, SegmentedControl, UI_COLORS } from '@/ui';
import type { SceneSlotRef } from '@/types/wallpaper';
import {
	resolveSceneBindingChange,
	sceneBindingMode,
	type SceneBindingMode
} from '@/features/scenes/sceneSlot';

export type SceneBindingSlot = {
	id: string;
	name: string;
	values: unknown | null;
};

/**
 * One subsystem row of the scene editor.
 *
 * The three states used to be the first two options of the slot dropdown, which
 * put "change nothing", "force this off" and "apply slot #3" on the same list —
 * so the answer to "what does this scene do about the logo?" needed opening a
 * menu. They are three buttons now, and the slot picker only exists when the
 * answer is a slot.
 */
export default function SceneBindingRow({
	label,
	value,
	slots,
	onChange
}: {
	label: string;
	value: SceneSlotRef;
	slots: ReadonlyArray<SceneBindingSlot>;
	onChange: (next: SceneSlotRef) => void;
}) {
	const t = useT();
	const mode = sceneBindingMode(value);
	const hasUsableSlot = slots.some(slot => slot.values !== null);

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-3">
				<span
					className="flex items-center gap-2 text-[12px] font-medium"
					style={{ color: UI_COLORS.fg }}
				>
					{label}
				</span>
				<div style={{ minWidth: 180 }}>
					<SegmentedControl<SceneBindingMode>
						value={mode}
						onChange={next => {
							const ref = resolveSceneBindingChange(
								next,
								value,
								slots
							);
							if (ref !== undefined) onChange(ref);
						}}
						options={[
							{ value: 'keep', label: t.scene_slot_keep },
							{ value: 'off', label: t.scene_slot_disabled },
							{
								value: 'slot',
								label: t.scene_slot_use,
								hint: hasUsableSlot
									? undefined
									: t.scene_slot_none_saved
							}
						]}
						size="sm"
						full
					/>
				</div>
			</div>
			{mode === 'slot' ? (
				<div className="flex justify-end">
					<div style={{ minWidth: 180 }}>
						<Select<string>
							value={typeof value === 'string' ? value : ''}
							options={slots.map((slot, index) => ({
								value: slot.id,
								label:
									slot.values === null
										? `#${index + 1} · ${slot.name} (${t.scene_slot_empty_suffix})`
										: `#${index + 1} · ${slot.name}`,
								disabled: slot.values === null
							}))}
							size="sm"
							full
							ariaLabel={`${label} slot`}
							onChange={next => onChange(next)}
						/>
					</div>
				</div>
			) : null}
			{!hasUsableSlot ? (
				<span
					className="text-right text-[10px]"
					style={{ color: UI_COLORS.fgMute }}
				>
					{t.scene_slot_none_saved}
				</span>
			) : null}
		</div>
	);
}
