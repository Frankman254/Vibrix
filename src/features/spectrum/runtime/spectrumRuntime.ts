import {
	createAudioChannelSelectionState,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';
import type {
	ResolvedAudioReactiveChannel,
	WallpaperState
} from '@/types/wallpaper';
import { createAudioEnvelope, type AudioEnvelope } from '@/utils/audioEnvelope';
import { normalizeSpectrumShape } from '@/features/spectrum/domain/spectrumControlConfig';

export type SpectrumSettings = Pick<
	WallpaperState,
	| 'spectrumMode'
	| 'performanceMode'
	| 'logoEnabled'
	| 'spectrumLinearOrientation'
	| 'spectrumLinearDirection'
	| 'spectrumRadialShape'
	| 'spectrumRadialAngle'
	| 'spectrumRadialSharpness'
	| 'spectrumFigureRotationSpeed'
	| 'spectrumRadialFitLogo'
	| 'spectrumFollowLogo'
	| 'spectrumLogoGap'
	| 'spectrumSpan'
	| 'spectrumScale'
	| 'spectrumInnerRadius'
	| 'spectrumBarCount'
	| 'spectrumBarWidth'
	| 'spectrumMinHeight'
	| 'spectrumMaxHeight'
	| 'spectrumOpacity'
	| 'spectrumGlowIntensity'
	| 'spectrumGlowReach'
	| 'spectrumGlowAudioAmount'
	| 'spectrumShadowBlur'
	| 'spectrumPrimaryColor'
	| 'spectrumSecondaryColor'
	| 'spectrumColorMode'
	| 'spectrumManualGlow'
	| 'spectrumManualGlowMode'
	| 'spectrumGlowColorMode'
	| 'spectrumGlowPrimaryColor'
	| 'spectrumGlowSecondaryColor'
	| 'spectrumPixelate'
	| 'spectrumPixelateScale'
	| 'spectrumLiquidLayer1Pixelate'
	| 'spectrumLiquidLayer2Pixelate'
	| 'spectrumLiquidLayer3Pixelate'
	| 'spectrumLedCellSize'
	| 'spectrumLedCellGap'
	| 'spectrumLedAngle'
	| 'spectrumLedShape'
	| 'spectrumRgbSplit'
	| 'spectrumRgbSplitAmount'
	| 'spectrumNeonCore'
	| 'spectrumNeonCoreIntensity'
	| 'spectrumNeonCoreWidth'
	| 'spectrumGradientFlow'
	| 'spectrumGradientFlowSpeed'
	| 'spectrumGradientFlowAudio'
	| 'spectrumGradientFlowDirection'
	| 'spectrumPeakSparks'
	| 'spectrumPeakSparksAmount'
	| 'spectrumPeakSparksSize'
	| 'spectrumPeakSparksThreshold'
	| 'spectrumEchoTrace'
	| 'spectrumEchoTraceCount'
	| 'spectrumEchoTraceOpacity'
	| 'spectrumEchoTraceOffset'
	| 'spectrumEchoTraceDecay'
	| 'spectrumBandMode'
	| 'spectrumMirror'
	| 'spectrumPeakHold'
	| 'spectrumPeakDecay'
	| 'spectrumRotationSpeed'
	| 'spectrumRotationDrive'
	| 'spectrumRotationAudioAmount'
	| 'spectrumRotationChannel'
	| 'spectrumRotationDirection'
	| 'spectrumRotationSmoothing'
	| 'spectrumRotationInvertOnLowEnergy'
	| 'spectrumRotationInvertThreshold'
	| 'spectrumRotationInvertHoldMs'
	| 'spectrumSmoothing'
	| 'spectrumShape'
	| 'spectrumPositionX'
	| 'spectrumPositionY'
	| 'spectrumAudioSmoothing'
	| 'audioAutoKickThreshold'
	| 'audioAutoSwitchHoldMs'
	| 'spectrumWaveFillOpacity'
	| 'spectrumFamily'
	| 'spectrumFrameMemoryEnabled'
	| 'spectrumAfterglow'
	| 'spectrumMotionTrails'
	| 'spectrumGhostFrames'
	| 'spectrumFrameHistoryDepth'
	| 'spectrumGainExpressiveness'
	| 'spectrumEnvelopeAttack'
	| 'spectrumEnvelopeRelease'
	| 'spectrumEnvelopeReactivitySpeed'
	| 'spectrumEnvelopePeakWindow'
	| 'spectrumEnvelopePeakFloor'
	| 'spectrumEnvelopePunch'
	| 'spectrumPeakRibbonsEnabled'
	| 'spectrumPeakRibbons'
	| 'spectrumPeakRibbonAngle'
	| 'spectrumBassShockwaveEnabled'
	| 'spectrumBassShockwave'
	| 'spectrumShockwaveBandMode'
	| 'spectrumShockwaveBandThresholds'
	| 'spectrumShockwaveThickness'
	| 'spectrumShockwaveOpacity'
	| 'spectrumShockwaveBlur'
	| 'spectrumShockwaveColorMode'
	| 'spectrumEnergyBloomEnabled'
	| 'spectrumEnergyBloom'
	| 'spectrumOscilloscopeLineWidth'
	| 'spectrumTunnelRingCount'
	| 'spectrumTunnelDepthFalloff'
	| 'spectrumTunnelRingSpacing'
	| 'spectrumTunnelWallOpacity'
	| 'spectrumTunnelPulseStrength'
	| 'spectrumTunnelAlternateRotation'
	| 'spectrumLiquidLayer1Opacity'
	| 'spectrumLiquidLayer2Opacity'
	| 'spectrumLiquidLayer3Opacity'
	| 'spectrumLiquidLayer1Amp'
	| 'spectrumLiquidLayer2Amp'
	| 'spectrumLiquidLayer3Amp'
	| 'spectrumLiquidLayer1Fill'
	| 'spectrumLiquidLayer2Fill'
	| 'spectrumLiquidLayer3Fill'
	| 'spectrumLiquidLayer1Speed'
	| 'spectrumLiquidLayer2Speed'
	| 'spectrumLiquidLayer3Speed'
	| 'spectrumLiquidLayer1RotationSpeed'
	| 'spectrumLiquidLayer2RotationSpeed'
	| 'spectrumLiquidLayer3RotationSpeed'
	| 'spectrumLiquidLayer1Shape'
	| 'spectrumLiquidLayer2Shape'
	| 'spectrumLiquidLayer3Shape'
	| 'spectrumLiquidLayer1RigidShape'
	| 'spectrumLiquidLayer2RigidShape'
	| 'spectrumLiquidLayer3RigidShape'
	| 'spectrumSpiralTurns'
	| 'spectrumSpiralOuterRadius'
	| 'spectrumSpiralTightness'
	| 'spectrumSpiralShape'
	| 'spectrumSpiralLogarithmic'
	| 'spectrumSpiralGradientStroke'
	| 'spectrumSpiralArms'
	| 'spectrumSpiralAudioTurns'
	| 'spectrumSpiralDotShape'
	| 'spectrumSpiralStrokeWidth'
	| 'spectrumOscilloscopeScrollSpeed'
	| 'spectrumOscilloscopeReactiveWidth'
	| 'spectrumOscilloscopePhosphor'
	| 'spectrumOscilloscopePhosphorDecay'
	| 'spectrumOscilloscopeGrid'
	| 'spectrumOscilloscopeGridDivisions'
	| 'spectrumDriveMode'
	| 'spectrumManualSections'
	| 'spectrumManualAddWeight'
	| 'spectrumManualAttack'
	| 'spectrumManualRelease'
> & {
	spectrumRainbowColors?: string[];
	/**
	 * Palette the glow uses in rainbow / visible-rotate mode. Resolved from
	 * `spectrumGlowColorSource` (manual / theme / image) alongside the glow
	 * primary+secondary, so the glow can sample the image palette independently
	 * of the fill. Runtime-only — never persisted.
	 */
	spectrumGlowRainbowColors?: string[];
};

export type SpectrumShockwave = {
	radius: number;
	alpha: number;
	thickness: number;
	speed: number;
};

export type SpectrumShockwaveAdaptiveLevel = {
	floor: number;
	peak: number;
	lastNormalized: number;
};

export type SpectrumRuntimeState = {
	smoothedHeights: Float32Array;
	peakHeights: Float32Array;
	pixelHeights: Float32Array;
	pixelPeaks: Float32Array;
	rotation: number;
	figureRotation: number;
	/** Smoothed (EMA) audio-driven rotation speed, rad/s. Drives Task-1 rotation. */
	audioRotationSpeed: number;
	rotationLowEnergyInvertSign: 1 | -1;
	rotationLowEnergyInvertPendingSign: 1 | -1;
	rotationLowEnergyInvertElapsedMs: number;
	idleTime: number;
	lastModeSignature: string;
	modeTransitionElapsed: number;
	modeTransitionSnapshotCanvas: HTMLCanvasElement | null;
	previousFrameCanvas: HTMLCanvasElement | null;
	previousFrameCaptureElapsed: number;
	energyEnvelope: AudioEnvelope;
	channelSelection: ReturnType<typeof createAudioChannelSelectionState>;
	/** Separate auto/kick routing for Bass Shockwave trigger (does not affect main spectrum bins). */
	shockwaveChannelSelection: ReturnType<
		typeof createAudioChannelSelectionState
	>;
	// Oscilloscope family state — phosphor afterglow canvas + temporal
	// smoothing buffer. `oscilloscopeSmoothedSamples` holds the lerped PCM
	// (initialized at 128 = silence baseline). Each frame the renderer
	// blends the live AnalyserNode samples into this buffer using a factor
	// derived from `spectrumOscilloscopeScrollSpeed`, then compensates
	// amplitude so response speed does not double as a hidden height control.
	oscilloscopePhosphorCanvas?: HTMLCanvasElement | null;
	oscilloscopeSmoothedSamples?: Float32Array;
	oscilloscopeDisplaySamples?: Uint8Array;
	// Orbital family state
	orbitalAngles?: Float32Array;
	// Global pixelate post-process buffers: the spectrum scene is drawn into
	// `pixelateSceneCanvas`, downscaled into `pixelateSmallCanvas`, then
	// upscaled nearest-neighbor back onto the real canvas.
	pixelateSceneCanvas?: HTMLCanvasElement | null;
	pixelateSmallCanvas?: HTMLCanvasElement | null;
	// Scratch for the per-liquid-layer pixelate pass. One buffer serves all
	// three layers: each is drawn, blitted and cleared before the next one.
	liquidLayerPixelateCanvas?: HTMLCanvasElement | null;
	// Frame memory / feedback buffers
	feedbackCanvas?: HTMLCanvasElement | null;
	frameHistoryCanvases?: Array<HTMLCanvasElement | null>;
	frameHistoryIndex?: number;
	// Reactive accent FX
	shockwaves?: SpectrumShockwave[];
	shockwaveAdaptiveLevels?: Partial<
		Record<ResolvedAudioReactiveChannel, SpectrumShockwaveAdaptiveLevel>
	>;
	lastShockwaveLevel?: number;
	lastShockwaveResolvedChannel?: ResolvedAudioReactiveChannel;
	lastShockwaveTime?: number;
	/**
	 * Spiral-only audio reactivity accumulators. They live on the shared
	 * runtime so per-instance state (primary + clone) persists across frames
	 * without polluting the SpectrumSettings type. The values are gated by
	 * `spectrumSpiralAudioTurns` (existing master dial) so the user already
	 * has a single slider to tune all of these together.
	 *
	 *  - `spiralAudioRotationPhase` — extra angle added on top of
	 *    `runtime.rotation`. Grows on amplitude so the spiral spins faster
	 *    during loud passages. Decays passively at zero amp.
	 *  - `spiralOuterRadiusPulse` — peak-hold envelope (0..1) that inflates
	 *    the outer radius. Drives a brief "exhale" on kicks.
	 *  - `spiralKickFlash` — 0..1 transient detector. >0.5 swaps the dot
	 *    shape to `star` for ~200ms after a transient so kicks burst.
	 *  - `spiralLastAvgAmp` — last frame's avg amp, for transient diff.
	 */
	spiralAudioRotationPhase?: number;
	spiralOuterRadiusPulse?: number;
	spiralKickFlash?: number;
	spiralLastAvgAmp?: number;
	/** Classic wave echo-trace history (1–2 frames, bounded). */
	echoTraceBuffers?: Float32Array[];
	/** Frames stored since echo was enabled — skip draw until >= 1. */
	echoTraceFrameCount?: number;
};

export { type AudioSnapshot };

export const MODE_TRANSITION_DURATION = 0.32;

/**
 * Per-scope spectrum state. Module globals made this a singleton: the offline
 * export and the live viewport shared one runtime map, so exporting changed
 * the live animation and vice versa. A scope owns the per-instance runtimes
 * plus the gradient-flow phase; live keeps the default scope, each export
 * creates its own.
 */
export type SpectrumScope = {
	runtimes: Map<string, SpectrumRuntimeState>;
	gradientPhase: number;
};

export function createSpectrumScope(): SpectrumScope {
	return { runtimes: new Map(), gradientPhase: 0 };
}

/** The scope live components use when no scope is threaded to them. */
export const LIVE_SPECTRUM_SCOPE: SpectrumScope = createSpectrumScope();

export function createSpectrumRuntimeState(): SpectrumRuntimeState {
	return {
		smoothedHeights: new Float32Array(0),
		peakHeights: new Float32Array(0),
		pixelHeights: new Float32Array(0),
		pixelPeaks: new Float32Array(0),
		rotation: 0,
		figureRotation: 0,
		audioRotationSpeed: 0,
		rotationLowEnergyInvertSign: 1,
		rotationLowEnergyInvertPendingSign: 1,
		rotationLowEnergyInvertElapsedMs: 0,
		idleTime: 0,
		lastModeSignature: '',
		modeTransitionElapsed: MODE_TRANSITION_DURATION,
		modeTransitionSnapshotCanvas: null,
		previousFrameCanvas: null,
		previousFrameCaptureElapsed: Number.POSITIVE_INFINITY,
		energyEnvelope: createAudioEnvelope(),
		channelSelection: createAudioChannelSelectionState('instrumental'),
		shockwaveChannelSelection: createAudioChannelSelectionState('bass'),
		feedbackCanvas: null,
		frameHistoryCanvases: [],
		frameHistoryIndex: 0,
		shockwaves: [],
		shockwaveAdaptiveLevels: {},
		lastShockwaveLevel: 0,
		lastShockwaveResolvedChannel: 'bass',
		lastShockwaveTime: Number.NEGATIVE_INFINITY
	};
}

export function getSpectrumRuntimeState(
	instanceKey: string,
	scope: SpectrumScope = LIVE_SPECTRUM_SCOPE
): SpectrumRuntimeState {
	const existing = scope.runtimes.get(instanceKey);
	if (existing) return existing;
	const created = createSpectrumRuntimeState();
	scope.runtimes.set(instanceKey, created);
	return created;
}

export function resizeFloatArrayPreserve(
	source: Float32Array,
	nextLength: number
): Float32Array {
	if (nextLength <= 0) return new Float32Array(0);
	if (source.length === 0) return new Float32Array(nextLength);
	if (source.length === nextLength) return source.slice();

	const next = new Float32Array(nextLength);
	for (let i = 0; i < nextLength; i++) {
		const t = nextLength === 1 ? 0 : i / Math.max(nextLength - 1, 1);
		const sourceIndex = t * Math.max(source.length - 1, 0);
		const lower = Math.floor(sourceIndex);
		const upper = Math.min(source.length - 1, Math.ceil(sourceIndex));
		const alpha = sourceIndex - lower;
		next[i] = source[lower] * (1 - alpha) + source[upper] * alpha;
	}
	return next;
}

export function ensureFloatArrayLength(
	source: Float32Array,
	nextLength: number
): Float32Array {
	return source.length === nextLength ? source : new Float32Array(nextLength);
}

// Reused scratch for the radial mirror fold. Primary + clone fold sequentially
// within a frame (each fold reads its snapshot and writes back before the next
// instance runs), so a single shared buffer is safe and avoids a per-frame
// allocation.
let mirrorFoldScratch = new Float32Array(0);

/**
 * Fold a per-bin array into a figure symmetric across the vertical axis
 * (`arr[i] === arr[n - i]`). The right semicircle (`i` in `[0, n/2]`) is filled
 * with the full bin range compressed into 180°, then reflected onto the left
 * semicircle. Applied once to `pixelHeights`/`pixelPeaks` so every radial
 * family (bars, blocks, wave, dots, liquid, tunnel, orbital, spiral) inherits
 * the same symmetric source for radial mirror without per-renderer changes.
 */
export function applyRadialMirrorFold(arr: Float32Array, n: number): void {
	if (n < 2) return;
	if (mirrorFoldScratch.length < n) mirrorFoldScratch = new Float32Array(n);
	const src = mirrorFoldScratch;
	src.set(arr.subarray(0, n));
	const half = Math.floor(n / 2);
	const lastBin = n - 1;
	for (let i = 0; i <= half; i++) {
		const bin =
			half === 0
				? 0
				: Math.min(lastBin, Math.round((i / half) * lastBin));
		const value = src[bin];
		arr[i] = value;
		arr[(n - i) % n] = value;
	}
}

export function buildModeSignature(settings: SpectrumSettings): string {
	const resolvedShape = normalizeSpectrumShape(settings.spectrumShape);
	return [
		settings.spectrumFamily,
		settings.spectrumMode,
		settings.spectrumLinearOrientation,
		settings.spectrumLinearDirection,
		settings.spectrumRadialShape,
		`liquid-rigid:${[
			settings.spectrumLiquidLayer1RigidShape ? '1' : '0',
			settings.spectrumLiquidLayer2RigidShape ? '1' : '0',
			settings.spectrumLiquidLayer3RigidShape ? '1' : '0'
		].join('')}`,
		settings.spectrumRadialFitLogo ? 'fit-logo' : 'free-radial',
		resolvedShape,
		settings.spectrumMirror ? 'mirror' : 'single',
		settings.spectrumColorMode,
		settings.spectrumBandMode,
		settings.spectrumShockwaveBandMode,
		settings.spectrumBarCount,
		settings.spectrumFollowLogo ? 'follow' : 'free'
	].join('|');
}

export function ensureSnapshotCanvas(
	existing: HTMLCanvasElement | null,
	width: number,
	height: number
): HTMLCanvasElement | null {
	if (typeof document === 'undefined') return existing;
	const canvas = existing ?? document.createElement('canvas');
	if (canvas.width !== width) canvas.width = width;
	if (canvas.height !== height) canvas.height = height;
	return canvas;
}

export function copyCanvas(
	source: HTMLCanvasElement,
	target: HTMLCanvasElement | null
): void {
	if (!target) return;
	const context = target.getContext('2d');
	if (!context) return;
	context.clearRect(0, 0, target.width, target.height);
	context.drawImage(source, 0, 0, target.width, target.height);
}

export function resetSpectrumScope(scope: SpectrumScope): void {
	scope.runtimes.clear();
	scope.gradientPhase = 0;
}

export function resetSpectrumRuntime(
	scope: SpectrumScope = LIVE_SPECTRUM_SCOPE
): void {
	resetSpectrumScope(scope);
}
