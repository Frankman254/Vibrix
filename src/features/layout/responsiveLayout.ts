import type { WallpaperState } from '@/types/wallpaper';
import type { ViewportResolution } from '@/features/layout/viewportMetrics';

type LayoutScaleSettings = Pick<
	WallpaperState,
	'layoutResponsiveEnabled' | 'layoutReferenceWidth' | 'layoutReferenceHeight'
>;

type LayoutResponsiveSettings = LayoutScaleSettings &
	Pick<WallpaperState, 'layoutBackgroundReframeEnabled'>;

type LogoResponsiveSettings = LayoutScaleSettings &
	Pick<
		WallpaperState,
		| 'logoBaseSize'
		| 'logoGlowBlur'
		| 'logoShadowBlur'
		| 'logoBackdropPadding'
	>;

type TrackTitleResponsiveSettings = LayoutScaleSettings &
	Pick<
		WallpaperState,
		| 'audioTrackTitleFontSize'
		| 'audioTrackTitleLetterSpacing'
		| 'audioTrackTitleScrollSpeed'
		| 'audioTrackTitleStrokeWidth'
		| 'audioTrackTitleGlowBlur'
		| 'audioTrackTitleBackdropPadding'
		| 'audioTrackTitleFilterBlur'
		| 'audioTrackTimeFontSize'
		| 'audioTrackTimeLetterSpacing'
		| 'audioTrackTimeStrokeWidth'
		| 'audioTrackTimeGlowBlur'
		| 'audioTrackTimeFilterBlur'
	>;

type LyricsResponsiveSettings = LayoutScaleSettings &
	Pick<
		WallpaperState,
		| 'audioLyricsFontSize'
		| 'audioLyricsLetterSpacing'
		| 'audioLyricsGlowBlur'
		| 'audioLyricsBackdropPadding'
		| 'audioLyricsBackdropRadius'
	>;

type SpectrumResponsiveSettings = LayoutScaleSettings &
	Pick<
		WallpaperState,
		| 'spectrumLogoGap'
		| 'spectrumInnerRadius'
		| 'spectrumBarWidth'
		| 'spectrumMinHeight'
		| 'spectrumMaxHeight'
		| 'spectrumShadowBlur'
		| 'spectrumOscilloscopeLineWidth'
	>;

type HudResponsiveSettings = LayoutScaleSettings &
	Pick<WallpaperState, 'quickActionsScale' | 'quickActionsLauncherSize'>;

type ResponsiveBackgroundTransformInput = LayoutResponsiveSettings & {
	authoredScale: number;
	authoredPositionX: number;
	authoredPositionY: number;
	mirror?: boolean;
	currentViewport: ViewportResolution;
	currentBaseWidth: number;
	currentBaseHeight: number;
	referenceBaseWidth: number;
	referenceBaseHeight: number;
};

type ResponsiveBackgroundTransform = {
	scale: number;
	positionX: number;
	positionY: number;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function scalePixels(value: number, factor: number, min = 0): number {
	return Math.max(min, value * factor);
}

export function getLayoutReferenceResolution(
	settings: Pick<
		WallpaperState,
		'layoutReferenceWidth' | 'layoutReferenceHeight'
	>
): ViewportResolution {
	return {
		width: Math.max(1, Math.round(settings.layoutReferenceWidth || 1920)),
		height: Math.max(1, Math.round(settings.layoutReferenceHeight || 1080))
	};
}

export function getResponsiveShortEdgeScale(
	settings: LayoutScaleSettings,
	currentWidth: number,
	currentHeight: number
): number {
	if (!settings.layoutResponsiveEnabled) return 1;

	const reference = getLayoutReferenceResolution(settings);
	const currentShortEdge = Math.max(1, Math.min(currentWidth, currentHeight));
	const referenceShortEdge = Math.max(
		1,
		Math.min(reference.width, reference.height)
	);

	return clamp(currentShortEdge / referenceShortEdge, 0.2, 6);
}

export function resolveResponsiveLogoSettings<T extends LogoResponsiveSettings>(
	settings: T,
	currentWidth: number,
	currentHeight: number
): T {
	const factor = getResponsiveShortEdgeScale(
		settings,
		currentWidth,
		currentHeight
	);
	if (factor === 1) return settings;

	return {
		...settings,
		logoBaseSize: scalePixels(settings.logoBaseSize, factor, 12),
		logoGlowBlur: scalePixels(settings.logoGlowBlur, factor),
		logoShadowBlur: scalePixels(settings.logoShadowBlur, factor),
		logoBackdropPadding: scalePixels(settings.logoBackdropPadding, factor)
	};
}

export function resolveResponsiveTrackTitleSettings<
	T extends TrackTitleResponsiveSettings
>(settings: T, currentWidth: number, currentHeight: number): T {
	const factor = getResponsiveShortEdgeScale(
		settings,
		currentWidth,
		currentHeight
	);
	if (factor === 1) return settings;

	return {
		...settings,
		audioTrackTitleFontSize: scalePixels(
			settings.audioTrackTitleFontSize,
			factor,
			12
		),
		audioTrackTitleLetterSpacing: scalePixels(
			settings.audioTrackTitleLetterSpacing,
			factor
		),
		audioTrackTitleScrollSpeed: scalePixels(
			settings.audioTrackTitleScrollSpeed,
			factor
		),
		audioTrackTitleStrokeWidth: scalePixels(
			settings.audioTrackTitleStrokeWidth,
			factor
		),
		audioTrackTitleGlowBlur: scalePixels(
			settings.audioTrackTitleGlowBlur,
			factor
		),
		audioTrackTitleBackdropPadding: scalePixels(
			settings.audioTrackTitleBackdropPadding,
			factor
		),
		audioTrackTitleFilterBlur: scalePixels(
			settings.audioTrackTitleFilterBlur,
			factor
		),
		audioTrackTimeFontSize: scalePixels(
			settings.audioTrackTimeFontSize,
			factor,
			10
		),
		audioTrackTimeLetterSpacing: scalePixels(
			settings.audioTrackTimeLetterSpacing,
			factor
		),
		audioTrackTimeStrokeWidth: scalePixels(
			settings.audioTrackTimeStrokeWidth,
			factor
		),
		audioTrackTimeGlowBlur: scalePixels(
			settings.audioTrackTimeGlowBlur,
			factor
		),
		audioTrackTimeFilterBlur: scalePixels(
			settings.audioTrackTimeFilterBlur,
			factor
		)
	};
}

export function resolveResponsiveSpectrumSettings<
	T extends SpectrumResponsiveSettings
>(settings: T, currentWidth: number, currentHeight: number): T {
	const factor = getResponsiveShortEdgeScale(
		settings,
		currentWidth,
		currentHeight
	);
	if (factor === 1) return settings;

	return {
		...settings,
		spectrumLogoGap: scalePixels(settings.spectrumLogoGap, factor),
		spectrumInnerRadius: scalePixels(
			settings.spectrumInnerRadius,
			factor,
			20
		),
		spectrumBarWidth: scalePixels(settings.spectrumBarWidth, factor, 1),
		spectrumMinHeight: scalePixels(settings.spectrumMinHeight, factor, 1),
		spectrumMaxHeight: scalePixels(settings.spectrumMaxHeight, factor, 12),
		spectrumShadowBlur: scalePixels(settings.spectrumShadowBlur, factor),
		spectrumOscilloscopeLineWidth: scalePixels(
			settings.spectrumOscilloscopeLineWidth,
			factor,
			1
		)
	};
}

export function resolveResponsiveLyricsSettings<
	T extends LyricsResponsiveSettings
>(settings: T, currentWidth: number, currentHeight: number): T {
	const factor = getResponsiveShortEdgeScale(
		settings,
		currentWidth,
		currentHeight
	);
	if (factor === 1) return settings;

	return {
		...settings,
		audioLyricsFontSize: scalePixels(
			settings.audioLyricsFontSize,
			factor,
			12
		),
		audioLyricsLetterSpacing: scalePixels(
			settings.audioLyricsLetterSpacing,
			factor
		),
		audioLyricsGlowBlur: scalePixels(settings.audioLyricsGlowBlur, factor),
		audioLyricsBackdropPadding: scalePixels(
			settings.audioLyricsBackdropPadding,
			factor
		),
		audioLyricsBackdropRadius: scalePixels(
			settings.audioLyricsBackdropRadius,
			factor
		)
	};
}

export function resolveResponsiveHudLayout(
	settings: HudResponsiveSettings,
	currentWidth: number,
	currentHeight: number
): Pick<WallpaperState, 'quickActionsScale' | 'quickActionsLauncherSize'> {
	const factor = getResponsiveShortEdgeScale(
		settings,
		currentWidth,
		currentHeight
	);
	// Cap the responsive factor so the HUD controls don't grow enormous on
	// large / 4K monitors.
	const clampedFactor = clamp(factor, 0.5, 1.75);

	return {
		quickActionsScale: settings.quickActionsScale * clampedFactor,
		quickActionsLauncherSize: scalePixels(
			settings.quickActionsLauncherSize,
			clampedFactor,
			24
		)
	};
}

function getImageFocusCenter(
	position: number,
	viewportPixels: number,
	drawnPixels: number,
	mirrored = false
): number {
	const signedOffset = position * viewportPixels * 0.5;
	return mirrored
		? 0.5 + signedOffset / Math.max(drawnPixels, 1)
		: 0.5 - signedOffset / Math.max(drawnPixels, 1);
}

function getViewportPositionFromFocusCenter(
	center: number,
	viewportPixels: number,
	drawnPixels: number,
	mirrored = false
): number {
	const offsetPixels = mirrored
		? (center - 0.5) * drawnPixels
		: (0.5 - center) * drawnPixels;
	return offsetPixels / Math.max(1, viewportPixels * 0.5);
}

export function resolveResponsiveBackgroundTransform(
	input: ResponsiveBackgroundTransformInput
): ResponsiveBackgroundTransform {
	const authoredScale = Math.max(0.01, input.authoredScale);
	if (
		!input.layoutResponsiveEnabled ||
		!input.layoutBackgroundReframeEnabled
	) {
		return {
			scale: authoredScale,
			positionX: input.authoredPositionX,
			positionY: input.authoredPositionY
		};
	}

	const reference = getLayoutReferenceResolution(input);
	const drawnReferenceWidth = Math.max(
		1,
		input.referenceBaseWidth * authoredScale
	);
	const drawnReferenceHeight = Math.max(
		1,
		input.referenceBaseHeight * authoredScale
	);
	const spanX = reference.width / drawnReferenceWidth;
	const spanY = reference.height / drawnReferenceHeight;
	const centerX = getImageFocusCenter(
		input.authoredPositionX,
		reference.width,
		drawnReferenceWidth,
		Boolean(input.mirror)
	);
	const centerY = getImageFocusCenter(
		-input.authoredPositionY,
		reference.height,
		drawnReferenceHeight
	);

	const scaleForWidth =
		input.currentViewport.width /
		(Math.max(spanX, 0.0001) * Math.max(input.currentBaseWidth, 1));
	const scaleForHeight =
		input.currentViewport.height /
		(Math.max(spanY, 0.0001) * Math.max(input.currentBaseHeight, 1));
	const effectiveScale = clamp(
		Math.max(scaleForWidth, scaleForHeight, 0.01),
		0.01,
		16
	);
	const drawnCurrentWidth = Math.max(
		1,
		input.currentBaseWidth * effectiveScale
	);
	const drawnCurrentHeight = Math.max(
		1,
		input.currentBaseHeight * effectiveScale
	);

	return {
		scale: effectiveScale,
		positionX: getViewportPositionFromFocusCenter(
			centerX,
			input.currentViewport.width,
			drawnCurrentWidth,
			Boolean(input.mirror)
		),
		positionY: -getViewportPositionFromFocusCenter(
			centerY,
			input.currentViewport.height,
			drawnCurrentHeight
		)
	};
}
