import type { CSSProperties } from 'react';
import type { BackgroundImageLayer, OverlayImageLayer } from '@/types/layers';
import type { WallpaperState } from '@/types/wallpaper';
import {
	type ImageDrawRect,
	getImageBaseSize,
	resolveImageTransform
} from './index';
import { getLruEntry, setLruEntry } from '@/lib/lruCache';
import { isFilterTargetActive } from '@/features/filterLooks/filterStack';

export type ImageLayer = BackgroundImageLayer | OverlayImageLayer;
export type BackgroundImageSnapshot = Pick<
	BackgroundImageLayer,
	| 'scale'
	| 'positionX'
	| 'positionY'
	| 'fitMode'
	| 'keepCovered'
	| 'focusX'
	| 'focusY'
	| 'mirror'
	| 'mirrorFill'
	| 'mirrorFillInvert'
	| 'mirrorFillCount'
	| 'rotation'
>;
export type BackgroundTransitionSnapshot = Pick<
	BackgroundImageLayer,
	| 'transitionType'
	| 'transitionDuration'
	| 'transitionIntensity'
	| 'transitionAudioDrive'
>;
export type LayerRect = {
	cx: number;
	cy: number;
	width: number;
	height: number;
};

type ResponsiveLayoutOptions = Pick<
	WallpaperState,
	| 'layoutResponsiveEnabled'
	| 'layoutBackgroundReframeEnabled'
	| 'layoutReferenceWidth'
	| 'layoutReferenceHeight'
>;

const IMAGE_CACHE_LIMIT = 10;
const imageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(
	url: string,
	onReady: (image: HTMLImageElement) => void
): HTMLImageElement {
	const cached = getLruEntry(imageCache, url);
	if (cached) {
		if (cached.complete && cached.naturalWidth > 0) onReady(cached);
		else cached.onload = () => onReady(cached);
		return cached;
	}

	const image = new Image();
	image.decoding = 'async';
	image.src = url;
	image.onload = () => onReady(image);
	setLruEntry(imageCache, url, image, IMAGE_CACHE_LIMIT);
	return image;
}

export function getBackgroundBaseSize(
	canvasWidth: number,
	canvasHeight: number,
	imageWidth: number,
	imageHeight: number,
	fitMode: BackgroundImageLayer['fitMode']
): { width: number; height: number } {
	return getImageBaseSize(
		canvasWidth,
		canvasHeight,
		imageWidth,
		imageHeight,
		fitMode
	);
}

export function getLayerRect(
	layer: ImageLayer,
	canvasWidth: number,
	canvasHeight: number,
	image: HTMLImageElement,
	bassBoost: number,
	parallaxX: number,
	parallaxY: number,
	layout?: ResponsiveLayoutOptions
): { cx: number; cy: number; width: number; height: number } {
	if (layer.type === 'background-image') {
		return getBackgroundRectFromSnapshot(
			canvasWidth,
			canvasHeight,
			image,
			{
				scale: layer.scale,
				positionX: layer.positionX,
				positionY: layer.positionY,
				fitMode: layer.fitMode,
				keepCovered: layer.keepCovered,
				focusX: layer.focusX,
				focusY: layer.focusY,
				mirror: layer.mirror,
				mirrorFill: layer.mirrorFill,
				mirrorFillInvert: layer.mirrorFillInvert,
				mirrorFillCount: layer.mirrorFillCount,
				rotation: layer.rotation
			},
			bassBoost,
			parallaxX,
			parallaxY,
			layout
		);
	}

	return {
		cx: canvasWidth / 2 + layer.positionX * canvasWidth,
		cy: canvasHeight / 2 - layer.positionY * canvasHeight,
		width: layer.width * layer.scale,
		height: layer.height * layer.scale
	};
}

export function getBackgroundRectFromSnapshot(
	canvasWidth: number,
	canvasHeight: number,
	image: HTMLImageElement,
	snapshot: BackgroundImageSnapshot,
	bassBoost: number,
	parallaxX: number,
	parallaxY: number,
	layout?: ResponsiveLayoutOptions
): { cx: number; cy: number; width: number; height: number } {
	const primary = getBackgroundDrawRectsFromSnapshot(
		canvasWidth,
		canvasHeight,
		image,
		snapshot,
		bassBoost,
		parallaxX,
		parallaxY,
		layout
	)[0];
	return {
		cx: primary.cx,
		cy: primary.cy,
		width: primary.width,
		height: primary.height
	};
}

export function getBackgroundDrawRectsFromSnapshot(
	canvasWidth: number,
	canvasHeight: number,
	image: HTMLImageElement,
	snapshot: BackgroundImageSnapshot,
	bassBoost: number,
	parallaxX: number,
	parallaxY: number,
	layout?: ResponsiveLayoutOptions
): ImageDrawRect[] {
	return resolveImageTransform({
		viewportWidth: canvasWidth,
		viewportHeight: canvasHeight,
		imageWidth: image.naturalWidth || canvasWidth,
		imageHeight: image.naturalHeight || canvasHeight,
		fitMode: snapshot.fitMode,
		scale: snapshot.scale,
		positionX: snapshot.positionX,
		positionY: snapshot.positionY,
		rotation: snapshot.rotation,
		mirror: snapshot.mirror,
		// Manual framing turns the coverage clamp off; otherwise the draw
		// always clamps to the covered composition.
		keepCovered: snapshot.keepCovered,
		focusX: snapshot.focusX,
		focusY: snapshot.focusY,
		mirrorFill: snapshot.mirrorFill,
		mirrorFillInvert: snapshot.mirrorFillInvert,
		mirrorFillCount: snapshot.mirrorFillCount,
		reactiveScaleBoost: bassBoost,
		parallaxX,
		parallaxY,
		layout
	}).drawRects;
}

export function targetMatches(
	layer: ImageLayer,
	state: Pick<WallpaperState, 'filterTargets'>,
	selectedOverlayId: string | null
): boolean {
	if (layer.type === 'background-image') {
		return isFilterTargetActive(state, 'background');
	}

	return (
		isFilterTargetActive(state, 'selected-overlay') &&
		layer.id === selectedOverlayId
	);
}

export function getCanvasBlendMode(
	layer: ImageLayer
): CSSProperties['mixBlendMode'] {
	if (layer.type !== 'overlay-image') return 'normal';
	if (layer.blendMode === 'screen') return 'screen';
	if (layer.blendMode === 'lighten') return 'lighten';
	if (layer.blendMode === 'multiply') return 'multiply';
	return 'normal';
}
