import { Button, Caption, UI_COLORS } from '@/ui';
import ToggleControl from '@/editor/ToggleControl';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';
import {
	PROJECT_EXPORT_SECTION_ORDER,
	type ProjectExportSectionId,
	type ProjectExportSelection
} from '@/features/export/projectExportSelection';

const PROJECT_EXPORT_SECTION_LABEL_KEYS: Record<
	ProjectExportSectionId,
	TranslationKey
> = {
	backgrounds: 'project_export_section_backgrounds',
	spectrum: 'project_export_section_spectrum',
	logo: 'project_export_section_logo',
	overlays: 'project_export_section_overlays',
	motion: 'project_export_section_motion',
	looks: 'project_export_section_looks',
	track: 'project_export_section_track',
	lyrics: 'project_export_section_lyrics',
	intro: 'project_export_section_intro',
	audio: 'project_export_section_audio',
	editor: 'project_export_section_editor'
};

type ProjectStatus = 'idle' | 'saved' | 'imported' | 'warning' | 'error';
type ProjectBusyMode = 'idle' | 'exporting' | 'importing';

type ProjectPackageSectionProps = {
	projectStatus: ProjectStatus;
	projectLabel: string;
	projectMessage: string;
	projectBusyMode: ProjectBusyMode;
	projectProgress: number;
	projectProgressLabel: string;
	projectExportSelection: ProjectExportSelection;
	enabledProjectExportSectionCount: number;
	hintProjectPackage: string;
	hintProjectPackageAudio: string;
	exportProjectLabel: string;
	importProjectLabel: string;
	onApplyPreset: (
		preset: 'all' | 'no-images' | 'spectrum-only' | 'logo-only'
	) => void;
	onSetSection: (sectionId: ProjectExportSectionId, value: boolean) => void;
	onExportProject: () => void;
	onImportProject: () => void;
};

function statusClass(status: ProjectStatus): string {
	if (status === 'saved' || status === 'imported') return 'text-green-400';
	if (status === 'warning') return 'text-yellow-400';
	if (status === 'error') return 'text-red-500';
	return 'text-cyan-400';
}

export default function ProjectPackageSection({
	projectStatus,
	projectLabel,
	projectMessage,
	projectBusyMode,
	projectProgress,
	projectProgressLabel,
	projectExportSelection,
	enabledProjectExportSectionCount,
	hintProjectPackage,
	hintProjectPackageAudio,
	exportProjectLabel,
	importProjectLabel,
	onApplyPreset,
	onSetSection,
	onExportProject,
	onImportProject
}: ProjectPackageSectionProps) {
	const t = useT();
	const disabled = projectBusyMode !== 'idle';

	return (
		<>
			<div className="flex flex-col gap-1">
				<span className={`text-xs ${statusClass(projectStatus)}`}>
					{projectLabel}
				</span>
				<Caption className="text-xs">{hintProjectPackage}</Caption>
				<Caption className="text-xs">{hintProjectPackageAudio}</Caption>
				<Caption className="text-xs">
					{t.project_pkg_selective_caption}
				</Caption>
				{projectMessage ? (
					<span
						className={`text-xs ${
							projectStatus === 'error'
								? 'text-red-500'
								: 'text-gray-400'
						}`}
					>
						{projectMessage}
					</span>
				) : null}
				{projectBusyMode !== 'idle' ? (
					<div className="mt-1 flex flex-col gap-1">
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
										4,
										Math.round(projectProgress * 100)
									)}%`
								}}
							/>
						</div>
						<span
							className="text-[11px]"
							style={{ color: UI_COLORS.accent }}
						>
							{projectProgressLabel}
						</span>
					</div>
				) : null}
			</div>

			<div
				className="flex flex-col gap-2 rounded border px-3 py-2"
				style={{
					borderColor: UI_COLORS.accentBorder,
					background: UI_COLORS.panel
				}}
			>
				<div className="flex flex-wrap gap-1.5">
					<Button
						onClick={() => onApplyPreset('all')}
						disabled={disabled}
						size="sm"
						density="compact"
						variant="secondary"
					>
						{t.project_pkg_preset_full}
					</Button>
					<Button
						onClick={() => onApplyPreset('no-images')}
						disabled={disabled}
						size="sm"
						density="compact"
						variant="secondary"
					>
						{t.project_pkg_preset_no_images}
					</Button>
					<Button
						onClick={() => onApplyPreset('spectrum-only')}
						disabled={disabled}
						size="sm"
						density="compact"
						variant="secondary"
					>
						{t.project_pkg_preset_spectrum_only}
					</Button>
					<Button
						onClick={() => onApplyPreset('logo-only')}
						disabled={disabled}
						size="sm"
						density="compact"
						variant="secondary"
					>
						{t.project_pkg_preset_logo_only}
					</Button>
				</div>
				<div className="grid gap-2 md:grid-cols-2">
					{PROJECT_EXPORT_SECTION_ORDER.map(sectionId => (
						<ToggleControl
							key={sectionId}
							label={
								t[PROJECT_EXPORT_SECTION_LABEL_KEYS[sectionId]]
							}
							value={projectExportSelection[sectionId]}
							onChange={value => onSetSection(sectionId, value)}
						/>
					))}
				</div>
				<Caption className="text-[11px]">
					{t.project_pkg_enabled_modules
						.replace(
							'{n}',
							String(enabledProjectExportSectionCount)
						)
						.replace(
							'{total}',
							String(PROJECT_EXPORT_SECTION_ORDER.length)
						)}
				</Caption>
			</div>

			<div className="flex gap-2">
				<Button
					onClick={onExportProject}
					disabled={
						disabled || enabledProjectExportSectionCount === 0
					}
					size="sm"
					density="compact"
					variant="secondary"
					full
				>
					{exportProjectLabel}
				</Button>
				<Button
					onClick={onImportProject}
					disabled={disabled}
					size="sm"
					density="compact"
					variant="secondary"
					full
				>
					{importProjectLabel}
				</Button>
			</div>
		</>
	);
}
