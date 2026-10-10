/**
 * Re-snapshot the factory look from a settings export.
 *
 * Calibrate the wallpaper in the editor, export settings, then:
 *
 *   pnpm defaults:import -- /absolute/path/to/settings.json
 *
 * The export is the source of truth for WHICH keys exist — it comes out of the
 * running app, so a feature shipped today is in it. Every key it carries that
 * `src/store/factoryLookKeys.ts` classifies as part of the look is captured;
 * assets, runtime state, the user's slot library, editor preferences, export
 * targets and playback transport are not.
 *
 * This replaced an allowlist importer that only re-read keys already present in
 * the snapshot plus a hand-maintained list. Everything added after the last run
 * was invisible to it, which is how the shipped look ended up with no opinion
 * about 179 visible settings while still carrying 103 `spectrumClone*` keys from
 * a model deleted in store v86.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

// `npm run x -- file` swallows the separator; `pnpm run x -- file` passes it
// through as its own argument. Accept both so the documented command works.
const sourcePath = process.argv.slice(2).find(arg => arg !== '--');
if (!sourcePath) {
	throw new Error(
		'Usage: pnpm defaults:import -- /absolute/path/to/settings.json'
	);
}

const projectRoot = resolve(import.meta.dirname, '..');
const targetPath = resolve(projectRoot, 'src/lib/canonicalFactoryPresets.ts');
const classificationPath = resolve(projectRoot, 'src/store/factoryLookKeys.ts');
const debtPath = resolve(projectRoot, 'src/store/factoryLookDebt.ts');

const targetSource = readFileSync(targetPath, 'utf8');
const settingsEnvelope = JSON.parse(readFileSync(resolve(sourcePath), 'utf8'));

// Both tags: `lwag-settings` is what exports carried before the Vibrix rename,
// and the canonical defaults on disk may still be one of those files.
const ACCEPTED_FORMATS = ['vibrix-settings', 'lwag-settings'];

if (
	!ACCEPTED_FORMATS.includes(settingsEnvelope.format) ||
	typeof settingsEnvelope.state !== 'object' ||
	settingsEnvelope.state === null
) {
	throw new Error(
		`Expected a JSON export (${ACCEPTED_FORMATS.join(' or ')}) with a state object.`
	);
}

const state = settingsEnvelope.state;

/**
 * The classification lives in TypeScript because it is typed against
 * `WallpaperState`; this script cannot import it, so it reads the quoted keys
 * out of the source. `factoryLookCoverage.test.ts` asserts this same expression
 * still yields the module's own list, so a rewrite of that file in a shape this
 * cannot read is a test failure rather than a silent import of asset keys.
 */
function readNonLookKeys() {
	const source = readFileSync(classificationPath, 'utf8');
	const blocks = source.matchAll(
		/const [A-Z_]+_KEYS = \[([^\]]*)\] as const satisfies readonly StateKey\[\];/g
	);
	const keys = new Set();
	for (const block of blocks) {
		for (const match of block[1].matchAll(/'([^']+)'/g)) {
			keys.add(match[1]);
		}
	}
	// Sentinels: one per category, so a partial parse cannot pass unnoticed.
	for (const sentinel of [
		'backgroundImages',
		'motionPaused',
		'sceneSlots',
		'language',
		'offlineExportFps',
		'audioFileVolume'
	]) {
		if (!keys.has(sentinel)) {
			throw new Error(
				`Could not read the look classification: expected ${sentinel} among the non-look keys. Has src/store/factoryLookKeys.ts changed shape?`
			);
		}
	}
	return keys;
}

const nonLookKeys = readNonLookKeys();
// Mirrors `FACTORY_LOOK_OWNED_EXCEPTIONS`: the bundled logo and the shipped
// spectrum profile library are factory-owned despite looking like content.
const OWNED_EXCEPTIONS = new Set(['logoId', 'logoUrl', 'spectrumProfileSlots']);
const isLookKey = key => !nonLookKeys.has(key) || OWNED_EXCEPTIONS.has(key);

const FACTORY_LOGO_TOKEN = '__CANONICAL_FACTORY_LOGO_URL__';
const VIBRIX_LOGO_TOKEN = '__VIBRIX_FACTORY_LOGO_URL__';
const PATCH_END = /\n\} as (?:unknown as )?Partial<WallpaperState>;/;

function readCanonicalObject(exportName) {
	const marker = `export const ${exportName} = `;
	const start = targetSource.indexOf(marker);
	if (start < 0) throw new Error(`Could not find ${exportName}.`);

	const objectStart = start + marker.length;
	const rest = targetSource.slice(objectStart);
	const end = rest.match(PATCH_END);
	if (!end) throw new Error(`Could not parse ${exportName}.`);

	return Function(
		'CANONICAL_FACTORY_LOGO_URL',
		'VIBRIX_FACTORY_LOGO_URL',
		`"use strict"; return (${rest.slice(0, end.index + 2)});`
	)(FACTORY_LOGO_TOKEN, VIBRIX_LOGO_TOKEN);
}

const previous = {
	...readCanonicalObject('CANONICAL_FACTORY_SETTINGS_PATCH'),
	...readCanonicalObject('CANONICAL_FACTORY_SPECTRUM_PATCH')
};

// Spectrum settings live in their own patch; everything else in the first one.
// Nothing but the file's shape depends on the split.
const nextSettings = {};
const nextSpectrum = {};
for (const key of Object.keys(state).sort()) {
	if (!isLookKey(key)) continue;
	const target = key.startsWith('spectrum') ? nextSpectrum : nextSettings;
	target[key] = state[key];
}

// Factory defaults must stay independent from local IndexedDB asset references.
nextSettings.logoId = null;
nextSettings.logoUrl = VIBRIX_LOGO_TOKEN;

function renderObject(value) {
	return JSON.stringify(value, null, '\t')
		.replaceAll(`"${FACTORY_LOGO_TOKEN}"`, 'CANONICAL_FACTORY_LOGO_URL')
		.replaceAll(`"${VIBRIX_LOGO_TOKEN}"`, 'VIBRIX_FACTORY_LOGO_URL');
}

const settingsMarker = 'export const CANONICAL_FACTORY_SETTINGS_PATCH = ';
const header = targetSource.slice(0, targetSource.indexOf(settingsMarker));
const output = `${header}export const CANONICAL_FACTORY_SETTINGS_PATCH = ${renderObject(
	nextSettings
)} as Partial<WallpaperState>;

export const CANONICAL_FACTORY_SPECTRUM_PATCH = ${renderObject(
	nextSpectrum
)} as Partial<WallpaperState>;

export const CANONICAL_DEFAULT_STATE_PATCH = {
	...CANONICAL_FACTORY_SETTINGS_PATCH,
	...CANONICAL_FACTORY_SPECTRUM_PATCH,
	logoId: null,
	logoUrl: VIBRIX_FACTORY_LOGO_URL
} as Partial<WallpaperState>;
`;

writeFileSync(targetPath, output);

/**
 * Prune the declared debt. A look key the export just supplied has an opinion
 * now, and leaving it listed would make `factoryLookCoverage.test.ts` fail for
 * lying — the list is meant to shrink to nothing.
 */
const covered = new Set([
	...Object.keys(nextSettings),
	...Object.keys(nextSpectrum)
]);
const remainingDebt = Object.keys(state)
	.filter(
		key => isLookKey(key) && !covered.has(key) && !OWNED_EXCEPTIONS.has(key)
	)
	.sort();
const debtSource = readFileSync(debtPath, 'utf8');
const debtMarker = 'export const FACTORY_LOOK_WITHOUT_OPINION = [';
const debtHeader = debtSource.slice(0, debtSource.indexOf(debtMarker));
writeFileSync(
	debtPath,
	`${debtHeader}${debtMarker}\n${remainingDebt
		.map(key => `\t'${key}',\n`)
		.join('')}] as const satisfies readonly (keyof WallpaperState)[];\n`
);

const previousKeys = new Set(Object.keys(previous));
const added = [...covered].filter(key => !previousKeys.has(key));
const dropped = [...previousKeys].filter(key => !covered.has(key));
console.log(
	`Factory look re-snapshotted from ${sourcePath}\n` +
		`  settings keys: ${Object.keys(nextSettings).length}\n` +
		`  spectrum keys: ${Object.keys(nextSpectrum).length}\n` +
		`  newly covered: ${added.length}${added.length ? ` (${added.slice(0, 8).join(', ')}${added.length > 8 ? ', …' : ''})` : ''}\n` +
		`  no longer covered: ${dropped.length}${dropped.length ? ` (${dropped.slice(0, 8).join(', ')}${dropped.length > 8 ? ', …' : ''})` : ''}\n` +
		`  still without an opinion: ${remainingDebt.length}\n\n` +
		'Run `pnpm format` and `pnpm test:run` next.'
);
