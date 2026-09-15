import type { SpectrumSettings } from '../runtime/spectrumRuntime';

/** Slider range is 0.2..3; clamp guards persisted junk. */
export function clampSpectrumScale(value: number | undefined): number {
	return Math.min(3, Math.max(0.2, value ?? 1));
}

/**
 * Apply the user's `spectrumScale` to the settings the renderers consume.
 * Pure, so the store (Auto Logo placement) can predict the drawn figure
 * without importing the canvas runtime.
 */
export function resolveScaledSpectrumSettings(
	settings: SpectrumSettings
): SpectrumSettings {
	const scale = clampSpectrumScale(settings.spectrumScale);
	if (Math.abs(scale - 1) < 0.0001) return settings;
	// Scope: the radial figure is a contour wrapped around `innerRadius`, so
	// Scale grows it — without this, Scale fattens the wave (amplitude) while
	// the ring stays put and the figure looks unchanged. This holds even when
	// Follow Logo is effective: the user scales the base figure on purpose,
	// "Scope height" owns the amplitude separately.
	const scaleInnerRadius = settings.spectrumFamily === 'oscilloscope';
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
