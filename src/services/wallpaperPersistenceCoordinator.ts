import {
	applyWallpaperSettingsJson,
	buildWallpaperSettingsExport,
	createWallpaperSettingsJson,
	parseWallpaperSettingsJson
} from '@/services/projectSettings';
import {
	clearAllImages,
	getImageAssetInfo,
	loadImageBlob,
	saveImageAsset
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

export type BinaryProjectAssetRecord = {
	id: string;
	kind: ProjectAssetKind;
	path: string;
	mimeType: string;
	byteLength: number;
	originalName?: string;
};

export type BinaryProjectHeader = {
	containerVersion: 2;
	format: string;
	version: number;
	exportedAt: string;
	exportSelection: ProjectExportSelection;
	audioIncluded: boolean;
	settings: ReturnType<typeof buildWallpaperSettingsExport>;
	assets: BinaryProjectAssetRecord[];
};

export type ProjectPackageWritable = {
	write(data: Blob): Promise<void>;
};

const BINARY_PROJECT_MAGIC = 'VIBRIXPKG2\n';
const BINARY_PROJECT_MAGIC_BYTES = new TextEncoder().encode(
	BINARY_PROJECT_MAGIC
);
const BINARY_PROJECT_LENGTH_BYTES = 4;
const MAX_BINARY_PROJECT_HEADER_BYTES = 64 * 1024 * 1024;

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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes.buffer;
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
};

function buildRequestedProjectAssets(
	state: WallpaperState
): RequestedProjectAsset[] {
	const requested: RequestedProjectAsset[] = [];

	for (const image of state.backgroundImages) {
		requested.push({
			id: image.assetId,
			kind: 'background'
		});
	}
	for (const overlay of state.overlays) {
		requested.push({
			id: overlay.assetId,
			kind: 'overlay'
		});
	}
	if (state.globalBackgroundId) {
		requested.push({
			id: state.globalBackgroundId,
			kind: 'global-background'
		});
	}
	if (state.logoId) {
		requested.push({ id: state.logoId, kind: 'logo' });
	}
	if (state.audioFileAssetId) {
		requested.push({
			id: state.audioFileAssetId,
			kind: 'audio',
			originalName: state.audioFileName || undefined
		});
	}
	for (const track of state.audioTracks ?? []) {
		if (track.assetId) {
			requested.push({
				id: track.assetId,
				kind: 'audio',
				originalName: track.name || undefined
			});
		}
		if (track.coverAssetId) {
			requested.push({
				id: track.coverAssetId,
				kind: 'cover',
				originalName: `${track.name || 'track'} cover`
			});
		}
	}
	return requested;
}

async function buildBinaryProjectHeader(
	state: WallpaperState,
	selection: ProjectExportSelection,
	onProgress?: (progress: ProjectPackageProgress) => void
): Promise<BinaryProjectHeader> {
	const requested = dedupeAssets(buildRequestedProjectAssets(state));
	const assets: BinaryProjectAssetRecord[] = [];
	for (let index = 0; index < requested.length; index += 1) {
		const asset = requested[index];
		emitProjectProgress(onProgress, {
			phase: 'collecting-assets',
			current: index + 1,
			total: requested.length,
			percent:
				requested.length > 0
					? ((index + 1) / requested.length) * 0.15
					: 0.15,
			message: `Indexing assets ${index + 1}/${requested.length}`
		});
		const info = await getImageAssetInfo(asset.id);
		if (!info) continue;
		assets.push({
			id: asset.id,
			kind: asset.kind,
			path: buildProjectAssetPath(
				asset.kind,
				assets.length,
				asset.id,
				info.type,
				asset.originalName
			),
			mimeType: info.type,
			byteLength: info.bytes,
			originalName: asset.originalName
		});
		await yieldToUi();
	}

	return {
		containerVersion: 2,
		format: PROJECT_FORMAT,
		version: PROJECT_SCHEMA_VERSION,
		exportedAt: new Date().toISOString(),
		exportSelection: selection,
		audioIncluded: assets.some(asset => asset.kind === 'audio'),
		settings: buildWallpaperSettingsExport(state),
		assets
	};
}

export function createBinaryProjectHeaderBlob(
	header: BinaryProjectHeader
): Blob {
	const encodedHeader = new TextEncoder().encode(JSON.stringify(header));
	if (encodedHeader.byteLength > MAX_BINARY_PROJECT_HEADER_BYTES) {
		throw new Error('project-header-too-large');
	}
	const length = new Uint8Array(BINARY_PROJECT_LENGTH_BYTES);
	new DataView(length.buffer).setUint32(0, encodedHeader.byteLength, true);
	return new Blob([BINARY_PROJECT_MAGIC_BYTES, length, encodedHeader], {
		type: 'application/x-vibrix-project'
	});
}

/**
 * Writes the v2 binary container one asset at a time. There is no aggregate
 * heap copy, Base64 expansion, per-file ceiling or total-size ceiling: with a
 * file-system writer the practical limit is the destination disk.
 */
export async function writeWallpaperProjectPackage(
	writable: ProjectPackageWritable,
	options?: {
		onProgress?: (progress: ProjectPackageProgress) => void;
		selection?: ProjectExportSelection;
	}
): Promise<{ bytesWritten: number }> {
	const onProgress = options?.onProgress;
	const selection = options?.selection ?? DEFAULT_PROJECT_EXPORT_SELECTION;
	emitProjectProgress(onProgress, {
		phase: 'validating',
		current: 0,
		total: 1,
		percent: 0,
		message: 'Preparing binary project package'
	});
	const normalizedState = buildWallpaperSettingsExport().state;
	const exportState = filterWallpaperStateForProjectExport(
		normalizedState,
		selection
	);
	const header = await buildBinaryProjectHeader(
		exportState,
		selection,
		onProgress
	);
	const headerBlob = createBinaryProjectHeaderBlob(header);
	await writable.write(headerBlob);
	let bytesWritten = headerBlob.size;

	for (let index = 0; index < header.assets.length; index += 1) {
		const asset = header.assets[index];
		emitProjectProgress(onProgress, {
			phase: 'encoding-assets',
			current: index + 1,
			total: header.assets.length,
			percent:
				0.15 + 0.85 * ((index + 1) / Math.max(1, header.assets.length)),
			message: `Writing assets ${index + 1}/${header.assets.length}`
		});
		const blob = await loadImageBlob(asset.id);
		if (!blob || blob.size !== asset.byteLength) {
			throw new Error(`project-asset-changed-during-export:${asset.id}`);
		}
		await writable.write(blob);
		bytesWritten += blob.size;
		await yieldToUi();
	}

	emitProjectProgress(onProgress, {
		phase: 'done',
		current: 1,
		total: 1,
		percent: 1,
		message: 'Project package ready'
	});
	return { bytesWritten };
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

export async function createWallpaperProjectPackageBlob(options?: {
	onProgress?: (progress: ProjectPackageProgress) => void;
	selection?: ProjectExportSelection;
}): Promise<{ blob: Blob }> {
	const parts: Blob[] = [];
	await writeWallpaperProjectPackage(
		{
			write: async data => {
				parts.push(data);
			}
		},
		options
	);
	return { blob: new Blob(parts, { type: 'application/x-vibrix-project' }) };
}

function isProjectAssetKind(value: unknown): value is ProjectAssetKind {
	return (
		value === 'background' ||
		value === 'global-background' ||
		value === 'logo' ||
		value === 'overlay' ||
		value === 'cover' ||
		value === 'audio'
	);
}

export async function readBinaryProjectHeader(file: Blob): Promise<{
	header: BinaryProjectHeader;
	assetsOffset: number;
} | null> {
	if (file.size < BINARY_PROJECT_MAGIC_BYTES.byteLength + 4) return null;
	const magic = await file
		.slice(0, BINARY_PROJECT_MAGIC_BYTES.byteLength)
		.text();
	if (magic !== BINARY_PROJECT_MAGIC) return null;
	const lengthOffset = BINARY_PROJECT_MAGIC_BYTES.byteLength;
	const lengthBuffer = await file
		.slice(lengthOffset, lengthOffset + BINARY_PROJECT_LENGTH_BYTES)
		.arrayBuffer();
	const headerLength = new DataView(lengthBuffer).getUint32(0, true);
	if (
		headerLength <= 0 ||
		headerLength > MAX_BINARY_PROJECT_HEADER_BYTES ||
		lengthOffset + BINARY_PROJECT_LENGTH_BYTES + headerLength > file.size
	) {
		throw new Error('invalid-binary-project-header');
	}
	const assetsOffset =
		lengthOffset + BINARY_PROJECT_LENGTH_BYTES + headerLength;
	const parsed: unknown = JSON.parse(
		await file.slice(assetsOffset - headerLength, assetsOffset).text()
	);
	if (
		!isRecord(parsed) ||
		parsed.containerVersion !== 2 ||
		!isReadableProjectFormat(parsed.format) ||
		parsed.version !== PROJECT_SCHEMA_VERSION ||
		!Array.isArray(parsed.assets)
	) {
		throw new Error('invalid-binary-project-header');
	}
	const assets: BinaryProjectAssetRecord[] = [];
	for (const rawAsset of parsed.assets) {
		if (
			!isRecord(rawAsset) ||
			typeof rawAsset.id !== 'string' ||
			!isProjectAssetKind(rawAsset.kind) ||
			typeof rawAsset.path !== 'string' ||
			typeof rawAsset.mimeType !== 'string' ||
			typeof rawAsset.byteLength !== 'number' ||
			!Number.isSafeInteger(rawAsset.byteLength) ||
			rawAsset.byteLength < 0
		) {
			throw new Error('invalid-binary-project-asset');
		}
		assets.push({
			id: rawAsset.id,
			kind: rawAsset.kind,
			path: rawAsset.path,
			mimeType: rawAsset.mimeType,
			byteLength: rawAsset.byteLength,
			...(typeof rawAsset.originalName === 'string'
				? { originalName: rawAsset.originalName }
				: {})
		});
	}
	return {
		header: {
			containerVersion: 2,
			format: parsed.format as string,
			version: parsed.version as number,
			exportedAt:
				typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
			exportSelection: normalizeProjectExportSelection(
				parsed.exportSelection
			),
			audioIncluded: Boolean(parsed.audioIncluded),
			settings: parsed.settings as ReturnType<
				typeof buildWallpaperSettingsExport
			>,
			assets
		},
		assetsOffset
	};
}

async function applyImportedProjectSettings(
	parsedSettings: unknown,
	projectSelection: ProjectExportSelection
) {
	const settingsToApply = isFullProjectExportSelection(projectSelection)
		? parsedSettings
		: buildWallpaperSettingsExport(
				mergeWallpaperStateForProjectImport(
					useWallpaperStore.getState(),
					parseWallpaperSettingsJson(JSON.stringify(parsedSettings)),
					projectSelection
				)
			);
	return applyWallpaperSettingsJson(JSON.stringify(settingsToApply));
}

async function applyBinaryWallpaperProjectPackage(
	file: File,
	parsed: Awaited<ReturnType<typeof readBinaryProjectHeader>> & {},
	options?: {
		onProgress?: (progress: ProjectPackageProgress) => void;
		hardReset?: boolean;
	}
) {
	const onProgress = options?.onProgress;
	const { header } = parsed;
	if (
		options?.hardReset !== false &&
		isFullProjectExportSelection(header.exportSelection)
	) {
		emitProjectProgress(onProgress, {
			phase: 'clearing',
			current: 0,
			total: 1,
			percent: 0.05,
			message: 'Clearing current project'
		});
		await hardResetProjectState();
	}

	let offset = parsed.assetsOffset;
	let expectedAssets = 0;
	let importedAssets = 0;
	for (let index = 0; index < header.assets.length; index += 1) {
		const asset = header.assets[index];
		const end = offset + asset.byteLength;
		if (end > file.size) throw new Error('truncated-binary-project');
		const shouldImport =
			asset.kind === 'cover' ||
			shouldImportProjectAssetKind(header.exportSelection, asset.kind);
		if (shouldImport) {
			expectedAssets += 1;
			emitProjectProgress(onProgress, {
				phase: 'saving-assets',
				current: index + 1,
				total: header.assets.length,
				percent:
					0.1 +
					0.8 * ((index + 1) / Math.max(1, header.assets.length)),
				message: `Importing asset ${index + 1}/${header.assets.length}`
			});
			await saveImageAsset(
				asset.id,
				file.slice(offset, end, asset.mimeType),
				asset.mimeType
			);
			importedAssets += 1;
			await yieldToUi();
		}
		offset = end;
	}

	if (offset !== file.size) throw new Error('invalid-binary-project-size');
	emitProjectProgress(onProgress, {
		phase: 'applying-state',
		current: 1,
		total: 1,
		percent: 0.95,
		message: 'Applying project state'
	});
	const result = await applyImportedProjectSettings(
		header.settings,
		header.exportSelection
	);
	emitProjectProgress(onProgress, {
		phase: 'done',
		current: 1,
		total: 1,
		percent: 1,
		message: 'Project imported'
	});
	return { ...result, importedAssets, expectedAssets };
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
	const binaryHeader = await readBinaryProjectHeader(file);
	if (binaryHeader) {
		return applyBinaryWallpaperProjectPackage(file, binaryHeader, options);
	}

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

	const result = await applyImportedProjectSettings(
		parsedSettings,
		projectSelection
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
