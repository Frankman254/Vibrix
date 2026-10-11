/**
 * Which pool entries can take another file.
 *
 * Replacing a picture works by overwriting the bytes stored under the entry's
 * own asset id, which is what lets every reference to that id — setlists, the
 * intro montage, scenes, the project exporter — stay valid. A `virtual://`
 * entry has no bytes of its own: it points at a file inside a folder the user
 * granted access to, and `loadImageAsset` reads that folder BEFORE IndexedDB,
 * so anything written under the same id would be shadowed by the original
 * file. Those entries are therefore not replaceable in place.
 */
export function isReplaceableImageAssetId(assetId: string): boolean {
	return Boolean(assetId) && !assetId.startsWith('virtual://');
}
