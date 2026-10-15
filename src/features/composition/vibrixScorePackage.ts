import {
	parseVibrixScoreEnvelope,
	type CompositionCue,
	type VibrixScoreEnvelope,
	type VibrixScorePackage,
	type VibrixScorePreview,
	type VibrixScoreSnapshot
} from './vibrixScore';
import {
	VIBRIX_SLOT_FAMILIES,
	type VibrixSlotFamily
} from '@/features/scenes/authoringManifest';

export type VibrixScoreDocumentParseResult =
	| {
			ok: true;
			score: VibrixScoreEnvelope;
			scorePackage: VibrixScorePackage | null;
			errors: [];
	  }
	| {
			ok: false;
			score: null;
			scorePackage: null;
			errors: string[];
	  };

const FAMILY_SET = new Set<string>(VIBRIX_SLOT_FAMILIES);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
	source: Record<string, unknown>,
	key: string,
	errors: string[],
	prefix: string
): void {
	if (typeof source[key] !== 'string' || source[key].length === 0) {
		errors.push(`${prefix}.${key} must be a non-empty string.`);
	}
}

function snapshotKey(kind: 'slot' | 'image', id: string): string {
	return `${kind}:${id}`;
}

function containsNonTransportableUrl(value: unknown): boolean {
	if (typeof value === 'string') {
		return /^(?:blob:|https?:|file:|\/Users\/|\/home\/|[A-Za-z]:\\)/.test(
			value
		);
	}
	if (Array.isArray(value)) return value.some(containsNonTransportableUrl);
	if (isRecord(value)) {
		return Object.values(value).some(containsNonTransportableUrl);
	}
	return false;
}

function parseSnapshots(
	raw: unknown,
	errors: string[]
): VibrixScoreSnapshot[] | null {
	if (raw === null) return null;
	if (!Array.isArray(raw)) {
		errors.push('package.snapshots must be an array or null.');
		return null;
	}
	const snapshots: VibrixScoreSnapshot[] = [];
	const keys = new Set<string>();
	raw.forEach((entry, index) => {
		const path = `package.snapshots[${index}]`;
		if (!isRecord(entry)) {
			errors.push(`${path} must be an object.`);
			return;
		}
		const before = errors.length;
		requireString(entry, 'id', errors, path);
		requireString(entry, 'name', errors, path);
		requireString(entry, 'revision', errors, path);
		if (entry.kind !== 'slot' && entry.kind !== 'image') {
			errors.push(`${path}.kind must be "slot" or "image".`);
		}
		if (!Object.hasOwn(entry, 'values')) {
			errors.push(`${path}.values is required.`);
		} else if (containsNonTransportableUrl(entry.values)) {
			errors.push(`${path}.values contains a non-transportable URL.`);
		}
		if (
			entry.kind === 'slot' &&
			(typeof entry.family !== 'string' || !FAMILY_SET.has(entry.family))
		) {
			errors.push(`${path}.family is not a Vibrix slot family.`);
		}
		if (errors.length !== before) return;
		const kind = entry.kind as 'slot' | 'image';
		const id = entry.id as string;
		const key = snapshotKey(kind, id);
		if (keys.has(key)) {
			errors.push(`${path} duplicates ${key}.`);
			return;
		}
		keys.add(key);
		const common = {
			kind,
			id,
			name: entry.name as string,
			revision: entry.revision as string,
			values: entry.values
		};
		snapshots.push(
			kind === 'slot'
				? {
						...common,
						kind: 'slot',
						family: entry.family as VibrixSlotFamily
					}
				: { ...common, kind: 'image' }
		);
	});
	return snapshots;
}

function parsePreviews(
	raw: unknown,
	errors: string[]
): VibrixScorePreview[] | null {
	if (raw === null) return null;
	if (!Array.isArray(raw)) {
		errors.push('package.previews must be an array or null.');
		return null;
	}
	const previews: VibrixScorePreview[] = [];
	const ids = new Set<string>();
	raw.forEach((entry, index) => {
		const path = `package.previews[${index}]`;
		if (!isRecord(entry)) {
			errors.push(`${path} must be an object.`);
			return;
		}
		const before = errors.length;
		requireString(entry, 'imageId', errors, path);
		requireString(entry, 'revision', errors, path);
		requireString(entry, 'name', errors, path);
		if (
			typeof entry.thumbnailDataUrl !== 'string' ||
			!entry.thumbnailDataUrl.startsWith('data:image/') ||
			!entry.thumbnailDataUrl.includes(',')
		) {
			errors.push(`${path}.thumbnailDataUrl must be an image data URL.`);
		}
		if (errors.length !== before) return;
		const imageId = entry.imageId as string;
		if (ids.has(imageId)) {
			errors.push(`${path}.imageId duplicates "${imageId}".`);
			return;
		}
		ids.add(imageId);
		previews.push({
			imageId,
			revision: entry.revision as string,
			name: entry.name as string,
			thumbnailDataUrl: entry.thumbnailDataUrl as string
		});
	});
	return previews;
}

function directCueSnapshotKey(cue: CompositionCue): string | null {
	if ('slotId' in cue.target) return snapshotKey('slot', cue.target.slotId);
	if (cue.target.kind === 'inherit') return null;
	return snapshotKey(
		cue.target.kind === 'image' ? 'image' : 'slot',
		cue.target.id
	);
}

function validateSelfContainedClosure(
	packageValue: VibrixScorePackage,
	errors: string[]
): void {
	if (!packageValue.snapshots || !packageValue.previews) return;
	const snapshotByKey = new Map(
		packageValue.snapshots.map(snapshot => [
			snapshotKey(snapshot.kind, snapshot.id),
			snapshot
		])
	);
	const enabledTracks = new Set(
		packageValue.envelope.score.tracks
			.filter(track => track.enabled)
			.map(track => track.id)
	);
	for (const cue of packageValue.envelope.score.cues) {
		if (!cue.enabled || !enabledTracks.has(cue.trackId)) continue;
		const key = directCueSnapshotKey(cue);
		if (key && !snapshotByKey.has(key)) {
			errors.push(
				`package.snapshots is missing direct cue target ${key}.`
			);
		}
	}
	for (const preview of packageValue.previews) {
		const snapshot = snapshotByKey.get(
			snapshotKey('image', preview.imageId)
		);
		if (!snapshot) {
			errors.push(
				`package preview "${preview.imageId}" has no image snapshot.`
			);
		} else if (snapshot.revision !== preview.revision) {
			errors.push(
				`package preview "${preview.imageId}" revision does not match its snapshot.`
			);
		}
	}
}

function parsePackage(
	input: Record<string, unknown>
): VibrixScoreDocumentParseResult {
	const errors: string[] = [];
	if (input.packageVersion !== 1) {
		errors.push(
			`package.packageVersion ${String(input.packageVersion)} is not supported; expected 1.`
		);
	}
	requireString(input, 'exportedAt', errors, 'package');
	if (typeof input.selfContained !== 'boolean') {
		errors.push('package.selfContained must be a boolean.');
	}

	const parsedEnvelope = parseVibrixScoreEnvelope(input.envelope);
	if (!parsedEnvelope.ok) {
		errors.push(
			...parsedEnvelope.errors.map(error => `package.envelope: ${error}`)
		);
	}
	const snapshots = parseSnapshots(input.snapshots, errors);
	const previews = parsePreviews(input.previews, errors);
	if (
		input.selfContained === true &&
		(!Array.isArray(input.snapshots) || !Array.isArray(input.previews))
	) {
		errors.push(
			'package.selfContained true requires snapshot and preview arrays.'
		);
	}
	if (
		input.selfContained === false &&
		(input.snapshots !== null || input.previews !== null)
	) {
		errors.push(
			'package.selfContained false requires null snapshots and previews.'
		);
	}
	if (
		parsedEnvelope.ok &&
		typeof input.exportedAt === 'string' &&
		input.exportedAt !== parsedEnvelope.score.exportedAt
	) {
		errors.push(
			'package.exportedAt must match package.envelope.exportedAt.'
		);
	}
	if (errors.length > 0 || !parsedEnvelope.ok) {
		return { ok: false, score: null, scorePackage: null, errors };
	}

	const scorePackage: VibrixScorePackage = {
		format: 'vibrix-score',
		packageVersion: 1,
		exportedAt: input.exportedAt as string,
		envelope: parsedEnvelope.score,
		snapshots,
		previews,
		selfContained: input.selfContained as boolean
	};
	validateSelfContainedClosure(scorePackage, errors);
	return errors.length > 0
		? { ok: false, score: null, scorePackage: null, errors }
		: {
				ok: true,
				score: parsedEnvelope.score,
				scorePackage,
				errors: []
			};
}

/** Parse either Lyrixa's v1 container or the legacy flat score envelope. */
export function parseVibrixScoreDocument(
	input: unknown
): VibrixScoreDocumentParseResult {
	if (isRecord(input) && input.format === 'vibrix-score') {
		return parsePackage(input);
	}
	const parsed = parseVibrixScoreEnvelope(input);
	return parsed.ok
		? {
				ok: true,
				score: parsed.score,
				scorePackage: null,
				errors: []
			}
		: { ok: false, score: null, scorePackage: null, errors: parsed.errors };
}
