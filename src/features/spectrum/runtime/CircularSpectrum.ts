import type { WallpaperState } from '@/types/wallpaper';
import {
	resolveAudioChannelValue,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';
import { publishSpectrumDiagnosticsSlice } from '@/features/spectrum/diagnostics/spectrumDiagnosticsTelemetry';
import { setDebugSpectrumAudio } from '@/lib/debug/frameAudioDebugSnapshot';
import {
	sampleBinsForChannel,
	samplePeakForChannel
} from '@/lib/audio/spectrumBinSampling';
import { normalizeSpectrumShape } from '@/features/spectrum/domain/spectrumControlConfig';
import { rotationDirectionSign } from '@/features/stageFx/stageFxConfig';
import {
	type SpectrumScope,
	type SpectrumSettings,
	MODE_TRANSITION_DURATION,
	getSpectrumRuntimeState,
	resizeFloatArrayPreserve,
	ensureFloatArrayLength,
	applyRadialMirrorFold,
	buildModeSignature,
	ensureSnapshotCanvas,
	copyCanvas,
	resetSpectrumRuntime
} from '@/features/spectrum/runtime/spectrumRuntime';
import {
	commitSpectrumFrameMemory,
	drawSpectrumEnergyBloom,
	drawSpectrumFrameMemoryUnderlay,
	drawSpectrumPeakRibbons,
	updateSpectrumShockwavesAndDraw
} from '@/features/spectrum/runtime/spectrumFrameEffects';
import { dispatchSpectrumRenderer } from '@/features/spectrum/domain/spectrumFamilyRegistry';
import {
	computeClassicGlowBlur,
	resolveGlowPerfScale
} from '@/features/spectrum/renderers/linear/linearRenderer';
import {
	getSectionLevel,
	tickManualSections
} from '@/features/spectrum/manual/spectrumManualRuntime';
import {
	getSpectrumFamilyGpuCostHint,
	resolveSpectrumRenderQuality,
	spectrumShadowBlurScale
} from '@/lib/visual/performanceQuality';
import {
	blitPixelated,
	computePixelateSmallSize,
	isPixelatePostProcessActive,
	normalizePixelateScale
} from '@/features/spectrum/domain/pixelArtHelpers';

export type { SpectrumSettings };

// Cross-family transition crossfade source. Captured at 5 Hz (the switch is
// rare and the capture is a full-viewport copy); a ~200ms-stale "from" frame is
// imperceptible in the 320ms transition.
const TRANSITION_SNAPSHOT_CAPTURE_INTERVAL = 0.2;
const EMPTY_TIME_DOMAIN = new Uint8Array(0);

function clampSpectrumScale(value: number | undefined): number {
	return Math.min(3, Math.max(0.2, value ?? 1));
}

export function resolveScaledSpectrumSettings(
	settings: SpectrumSettings
): SpectrumSettings {
	const scale = clampSpectrumScale(settings.spectrumScale);
	if (Math.abs(scale - 1) < 0.0001) return settings;
	// Scope: the radial figure is a contour wrapped around `innerRadius`, so
	// Scale has to grow it — without this, Scale fattens the wave (amplitude)
	// while the ring stays put and the figure looks unchanged. Skip when
	// Follow Logo is effective: innerRadius then comes from the logo (which
	// carries its own scale), and multiplying it would drift the ring off.
	const followLogoEffective =
		settings.spectrumMode === 'radial' &&
		settings.spectrumFollowLogo &&
		settings.logoEnabled;
	const scaleInnerRadius =
		settings.spectrumFamily === 'oscilloscope' && !followLogoEffective;
	return {
		...settings,
		spectrumMinHeight: settings.spectrumMinHeight * scale,
		spectrumMaxHeight: settings.spectrumMaxHeight * scale,
		spectrumBarWidth: Math.max(0.5, settings.spectrumBarWidth * scale),
		spectrumShadowBlur: settings.spectrumShadowBlur * scale,
		spectrumSpiralOuterRadius: settings.spectrumSpiralOuterRadius * scale,
		...(scaleInnerRadius
			? {
					spectrumInnerRadius: settings.spectrumInnerRadius * scale
				}
			: {})
	};
}

/**
 * Blur left on the context before dispatching to a family renderer. Renderers
 * set their own `shadowBlur` where they care; this survives only on draws that
 * don't (wave fills). Must stay under `computeClassicGlowBlur`'s ceiling.
 */
export function resolveAmbientShadowBlur(
	settings: SpectrumSettings,
	barCount: number,
	shadowBlurScale: number
): number {
	return computeClassicGlowBlur(settings, barCount) * shadowBlurScale;
}

/**
 * Render policy the caller owns, not the renderer — keeps `drawSpectrum` a pure
 * function of its arguments (no store dependency / import cycle) and lets the
 * offline exporter pick its own quality.
 */
export interface SpectrumRenderPolicy {
	performanceMode: WallpaperState['performanceMode'];
	showDiagnosticsHud: boolean;
}

export function drawSpectrum(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	audio: AudioSnapshot,
	settingsInput: SpectrumSettings,
	dt: number,
	policy: SpectrumRenderPolicy,
	instanceKey = 'primary',
	scope?: SpectrumScope
): void {
	if (canvas.width <= 0 || canvas.height <= 0) return;
	const settings = resolveScaledSpectrumSettings(settingsInput);
	const runtime = getSpectrumRuntimeState(instanceKey, scope);

	// ── Global retro pixelate ─────────────────────────────────────────────────
	// Draw into an offscreen "scene" canvas, blit back nearest-neighbor so the
	// whole spectrum snaps to a pixel grid. Isolated per instance.
	const pixelScale = normalizePixelateScale(settings.spectrumPixelateScale);
	const pixelateActive =
		isPixelatePostProcessActive(settings) &&
		settings.spectrumOpacity > 0.001;
	const outputCtx = ctx;
	const outputCanvas = canvas;
	if (pixelateActive) {
		runtime.pixelateSceneCanvas = ensureSnapshotCanvas(
			runtime.pixelateSceneCanvas ?? null,
			outputCanvas.width,
			outputCanvas.height
		);
		const sceneCtx = runtime.pixelateSceneCanvas?.getContext('2d') ?? null;
		if (runtime.pixelateSceneCanvas && sceneCtx) {
			sceneCtx.clearRect(
				0,
				0,
				runtime.pixelateSceneCanvas.width,
				runtime.pixelateSceneCanvas.height
			);
			ctx = sceneCtx;
			canvas = runtime.pixelateSceneCanvas;
		}
	} else if (runtime.pixelateSceneCanvas) {
		// Release the full-viewport backing store when pixelate inactive (feedbackCanvas precedent).
		runtime.pixelateSceneCanvas = null;
	}

	// Family-owned scratch buffers: release full-viewport backing stores when the family is inactive (feedbackCanvas precedent).
	if (settings.spectrumFamily !== 'oscilloscope') {
		runtime.oscilloscopePhosphorCanvas = null;
	}
	if (settings.spectrumFamily !== 'liquid') {
		runtime.liquidLayerPixelateCanvas = null;
	}

	const bins = audio.bins;
	const timeDomain = audio.timeDomain ?? EMPTY_TIME_DOMAIN;
	runtime.idleTime += dt;
	const allowSnapshotTransition = settings.spectrumFamily !== 'classic';

	const modeSignature = buildModeSignature(settings);
	if (
		allowSnapshotTransition &&
		runtime.lastModeSignature &&
		modeSignature !== runtime.lastModeSignature
	) {
		runtime.modeTransitionSnapshotCanvas = ensureSnapshotCanvas(
			runtime.modeTransitionSnapshotCanvas,
			canvas.width,
			canvas.height
		);
		copyCanvas(
			runtime.previousFrameCanvas ?? canvas,
			runtime.modeTransitionSnapshotCanvas
		);
		runtime.modeTransitionElapsed = 0;
	}
	runtime.lastModeSignature = modeSignature;
	if (!allowSnapshotTransition) {
		runtime.modeTransitionSnapshotCanvas = null;
		runtime.modeTransitionElapsed = MODE_TRANSITION_DURATION;
	}

	const barCount = settings.spectrumBarCount;
	if (runtime.smoothedHeights.length !== barCount) {
		runtime.smoothedHeights = resizeFloatArrayPreserve(
			runtime.smoothedHeights,
			barCount
		);
		runtime.peakHeights = resizeFloatArrayPreserve(
			runtime.peakHeights,
			barCount
		);
		runtime.pixelHeights = ensureFloatArrayLength(
			runtime.pixelHeights,
			barCount
		);
		runtime.pixelPeaks = ensureFloatArrayLength(
			runtime.pixelPeaks,
			barCount
		);
	}

	runtime.figureRotation += settings.spectrumFigureRotationSpeed * dt;
	let accumulatedEnergy = 0;
	const {
		resolvedChannel,
		instantLevel: channelInstant,
		value: channelSmoothed
	} = resolveAudioChannelValue(
		audio.channels,
		settings.spectrumBandMode,
		runtime.channelSelection,
		settings.spectrumAudioSmoothing,
		settings.audioAutoKickThreshold,
		settings.audioAutoSwitchHoldMs,
		audio.timestampMs
	);
	const channelDrive = channelSmoothed;

	// Audio rotation follows the tallest current FFT point in the chosen band.
	// Its optional EMA can soften the hill shape without changing the source.
	const rotationDrive = settings.spectrumRotationDrive;
	const baseRotationSpeed =
		rotationDrive === 'off' || rotationDrive === 'audio'
			? 0
			: Math.abs(settings.spectrumRotationSpeed);
	const rotationHasAudio =
		rotationDrive === 'audio' || rotationDrive === 'fixed-audio';
	const rotationChannel =
		settings.spectrumRotationChannel === 'selected'
			? resolvedChannel
			: settings.spectrumRotationChannel;
	const rotationEnergy = samplePeakForChannel(bins, rotationChannel);
	let audioRotationTarget = 0;
	if (rotationHasAudio) {
		audioRotationTarget =
			Math.max(0, rotationEnergy) * settings.spectrumRotationAudioAmount;
	}
	const rotationSmoothing = Math.min(
		0.98,
		Math.max(0, settings.spectrumRotationSmoothing)
	);
	runtime.audioRotationSpeed =
		rotationHasAudio && audioRotationTarget > 0.0001
			? runtime.audioRotationSpeed * rotationSmoothing +
				audioRotationTarget * (1 - rotationSmoothing)
			: 0;
	if (!settings.spectrumRotationInvertOnLowEnergy) {
		runtime.rotationLowEnergyInvertSign = 1;
		runtime.rotationLowEnergyInvertPendingSign = 1;
		runtime.rotationLowEnergyInvertElapsedMs = 0;
	}
	const targetLowEnergyInvert: 1 | -1 =
		settings.spectrumRotationInvertOnLowEnergy &&
		rotationEnergy <=
			Math.max(0, Math.min(1, settings.spectrumRotationInvertThreshold))
			? -1
			: 1;
	const rotationInvertHoldMs = Math.max(
		0,
		Math.min(1000, settings.spectrumRotationInvertHoldMs)
	);
	if (targetLowEnergyInvert !== runtime.rotationLowEnergyInvertPendingSign) {
		runtime.rotationLowEnergyInvertPendingSign = targetLowEnergyInvert;
		runtime.rotationLowEnergyInvertElapsedMs = 0;
	} else if (targetLowEnergyInvert !== runtime.rotationLowEnergyInvertSign) {
		runtime.rotationLowEnergyInvertElapsedMs += dt * 1000;
		if (runtime.rotationLowEnergyInvertElapsedMs >= rotationInvertHoldMs) {
			runtime.rotationLowEnergyInvertSign = targetLowEnergyInvert;
			runtime.rotationLowEnergyInvertElapsedMs = 0;
		}
	} else {
		runtime.rotationLowEnergyInvertElapsedMs = 0;
	}
	const lowEnergyInvert = settings.spectrumRotationInvertOnLowEnergy
		? runtime.rotationLowEnergyInvertSign
		: 1;
	runtime.rotation +=
		rotationDirectionSign(settings.spectrumRotationDirection) *
		lowEnergyInvert *
		(baseRotationSpeed + runtime.audioRotationSpeed) *
		dt;

	const shockwaveEnabled =
		settings.spectrumBassShockwave > 0.001 &&
		settings.spectrumShockwaveOpacity > 0.001;
	const shockwaveResolved = shockwaveEnabled
		? resolveAudioChannelValue(
				audio.channels,
				settings.spectrumShockwaveBandMode,
				runtime.shockwaveChannelSelection,
				0,
				settings.audioAutoKickThreshold,
				settings.audioAutoSwitchHoldMs,
				audio.timestampMs
			)
		: null;

	// Manual drive: tick section envelopes once per frame (viewport keyboard
	// handler pushes targets between renders), then blend per bin in the loop.
	const driveMode = settings.spectrumDriveMode;
	const manualActive = driveMode !== 'audio';
	if (manualActive) {
		tickManualSections(
			settings.spectrumManualAttack,
			settings.spectrumManualRelease,
			dt
		);
	}
	const manualSections = Math.max(
		1,
		Math.min(12, Math.round(settings.spectrumManualSections))
	);
	const manualAddWeight = Math.max(
		0,
		Math.min(1, settings.spectrumManualAddWeight)
	);

	for (let i = 0; i < barCount; i++) {
		// No synthetic "idle" signal when FFT bins are empty (paused / no capture):
		// diagnostics and routing previews must read true silence as zeros.
		let rawValue =
			bins.length === 0
				? 0
				: sampleBinsForChannel(bins, i, barCount, resolvedChannel);

		// Blend with the manual section covering this bin's range (sections are
		// evenly distributed across `barCount`); `manual` discards the FFT.
		if (manualActive) {
			const sectionIdx = Math.min(
				manualSections - 1,
				Math.floor((i / barCount) * manualSections)
			);
			const sectionLevel = getSectionLevel(sectionIdx);
			if (driveMode === 'max') {
				rawValue = Math.max(rawValue, sectionLevel);
			} else if (driveMode === 'add') {
				rawValue = Math.min(
					1,
					rawValue + sectionLevel * manualAddWeight
				);
			} else {
				// 'manual'
				rawValue = sectionLevel;
			}
		}

		accumulatedEnergy += rawValue;

		runtime.smoothedHeights[i] =
			runtime.smoothedHeights[i] * settings.spectrumSmoothing +
			rawValue * (1 - settings.spectrumSmoothing);
		const height =
			settings.spectrumMinHeight +
			runtime.smoothedHeights[i] *
				(settings.spectrumMaxHeight - settings.spectrumMinHeight);

		if (settings.spectrumPeakHold) {
			if (height > runtime.peakHeights[i])
				runtime.peakHeights[i] = height;
			else
				runtime.peakHeights[i] = Math.max(
					settings.spectrumMinHeight,
					runtime.peakHeights[i] -
						settings.spectrumPeakDecay * settings.spectrumMaxHeight
				);
		}
	}

	const energyEnvelopeState = runtime.energyEnvelope.tick(
		accumulatedEnergy / Math.max(barCount, 1),
		Math.max(dt, 1 / 120),
		{
			attack: settings.spectrumEnvelopeAttack,
			release: settings.spectrumEnvelopeRelease,
			responseSpeed: settings.spectrumEnvelopeReactivitySpeed,
			peakWindow: settings.spectrumEnvelopePeakWindow,
			peakFloor: settings.spectrumEnvelopePeakFloor,
			punch: settings.spectrumEnvelopePunch,
			scaleIntensity: 1,
			min: 0,
			max: 1
		}
	);
	// `spectrumGainExpressiveness` shapes how deep the spectrum breathes between
	// beats: 0 ignores the envelope, 1 is cinematic; >1 can near-silence when
	// Min Height is 0.
	const gainExpr = Math.max(
		0,
		Math.min(3, settings.spectrumGainExpressiveness)
	);
	const mainGainExpr = Math.min(1, gainExpr);
	const extraGainExpr = Math.max(0, gainExpr - 1);
	const gainBase = Math.max(
		0,
		1 - mainGainExpr * 0.32 - extraGainExpr * 0.34
	);
	const gainRange = mainGainExpr * 0.48 + extraGainExpr * 0.32;
	const globalGain = Math.min(
		1.6,
		gainBase +
			Math.max(energyEnvelopeState.normalizedAmplitude, channelDrive) *
				gainRange
	);

	for (let i = 0; i < barCount; i++) {
		runtime.pixelHeights[i] =
			settings.spectrumMinHeight +
			runtime.smoothedHeights[i] *
				(settings.spectrumMaxHeight - settings.spectrumMinHeight) *
				globalGain;
		runtime.pixelPeaks[i] =
			settings.spectrumMinHeight +
			Math.max(0, runtime.peakHeights[i] - settings.spectrumMinHeight) *
				globalGain;
	}

	// Radial mirror folds heights into a vertically-symmetric figure (each
	// semicircle shows the full spectrum, reflected), once here so every radial
	// family inherits it. Linear mirror reflects geometry, handled per-renderer.
	if (
		settings.spectrumMirror &&
		settings.spectrumMode === 'radial' &&
		barCount > 1
	) {
		applyRadialMirrorFold(runtime.pixelHeights, barCount);
		if (settings.spectrumPeakHold) {
			applyRadialMirrorFold(runtime.pixelPeaks, barCount);
		}
	}

	const cx =
		canvas.width / 2 +
		(settings.spectrumPositionX ?? 0) * canvas.width * 0.5;
	const cy =
		canvas.height / 2 -
		(settings.spectrumPositionY ?? 0) * canvas.height * 0.5;
	const performanceMode = policy.performanceMode;
	const renderQuality = resolveSpectrumRenderQuality(
		performanceMode,
		settings.spectrumFamily
	);
	const shadowBlurScale = spectrumShadowBlurScale(renderQuality);

	const meanBinEnergy = accumulatedEnergy / Math.max(barCount, 1);
	setDebugSpectrumAudio({
		bandModeRequested: settings.spectrumBandMode,
		resolvedChannel,
		channelInstant,
		channelRouterSmoothed: channelSmoothed,
		meanBinEnergy,
		globalGain,
		barCount,
		instance: instanceKey === 'primary' ? 'primary' : 'clone'
	});

	if (policy.showDiagnosticsHud) {
		const followEffective = Boolean(
			settings.spectrumMode === 'radial' &&
			settings.spectrumFollowLogo &&
			settings.logoEnabled
		);
		publishSpectrumDiagnosticsSlice({
			instance: instanceKey,
			bandModeRequested: settings.spectrumBandMode,
			resolvedChannel,
			channelInstant,
			channelSmoothed,
			meanBinEnergy,
			envelopeNormalized: energyEnvelopeState.normalizedAmplitude,
			globalGain,
			spectrumMode: settings.spectrumMode,
			spectrumFamily: settings.spectrumFamily,
			renderQualityTier: renderQuality,
			familyGpuCostHint: getSpectrumFamilyGpuCostHint(
				settings.spectrumFamily
			),
			followLogoSetting: settings.spectrumFollowLogo,
			followLogoEffective: followEffective,
			innerRadius: settings.spectrumInnerRadius,
			canvasCx: cx,
			canvasCy: cy,
			positionNormX: settings.spectrumPositionX ?? 0,
			positionNormY: settings.spectrumPositionY ?? 0,
			barCount
		});
	}
	const usesLayeredLiquidShape = settings.spectrumFamily === 'liquid';
	const effectiveRadialAngleDeg = usesLayeredLiquidShape
		? 0
		: settings.spectrumRadialAngle +
			(runtime.figureRotation * 180) / Math.PI;
	const audioGlowDrive =
		energyEnvelopeState.normalizedAmplitude *
		(settings.spectrumGlowAudioAmount ?? 0);
	const effectiveGlowIntensity = Math.min(
		6,
		settings.spectrumGlowIntensity + audioGlowDrive
	);
	// Floor only rescues radius 0; a nonzero user blur is respected and scales with performance mode.
	const manualGlowRescueFloor =
		settings.spectrumManualGlow &&
		settings.spectrumGlowIntensity > 0.001 &&
		settings.spectrumShadowBlur <= 0.001
			? 12 * resolveGlowPerfScale(settings)
			: 0;
	const effectiveShadowBlur =
		audioGlowDrive > 0.001
			? Math.max(settings.spectrumShadowBlur, audioGlowDrive * 14)
			: Math.max(settings.spectrumShadowBlur, manualGlowRescueFloor);
	const renderSettings = {
		...settings,
		spectrumGlowIntensity: effectiveGlowIntensity,
		spectrumShadowBlur: effectiveShadowBlur,
		spectrumRadialAngle: effectiveRadialAngleDeg
	};
	const radialAngle = (effectiveRadialAngleDeg * Math.PI) / 180;
	const resolvedShape = normalizeSpectrumShape(settings.spectrumShape);

	// Extra instances draw after the main spectrum on the same canvas; full-frame
	// FX clip to the radial ring so they cannot composite over the main spectrum.
	const shouldClipCloneRadialFx =
		instanceKey !== 'primary' && settings.spectrumMode === 'radial';
	if (shouldClipCloneRadialFx) {
		const ghost = Math.min(1, Math.max(0, settings.spectrumGhostFrames));
		const trails = Math.min(1, Math.max(0, settings.spectrumMotionTrails));
		const ribbons = Math.min(
			1.5,
			Math.max(0, settings.spectrumPeakRibbons)
		);
		const clipR =
			settings.spectrumInnerRadius +
			settings.spectrumMaxHeight +
			36 +
			ribbons * 10 +
			(ghost + trails) * 52;
		ctx.save();
		ctx.beginPath();
		ctx.arc(cx, cy, clipR, 0, Math.PI * 2);
		ctx.clip();
	}

	drawSpectrumFrameMemoryUnderlay(
		ctx,
		canvas,
		runtime,
		renderSettings,
		energyEnvelopeState.normalizedAmplitude,
		performanceMode,
		renderQuality
	);
	drawSpectrumEnergyBloom(
		ctx,
		canvas,
		renderSettings,
		energyEnvelopeState.normalizedAmplitude,
		cx,
		cy,
		renderQuality
	);

	ctx.save();
	ctx.globalAlpha = settings.spectrumOpacity;
	ctx.shadowBlur = resolveAmbientShadowBlur(
		renderSettings,
		barCount,
		shadowBlurScale
	);
	ctx.shadowColor = renderSettings.spectrumPrimaryColor;

	// ── Route to family renderer via central registry ────────────────────────
	if (settings.spectrumOpacity > 0.001) {
		dispatchSpectrumRenderer(
			renderSettings.spectrumFamily,
			renderSettings.spectrumMode,
			{
				ctx,
				canvas,
				bins,
				timeDomain,
				runtime,
				settings: renderSettings,
				dt,
				audioEnergy: energyEnvelopeState.normalizedAmplitude,
				cx,
				cy,
				resolvedShape,
				barCount,
				radialAngle,
				scope
			}
		);
	}

	ctx.restore();

	drawSpectrumPeakRibbons(
		ctx,
		canvas,
		runtime,
		renderSettings,
		cx,
		cy,
		renderQuality
	);
	if (shockwaveResolved) {
		updateSpectrumShockwavesAndDraw(
			ctx,
			canvas,
			runtime,
			renderSettings,
			dt,
			shockwaveResolved.instantLevel,
			shockwaveResolved.resolvedChannel,
			energyEnvelopeState.normalizedAmplitude,
			cx,
			cy,
			performanceMode,
			renderQuality
		);
	} else if (runtime.shockwaves && runtime.shockwaves.length > 0) {
		runtime.shockwaves.length = 0;
	}

	if (shouldClipCloneRadialFx) {
		ctx.restore();
	}

	if (
		allowSnapshotTransition &&
		runtime.modeTransitionSnapshotCanvas &&
		runtime.modeTransitionElapsed < MODE_TRANSITION_DURATION
	) {
		runtime.modeTransitionElapsed = Math.min(
			MODE_TRANSITION_DURATION,
			runtime.modeTransitionElapsed + dt
		);
		const progress =
			runtime.modeTransitionElapsed / MODE_TRANSITION_DURATION;
		const eased = progress * progress * (3 - 2 * progress);
		const alpha = 1 - eased;
		if (alpha > 0.001) {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.drawImage(
				runtime.modeTransitionSnapshotCanvas,
				0,
				0,
				canvas.width,
				canvas.height
			);
			ctx.restore();
		} else {
			runtime.modeTransitionSnapshotCanvas = null;
		}
	}

	if (allowSnapshotTransition) {
		runtime.previousFrameCaptureElapsed += dt;
		if (
			!runtime.previousFrameCanvas ||
			runtime.previousFrameCaptureElapsed >=
				TRANSITION_SNAPSHOT_CAPTURE_INTERVAL
		) {
			runtime.previousFrameCanvas = ensureSnapshotCanvas(
				runtime.previousFrameCanvas,
				canvas.width,
				canvas.height
			);
			copyCanvas(canvas, runtime.previousFrameCanvas);
			runtime.previousFrameCaptureElapsed = 0;
		}
	} else {
		// Classic uses no cross-family snapshots: skip the viewport copy, release stale buffers.
		runtime.previousFrameCanvas = null;
		runtime.previousFrameCaptureElapsed = Number.POSITIVE_INFINITY;
	}
	commitSpectrumFrameMemory(runtime, canvas, settings, renderQuality);

	// Composite the pixelated scene back onto the real canvas.
	if (pixelateActive && canvas !== outputCanvas) {
		blitPixelatedScene(outputCtx, canvas, runtime, pixelScale);
	}
}

/**
 * Downscales the rendered spectrum scene to 1/scale then upscales it back with
 * smoothing off, producing hard square pixels. Two cached offscreen canvases on
 * the runtime keep this allocation-free per frame.
 */
function blitPixelatedScene(
	outCtx: CanvasRenderingContext2D,
	sceneCanvas: HTMLCanvasElement,
	runtime: ReturnType<typeof getSpectrumRuntimeState>,
	scale: number
): void {
	const { width: sw, height: sh } = computePixelateSmallSize(
		sceneCanvas.width,
		sceneCanvas.height,
		scale
	);
	runtime.pixelateSmallCanvas = ensureSnapshotCanvas(
		runtime.pixelateSmallCanvas ?? null,
		sw,
		sh
	);
	blitPixelated(outCtx, sceneCanvas, runtime.pixelateSmallCanvas ?? null);
}

export function resetSpectrum(): void {
	resetSpectrumRuntime();
}
