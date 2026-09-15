import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { SpectrumSettings } from '@/features/spectrum';
import { resolveScaledSpectrumSettings } from './CircularSpectrum';

/**
 * Guards what `spectrumScale` is allowed to multiply.
 *
 * Scale must grow the *figure*. For the scope family the radial figure is a
 * contour wrapped around `spectrumInnerRadius`, so Scale always scales that
 * radius — including when Follow Logo is effective: the user scales the base
 * figure on purpose. Classic radial keeps its historical semantics (Scale
 * lengthens bars, hole unchanged) so existing presets don't shift.
 */
function settings(patch: Partial<SpectrumSettings> = {}): SpectrumSettings {
	return {
		...DEFAULT_STATE,
		...patch
	} as unknown as SpectrumSettings;
}

describe('resolveScaledSpectrumSettings', () => {
	it('is the identity at scale 1', () => {
		const s = settings({ spectrumScale: 1 });
		expect(resolveScaledSpectrumSettings(s)).toBe(s);
	});

	it('grows the scope figure: innerRadius scales with Scale', () => {
		const s = settings({
			spectrumScale: 2,
			spectrumFamily: 'oscilloscope',
			spectrumMode: 'radial',
			spectrumInnerRadius: 120,
			spectrumFollowLogo: false,
			logoEnabled: true
		});
		const out = resolveScaledSpectrumSettings(s);
		expect(out.spectrumInnerRadius).toBe(240);
		expect(out.spectrumMaxHeight).toBe(
			s.spectrumMaxHeight * 2 // amplitude still scales
		);
	});

	it('scales the ring even when Follow Logo drives it', () => {
		// The user asked for Scale to grow the base figure unconditionally;
		// the ring pulling away from the logo at Scale != 1 is intended.
		const s = settings({
			spectrumScale: 2,
			spectrumFamily: 'oscilloscope',
			spectrumMode: 'radial',
			spectrumInnerRadius: 120,
			spectrumFollowLogo: true,
			logoEnabled: true
		});
		const out = resolveScaledSpectrumSettings(s);
		expect(out.spectrumInnerRadius).toBe(240);
	});

	it('scales the ring when Follow Logo is on but the logo is off', () => {
		// Logo disabled: innerRadius is the raw user value, so Scale owns it.
		const s = settings({
			spectrumScale: 2,
			spectrumFamily: 'oscilloscope',
			spectrumMode: 'radial',
			spectrumInnerRadius: 120,
			spectrumFollowLogo: true,
			logoEnabled: false
		});
		expect(resolveScaledSpectrumSettings(s).spectrumInnerRadius).toBe(240);
	});

	it('keeps classic radial semantics: hole unchanged, bars lengthen', () => {
		const s = settings({
			spectrumScale: 2,
			spectrumFamily: 'classic',
			spectrumMode: 'radial',
			spectrumInnerRadius: 120
		});
		const out = resolveScaledSpectrumSettings(s);
		expect(out.spectrumInnerRadius).toBe(120);
		expect(out.spectrumMaxHeight).toBe(s.spectrumMaxHeight * 2);
	});
});
