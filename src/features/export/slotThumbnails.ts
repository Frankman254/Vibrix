/**
 * Slot thumbnails for the authoring manifest (V2.4a).
 *
 * Lyrixa's catalogue can only show what Vibrix publishes, and slots carried
 * no picture at all — sequencing a long audio meant guessing effects from two
 * initials and a bank name. The fix is *this* module: reuse the same offline
 * pipeline the video export uses (`renderFrameAt` over the registered
 * subsystems), projected through the same evaluator Compose itself resolves
 * with (`resolveVisualStateAt`). No second drawer is invented here: a
 * thumbnail is one export-quality frame with a demo drive signal, shrunk.
 *
 * One frame per slot, on a small canvas, sequentially, yielding to the UI.
 * A slot whose subsystem cannot draw (headless GL lost, 2D context gone) is
 * skipped, never fatal: the contract says a manifest stays valid without the
 * preview.
 */
import type { BackgroundPalette } from '@/lib/backgroundPalette';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { ResolvedAudioReactiveChannel } from '@/types/wallpaper';
import type { WallpaperState } from '@/types/wallpaper';
import { resolveVisualStateAt } from '@/features/composition/resolveVisualStateAt';
import type {
	CompositionCueV2,
	CompositionTargetV2,
	VibrixScoreEnvelope
} from '@/features/composition/vibrixScore';
import { getRenderStateSnapshot } from '@/features/export/getRenderStateSnapshot';
import { buildOfflineContext } from '@/features/export/buildRenderContext';
import { renderFrameAt } from '@/features/export/renderFrame';
import {
	createRenderScope,
	resetRenderScope,
	type RenderScope
} from '@/features/export/renderScope';
import {
	prepareAllRenderSubsystems,
	resetAllRenderSubsystems
} from '@/features/export/renderSubsystem';
import { installDefaultRenderSubsystems } from '@/features/export/renderSubsystems';
import {
	buildAuthoringManifestReport,
	type VibrixGranularFamily,
	type VibrixCueableSlotFamily,
	type VibrixManifestSlot
} from '@/features/scenes/authoringManifest';
import { EMPTY_REVISION } from '@/features/scenes/slotRevision';

/** Long edge of a slot preview. Contract: ~96–128 px, `data:image/...`. */
export const SLOT_THUMBNAIL_SIZE = 128;

/** WebP, quality 0.7 — the pool thumbnails' format (thumbnailUtils), so the
 *  manifest stays byte-comparable for Lyrixa's catalogue cache. */
const THUMBNAIL_MIME = 'image/webp';
const THUMBNAIL_QUALITY = 0.7;

/** A frame far enough past `intro-window`'s reach that the window never eats
 *  the preview; 1.2 s reads as "settled", not "fading in". */
const THUMBNAIL_TIME_MS = 1200;

/** One 30 fps step of simulated playback. Particles and rain integrate by
 *  `deltaMs`; at one frame they are near their seed, which is exactly the
 *  neutral pose a catalogue row should show. */
const THUMBNAIL_DELTA_MS = 33;

/** FFT bin count of the live analyser (fftSize 2048). Renderers index bins
 *  directly, so the demo signal must be the length they expect. */
const DEMO_BIN_COUNT = 1024;

const DEMO_CHANNELS: readonly ResolvedAudioReactiveChannel[] = [
	'full',
	'kick',
	'instrumental',
	'bass',
	'hihat',
	'vocal'
];

/**
 * A deterministic, music-shaped drive signal. Empty (silent) bins make the
 * spectrum collapse and particles freeze at zero energy, so a "preview" of
 * an effect would show nothing of it; this is an illustrative mid-song
 * frame, not a fake one — same choice any preset browser makes.
 */
function demoAudioSnapshot(): AudioSnapshot {
	const bins = new Uint8Array(DEMO_BIN_COUNT);
	for (let index = 0; index < DEMO_BIN_COUNT; index += 1) {
		// Bass-heavy tilt with a slow shimmer so neighbouring bars differ.
		const tilt = Math.exp(-index / 150);
		const shimmer = 0.75 + 0.25 * Math.sin(index * 0.35);
		bins[index] = Math.round(255 * tilt * shimmer);
	}
	const timeDomain = new Uint8Array(DEMO_BIN_COUNT);
	for (let index = 0; index < DEMO_BIN_COUNT; index += 1) {
		timeDomain[index] = Math.round(128 + 40 * Math.sin(index * 0.15));
	}
	const channels = Object.fromEntries(
		DEMO_CHANNELS.map(channel => [
			channel,
			channel === 'kick' ? 0.72 : 0.55
		])
	) as Record<ResolvedAudioReactiveChannel, number>;
	return {
		bins,
		timeDomain,
		amplitude: 0.6,
		peak: 0.7,
		channels,
		timestampMs: THUMBNAIL_TIME_MS
	};
}

/** A one-cue score: the slot active from t=0 on its family's own lane. */
function slotPreviewEnvelope(
	slot: VibrixManifestSlot,
	revision: string
): VibrixScoreEnvelope {
	// The filter upstream drops `intro-window` (the only family the score's
	// timeline kinds exclude), so this narrowing is the caller's invariant.
	const kind = slot.family as VibrixCueableSlotFamily;
	const target: CompositionTargetV2 =
		kind === 'scene'
			? { kind: 'scene', family: 'scene', id: slot.id, revision }
			: {
					kind: 'feature-slot',
					family: kind as VibrixGranularFamily,
					id: slot.id,
					revision
				};
	const cue: CompositionCueV2 = {
		id: `slot-preview-${slot.id}`,
		trackId: `track-slot-preview`,
		startTimeMs: 0,
		target,
		priority: 0,
		enabled: true
	};
	return {
		app: 'Lyrixa',
		exportKind: 'vibrix-score',
		schemaVersion: 2,
		exportedAt: '1970-01-01T00:00:00.000Z',
		projectName: 'slot-preview',
		sourceTrack: null,
		renderer: { minimumVersion: '0.0.0' },
		score: {
			tracks: [
				{
					id: 'track-slot-preview',
					name: kind,
					kind,
					order: 0,
					enabled: true,
					locked: false
				}
			],
			cues: [cue]
		},
		dependencies: []
	};
}

function yieldToUi(): Promise<void> {
	// Executor form: the project targets ES2022, which has no
	// `Promise.withResolvers` in its lib.
	return new Promise(resolve => window.setTimeout(resolve, 0));
}

/**
 * Render `thumbnailDataUrl` previews for every cueable, non-empty slot.
 *
 * The base is the *export-quality* snapshot (the same `getRenderStateSnapshot`
 * the video runner freezes), so a slot is drawn over the user's actual look —
 * background, palette, quality caps — exactly as a Compose cue placing it
 * would land on screen. Returns an id → data-URL map; slots that fail to draw
 * are absent, and an absent entry is a legal manifest.
 */
export async function renderSlotThumbnails(
	state: Readonly<WallpaperState>
): Promise<Map<string, string>> {
	const thumbnails = new Map<string, string>();
	if (typeof document === 'undefined') return thumbnails;

	// The manifest list is the authority for what is cueable and what counts
	// as empty — rebuilt here (pure, cheap) instead of duplicating its rules.
	const { manifest } = buildAuthoringManifestReport(state, {
		exportedAt: '1970-01-01T00:00:00.000Z',
		projectName: ''
	});
	// `slot.id` is typed `string`, but a profile persisted before slots carried
	// ids still has `id: undefined` on every row. Rendering those would key the
	// map under `undefined`, and `thumbnailFor` would then hand that single
	// image to every id-less slot — one effect's preview for all of them. An
	// id-less slot can't be referenced by a score cue anyway, so a preview for
	// it is meaningless; skipping it is correct, not a workaround.
	const renderable = manifest.slots.filter(
		slot =>
			typeof slot.id === 'string' &&
			slot.cueable &&
			slot.revision !== EMPTY_REVISION &&
			slot.family !== 'intro-window'
	);
	if (renderable.length === 0) return thumbnails;

	const canvas = document.createElement('canvas');
	canvas.width = SLOT_THUMBNAIL_SIZE;
	canvas.height = SLOT_THUMBNAIL_SIZE;
	const ctx2d = canvas.getContext('2d');
	if (!ctx2d) return thumbnails;

	const snapshot = getRenderStateSnapshot();
	const base = snapshot.state;
	const palette: BackgroundPalette = snapshot.palette;
	const audio = demoAudioSnapshot();

	installDefaultRenderSubsystems();
	// prepare() reads the live viewport once (point sizes are device pixels
	// scaled to it); without it the scene layers draw at the wrong density.
	await prepareAllRenderSubsystems(base);
	resetAllRenderSubsystems();
	const scope: RenderScope = createRenderScope();
	resetRenderScope(scope);

	for (let index = 0; index < renderable.length; index += 1) {
		const slot = renderable[index];
		try {
			const resolved = resolveVisualStateAt(
				base,
				slotPreviewEnvelope(slot, slot.revision),
				THUMBNAIL_TIME_MS
			);
			ctx2d.clearRect(0, 0, canvas.width, canvas.height);
			const ctx = buildOfflineContext({
				canvas,
				state: resolved,
				palette,
				audio,
				resolution: {
					width: SLOT_THUMBNAIL_SIZE,
					height: SLOT_THUMBNAIL_SIZE
				},
				timeMs: THUMBNAIL_TIME_MS,
				deltaMs: THUMBNAIL_DELTA_MS,
				scope
			});
			renderFrameAt(ctx);
			const url = canvas.toDataURL(THUMBNAIL_MIME, THUMBNAIL_QUALITY);
			if (url.startsWith('data:image/')) {
				thumbnails.set(slot.id, url);
			}
		} catch {
			// A slot that cannot paint is simply published without a preview.
			continue;
		}
		if (index % 4 === 3) await yieldToUi();
	}

	return thumbnails;
}
