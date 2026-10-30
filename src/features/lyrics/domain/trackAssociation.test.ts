import { describe, expect, it } from 'vitest';
import type { AudioPlaylistTrack } from '@/types/wallpaper';
import type { AudioLyricsTrackEntry } from './types';
import {
	compareLyricsTrackDuration,
	resolveAudioLyricsBinding
} from './trackAssociation';

const track: AudioPlaylistTrack = {
	id: 'new-track',
	assetId: 'new-asset',
	name: 'Artist - Song.mp3',
	mimeType: 'audio/mpeg',
	volume: 1,
	loop: false,
	enabled: true,
	fileKey: 'Artist - Song.mp3::123::456',
	durationMs: 180_000
};

const entry: AudioLyricsTrackEntry = {
	mode: 'lrc',
	rawText: '',
	targetTrack: {
		name: track.name,
		fileKey: track.fileKey,
		durationMs: track.durationMs
	}
};

describe('lyrics track association', () => {
	it('reconnects lyrics after the same audio is imported under a new asset id', () => {
		expect(
			resolveAudioLyricsBinding(
				{
					audioTracks: [track],
					audioLyricsByTrackAssetId: { 'old-asset': entry }
				},
				'new-asset'
			)
		).toEqual({ assetId: 'old-asset', entry });
	});

	it('warns only when track and lyrics durations differ materially', () => {
		const bundle = {
			sourceTrack: { fileName: 'song.mp3', durationMs: 170_000 },
			project: { clips: [] }
		};
		expect(compareLyricsTrackDuration(180_000, bundle as never)).toEqual({
			trackDurationMs: 180_000,
			lyricsDurationMs: 170_000,
			differenceMs: 10_000
		});
		expect(compareLyricsTrackDuration(171_500, bundle as never)).toBeNull();
	});
});
