import type { LyrixaLyricsBundleEnvelope } from './lyrixaBundleTypes';
import type { LyrixaLayerOverrideMap } from './types';
import { describeLyrixaLayers } from './lyricsLayerSelection';

/** Normalized centers of the lyric lanes actually carrying text this frame. */
export function resolveLyricsLaneCenters(
	bundle: LyrixaLyricsBundleEnvelope,
	time: number,
	overrides: LyrixaLayerOverrideMap = {}
): Map<string, number> {
	const priority: Record<string, number> = {
		primary: 0,
		romanization: 1,
		transliteration: 1,
		translation: 2
	};
	const active = new Set(
		bundle.project.clips
			.filter(clip => {
				const layer = bundle.project.layers.find(
					item => item.id === clip.layerId
				);
				return (
					layer &&
					(overrides[layer.id]?.visible ?? layer.visible !== false) &&
					!clip.muted &&
					clip.text.trim().length > 0 &&
					time >= clip.startTime &&
					time <= clip.endTime &&
					(!layer.renderSettings?.suppressClipText ||
						clip.forceTextRender)
				);
			})
			.map(clip => clip.layerId)
	);
	const lanes = describeLyrixaLayers(bundle)
		.filter(
			layer => active.has(layer.id) && priority[layer.role] !== undefined
		)
		.sort(
			(a, b) => priority[a.role]! - priority[b.role]! || a.order - b.order
		);
	return new Map(
		lanes.map((lane, index) => [lane.id, (index + 0.5) / lanes.length])
	);
}
