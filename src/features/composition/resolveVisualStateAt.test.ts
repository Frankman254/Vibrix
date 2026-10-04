import { describe, expect, it } from 'vitest';
import { createBackgroundImageItem } from '@/features/background/backgroundImages';
import { createDefaultSpectrumInstance } from '@/features/spectrum';
import { cloneFactoryDefaultState } from '@/store/factoryDefaults';
import type { SceneSlot, WallpaperState } from '@/types/wallpaper';
import type {
	CompositionCueV2,
	CompositionTrack,
	VibrixScoreEnvelope
} from './vibrixScore';
import { resolveVisualStateAt } from './resolveVisualStateAt';

function scene(id: string, logoSlotId: string): SceneSlot {
	return {
		id,
		name: id,
		spectrumSlotId: null,
		spectrumSecondSlotId: null,
		looksSlotId: null,
		particlesSlotId: null,
		rainSlotId: null,
		lightsSlotId: null,
		cameraFxSlotId: null,
		logoSlotId,
		trackTitleSlotId: null
	};
}

function baseState(): WallpaperState {
	const state = cloneFactoryDefaultState();
	state.logoProfileSlots = [
		{ id: 'logo-a', name: 'A', values: { logoBaseSize: 20 } },
		{ id: 'logo-b', name: 'B', values: { logoBaseSize: 40 } },
		{ id: 'logo-c', name: 'C', values: { logoBaseSize: 90 } }
	] as unknown as WallpaperState['logoProfileSlots'];
	state.sceneSlots = [scene('scene-a', 'logo-a'), scene('scene-b', 'logo-b')];
	state.backgroundImages = [
		createBackgroundImageItem('image-a', 'a.png'),
		createBackgroundImageItem('image-b', 'b.png')
	];
	state.imageIds = ['image-a', 'image-b'];
	state.activeImageId = 'image-a';
	return state;
}

function track(kind: CompositionTrack['kind']): CompositionTrack {
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

function score(
	tracks: CompositionTrack[],
	cues: CompositionCueV2[]
): VibrixScoreEnvelope {
	return {
		app: 'Lyrixa',
		exportKind: 'vibrix-score',
		schemaVersion: 2,
		exportedAt: '2026-10-03T00:00:00.000Z',
		projectName: 'Demo',
		sourceTrack: { fileName: 'demo.mp3', durationMs: 240000 },
		renderer: { minimumVersion: '0.7.0-alpha' },
		score: { tracks, cues },
		dependencies: []
	};
}

describe('resolveVisualStateAt', () => {
	it('holds an image activation until the next image cue', () => {
		const envelope = score(
			[track('image')],
			[
				cue('a', 0, {
					kind: 'image',
					family: 'image',
					id: 'image-a',
					revision: 'a'
				}),
				cue('b', 180000, {
					kind: 'image',
					family: 'image',
					id: 'image-b',
					revision: 'b'
				})
			]
		);
		expect(
			resolveVisualStateAt(baseState(), envelope, 179999).activeImageId
		).toBe('image-a');
		expect(
			resolveVisualStateAt(baseState(), envelope, 180000).activeImageId
		).toBe('image-b');
	});

	it('keeps a granular override above later scenes until inherit', () => {
		const envelope = score(
			[track('scene'), track('logo')],
			[
				cue('scene-a', 0, {
					kind: 'scene',
					family: 'scene',
					id: 'scene-a',
					revision: 'a'
				}),
				cue('logo-c', 1000, {
					kind: 'feature-slot',
					family: 'logo',
					id: 'logo-c',
					revision: 'c'
				}),
				cue('scene-b', 2000, {
					kind: 'scene',
					family: 'scene',
					id: 'scene-b',
					revision: 'b'
				}),
				cue('inherit-logo', 3000, {
					kind: 'inherit',
					family: 'logo'
				})
			]
		);
		expect(
			resolveVisualStateAt(baseState(), envelope, 2500).logoBaseSize
		).toBe(90);
		expect(
			resolveVisualStateAt(baseState(), envelope, 3000).logoBaseSize
		).toBe(40);
	});

	it('applies granular cues after aggregate cues in the same millisecond', () => {
		const envelope = score(
			[track('scene'), track('logo')],
			[
				cue('scene-b', 1000, {
					kind: 'scene',
					family: 'scene',
					id: 'scene-b',
					revision: 'b'
				}),
				cue('logo-c', 1000, {
					kind: 'feature-slot',
					family: 'logo',
					id: 'logo-c',
					revision: 'c'
				})
			]
		);
		expect(
			resolveVisualStateAt(baseState(), envelope, 1000).logoBaseSize
		).toBe(90);
	});

	it('changes Spectrum 2 without replacing Spectrum 1', () => {
		const base = baseState();
		base.spectrumBarCount = 17;
		base.spectrumInstances = [
			{
				...createDefaultSpectrumInstance(),
				enabled: true,
				spectrumBarCount: 23
			}
		];
		base.spectrumSecondProfileSlots = [
			{
				id: 'spectrum-two-a',
				name: 'Spectrum two A',
				values: {
					spectrumInstances: [
						{
							...createDefaultSpectrumInstance(),
							enabled: true,
							spectrumBarCount: 48
						}
					]
				} as never
			}
		];
		const envelope = score(
			[track('spectrum-second')],
			[
				cue('spectrum-two', 1000, {
					kind: 'feature-slot',
					family: 'spectrum-second',
					id: 'spectrum-two-a',
					revision: 's2'
				})
			]
		);
		const resolved = resolveVisualStateAt(base, envelope, 1000);
		expect(resolved.spectrumBarCount).toBe(17);
		expect(resolved.spectrumInstances[0]?.spectrumBarCount).toBe(48);
	});

	it('is independent of an earlier seek result', () => {
		const base = baseState();
		const envelope = score(
			[track('scene')],
			[
				cue('scene-a', 0, {
					kind: 'scene',
					family: 'scene',
					id: 'scene-a',
					revision: 'a'
				}),
				cue('scene-b', 5000, {
					kind: 'scene',
					family: 'scene',
					id: 'scene-b',
					revision: 'b'
				})
			]
		);
		resolveVisualStateAt(base, envelope, 1000);
		const afterSeek = resolveVisualStateAt(base, envelope, 6000);
		const direct = resolveVisualStateAt(baseState(), envelope, 6000);
		expect(afterSeek.logoBaseSize).toBe(direct.logoBaseSize);
		expect(base.logoBaseSize).toBe(baseState().logoBaseSize);
	});
});
