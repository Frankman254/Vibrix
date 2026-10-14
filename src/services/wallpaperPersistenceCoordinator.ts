import {
	applyWallpaperSettingsJson,
	buildWallpaperSettingsExport,
	createWallpaperSettingsJson,
	parseWallpaperSettingsJson
} from '@/services/projectSettings';
import {
	clearAllImages,
	getImageAssetByteLength,
	loadImageAsset,
	saveImageAsset,
	type StoredImageAsset
} from '@/lib/db/imageDb';
import {
	DEFAULT_PROJECT_EXPORT_SELECTION,
	filterWallpaperStateForProjectExport,
	isFullProjectExportSelection,
	mergeWallpaperStateForProjectImport,
	normalizeProjectExportSelection,
	shouldImportProjectAssetKind,
	type ProjectExportSelection
} from '@/features/export';
import { cloneFactoryDefaultState } from '@/store/factoryDefaults';
import { useWallpaperStore } from '@/store/wallpaperStore';
import {
	LEGACY_PROJECT_FORMATS,
	PROJECT_FORMAT,
	PROJECT_SCHEMA_VERSION
} from '@/lib/version';
import type { WallpaperState } from '@/types/wallpaper';

type ProjectAssetKind =
	| 'background'
	| 'global-background'
	| 'logo'
	| 'overlay'
	| 'cover'
	| 'audio';

type ProjectAssetRecord = {
	id: string;
	kind: ProjectAssetKind;
	path: string;
	mimeType: string;
	base64: string;
	originalName?: string;
};

export type ProjectPackageProgress = {
	phase:
		| 'idle'
		| 'reading'
		| 'validating'
		| 'collecting-assets'
		| 'encoding-assets'
		| 'clearing'
		| 'saving-assets'
		| 'applying-state'
		| 'done';
	current: number;
	total: number;
	percent: number;
	message: string;
};

type CollectedProjectAsset = StoredImageAsset & {
	kind: ProjectAssetKind;
	originalName: string | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function emitProjectProgress(
	onProgress: ((progress: ProjectPackageProgress) => void) | undefined,
	progress: ProjectPackageProgress
) {
	onProgress?.(progress);
}

function yieldToUi(): Promise<void> {
	return new Promise(resolve => {
		window.setTimeout(resolve, 0);
	});
}

function cloneDefaultState(): WallpaperState {
	return cloneFactoryDefaultState();
}

async function hardResetProjectState() {
	await clearAllImages();
	useWallpaperStore.setState({
		...cloneDefaultState(),
		composeScore: null,
		composeBaseState: null,
		composeEnabled: false
	});
	await yieldToUi();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = '';

	for (let index = 0; index < bytes.length; index += chunkSize) {
		const chunk = bytes.subarray(index, index + chunkSize);
		binary += String.fromCharCode(...chunk);
	}

	return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes.buffer;
}

// Hard limits for the legacy base64-in-JSON package format.
// - Per asset: base64 of a single file >~400MB exceeds V8's max string length
//   (~512MB chars) and cannot be encoded at all. 350MB is a safe ceiling.
// - Total: large projects exhaust the tab heap while holding the binary +
//   base64 + JSON copies at once. 4GB is generous (a ~1.5GB project has worked
//   in practice); past it we first drop audios without lyrics, then refuse.
// The binary container format would lift both limits entirely.
const MAX_BASE64_ASSET_BYTES = 350 * 1024 * 1024;
const MAX_PROJECT_ASSET_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
	return `${(bytes / 1024).toFixed(0)} KB`;
}

function dedupeAssets<T extends { id: string }>(assets: T[]) {
	const seen = new Set<string>();
	return assets.filter(asset => {
		if (seen.has(asset.id)) return false;
		seen.add(asset.id);
		return true;
	});
}

function sanitizeProjectNameSegment(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '') || 'asset'
	);
}

function extensionFromMimeType(mimeType: string): string {
	if (mimeType === 'audio/mpeg') return 'mp3';
	if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return 'wav';
	if (mimeType === 'audio/ogg') return 'ogg';
	if (mimeType === 'audio/mp4') return 'm4a';
	if (mimeType === 'image/jpeg') return 'jpg';
	if (mimeType === 'image/png') return 'png';
	if (mimeType === 'image/webp') return 'webp';
	if (mimeType === 'image/gif') return 'gif';
	const subtype = mimeType.split('/')[1];
	return sanitizeProjectNameSegment(subtype || 'bin');
}

function buildProjectAssetPath(
	kind: ProjectAssetKind,
	index: number,
	assetId: string,
	mimeType: string,
	originalName?: string
) {
	const extension = extensionFromMimeType(mimeType);
	const safeOriginal = originalName
		? sanitizeProjectNameSegment(originalName.replace(/\.[a-z0-9]+$/i, ''))
		: '';
	const shortId = sanitizeProjectNameSegment(assetId).slice(-8);
	const fileName = `${String(index + 1).padStart(3, '0')}-${shortId}${safeOriginal ? `-${safeOriginal}` : ''}.${extension}`;

	switch (kind) {
		case 'background':
			return `backgrounds/${fileName}`;
		case 'global-background':
			return `global-background/${fileName}`;
		case 'logo':
			return `logo/${fileName}`;
		case 'overlay':
			return `overlays/${fileName}`;
		case 'cover':
			return `covers/${fileName}`;
		case 'audio':
			return `audio/${fileName}`;
	}
}

async function* readLinesRaw(
	file: File,
	onProgress?: (p: number) => void
): AsyncGenerator<string> {
	const stream = file.stream();
	const reader = stream.getReader();
	let chunks: Uint8Array[] = [];
	let chunksTotalLength = 0;
	let readBytes = 0;
	const decoder = new TextDecoder();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			readBytes += value.byteLength;
			if (onProgress && file.size > 0) {
				onProgress(readBytes / file.size);
			}

			let offset = 0;
			while (offset < value.byteLength) {
				const newlineIndex = value.indexOf(10, offset); // 10 is '\n'
				if (newlineIndex !== -1) {
					const slice = value.subarray(offset, newlineIndex);
					if (chunks.length === 0) {
						yield decoder.decode(slice);
					} else {
						chunks.push(slice);
						chunksTotalLength += slice.byteLength;
						const merged = new Uint8Array(chunksTotalLength);
						let pos = 0;
						for (const c of chunks) {
							merged.set(c, pos);
							pos += c.byteLength;
						}
						yield decoder.decode(merged);
						chunks = [];
						chunksTotalLength = 0;
					}
					offset = newlineIndex + 1;
				} else {
					const remaining = value.subarray(offset);
					chunks.push(remaining);
					chunksTotalLength += remaining.byteLength;
					break;
				}
			}
		}
		if (chunks.length > 0) {
			const merged = new Uint8Array(chunksTotalLength);
			let pos = 0;
			for (const c of chunks) {
				merged.set(c, pos);
				pos += c.byteLength;
			}
			yield decoder.decode(merged);
		}
	} finally {
		reader.releaseLock();
	}
}

type RequestedProjectAsset = {
	id: string;
	kind: ProjectAssetKind;
	originalName?: string;
	/** Audio without lyrics — sacrificial when the package is too large. */
	droppable: boolean;
};

type MeasuredProjectAsset = { asset: RequestedProjectAsset; bytes: number };

function audioAssetHasLyrics(state: WallpaperState, assetId: string): boolean {
	const entry = state.audioLyricsByTrackAssetId?.[assetId];
	if (!entry) return false;
	return (
		(entry.rawText?.trim().length ?? 0) > 0 || Boolean(entry.lyrixaBundle)
	);
}

function buildRequestedProjectAssets(
	state: WallpaperState
): RequestedProjectAsset[] {
	const requested: RequestedProjectAsset[] = [];

	for (const image of state.backgroundImages) {
		requested.push({
			id: image.assetId,
			kind: 'background',
			droppable: false
		});
	}
	for (const overlay of state.overlays) {
		requested.push({
			id: overlay.assetId,
			kind: 'overlay',
			droppable: false
		});
	}
	if (state.globalBackgroundId) {
		requested.push({
			id: state.globalBackgroundId,
			kind: 'global-background',
			droppable: false
		});
	}
	if (state.logoId) {
		requested.push({ id: state.logoId, kind: 'logo', droppable: false });
	}
	if (state.audioFileAssetId) {
		requested.push({
			id: state.audioFileAssetId,
			kind: 'audio',
			originalName: state.audioFileName || undefined,
			droppable: !audioAssetHasLyrics(state, state.audioFileAssetId)
		});
	}
	for (const track of state.audioTracks ?? []) {
		if (track.assetId) {
			requested.push({
				id: track.assetId,
				kind: 'audio',
				originalName: track.name || undefined,
				droppable: !audioAssetHasLyrics(state, track.assetId)
			});
		}
		if (track.coverAssetId) {
			requested.push({
				id: track.coverAssetId,
				kind: 'cover',
				originalName: `${track.name || 'track'} cover`,
				droppable: false
			});
		}
	}
	return requested;
}

// Read sizes without copying any buffer, so budgeting never loads multi-GB
// data into the heap (an OOM during load/encode is uncatchable; this lets us
// surface a recoverable error or drop assets instead).
async function measureRequestedAssets(
	requested: RequestedProjectAsset[]
): Promise<MeasuredProjectAsset[]> {
	const measured: MeasuredProjectAsset[] = [];
	const seen = new Set<string>();
	for (const asset of requested) {
		if (seen.has(asset.id)) continue;
		seen.add(asset.id);
		const bytes = await getImageAssetByteLength(asset.id);
		if (bytes == null) continue;
		measured.push({ asset, bytes });
		await yieldToUi();
	}
	return measured;
}

function sumMeasuredBytes(measured: MeasuredProjectAsset[]): number {
	let total = 0;
	for (const item of measured) total += item.bytes;
	return total;
}

function assertAssetsFitPackageLimits(measured: MeasuredProjectAsset[]): void {
	for (const { asset, bytes } of measured) {
		if (bytes > MAX_BASE64_ASSET_BYTES) {
			const label = asset.originalName ?? `${asset.kind} asset`;
			throw new Error(
				`asset-too-large: "${label}" is ${formatBytes(bytes)}, over the ${formatBytes(MAX_BASE64_ASSET_BYTES)} per-file limit of the current package format. Split that file or remove it, then export again.`
			);
		}
	}
}

// Strip audio tracks (and the legacy single audio file) that have no lyrics —
// the graceful fallback when the full project exceeds the package limits.
function dropNonLyricAudio(state: WallpaperState): {
	state: WallpaperState;
	dropped: number;
} {
	let dropped = 0;
	const keptTracks = (state.audioTracks ?? []).filter(track => {
		const keep =
			!track.assetId || audioAssetHasLyrics(state, track.assetId);
		if (!keep) dropped += 1;
		return keep;
	});
	let audioFileAssetId = state.audioFileAssetId;
	let audioFileName = state.audioFileName;
	if (audioFileAssetId && !audioAssetHasLyrics(state, audioFileAssetId)) {
		audioFileAssetId = null;
		audioFileName = '';
		dropped += 1;
	}
	if (dropped === 0) return { state, dropped: 0 };
	return {
		state: {
			...state,
			audioTracks: keptTracks,
			audioFileAssetId,
			audioFileName
		},
		dropped
	};
}

async function collectProjectAssets(
	state: WallpaperState,
	onProgress?: (progress: ProjectPackageProgress) => void
): Promise<ProjectAssetRecord[]> {
	const requestedAssets = buildRequestedProjectAssets(state);

	const loadedAssets: CollectedProjectAsset[] = [];
	for (let index = 0; index < requestedAssets.length; index += 1) {
		const asset = requestedAssets[index];
		emitProjectProgress(onProgress, {
			phase: 'collecting-assets',
			current: index + 1,
			total: requestedAssets.length,
			percent:
				requestedAssets.length > 0
					? (index + 1) / requestedAssets.length
					: 1,
			message: `Collecting assets ${index + 1}/${requestedAssets.length}`
		});
		const stored = await loadImageAsset(asset.id);
		if (stored) {
			loadedAssets.push({
				...stored,
				kind: asset.kind,
				originalName: asset.originalName
			});
		}
		await yieldToUi();
	}

	const storedAssets = dedupeAssets(loadedAssets);
	const resolved: ProjectAssetRecord[] = [];
	for (let index = 0; index < storedAssets.length; index += 1) {
		const asset = storedAssets[index];
		emitProjectProgress(onProgress, {
			phase: 'encoding-assets',
			current: index + 1,
			total: storedAssets.length,
			percent:
				storedAssets.length > 0 ? (index + 1) / storedAssets.length : 1,
			message: `Encoding assets ${index + 1}/${storedAssets.length}`
		});
		resolved.push({
			id: asset.id,
			kind: asset.kind,
			path: buildProjectAssetPath(
				asset.kind,
				index,
				asset.id,
				asset.type,
				asset.originalName
			),
			mimeType: asset.type,
			base64: arrayBufferToBase64(asset.data),
			originalName: asset.originalName
		});
		await yieldToUi();
	}

	return resolved;
}

export async function createWallpaperProjectPackageJson(options?: {
	onProgress?: (progress: ProjectPackageProgress) => void;
	selection?: ProjectExportSelection;
}): Promise<string> {
	const { blob } = await createWallpaperProjectPackageBlob(options);
	return await blob.text();
}

/** Projects exported before the Vibrix rename carry the old tag. Reads accept
 *  it forever; writes only ever emit `PROJECT_FORMAT`. */
const READABLE_PROJECT_FORMATS: readonly string[] = [
	PROJECT_FORMAT,
	...LEGACY_PROJECT_FORMATS
];

function isReadableProjectFormat(format: unknown): boolean {
	return (
		typeof format === 'string' && READABLE_PROJECT_FORMATS.includes(format)
	);
}

function createProjectEnvelopeBlobParts(
	settings: ReturnType<typeof buildWallpaperSettingsExport>,
	assets: ProjectAssetRecord[],
	selection: ProjectExportSelection
) {
	const exportedAt = new Date().toISOString();
	const header =
		'{\n' +
		`  "format": ${JSON.stringify(PROJECT_FORMAT)},\n` +
		`  "version": ${PROJECT_SCHEMA_VERSION},\n` +
		`  "exportedAt": ${JSON.stringify(exportedAt)},\n` +
		`  "exportSelection": ${JSON.stringify(selection)},\n` +
		`  "audioIncluded": ${JSON.stringify(
			assets.some(asset => asset.kind === 'audio')
		)},\n` +
		'  "settings": ';
	const footer = '\n}';
	const parts: BlobPart[] = [header, JSON.stringify(settings, null, 2)];

	if (assets.length === 0) {
		parts.push(',\n  "assets": []', footer);
		return parts;
	}

	parts.push(',\n  "assets": [\n');
	for (let index = 0; index < assets.length; index += 1) {
		parts.push('    ');
		parts.push(JSON.stringify(assets[index]));
		parts.push(index < assets.length - 1 ? ',\n' : '\n');
	}
	parts.push('  ]', footer);
	return parts;
}

export async function createWallpaperProjectPackageBlob(options?: {
	onProgress?: (progress: ProjectPackageProgress) => void;
	selection?: ProjectExportSelection;
}): Promise<{ blob: Blob; droppedAudioWithoutLyrics: number }> {
	const onProgress = options?.onProgress;
	const selection = options?.selection ?? DEFAULT_PROJECT_EXPORT_SELECTION;
	emitProjectProgress(onProgress, {
		phase: 'validating',
		current: 0,
		total: 1,
		percent: 0,
		message: 'Preparing project package'
	});
	const normalizedState = buildWallpaperSettingsExport().state;
	const filteredState = filterWallpaperStateForProjectExport(
		normalizedState,
		selection
	);

	// Budget against the legacy base64-in-JSON limits using copy-free size
	// reads. If the full selection doesn't fit, drop audios without lyrics and
	// retry; only refuse if even that (or a single oversized essential file)
	// can't fit.
	let exportState = filteredState;
	let droppedAudioWithoutLyrics = 0;
	const measured = await measureRequestedAssets(
		buildRequestedProjectAssets(exportState)
	);
	const fitsFull =
		sumMeasuredBytes(measured) <= MAX_PROJECT_ASSET_TOTAL_BYTES &&
		measured.every(item => item.bytes <= MAX_BASE64_ASSET_BYTES);
	if (!fitsFull) {
		const reduced = dropNonLyricAudio(exportState);
		droppedAudioWithoutLyrics = reduced.dropped;
		exportState = reduced.state;
		const reducedMeasured = await measureRequestedAssets(
			buildRequestedProjectAssets(exportState)
		);
		// Images, logo and lyric'd audios are never dropped — if any single one
		// still exceeds the per-file limit, fail with a clear message.
		assertAssetsFitPackageLimits(reducedMeasured);
		const reducedTotal = sumMeasuredBytes(reducedMeasured);
		if (reducedTotal > MAX_PROJECT_ASSET_TOTAL_BYTES) {
			throw new Error(
				`project-too-large: even with only the audios that have lyrics, the package is ${formatBytes(reducedTotal)} (limit ${formatBytes(MAX_PROJECT_ASSET_TOTAL_BYTES)}). Deselect some backgrounds, or export part of the project separately.`
			);
		}
	}

	const settings = buildWallpaperSettingsExport(exportState);
	const assets = await collectProjectAssets(exportState, onProgress);
	emitProjectProgress(onProgress, {
		phase: 'done',
		current: 1,
		total: 1,
		percent: 1,
		message: 'Project package ready'
	});

	return {
		blob: new Blob(
			createProjectEnvelopeBlobParts(settings, assets, selection),
			{ type: 'application/x-live-wallpaper-project+json' }
		),
		droppedAudioWithoutLyrics
	};
}

export async function applyWallpaperProjectPackage(
	file: File,
	options?: {
		onProgress?: (progress: ProjectPackageProgress) => void;
		hardReset?: boolean;
	}
): Promise<{
	missingAssets: boolean;
	importedAssets: number;
	expectedAssets: number;
}> {
	const onProgress = options?.onProgress;
	emitProjectProgress(onProgress, {
		phase: 'reading',
		current: 0,
		total: file.size,
		percent: 0,
		message: 'Validating project package'
	});

	let envelopeContent = '';
	let parsedSettings: unknown = null;
	let projectSelection: ProjectExportSelection | null = null;
	let expectedAssets = 0;
	let importedAssets = 0;
	let inAssetsStr = false;
	let didClearProject = false;

	for await (const line of readLinesRaw(file, p => {
		if (!inAssetsStr) {
			emitProjectProgress(onProgress, {
				phase: 'reading',
				current: p * file.size,
				total: file.size,
				percent: p * 0.2,
				message: `Reading package ${Math.round(p * 100)}%`
			});
		}
	})) {
		if (!inAssetsStr) {
			envelopeContent += line + '\n';
			if (line.includes('"assets": [')) {
				inAssetsStr = true;
				try {
					const safeEnvelope = envelopeContent.replace(
						/,\s*"assets"\s*:\s*\[.*\n?/g,
						'}'
					);
					const parsed = JSON.parse(safeEnvelope);
					if (
						!isRecord(parsed) ||
						!isReadableProjectFormat(parsed.format) ||
						parsed.version !== PROJECT_SCHEMA_VERSION
					) {
						throw new Error('invalid-project-envelope');
					}
					parsedSettings = parsed.settings;
					projectSelection = normalizeProjectExportSelection(
						parsed.exportSelection
					);
					const shouldHardReset =
						options?.hardReset !== false &&
						isFullProjectExportSelection(projectSelection);
					if (shouldHardReset && !didClearProject) {
						emitProjectProgress(onProgress, {
							phase: 'clearing',
							current: 0,
							total: 1,
							percent: 0.2,
							message: 'Clearing current project'
						});
						await hardResetProjectState();
						didClearProject = true;
					}
				} catch (e) {
					console.error('[vibrix] parse error', e);
					throw new Error('invalid-project-file');
				}
			}
		} else {
			const trimmed = line.trim();
			if (
				trimmed === ']' ||
				trimmed === ']}' ||
				trimmed.startsWith('],')
			) {
				break;
			}
			if (trimmed.startsWith('{')) {
				let assetJson = trimmed;
				if (assetJson.endsWith(',')) assetJson = assetJson.slice(0, -1);
				try {
					const asset = JSON.parse(assetJson);
					const assetKind =
						isRecord(asset) && typeof asset.kind === 'string'
							? asset.kind
							: null;
					const shouldImportAsset =
						!projectSelection ||
						(assetKind === 'background' ||
						assetKind === 'global-background' ||
						assetKind === 'logo' ||
						assetKind === 'overlay' ||
						assetKind === 'audio'
							? shouldImportProjectAssetKind(
									projectSelection,
									assetKind
								)
							: true);
					if (
						shouldImportAsset &&
						isRecord(asset) &&
						typeof asset.id === 'string' &&
						typeof asset.base64 === 'string'
					) {
						expectedAssets += 1;
						emitProjectProgress(onProgress, {
							phase: 'saving-assets',
							current: expectedAssets,
							total: expectedAssets,
							percent:
								0.2 +
								(0.8 * importedAssets) /
									Math.max(
										importedAssets + 1,
										expectedAssets
									),
							message: `Importing asset #${expectedAssets}`
						});
						await saveImageAsset(
							asset.id,
							base64ToArrayBuffer(asset.base64),
							typeof asset.mimeType === 'string'
								? asset.mimeType
								: 'application/octet-stream'
						);
						importedAssets += 1;
						await yieldToUi();
					}
				} catch (e) {
					console.error('[vibrix] Failed to parse asset line', e);
				}
			}
		}
	}

	if (!parsedSettings) {
		throw new Error('invalid-project-missing-settings');
	}

	projectSelection ??= DEFAULT_PROJECT_EXPORT_SELECTION;

	emitProjectProgress(onProgress, {
		phase: 'applying-state',
		current: 1,
		total: 1,
		percent: 1,
		message: 'Applying project state'
	});

	const settingsToApply = isFullProjectExportSelection(projectSelection)
		? parsedSettings
		: buildWallpaperSettingsExport(
				mergeWallpaperStateForProjectImport(
					useWallpaperStore.getState(),
					parseWallpaperSettingsJson(JSON.stringify(parsedSettings)),
					projectSelection
				)
			);
	const result = await applyWallpaperSettingsJson(
		JSON.stringify(settingsToApply)
	);

	emitProjectProgress(onProgress, {
		phase: 'done',
		current: 1,
		total: 1,
		percent: 1,
		message: 'Project imported'
	});

	return {
		...result,
		importedAssets,
		expectedAssets
	};
}

export function createWallpaperSettingsBlob(): Blob {
	return new Blob([createWallpaperSettingsJson()], {
		type: 'application/json'
	});
}
