import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { IntroSequenceState } from './introPlan';
import { resolveIntroPreviewWindow } from './introPlan';
import {
	getIntroPreview,
	stopIntroPreview,
	useIntroPreviewStore
} from './introPreviewStore';

function introState(
	patch: Partial<IntroSequenceState['introSequence']> = {},
	outro: Partial<IntroSequenceState['outroSequence']> = {}
): IntroSequenceState {
	return {
		introSequence: {
			...DEFAULT_STATE.introSequence,
			enabled: true,
			durationSec: 4,
			...patch
		},
		outroSequence: {
			...DEFAULT_STATE.outroSequence,
			enabled: true,
			durationSec: 6,
			...outro
		}
	};
}

describe('intro preview store', () => {
	beforeEach(() => {
		stopIntroPreview();
	});

	it('starts empty and hands the live preview to the render loop', () => {
		expect(getIntroPreview()).toBeNull();
		useIntroPreviewStore.getState().startIntroPreview('intro', 1000);
		expect(getIntroPreview()).toEqual({
			kind: 'intro',
			startedAtMs: 1000
		});
	});

	it('never runs two previews at once', () => {
		useIntroPreviewStore.getState().startIntroPreview('intro', 1000);
		useIntroPreviewStore.getState().startIntroPreview('outro', 2000);
		expect(getIntroPreview()).toEqual({
			kind: 'outro',
			startedAtMs: 2000
		});
	});

	it('stops', () => {
		useIntroPreviewStore.getState().startIntroPreview('outro', 0);
		stopIntroPreview();
		expect(getIntroPreview()).toBeNull();
	});
});

describe('resolveIntroPreviewWindow', () => {
	it('runs the asked-for window from its own clock', () => {
		const state = introState();
		expect(resolveIntroPreviewWindow(state, 'intro', 0, 200)).toEqual({
			kind: 'intro',
			progress: 0,
			elapsedSec: 0,
			durationSec: 4
		});
		expect(
			resolveIntroPreviewWindow(state, 'intro', 2, 200)?.progress
		).toBe(0.5);
	});

	/**
	 * The ending normally lives at the tail of the track. A preview must not
	 * need the playhead to be there — that is the whole reason it exists.
	 */
	it('shows the ending without the playhead being near the end', () => {
		const window_ = resolveIntroPreviewWindow(
			introState(),
			'outro',
			3,
			200
		);
		expect(window_?.kind).toBe('outro');
		expect(window_?.progress).toBe(0.5);
	});

	it('ends by itself when the window is over', () => {
		const state = introState();
		expect(resolveIntroPreviewWindow(state, 'intro', 4, 200)).toBeNull();
		expect(resolveIntroPreviewWindow(state, 'intro', 99, 200)).toBeNull();
	});

	it('shows nothing for a window that is switched off', () => {
		const state = introState({ enabled: false });
		expect(resolveIntroPreviewWindow(state, 'intro', 0, 200)).toBeNull();
		expect(
			resolveIntroPreviewWindow(state, 'outro', 0, 200)
		).not.toBeNull();
	});

	/**
	 * The preview must show the shape the FILE will have, clamp included: on a
	 * 6 s track a 4 s intro really only gets 3 s.
	 */
	it('honours the never-more-than-half-the-video clamp', () => {
		const window_ = resolveIntroPreviewWindow(introState(), 'intro', 0, 6);
		expect(window_?.durationSec).toBe(3);
		expect(
			resolveIntroPreviewWindow(introState(), 'intro', 3, 6)
		).toBeNull();
	});

	/** Configuring before picking any audio still has to be visible. */
	it('uses the configured duration when no track is loaded', () => {
		const window_ = resolveIntroPreviewWindow(introState(), 'intro', 2, 0);
		expect(window_?.durationSec).toBe(4);
		expect(window_?.progress).toBe(0.5);
	});

	it('clamps a negative elapsed to the start of the window', () => {
		expect(
			resolveIntroPreviewWindow(introState(), 'intro', -5, 200)?.progress
		).toBe(0);
	});
});

/**
 * The guarantee is structural, so it is tested structurally: the exported file
 * is ruled by the track's clock because nothing in the exporter can even see the
 * preview. A preview running when an export starts must not leak a window into
 * the file.
 */
describe('the offline exporter cannot see a preview', () => {
	function filesUnder(dir: string): string[] {
		return readdirSync(dir).flatMap(entry => {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) return filesUnder(path);
			return /\.tsx?$/.test(entry) ? [path] : [];
		});
	}

	it('never imports introPreviewStore', () => {
		const offenders = filesUnder('src/features/export').filter(path =>
			readFileSync(path, 'utf8').includes('introPreviewStore')
		);
		expect(offenders).toEqual([]);
	});
});
