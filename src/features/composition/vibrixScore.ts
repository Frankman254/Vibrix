import {
	VIBRIX_SLOT_FAMILIES,
	type VibrixAuthoringManifest,
	type VibrixSlotFamily
} from '@/features/scenes/authoringManifest';

/**
 * The other direction of the authoring contract: read the score Lyrixa writes.
 *
 * Contract: `docs/features/VIBRIX_AUTHORING_CONTRACT.md`. The producer is
 * `Lyrixa/src/core/composition/score.ts`.
 *
 * This module only **understands** a score. It does not evaluate one — turning
 * a score into the frame at time T needs `resolveVisualStateAt(base, score, T)`
 * and a visual state that does not depend on the path taken to reach it, which
 * is Phase C. Reviewing first is not busywork: it is what tells the user
 * whether the file they just made in Lyrixa still matches this project, and it
 * is the only part that can be built honestly today.
 *
 * Pure: no store, no clock, no network. Validation never throws on bad input —
 * it returns readable errors, the same way `lyricsBundleLoader` does.
 */

export type CompositionTransitionType = 'cut' | 'crossfade' | 'morph';
export type CompositionEasing =
	| 'linear'
	| 'ease-in'
	| 'ease-out'
	| 'ease-in-out';

export interface CompositionTrack {
	id: string;
	name: string;
	kind: VibrixSlotFamily;
	order: number;
	enabled: boolean;
	locked: boolean;
}

export interface CompositionCue {
	id: string;
	trackId: string;
	startTimeMs: number;
	endTimeMs: number;
	target: {
		kind: 'scene' | 'feature-slot';
		family?: VibrixSlotFamily;
		slotId: string;
		/** The revision the slot had when the cue was authored. */
		slotRevision: string;
	};
	transition?: {
		type: CompositionTransitionType;
		durationMs: number;
		easing: CompositionEasing;
	};
	priority: number;
	enabled: boolean;
}

export interface CompositionScore {
	tracks: CompositionTrack[];
	cues: CompositionCue[];
}

export interface VibrixScoreDependency {
	slotId: string;
	family: VibrixSlotFamily;
	name: string;
	revision: string;
}

export interface VibrixScoreEnvelope {
	app: 'Lyrixa';
	exportKind: 'vibrix-score';
	schemaVersion: 1;
	exportedAt: string;
	projectName: string;
	sourceTrack: {
		fileName: string;
		durationMs: number;
		fileKey?: string;
	} | null;
	renderer: {
		minimumVersion: string;
		sourceProjectId?: string;
		catalogRevision?: string;
	};
	score: CompositionScore;
	dependencies: VibrixScoreDependency[];
}

export type VibrixScoreParseResult =
	| { ok: true; score: VibrixScoreEnvelope; errors: [] }
	| { ok: false; score: null; errors: string[] };

const FAMILIES = new Set<string>(VIBRIX_SLOT_FAMILIES);
const TRANSITION_TYPES = new Set(['cut', 'crossfade', 'morph']);
const EASINGS = new Set(['linear', 'ease-in', 'ease-out', 'ease-in-out']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
	source: Record<string, unknown>,
	key: string,
	errors: string[],
	prefix: string
): void {
	const value = source[key];
	if (typeof value !== 'string' || value.length === 0) {
		errors.push(`${prefix}.${key} must be a non-empty string.`);
	}
}

function integer(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.round(value)
		: fallback;
}

export function parseVibrixScoreEnvelope(
	input: unknown
): VibrixScoreParseResult {
	const errors: string[] = [];
	if (!isRecord(input)) {
		return {
			ok: false,
			score: null,
			errors: ['A score must be a JSON object.']
		};
	}
	if (input.app !== 'Lyrixa') errors.push('score.app must be "Lyrixa".');
	if (input.exportKind !== 'vibrix-score') {
		errors.push('score.exportKind must be "vibrix-score".');
	}
	if (input.schemaVersion !== 1)
		errors.push('score.schemaVersion must be 1.');
	requireString(input, 'exportedAt', errors, 'score');
	requireString(input, 'projectName', errors, 'score');

	const renderer = isRecord(input.renderer) ? input.renderer : null;
	if (!renderer) {
		errors.push('score.renderer must be an object.');
	} else {
		requireString(renderer, 'minimumVersion', errors, 'score.renderer');
	}

	let sourceTrack: VibrixScoreEnvelope['sourceTrack'] = null;
	if (input.sourceTrack !== null && input.sourceTrack !== undefined) {
		if (!isRecord(input.sourceTrack)) {
			errors.push('score.sourceTrack must be an object or null.');
		} else {
			requireString(
				input.sourceTrack,
				'fileName',
				errors,
				'score.sourceTrack'
			);
			const durationMs = integer(input.sourceTrack.durationMs, -1);
			if (durationMs < 0) {
				errors.push(
					'score.sourceTrack.durationMs must be a non-negative number.'
				);
			}
			const fileKey = input.sourceTrack.fileKey;
			sourceTrack = {
				fileName: String(input.sourceTrack.fileName ?? ''),
				durationMs: Math.max(0, durationMs),
				...(typeof fileKey === 'string' && fileKey ? { fileKey } : {})
			};
		}
	}

	const scoreBody = isRecord(input.score) ? input.score : null;
	const tracks: CompositionTrack[] = [];
	const cues: CompositionCue[] = [];
	if (!scoreBody) {
		errors.push('score.score must be an object.');
	} else {
		parseTracks(scoreBody.tracks, tracks, errors);
		const trackIds = new Set(tracks.map(track => track.id));
		parseCues(scoreBody.cues, trackIds, cues, errors);
	}

	const dependencies: VibrixScoreDependency[] = [];
	if (input.dependencies !== undefined) {
		if (!Array.isArray(input.dependencies)) {
			errors.push('score.dependencies must be an array when present.');
		} else {
			input.dependencies.forEach((raw, index) => {
				const path = `score.dependencies[${index}]`;
				if (!isRecord(raw)) {
					errors.push(`${path} must be an object.`);
					return;
				}
				const before = errors.length;
				requireString(raw, 'slotId', errors, path);
				requireString(raw, 'name', errors, path);
				requireString(raw, 'revision', errors, path);
				if (
					typeof raw.family !== 'string' ||
					!FAMILIES.has(raw.family)
				) {
					errors.push(`${path}.family is not a Vibrix slot family.`);
				}
				if (errors.length !== before) return;
				dependencies.push({
					slotId: raw.slotId as string,
					family: raw.family as VibrixSlotFamily,
					name: raw.name as string,
					revision: raw.revision as string
				});
			});
		}
	}

	if (errors.length > 0) return { ok: false, score: null, errors };
	const checkedRenderer = renderer as Record<string, unknown>;
	return {
		ok: true,
		errors: [],
		score: {
			app: 'Lyrixa',
			exportKind: 'vibrix-score',
			schemaVersion: 1,
			exportedAt: input.exportedAt as string,
			projectName: input.projectName as string,
			sourceTrack,
			renderer: {
				minimumVersion: checkedRenderer.minimumVersion as string,
				...(typeof checkedRenderer.sourceProjectId === 'string'
					? {
							sourceProjectId:
								checkedRenderer.sourceProjectId as string
						}
					: {}),
				...(typeof checkedRenderer.catalogRevision === 'string'
					? {
							catalogRevision:
								checkedRenderer.catalogRevision as string
						}
					: {})
			},
			score: { tracks, cues },
			dependencies
		}
	};
}

function parseTracks(
	raw: unknown,
	out: CompositionTrack[],
	errors: string[]
): void {
	if (!Array.isArray(raw)) {
		errors.push('score.score.tracks must be an array.');
		return;
	}
	const ids = new Set<string>();
	raw.forEach((entry, index) => {
		const path = `score.score.tracks[${index}]`;
		if (!isRecord(entry)) {
			errors.push(`${path} must be an object.`);
			return;
		}
		const before = errors.length;
		requireString(entry, 'id', errors, path);
		requireString(entry, 'name', errors, path);
		if (typeof entry.kind !== 'string' || !FAMILIES.has(entry.kind)) {
			// The honest failure mode for a family this build does not know —
			// `motion`, for instance, which no longer exists.
			errors.push(
				`${path}.kind "${String(entry.kind)}" is not a Vibrix slot family.`
			);
		}
		if (errors.length !== before) return;
		const id = entry.id as string;
		if (ids.has(id)) {
			errors.push(`${path}.id duplicates "${id}".`);
			return;
		}
		ids.add(id);
		out.push({
			id,
			name: entry.name as string,
			kind: entry.kind as VibrixSlotFamily,
			order: integer(entry.order, index),
			enabled: entry.enabled !== false,
			locked: entry.locked === true
		});
	});
}

function parseCues(
	raw: unknown,
	trackIds: ReadonlySet<string>,
	out: CompositionCue[],
	errors: string[]
): void {
	if (!Array.isArray(raw)) {
		errors.push('score.score.cues must be an array.');
		return;
	}
	const ids = new Set<string>();
	raw.forEach((entry, index) => {
		const path = `score.score.cues[${index}]`;
		if (!isRecord(entry)) {
			errors.push(`${path} must be an object.`);
			return;
		}
		const before = errors.length;
		requireString(entry, 'id', errors, path);
		requireString(entry, 'trackId', errors, path);
		if (!isRecord(entry.target)) {
			errors.push(`${path}.target must be an object.`);
		} else {
			requireString(entry.target, 'slotId', errors, `${path}.target`);
			requireString(
				entry.target,
				'slotRevision',
				errors,
				`${path}.target`
			);
			const family = entry.target.family;
			if (family !== undefined && !FAMILIES.has(String(family))) {
				errors.push(
					`${path}.target.family "${String(family)}" is not a Vibrix slot family.`
				);
			}
		}
		const start = integer(entry.startTimeMs, -1);
		const end = integer(entry.endTimeMs, -1);
		if (start < 0) errors.push(`${path}.startTimeMs must be >= 0.`);
		if (end <= start) {
			errors.push(`${path}.endTimeMs must be greater than startTimeMs.`);
		}
		if (errors.length !== before) return;
		const id = entry.id as string;
		if (ids.has(id)) {
			errors.push(`${path}.id duplicates "${id}".`);
			return;
		}
		const trackId = entry.trackId as string;
		if (!trackIds.has(trackId)) {
			errors.push(`${path}.trackId "${trackId}" has no track.`);
			return;
		}
		ids.add(id);
		const target = entry.target as Record<string, unknown>;
		const transition = isRecord(entry.transition)
			? {
					type: (TRANSITION_TYPES.has(String(entry.transition.type))
						? entry.transition.type
						: 'cut') as CompositionTransitionType,
					durationMs: Math.max(
						0,
						integer(entry.transition.durationMs, 0)
					),
					easing: (EASINGS.has(String(entry.transition.easing))
						? entry.transition.easing
						: 'linear') as CompositionEasing
				}
			: undefined;
		out.push({
			id,
			trackId,
			startTimeMs: start,
			endTimeMs: end,
			target: {
				kind: target.kind === 'feature-slot' ? 'feature-slot' : 'scene',
				...(typeof target.family === 'string'
					? { family: target.family as VibrixSlotFamily }
					: {}),
				slotId: target.slotId as string,
				slotRevision: target.slotRevision as string
			},
			...(transition ? { transition } : {}),
			priority: integer(entry.priority, 0),
			enabled: entry.enabled !== false
		});
	});
}

/**
 * What a cue means for *this* project right now.
 *
 * `updated` is the interesting one: the slot is still here but its contents
 * moved since the cue was authored, so the cue will not look the way it did in
 * Lyrixa. That is precisely the case a silent import would hide.
 */
export type ScoreCueStatus =
	| 'ready'
	| 'updated'
	| 'missing'
	| 'empty'
	| 'not-cueable';

export interface ScoreCueReview {
	cueId: string;
	trackName: string;
	family: VibrixSlotFamily | null;
	slotId: string;
	/** The name in this project, falling back to the one the score recorded. */
	slotName: string;
	status: ScoreCueStatus;
	startTimeMs: number;
	endTimeMs: number;
}

export interface VibrixScoreReview {
	cues: ScoreCueReview[];
	counts: Record<ScoreCueStatus, number>;
	/** Families the score uses that this build publishes no slots for. */
	unpublishedFamilies: VibrixSlotFamily[];
	/** True when the catalogue the score was written against is this one. */
	catalogMatches: boolean;
	readyCount: number;
	totalCount: number;
}

export function reviewVibrixScore(
	envelope: VibrixScoreEnvelope,
	manifest: VibrixAuthoringManifest
): VibrixScoreReview {
	const slotById = new Map(manifest.slots.map(slot => [slot.id, slot]));
	const trackById = new Map(
		envelope.score.tracks.map(track => [track.id, track])
	);
	const dependencyById = new Map(
		envelope.dependencies.map(entry => [entry.slotId, entry])
	);
	const publishedFamilies = new Set(manifest.slots.map(slot => slot.family));
	const counts: Record<ScoreCueStatus, number> = {
		ready: 0,
		updated: 0,
		missing: 0,
		empty: 0,
		'not-cueable': 0
	};

	const cues = envelope.score.cues.map<ScoreCueReview>(cue => {
		const track = trackById.get(cue.trackId);
		const published = slotById.get(cue.target.slotId);
		const recorded = dependencyById.get(cue.target.slotId);
		const status: ScoreCueStatus = !published
			? 'missing'
			: !published.cueable
				? 'not-cueable'
				: published.revision === 'empty'
					? 'empty'
					: published.revision === cue.target.slotRevision
						? 'ready'
						: 'updated';
		counts[status] += 1;
		return {
			cueId: cue.id,
			trackName: track?.name ?? cue.trackId,
			family: published?.family ?? cue.target.family ?? null,
			slotId: cue.target.slotId,
			slotName: published?.name ?? recorded?.name ?? cue.target.slotId,
			status,
			startTimeMs: cue.startTimeMs,
			endTimeMs: cue.endTimeMs
		};
	});

	const unpublishedFamilies = [
		...new Set(
			envelope.score.tracks
				.map(track => track.kind)
				.filter(kind => !publishedFamilies.has(kind))
		)
	];

	return {
		cues,
		counts,
		unpublishedFamilies,
		catalogMatches:
			envelope.renderer.catalogRevision === undefined
				? false
				: envelope.renderer.catalogRevision === manifest.revision,
		readyCount: counts.ready,
		totalCount: cues.length
	};
}
