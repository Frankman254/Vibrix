import { useState } from 'react';
import { Layers, Loader2, Play, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useDialog } from '@/editor/DialogProvider';
import { useT } from '@/lib/i18n';
import {
	analyzeImageUrl,
	getOrComputeSignature,
	clusterSignatures,
	requestSceneIntent,
	personalizeIntent,
	type SignatureCluster,
	type SignatureEntry,
	type BatchImageIntent,
	type SceneIntent
} from '../index';
import { Button, SectionCard, Slider, UI_COLORS, ICON_SIZE } from '@/ui';

/**
 * Batch flow — scenes for a whole image pool.
 *
 * The economics this UI exists to deliver: analysis is local and free, so every
 * image gets measured; clustering collapses the pool into a handful of groups;
 * and only one model call is made per group. Two hundred images cost roughly
 * eight calls, not two hundred — while each image still gets its own palette,
 * because the per-image intent is derived deterministically from its own
 * signature.
 *
 * Nothing is written until the user presses Apply, and the result is a single
 * store write (see `applyAiBatch`), so a batch they dislike is one undo.
 */

type Phase = 'idle' | 'analyzing' | 'asking' | 'ready' | 'applied';

type ClusterPlan = {
	cluster: SignatureCluster;
	intent: SceneIntent;
	source: 'model' | 'heuristic';
};

export default function AiBatchPanel() {
	const t = useT();
	const { confirm } = useDialog();
	const store = useWallpaperStore(
		useShallow(s => ({
			backgroundImages: s.backgroundImages,
			sceneSlots: s.sceneSlots,
			sceneServiceBaseUrl: s.sceneServiceBaseUrl,
			sceneServiceModel: s.sceneServiceModel,
			applyAiBatch: s.applyAiBatch
		}))
	);

	const [phase, setPhase] = useState<Phase>('idle');
	const [groupCount, setGroupCount] = useState(8);
	const [progress, setProgress] = useState({ done: 0, total: 0 });
	const [plans, setPlans] = useState<ClusterPlan[]>([]);
	const [note, setNote] = useState<string | null>(null);

	// Only images that can actually be analyzed and shown.
	const pool = store.backgroundImages.filter(
		image => image.enabled && (image.url || image.thumbnailUrl)
	);
	const busy = phase === 'analyzing' || phase === 'asking';

	async function handlePlan() {
		setPhase('analyzing');
		setNote(null);
		setPlans([]);
		setProgress({ done: 0, total: pool.length });

		const entries: SignatureEntry[] = [];
		for (const image of pool) {
			const url = image.url ?? image.thumbnailUrl;
			if (!url) continue;
			try {
				const signature = await getOrComputeSignature(
					image.assetId,
					() => analyzeImageUrl(url)
				);
				entries.push({ assetId: image.assetId, signature });
			} catch {
				// One unreadable image must not abort a 200-image run.
			}
			setProgress(current => ({ ...current, done: current.done + 1 }));
		}

		if (entries.length === 0) {
			setPhase('idle');
			setNote(t.ai_batch_no_images);
			return;
		}

		const clusters = clusterSignatures(entries, { k: groupCount });

		setPhase('asking');
		setProgress({ done: 0, total: clusters.length });

		const nextPlans: ClusterPlan[] = [];
		for (const cluster of clusters) {
			const image = store.backgroundImages.find(
				candidate =>
					candidate.assetId === cluster.representative.assetId
			);
			const result = await requestSceneIntent({
				signature: cluster.representative.signature,
				imageUrl: image?.url ?? image?.thumbnailUrl ?? null,
				baseUrl: store.sceneServiceBaseUrl,
				model: store.sceneServiceModel
			});
			nextPlans.push({
				cluster,
				intent: result.intent,
				source: result.source
			});
			setProgress(current => ({ ...current, done: current.done + 1 }));
		}

		setPlans(nextPlans);
		setPhase('ready');
	}

	async function handleApply() {
		const total = plans.reduce(
			(sum, plan) => sum + plan.cluster.members.length,
			0
		);
		// Binding scenes rewrites every image's sceneSlotId — destructive enough
		// to deserve a confirmation.
		const ok = await confirm({
			title: t.ai_batch_confirm_title,
			message: t.ai_batch_confirm_message
				.replace('{images}', String(total))
				.replace('{scenes}', String(plans.length)),
			confirmLabel: t.ai_batch_btn_apply,
			tone: 'warning'
		});
		if (!ok) return;

		const entries: BatchImageIntent[] = plans.flatMap(plan =>
			plan.cluster.members.map(member => ({
				assetId: member.assetId,
				clusterIndex: plan.cluster.index,
				// Each image gets the cluster's character re-grounded in its own
				// colours — this is what stops the pool looking repetitive.
				intent: personalizeIntent(plan.intent, member.signature)
			}))
		);

		const result = store.applyAiBatch(entries);
		setPhase('applied');
		setNote(
			result
				? t.ai_batch_applied
						.replace('{scenes}', String(result.scenes.length))
						.replace('{skipped}', String(result.skipped.length))
				: t.ai_batch_nothing
		);
		setPlans([]);
	}

	return (
		<SectionCard title={t.ai_batch_title} subtitle={t.ai_batch_subtitle}>
			<div className="flex flex-col gap-3">
				<p className="text-[11px]" style={{ color: UI_COLORS.fgMute }}>
					{t.ai_batch_pool.replace('{count}', String(pool.length))}
				</p>

				<Slider
					label={t.ai_batch_groups}
					hint={t.ai_batch_groups_hint}
					value={groupCount}
					onChange={setGroupCount}
					min={2}
					max={16}
					step={1}
					locked={busy}
				/>

				<div className="flex flex-wrap items-center gap-1.5">
					<Button
						type="button"
						size="sm"
						density="compact"
						variant="primary"
						onClick={handlePlan}
						disabled={busy || pool.length === 0}
						icon={
							busy ? (
								<Loader2
									size={ICON_SIZE.xs}
									className="animate-spin"
								/>
							) : (
								<Layers size={ICON_SIZE.xs} />
							)
						}
					>
						{phase === 'analyzing'
							? t.ai_batch_analyzing
							: phase === 'asking'
								? t.ai_batch_asking
								: t.ai_batch_btn_plan}
					</Button>

					{plans.length > 0 ? (
						<>
							<Button
								type="button"
								size="sm"
								density="compact"
								variant="primary"
								onClick={handleApply}
								icon={<Play size={ICON_SIZE.xs} />}
							>
								{t.ai_batch_btn_apply}
							</Button>
							<Button
								type="button"
								size="sm"
								density="compact"
								variant="secondary"
								onClick={() => {
									setPlans([]);
									setPhase('idle');
								}}
								icon={<X size={ICON_SIZE.xs} />}
							>
								{t.ai_btn_discard}
							</Button>
						</>
					) : null}
				</div>

				{busy && progress.total > 0 ? (
					<p
						className="text-[10px]"
						style={{ color: UI_COLORS.fgMute }}
					>
						{progress.done} / {progress.total}
					</p>
				) : null}

				{note ? (
					<p className="text-[11px]" style={{ color: UI_COLORS.ok }}>
						{note}
					</p>
				) : null}

				{plans.length > 0 ? (
					<div className="flex flex-col">
						{plans.map(plan => (
							<div
								key={plan.cluster.index}
								className="flex items-center gap-2 py-1.5"
								style={{
									borderTop: `1px solid ${UI_COLORS.hairline}`
								}}
							>
								<span
									className="w-10 shrink-0 text-[10px] tabular-nums"
									style={{ color: UI_COLORS.fgMute }}
								>
									×{plan.cluster.members.length}
								</span>
								<div className="flex shrink-0 items-center gap-1">
									{(
										[
											plan.intent.palette.primary,
											plan.intent.palette.secondary,
											plan.intent.palette.accent
										] as const
									).map(hex => (
										<span
											key={hex}
											className="h-3 w-3 rounded-sm"
											style={{
												background: hex,
												border: `1px solid ${UI_COLORS.hairline}`
											}}
										/>
									))}
								</div>
								<span
									className="min-w-0 flex-1 truncate text-[11px]"
									style={{ color: UI_COLORS.fg }}
								>
									{plan.intent.spectrumFamily} ·{' '}
									{plan.intent.spectrumShape} ·{' '}
									{plan.intent.looks}
								</span>
								<span
									className="shrink-0 text-[9px] uppercase"
									style={{
										color:
											plan.source === 'model'
												? UI_COLORS.accent
												: UI_COLORS.fgMute
									}}
								>
									{plan.source === 'model'
										? t.ai_source_model
										: t.ai_source_heuristic}
								</span>
							</div>
						))}
					</div>
				) : null}
			</div>
		</SectionCard>
	);
}
