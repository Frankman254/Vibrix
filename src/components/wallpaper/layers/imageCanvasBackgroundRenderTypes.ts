import type { MutableRefObject } from 'react';
import type { ScanlineMode } from '@/types/wallpaper';
import type { VisualQualityTier } from '@/lib/visual/performanceQuality';
import type { BackgroundImageLayer } from '@/types/layers';
import type {
	BackgroundImageSnapshot,
	BackgroundTransitionSnapshot
} from '@/features/background/imageLayerGeometry';

export type BgDrawContext = {
	ctx: CanvasRenderingContext2D;
	canvasWidth: number;
	canvasHeight: number;
	layerOpacity: number;
	baseFilter: string;
	blur: number;
	parallaxX: number;
	parallaxY: number;
	bassBoost: number;
	layoutResponsiveEnabled: boolean;
	layoutBackgroundReframeEnabled: boolean;
	layoutReferenceWidth: number;
	layoutReferenceHeight: number;
};

export type BgTransitionCtx = BgDrawContext & {
	transitionForce: number;
	transitionForceNorm: number;
	time: number;
};

export type RenderBackgroundFrameParams = {
	ctx: CanvasRenderingContext2D;
	layer: BackgroundImageLayer;
	canvasWidth: number;
	canvasHeight: number;
	loadedImage: HTMLImageElement | null;
	time: number;
	transitionLevel: number;
	bassBoost: number;
	amplitude: number;
	parallaxX: number;
	parallaxY: number;
	brightness: number;
	contrast: number;
	saturation: number;
	blur: number;
	hue: number;
	colorFilter: string;
	filterActive: boolean;
	layerOpacity: number;
	rgbShiftPixels: number;
	scanlineMode: ScanlineMode;
	scanlineIntensity: number;
	scanlineSpacing: number;
	scanlineThickness: number;
	filmNoiseAmount: number;
	vignetteAmount: number;
	bloomAmount: number;
	lumaThreshold: number;
	lensWarpAmount: number;
	heatDistortionAmount: number;
	imagePostQuality: VisualQualityTier;
	layoutResponsiveEnabled: boolean;
	layoutBackgroundReframeEnabled: boolean;
	layoutReferenceWidth: number;
	layoutReferenceHeight: number;
	previousBackgroundImageRef: MutableRefObject<HTMLImageElement | null>;
	previousBackgroundParamsRef: MutableRefObject<BackgroundImageSnapshot>;
	previousBackgroundTransitionRef: MutableRefObject<BackgroundTransitionSnapshot>;
	renderedBackgroundParamsRef: MutableRefObject<BackgroundImageSnapshot>;
	renderedBackgroundTransitionRef: MutableRefObject<BackgroundTransitionSnapshot>;
	transitionStartRef: MutableRefObject<number | null>;
	/** Absolute score-clock progress while Compose owns the image lane. */
	composeTransitionProgress: number | null;
};
