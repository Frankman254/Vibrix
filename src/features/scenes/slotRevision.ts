/**
 * Content hashes for profile slots — the thing that lets Lyrixa say
 * "Updated in Vibrix" instead of changing a composition in silence.
 *
 * Three properties matter, and each one is a bug if it is missing:
 *
 *  - **Only `values` count.** Renaming a slot must NOT move its revision: the
 *    name is a label for a human, not content. If renaming moved the hash,
 *    every rename would invalidate every cue pointing at that slot.
 *  - **Key order must not matter.** Store writes build objects by spreading
 *    and patching, so the same content routinely arrives with keys in a
 *    different insertion order. Hashing `JSON.stringify` directly would report
 *    phantom changes forever.
 *  - **Array order must matter.** `spectrumInstances` is a list; swapping two
 *    entries is a real change.
 *
 * Derived on demand, never persisted. Storing the hash beside the values would
 * duplicate the truth: any write path that forgot to recompute it would leave
 * the two silently out of sync, which is worse than no detector at all.
 *
 * Not cryptography — a change detector. Deliberately plain JS (no
 * `crypto.subtle`, which is async and browser-only) so it runs in the Node
 * suite and inside a pure build function.
 */

/** A slot with no values is not referenceable; it gets this instead of a hash. */
export const EMPTY_REVISION = 'empty';

/**
 * Tagged, length-prefixed serialization with sorted object keys.
 *
 * The tags and length prefixes exist so that different shapes cannot collide
 * into the same text: without them `{ a: 'b:c' }` and `{ a: 'b', c: ... }`
 * could serialize alike, and the string `'1'` would hash like the number `1`.
 */
function canonicalize(value: unknown): string {
	if (value === null) return 'z';
	if (value === undefined) return 'u';
	if (typeof value === 'boolean') return value ? 'T' : 'F';
	if (typeof value === 'number') {
		// -0 and 0 are the same value for a change detector; NaN/Infinity have
		// no JSON form, so they get explicit tags rather than becoming `null`.
		if (Number.isNaN(value)) return 'd:nan';
		if (!Number.isFinite(value)) return value > 0 ? 'd:inf' : 'd:-inf';
		return `d:${value === 0 ? 0 : value}`;
	}
	if (typeof value === 'string') return `s:${value.length}:${value}`;
	if (Array.isArray(value)) {
		return `a:${value.length}:[${value.map(canonicalize).join(',')}]`;
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			// An absent key and a key set to `undefined` describe the same
			// content, so they must hash alike.
			.filter(([, entryValue]) => entryValue !== undefined)
			.sort(([left], [right]) =>
				left < right ? -1 : left > right ? 1 : 0
			);
		const body = entries
			.map(
				([key, entryValue]) =>
					`${key.length}:${key}=${canonicalize(entryValue)}`
			)
			.join(';');
		return `o:${entries.length}:{${body}}`;
	}
	// Functions and symbols cannot appear in persisted slot values; tag them
	// rather than throwing, so one odd value can never break an export.
	return `x:${typeof value}`;
}

/**
 * cyrb53 — a deterministic 53-bit hash in plain JS.
 *
 * 53 bits rather than a 32-bit FNV-1a because this runs over a few hundred
 * slots and the question asked of it ("did this slot change?") is answered
 * wrongly by any collision.
 */
function cyrb53(text: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		h1 = Math.imul(h1 ^ code, 2654435761);
		h2 = Math.imul(h2 ^ code, 1597334677);
	}
	h1 =
		Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
		Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 =
		Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
		Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
	return value.toString(16).padStart(14, '0');
}

/** Hash a slot's values. `null`/`undefined` (an empty slot) ⇒ `'empty'`. */
export function revisionOf(values: unknown): string {
	if (values === null || values === undefined) return EMPTY_REVISION;
	return cyrb53(canonicalize(values));
}

/**
 * Hash a set of revisions into one.
 *
 * Used for the manifest's top-level `revision` (so Lyrixa can tell in one
 * comparison whether anything at all moved) and for a scene's revision, which
 * folds in the revisions of the slots it binds.
 *
 * Sorted, so the order the families are visited in cannot move the result.
 */
export function manifestRevision(revisions: readonly string[]): string {
	return cyrb53(canonicalize([...revisions].sort()));
}
