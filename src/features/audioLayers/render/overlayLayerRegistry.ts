import {
	resolveAudioChannelValue,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';
import {
	clearSpectrumDiagnosticsClone,
	clearSpectrumDiagnosticsPrimary
} from '@/features/spectrum';
import type { SpectrumScope } from '@/features/spectrum';
import {
	publishLogoDiagnosticsTelemetry,
	LIVE_LOGO_SCOPE,
	type LogoScope
} from '@/features/logo';
import { applySpectrumPlacementToState } from '@/features/spectrum';
import {
	createDefaultSpectrumInstanceSettings,
	getSpectrumInstanceRuntimeKey
} from '@/features/spectrum';
import {
	resolveResponsiveLyricsSettings,
	resolveResponsiveLogoSettings,
	resolveResponsiveSpectrumSettings,
	resolveResponsiveTrackTitleSettings
} from '@/features/layout/responsiveLayout';
import {
	getEditorThemePalette,
	resolveModeDrivenColors,
	resolveThemeColor,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import { getLruEntry, setLruEntry } from '@/lib/lruCache';
import {
	clearDebugSpectrumClone,
	setDebugLogoAudio
} from '@/lib/debug/frameAudioDebugSnapshot';
import { resolveAppLogoUrl, shouldUsePixelAppLogo } from '@/config/appLogo';
import type { OverlayLayer } from '@/types/layers';
import type {
	ResolvedAudioReactiveChannel,
	WallpaperState
} from '@/types/wallpaper';
import {
	drawLogo,
	getLogoRenderState,
	getCachedLogoImage,
	getLogoRotation
} from '@/features/logo';
import { drawLogoFlashEdge } from '@/features/flashEdge/flashEdgeRenderer';
import {
	getFlashEdgeDrive,
	getFlashEdgeColor,
	type FlashEdgeScope
} from '@/features/stageFx/flashEdgeDrive';
import { syntheticKickValue } from '@/features/calibration';
import { drawSpectrum } from '@/features/spectrum/render';
import { drawTrackTitleOverlay } from '@/features/audioLayers/render/trackTitleOverlay';
import {
	LIVE_TRACK_TITLE_SCOPE,
	type TrackTitleScope
} from '@/features/audioLayers/render/trackTitleScope';
import type { NowPlayingData } from '@/features/audioLayers/render/nowPlayingWidget';
import { drawLyricsOverlay } from '@/features/lyrics';
import { resolveActiveAudioAssetId } from '@/lib/audio/activeTrack';

export interface OverlayRenderContext {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	state: WallpaperState;
	audio: AudioSnapshot;
	dt: number;
	nowPlaying: NowPlayingData;
	trackCurrentTime: number;
	trackDuration: number;
	palette: BackgroundPalette;
	/**
	 * Scoped draw state (offline export). Absent = the domain's LIVE scope,
	 * which is what the live canvas uses.
	 */
	logoScope?: LogoScope;
	spectrumScope?: SpectrumScope;
	flashEdge?: FlashEdgeScope;
	trackTitleScope?: TrackTitleScope;
}

const OVERLAY_IMAGE_CACHE_LIMIT = 12;
const imageCache = new Map<string, HTMLImageElement>();

function getCachedImage(url: string): HTMLImageElement {
	const cached = getLruEntry(imageCache, url);
	if (cached) return cached;

	const image = new Image();
	image.src = url;
	setLruEntry(imageCache, url, image, OVERLAY_IMAGE_CACHE_LIMIT);
	return image;
}

function drawOverlayImage(
	layer: Extract<OverlayLayer, { type: 'overlay-image' }>,
	context: OverlayRenderContext
): void {
	if (!layer.imageUrl) return;

	const image = getCachedImage(layer.imageUrl);
	if (!image.complete || image.naturalWidth === 0) return;

	const cx =
		context.canvas.width / 2 + layer.positionX * context.canvas.width;
	const cy =
		context.canvas.height / 2 - layer.positionY * context.canvas.height;
	const width = layer.width * layer.scale;
	const height = layer.height * layer.scale;

	context.ctx.save();
	context.ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
	context.ctx.translate(cx, cy);
	context.ctx.rotate((layer.rotation * Math.PI) / 180);
	context.ctx.drawImage(image, -width / 2, -height / 2, width, height);
	context.ctx.restore();
}

function resolveLogoDrive(context: OverlayRenderContext): {
	amplitude: number;
	resolvedChannel: ResolvedAudioReactiveChannel;
	channelInstant: number;
	channelRouterSmoothed: number;
} {
	const { state, audio } = context;
	const channelSelection =
		context.logoScope?.channelSelection ?? LIVE_LOGO_SCOPE.channelSelection;
	const resolved = resolveAudioChannelValue(
		audio.channels,
		state.logoBandMode,
		channelSelection,
		state.logoAudioSmoothing,
		state.audioAutoKickThreshold,
		state.audioAutoSwitchHoldMs,
		audio.timestampMs
	);
	// Calibration "Sintético" mode: drive the real logo with the same 120 BPM
	// test pulse the preview canvas uses, so it can be calibrated in silence.
	const synthetic = state.calibrationSyntheticGroups.logo === true;
	const drive = synthetic
		? syntheticKickValue(performance.now() / 1000)
		: resolved.value;
	const amplitude = Math.min(
		3.2,
		Math.max(0, drive) * state.logoAudioSensitivity * 1.18
	);
	return {
		amplitude,
		resolvedChannel: resolved.resolvedChannel,
		channelInstant: synthetic ? drive : resolved.instantLevel,
		channelRouterSmoothed: synthetic ? drive : resolved.value
	};
}

function resolveMainSpectrumState(
	state: WallpaperState,
	backgroundPalette: BackgroundPalette,
	themePalette: BackgroundPalette
): WallpaperState & {
	spectrumRainbowColors?: string[];
	spectrumGlowRainbowColors?: string[];
} {
	const resolvedColors = resolveModeDrivenColors(
		state.spectrumColorSource,
		state.spectrumPrimaryColor,
		state.spectrumSecondaryColor,
		backgroundPalette,
		themePalette
	);
	// The glow carries its own color source/colors, resolved independently of
	// the fill so it works in manual / image / theme alike.
	const resolvedGlow = resolveModeDrivenColors(
		state.spectrumGlowColorSource,
		state.spectrumGlowPrimaryColor,
		state.spectrumGlowSecondaryColor,
		backgroundPalette,
		themePalette
	);
	return {
		...state,
		spectrumPrimaryColor: resolvedColors.primaryColor,
		spectrumSecondaryColor: resolvedColors.secondaryColor,
		spectrumRainbowColors: resolvedColors.rainbowColors,
		spectrumGlowPrimaryColor: resolvedGlow.primaryColor,
		spectrumGlowSecondaryColor: resolvedGlow.secondaryColor,
		// Rainbow / rotate glow samples its own palette, so an image-driven glow
		// can sweep the wallpaper's colors independently of the fill.
		spectrumGlowRainbowColors: resolvedGlow.rainbowColors
	};
}

function resolveLogoColorState(
	state: WallpaperState,
	backgroundPalette: BackgroundPalette,
	themePalette: BackgroundPalette
): WallpaperState {
	return {
		...state,
		logoGlowColor: resolveThemeColor(
			state.logoGlowColorSource,
			state.logoGlowColor,
			backgroundPalette,
			themePalette,
			'accent'
		),
		logoShadowColor: resolveThemeColor(
			state.logoShadowColorSource,
			state.logoShadowColor,
			backgroundPalette,
			themePalette,
			'accent'
		),
		logoBackdropColor: resolveThemeColor(
			state.logoBackdropColorSource,
			state.logoBackdropColor,
			backgroundPalette,
			themePalette,
			'backdrop'
		),
		// A smooth mark floating over a pixelated spectrum reads as a mistake,
		// so the app's own logo follows the pixelate switch. A logo the user
		// uploaded is left exactly as they set it.
		logoUrl: resolveAppLogoUrl(
			state.logoUrl,
			state.logoVariantMode,
			shouldUsePixelAppLogo(state)
		)
	};
}

function resolveTrackColorState(
	state: WallpaperState,
	backgroundPalette: BackgroundPalette,
	themePalette: BackgroundPalette
): WallpaperState {
	return {
		...state,
		audioTrackTitleTextColor: resolveThemeColor(
			state.audioTrackTitleTextColorSource,
			state.audioTrackTitleTextColor,
			backgroundPalette,
			themePalette,
			'text'
		),
		audioTrackTitleStrokeColor: resolveThemeColor(
			state.audioTrackTitleStrokeColorSource,
			state.audioTrackTitleStrokeColor,
			backgroundPalette,
			themePalette,
			'accent'
		),
		audioTrackTitleGlowColor: resolveThemeColor(
			state.audioTrackTitleGlowColorSource,
			state.audioTrackTitleGlowColor,
			backgroundPalette,
			themePalette,
			'secondary'
		),
		audioTrackTitleBackdropColor: resolveThemeColor(
			state.audioTrackTitleBackdropColorSource,
			state.audioTrackTitleBackdropColor,
			backgroundPalette,
			themePalette,
			'backdrop'
		),
		audioTrackTimeTextColor: resolveThemeColor(
			state.audioTrackTimeTextColorSource,
			state.audioTrackTimeTextColor,
			backgroundPalette,
			themePalette,
			'text'
		),
		audioTrackTimeStrokeColor: resolveThemeColor(
			state.audioTrackTimeStrokeColorSource,
			state.audioTrackTimeStrokeColor,
			backgroundPalette,
			themePalette,
			'accent'
		),
		audioTrackTimeGlowColor: resolveThemeColor(
			state.audioTrackTimeGlowColorSource,
			state.audioTrackTimeGlowColor,
			backgroundPalette,
			themePalette,
			'secondary'
		),
		nowPlayingAccentColor: resolveThemeColor(
			state.nowPlayingAccentColorSource,
			state.nowPlayingAccentColor,
			backgroundPalette,
			themePalette,
			'accent'
		)
	};
}

function resolveLyricsColorState(
	state: WallpaperState,
	backgroundPalette: BackgroundPalette,
	themePalette: BackgroundPalette
): WallpaperState {
	return {
		...state,
		audioLyricsActiveColor: resolveThemeColor(
			state.audioLyricsActiveColorSource,
			state.audioLyricsActiveColor,
			backgroundPalette,
			themePalette,
			'text'
		),
		audioLyricsInactiveColor: resolveThemeColor(
			state.audioLyricsInactiveColorSource,
			state.audioLyricsInactiveColor,
			backgroundPalette,
			themePalette,
			'secondary'
		),
		audioLyricsGlowColor: resolveThemeColor(
			state.audioLyricsGlowColorSource,
			state.audioLyricsGlowColor,
			backgroundPalette,
			themePalette,
			'secondary'
		),
		audioLyricsBackdropColor: resolveThemeColor(
			state.audioLyricsBackdropColorSource,
			state.audioLyricsBackdropColor,
			backgroundPalette,
			themePalette,
			'backdrop'
		)
	};
}

function resolveResponsiveOverlayState(
	state: WallpaperState,
	canvasWidth: number,
	canvasHeight: number
): WallpaperState {
	return resolveResponsiveLyricsSettings(
		resolveResponsiveTrackTitleSettings(
			resolveResponsiveSpectrumSettings(
				resolveResponsiveLogoSettings(state, canvasWidth, canvasHeight),
				canvasWidth,
				canvasHeight
			),
			canvasWidth,
			canvasHeight
		),
		canvasWidth,
		canvasHeight
	);
}

export function drawOverlayLayer(
	layer: OverlayLayer,
	context: OverlayRenderContext
): void {
	if (!layer.enabled) return;
	const themePalette = getEditorThemePalette(context.state.editorTheme);
	const responsiveState = resolveResponsiveOverlayState(
		context.state,
		context.canvas.width,
		context.canvas.height
	);

	if (layer.type === 'overlay-image') {
		drawOverlayImage(layer, context);
		return;
	}

	if (layer.type === 'logo') {
		const logoScope = context.logoScope;
		const logoDrive = resolveLogoDrive(context);
		const resolvedState = resolveLogoColorState(
			responsiveState,
			context.palette,
			themePalette
		);
		drawLogo(
			context.ctx,
			context.canvas,
			logoDrive.amplitude,
			context.dt,
			resolvedState,
			logoScope
		);

		// Reactive Neon Edge — usa el driver compartido del Flash Light.
		if (resolvedState.logoFlashEdgeEnabled) {
			const rs = getLogoRenderState(logoScope);
			const logoCx =
				context.canvas.width / 2 +
				resolvedState.logoPositionX * context.canvas.width * 0.5;
			const logoCy =
				context.canvas.height / 2 -
				resolvedState.logoPositionY * context.canvas.height * 0.5;
			const logoSize = resolvedState.logoBaseSize * rs.scale;
			const img = resolvedState.logoUrl
				? getCachedLogoImage(resolvedState.logoUrl)
				: null;
			if (img) {
				drawLogoFlashEdge(
					context.ctx,
					logoCx,
					logoCy,
					logoSize,
					getLogoRotation(logoScope),
					img,
					{
						enabled: resolvedState.logoFlashEdgeEnabled,
						intensityMult: resolvedState.logoFlashEdgeIntensityMult,
						thickness: resolvedState.logoFlashEdgeThickness,
						radius: resolvedState.logoFlashEdgeRadius,
						colorMode: resolvedState.logoFlashEdgeColorMode,
						color: resolvedState.logoFlashEdgeColor
					},
					getFlashEdgeDrive(context.flashEdge),
					getFlashEdgeColor(context.flashEdge),
					resolvedState.logoCircularCrop,
					resolvedState.logoCropRadius
				);
			}
		}

		const rs = getLogoRenderState(logoScope);
		const st = resolvedState;
		setDebugLogoAudio({
			bandModeRequested: st.logoBandMode,
			resolvedChannel: logoDrive.resolvedChannel,
			channelInstant: logoDrive.channelInstant,
			channelRouterSmoothed: logoDrive.channelRouterSmoothed,
			driveScaled: logoDrive.amplitude,
			envelopeScale: rs.scale
		});
		if (context.state.showLogoDiagnosticsHud) {
			publishLogoDiagnosticsTelemetry({
				bandModeRequested: st.logoBandMode,
				resolvedChannel: logoDrive.resolvedChannel,
				channelInstant: logoDrive.channelInstant,
				driveScaled: logoDrive.amplitude,
				envelopeScale: rs.scale,
				normalizedAmplitude: rs.normalizedAmplitude,
				smoothedAmplitude: rs.smoothedAmplitude,
				adaptivePeak: rs.adaptivePeak,
				adaptiveFloor: rs.adaptiveFloor,
				logoBaseSize: st.logoBaseSize,
				renderedSize: st.logoBaseSize * rs.scale,
				logoPositionX: st.logoPositionX,
				logoPositionY: st.logoPositionY,
				spectrumFollowLogo: st.spectrumFollowLogo,
				spectrumUsesLogoPlacement: Boolean(
					st.spectrumEnabled &&
					st.spectrumMode === 'radial' &&
					st.spectrumFollowLogo &&
					st.logoEnabled
				),
				logoEnabled: st.logoEnabled
			});
		}
		return;
	}

	if (layer.type === 'track-title') {
		const resolvedState = resolveTrackColorState(
			responsiveState,
			context.palette,
			themePalette
		);
		drawTrackTitleOverlay(
			context.ctx,
			context.canvas,
			context.nowPlaying,
			context.trackCurrentTime,
			context.trackDuration,
			context.dt,
			resolvedState,
			context.trackTitleScope ?? LIVE_TRACK_TITLE_SCOPE
		);
		return;
	}

	if (layer.type === 'lyrics') {
		const resolvedState = resolveLyricsColorState(
			responsiveState,
			context.palette,
			themePalette
		);
		drawLyricsOverlay(
			context.ctx,
			context.canvas,
			resolvedState,
			resolveActiveAudioAssetId(resolvedState),
			context.trackCurrentTime,
			context.trackDuration,
			// Per-layer color sources (manual / current image / theme) resolve
			// against the same palettes Spectrum uses.
			{ background: context.palette, theme: themePalette }
		);
		return;
	}

	if (layer.type === 'spectrum') {
		// Main and extra instances are independently visible: any of them can
		// render without the others. `spectrumEnabled` is the master switch.
		const willDrawMain =
			responsiveState.spectrumEnabled &&
			responsiveState.spectrumMainVisible &&
			responsiveState.spectrumOpacity > 0.001;
		const activeInstances = responsiveState.spectrumEnabled
			? responsiveState.spectrumInstances.filter(
					instance =>
						instance.enabled && instance.spectrumOpacity > 0.001
				)
			: [];
		if (activeInstances.length === 0) {
			clearDebugSpectrumClone();
			clearSpectrumDiagnosticsClone();
		}
		if (!willDrawMain) {
			clearSpectrumDiagnosticsPrimary();
		}
		if (!willDrawMain && activeInstances.length === 0) {
			return;
		}

		const logoScale = getLogoRenderState(context.logoScope).scale;
		// Render policy is the caller's to supply — the renderer no longer reads
		// the store itself (see SpectrumRenderPolicy).
		const spectrumRenderPolicy = {
			performanceMode: context.state.performanceMode,
			showDiagnosticsHud: context.state.showSpectrumDiagnosticsHud
		};

		if (willDrawMain) {
			const primarySpectrumState = applySpectrumPlacementToState(
				responsiveState,
				{ logoScale }
			);
			const resolvedPrimarySpectrumState = resolveMainSpectrumState(
				primarySpectrumState,
				context.palette,
				themePalette
			);

			drawSpectrum(
				context.ctx,
				context.canvas,
				context.audio,
				resolvedPrimarySpectrumState,
				context.dt,
				spectrumRenderPolicy,
				'primary',
				context.spectrumScope
			);
		}

		// Extra instances carry the same main-named keys, so merging them over
		// the raw state and re-running the responsive/placement/color pipeline
		// reuses the exact main code path (linear and radial alike).
		for (const instance of activeInstances) {
			// Guard against persisted instances that predate a key being added to
			// SPECTRUM_INSTANCE_SETTING_KEYS (if the version bump was missed, the
			// instance won't have the key and S1's flat-state value would bleed
			// through). Layering defaults between responsiveState and the instance
			// ensures the correct per-instance default always wins over S1.
			const instanceWithDefaults = {
				...createDefaultSpectrumInstanceSettings(),
				...instance
			};
			// Merging over responsiveState keeps the responsive logo values;
			// every spectrum key the responsive pass scales is overwritten by
			// the instance's raw value here, so re-resolving cannot double-scale.
			const instanceState = applySpectrumPlacementToState(
				resolveResponsiveSpectrumSettings(
					{ ...responsiveState, ...instanceWithDefaults },
					context.canvas.width,
					context.canvas.height
				),
				{ logoScale }
			);
			drawSpectrum(
				context.ctx,
				context.canvas,
				context.audio,
				resolveMainSpectrumState(
					instanceState,
					context.palette,
					themePalette
				),
				context.dt,
				spectrumRenderPolicy,
				getSpectrumInstanceRuntimeKey(instance.id),
				context.spectrumScope
			);
		}
	}
}
