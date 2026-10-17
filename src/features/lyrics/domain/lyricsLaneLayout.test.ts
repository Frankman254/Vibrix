import { describe, expect, it } from 'vitest';
import { resolveLyricsLaneCenters } from './lyricsLaneLayout';
import type { LyrixaLyricsBundleEnvelope } from './lyrixaBundleTypes';

function bundle() {
	return {
		project: {
			layers: [
				{ id: 'translation', role: 'translation', order: 0 },
				{ id: 'original', role: 'primary', order: 1 },
				{ id: 'romaji', role: 'romanization', order: 2 }
			],
			clips: [
				{ layerId: 'original', text: '原文', startTime: 0, endTime: 3 },
				{ layerId: 'romaji', text: 'genbun', startTime: 0, endTime: 2 },
				{
					layerId: 'translation',
					text: 'Original',
					startTime: 0,
					endTime: 1
				}
			]
		}
	} as LyrixaLyricsBundleEnvelope;
}

describe('active lyric lane blocks', () => {
	it('orders three lanes by role, independently of imported order', () => {
		expect([...resolveLyricsLaneCenters(bundle(), 0.5)]).toEqual([
			['original', 1 / 6],
			['romaji', 0.5],
			['translation', 5 / 6]
		]);
	});
	it('reflows as the current text disappears, leaving no reserved empty lanes', () => {
		expect([...resolveLyricsLaneCenters(bundle(), 1.5)]).toEqual([
			['original', 0.25],
			['romaji', 0.75]
		]);
		expect([...resolveLyricsLaneCenters(bundle(), 2.5)]).toEqual([
			['original', 0.5]
		]);
		expect(resolveLyricsLaneCenters(bundle(), 4).size).toBe(0);
	});
	it('centers any sole enabled lane and splits any pair equally', () => {
		expect([
			...resolveLyricsLaneCenters(bundle(), 0.5, {
				original: { visible: false }
			})
		]).toEqual([
			['romaji', 0.25],
			['translation', 0.75]
		]);
		expect([
			...resolveLyricsLaneCenters(bundle(), 0.5, {
				original: { visible: false },
				romaji: { visible: false }
			})
		]).toEqual([['translation', 0.5]]);
	});
	it('excludes muted, blank and suppressed text, and honors visibility overrides', () => {
		const input = bundle();
		input.project.clips[0]!.muted = true;
		input.project.clips[1]!.text = '  ';
		input.project.layers[0]!.visible = false;
		expect(resolveLyricsLaneCenters(input, 0.5).size).toBe(0);
		expect([
			...resolveLyricsLaneCenters(input, 0.5, {
				translation: { visible: true }
			})
		]).toEqual([['translation', 0.5]]);
		input.project.layers[0]!.renderSettings = {
			positionPreset: 'center',
			suppressClipText: true
		};
		expect(
			resolveLyricsLaneCenters(input, 0.5, {
				translation: { visible: true }
			}).size
		).toBe(0);
	});
});
