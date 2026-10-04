import type {
	AuthoringManifestOptions,
	AuthoringManifestSource
} from '@/features/scenes/authoringManifest';
import {
	buildAuthoringPackage,
	type VibrixAuthoringPackage
} from '@/features/scenes/authoringPackage';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = '';
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(
			...bytes.subarray(index, index + chunkSize)
		);
	}
	return btoa(binary);
}

async function transportablePreview(
	url: string | null,
	fetchImpl: typeof fetch
): Promise<string | null> {
	if (!url) return null;
	if (url.startsWith('data:image/')) return url;
	try {
		const response = await fetchImpl(url);
		if (!response.ok) return null;
		const blob = await response.blob();
		if (!blob.type.startsWith('image/')) return null;
		return `data:${blob.type};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`;
	} catch {
		return null;
	}
}

export async function createAuthoringPackageBlob(
	state: AuthoringManifestSource,
	options: AuthoringManifestOptions,
	fetchImpl: typeof fetch = fetch
): Promise<{ blob: Blob; authoringPackage: VibrixAuthoringPackage }> {
	const backgroundImages = await Promise.all(
		(state.backgroundImages ?? []).map(async image => ({
			...image,
			thumbnailUrl: await transportablePreview(
				image.thumbnailUrl,
				fetchImpl
			)
		}))
	);
	const authoringPackage = buildAuthoringPackage(
		{ ...state, backgroundImages },
		options
	);
	return {
		authoringPackage,
		blob: new Blob([JSON.stringify(authoringPackage, null, '\t')], {
			type: 'application/x-vibrix-authoring+json'
		})
	};
}
