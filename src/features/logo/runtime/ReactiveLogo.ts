import type { WallpaperState } from '@/types/wallpaper';
import { LIVE_LOGO_SCOPE, type LogoScope } from './logoScope';

type LogoSettings = Pick<
	WallpaperState,
	| 'logoUrl'
	| 'logoBaseSize'
	| 'logoPositionX'
	| 'logoPositionY'
	| 'logoCircularCrop'
	| 'logoCropRadius'
	| 'logoBandMode'
	| 'logoAudioSmoothing'
	| 'logoReactiveScaleIntensity'
	| 'logoReactivitySpeed'
	| 'logoAttack'
	| 'logoRelease'
	| 'logoMinScale'
	| 'logoMaxScale'
	| 'logoPunch'
	| 'logoPeakWindow'
	| 'logoPeakFloor'
	| 'logoGlowEnabled'
	| 'logoGlowColor'
	| 'logoGlowBlur'
	| 'logoGlowReach'
	| 'logoGlowAudioAmount'
	| 'logoShadowEnabled'
	| 'logoShadowColor'
	| 'logoShadowBlur'
	| 'logoBackdropEnabled'
	| 'logoBackdropColor'
	| 'logoBackdropOpacity'
	| 'logoBackdropPadding'
	| 'logoRotationSpeed'
>;

/**
 * Loaded logo images, keyed by URL.
 *
 * A single slot would be enough for a logo the user picks once, but the app's
 * own mark now swaps between its vector and pixel versions with the spectrum's
 * pixelate switch. With one slot every toggle re-decodes the image and drops a
 * frame of logo; a handful of slots makes the swap instant in both directions.
 */
const LOGO_IMAGE_CACHE_MAX = 4;
const logoImages = new Map<string, HTMLImageElement>();

// Per-frame state lives on a LogoScope (see logoScope.ts). The default is the
// live scope, so the viewport keeps working unchanged; the offline export
// threads its own scope so the two never share envelope/rotation state.

/**
 * Cap the per-frame blur radius so the upper end of the slider doesn't
 * descend into "fuzzy potato" territory + tank perf for nothing. Past ~80px
 * canvas2D shadow blur stops adding visible halo on a logo-sized sprite —
 * it just smears the silhouette across the canvas. 80 lines up with the
 * `glowBlur` slider max and gives the `shadowBlur` slider some headroom on
 * the modulator (which can multiply by up to 3.6× audio).
 */
const LOGO_BLUR_CAP = 80;
function capLogoBlur(blur: number): number {
	return Math.min(blur, LOGO_BLUR_CAP);
}

interface LogoRenderState {
	scale: number;
	normalizedAmplitude: number;
	smoothedAmplitude: number;
	adaptivePeak: number;
	adaptiveFloor: number;
}

function getImage(url: string): HTMLImageElement | null {
	const cached = logoImages.get(url);
	if (cached) return cached.complete ? cached : null;
	const img = new Image();
	img.src = url;
	if (logoImages.size >= LOGO_IMAGE_CACHE_MAX) {
		const oldest = logoImages.keys().next().value;
		if (oldest !== undefined) logoImages.delete(oldest);
	}
	logoImages.set(url, img);
	return img.complete ? img : null;
}

export function drawLogo(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	amplitude: number,
	dt: number,
	settings: LogoSettings,
	scope: LogoScope = LIVE_LOGO_SCOPE
): void {
	const {
		logoUrl,
		logoBaseSize,
		logoPositionX,
		logoPositionY,
		logoCircularCrop,
		logoCropRadius,
		logoGlowEnabled,
		logoGlowColor,
		logoGlowBlur,
		logoGlowReach,
		logoGlowAudioAmount,
		logoShadowEnabled,
		logoShadowColor,
		logoShadowBlur,
		logoBackdropEnabled,
		logoBackdropColor,
		logoBackdropOpacity,
		logoBackdropPadding,
		logoRotationSpeed
	} = settings;

	scope.rotation += logoRotationSpeed * dt;

	const envelopeState = scope.envelope.tick(amplitude, dt, {
		attack: settings.logoAttack,
		release: settings.logoRelease,
		responseSpeed: settings.logoReactivitySpeed * 2.4,
		peakWindow: settings.logoPeakWindow,
		peakFloor: settings.logoPeakFloor,
		punch: settings.logoPunch,
		scaleIntensity: settings.logoReactiveScaleIntensity,
		min: settings.logoMinScale,
		max: settings.logoMaxScale
	});

	const scale = envelopeState.value;
	const { normalizedAmplitude } = envelopeState;
	const size = logoBaseSize * scale;

	const cx = canvas.width / 2 + logoPositionX * canvas.width * 0.5;
	const cy = canvas.height / 2 - logoPositionY * canvas.height * 0.5;

	// Backdrop circle
	if (logoBackdropEnabled) {
		const r = size / 2 + logoBackdropPadding;
		ctx.save();
		ctx.globalAlpha = logoBackdropOpacity;
		ctx.fillStyle = logoBackdropColor;
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	// Glow ring — fully gated by `logoGlowEnabled`. Previously the ring
	// always drew (even with blur=0) which left a permanent 2px stroke
	// around the logo, so there was no way to get a "clean logo only" look.
	if (logoGlowEnabled) {
		const glowReach = Math.max(1, Math.min(3, logoGlowReach ?? 1));
		const audioGlowBoost = Math.max(0, logoGlowAudioAmount ?? 0);
		const glowDrive = normalizedAmplitude * audioGlowBoost;
		const ringRadius =
			size / 2 + (logoBackdropEnabled ? logoBackdropPadding : 0);
		ctx.save();
		ctx.shadowColor = logoGlowColor;
		ctx.strokeStyle = logoGlowColor;
		ctx.lineWidth = 2 + glowReach * 1.4 + glowDrive * 1.2;
		ctx.shadowBlur = capLogoBlur(
			logoGlowBlur * glowReach * (1 + glowDrive * 2.6)
		);
		ctx.globalAlpha = 0.16 + glowDrive * 0.26 + (glowReach - 1) * 0.08;
		ctx.beginPath();
		ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
		ctx.stroke();
		ctx.lineWidth = 2;
		ctx.shadowBlur = capLogoBlur(
			Math.max(1, logoGlowBlur * 0.42) * (1 + glowDrive * 1.8)
		);
		ctx.globalAlpha = 0.42 + glowDrive * 0.58;
		ctx.beginPath();
		ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}

	if (!logoUrl) return;

	const img = getImage(logoUrl);
	if (!img || !img.complete || img.naturalWidth === 0) return;

	ctx.save();
	if (logoShadowEnabled) {
		ctx.shadowBlur = capLogoBlur(
			logoShadowBlur * (1 + normalizedAmplitude * 1.8)
		);
		ctx.shadowColor = logoShadowColor;
	}
	ctx.globalAlpha = 1;
	// Rotation: translate to centre, rotate, draw image centred at origin.
	// The backdrop + glow ring are radially symmetric so they don't need
	// the same transform — only the image silhouette has visible rotation.
	ctx.translate(cx, cy);
	if (scope.rotation !== 0) {
		ctx.rotate(scope.rotation);
	}
	if (logoCircularCrop) {
		const radius = (size / 2) * Math.max(0.1, Math.min(1, logoCropRadius));
		ctx.beginPath();
		ctx.arc(0, 0, radius, 0, Math.PI * 2);
		ctx.clip();
	}
	ctx.drawImage(img, -size / 2, -size / 2, size, size);
	ctx.restore();
}

export function getSmoothedAmplitude(
	scope: LogoScope = LIVE_LOGO_SCOPE
): number {
	return scope.envelope.getState().smoothedAmplitude;
}

/** Devuelve la imagen del logo ya cacheada, o null si aún no cargó. */
export function getCachedLogoImage(url: string): HTMLImageElement | null {
	const img = logoImages.get(url);
	if (img && img.complete && img.naturalWidth > 0) return img;
	return null;
}

/** Rotación actual acumulada del logo (rad). Actualizada por drawLogo(). */
export function getLogoRotation(scope: LogoScope = LIVE_LOGO_SCOPE): number {
	return scope.rotation;
}

export function getLogoRenderState(
	scope: LogoScope = LIVE_LOGO_SCOPE
): LogoRenderState {
	const s = scope.envelope.getState();
	return {
		scale: s.value,
		normalizedAmplitude: s.normalizedAmplitude,
		smoothedAmplitude: s.smoothedAmplitude,
		adaptivePeak: s.adaptivePeak,
		adaptiveFloor: s.adaptiveFloor
	};
}

export function resetLogo(scope: LogoScope = LIVE_LOGO_SCOPE): void {
	scope.envelope.reset();
	scope.rotation = 0;
}

export function resetLogoRotation(scope: LogoScope = LIVE_LOGO_SCOPE): void {
	scope.rotation = 0;
}
