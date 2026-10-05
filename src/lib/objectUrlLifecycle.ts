/**
 * Releasing `URL.createObjectURL` handles.
 *
 * An object URL pins its blob in memory for the lifetime of the document. The
 * image pool hands one out per picture and per thumbnail, so a session that
 * loads a 200-image pool, swaps setlists and deletes what it no longer wants
 * used to leave every one of those blobs resident — and a pool of 4K stills is
 * hundreds of megabytes. Nothing ever revoked them, because the url was simply
 * dropped from the store and the browser has no way to know the last reference
 * is gone.
 */

/**
 * How long to wait before revoking. A revoke takes effect immediately, so
 * doing it synchronously while the layer that was drawing the image is still
 * unmounting turns the last paint into a broken image. One frame is not
 * enough — a visual transition holds the outgoing picture for its fade — so
 * this is generous on purpose: the point is to free the blob eventually, not
 * at the earliest possible instant.
 */
const REVOKE_DELAY_MS = 5_000;

/** True for the urls this helper is allowed to revoke. */
function isObjectUrl(url: string | null | undefined): url is string {
	return typeof url === 'string' && url.startsWith('blob:');
}

/**
 * Revoke these object URLs once whatever was drawing them has had time to let
 * go. Anything that is not a `blob:` url is ignored, so it is safe to pass a
 * mixed list straight from state — an `https:` asset or a `virtual://`
 * reference must survive, and revoking a url twice is harmless but pointless.
 */
export function revokeObjectUrlsSoon(
	urls: readonly (string | null | undefined)[]
): void {
	const revocable = [...new Set(urls.filter(isObjectUrl))];
	if (revocable.length === 0) return;
	if (typeof window === 'undefined') return;
	window.setTimeout(() => {
		for (const url of revocable) {
			try {
				URL.revokeObjectURL(url);
			} catch {
				// Already revoked, or a document being torn down. Either way
				// there is nothing left to free.
			}
		}
	}, REVOKE_DELAY_MS);
}
