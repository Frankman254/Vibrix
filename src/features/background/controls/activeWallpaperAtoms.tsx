import { useAudioContext } from '@/context/useAudioContext';
import { useT } from '@/lib/i18n';
import { Button, ToggleSwitch, UI_COLORS } from '@/ui';

export function SnapToNowButton({
	onSnap
}: {
	onSnap: (v: number | null) => void;
}) {
	const { getCurrentTime } = useAudioContext();
	const t = useT();
	return (
		<Button
			onClick={() => onSnap(Math.max(0, Math.round(getCurrentTime())))}
			size="sm"
			density="compact"
			variant="ghost"
			title={t.timestamp_set_current_tooltip}
		>
			NOW
		</Button>
	);
}

export function SwitchRow({
	label,
	checked,
	onChange
}: {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<div
			className="flex items-center justify-between gap-3 rounded-(--editor-radius-md) border px-3 py-2"
			style={{
				borderColor: UI_COLORS.border,
				background: UI_COLORS.raised
			}}
		>
			<span
				className="min-w-0 text-[12px] font-medium"
				style={{ color: UI_COLORS.fg }}
			>
				{label}
			</span>
			<ToggleSwitch
				checked={checked}
				onChange={onChange}
				size="sm"
				ariaLabel={label}
			/>
		</div>
	);
}
