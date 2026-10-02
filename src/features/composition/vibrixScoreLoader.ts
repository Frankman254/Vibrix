import {
	parseVibrixScoreEnvelope,
	type VibrixScoreEnvelope
} from './vibrixScore';

/**
 * Getting a Lyrixa score in, without the UI knowing where it came from.
 *
 * Same shape as `features/lyrics/domain/lyricsBundleLoader.ts`, and for the
 * same reason: today a score arrives as a file the user picks, later it arrives
 * over HTTP or a desktop IPC channel from Lyrixa in the same suite. Those
 * differ only in how the bytes are fetched — everything after `JSON.parse` is
 * identical — so a new transport is a new function here rather than a new
 * branch inside a React component.
 *
 * Why file first, and not an endpoint: the catalogue a score is written against
 * lives in the *browser* store, which the Express server never sees, and
 * `POST /api/lyrics-bundle` — the route Lyrixa's HTTP bridge already points at
 * — does not exist in `backend/server/src/index.mjs`. An endpoint today would
 * be scaffolding over nothing. When HTTP arrives it carries the same bytes.
 *
 * No network calls at import time, and nothing here touches the store.
 */

export type VibrixScoreSourceKind = 'file' | 'text' | 'url' | 'ipc';

export interface VibrixScoreOrigin {
	kind: VibrixScoreSourceKind;
	/** File name, host, or channel name. Safe to show to a user. */
	label: string;
}

export interface VibrixScoreLoadResult {
	score: VibrixScoreEnvelope;
	origin: VibrixScoreOrigin;
}

export type VibrixScoreLoadFailure =
	/** The bytes could not be obtained (unreadable file, failed request). */
	| 'read'
	/** The bytes are not JSON. */
	| 'parse'
	/** Valid JSON, but not a Lyrixa score this build accepts. */
	| 'invalid';

export class VibrixScoreLoadError extends Error {
	readonly reason: VibrixScoreLoadFailure;
	readonly origin: VibrixScoreOrigin;
	/** Every validation complaint, so the UI can show more than the first. */
	readonly issues: string[];

	constructor(
		reason: VibrixScoreLoadFailure,
		origin: VibrixScoreOrigin,
		message: string,
		options?: { cause?: unknown; issues?: string[] }
	) {
		super(message, options);
		this.name = 'VibrixScoreLoadError';
		this.reason = reason;
		this.origin = origin;
		this.issues = options?.issues ?? [];
	}
}

/**
 * The only thing this module needs from a `File`.
 *
 * Structural rather than `File` so a caller can hand over a dropped item or a
 * test fixture without fabricating a DOM object.
 */
export interface VibrixScoreTextSource {
	name: string;
	text(): Promise<string>;
}

/** Parse text that is already in hand. The shared tail of every transport. */
export function loadVibrixScoreFromText(
	text: string,
	origin: VibrixScoreOrigin
): VibrixScoreLoadResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text) as unknown;
	} catch (error) {
		throw new VibrixScoreLoadError(
			'parse',
			origin,
			'That file is not valid JSON.',
			{ cause: error }
		);
	}
	const result = parseVibrixScoreEnvelope(raw);
	if (!result.ok) {
		throw new VibrixScoreLoadError(
			'invalid',
			origin,
			result.errors[0] ?? 'Invalid Lyrixa score.',
			{ issues: result.errors }
		);
	}
	return { score: result.score, origin };
}

/** Read a picked or dropped file. */
export async function loadVibrixScoreFromFile(
	file: VibrixScoreTextSource
): Promise<VibrixScoreLoadResult> {
	const origin: VibrixScoreOrigin = { kind: 'file', label: file.name };
	let text: string;
	try {
		text = await file.text();
	} catch (error) {
		throw new VibrixScoreLoadError(
			'read',
			origin,
			'That file could not be read.',
			{ cause: error }
		);
	}
	return loadVibrixScoreFromText(text, origin);
}

/**
 * Fetch a score over HTTP.
 *
 * `fetchImpl` is injectable so this stays testable without a network and so a
 * desktop shell can pass its own client. Not wired to any UI yet, and no route
 * serves it yet — it exists so that adding one is not a UI change.
 */
export async function loadVibrixScoreFromUrl(
	url: string,
	options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<VibrixScoreLoadResult> {
	const origin: VibrixScoreOrigin = { kind: 'url', label: url };
	const doFetch = options.fetchImpl ?? globalThis.fetch;
	if (!doFetch) {
		throw new VibrixScoreLoadError(
			'read',
			origin,
			'No fetch implementation is available in this environment.'
		);
	}
	let text: string;
	try {
		const response = await doFetch(url, { signal: options.signal });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		text = await response.text();
	} catch (error) {
		throw new VibrixScoreLoadError(
			'read',
			origin,
			`Could not fetch a score from ${url}.`,
			{ cause: error }
		);
	}
	return loadVibrixScoreFromText(text, origin);
}
