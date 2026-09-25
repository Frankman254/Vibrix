import { useState } from 'react';
import { Sparkles, Undo2, Save, Loader2, ImageOff, Bot, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { resolveEditorImagePreviewUrl } from '@/lib/editorImagePreviews';
import {
	analyzeImageUrl,
	getOrComputeSignature,
	draftFromSignature,
	draftWithIntent,
	shouldApplySceneIntentResult,
	requestSceneIntent
} from '../index';
import AiIntentEditor from './AiIntentEditor';
import {
	Button,
	SectionCard,
	SectionDivider,
	TextInput,
	UI_COLORS,
	FONT,
	ICON_SIZE
} from '@/ui';

/**
 * AI Director — single-image flow.
 *
 * Deliberately three explicit steps (suggest → try on → save) rather than a
 * one-click "make it pretty". The generated look is applied to the live
 * wallpaper so it can be judged against the actual music, and nothing is
 * written until the user says so — the same "explicit apply, visible diff"
 * rule the Scene bindings follow.
 *
 * No model is involved here: the suggestion comes from the image's own
 * signature via the offline heuristic. The model-backed path replaces only
 * where the intent comes from.
 */

function Meter({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex items-center gap-2">
			<span
				className="w-16 shrink-0 text-[10px] uppercase tracking-wide"
				style={{ color: UI_COLORS.fgMute, fontFamily: FONT.ui }}
			>
				{label}
			</span>
			<div
				className="h-1.5 flex-1 overflow-hidden rounded-full"
				style={{ background: UI_COLORS.hairline }}
			>
				<div
					className="h-full rounded-full"
					style={{
						width: `${Math.round(value * 100)}%`,
						background: UI_COLORS.accent
					}}
				/>
			</div>
			<span
				className="w-8 shrink-0 text-right text-[10px] tabular-nums"
				style={{ color: UI_COLORS.fgMute }}
			>
				{Math.round(value * 100)}
			</span>
		</div>
	);
}

function Chip({ label, value }: { label: string; value: string }) {
	return (
		<div
			className="flex flex-col gap-0.5 rounded px-2 py-1"
			style={{ background: UI_COLORS.panel }}
		>
			<span
				className="text-[9px] uppercase tracking-wide"
				style={{ color: UI_COLORS.fgMute }}
			>
				{label}
			</span>
			<span className="text-[11px]" style={{ color: UI_COLORS.fg }}>
				{value}
			</span>
		</div>
	);
}

export default function AiDirectorPanel() {
	const t = useT();
	const store = useWallpaperStore(
		useShallow(s => ({
			backgroundImages: s.backgroundImages,
			activeImageId: s.activeImageId,
			editorImagePreviewQuality: s.editorImagePreviewQuality,
			sceneServiceBaseUrl: s.sceneServiceBaseUrl,
			sceneServiceModel: s.sceneServiceModel,
			aiDraft: s.aiDraft,
			aiPreviewActive: s.aiPreviewActive,
			previewAiDraft: s.previewAiDraft,
			revertAiPreview: s.revertAiPreview,
			discardAiDraft: s.discardAiDraft,
			commitAiDraft: s.commitAiDraft
		}))
	);

	const [busy, setBusy] = useState(false);
	const [asking, setAsking] = useState(false);
	const [cancellation, setCancellation] = useState<AbortController | null>(
		null
	);
	const [guidance, setGuidance] = useState('');
	const [fallbackReason, setFallbackReason] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [savedName, setSavedName] = useState<string | null>(null);

	const activeImage =
		store.backgroundImages.find(i => i.assetId === store.activeImageId) ??
		null;
	const previewUrl = resolveEditorImagePreviewUrl(
		activeImage,
		store.editorImagePreviewQuality
	);
	const draft = store.aiDraft;

	async function handleSuggest() {
		if (!activeImage) return;
		setBusy(true);
		setError(null);
		setSavedName(null);
		setFallbackReason(null);
		try {
			// The original URL is used rather than the editor thumbnail: the
			// thumbnail is a re-encoded webp and its palette is not the image's.
			const url = activeImage.url ?? activeImage.thumbnailUrl;
			if (!url) throw new Error('no-url');
			const signature = await getOrComputeSignature(
				activeImage.assetId,
				() => analyzeImageUrl(url)
			);
			store.previewAiDraft(
				draftFromSignature(signature, activeImage.assetId)
			);
		} catch {
			setError(t.ai_error_analyze);
		} finally {
			setBusy(false);
		}
	}

	/**
	 * Upgrade the current draft with a model-authored intent.
	 *
	 * Requires an existing draft, because the signature is what the request is
	 * built from — the model refines a concrete starting point rather than
	 * inventing a scene from nothing. A failure is not an error state: the
	 * client falls back to the offline heuristic and we say why.
	 *
	 * The model call takes tens of seconds with a local LLM, and in that
	 * window the user may have switched the preview to another image. A
	 * response that arrives at that point must not overwrite the draft the
	 * user is currently trying on, so the store is re-read on the way out:
	 * only apply when the draft is still the one the request was built from
	 * and its preview is still on screen (`shouldApplySceneIntentResult`).
	 */
	async function handleAskModel() {
		const current = store.aiDraft;
		if (!current?.signature || !activeImage) return;
		const assetIdAtRequest = current.assetId ?? activeImage.assetId;
		const controller = new AbortController();
		setCancellation(controller);
		setAsking(true);
		setError(null);
		try {
			const result = await requestSceneIntent({
				signature: current.signature,
				imageUrl: activeImage.url ?? activeImage.thumbnailUrl,
				guidance: guidance.trim() || undefined,
				signal: controller.signal,
				baseUrl: store.sceneServiceBaseUrl,
				model: store.sceneServiceModel
			});
			const fresh = useWallpaperStore.getState();
			if (!shouldApplySceneIntentResult(assetIdAtRequest, fresh)) {
				// Stale answer: the user moved on (new image / preview off).
				// Silently discard rather than clobbering what is on screen.
				return;
			}
			setFallbackReason(
				result.source === 'heuristic'
					? (result.fallbackReason ?? '')
					: null
			);
			store.previewAiDraft(
				draftWithIntent(current, result.intent, result.source)
			);
		} finally {
			setAsking(false);
			setCancellation(null);
		}
	}

	/** Cancel the in-flight model request, if any. */
	function handleCancelAsk() {
		cancellation?.abort();
	}

	function handleSave() {
		const name = t.ai_scene_name_prefix;
		const result = store.commitAiDraft(name);
		setSavedName(result ? name : null);
		if (!result) setError(t.ai_error_save);
	}

	return (
		<SectionCard
			title={t.ai_section_title}
			subtitle={t.ai_section_subtitle}
		>
			{!activeImage ? (
				<div
					className="flex items-center gap-2 py-3 text-[11px]"
					style={{ color: UI_COLORS.fgMute }}
				>
					<ImageOff size={ICON_SIZE.sm} />
					{t.ai_no_image}
				</div>
			) : (
				<div className="flex flex-col gap-3">
					<div className="flex items-start gap-3">
						{previewUrl ? (
							<img
								src={previewUrl}
								alt=""
								className="h-16 w-16 shrink-0 rounded object-cover"
								style={{
									border: `1px solid ${UI_COLORS.hairline}`
								}}
							/>
						) : null}
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<span
								className="truncate text-[11px]"
								style={{ color: UI_COLORS.fg }}
							>
								{activeImage.originalFileName ??
									activeImage.assetId}
							</span>
							<Button
								type="button"
								size="sm"
								density="compact"
								variant="primary"
								onClick={handleSuggest}
								disabled={busy}
								icon={
									busy ? (
										<Loader2
											size={ICON_SIZE.xs}
											className="animate-spin"
										/>
									) : (
										<Sparkles size={ICON_SIZE.xs} />
									)
								}
							>
								{busy ? t.ai_btn_analyzing : t.ai_btn_suggest}
							</Button>
						</div>
					</div>

					{error ? (
						<p
							className="text-[11px]"
							style={{ color: UI_COLORS.danger }}
						>
							{error}
						</p>
					) : null}

					{savedName ? (
						<p
							className="text-[11px]"
							style={{ color: UI_COLORS.ok }}
						>
							{t.ai_saved.replace('{name}', savedName)}
						</p>
					) : null}

					{draft ? (
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-1.5">
								<Meter
									label={t.ai_axis_energy}
									value={draft.intent.energy}
								/>
								<Meter
									label={t.ai_axis_weight}
									value={draft.intent.weight}
								/>
								<Meter
									label={t.ai_axis_motion}
									value={draft.intent.motion}
								/>
							</div>

							<div className="grid grid-cols-3 gap-1.5">
								<Chip
									label={t.ai_chip_spectrum}
									value={`${draft.intent.spectrumFamily} · ${draft.intent.spectrumShape}`}
								/>
								<Chip
									label={t.ai_chip_particles}
									value={draft.intent.particles}
								/>
								<Chip
									label={t.ai_chip_looks}
									value={draft.intent.looks}
								/>
								<Chip
									label={t.ai_chip_lights}
									value={draft.intent.lights}
								/>
								<Chip
									label={t.ai_chip_rain}
									value={draft.intent.rain}
								/>
								<Chip
									label={t.ai_chip_mode}
									value={draft.intent.spectrumMode}
								/>
							</div>

							<div className="flex items-center gap-1.5">
								{(
									[
										draft.intent.palette.primary,
										draft.intent.palette.secondary,
										draft.intent.palette.accent
									] as const
								).map(hex => (
									<span
										key={hex}
										title={hex}
										className="h-5 w-5 rounded"
										style={{
											background: hex,
											border: `1px solid ${UI_COLORS.hairline}`
										}}
									/>
								))}
								{draft.signature?.isPixelArt ? (
									<span
										className="ml-1 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
										style={{
											background: UI_COLORS.panel,
											color: UI_COLORS.fgMute
										}}
									>
										{t.ai_badge_pixel_art}
									</span>
								) : null}
							</div>

							<div className="flex items-center gap-2">
								<span
									className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
									style={{
										background: UI_COLORS.panel,
										color:
											draft.source === 'model'
												? UI_COLORS.accent
												: UI_COLORS.fgMute
									}}
								>
									{draft.source === 'model'
										? t.ai_source_model
										: t.ai_source_heuristic}
								</span>
							</div>

							{fallbackReason !== null ? (
								<p
									className="text-[10px]"
									style={{ color: UI_COLORS.warn }}
								>
									{t.ai_fallback_notice.replace(
										'{reason}',
										fallbackReason || '—'
									)}
								</p>
							) : null}

							{draft.intent.rationale ? (
								<p
									className="text-[10px] leading-relaxed"
									style={{ color: UI_COLORS.fgMute }}
								>
									{draft.intent.rationale}
								</p>
							) : null}

							<div className="flex items-center gap-1.5">
								<TextInput
									value={guidance}
									onChange={event =>
										setGuidance(event.target.value)
									}
									placeholder={t.ai_guidance_placeholder}
									size="sm"
								/>
								<Button
									type="button"
									size="sm"
									density="compact"
									variant="secondary"
									onClick={handleAskModel}
									disabled={asking}
									icon={
										asking ? (
											<Loader2
												size={ICON_SIZE.xs}
												className="animate-spin"
											/>
										) : (
											<Bot size={ICON_SIZE.xs} />
										)
									}
								>
									{asking
										? t.ai_btn_asking
										: t.ai_btn_ask_model}
								</Button>
								{asking && (
									<Button
										type="button"
										size="sm"
										density="compact"
										variant="ghost"
										onClick={handleCancelAsk}
										icon={<X size={ICON_SIZE.xs} />}
									>
										{t.ai_btn_cancel_ask}
									</Button>
								)}
							</div>

							<SectionDivider label={t.ai_section_tuning} />
							<AiIntentEditor />

							<div className="flex flex-wrap items-center gap-1.5">
								<Button
									type="button"
									size="sm"
									density="compact"
									variant="primary"
									onClick={handleSave}
									icon={<Save size={ICON_SIZE.xs} />}
								>
									{t.ai_btn_save}
								</Button>
								<Button
									type="button"
									size="sm"
									density="compact"
									variant="secondary"
									onClick={() => store.discardAiDraft()}
									icon={<Undo2 size={ICON_SIZE.xs} />}
								>
									{t.ai_btn_discard}
								</Button>
								{!store.aiPreviewActive ? (
									<Button
										type="button"
										size="sm"
										density="compact"
										variant="secondary"
										onClick={() => store.previewAiDraft()}
									>
										{t.ai_btn_preview}
									</Button>
								) : null}
							</div>

							<p
								className="text-[10px] leading-relaxed"
								style={{ color: UI_COLORS.fgMute }}
							>
								{store.aiPreviewActive
									? t.ai_hint_previewing
									: t.ai_hint_not_previewing}
							</p>
						</div>
					) : null}
				</div>
			)}
		</SectionCard>
	);
}
