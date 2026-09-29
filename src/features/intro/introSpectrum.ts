/**
 * The intro spectrum's OWN wave.
 *
 * The figure the intro draws is a saved spectrum slot rendered by the real
 * spectrum engine (see `introSpectrumDraw`), but the levels that feed it are
 * generated here instead of read from the track. Three reasons, all of them the
 * user's:
 * - An intro has to look identical every run. Audio-driven bars make the first
 *   two seconds of a video a lottery.
 * - The window usually sits over a fade-in or a count-in, where the real bins
 *   are near silent and the flourish would be a flat line.
 * - Fluidity: this wave is smooth by construction (a sum of slow travelling
 *   sines), so the mount and dismount read as one continuous motion.
 *
 * Pure and deterministic: same time in, same bytes out, no audio context, no
 * state. The offline export and the live preview therefore produce the same
 * frames.
 */

/** Bins handed to the spectrum renderer. A full FFT half-spectrum's worth. */
export const INTRO_SPECTRUM_BIN_COUNT = 512;

/** Samples of fake PCM for the oscilloscope family. */
export const INTRO_SPECTRUM_TIME_DOMAIN_COUNT = 1024;

export const INTRO_WAVE_SPEED_RANGE = { min: 0.1, max: 3 } as const;
export const INTRO_WAVE_INTENSITY_RANGE = { min: 0.2, max: 1.5 } as const;

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function easeInOut(t: number): number {
	const x = clamp01(t);
	return x * x * (3 - 2 * x);
}

/**
 * The normalised level of one bin, `0..1`. Exported for the tests and for
 * anything that wants the shape without allocating a buffer.
 *
 * `fraction` is the bin's position in the spectrum (0 = lowest). The shape is a
 * pink-ish falloff — loud lows, quiet highs, the way music actually looks —
 * modulated by two travelling sines at incommensurate speeds so it never
 * visibly repeats inside a five-second window.
 */
export function introWaveLevel(
	fraction: number,
	timeSec: number,
	intensity: number
): number {
	const f = clamp01(fraction);
	// Spectral tilt: a broad low shelf, a gentle mid presence bump, and a tail
	// that never quite reaches zero so the top of the figure still moves.
	const tilt = 0.18 + 0.82 * Math.pow(1 - f, 1.45);
	const presence = 1 + 0.22 * Math.exp(-Math.pow((f - 0.22) / 0.12, 2));
	const travelling =
		0.58 * Math.sin(Math.PI * 2 * (timeSec * 0.47 - f * 1.9)) +
		0.42 * Math.sin(Math.PI * 2 * (timeSec * 0.19 + f * 0.83 + 0.31));
	const swing = 0.62 + 0.38 * travelling;
	return clamp01(tilt * presence * swing * intensity);
}

export type IntroWaveInput = {
	/** Seconds since the window opened. */
	timeSec: number;
	/** How far the spectrum is mounted, `0..1`. Scales the whole figure. */
	mount: number;
	speed: number;
	intensity: number;
};

/**
 * `bins` in the renderer's own units (0–255) and a matching fake `timeDomain`
 * (midpoint 128), both shaped by `mount` so the figure rises out of the
 * baseline and sinks back into it.
 */
export function resolveIntroSpectrumWave({
	timeSec,
	mount,
	speed,
	intensity
}: IntroWaveInput): { bins: Uint8Array; timeDomain: Uint8Array } {
	const bins = new Uint8Array(INTRO_SPECTRUM_BIN_COUNT);
	const timeDomain = new Uint8Array(INTRO_SPECTRUM_TIME_DOMAIN_COUNT);
	const rise = easeInOut(mount);
	if (rise <= 0) {
		timeDomain.fill(128);
		return { bins, timeDomain };
	}
	const t = timeSec * Math.max(0.01, speed);
	for (let index = 0; index < INTRO_SPECTRUM_BIN_COUNT; index += 1) {
		const level = introWaveLevel(
			index / (INTRO_SPECTRUM_BIN_COUNT - 1),
			t,
			intensity
		);
		bins[index] = Math.round(level * rise * 255);
	}
	for (let index = 0; index < INTRO_SPECTRUM_TIME_DOMAIN_COUNT; index += 1) {
		const phase = index / INTRO_SPECTRUM_TIME_DOMAIN_COUNT;
		// Two partials and a fifth: enough structure that an oscilloscope trace
		// looks like a waveform rather than a test tone.
		const sample =
			0.6 * Math.sin(Math.PI * 2 * (phase * 3 + t * 0.6)) +
			0.28 * Math.sin(Math.PI * 2 * (phase * 7 - t * 0.37)) +
			0.12 * Math.sin(Math.PI * 2 * (phase * 11 + t * 0.21));
		timeDomain[index] = Math.round(
			128 + sample * 120 * rise * clamp01(intensity)
		);
	}
	return { bins, timeDomain };
}
