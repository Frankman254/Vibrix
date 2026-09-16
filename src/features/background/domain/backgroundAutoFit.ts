/**
 * Asset-dimension loading for the background framing paths. The old
 * `suggestBackgroundAutoFit` lived here and FORCED `fitMode: 'cover'`; AutoZoom
 * (see ./autoZoom) replaces it and is forbidden from touching fitMode, and the
 * suggestion path itself is deleted — kept only in git history.
 */

export function loadImageDimensions(
	url: string
): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.decoding = 'async';
		image.onload = () => {
			resolve({
				width: image.naturalWidth || image.width,
				height: image.naturalHeight || image.height
			});
		};
		image.onerror = () => reject(new Error('image-dimensions-failed'));
		image.src = url;
	});
}
