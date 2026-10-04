import {
	VIBRIX_SLOT_FAMILIES,
	type VibrixAuthoringManifest,
	type VibrixManifestImage,
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

export type VibrixTimelineKind = VibrixSlotFamily | 'image';

export interface CompositionTrack {
	id: string;
	name: string;
	kind: VibrixTimelineKind;
	order: number;
	enabled: boolean;
	locked: boolean;
}

export interface CompositionCueV1 {
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

export type CompositionTargetV2 =
	| {
			kind: 'scene' | 'feature-slot';
			family: VibrixSlotFamily;
			id: string;
			revision: string;
	  }
	| { kind: 'image'; family: 'image'; id: string; revision: string }
	| { kind: 'inherit'; family: VibrixSlotFamily };

export interface CompositionCueV2 {
	id: string;
	trackId: string;
	startTimeMs: number;
	target: CompositionTargetV2;
	/** V2 transitions are owned by the prepared Vibrix object. */
	transition?: undefined;
	priority: number;
	enabled: boolean;
}

export type CompositionCue = CompositionCueV1 | CompositionCueV2;

export interface CompositionScore {
	tracks: CompositionTrack[];
	cues: CompositionCue[];
}

export interface VibrixScoreDependencyV1 {
	slotId: string;
	family: VibrixSlotFamily;
	name: string;
	revision: string;
}

export interface VibrixScoreDependencyV2 {
	kind: 'slot' | 'image';
	id: string;
	family: VibrixTimelineKind;
	name: string;
	revision: string;
}

export type VibrixScoreDependency =
	| VibrixScoreDependencyV1
	| VibrixScoreDependencyV2;

export interface VibrixScoreEnvelope {
	app: 'Lyrixa';
	exportKind: 'vibrix-score';
	schemaVersion: 1 | 2;
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
const TIMELINE_KINDS = new Set<string>([...VIBRIX_SLOT_FAMILIES, 'image']);
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
	const schemaVersion = input.schemaVersion === 2 ? 2 : 1;
	if (input.schemaVersion !== 1 && input.schemaVersion !== 2) {
		errors.push('score.schemaVersion must be 1 or 2.');
	}
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
		parseTracks(scoreBody.tracks, schemaVersion, tracks, errors);
		const trackById = new Map(tracks.map(track => [track.id, track]));
		parseCues(scoreBody.cues, schemaVersion, trackById, cues, errors);
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
				requireString(
					raw,
					schemaVersion === 1 ? 'slotId' : 'id',
					errors,
					path
				);
				requireString(raw, 'name', errors, path);
				requireString(raw, 'revision', errors, path);
				if (
					typeof raw.family !== 'string' ||
					!(schemaVersion === 1 ? FAMILIES : TIMELINE_KINDS).has(
						raw.family
					)
				) {
					errors.push(
						`${path}.family is not a Vibrix timeline kind.`
					);
				}
				if (errors.length !== before) return;
				if (schemaVersion === 1) {
					dependencies.push({
						slotId: raw.slotId as string,
						family: raw.family as VibrixSlotFamily,
						name: raw.name as string,
						revision: raw.revision as string
					});
				} else {
					const kind = raw.kind === 'image' ? 'image' : 'slot';
					if (kind === 'image' && raw.family !== 'image') {
						errors.push(
							`${path}.kind image requires family image.`
						);
						return;
					}
					dependencies.push({
						kind,
						id: raw.id as string,
						family: raw.family as VibrixTimelineKind,
						name: raw.name as string,
						revision: raw.revision as string
					});
				}
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
			schemaVersion,
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
	schemaVersion: 1 | 2,
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
		const allowedKinds = schemaVersion === 1 ? FAMILIES : TIMELINE_KINDS;
		if (typeof entry.kind !== 'string' || !allowedKinds.has(entry.kind)) {
			// The honest failure mode for a family this build does not know —
			// `motion`, for instance, which no longer exists.
			errors.push(
				schemaVersion === 1
					? `${path}.kind "${String(entry.kind)}" is not a Vibrix slot family.`
					: `${path}.kind "${String(entry.kind)}" is not a Vibrix timeline kind.`
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
			kind: entry.kind as VibrixTimelineKind,
			order: integer(entry.order, index),
			enabled: entry.enabled !== false,
			locked: entry.locked === true
		});
	});
}

function parseCues(
	raw: unknown,
	schemaVersion: 1 | 2,
	trackById: ReadonlyMap<string, CompositionTrack>,
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
		const start = integer(entry.startTimeMs, -1);
		if (start < 0) errors.push(`${path}.startTimeMs must be >= 0.`);
		if (!isRecord(entry.target)) {
			errors.push(`${path}.target must be an object.`);
		} else if (schemaVersion === 1) {
			validateV1Target(entry.target, path, errors);
		} else {
			validateV2Target(entry.target, path, errors);
		}
		const end =
			schemaVersion === 1 ? integer(entry.endTimeMs, -1) : undefined;
		if (schemaVersion === 1 && end! <= start) {
			errors.push(`${path}.endTimeMs must be greater than startTimeMs.`);
		}
		if (errors.length !== before) return;
		const id = entry.id as string;
		if (ids.has(id)) {
			errors.push(`${path}.id duplicates "${id}".`);
			return;
		}
		const trackId = entry.trackId as string;
		const track = trackById.get(trackId);
		if (!track) {
			errors.push(`${path}.trackId "${trackId}" has no track.`);
			return;
		}
		ids.add(id);
		const target = entry.target as Record<string, unknown>;
		if (schemaVersion === 1) {
			const transition = parseV1Transition(entry.transition);
			out.push({
				id,
				trackId,
				startTimeMs: start,
				endTimeMs: end!,
				target: {
					kind:
						target.kind === 'feature-slot'
							? 'feature-slot'
							: 'scene',
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
			return;
		}

		const family = target.family as VibrixTimelineKind;
		if (track.kind !== family) {
			errors.push(
				`${path}.target.family "${family}" does not match track "${track.kind}".`
			);
			return;
		}
		out.push({
			id,
			trackId,
			startTimeMs: start,
			target: buildV2Target(target),
			priority: integer(entry.priority, 0),
			enabled: entry.enabled !== false
		});
	});
}

function buildV2Target(target: Record<string, unknown>): CompositionTargetV2 {
	if (target.kind === 'inherit') {
		return {
			kind: 'inherit',
			family: target.family as VibrixSlotFamily
		};
	}
	if (target.kind === 'image') {
		return {
			kind: 'image',
			family: 'image',
			id: target.id as string,
			revision: target.revision as string
		};
	}
	return {
		kind: target.kind === 'feature-slot' ? 'feature-slot' : 'scene',
		family: target.family as VibrixSlotFamily,
		id: target.id as string,
		revision: target.revision as string
	};
}

function validateV1Target(
	target: Record<string, unknown>,
	path: string,
	errors: string[]
): void {
	requireString(target, 'slotId', errors, `${path}.target`);
	requireString(target, 'slotRevision', errors, `${path}.target`);
	const family = target.family;
	if (family !== undefined && !FAMILIES.has(String(family))) {
		errors.push(
			`${path}.target.family "${String(family)}" is not a Vibrix slot family.`
		);
	}
}

function validateV2Target(
	target: Record<string, unknown>,
	path: string,
	errors: string[]
): void {
	const kind = target.kind;
	if (
		kind !== 'scene' &&
		kind !== 'feature-slot' &&
		kind !== 'image' &&
		kind !== 'inherit'
	) {
		errors.push(`${path}.target.kind is not supported.`);
	}
	if (
		typeof target.family !== 'string' ||
		!TIMELINE_KINDS.has(target.family)
	) {
		errors.push(`${path}.target.family is not a Vibrix timeline kind.`);
	}
	if (kind === 'inherit') {
		if (target.family === 'image' || target.family === 'scene') {
			errors.push(
				`${path}.target inherit is only valid on granular tracks.`
			);
		}
		return;
	}
	requireString(target, 'id', errors, `${path}.target`);
	requireString(target, 'revision', errors, `${path}.target`);
	if (kind === 'image' && target.family !== 'image') {
		errors.push(`${path}.target image requires family image.`);
	}
	if (kind === 'scene' && target.family !== 'scene') {
		errors.push(`${path}.target scene requires family scene.`);
	}
	if (
		kind === 'feature-slot' &&
		(target.family === 'image' || target.family === 'scene')
	) {
		errors.push(`${path}.target feature-slot requires a granular family.`);
	}
}

function parseV1Transition(raw: unknown) {
	if (!isRecord(raw)) return undefined;
	return {
		type: (TRANSITION_TYPES.has(String(raw.type))
			? raw.type
			: 'cut') as CompositionTransitionType,
		durationMs: Math.max(0, integer(raw.durationMs, 0)),
		easing: (EASINGS.has(String(raw.easing))
			? raw.easing
			: 'linear') as CompositionEasing
	};
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
	| 'disabled'
	| 'not-cueable';

export interface ScoreCueReview {
	cueId: string;
	trackName: string;
	family: VibrixTimelineKind | null;
	slotId: string;
	/** The name in this project, falling back to the one the score recorded. */
	slotName: string;
	status: ScoreCueStatus;
	startTimeMs: number;
	endTimeMs: number | null;
}

export interface VibrixScoreReview {
	cues: ScoreCueReview[];
	counts: Record<ScoreCueStatus, number>;
	/** Families the score uses that this build publishes no slots for. */
	unpublishedFamilies: VibrixTimelineKind[];
	/** True when the catalogue the score was written against is this one. */
	catalogMatches: boolean;
	readyCount: number;
	totalCount: number;
}

export function reviewVibrixScore(
	envelope: VibrixScoreEnvelope,
	manifest: VibrixAuthoringManifest
): VibrixScoreReview {
	type PublishedItem =
		| (VibrixManifestImage & { family: 'image'; cueable: true })
		| (VibrixAuthoringManifest['slots'][number] & { enabled?: true });
	const publishedItems: PublishedItem[] = [
		...manifest.slots,
		...manifest.images.map(image => ({
			...image,
			family: 'image' as const,
			cueable: true as const
		}))
	];
	const itemById = new Map(publishedItems.map(item => [item.id, item]));
	const trackById = new Map(
		envelope.score.tracks.map(track => [track.id, track])
	);
	const dependencyById = new Map(
		envelope.dependencies.map(entry => [dependencyId(entry), entry])
	);
	const publishedFamilies = new Set<VibrixTimelineKind>([
		...manifest.slots.map(slot => slot.family),
		'image'
	]);
	const counts: Record<ScoreCueStatus, number> = {
		ready: 0,
		updated: 0,
		missing: 0,
		empty: 0,
		disabled: 0,
		'not-cueable': 0
	};

	const cues = envelope.score.cues.map<ScoreCueReview>(cue => {
		const track = trackById.get(cue.trackId);
		const target = cueTarget(cue);
		if (target.kind === 'inherit') {
			counts.ready += 1;
			return {
				cueId: cue.id,
				trackName: track?.name ?? cue.trackId,
				family: target.family,
				slotId: 'inherit',
				slotName: 'Inherit scene/image',
				status: 'ready',
				startTimeMs: cue.startTimeMs,
				endTimeMs: cueEndTime(cue)
			};
		}
		const published = itemById.get(target.id);
		const recorded = dependencyById.get(target.id);
		const status: ScoreCueStatus = !published
			? 'missing'
			: !published.cueable
				? 'not-cueable'
				: published.revision === 'empty'
					? 'empty'
					: 'enabled' in published && published.enabled === false
						? 'disabled'
						: published.revision === target.revision
							? 'ready'
							: 'updated';
		counts[status] += 1;
		return {
			cueId: cue.id,
			trackName: track?.name ?? cue.trackId,
			family: published?.family ?? target.family,
			slotId: target.id,
			slotName: published?.name ?? recorded?.name ?? target.id,
			status,
			startTimeMs: cue.startTimeMs,
			endTimeMs: cueEndTime(cue)
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

function dependencyId(dependency: VibrixScoreDependency): string {
	return 'slotId' in dependency ? dependency.slotId : dependency.id;
}

function cueEndTime(cue: CompositionCue): number | null {
	return 'endTimeMs' in cue ? cue.endTimeMs : null;
}

function cueTarget(cue: CompositionCue):
	| {
			kind: 'item';
			id: string;
			revision: string;
			family: VibrixTimelineKind | null;
	  }
	| { kind: 'inherit'; family: VibrixSlotFamily } {
	if ('slotId' in cue.target) {
		return {
			kind: 'item',
			id: cue.target.slotId,
			revision: cue.target.slotRevision,
			family: cue.target.family ?? null
		};
	}
	if (cue.target.kind === 'inherit') return cue.target;
	return {
		kind: 'item',
		id: cue.target.id,
		revision: cue.target.revision,
		family: cue.target.family
	};
}
