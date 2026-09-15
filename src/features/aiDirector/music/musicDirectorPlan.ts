/**
 * Music Director plan — the seam between audio analysis and scene direction.
 *
 * A plan is timed sections, each carrying a `SceneIntent` (the same vocabulary
 * the AI Director compiler already consumes: intent -> deterministic scene
 * patch). Nothing here decides *how* the sections were found: this module
 * ships one deterministic builder (energy-timeline segmentation) so the
 * interface is real and testable today; a model-backed planner is just
 * another producer of the same plan later. The store/UI integration is
 * deliberately NOT here — Phase 6+ work.
 *
 * Pure: no React, no network, no Web Audio. Inputs are plain data.
 */

import type { SceneIntent } from '../intent/sceneIntent';
import type { EnergyPoint } from './energyWindows';

export const MUSIC_DIRECTOR_PLAN_VERSION = 1;

export type MusicSection = {
	startMs: number;
	endMs: number;
	/** Mean window energy over the section, 0..1 (loudest window of the track = 1). */
	energy: number;
};

export type MusicDirectorPlan = {
	version: number;
	durationMs: number;
	/** Ordered, contiguous, non-overlapping; covers [0, durationMs] when non-empty. */
	sections: Array<{
		startMs: number;
		endMs: number;
		intent: SceneIntent;
	}>;
};

export type BuildMusicDirectorPlanOptions = {
	/** Sections shorter than this merge into their neighbour. Default 6000 ms. */
	minSectionMs?: number;
	/** Hysteresis band around the mean energy before a flip counts. Default 0.15. */
	hysteresis?: number;
};

function clamp01(v: number): number {
	if (!Number.isFinite(v)) return 0;
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Split the timeline into high/low energy sections (hysteresis around the mean). */
export function sectionsFromEnergyTimeline(
	points: EnergyPoint[],
	options: BuildMusicDirectorPlanOptions = {}
): MusicSection[] {
	const minSectionMs = options.minSectionMs ?? 6000;
	const hysteresis = options.hysteresis ?? 0.15;
	if (points.length === 0) return [];

	// Mean, not median: music timelines are bimodal, and a median that lands
	// inside the dominant mode lets the hysteresis band swallow every flip.
	const energies = points.map(p => p.energy);
	const center = energies.reduce((a, b) => a + b, 0) / energies.length;
	const high = center + hysteresis;
	const low = center - hysteresis;

	// Label each window; inside the band it keeps the previous label.
	const labels: boolean[] = [];
	let state = energies[0] >= center;
	for (const e of energies) {
		if (e > high) state = true;
		else if (e < low) state = false;
		labels.push(state);
	}

	// Window runs -> raw sections. Window width inferred from the first gap.
	const windowMs =
		points.length > 1 ? points[1].timeMs - points[0].timeMs : 1000;
	const raw: MusicSection[] = [];
	let runStart = 0;
	for (let i = 1; i <= labels.length; i++) {
		if (i === labels.length || labels[i] !== labels[runStart]) {
			const slice = energies.slice(runStart, i);
			raw.push({
				startMs: runStart * windowMs,
				endMs: i * windowMs,
				energy: slice.reduce((a, b) => a + b, 0) / slice.length
			});
			runStart = i;
		}
	}

	// Any raw section shorter than minSectionMs merges into its previous
	// neighbour (energy-weighted).
	const merged: MusicSection[] = [];
	for (const s of raw) {
		const last = merged[merged.length - 1];
		if (last && s.endMs - s.startMs < minSectionMs) {
			const span = s.endMs - last.startMs;
			last.energy =
				(last.energy * (last.endMs - last.startMs) +
					s.energy * (s.endMs - s.startMs)) /
				span;
			last.endMs = s.endMs;
		} else {
			merged.push({ ...s });
		}
	}
	if (merged.length > 1) {
		const first = merged[0];
		if (first.endMs - first.startMs < minSectionMs) {
			const next = merged[1];
			next.energy =
				(first.energy * (first.endMs - first.startMs) +
					next.energy * (next.endMs - next.startMs)) /
				(next.endMs - first.startMs);
			next.startMs = first.startMs;
			merged.shift();
		}
	}
	return merged;
}

/**
 * Per-section intent: the base look, with `energy`/`motion` scaled by the
 * section's energy relative to the track center. A section at the center
 * keeps the base axes exactly; louder sections scale up (clamped at 1),
 * quieter scale down.
 */
export function modulateIntent(
	base: SceneIntent,
	sectionEnergy: number,
	centerEnergy: number
): SceneIntent {
	const factor =
		centerEnergy > 0 ? 0.5 + sectionEnergy / centerEnergy / 2 : 1;
	return {
		...base,
		energy: clamp01(base.energy * factor),
		motion: clamp01(base.motion * factor)
	};
}

/** Deterministic plan from an energy timeline. Same input, same plan, always. */
export function buildMusicDirectorPlan(
	points: EnergyPoint[],
	durationMs: number,
	base: SceneIntent,
	options: BuildMusicDirectorPlanOptions = {}
): MusicDirectorPlan {
	const safeDuration =
		Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
	const sections = sectionsFromEnergyTimeline(points, options);
	if (sections.length === 0 || safeDuration === 0) {
		return {
			version: MUSIC_DIRECTOR_PLAN_VERSION,
			durationMs: safeDuration,
			sections: []
		};
	}
	const center = points.reduce((a, p) => a + p.energy, 0) / points.length;
	return {
		version: MUSIC_DIRECTOR_PLAN_VERSION,
		durationMs: safeDuration,
		sections: sections.map(s => ({
			startMs: Math.min(s.startMs, safeDuration),
			endMs: Math.min(s.endMs, safeDuration),
			intent: modulateIntent(base, s.energy, center)
		}))
	};
}

/**
 * Accept a hostile JSON plan (a model completion) against a base intent.
 * Same discipline as `parseSceneIntent`: never throws, drops what is wrong,
 * reports what it dropped. Post-conditions hold for whatever comes back:
 * sections sorted, disjoint, inside [0, durationMs], intents valid, and a
 * plan with zero sections is always representable.
 */
export type ParseMusicDirectorPlanResult = {
	plan: MusicDirectorPlan;
	/** Human-readable notes about what was dropped or repaired. */
	rejected: string[];
};

export function parseMusicDirectorPlan(
	value: unknown,
	base: SceneIntent,
	parseIntent: (raw: unknown) => { intent: SceneIntent }
): ParseMusicDirectorPlanResult {
	const rejected: string[] = [];
	const empty: MusicDirectorPlan = {
		version: MUSIC_DIRECTOR_PLAN_VERSION,
		durationMs: 0,
		sections: []
	};
	if (typeof value !== 'object' || value === null || !('sections' in value)) {
		return { plan: empty, rejected: ['expected an object with sections'] };
	}
	const rawDuration =
		'durationMs' in value &&
		typeof value.durationMs === 'number' &&
		Number.isFinite(value.durationMs) &&
		value.durationMs > 0
			? value.durationMs
			: null;
	if (rawDuration === null) {
		return { plan: empty, rejected: ['durationMs missing or invalid'] };
	}
	const durationMs = rawDuration;
	if (!Array.isArray(value.sections)) {
		return { plan: empty, rejected: ['sections is not an array'] };
	}

	const kept: MusicDirectorPlan['sections'] = [];
	value.sections.forEach((raw, i) => {
		if (typeof raw !== 'object' || raw === null) {
			rejected.push(`section ${i}: not an object`);
			return;
		}
		const start = 'startMs' in raw ? raw.startMs : NaN;
		const end = 'endMs' in raw ? raw.endMs : NaN;
		if (
			typeof start !== 'number' ||
			typeof end !== 'number' ||
			!Number.isFinite(start) ||
			!Number.isFinite(end) ||
			start < 0 ||
			end <= start
		) {
			rejected.push(`section ${i}: bad time range`);
			return;
		}
		const s = Math.min(start, durationMs);
		const e = Math.min(end, durationMs);
		if (e <= s) {
			rejected.push(`section ${i}: after clamping, empty`);
			return;
		}
		if (kept.length > 0 && s < kept[kept.length - 1].endMs) {
			rejected.push(`section ${i}: overlaps previous`);
			return;
		}
		kept.push({
			startMs: s,
			endMs: e,
			intent:
				'intent' in raw && raw.intent
					? parseIntent(raw.intent).intent
					: { ...base }
		});
	});
	return {
		plan: {
			version: MUSIC_DIRECTOR_PLAN_VERSION,
			durationMs,
			sections: kept
		},
		rejected
	};
}
