import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import type { BackgroundPalette } from '@/lib/backgroundPalette';
import type { OverlayLayer } from '@/types/layers';
import type {
	LogoLayer,
	LyricsLayer,
	SpectrumLayer,
	TrackTitleLayer
} from '@/types/layers';
import type { WallpaperState } from '@/types/wallpaper';
import { getOverlayLayerById } from '@/lib/layers';
import { resolveTrackDisplay } from '@/lib/audio/trackMetadata';
import { getCoverImage } from '@/features/audioLayers/render/coverImageCache';
import { drawOverlayLayer } from '@/features/audioLayers/render/overlayLayerRegistry';
import { resolveFilterStack } from '@/features/filterLooks/filterStack';
import type { FilterLookSettings } from '@/features/filterLooks/filterLooks';
import type { LogoScope } from '@/features/logo';
import type { SpectrumScope } from '@/features/spectrum';
import type { FlashEdgeScope } from '@/features/stageFx/flashEdgeDrive';
import type { TrackTitleScope } from '@/features/audioLayers/render/trackTitleScope';
import {
	drawFilmNoise,
	drawRgbShift,
	drawScanlines,
	getScanlineAmount
} from '@/lib/canvas/imageEffects';

export type RenderableAudioLayer =
	| LogoLayer
	| SpectrumLayer
	| TrackTitleLayer
	| LyricsLayer;

export type AudioLayerFrameRenderState = {
	postProcessCanvas: HTMLCanvasElement | null;
};

export type AudioLayerFrameRenderInput = {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	layer: RenderableAudioLayer;
	state: WallpaperState;
	audio: AudioSnapshot;
	dt: number;
	timeMs: number;
	palette: BackgroundPalette;
	trackTitle: string;
	trackCurrentTime: number;
	trackDuration: number;
	frameState: AudioLayerFrameRenderState;
	/** Scoped draw state (offline export); absent = the LIVE scopes. */
	logoScope?: LogoScope;
	spectrumScope?: SpectrumScope;
	flashEdge?: FlashEdgeScope;
	trackTitleScope?: TrackTitleScope;
};

function isRenderableAudioLayer(
	layer: OverlayLayer | null
): layer is RenderableAudioLayer {
	return (
		layer?.type === 'logo' ||
		layer?.type === 'spectrum' ||
		layer?.type === 'track-title' ||
		layer?.type === 'lyrics'
	);
}

/**
 * True when the Looks stack would change nothing for this layer.
 *
 * Being a filter target used to be enough to send the layer through a
 * full-screen offscreen canvas and a filtered `drawImage` every frame — even
 * with every dial at its identity value. With two spectrums plus logo, track
 * and lyrics all listed as targets that is five needless full-screen clears
 * and composites per frame, and the frame looks byte-for-byte the same either
 * way.
 */
export function isLayerFilterInert(
	stack: FilterLookSettings,
	scanlineAmount: number
): boolean {
	return (
		stack.filterOpacity >= 0.999 &&
		Math.abs(stack.filterBrightness - 1) < 0.001 &&
		Math.abs(stack.filterContrast - 1) < 0.001 &&
		Math.abs(stack.filterSaturation - 1) < 0.001 &&
		stack.filterBlur < 0.01 &&
		Math.abs(stack.filterHueRotate) < 0.01 &&
		stack.rgbShift <= 0.0001 &&
		stack.noiseIntensity <= 0.001 &&
		scanlineAmount <= 0.001
	);
}

function ensurePostProcessCanvas(
	existing: HTMLCanvasElement | null,
	width: number,
	height: number
): HTMLCanvasElement {
	const snapshotCanvas = existing ?? document.createElement('canvas');
	if (snapshotCanvas.width !== width) snapshotCanvas.width = width;
	if (snapshotCanvas.height !== height) snapshotCanvas.height = height;
	return snapshotCanvas;
}

export function createAudioLayerFrameRenderState(): AudioLayerFrameRenderState {
	return { postProcessCanvas: null };
}

export function renderAudioLayerFrame(
	input: AudioLayerFrameRenderInput
): boolean {
	const nextLayer = getOverlayLayerById(input.state, input.layer.id);
	if (!isRenderableAudioLayer(nextLayer) || !nextLayer.enabled) {
		return false;
	}

	const activeTrack =
		input.state.audioTracks.find(
			track => track.id === input.state.activeAudioTrackId
		) ?? null;
	const trackForDisplay = activeTrack ?? { name: input.trackTitle };
	const display = resolveTrackDisplay(trackForDisplay, input.state);
	const coverImage =
		activeTrack?.coverAssetId && input.state.nowPlayingCoverEnabled
			? getCoverImage(activeTrack.coverAssetId)
			: null;

	const drawContext = {
		canvas: input.canvas,
		state: input.state,
		audio: input.audio,
		dt: input.dt,
		palette: input.palette,
		nowPlaying: {
			artist: display.artist,
			title: display.title,
			coverImage
		},
		trackCurrentTime: input.trackCurrentTime,
		trackDuration: input.trackDuration,
		logoScope: input.logoScope,
		spectrumScope: input.spectrumScope,
		flashEdge: input.flashEdge,
		trackTitleScope: input.trackTitleScope
	};
	// Every renderable audio layer's type is also its filter-target id. The
	// winning stack is not necessarily the layer the Looks tab is editing.
	const stack = resolveFilterStack(input.state, nextLayer.type);

	// `scanlinesEnabled` is the switch every other renderer honours; this one
	// read `scanlineIntensity` straight through, so turning scanlines off in
	// the Looks tab still drew them over the logo, spectrum, track and lyrics
	// layers whenever those were filter targets.
	const scanlineAmount =
		stack && stack.scanlinesEnabled
			? getScanlineAmount(
					stack.scanlineMode,
					stack.scanlineIntensity,
					input.timeMs,
					input.audio.amplitude
				)
			: 0;

	if (!stack || isLayerFilterInert(stack, scanlineAmount)) {
		drawOverlayLayer(nextLayer, {
			ctx: input.ctx,
			...drawContext
		});
		return true;
	}

	const snapshotCanvas = ensurePostProcessCanvas(
		input.frameState.postProcessCanvas,
		input.canvas.width,
		input.canvas.height
	);
	input.frameState.postProcessCanvas = snapshotCanvas;
	const snapshotCtx = snapshotCanvas.getContext('2d');
	if (!snapshotCtx) {
		drawOverlayLayer(nextLayer, {
			ctx: input.ctx,
			...drawContext
		});
		return true;
	}

	snapshotCtx.clearRect(0, 0, snapshotCanvas.width, snapshotCanvas.height);
	drawOverlayLayer(nextLayer, {
		ctx: snapshotCtx,
		...drawContext
	});

	input.ctx.save();
	input.ctx.globalAlpha = Math.max(0, Math.min(1, stack.filterOpacity));
	input.ctx.filter = `brightness(${stack.filterBrightness}) contrast(${stack.filterContrast}) saturate(${stack.filterSaturation}) blur(${stack.filterBlur}px) hue-rotate(${stack.filterHueRotate}deg)`;
	input.ctx.drawImage(snapshotCanvas, 0, 0);
	input.ctx.filter = 'none';
	input.ctx.globalCompositeOperation = 'source-atop';
	if (stack.rgbShift > 0.0001) {
		input.ctx.save();
		input.ctx.translate(input.canvas.width / 2, input.canvas.height / 2);
		drawRgbShift(
			input.ctx,
			snapshotCanvas,
			input.canvas.width,
			input.canvas.height,
			stack.rgbShift *
				Math.min(input.canvas.width, input.canvas.height) *
				0.65,
			'brightness(1) contrast(1) saturate(1) hue-rotate(0deg)',
			input.timeMs,
			stack.filterOpacity
		);
		input.ctx.restore();
	}
	input.ctx.save();
	input.ctx.translate(input.canvas.width / 2, input.canvas.height / 2);
	drawFilmNoise(
		input.ctx,
		input.canvas.width,
		input.canvas.height,
		stack.noiseIntensity,
		input.timeMs,
		stack.filterOpacity
	);
	drawScanlines(
		input.ctx,
		input.canvas.width,
		input.canvas.height,
		scanlineAmount,
		stack.scanlineSpacing,
		stack.scanlineThickness,
		stack.filterOpacity
	);
	input.ctx.restore();
	input.ctx.restore();
	return true;
}
