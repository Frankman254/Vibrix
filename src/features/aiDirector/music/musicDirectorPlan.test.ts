import { describe, expect, it } from 'vitest';
import { defaultSceneIntent, parseSceneIntent } from '../intent/sceneIntent';
import {
	buildMusicDirectorPlan,
	modulateIntent,
	parseMusicDirectorPlan,
	sectionsFromEnergyTimeline,
	MUSIC_DIRECTOR_PLAN_VERSION
} from './musicDirectorPlan';
import { energyWindows, median } from './energyWindows';
import type { EnergyPoint } from './energyWindows';

const NEUTRAL_INTENT = defaultSceneIntent();

function timeline(pattern: number[], windowMs = 1000): EnergyPoint[] {
	return pattern.map((energy, i) => ({ timeMs: i * windowMs, energy }));
}

describe('energyWindows', () => {
	it('normalizes the loudest window to 1 and respects window length', () => {
		const pcm = new Float32Array([
			0,
			0,
			0.5,
			0.5,
			0.5,
			0.5, // window 0: moderate
			0,
			0,
			0,
			0,
			0,
			0, // window 1: silent
			1,
			-1,
			1,
			-1,
			1,
			-1 // window 2: loud
		]);
		const w = energyWindows(pcm, 6000, 1);
		expect(w.map(p => p.timeMs)).toEqual([0, 1, 2]);
		expect(w[1].energy).toBe(0);
		expect(w[2].energy).toBeCloseTo(1);
		expect(w[0].energy).toBeGreaterThan(0);
		expect(w[0].energy).toBeLessThan(1);
	});

	it('returns [] for a nonsense sample rate', () => {
		expect(energyWindows(new Float32Array([1, 2]), 0)).toEqual([]);
	});
});

describe('median', () => {
	it('handles odd and even lengths', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 2, 3])).toBe(2.5);
		expect(median([])).toBe(0);
	});
});

describe('sectionsFromEnergyTimeline', () => {
	it('splits loud from quiet and merges below-minimum runs', () => {
		// 8s quiet, 8s loud, 2s quiet (inside the band -> stays 'loud').
		const points = [
			...timeline(Array.from({ length: 8 }, (_, i) => 0.05 + i * 0.01)),
			...timeline(Array.from({ length: 8 }, (_, i) => 0.85 + i * 0.01)),
			...timeline([0.2, 0.2])
		];
		const sections = sectionsFromEnergyTimeline(points, {
			minSectionMs: 6000
		});
		expect(sections.length).toBe(2);
		expect(sections[0].startMs).toBe(0);
		expect(sections[1].endMs).toBe(18000);
		expect(sections[0].energy).toBeLessThan(sections[1].energy);
	});

	it('produces exactly one section for a flat timeline', () => {
		const points = timeline(Array.from({ length: 30 }, () => 0.5));
		const sections = sectionsFromEnergyTimeline(points);
		expect(sections.length).toBe(1);
		expect(sections[0].startMs).toBe(0);
		expect(sections[0].endMs).toBe(30000);
	});

	it('is contiguous and covers the whole timeline', () => {
		const points = timeline(
			Array.from({ length: 60 }, (_, i) =>
				i < 20 ? 0.1 : i < 40 ? 0.9 : 0.2
			)
		);
		const sections = sectionsFromEnergyTimeline(points);
		expect(sections.length).toBeGreaterThan(1);
		expect(sections[0].startMs).toBe(0);
		expect(sections[sections.length - 1].endMs).toBe(60000);
		for (let i = 1; i < sections.length; i++) {
			expect(sections[i].startMs).toBe(sections[i - 1].endMs);
		}
	});

	it('returns [] for an empty timeline', () => {
		expect(sectionsFromEnergyTimeline([])).toEqual([]);
	});
});

describe('modulateIntent', () => {
	it('keeps base axes at median energy', () => {
		const intent = modulateIntent(NEUTRAL_INTENT, 0.5, 0.5);
		expect(intent.energy).toBe(NEUTRAL_INTENT.energy);
		expect(intent.motion).toBe(NEUTRAL_INTENT.motion);
	});

	it('pushes louder sections up and quieter sections down', () => {
		const louder = modulateIntent(NEUTRAL_INTENT, 1, 0.5);
		const quieter = modulateIntent(NEUTRAL_INTENT, 0.25, 0.5);
		expect(louder.energy).toBeGreaterThan(NEUTRAL_INTENT.energy);
		expect(quieter.energy).toBeLessThan(NEUTRAL_INTENT.energy);
	});

	it('clamps to 0..1 and carries the rest of the intent', () => {
		const extreme = modulateIntent(
			{ ...NEUTRAL_INTENT, energy: 1, motion: 1 },
			10,
			0.01
		);
		expect(extreme.energy).toBe(1);
		expect(extreme.motion).toBe(1);
		expect(extreme.palette).toEqual(NEUTRAL_INTENT.palette);
	});
});

describe('buildMusicDirectorPlan', () => {
	const points = [
		...timeline(Array.from({ length: 20 }, (_, i) => 0.1 + i * 0.001)),
		...timeline(Array.from({ length: 20 }, (_, i) => 0.8 + i * 0.001))
	];

	it('is deterministic: same input, same plan', () => {
		const a = buildMusicDirectorPlan(points, 40000, NEUTRAL_INTENT);
		const b = buildMusicDirectorPlan(points, 40000, NEUTRAL_INTENT);
		expect(a).toEqual(b);
	});

	it('spans the duration and keeps the current version', () => {
		const plan = buildMusicDirectorPlan(points, 40000, NEUTRAL_INTENT);
		expect(plan.version).toBe(MUSIC_DIRECTOR_PLAN_VERSION);
		expect(plan.sections[0].startMs).toBe(0);
		expect(plan.sections[plan.sections.length - 1].endMs).toBe(40000);
	});

	it('empty timeline yields an empty plan, not garbage', () => {
		const plan = buildMusicDirectorPlan([], 40000, NEUTRAL_INTENT);
		expect(plan.sections).toEqual([]);
		expect(plan.durationMs).toBe(40000);
	});

	it('invalid duration yields an empty plan', () => {
		expect(
			buildMusicDirectorPlan(points, NaN, NEUTRAL_INTENT).durationMs
		).toBe(0);
	});
});

describe('parseMusicDirectorPlan', () => {
	const parse = (raw: unknown) =>
		parseMusicDirectorPlan(raw, NEUTRAL_INTENT, v => parseSceneIntent(v));

	it('accepts a well-formed plan', () => {
		const r = parse({
			version: 1,
			durationMs: 30000,
			sections: [
				{ startMs: 0, endMs: 15000, intent: { energy: 0.9 } },
				{ startMs: 15000, endMs: 30000 }
			]
		});
		expect(r.plan.sections.length).toBe(2);
		expect(r.plan.sections[0].intent.energy).toBe(0.9);
		expect(r.plan.sections[1].intent).toEqual(NEUTRAL_INTENT);
		expect(r.rejected).toEqual([]);
	});

	it('drops overlapping and out-of-range sections instead of trusting them', () => {
		const r = parse({
			durationMs: 20000,
			sections: [
				{ startMs: 0, endMs: 10000 },
				{ startMs: 9000, endMs: 15000 }, // overlaps
				{ startMs: 25000, endMs: 40000 } // past the end
			]
		});
		expect(r.plan.sections.length).toBe(1);
		expect(r.rejected.length).toBe(2);
	});

	it('clamps a section that only pokes past the end', () => {
		const r = parse({
			durationMs: 20000,
			sections: [{ startMs: 10000, endMs: 25000 }]
		});
		expect(r.plan.sections[0].endMs).toBe(20000);
	});

	it('never throws on hostile input', () => {
		for (const junk of [
			null,
			7,
			'plan',
			[],
			{ sections: 'x' },
			{ durationMs: -1, sections: [] }
		]) {
			const r = parse(junk);
			expect(r.plan.sections).toEqual([]);
			expect(r.rejected.length).toBeGreaterThan(0);
		}
	});

	it('a section whose intent is garbage still produces a valid intent', () => {
		const r = parse({
			durationMs: 10000,
			sections: [{ startMs: 0, endMs: 10000, intent: { energy: 'loud' } }]
		});
		expect(r.plan.sections[0].intent).toEqual(NEUTRAL_INTENT);
	});
});
