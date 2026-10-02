import { describe, expect, it } from 'vitest';
import type { WallpaperState } from '@/types/wallpaper';
import { buildAuthoringManifest } from '@/features/scenes/authoringManifest';
import { CONTRACT_FIXTURE_STATE } from '@/features/scenes/authoringManifestFixture';
import { parseVibrixScoreEnvelope, reviewVibrixScore } from './vibrixScore';
import {
	VibrixScoreLoadError,
	loadVibrixScoreFromFile,
	loadVibrixScoreFromText
} from './vibrixScoreLoader';

const MANIFEST = buildAuthoringManifest(
	CONTRACT_FIXTURE_STATE as unknown as WallpaperState,
	{ exportedAt: '2026-10-02T00:00:00.000Z', projectName: 'Demo' }
);

function revisionOfSlot(slotId: string): string {
	const slot = MANIFEST.slots.find(entry => entry.id === slotId);
	if (!slot) throw new Error(`fixture slot ${slotId} is missing`);
	return slot.revision;
}

/**
 * The envelope `Lyrixa/src/core/composition/score.ts` produces, written against
 * the shared manifest fixture. Field-for-field what `createVibrixScoreEnvelope`
 * emits — if Lyrixa's producer changes shape, this is where it surfaces.
 */
function scoreFixture(overrides: Record<string, unknown> = {}) {
	return {
		app: 'Lyrixa',
		exportKind: 'vibrix-score',
		schemaVersion: 1,
		exportedAt: '2026-10-02T09:00:00.000Z',
		projectName: 'Demo',
		sourceTrack: {
			fileName: 'demo.mp3',
			durationMs: 215000
		},
		renderer: {
			minimumVersion: '0.7.0-alpha',
			sourceProjectId: 'lyrixa-project-1',
			catalogRevision: MANIFEST.revision
		},
		score: {
			tracks: [
				{
					id: 'composition-scene',
					name: 'Scene',
					kind: 'scene',
					order: 0,
					enabled: true,
					locked: false
				}
			],
			cues: [
				{
					id: 'cue-scene-a-0',
					trackId: 'composition-scene',
					startTimeMs: 0,
					endTimeMs: 32000,
					target: {
						kind: 'scene',
						family: 'scene',
						slotId: 'scene-a',
						slotRevision: revisionOfSlot('scene-a')
					},
					transition: {
						type: 'crossfade',
						durationMs: 800,
						easing: 'ease-in-out'
					},
					priority: 0,
					enabled: true
				}
			]
		},
		dependencies: [
			{
				slotId: 'scene-a',
				family: 'scene',
				name: 'Verse',
				revision: revisionOfSlot('scene-a')
			}
		],
		...overrides
	};
}

describe('parseVibrixScoreEnvelope', () => {
	it('accepts the envelope Lyrixa produces', () => {
		const result = parseVibrixScoreEnvelope(scoreFixture());
		if (!result.ok) throw new Error(result.errors.join('\n'));
		expect(result.score.score.cues).toHaveLength(1);
		expect(result.score.score.cues[0].transition).toEqual({
			type: 'crossfade',
			durationMs: 800,
			easing: 'ease-in-out'
		});
		expect(result.score.renderer.catalogRevision).toBe(MANIFEST.revision);
	});

	it('accepts a score with no audio track attached', () => {
		const result = parseVibrixScoreEnvelope(
			scoreFixture({ sourceTrack: null })
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.score.sourceTrack).toBeNull();
	});

	it('rejects a manifest sent in place of a score', () => {
		const result = parseVibrixScoreEnvelope(MANIFEST);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.join('\n')).toContain(
			'score.app must be "Lyrixa"'
		);
	});

	it('names a family this build does not know instead of dropping it', () => {
		// The exact case the contract closed: `motion` was deleted from Vibrix,
		// so a score that still carries it must say so out loud.
		const withMotion = scoreFixture();
		withMotion.score.tracks[0].kind = 'motion';
		const result = parseVibrixScoreEnvelope(withMotion);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.join('\n')).toContain(
			'"motion" is not a Vibrix slot family'
		);
	});

	it('rejects a cue whose track does not exist', () => {
		const orphan = scoreFixture();
		orphan.score.cues[0].trackId = 'no-such-track';
		const result = parseVibrixScoreEnvelope(orphan);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.join('\n')).toContain('has no track');
	});

	it('rejects a cue that ends before it starts', () => {
		const inverted = scoreFixture();
		inverted.score.cues[0].endTimeMs = 0;
		const result = parseVibrixScoreEnvelope(inverted);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.join('\n')).toContain(
			'endTimeMs must be greater than startTimeMs'
		);
	});

	it('rejects a cue with no recorded revision, which would defeat the check', () => {
		const noRevision = scoreFixture();
		delete (noRevision.score.cues[0].target as Record<string, unknown>)
			.slotRevision;
		const result = parseVibrixScoreEnvelope(noRevision);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.join('\n')).toContain('slotRevision');
	});

	it('collects every complaint rather than stopping at the first', () => {
		const result = parseVibrixScoreEnvelope({ app: 'Other', score: 'bad' });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.length).toBeGreaterThan(2);
	});

	it('falls back to safe values for an unknown transition or easing', () => {
		const odd = scoreFixture();
		odd.score.cues[0].transition = {
			type: 'warp',
			durationMs: -5,
			easing: 'bounce'
		} as never;
		const result = parseVibrixScoreEnvelope(odd);
		if (!result.ok) throw new Error(result.errors.join('\n'));
		expect(result.score.score.cues[0].transition).toEqual({
			type: 'cut',
			durationMs: 0,
			easing: 'linear'
		});
	});
});

describe('reviewVibrixScore', () => {
	function review(
		mutate: (fixture: ReturnType<typeof scoreFixture>) => void
	) {
		const fixture = scoreFixture();
		mutate(fixture);
		const parsed = parseVibrixScoreEnvelope(fixture);
		if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
		return reviewVibrixScore(parsed.score, MANIFEST);
	}

	it('reports a cue whose slot is untouched as ready', () => {
		const result = review(() => {});
		expect(result.readyCount).toBe(1);
		expect(result.totalCount).toBe(1);
		expect(result.cues[0].slotName).toBe('Verse');
		expect(result.catalogMatches).toBe(true);
	});

	it('reports a cue as updated when the slot moved after authoring', () => {
		const result = review(fixture => {
			fixture.score.cues[0].target.slotRevision = 'something-older';
		});
		expect(result.counts.updated).toBe(1);
		expect(result.counts.ready).toBe(0);
		expect(result.catalogMatches).toBe(true);
	});

	it('reports a cue as missing when the slot is gone from this project', () => {
		const result = review(fixture => {
			fixture.score.cues[0].target.slotId = 'scene-deleted';
		});
		expect(result.counts.missing).toBe(1);
		// With no slot to name, it still says which id it wanted.
		expect(result.cues[0].slotName).toBe('scene-deleted');
	});

	it('reports a cue on an empty slot rather than letting it render nothing', () => {
		const result = review(fixture => {
			fixture.score.cues[0].target.slotId = 'scene-c';
			fixture.score.cues[0].target.slotRevision = 'empty';
		});
		expect(result.counts.empty).toBe(1);
	});

	it('refuses a cue on a slot this build says is not cueable', () => {
		const result = review(fixture => {
			fixture.score.cues[0].target.slotId = 'intro-1';
			fixture.score.cues[0].target.slotRevision =
				revisionOfSlot('intro-1');
		});
		expect(result.counts['not-cueable']).toBe(1);
	});

	it('flags a track whose family this project publishes no slots for', () => {
		const result = review(fixture => {
			fixture.score.tracks[0].kind = 'rain';
		});
		// The fixture state has no rain slots at all.
		expect(result.unpublishedFamilies).toEqual(['rain']);
	});

	it('does not claim a catalogue match when the score recorded none', () => {
		const result = review(fixture => {
			delete (fixture.renderer as Record<string, unknown>)
				.catalogRevision;
		});
		expect(result.catalogMatches).toBe(false);
	});

	it('notices that the catalogue moved as a whole', () => {
		const result = review(fixture => {
			fixture.renderer.catalogRevision = 'an-older-catalogue';
		});
		expect(result.catalogMatches).toBe(false);
	});
});

describe('loading a score', () => {
	it('round-trips through text', () => {
		const result = loadVibrixScoreFromText(JSON.stringify(scoreFixture()), {
			kind: 'text',
			label: 'inline'
		});
		expect(result.score.projectName).toBe('Demo');
		expect(result.origin.label).toBe('inline');
	});

	it('reports unparseable bytes as a parse failure, not a crash', () => {
		expect(() =>
			loadVibrixScoreFromText('not json at all', {
				kind: 'file',
				label: 'broken.json'
			})
		).toThrow(VibrixScoreLoadError);
		try {
			loadVibrixScoreFromText('not json at all', {
				kind: 'file',
				label: 'broken.json'
			});
		} catch (error) {
			expect((error as VibrixScoreLoadError).reason).toBe('parse');
		}
	});

	it('carries every validation issue, not only the first', async () => {
		const file = {
			name: 'wrong.vibrix-score.json',
			text: async () => JSON.stringify({ app: 'Other', score: 'bad' })
		};
		await expect(loadVibrixScoreFromFile(file)).rejects.toThrow(
			VibrixScoreLoadError
		);
		await loadVibrixScoreFromFile(file).catch(error => {
			const failure = error as VibrixScoreLoadError;
			expect(failure.reason).toBe('invalid');
			expect(failure.issues.length).toBeGreaterThan(1);
			expect(failure.origin.label).toBe('wrong.vibrix-score.json');
		});
	});

	it('reports an unreadable file as a read failure', async () => {
		const file = {
			name: 'locked.json',
			text: async () => {
				throw new Error('EACCES');
			}
		};
		await loadVibrixScoreFromFile(file).catch(error => {
			expect((error as VibrixScoreLoadError).reason).toBe('read');
		});
	});

	it('accepts a real file-shaped source', async () => {
		const result = await loadVibrixScoreFromFile({
			name: 'demo.vibrix-score.json',
			text: async () => JSON.stringify(scoreFixture())
		});
		expect(result.origin.kind).toBe('file');
		expect(result.score.score.cues).toHaveLength(1);
	});
});
