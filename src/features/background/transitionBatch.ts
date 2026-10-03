import type {
	BackgroundImageItem,
	Setlist,
	SlideshowTransitionType,
	TransitionPresetSettings
} from '@/types/wallpaper';
import { TRANSITION_TYPES } from './transitionCatalog';

export type TransitionBatchExtras = Partial<
	Pick<
		TransitionPresetSettings,
		| 'transitionIntensity'
		| 'transitionAudioDrive'
		| 'transitionAudioChannel'
	>
>;
export type TransitionBatchPlan = {
	assignments: Array<{ assetId: string; type: SlideshowTransitionType }>;
	extras: TransitionBatchExtras;
};

/** A missing setlist is an empty scope, never an accidental whole-library edit. */
export function transitionBatchImages(
	images: BackgroundImageItem[],
	setlists: Setlist[],
	scope: string | null
) {
	if (scope === null) return images;
	const ids = setlists.find(s => s.id === scope)?.imageAssetIds ?? [];
	const byId = new Map(images.map(image => [image.assetId, image]));
	return [...new Set(ids)].flatMap(id =>
		byId.has(id) ? [byId.get(id)!] : []
	);
}

/** Color the neighbour graph, including the loop and skipped disabled images.
 * Least-used colors balance the selection; randomness only breaks ties.
 * No assignments are returned if the selected palette cannot cover the graph.
 */
export function planTransitionBatch(
	images: BackgroundImageItem[],
	selected: readonly SlideshowTransitionType[],
	extras: TransitionBatchExtras = {},
	random = Math.random
): TransitionBatchPlan | null {
	const types = [...new Set(selected)].filter(type =>
		(TRANSITION_TYPES as readonly string[]).includes(type)
	);
	if (!images.length || !types.length) return null;
	const edges = new Map(
		images.map(image => [image.assetId, new Set<string>()])
	);
	const connect = (ordered: BackgroundImageItem[]) => {
		if (ordered.length < 2) return;
		ordered.forEach((image, i) => {
			const next = ordered[(i + 1) % ordered.length].assetId;
			edges.get(image.assetId)!.add(next);
			edges.get(next)!.add(image.assetId);
		});
	};
	connect(images);
	connect(
		images.filter(image => image.enabled !== false && Boolean(image.url))
	);
	const assigned = new Map<string, SlideshowTransitionType>();
	const counts = new Map(types.map(type => [type, 0]));
	while (assigned.size < images.length) {
		const remaining = images.filter(image => !assigned.has(image.assetId));
		const saturation = (id: string) =>
			new Set(
				[...edges.get(id)!].map(n => assigned.get(n)).filter(Boolean)
			).size;
		remaining.sort(
			(a, b) =>
				saturation(b.assetId) - saturation(a.assetId) ||
				edges.get(b.assetId)!.size - edges.get(a.assetId)!.size
		);
		const id = remaining[0].assetId;
		const forbidden = new Set(
			[...edges.get(id)!].map(n => assigned.get(n))
		);
		const choices = types
			.filter(type => !forbidden.has(type))
			.map(type => ({ type, rank: random() }));
		choices.sort(
			(a, b) =>
				counts.get(a.type)! - counts.get(b.type)! || a.rank - b.rank
		);
		if (!choices.length) return null;
		const type = choices[0].type;
		assigned.set(id, type);
		counts.set(type, counts.get(type)! + 1);
	}
	return {
		assignments: images.map(image => ({
			assetId: image.assetId,
			type: assigned.get(image.assetId)!
		})),
		extras
	};
}

/** Whitelist writes: image duration, transition duration and timestamps never enter. */
export function applyTransitionBatchPlan(
	images: BackgroundImageItem[],
	plan: TransitionBatchPlan
) {
	const types = new Map(plan.assignments.map(a => [a.assetId, a.type]));
	return images.map(image => {
		const type = types.get(image.assetId);
		if (!type) return image;
		const next = {
			...image,
			transitionType: type,
			transitionPresetId: null
		};
		if (plan.extras.transitionIntensity !== undefined)
			next.transitionIntensity = plan.extras.transitionIntensity;
		if (plan.extras.transitionAudioDrive !== undefined)
			next.transitionAudioDrive = plan.extras.transitionAudioDrive;
		if (plan.extras.transitionAudioChannel !== undefined)
			next.transitionAudioChannel = plan.extras.transitionAudioChannel;
		return next;
	});
}
