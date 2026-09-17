import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
	BackgroundImageSnapshot,
	BackgroundTransitionSnapshot,
	ImageLayer
} from '@/features/background/imageLayerGeometry';

export type BackgroundTransitionRuntimeRefs = {
	imageRef: MutableRefObject<HTMLImageElement | null>;
	loadedImageUrlRef: MutableRefObject<string | null>;
	previousBackgroundImageRef: MutableRefObject<HTMLImageElement | null>;
	previousBackgroundParamsRef: MutableRefObject<BackgroundImageSnapshot>;
	renderedBackgroundParamsRef: MutableRefObject<BackgroundImageSnapshot>;
	previousBackgroundTransitionRef: MutableRefObject<BackgroundTransitionSnapshot>;
	renderedBackgroundTransitionRef: MutableRefObject<BackgroundTransitionSnapshot>;
	currentRequestedBackgroundUrlRef: MutableRefObject<string | null>;
	transitionStartRef: MutableRefObject<number | null>;
	effectiveTimeRef: MutableRefObject<number>;
};

export function createInitialBackgroundSnapshot(
	layer: ImageLayer
): BackgroundImageSnapshot {
	return {
		scale: layer.type === 'background-image' ? layer.scale : 1,
		positionX: layer.type === 'background-image' ? layer.positionX : 0,
		positionY: layer.type === 'background-image' ? layer.positionY : 0,
		fitMode: layer.type === 'background-image' ? layer.fitMode : 'cover',
		focusX: layer.type === 'background-image' ? layer.focusX : null,
		focusY: layer.type === 'background-image' ? layer.focusY : null,
		mirror: layer.type === 'background-image' ? layer.mirror : false,
		mirrorFill:
			layer.type === 'background-image' ? layer.mirrorFill : false,
		mirrorFillInvert:
			layer.type === 'background-image' ? layer.mirrorFillInvert : false,
		mirrorFillCount:
			layer.type === 'background-image' ? layer.mirrorFillCount : 1,
		rotation: layer.type === 'background-image' ? layer.rotation : 0
	};
}

export function createInitialBackgroundTransitionSnapshot(
	layer: ImageLayer
): BackgroundTransitionSnapshot {
	return {
		transitionType:
			layer.type === 'background-image' ? layer.transitionType : 'fade',
		transitionDuration:
			layer.type === 'background-image' ? layer.transitionDuration : 1,
		transitionIntensity:
			layer.type === 'background-image' ? layer.transitionIntensity : 1,
		transitionAudioDrive:
			layer.type === 'background-image' ? layer.transitionAudioDrive : 0
	};
}

export function clearBackgroundTransitionRuntime(
	refs: BackgroundTransitionRuntimeRefs,
	setImage: Dispatch<SetStateAction<HTMLImageElement | null>>
): void {
	setImage(null);
	refs.imageRef.current = null;
	refs.loadedImageUrlRef.current = null;
	refs.previousBackgroundImageRef.current = null;
	refs.transitionStartRef.current = null;
}

export function capturePreviousBackgroundFrame(
	refs: BackgroundTransitionRuntimeRefs
): void {
	if (
		refs.imageRef.current &&
		refs.loadedImageUrlRef.current ===
			refs.currentRequestedBackgroundUrlRef.current
	) {
		refs.previousBackgroundImageRef.current = refs.imageRef.current;
		refs.previousBackgroundParamsRef.current =
			refs.renderedBackgroundParamsRef.current;
		refs.previousBackgroundTransitionRef.current =
			refs.renderedBackgroundTransitionRef.current;
	}
}

export function beginBackgroundImageRequest(
	layer: ImageLayer,
	refs: BackgroundTransitionRuntimeRefs,
	setImage: Dispatch<SetStateAction<HTMLImageElement | null>>
): string | null {
	if (!layer.imageUrl) {
		clearBackgroundTransitionRuntime(refs, setImage);
		return null;
	}

	if (
		layer.type === 'background-image' &&
		refs.currentRequestedBackgroundUrlRef.current &&
		refs.currentRequestedBackgroundUrlRef.current !== layer.imageUrl
	) {
		capturePreviousBackgroundFrame(refs);
		refs.transitionStartRef.current = null;
	}

	if (layer.type === 'background-image') {
		refs.currentRequestedBackgroundUrlRef.current = layer.imageUrl;
	}

	return layer.imageUrl;
}

export function commitBackgroundImageLoad(params: {
	layer: ImageLayer;
	requestedUrl: string;
	loadedImage: HTMLImageElement;
	refs: BackgroundTransitionRuntimeRefs;
	setImage: Dispatch<SetStateAction<HTMLImageElement | null>>;
}): void {
	const { layer, requestedUrl, loadedImage, refs, setImage } = params;

	if (
		layer.type === 'background-image' &&
		refs.currentRequestedBackgroundUrlRef.current !== requestedUrl
	) {
		return;
	}

	if (
		layer.type === 'background-image' &&
		refs.previousBackgroundImageRef.current &&
		refs.loadedImageUrlRef.current !== requestedUrl
	) {
		refs.transitionStartRef.current = refs.effectiveTimeRef.current;
	}

	refs.imageRef.current = loadedImage;
	refs.loadedImageUrlRef.current = requestedUrl;
	setImage(loadedImage);
}

export function syncBackgroundImageRequestDuringFrame(
	layer: ImageLayer,
	refs: BackgroundTransitionRuntimeRefs
): void {
	if (
		layer.type !== 'background-image' ||
		!layer.imageUrl ||
		refs.currentRequestedBackgroundUrlRef.current === layer.imageUrl
	) {
		return;
	}

	capturePreviousBackgroundFrame(refs);
	refs.currentRequestedBackgroundUrlRef.current = layer.imageUrl;
	refs.transitionStartRef.current = null;
}
