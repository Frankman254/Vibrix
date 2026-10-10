import { describe, expect, it } from 'vitest';
import {
	DEMO_TRACK_BARS,
	DEMO_TRACK_INTRO_SECONDS,
	DEMO_TRACK_OUTRO_SECONDS,
	DEMO_TRACK_SECONDS,
	DEMO_TRACK_SECTIONS,
	buildDemoTrackScore,
	type DemoTrackEvent,
	type DemoTrackSectionId,
	type DemoTrackVoice
} from '@/features/demoProject/demoTrackScore';

const score = buildDemoTrackScore();

function inSection(id: DemoTrackSectionId): DemoTrackEvent[] {
	const part = DEMO_TRACK_SECTIONS.find(item => item.id === id)!;
	const end = part.startSeconds + part.seconds;
	return score.filter(
		event => event.time >= part.startSeconds && event.time < end
	);
}

function voices(events: DemoTrackEvent[]): Set<DemoTrackVoice> {
	return new Set(events.map(event => event.voice));
}

describe('demo track score', () => {
	it('is 32 seconds of 16 bars at 120 BPM', () => {
		expect(DEMO_TRACK_BARS).toBe(16);
		expect(DEMO_TRACK_SECONDS).toBe(32);
	});

	it('has contiguous sections that cover the whole track', () => {
		let expectedStart = 0;
		for (const part of DEMO_TRACK_SECTIONS) {
			expect(part.startSeconds).toBe(expectedStart);
			expectedStart += part.seconds;
		}
		expect(expectedStart).toBe(DEMO_TRACK_SECONDS);
		expect(DEMO_TRACK_INTRO_SECONDS).toBe(8);
		expect(DEMO_TRACK_OUTRO_SECONDS).toBe(8);
	});

	it('builds through the intro and lands a riser on the drop', () => {
		const intro = inSection('intro');
		const riser = intro.filter(event => event.voice === 'riser');
		expect(riser).toHaveLength(1);
		// The sweep has to finish exactly where the groove starts, or the
		// montage releases into a gap.
		const landing = riser[0]!.time + riser[0]!.durationSeconds;
		expect(landing).toBe(DEMO_TRACK_INTRO_SECONDS);
		// No crash inside the build: the first one IS the drop.
		expect(voices(intro).has('impact')).toBe(false);
	});

	it('puts energy in every band the editor reacts to, through the drop', () => {
		// A demo without kick, bass and hi-hat content shows a motionless
		// wallpaper however good the look is — this is the whole point of it.
		const drop = inSection('drop');
		for (const voice of [
			'kick',
			'snare',
			'hat',
			'bass',
			'pad',
			'impact'
		] as const) {
			expect(voices(drop).has(voice)).toBe(true);
		}
		expect(drop.filter(event => event.voice === 'hat')).toHaveLength(8 * 8);
		expect(drop.filter(event => event.voice === 'kick')).toHaveLength(
			8 * 2 + 1
		);
	});

	it('resolves the ending instead of cutting it', () => {
		const outro = inSection('outro');
		expect(voices(outro).has('downlifter')).toBe(true);
		// Thinner than the drop: that is what makes it read as an ending.
		const dropHats = inSection('drop').filter(
			event => event.voice === 'hat'
		).length;
		const outroHats = outro.filter(event => event.voice === 'hat').length;
		expect(outroHats).toBeLessThan(dropHats / 2);
		// The last bar starts nothing; it is tail only.
		const lastBarStart = DEMO_TRACK_SECONDS - 2;
		expect(score.filter(event => event.time >= lastBarStart)).toEqual([]);
	});

	it('keeps every event inside the track', () => {
		for (const event of score) {
			expect(event.time).toBeGreaterThanOrEqual(0);
			expect(event.time).toBeLessThan(DEMO_TRACK_SECONDS);
			expect(event.durationSeconds).toBeGreaterThan(0);
			expect(event.time + event.durationSeconds).toBeLessThanOrEqual(
				DEMO_TRACK_SECONDS
			);
		}
	});

	it('gives pitched voices an audible frequency and keeps velocities sane', () => {
		for (const event of score) {
			if (event.voice === 'bass' || event.voice === 'pad') {
				expect(event.frequency).toBeGreaterThan(20);
				expect(event.frequency).toBeLessThan(2000);
			}
			expect(event.velocity).toBeGreaterThan(0);
			expect(event.velocity).toBeLessThanOrEqual(1);
		}
	});

	it('is ordered by time and deterministic', () => {
		const times = score.map(event => event.time);
		expect([...times].sort((a, b) => a - b)).toEqual(times);
		expect(buildDemoTrackScore()).toEqual(score);
	});
});
