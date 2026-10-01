export type StepOption<T> = {
	value: T;
	disabled?: boolean;
};

/**
 * The option an arrow lands on, or `undefined` when there is none that way.
 *
 * Skips `disabled` entries — stepping onto one would either do nothing or apply
 * a choice the list itself refuses — and **does not wrap**: at an end the arrow
 * goes dead instead of jumping across the whole bank, which with 120 saved slots
 * is never what the hand expects. A `value` that is not in `options` (a slot
 * deleted under the picker) has no neighbours, so both arrows go dead rather
 * than silently teleporting to one end.
 */
export function stepOption<T extends string | number>(
	options: ReadonlyArray<StepOption<T>>,
	value: T | null,
	dir: -1 | 1
): StepOption<T> | undefined {
	const index = options.findIndex(o => o.value === value);
	if (index < 0) return undefined;
	for (let i = index + dir; i >= 0 && i < options.length; i += dir) {
		const option = options[i];
		if (option && option.disabled !== true) return option;
	}
	return undefined;
}
