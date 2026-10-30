import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_EXPORT_SELECTION } from '@/features/export/projectExportSelection';
import {
	clearAllImages,
	loadImageBlob,
	saveImageAsset
} from '@/lib/db/imageDb';
import { PROJECT_FORMAT, PROJECT_SCHEMA_VERSION } from '@/lib/version';
import { DEFAULT_STATE } from '@/store/defaultState';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { buildWallpaperSettingsExport } from './projectSettings';
import {
	applyWallpaperProjectPackage,
	createWallpaperProjectPackageBlob,
	createBinaryProjectHeaderBlob,
	readBinaryProjectHeader,
	type BinaryProjectHeader
} from './wallpaperPersistenceCoordinator';

const originalWindow = globalThis.window;

beforeAll(() => {
	(globalThis as { window: Pick<Window, 'setTimeout'> }).window = {
		setTimeout: globalThis.setTimeout.bind(globalThis)
	};
});

afterAll(async () => {
	useWallpaperStore.setState(DEFAULT_STATE);
	await clearAllImages();
	if (originalWindow) globalThis.window = originalWindow;
	else delete (globalThis as { window?: Window }).window;
});

function header(byteLength = 16): BinaryProjectHeader {
	return {
		containerVersion: 2,
		format: PROJECT_FORMAT,
		version: PROJECT_SCHEMA_VERSION,
		exportedAt: '2026-10-29T00:00:00.000Z',
		exportSelection: DEFAULT_PROJECT_EXPORT_SELECTION,
		audioIncluded: true,
		settings: buildWallpaperSettingsExport(DEFAULT_STATE),
		assets: [
			{
				id: 'audio-1',
				kind: 'audio',
				path: 'audio/song.mp3',
				mimeType: 'audio/mpeg',
				byteLength
			}
		]
	};
}

describe('binary Vibrix project container', () => {
	it('round-trips its manifest without Base64', async () => {
		const source = header();
		const blob = createBinaryProjectHeaderBlob(source);
		const parsed = await readBinaryProjectHeader(blob);

		expect(parsed?.header.assets).toEqual(source.assets);
		expect(await blob.text()).not.toContain('"base64"');
	});

	it('represents assets larger than the old 4 GB total ceiling', async () => {
		const fiveGiB = 5 * 1024 * 1024 * 1024;
		const blob = createBinaryProjectHeaderBlob(header(fiveGiB));
		const parsed = await readBinaryProjectHeader(blob);

		expect(parsed?.header.assets[0]?.byteLength).toBe(fiveGiB);
		// Only metadata lives in the header; the real bytes are streamed after it.
		expect(blob.size).toBeLessThan(2 * 1024 * 1024);
	});

	it('leaves legacy JSON packages to the backwards-compatible reader', async () => {
		expect(
			await readBinaryProjectHeader(
				new Blob(['{"format":"live-wallpaper-project"}'])
			)
		).toBeNull();
	});

	it('exports and imports raw asset bytes end to end', async () => {
		await clearAllImages();
		const sourceBytes = new Uint8Array([9, 8, 7, 6, 5, 4]);
		await saveImageAsset(
			'audio-binary',
			new Blob([sourceBytes], { type: 'audio/mpeg' }),
			'audio/mpeg'
		);
		useWallpaperStore.setState({
			...DEFAULT_STATE,
			audioSourceMode: 'file',
			audioFileAssetId: 'audio-binary',
			audioFileName: 'song.mp3'
		});

		const { blob } = await createWallpaperProjectPackageBlob();
		await clearAllImages();
		useWallpaperStore.setState({
			...DEFAULT_STATE,
			audioFileAssetId: null,
			audioFileName: ''
		});
		const result = await applyWallpaperProjectPackage(
			new File([blob], 'round-trip.vibrix', { type: blob.type })
		);

		expect(result).toMatchObject({ importedAssets: 1, expectedAssets: 1 });
		expect(useWallpaperStore.getState().audioFileAssetId).toBe(
			'audio-binary'
		);
		expect(
			Array.from(
				new Uint8Array(
					await (await loadImageBlob('audio-binary'))!.arrayBuffer()
				)
			)
		).toEqual(Array.from(sourceBytes));
	});
});
