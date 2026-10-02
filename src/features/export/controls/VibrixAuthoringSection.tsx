import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ListTree } from 'lucide-react';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useDialog } from '@/editor/DialogProvider';
import { Button, Caption, SectionCard, UI_COLORS } from '@/ui';
import {
	buildAuthoringManifestReport,
	type AuthoringManifestSource,
	type DroppedBindingWarning
} from '@/features/scenes/authoringManifest';
import {
	reviewVibrixScore,
	type ScoreCueStatus,
	type VibrixScoreReview
} from '@/features/composition/vibrixScore';
import {
	VibrixScoreLoadError,
	loadVibrixScoreFromFile
} from '@/features/composition/vibrixScoreLoader';
import {
	downloadBlobFallback,
	saveBlobWithPicker
} from '@/features/export/exportFileUtils';

/**
 * Vibrix's end of the Lyrixa composition loop: publish the catalogue, and read
 * back the score Lyrixa writes from it.
 *
 * Deliberately two buttons rather than a tab. Vibrix's job here is to *publish*
 * what exists and to *report* what a score would do; composing is Lyrixa's, and
 * granular timeline UI in here would be the same feature built twice.
 *
 * Importing a score only reviews it. It is not persisted either, and that is a
 * decision rather than an omission: nothing can play a score back until visual
 * state at time T stops depending on the path taken to reach it, so persisting
 * one now would mean a new store key, a `STORE_PERSIST_VERSION` bump and a
 * migration for data no code reads.
 */

const STATUS_LABEL_KEYS: Record<ScoreCueStatus, TranslationKey> = {
	ready: 'vibrix_authoring_status_ready',
	updated: 'vibrix_authoring_status_updated',
	missing: 'vibrix_authoring_status_missing',
	empty: 'vibrix_authoring_status_empty',
	'not-cueable': 'vibrix_authoring_status_not_cueable'
};

function statusColor(status: ScoreCueStatus): string {
	if (status === 'ready') return '#4ade80';
	if (status === 'updated') return '#facc15';
	return '#f87171';
}

function sanitize(value: string): string {
	return (
		value
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(/[^a-z0-9]+/gi, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.toLowerCase() || 'vibrix'
	);
}

function formatTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function VibrixAuthoringSection() {
	const t = useT();
	const { confirm } = useDialog();
	const scoreInputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const [tone, setTone] = useState<'muted' | 'ok' | 'error'>('muted');
	const [dropped, setDropped] = useState<DroppedBindingWarning[]>([]);
	const [review, setReview] = useState<VibrixScoreReview | null>(null);
	const [issues, setIssues] = useState<string[]>([]);

	// Exactly the banks the manifest is derived from. Subscribing to all of them
	// rather than a couple is the point: a summary that silently stops counting
	// after you edit Looks is worse than no summary. Each entry is a reference
	// check, so this costs one shallow compare per store write.
	const source = useWallpaperStore(
		useShallow(
			(state): AuthoringManifestSource => ({
				sceneSlots: state.sceneSlots,
				spectrumProfileSlots: state.spectrumProfileSlots,
				spectrumSecondProfileSlots: state.spectrumSecondProfileSlots,
				looksProfileSlots: state.looksProfileSlots,
				particlesProfileSlots: state.particlesProfileSlots,
				rainProfileSlots: state.rainProfileSlots,
				lightsProfileSlots: state.lightsProfileSlots,
				cameraFxProfileSlots: state.cameraFxProfileSlots,
				logoProfileSlots: state.logoProfileSlots,
				trackTitleProfileSlots: state.trackTitleProfileSlots,
				backgroundProfileSlots: state.backgroundProfileSlots,
				introProfileSlots: state.introProfileSlots
			})
		)
	);
	const summary = useMemo(() => {
		const { manifest } = buildAuthoringManifestReport(source, {
			exportedAt: '1970-01-01T00:00:00.000Z',
			projectName: 'preview'
		});
		return {
			slots: manifest.slots.length,
			scenes: manifest.slots.filter(slot => slot.family === 'scene')
				.length,
			revision: manifest.revision.slice(0, 8)
		};
	}, [source]);

	function resolveProjectName(): string {
		const state = useWallpaperStore.getState();
		const active = state.audioTracks.find(
			track => track.id === state.activeAudioTrackId
		);
		return active?.name || state.audioFileName || 'Vibrix project';
	}

	async function exportManifest() {
		setBusy(true);
		try {
			const projectName = resolveProjectName();
			const { manifest, droppedBindings } = buildAuthoringManifestReport(
				source,
				{ exportedAt: new Date().toISOString(), projectName }
			);
			setDropped(droppedBindings);
			const blob = new Blob([JSON.stringify(manifest, null, '\t')], {
				type: 'application/json'
			});
			const fileName = `${sanitize(projectName)}.vibrix-manifest.json`;
			const saved = await saveBlobWithPicker(blob, fileName, {
				description: 'Vibrix authoring manifest',
				mimeType: 'application/json'
			});
			if (!saved) downloadBlobFallback(blob, fileName);
			setTone('ok');
			setMessage(t.vibrix_authoring_exported);
		} catch {
			setTone('error');
			setMessage(t.vibrix_authoring_export_failed);
		} finally {
			setBusy(false);
		}
	}

	async function handleScoreFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		// Reading a score changes nothing, but the user cannot know that from a
		// button labelled "import", so say it before doing it.
		const go = await confirm({
			title: t.vibrix_authoring_dialog_import_title,
			message: t.vibrix_authoring_dialog_import_message,
			confirmLabel: t.vibrix_authoring_import_score,
			cancelLabel: t.label_cancel,
			tone: 'default'
		});
		if (!go) return;
		setBusy(true);
		setIssues([]);
		setReview(null);
		try {
			const { score } = await loadVibrixScoreFromFile(file);
			const { manifest } = buildAuthoringManifestReport(source, {
				exportedAt: new Date().toISOString(),
				projectName: resolveProjectName()
			});
			const result = reviewVibrixScore(score, manifest);
			setReview(result);
			setTone(result.readyCount === result.totalCount ? 'ok' : 'muted');
			setMessage(
				result.totalCount === 0
					? t.vibrix_authoring_score_no_cues
					: t.vibrix_authoring_score_summary
							.replace('{ready}', String(result.readyCount))
							.replace('{total}', String(result.totalCount))
			);
		} catch (error) {
			setTone('error');
			setMessage(
				error instanceof VibrixScoreLoadError
					? error.message
					: t.vibrix_authoring_score_invalid
			);
			if (error instanceof VibrixScoreLoadError) {
				setIssues(error.issues.slice(0, 6));
			}
		} finally {
			setBusy(false);
		}
	}

	const messageColor =
		tone === 'ok' ? '#4ade80' : tone === 'error' ? '#f87171' : undefined;

	return (
		<SectionCard
			title={t.vibrix_authoring_title}
			subtitle={t.vibrix_authoring_subtitle}
			action={<ListTree size={16} style={{ color: UI_COLORS.accent }} />}
		>
			<div className="flex flex-col gap-3">
				<Caption className="text-xs">
					{t.vibrix_authoring_catalog_summary
						.replace('{slots}', String(summary.slots))
						.replace('{scenes}', String(summary.scenes))
						.replace('{revision}', summary.revision)}
				</Caption>

				<div className="flex gap-2">
					<Button
						onClick={() => void exportManifest()}
						disabled={busy}
						size="sm"
						density="compact"
						variant="secondary"
						full
					>
						{t.vibrix_authoring_export}
					</Button>
					<Button
						onClick={() => scoreInputRef.current?.click()}
						disabled={busy}
						size="sm"
						density="compact"
						variant="secondary"
						full
					>
						{t.vibrix_authoring_import_score}
					</Button>
				</div>
				<input
					ref={scoreInputRef}
					type="file"
					accept=".json,application/json"
					className="hidden"
					onChange={event => void handleScoreFile(event)}
				/>

				{message ? (
					<span className="text-xs" style={{ color: messageColor }}>
						{message}
					</span>
				) : null}

				{dropped.length > 0 ? (
					<span className="text-xs" style={{ color: '#facc15' }}>
						{t.vibrix_authoring_dropped_bindings.replace(
							'{n}',
							String(dropped.length)
						)}
					</span>
				) : null}

				{issues.length > 0 ? (
					<ul className="flex flex-col gap-0.5">
						{issues.map(issue => (
							<li
								key={issue}
								className="text-[11px]"
								style={{ color: '#f87171' }}
							>
								{issue}
							</li>
						))}
					</ul>
				) : null}

				{review ? (
					<div
						className="flex flex-col gap-1.5 rounded border px-3 py-2"
						style={{
							borderColor: UI_COLORS.accentBorder,
							background: UI_COLORS.panel
						}}
					>
						<Caption className="text-[11px]">
							{review.catalogMatches
								? t.vibrix_authoring_catalog_match
								: t.vibrix_authoring_catalog_mismatch}
						</Caption>
						{review.unpublishedFamilies.length > 0 ? (
							<Caption className="text-[11px]">
								{t.vibrix_authoring_unpublished_families.replace(
									'{families}',
									review.unpublishedFamilies.join(', ')
								)}
							</Caption>
						) : null}
						{review.cues.map(cue => (
							<div
								key={cue.cueId}
								className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]"
							>
								<span className="text-gray-300">
									{formatTime(cue.startTimeMs)} ·{' '}
									{cue.slotName}
								</span>
								<span
									style={{ color: statusColor(cue.status) }}
								>
									{t[STATUS_LABEL_KEYS[cue.status]]}
								</span>
							</div>
						))}
						<Caption className="text-[11px]">
							{t.vibrix_authoring_playback_note}
						</Caption>
					</div>
				) : null}
			</div>
		</SectionCard>
	);
}
