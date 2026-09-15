/**
 * Energy timeline from decoded PCM — pure math, no Web Audio.
 *
 * Decoding (`OfflineAudioContext.decodeAudioData`) is browser-only, so it
 * stays with the caller; everything downstream (the Music Director planner
 * and its tests) runs on this plain array, which keeps the whole chain
 * testable in node.
 */

export type EnergyPoint = {
	/** Window start, milliseconds from track start. */
	timeMs: number;
	/** Window RMS, normalized so the loudest window is 1. */
	energy: number;
};

/** RMS of consecutive windows over mono PCM, normalized to the peak window. */
export function energyWindows(
	pcm: Float32Array,
	sampleRate: number,
	windowMs = 250
): EnergyPoint[] {
	if (!Number.isFinite(sampleRate) || sampleRate <= 0) return [];
	const windowSamples = Math.max(
		1,
		Math.round((windowMs / 1000) * sampleRate)
	);
	const raw: number[] = [];
	for (let i = 0; i + windowSamples <= pcm.length; i += windowSamples) {
		let sumSq = 0;
		for (let j = i; j < i + windowSamples; j++) {
			const s = pcm[j];
			sumSq += s * s;
		}
		raw.push(Math.sqrt(sumSq / windowSamples));
	}
	const peak = raw.reduce((m, v) => (v > m ? v : m), 0);
	if (peak <= 0)
		return raw.map((_, i) => ({ timeMs: i * windowMs, energy: 0 }));
	return raw.map((v, i) => ({ timeMs: i * windowMs, energy: v / peak }));
}

/** Median of a numeric array (mutates nothing; empty -> 0). */
export function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? sorted[mid]
		: (sorted[mid - 1] + sorted[mid]) / 2;
}
