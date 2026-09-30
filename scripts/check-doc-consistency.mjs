#!/usr/bin/env node
/**
 * Lightweight documentation drift checks.
 * Run: pnpm docs:check
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function read(path) {
	return readFileSync(resolve(root, path), 'utf8');
}

function requireFile(relativePath) {
	if (!existsSync(resolve(root, relativePath))) {
		errors.push(`Missing required file: ${relativePath}`);
	}
}

function extractConst(source, name) {
	const match = source.match(
		new RegExp(`export const ${name}\\s*=\\s*([^;\\n]+)`)
	);
	return match ? match[1].trim().replace(/['"]/g, '') : null;
}

// ── Versions ────────────────────────────────────────────────────────────────
const pkg = JSON.parse(read('package.json'));
const versionTs = read('src/lib/version.ts');
const appVersion = extractConst(versionTs, 'APP_VERSION');
const storePersist = Number(extractConst(versionTs, 'STORE_PERSIST_VERSION'));

if (appVersion !== pkg.version) {
	errors.push(
		`APP_VERSION (${appVersion}) !== package.json version (${pkg.version})`
	);
}

const changelog = read('CHANGELOG.md');
if (!changelog.includes(`## [${pkg.version}]`)) {
	errors.push(`CHANGELOG.md missing section for ${pkg.version}`);
}
if (!changelog.includes(`STORE_PERSIST_VERSION\` is at **${storePersist}**`)) {
	errors.push(
		`CHANGELOG.md current schema section must document STORE_PERSIST_VERSION ${storePersist}`
	);
}

// ── Required docs ───────────────────────────────────────────────────────────
const requiredDocs = [
	'docs/README.md',
	'docs/product/V1_ALPHA_SCOPE.md',
	'docs/status/CURRENT_SYSTEM_STATUS.md',
	'docs/architecture/OUTPUT_MODES.md',
	'docs/architecture/LIVE_OUTPUT_SYNC_DESIGN.md',
	'docs/architecture/CLOUD_READINESS.md',
	'docs/architecture/BACKEND_OPTIONS.md',
	'docs/features/SPECTRUM_ENGINE.md',
	'docs/features/SPECTRUM_PIXEL_ART.md',
	'docs/guides/OBS_PRESENTATION_MODE.md',
	'docs/performance/PERFORMANCE_BASELINE.md'
];
for (const doc of requiredDocs) requireFile(doc);

// ── docs index links ────────────────────────────────────────────────────────
const docsReadme = existsSync(resolve(root, 'docs/README.md'))
	? read('docs/README.md')
	: '';
for (const doc of requiredDocs) {
	if (doc === 'docs/README.md') continue;
	const rel = doc.replace('docs/', '');
	if (docsReadme && !docsReadme.includes(rel)) {
		errors.push(`docs/README.md does not link to ${rel}`);
	}
}

// ── Stale store version in docs that claim to describe the CURRENT state ────
//
// This used to hardcode `8[0-5]`, so it only ever caught versions 80-85 and
// sailed straight past a status doc pinned at 96 while the code was on 106.
// Compare against the real constant instead, and cover every doc that states a
// version — including the tables in CURRENT_SYSTEM_STATUS.md, which are the
// ones a reader trusts to be current.
for (const path of [
	'docs/status/CURRENT_SYSTEM_STATUS.md',
	'docs/onboarding/README.md',
	'docs/onboarding/00-fundamentos.md',
	'docs/onboarding/01-estado-y-store.md'
]) {
	if (!existsSync(resolve(root, path))) continue;
	const text = read(path);
	// Matches `STORE_PERSIST_VERSION = 96`, `... | **96** |`, `... is at 96`
	// and the prose form `Store persist **v96**` used in doc headers.
	const patterns = [
		/STORE_PERSIST_VERSION`?\s*(?:=|\||is at)?\s*\|?\s*\*{0,2}(\d{2,4})\*{0,2}/g,
		/[Ss]tore persist\s*\*{0,2}v(\d{2,4})\*{0,2}/g
	];
	for (const match of patterns.flatMap(p => [...text.matchAll(p)])) {
		const documented = Number(match[1]);
		if (Number.isFinite(documented) && documented !== storePersist) {
			errors.push(
				`${path} documents stale STORE_PERSIST_VERSION ${documented} (code is at ${storePersist})`
			);
		}
	}
}

// ── i18n pixel keys ─────────────────────────────────────────────────────────
const en = read('src/lib/i18n/en.ts');
const es = read('src/lib/i18n/es.ts');
const i18nKeys = [
	'label_spectrum_pixelate',
	'label_spectrum_pixelate_scale',
	'spectrum_pixelate_hint',
	'spectrum_shape_pixel_label',
	'spectrum_shape_pixel_desc',
	'spectrum_pixel_shape_radial_hint'
];
for (const key of i18nKeys) {
	if (!en.includes(`${key}:`)) errors.push(`en.ts missing ${key}`);
	if (!es.includes(`${key}:`)) errors.push(`es.ts missing ${key}`);
}

// ── Archive pointers in active status docs ──────────────────────────────────
if (
	docsReadme.includes('PROGRESS_SPECTRUM_2026.md') &&
	!docsReadme.includes('archive/')
) {
	errors.push(
		'docs/README.md links active PROGRESS_SPECTRUM_2026 (should be archived)'
	);
}

if (errors.length > 0) {
	console.error('docs:check failed:\n');
	for (const err of errors) console.error(`  ✗ ${err}`);
	process.exit(1);
}

console.log(
	`docs:check OK — app ${pkg.version}, store persist v${storePersist}`
);
