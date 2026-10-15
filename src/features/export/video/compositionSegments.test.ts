import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backgroundPalette', async importOriginal => ({
	...(await importOriginal<typeof import('@/lib/backgroundPalette')>()),
	getBackgroundPalette: vi.fn(async () => ({
		dominant: '#ffffff',
		accent: '#ffffff',
		muted: '#ffffff',
		colors: ['#ffffff']
	}))
}));
import { createBackgroundImageItem } from '@/features/background/backgroundImages';
import { cloneFactoryDefaultState } from '@/store/factoryDefaults';
import {
	buildComposeRuntimePatch,
	hydrateComposeBaseState
} from '@/store/compositionRuntimeState';
import { resolveVisualStateAt } from '@/features/composition/resolveVisualStateAt';
import type {
	CompositionCueV2,
	CompositionTrack,
	VibrixScoreEnvelope
} from '@/features/composition/vibrixScore';
import type { WallpaperState } from '@/types/wallpaper';
import {
	buildCompositionSegments,
	type CompositionSegment
} from './compositionSegments';

const TRACK_KINDS = ['scene', 'logo', 'image'] as const;

function track(kind: (typeof TRACK_KINDS)[number]): CompositionTrack {
	return {
		id: `track-${kind}`,
		name: kind,
		kind,
		order: 0,
		enabled: true,
		locked: false
	};
}

function cue(
	id: string,
	startTimeMs: number,
	target: CompositionCueV2['target']
): CompositionCueV2 {
	return {
		id,
		trackId: `track-${target.family}`,
		startTimeMs,
		target,
		priority: 0,
		enabled: true
	};
}

const CUES: CompositionCueV2[] = [
	cue('sc-a', 0, {
		kind: 'scene',
		family: 'scene',
		id: 'scene-a',
		revision: 'r'
	}),
	cue('lg-b', 12_500, {
		kind: 'feature-slot',
		family: 'logo',
		id: 'logo-b',
		revision: 'r'
	}),
	cue('sc-b', 25_000, {
		kind: 'scene',
		family: 'scene',
		id: 'scene-b',
		revision: 'r'
	}),
	cue('inh', 41_666, { kind: 'inherit', family: 'logo' }),
	cue('img-b', 58_333, {
		kind: 'image',
		family: 'image',
		id: 'image-b',
		revision: 'r'
	})
];

function score(cues: CompositionCueV2[]): VibrixScoreEnvelope {
	return {
		app: 'Lyrixa',
		exportKind: 'vibrix-score',
		schemaVersion: 2,
		exportedAt: '2026-10-03T00:00:00.000Z',
		projectName: 'Demo',
		sourceTrack: { fileName: 'demo.mp3', durationMs: 240000 },
		renderer: { minimumVersion: '0.7.0-alpha' },
		score: { tracks: TRACK_KINDS.map(kind => track(kind)), cues },
		dependencies: []
	};
}

function baseState(): WallpaperState {
	const state = cloneFactoryDefaultState();
	state.sceneSlots = [
		{ id: 'scene-a', name: 'A', logoSlotId: 'logo-a' },
		{ id: 'scene-b', name: 'B', logoSlotId: 'logo-b' }
	] as unknown as WallpaperState['sceneSlots'];
	state.logoProfileSlots = [
		{ id: 'logo-a', name: 'A', values: { logoBaseSize: 20 } },
		{ id: 'logo-b', name: 'B', values: { logoBaseSize: 40 } }
	] as unknown as WallpaperState['logoProfileSlots'];
	state.backgroundImages = [
		createBackgroundImageItem('image-a', 'virtual://img/a'),
		createBackgroundImageItem('image-b', 'virtual://img/b')
	];
	state.imageIds = ['image-a', 'image-b'];
	state.activeImageId = 'image-a';
	return state;
}

/** What the live store holds at this instant: base + runtime patch. */
function liveStoreFrame(
	base: WallpaperState,
	envelope: VibrixScoreEnvelope,
	timeMs: number
): WallpaperState {
	const resolved = resolveVisualStateAt(base, envelope, timeMs);
	return { ...base, ...buildComposeRuntimePatch(base, resolved) };
}

async function segmentsFor(
	cues: CompositionCueV2[],
	durationMs: number,
	fps: number
): Promise<CompositionSegment[]> {
	const base = baseState();
	return buildCompositionSegments(
		{ envelope: score(cues), base },
		base,
		durationMs,
		fps
	);
}

describe('buildCompositionSegments', () => {
	it('covers the video with one segment per state change', async () => {
		const base = baseState();
		const envelope = score(CUES);
		const segments = await buildCompositionSegments(
			{ envelope, base },
			base,
			90_000,
			24
		);
		expect(segments.length).toBeGreaterThan(1);
		expect(segments[0].startMs).toBe(0);
		for (let i = 1; i < segments.length; i += 1) {
			expect(segments[i].startMs).toBeGreaterThan(
				segments[i - 1].startMs
			);
		}
		// The last cue (image at 58_333) must produce a boundary, so the
		// segment list reaches past it and runs to the end of the video.
		expect(segments[segments.length - 1].startMs).toBeGreaterThanOrEqual(
			58_000
		);
	});

	it('mirrors the live projection at every segment start', async () => {
		const base = baseState();
		const envelope = score(CUES);
		const segments = await buildCompositionSegments(
			{ envelope, base },
			base,
			90_000,
			24
		);
		const keys = [
			'logoBaseSize',
			'activeImageId',
			'imageUrl',
			'activeSceneSlotId'
		] as const;
		for (const segment of segments) {
			const live = liveStoreFrame(base, envelope, segment.startMs);
			for (const key of keys) {
				expect(
					(segment.state as Record<string, unknown>)[key],
					`${key} at ${segment.startMs}ms`
				).toEqual((live as Record<string, unknown>)[key]);
			}
			const liveTransition = live.visualTransition;
			const offlineTransition = segment.state.visualTransition;
			expect(offlineTransition?.id ?? null).toBe(
				liveTransition?.id ?? null
			);
		}
	});

	it('a cue between frames lands on the next frame, exactly like seek', async () => {
		const base = baseState();
		const envelope = score([
			cue('sc-a', 0, {
				kind: 'scene',
				family: 'scene',
				id: 'scene-a',
				revision: 'r'
			}),
			cue('sc-b', 33, {
				kind: 'scene',
				family: 'scene',
				id: 'scene-b',
				revision: 'r'
			})
		]);
		const segments = await buildCompositionSegments(
			{ envelope, base },
			base,
			1000,
			10
		);
		// frameSteps = 100ms: the cue is first active at frame 1 (t = 100 >= 33).
		expect(segments.map(s => s.startMs)).toEqual([0, 100]);
		// Seek parity: whatever the offline export shows from 100ms is what the
		// live evaluator projects at any time >= 33ms on that frame.
		const live = liveStoreFrame(base, envelope, 100);
		expect(segments[1].state.logoBaseSize).toBe(live.logoBaseSize);
	});

	it('a disabled track never cuts', async () => {
		const base = baseState();
		const envelope = score([
			cue('sc-a', 0, {
				kind: 'scene',
				family: 'scene',
				id: 'scene-a',
				revision: 'r'
			}),
			cue('sc-b', 25_000, {
				kind: 'scene',
				family: 'scene',
				id: 'scene-b',
				revision: 'r'
			})
		]);
		envelope.score.tracks = envelope.score.tracks.map(t =>
			t.id === 'track-scene' ? { ...t, enabled: false } : t
		);
		const segments = await buildCompositionSegments(
			{ envelope, base },
			base,
			60_000,
			24
		);
		expect(segments).toHaveLength(1);
		expect(segments[0].state.activeSceneSlotId).toBe(
			liveStoreFrame(base, envelope, 30_000).activeSceneSlotId
		);
	});

	it('a cue past the end of the video adds no segment', async () => {
		const segments = await segmentsFor(
			[
				cue('sc-a', 0, {
					kind: 'scene',
					family: 'scene',
					id: 'scene-a',
					revision: 'r'
				}),
				cue('sc-b', 120_000, {
					kind: 'scene',
					family: 'scene',
					id: 'scene-b',
					revision: 'r'
				})
			],
			10_000,
			24
		);
		expect(segments).toHaveLength(1);
	});

	it('an empty score exports exactly one settled segment', async () => {
		const segments = await segmentsFor([], 10_000, 24);
		expect(segments).toHaveLength(1);
		expect(segments[0].startMs).toBe(0);
	});

	it('stamps composeEnabled and keeps untouched project keys', async () => {
		const base = baseState();
		base.scanlineIntensity = 0.42;
		const envelope = score([
			cue('sc-b', 500, {
				kind: 'scene',
				family: 'scene',
				id: 'scene-b',
				revision: 'r'
			})
		]);
		const segments = await buildCompositionSegments(
			{ envelope, base },
			base,
			5000,
			24
		);
		for (const segment of segments) {
			expect(
				(segment.state as Record<string, unknown>).composeEnabled
			).toBe(true);
			expect(segment.state.scanlineIntensity).toBe(0.42);
		}
	});

	it('the base flows through the evaluator hydrated, not the live frame', async () => {
		// The snapshot's base is the authored document; the score, not the
		// playhead, decides what each frame shows. A cue at t=0 must override
		// the base's own active slot.
		const base = baseState();
		base.activeSceneSlotId = 'scene-b';
		const segments = await segmentsFor(
			[
				cue('sc-a', 0, {
					kind: 'scene',
					family: 'scene',
					id: 'scene-a',
					revision: 'r'
				})
			],
			10_000,
			24
		);
		expect(segments[0].state.activeSceneSlotId).toBe('scene-a');
	});

	it('hydrate-style base keeps session URLs out of the segments', async () => {
		// Regression for gate 6: a score whose scene slot points at a different
		// image must project that image's URL — and never a `blob:` one — from
		// the hydrated base the snapshot carries.
		const base = hydrateComposeBaseState(baseState(), baseState());
		expect(
			base.backgroundImages.every(i => !i.url?.startsWith('blob:'))
		).toBe(true);
		const segments = await buildCompositionSegments(
			{ envelope: score(CUES), base },
			base,
			90_000,
			24
		);
		for (const segment of segments) {
			expect(segment.state.imageUrl ?? '').not.toMatch(/^blob:/);
		}
	});
});
