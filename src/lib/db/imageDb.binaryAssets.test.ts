import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearAllImages,
	getImageAssetInfo,
	loadImageAsset,
	loadImageBlob,
	saveImageAsset
} from './imageDb';

describe('binary asset storage', () => {
	beforeEach(async () => {
		await clearAllImages();
	});

	it('keeps Blob assets as streamable blobs and decodes them on demand', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5]);
		await saveImageAsset(
			'blob-audio',
			new Blob([bytes], { type: 'audio/mpeg' }),
			'audio/mpeg'
		);

		expect(await getImageAssetInfo('blob-audio')).toEqual({
			bytes: 5,
			type: 'audio/mpeg'
		});
		expect(
			Array.from(
				new Uint8Array(
					await (await loadImageBlob('blob-audio'))!.arrayBuffer()
				)
			)
		).toEqual([1, 2, 3, 4, 5]);
		expect(
			Array.from(
				new Uint8Array((await loadImageAsset('blob-audio'))!.data)
			)
		).toEqual([1, 2, 3, 4, 5]);
	});
});
