/**
 * Auto-composition image access — the browser half of "Auto Focus / Auto
 * Logo". The maths lives in `@/lib/saliency` (pure, tested); this module only
 * turns an image URL into a saliency summary. Store actions depend on it
 * through `@/features/background` so tests can swap the loader wholesale.
 */
import { estimateImageFocus, type ImageFocusEstimate } from '@/lib/imageFocus';
import { analyzeImageSaliency, type SaliencySummary } from '@/lib/saliency';

export function loadImageElement(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.decoding = 'async';
		image.crossOrigin = 'anonymous';
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('image-load-failed'));
		image.src = url;
	});
}

/**
 * Saliency of an image at `url`. Deterministic: same pixels → same summary.
 * Rejects when the image cannot be loaded or the 2d context is unavailable —
 * callers keep the user's composition untouched on failure.
 */
export async function analyzeImageUrlSaliency(
	url: string
): Promise<SaliencySummary> {
	const image = await loadImageElement(url);
	return analyzeImageSaliency(image);
}

/**
 * The face and logo focus of an image at `url`, estimated from its pixels.
 *
 * Deliberately separate from the saliency summary above: saliency answers
 * "where is the subject", which is not the same question as "where is the
 * face". A shutter panel needs the face. Rejects when the image cannot be
 * loaded, so callers keep whatever the user already had.
 */
export async function analyzeImageUrlFocus(
	url: string
): Promise<ImageFocusEstimate> {
	const image = await loadImageElement(url);
	return estimateImageFocus(image);
}
