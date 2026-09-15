import { Button, UI_COLORS } from '@/ui';
import { useIsAdvanced } from '@/editor/UIMode';
import BgPreciseSliderControl from './BgPreciseSliderControl';

export default function FocusQuickControls({
	t,
	focusX,
	focusY,
	pickFocusActive,
	onPickFocus,
	onCenterFocus,
	onAutoFocus,
	onChangeFocusPoint
}: {
	t: Record<string, string>;
	focusX: number | null;
	focusY: number | null;
	pickFocusActive: boolean;
	onPickFocus: () => void;
	onCenterFocus: () => void;
	onAutoFocus: () => void;
	onChangeFocusPoint: (x: number | null, y: number | null) => void;
}) {
	const isAdvanced = useIsAdvanced();

	return (
		<div
			className="flex flex-col gap-2 rounded-(--editor-radius-md) border px-2 py-2"
			style={{
				borderColor: UI_COLORS.border,
				background: 'rgba(0,0,0,0.12)'
			}}
		>
			<div className="flex items-center justify-between gap-2">
				<span
					className="text-[11px] font-semibold uppercase tracking-widest"
					style={{ color: 'var(--editor-accent-soft)' }}
				>
					Focus
				</span>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<Button
					onClick={onPickFocus}
					size="sm"
					density="compact"
					variant={pickFocusActive ? 'primary' : 'secondary'}
					title={t.hint_pick_focus_active}
					full
				>
					{t.label_pick_focus}
				</Button>
				<Button
					onClick={onCenterFocus}
					size="sm"
					density="compact"
					variant="secondary"
					title={t.hint_image_focus_point}
					full
				>
					{t.label_center_focus}
				</Button>
				<Button
					onClick={() => onChangeFocusPoint(null, null)}
					size="sm"
					density="compact"
					variant="secondary"
					title={t.hint_image_focus_point}
					full
				>
					{t.label_clear_focus}
				</Button>
				<Button
					onClick={onAutoFocus}
					size="sm"
					density="compact"
					variant="secondary"
					title={t.hint_auto_focus}
					full
				>
					{t.label_auto_focus}
				</Button>
			</div>
			{pickFocusActive ? (
				<span
					className="text-[11px]"
					style={{ color: 'var(--editor-accent-muted)' }}
				>
					{t.hint_pick_focus_active}
				</span>
			) : null}
			{isAdvanced ? (
				<div className="grid gap-2 sm:grid-cols-2">
					<BgPreciseSliderControl
						label="Focus X"
						value={focusX ?? 0.5}
						range={{ min: 0, max: 1, step: 0.01 }}
						onChange={value =>
							onChangeFocusPoint(value, focusY ?? 0.5)
						}
						resetValue={0.5}
					/>
					<BgPreciseSliderControl
						label="Focus Y"
						value={focusY ?? 0.5}
						range={{ min: 0, max: 1, step: 0.01 }}
						onChange={value =>
							onChangeFocusPoint(focusX ?? 0.5, value)
						}
						resetValue={0.5}
					/>
				</div>
			) : null}
		</div>
	);
}
