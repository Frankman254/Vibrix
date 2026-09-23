import { useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import {
	cancelOfflineVideoExport,
	dismissOfflineVideoExportNotice,
	getOfflineVideoExportSnapshot,
	isOfflineVideoExportBusyPhase,
	subscribeOfflineVideoExport
} from '@/features/export/video/offlineVideoExportRuntime';
import {
	offlineExportErrorLabel,
	offlineExportPhaseLabel,
	offlineExportSavedLabel
} from '@/features/export/video/offlineVideoExportLabels';
import { BLUR, FONT, UI_COLORS, Z_INDEX } from '@/ui';

/**
 * The offline video export, pinned to the top edge of the editor.
 *
 * A long export used to be invisible outside its own tab, so the user could
 * not keep editing and still know where the render was. The run lives in
 * `offlineVideoExportRuntime`, which outlives the Export tab; this bar is the
 * editor-wide readout of it (percent included: a bar alone reads as stuck when
 * the tab is backgrounded and progress events throttle to ~1 Hz).
 */
export default function OfflineExportProgressBar() {
	const t = useT();
	const run = useSyncExternalStore(
		subscribeOfflineVideoExport,
		getOfflineVideoExportSnapshot,
		getOfflineVideoExportSnapshot
	);
	const { phase } = run.progress;
	const busy = isOfflineVideoExportBusyPhase(phase);
	if (run.noticeDismissed) return null;
	if (
		!busy &&
		phase !== 'done' &&
		phase !== 'cancelled' &&
		phase !== 'error'
	) {
		return null;
	}

	const percent = Math.round(run.progress.ratio * 100);
	const accent =
		phase === 'error'
			? UI_COLORS.danger
			: phase === 'done'
				? UI_COLORS.ok
				: UI_COLORS.accent;
	const detail = busy
		? offlineExportPhaseLabel(t, run.progress)
		: phase === 'done'
			? offlineExportSavedLabel(t, run.savedFileName, run.savedFileBytes)
			: run.error
				? offlineExportErrorLabel(t, run.error, run.storageHint)
				: offlineExportPhaseLabel(t, run.progress);

	return (
		<div
			role="status"
			aria-live="polite"
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				zIndex: Z_INDEX.toast,
				display: 'flex',
				flexDirection: 'column',
				background: UI_COLORS.shell,
				backdropFilter: BLUR.heavy,
				WebkitBackdropFilter: BLUR.heavy,
				borderBottom: `1px solid ${UI_COLORS.border}`,
				color: UI_COLORS.fg,
				fontFamily: FONT.ui
			}}
		>
			<div
				style={{
					height: 4,
					width: '100%',
					background: UI_COLORS.panel,
					overflow: 'hidden'
				}}
			>
				<div
					style={{
						height: '100%',
						width: busy ? `${Math.max(2, percent)}%` : '100%',
						background: accent,
						transition: 'width 150ms linear'
					}}
				/>
			</div>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					padding: '6px 12px',
					fontSize: 12,
					minWidth: 0
				}}
			>
				<span style={{ fontWeight: 800, flex: '0 0 auto' }}>
					{busy ? t.offline_global_title : t.offline_global_finished}
				</span>
				{busy ? (
					<span
						style={{
							flex: '0 0 auto',
							fontVariantNumeric: 'tabular-nums',
							color: accent,
							fontWeight: 700
						}}
					>
						{percent}%
					</span>
				) : null}
				<span
					style={{
						flex: 1,
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						color: busy ? UI_COLORS.fgMute : accent
					}}
				>
					{detail}
				</span>
				{busy ? (
					<button
						type="button"
						onClick={cancelOfflineVideoExport}
						style={{
							flex: '0 0 auto',
							padding: '3px 10px',
							border: `1px solid ${UI_COLORS.border}`,
							borderRadius: 8,
							background: UI_COLORS.panel,
							color: UI_COLORS.fg,
							fontSize: 11,
							cursor: 'pointer'
						}}
					>
						{t.offline_btn_cancel}
					</button>
				) : (
					<button
						type="button"
						aria-label={t.offline_global_dismiss}
						onClick={dismissOfflineVideoExportNotice}
						style={{
							flex: '0 0 auto',
							display: 'grid',
							placeItems: 'center',
							width: 24,
							height: 24,
							padding: 0,
							border: `1px solid ${UI_COLORS.border}`,
							borderRadius: 8,
							background: UI_COLORS.panel,
							color: UI_COLORS.fg,
							cursor: 'pointer'
						}}
					>
						<X aria-hidden="true" size={13} />
					</button>
				)}
			</div>
		</div>
	);
}
