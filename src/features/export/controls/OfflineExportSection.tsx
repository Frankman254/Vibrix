import type {
	OfflineExportIssue,
	OfflineExportPlan
} from '@/features/export/offlineExportTypes';
import {
	OFFLINE_EXPORT_FPS_OPTIONS,
	OFFLINE_EXPORT_RESOLUTION_PRESETS,
	type OfflineExportFps,
	type OfflineExportResolutionPresetId
} from '@/features/export/offlineExportTypes';
import type {
	OfflineVideoExportProgress,
	OfflineVideoFormat
} from '@/features/export/video/offlineVideoFormat';
import type { OfflineVideoExportError } from './useOfflineVideoExport';
import { formatDuration } from '@/features/export/exportFileUtils';
import { useT, type Translations } from '@/lib/i18n';
import { Button, UI_COLORS } from '@/ui';
import EnumButtons from '@/ui/EnumButtonGroup';

type OfflineAnalysisStatus = 'idle' | 'running' | 'ready' | 'error';

type OfflineExportSectionProps = {
	offlineExportPlan: OfflineExportPlan;
	offlineExportVisibleIssues: OfflineExportIssue[];
	offlineExportToneClass: string;
	offlineAnalysisStatus: OfflineAnalysisStatus;
	offlineAnalysisMessage: string;
	canAnalyzeOfflineAudio: boolean;
	onAnalyzeOfflineAudio: () => void;
	resolutionId: OfflineExportResolutionPresetId;
	onResolutionChange: (id: OfflineExportResolutionPresetId) => void;
	fps: OfflineExportFps;
	onFpsChange: (fps: OfflineExportFps) => void;
	format: OfflineVideoFormat | null;
	formatChecked: boolean;
	progress: OfflineVideoExportProgress;
	error: OfflineVideoExportError | null;
	savedFileName: string;
	busy: boolean;
	canStart: boolean;
	onStartExport: () => void;
	onCancelExport: () => void;
};

function issueLabel(t: Translations, issue: OfflineExportIssue): string {
	const labels: Record<string, string> = {
		'missing-file-audio': t.offline_issue_missing_file_audio,
		'live-audio-unsupported': t.offline_issue_live_audio,
		'web-audio-unavailable': t.offline_issue_web_audio,
		'webcodecs-unavailable': t.offline_issue_webcodecs,
		'export-unsupported-particles': t.offline_issue_unsupported_particles,
		'export-unsupported-rain': t.offline_issue_unsupported_rain,
		'export-unsupported-overlays': t.offline_issue_unsupported_overlays,
		'export-unsupported-global-background':
			t.offline_issue_unsupported_global_background,
		'export-unsupported-stage-fx': t.offline_issue_unsupported_stage_fx,
		'export-unsupported-slideshow': t.offline_issue_unsupported_slideshow
	};
	return labels[issue.code] ?? issue.message;
}

function phaseLabel(
	t: Translations,
	progress: OfflineVideoExportProgress
): string {
	switch (progress.phase) {
		case 'preparing':
			return t.offline_phase_preparing;
		case 'decoding':
			return t.offline_phase_decoding;
		case 'rendering': {
			const frames = t.offline_phase_rendering
				.replace('{done}', String(progress.frameIndex))
				.replace('{total}', String(progress.frameCount));
			return progress.etaMs === null
				? frames
				: `${frames} · ${t.offline_eta.replace(
						'{time}',
						formatDuration(Math.ceil(progress.etaMs / 1000))
					)}`;
		}
		case 'finalizing':
			return t.offline_phase_finalizing;
		case 'cancelled':
			return t.offline_phase_cancelled;
		default:
			return '';
	}
}

function errorLabel(t: Translations, error: OfflineVideoExportError): string {
	switch (error) {
		case 'no-audio':
			return t.offline_issue_missing_file_audio;
		case 'no-encoder':
			return t.offline_error_no_encoder;
		case 'audio-not-found':
			return t.offline_error_audio_not_found;
		default:
			return t.offline_error_failed;
	}
}

export default function OfflineExportSection({
	offlineExportPlan,
	offlineExportVisibleIssues,
	offlineExportToneClass,
	offlineAnalysisStatus,
	offlineAnalysisMessage,
	canAnalyzeOfflineAudio,
	onAnalyzeOfflineAudio,
	resolutionId,
	onResolutionChange,
	fps,
	onFpsChange,
	format,
	formatChecked,
	progress,
	error,
	savedFileName,
	busy,
	canStart,
	onStartExport,
	onCancelExport
}: OfflineExportSectionProps) {
	const t = useT();
	const readinessLabel =
		offlineExportPlan.status === 'ready'
			? t.offline_readiness_ready
			: offlineExportPlan.status === 'warning'
				? t.offline_readiness_warning
				: t.offline_readiness_blocked;
	const formatLabel = !formatChecked
		? t.offline_format_checking
		: format
			? `${format.container.toUpperCase()} · ${format.videoCodec.toUpperCase()} + ${format.audioCodec.toUpperCase()}`
			: t.offline_error_no_encoder;
	const currentPhaseLabel = phaseLabel(t, progress);

	return (
		<div className="flex flex-col gap-2">
			<span className={`text-xs ${offlineExportToneClass}`}>
				{readinessLabel}
			</span>
			<span className="text-xs text-gray-500">{t.offline_caption}</span>

			<div className="flex flex-col gap-1">
				<span
					className="text-xs"
					style={{ color: 'var(--editor-accent-soft)' }}
				>
					{t.offline_label_resolution}
				</span>
				<EnumButtons<OfflineExportResolutionPresetId>
					options={OFFLINE_EXPORT_RESOLUTION_PRESETS.map(
						preset => preset.id
					)}
					value={resolutionId}
					onChange={onResolutionChange}
					disabled={busy}
					labels={Object.fromEntries(
						OFFLINE_EXPORT_RESOLUTION_PRESETS.map(preset => [
							preset.id,
							preset.label
						])
					)}
				/>
			</div>

			<div className="flex flex-col gap-1">
				<span
					className="text-xs"
					style={{ color: 'var(--editor-accent-soft)' }}
				>
					{t.offline_label_fps}
				</span>
				<EnumButtons<string>
					options={OFFLINE_EXPORT_FPS_OPTIONS.map(String)}
					value={String(fps)}
					onChange={value =>
						onFpsChange(Number(value) as OfflineExportFps)
					}
					disabled={busy}
				/>
			</div>

			<div className="grid grid-cols-2 gap-1 text-[11px] text-gray-400">
				<span>
					{t.offline_label_target}: {formatLabel}
				</span>
				<span>
					{t.offline_label_audio}: {offlineExportPlan.audio.label}
				</span>
			</div>

			{offlineExportVisibleIssues.map(issue => (
				<span
					key={issue.code}
					className={`text-[11px] ${
						issue.severity === 'blocker'
							? 'text-red-400'
							: issue.severity === 'warning'
								? 'text-yellow-400'
								: 'text-gray-500'
					}`}
				>
					{issueLabel(t, issue)}
				</span>
			))}

			{busy ? (
				<Button variant="warning" full onClick={onCancelExport}>
					{t.offline_btn_cancel}
				</Button>
			) : (
				<Button
					variant="primary"
					full
					disabled={!canStart}
					onClick={onStartExport}
				>
					{t.offline_btn_export_video}
				</Button>
			)}

			{busy || progress.phase === 'cancelled' ? (
				<div className="flex flex-col gap-1">
					{busy ? (
						<div
							className="h-2 w-full overflow-hidden rounded-full border"
							style={{
								borderColor: UI_COLORS.accentBorder,
								background: UI_COLORS.panel
							}}
						>
							<div
								className="h-full rounded-full transition-[width] duration-150"
								style={{
									background: UI_COLORS.accent,
									width: `${Math.max(
										2,
										Math.round(progress.ratio * 100)
									)}%`
								}}
							/>
						</div>
					) : null}
					{currentPhaseLabel ? (
						<span
							className="text-[11px]"
							style={{ color: UI_COLORS.accent }}
						>
							{currentPhaseLabel}
						</span>
					) : null}
				</div>
			) : null}

			{progress.phase === 'done' && savedFileName ? (
				<span className="text-[11px] text-green-400">
					{t.offline_done.replace('{name}', savedFileName)}
				</span>
			) : null}
			{error ? (
				<span className="text-[11px] text-red-400">
					{errorLabel(t, error)}
				</span>
			) : null}

			<button
				onClick={onAnalyzeOfflineAudio}
				disabled={!canAnalyzeOfflineAudio || busy}
				className="rounded border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
				style={{
					background: 'var(--editor-button-bg)',
					borderColor: 'var(--editor-button-border)',
					color: 'var(--editor-button-fg)'
				}}
			>
				{offlineAnalysisStatus === 'running'
					? t.offline_btn_analyzing
					: t.offline_btn_test_analysis}
			</button>
			{offlineAnalysisMessage ? (
				<span
					className={`text-[11px] ${
						offlineAnalysisStatus === 'ready'
							? 'text-green-400'
							: offlineAnalysisStatus === 'error'
								? 'text-red-400'
								: 'text-gray-400'
					}`}
				>
					{offlineAnalysisMessage}
				</span>
			) : null}
		</div>
	);
}
