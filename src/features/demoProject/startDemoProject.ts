import { loadImage, saveImage } from '@/lib/db/imageDb';
import { generatePoolThumbnail } from '@/lib/thumbnailUtils';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { createDemoAudioTrackFile } from '@/features/demoProject/demoAudioTrack';
import { createDemoBackgroundFiles } from '@/features/demoProject/demoBackgrounds';
import {
	DEMO_TRACK_INTRO_SECONDS,
	DEMO_TRACK_OUTRO_SECONDS
} from '@/features/demoProject/demoTrackScore';

/**
 * Builds the demo project: three painted backgrounds, a synthesised remix with
 * an intro and an ending, the generated montage over both of those, and the
 * handful of switches that turn the shipped look into something that moves.
 *
 * Before this, "Try the demo" painted one flat gradient and stopped — no audio,
 * no second image, and `audioReactive` still off, which is the state the factory
 * look leaves it in. The result was a still picture with every reactive control
 * in the editor connected to nothing, and the only way out was to go find the
 * switches by hand.
 */
export type DemoProjectResult = {
	imageCount: number;
	hasAudio: boolean;
};

export type StartDemoProjectOptions = {
	/**
	 * Adds a file to the playlist and starts it when nothing else is playing.
	 * Injected because it lives on the audio React context, which a feature
	 * module must not reach into.
	 */
	addAudioTrack: (file: File) => Promise<unknown>;
};

/** The asset id of the stored image, or null when it could not be read back. */
async function ingestImage(file: File, name: string): Promise<string | null> {
	const id = await saveImage(file);
	const url = await loadImage(id);
	if (!url) return null;
	const store = useWallpaperStore.getState();
	store.addImageEntry(id, url, null, name);
	void generatePoolThumbnail(url).then(thumbnail => {
		if (thumbnail && thumbnail !== url) {
			useWallpaperStore.getState().setImageThumbnailUrl(id, thumbnail);
		}
	});
	return id;
}

/**
 * The generated intro and ending, over the track's own build and resolve.
 *
 * Both are off in the factory look — they are a per-project decision, not a
 * look — so a first-run visitor never sees that the app can open and close a
 * video by itself unless the demo shows them.
 */
function applyDemoSequences(imageCount: number): void {
	const store = useWallpaperStore.getState();
	const shared = {
		enabled: true,
		imageSourceMode: 'catalog' as const,
		imageCount: Math.max(1, imageCount),
		titleText: 'VIBRIX',
		spectrumPrimaryEnabled: true
	};
	store.setIntroSequence('intro', {
		...shared,
		durationSec: DEMO_TRACK_INTRO_SECONDS,
		taglineText: 'DEMO REMIX'
	});
	store.setIntroSequence('outro', {
		...shared,
		durationSec: DEMO_TRACK_OUTRO_SECONDS,
		taglineText: 'MADE WITH VIBRIX'
	});
}

export async function startDemoProject(
	options: StartDemoProjectOptions
): Promise<DemoProjectResult> {
	const backgrounds = await createDemoBackgroundFiles();
	let imageCount = 0;
	let firstId: string | null = null;
	for (const entry of backgrounds) {
		const id = await ingestImage(entry.file, entry.name);
		if (!id) continue;
		imageCount += 1;
		firstId ??= id;
	}
	// The id handed to `addImageEntry` IS the pool entry's `assetId`, so the
	// first ingested image can be selected without reading the pool back.
	if (firstId) useWallpaperStore.getState().setActiveImageId(firstId);

	const store = useWallpaperStore.getState();
	// Without this nothing in the wallpaper responds to sound: the state default
	// is `false` and the factory look has no opinion about it, so every
	// audio-driven control a visitor finds would appear broken.
	store.setAudioReactive(true);
	// Particles are off in the shipped look; the demo exists to show what the
	// app does, and a particle field is half of that.
	store.setParticlesEnabled(true);
	if (imageCount > 1) {
		// 30 seconds is the standing default — right for a wallpaper, far too
		// slow to notice while someone is deciding whether to keep the app.
		store.setSlideshowEnabled(true);
		store.setSlideshowInterval(12);
	}
	if (imageCount > 0) applyDemoSequences(imageCount);

	let hasAudio = false;
	const track = await createDemoAudioTrackFile();
	if (track) {
		await options.addAudioTrack(track);
		hasAudio = true;
	}

	return { imageCount, hasAudio };
}
