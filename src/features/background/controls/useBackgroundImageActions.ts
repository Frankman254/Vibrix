import type { ChangeEvent } from 'react';
import { generatePoolThumbnail } from '@/lib/thumbnailUtils';
import {
	deleteImage,
	loadImage,
	loadImageBlob,
	saveImage,
	saveImageAsset
} from '@/lib/db/imageDb';
import { invalidateCachedSignature } from '@/features/aiDirector/analysis/signatureCache';
import { isReplaceableImageAssetId } from './backgroundImageReplace';
import { downloadBlobFallback } from '@/features/export';
import type { BackgroundImageItem, Setlist } from '@/types/wallpaper';
import { resolveBackgroundDownloadFileName } from './backgroundImageDownload';
import type { BackgroundStore } from './useBackgroundStore';

export function useBackgroundImageActions({
	activeImage,
	activeSetlist,
	store
}: {
	activeImage: BackgroundImageItem | null;
	activeSetlist: Setlist | null;
	store: BackgroundStore;
}) {
	function queuePoolThumbnail(assetId: string, url: string) {
		void generatePoolThumbnail(url).then(thumbnailUrl => {
			if (!thumbnailUrl || thumbnailUrl === url) return;
			store.setImageThumbnailUrl(assetId, thumbnailUrl);
		});
	}

	async function handleGlobalBackgroundFile(
		event: ChangeEvent<HTMLInputElement>
	) {
		const file = event.target.files?.[0];
		if (!file) return;

		const previousId = store.globalBackgroundId;
		const id = await saveImage(file);
		const url = await loadImage(id);
		if (!url) return;

		store.setGlobalBackgroundId(id);
		store.setGlobalBackgroundUrl(url);

		if (previousId && previousId !== id) {
			await deleteImage(previousId).catch(() => undefined);
		}

		event.target.value = '';
	}

	async function handleMultiFiles(event: ChangeEvent<HTMLInputElement>) {
		const files = Array.from(event.target.files ?? []);
		if (files.length === 0) return;

		let firstAddedId: string | null = null;
		const addedIds: string[] = [];
		for (const file of files) {
			const id = await saveImage(file);
			const url = await loadImage(id);
			if (!url) continue;

			store.addImageEntry(id, url, null, file.name);
			queuePoolThumbnail(id, url);
			addedIds.push(id);

			if (!firstAddedId) firstAddedId = id;
		}

		if (activeSetlist && addedIds.length > 0) {
			store.setSetlistImages(activeSetlist.id, [
				...activeSetlist.imageAssetIds,
				...addedIds.filter(
					id => !activeSetlist.imageAssetIds.includes(id)
				)
			]);
		}

		if (firstAddedId) {
			store.setActiveImageId(firstAddedId);
		}

		event.target.value = '';
	}

	/**
	 * Put another file inside an EXISTING pool entry.
	 *
	 * The entry is the box: its name, framing, focus points, scene binding
	 * and inline overrides are what the user built, and the picture is only
	 * its contents. So the bytes go to IndexedDB under the entry's own asset
	 * id — overwriting what was there — and nothing that references that id
	 * (setlists, the intro montage, scenes, the project exporter) has to
	 * learn anything.
	 */
	async function replaceImageFile(assetId: string, file: File) {
		if (!isReplaceableImageAssetId(assetId)) return false;
		const existing = store.backgroundImages.some(
			image => image.assetId === assetId
		);
		if (!existing) return false;

		await saveImageAsset(assetId, await file.arrayBuffer(), file.type);
		const url = await loadImage(assetId);
		if (!url) return false;

		store.replaceImageEntryAsset(assetId, url, null, file.name);
		queuePoolThumbnail(assetId, url);
		// Cached by asset id, so without this the Director keeps describing
		// the picture that is no longer there.
		await invalidateCachedSignature(assetId);
		// Both measurements belong to the new pixels: the covered framing and
		// the two focus annotations whose source is still `auto`.
		if (store.activeImageId === assetId) {
			void store.autoFitCoveredActiveImage();
		}
		void store.analyzeBackgroundImageFocus(assetId);
		return true;
	}

	async function replaceActiveImageFile(
		event: ChangeEvent<HTMLInputElement>
	) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file || !activeImage) return;
		await replaceImageFile(activeImage.assetId, file);
	}

	async function handleVirtualImageSelect(
		virtualId: string,
		fileName: string
	) {
		const url = await loadImage(virtualId);
		if (!url) return;

		store.addImageEntry(virtualId, url, null, fileName);
		queuePoolThumbnail(virtualId, url);
		if (activeSetlist && !activeSetlist.imageAssetIds.includes(virtualId)) {
			store.setSetlistImages(activeSetlist.id, [
				...activeSetlist.imageAssetIds,
				virtualId
			]);
		}

		store.setActiveImageId(virtualId);
	}

	async function removeImage(assetId: string) {
		if (activeSetlist) {
			store.setSetlistImages(
				activeSetlist.id,
				activeSetlist.imageAssetIds.filter(id => id !== assetId)
			);
			return;
		}
		await deleteImage(assetId);
		store.removeImageEntry(assetId);
	}

	async function clearAllImages() {
		if (activeSetlist) {
			store.setSetlistImages(activeSetlist.id, []);
			return;
		}
		for (const id of store.imageIds) await deleteImage(id);
		store.setImageUrls([]);
	}

	async function removeGlobalBackground() {
		const previousId = store.globalBackgroundId;
		if (previousId) await deleteImage(previousId).catch(() => undefined);
		store.setGlobalBackgroundId(null);
		store.setGlobalBackgroundUrl(null);
	}

	async function downloadActiveImage() {
		if (!activeImage) return;
		const blob = await loadImageBlob(activeImage.assetId);
		if (!blob) return;
		downloadBlobFallback(
			blob,
			resolveBackgroundDownloadFileName(activeImage, blob)
		);
	}

	return {
		clearAllImages,
		downloadActiveImage,
		handleGlobalBackgroundFile,
		handleMultiFiles,
		handleVirtualImageSelect,
		removeGlobalBackground,
		removeImage,
		replaceActiveImageFile,
		replaceImageFile
	};
}
