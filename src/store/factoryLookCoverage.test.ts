import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CANONICAL_DEFAULT_STATE_PATCH } from '@/lib/canonicalFactoryPresets';
import { DEFAULT_STATE } from '@/store/defaultState';
import {
	FACTORY_LOOK_OWNED_EXCEPTIONS,
	NON_LOOK_STATE_KEYS,
	isFactoryLookKey
} from '@/store/factoryLookKeys';
import { FACTORY_LOOK_WITHOUT_OPINION } from '@/store/factoryLookDebt';

/**
 * The factory look must stay an honest description of the shipped project.
 *
 * It rotted once already: the snapshot still carried 103 `spectrumClone*` keys
 * from a spectrum model deleted in store v86, the file needed `as unknown as`
 * to hide them, and the importer's allowlist meant nothing added since could
 * ever get in. These assertions make each of those a test failure.
 */
const liveKeys = Object.keys(DEFAULT_STATE);
const liveKeySet = new Set(liveKeys);
const canonicalKeys = Object.keys(CANONICAL_DEFAULT_STATE_PATCH);
const covered = new Set(canonicalKeys);
const assetKeys = new Set<string>(FACTORY_LOOK_OWNED_EXCEPTIONS);

describe('factory look coverage', () => {
	it('carries no key the state no longer has', () => {
		// A removed or renamed feature must take its factory opinion with it.
		// This is what `as unknown as Partial<WallpaperState>` used to hide.
		expect(canonicalKeys.filter(key => !liveKeySet.has(key))).toEqual([]);
	});

	it('pins no asset, runtime value or user library entry', () => {
		const offenders = canonicalKeys.filter(
			key =>
				liveKeySet.has(key) &&
				!isFactoryLookKey(key) &&
				!assetKeys.has(key)
		);
		expect(offenders).toEqual([]);
	});

	it('has an opinion, or declared debt, for every look key', () => {
		const undeclared = liveKeys.filter(
			key =>
				isFactoryLookKey(key) &&
				!covered.has(key) &&
				!(FACTORY_LOOK_WITHOUT_OPINION as readonly string[]).includes(
					key
				)
		);
		// A new visual key lands here the moment it is added to the state.
		// Either import a calibrated look that includes it, or declare it in
		// `factoryLookDebt.ts` and say why.
		expect(undeclared).toEqual([]);
	});

	it('keeps the debt list from lying', () => {
		const alreadyCovered = FACTORY_LOOK_WITHOUT_OPINION.filter(key =>
			covered.has(key)
		);
		// The list shrinks on its own after `pnpm defaults:import`; stale
		// entries would otherwise hide real coverage.
		expect(alreadyCovered).toEqual([]);
	});

	it('declares debt only for keys that are a look and still exist', () => {
		const bogus = FACTORY_LOOK_WITHOUT_OPINION.filter(
			key => !liveKeySet.has(key) || !isFactoryLookKey(key)
		);
		expect(bogus).toEqual([]);
	});

	it('classifies only keys the state actually has', () => {
		expect(NON_LOOK_STATE_KEYS.filter(key => !liveKeySet.has(key))).toEqual(
			[]
		);
	});
});

describe('the defaults importer can read the classification', () => {
	// `scripts/importCanonicalFactoryDefaults.mjs` cannot import TypeScript, so
	// it extracts the quoted keys out of `factoryLookKeys.ts` with this same
	// expression. If the module is ever written in a shape the regex cannot
	// read, the importer would silently treat asset and runtime keys as part of
	// the look — so the extraction is asserted here instead of discovered later.
	const EXTRACT =
		/const [A-Z_]+_KEYS = \[([^\]]*)\] as const satisfies readonly StateKey\[\];/g;

	it('extracts exactly the classified keys from source', () => {
		const source = readFileSync('src/store/factoryLookKeys.ts', 'utf8');
		const extracted = new Set<string>();
		for (const match of source.matchAll(EXTRACT)) {
			for (const key of match[1]!.matchAll(/'([^']+)'/g)) {
				extracted.add(key[1]!);
			}
		}
		expect([...extracted].sort()).toEqual([...NON_LOOK_STATE_KEYS].sort());
	});
});
