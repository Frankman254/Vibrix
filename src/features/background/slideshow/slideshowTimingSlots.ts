import type { BackgroundImageItem } from '@/types/wallpaper';

/**
 * Manual times belong to ordered positions, not to image identities. The
 * persisted value still lives on an image record for backwards compatibility,
 * but this module is the only place that interprets those records as slots.
 */
export function projectEnabledImagesOntoTimingSlots(
	orderedScope: BackgroundImageItem[]
): BackgroundImageItem[] {
	const enabled = orderedScope.filter(image => image.enabled !== false);
	return enabled.map((image, index) => {
		const slotTime = orderedScope[index]?.playbackSwitchAt ?? null;
		return image.playbackSwitchAt === slotTime
			? image
			: { ...image, playbackSwitchAt: slotTime };
	});
}

/** Keep the timing slots at their indexes while changing their occupants. */
export function preserveTimingSlotsAfterReorder(
	previous: BackgroundImageItem[],
	reordered: BackgroundImageItem[]
): BackgroundImageItem[] {
	const slots = previous.map(image => image.playbackSwitchAt ?? null);
	return reordered.map((image, index) => {
		const playbackSwitchAt = slots[index] ?? null;
		return image.playbackSwitchAt === playbackSwitchAt
			? image
			: { ...image, playbackSwitchAt };
	});
}

/**
 * Converts the old image-owned representation into ascending positional slots.
 * Null slots stay null, so automatic boundaries remain automatic.
 */
export function normalizeLegacyTimingSlots(
	images: BackgroundImageItem[]
): BackgroundImageItem[] {
	const sortedMarks = images
		.map(image => image.playbackSwitchAt)
		.filter((mark): mark is number => Number.isFinite(mark))
		.sort((a, b) => a - b);
	let markIndex = 0;
	return images.map(image => {
		if (!Number.isFinite(image.playbackSwitchAt)) return image;
		const playbackSwitchAt = sortedMarks[markIndex++] ?? null;
		return image.playbackSwitchAt === playbackSwitchAt
			? image
			: { ...image, playbackSwitchAt };
	});
}

/**
 * Resolve every positional boundary and keep the result in pool order. Mixed
 * automatic/manual slots are sorted as boundaries, never as image identities.
 */
export function resolveTimingSlotMarks(
	pool: BackgroundImageItem[],
	duration: number
): number[] {
	if (pool.length === 0) return [];
	const effectiveDuration = Math.max(0.1, duration);
	const boundaries = pool.slice(1).map((image, offset) => {
		const index = offset + 1;
		return image.playbackSwitchAt != null
			? Math.max(0, Math.min(effectiveDuration, image.playbackSwitchAt))
			: (effectiveDuration / pool.length) * index;
	});
	boundaries.sort((a, b) => a - b);
	return [0, ...boundaries];
}
