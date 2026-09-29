import { describe, expect, it } from 'vitest';
import {
	INTRO_SPECTRUM_BIN_COUNT,
	INTRO_SPECTRUM_TIME_DOMAIN_COUNT,
	introWaveLevel,
	resolveIntroSpectrumWave
} from './introSpectrum';

function wave(timeSec: number, mount = 1) {
	return resolveIntroSpectrumWave({
		timeSec,
		mount,
		speed: 1,
		intensity: 1
	});
}

describe('introWaveLevel', () => {
	it('stays inside 0..1 across the band and over time', () => {
		for (let step = 0; step <= 40; step += 1) {
			const fraction = step / 40;
			for (let t = 0; t < 6; t += 0.25) {
				const level = introWaveLevel(fraction, t, 1);
				expect(level).toBeGreaterThanOrEqual(0);
				expect(level).toBeLessThanOrEqual(1);
			}
		}
	});

	it('leans on the low end, the way a real spectrum does', () => {
		// Averaged over a full cycle so the travelling wave cannot decide it.
		let low = 0;
		let high = 0;
		for (let t = 0; t < 8; t += 0.05) {
			low += introWaveLevel(0.08, t, 1);
			high += introWaveLevel(0.92, t, 1);
		}
		expect(low).toBeGreaterThan(high);
	});

	it('scales with the intensity', () => {
		const soft = introWaveLevel(0.3, 1.5, 0.3);
		const loud = introWaveLevel(0.3, 1.5, 1.2);
		expect(loud).toBeGreaterThan(soft);
	});
});

describe('resolveIntroSpectrumWave', () => {
	it('is deterministic: the same time gives the same buffers', () => {
		const a = wave(1.234);
		const b = wave(1.234);
		expect(a.bins).toHaveLength(INTRO_SPECTRUM_BIN_COUNT);
		expect(a.timeDomain).toHaveLength(INTRO_SPECTRUM_TIME_DOMAIN_COUNT);
		expect(Array.from(a.bins)).toEqual(Array.from(b.bins));
		expect(Array.from(a.timeDomain)).toEqual(Array.from(b.timeDomain));
	});

	it('moves as time passes', () => {
		const a = wave(0);
		const b = wave(0.9);
		expect(Array.from(a.bins)).not.toEqual(Array.from(b.bins));
	});

	it('is silent while it has not mounted yet', () => {
		const none = wave(2, 0);
		expect(Array.from(none.bins).every(value => value === 0)).toBe(true);
		expect(Array.from(none.timeDomain).every(value => value === 128)).toBe(
			true
		);
	});

	it('mounts: half-way up is quieter than fully up', () => {
		const half = wave(2, 0.5);
		const full = wave(2, 1);
		const sum = (values: Uint8Array) =>
			Array.from(values).reduce((total, value) => total + value, 0);
		expect(sum(half.bins)).toBeLessThan(sum(full.bins));
	});
});
