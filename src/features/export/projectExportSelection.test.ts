import { describe, expect, it } from 'vitest';

import {
	PROJECT_EXPORT_SECTION_KEYS,
	PROJECT_EXPORT_SECTION_ORDER,
	isProjectExportRuntimeKey
} from '@/features/export/projectExportSelection';
import { isWorkspaceOnlyKey } from '@/lib/workspaceKeys';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { WallpaperState } from '@/types/wallpaper';

/**
 * The section map used to be a hand-kept whitelist, and a partial import
 * (any section unchecked) only restores the keys it names. It went stale:
 * the intro / ending windows, the effect and motion layers, the global
 * compositions, the calibration slots and ~100 other live keys were silently
 * replaced by whatever the importing session happened to have.
 *
 * These tests make that failure impossible to repeat: add a persisted key
 * without claiming it, and the suite goes red with the key's own name.
 */
describe('every live state key is claimed by the project export', () => {
	it('assigns each key to a section, to the workspace, or to the runtime list', () => {
		const claimed = new Set<string>();
		for (const keys of Object.values(PROJECT_EXPORT_SECTION_KEYS)) {
			for (const key of keys) claimed.add(key);
		}

		const unclaimed = (
			Object.keys(DEFAULT_STATE) as (keyof WallpaperState)[]
		)
			.filter(key => !isWorkspaceOnlyKey(key))
			.filter(key => !isProjectExportRuntimeKey(key))
			.filter(key => !claimed.has(key));

		expect(unclaimed).toEqual([]);
	});

	it('never puts the same key in two sections', () => {
		const owner = new Map<string, string>();
		const duplicated: string[] = [];
		for (const sectionId of PROJECT_EXPORT_SECTION_ORDER) {
			for (const key of PROJECT_EXPORT_SECTION_KEYS[sectionId]) {
				const previous = owner.get(key);
				if (previous !== undefined) {
					duplicated.push(`${key}: ${previous} + ${sectionId}`);
					continue;
				}
				owner.set(key, sectionId);
			}
		}

		expect(duplicated).toEqual([]);
	});

	it('only names keys that still exist', () => {
		const stale: string[] = [];
		for (const sectionId of PROJECT_EXPORT_SECTION_ORDER) {
			for (const key of PROJECT_EXPORT_SECTION_KEYS[sectionId]) {
				if (key in DEFAULT_STATE) continue;
				stale.push(`${key} (${sectionId})`);
			}
		}

		expect(stale).toEqual([]);
	});

	it('keeps the intro and the ending together in their own section', () => {
		expect(PROJECT_EXPORT_SECTION_ORDER).toContain('intro');
		expect(PROJECT_EXPORT_SECTION_KEYS.intro).toEqual([
			'introSequence',
			'outroSequence',
			'introProfileSlots',
			'setlistIntroFallback'
		]);
	});
});
