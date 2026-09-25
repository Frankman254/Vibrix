/**
 * Spectrum 1 and Spectrum 2 share one canvas, so one CSS transform (live) or one
 * canvas transform (export) moved both or neither — the camera could not tell
 * them apart. The fix is to draw them on two roots, but only when it buys
 * something: an extra full-screen canvas per frame is exactly the cost the
 * spectrum perf audit warned about.
 *
 * So the split is demand-driven: it happens only while a Camera FX target names
 * `spectrum-2`. Pure, and the single source of truth for both the live viewport
 * and the offline export, so the two can never disagree about who draws what.
 */
import {
	findMotionLayerForTarget,
	type MotionLayerTargetSource
} from '@/features/stageFx/motionLayers';
import type { WallpaperState } from '@/types/wallpaper';

/** Which spectrums a canvas is responsible for. */
export type SpectrumDrawPartition =
	/** The main spectrum and every extra instance — the unsplit default. */
	| 'all'
	/** Only the flat `spectrum*` keys (Spectrum 1). */
	| 'main'
	/** Only `spectrumInstances` (Spectrum 2 and any further instance). */
	| 'instances';

export type SpectrumCameraSplitSource = MotionLayerTargetSource &
	Pick<
		WallpaperState,
		| 'cameraMotionEnabled'
		| 'cameraShakeEnabled'
		| 'cameraShakeTargets'
		| 'spectrumInstances'
	>;

/**
 * True when the camera actually distinguishes the two spectrums: a live motion
 * layer or Screen Shake names `spectrum-2`, and there is a second spectrum to
 * move. Everything else keeps the single-canvas path.
 */
export function spectrumCameraSplitActive(
	state: SpectrumCameraSplitSource
): boolean {
	if (state.spectrumInstances.length === 0) return false;
	if (
		state.cameraMotionEnabled &&
		findMotionLayerForTarget(state, 'spectrum-2') !== null
	) {
		return true;
	}
	return (
		state.cameraShakeEnabled &&
		state.cameraShakeTargets.includes('spectrum-2')
	);
}

/** Constant arrays: the live viewport keys canvases off these, so a new array
 *  every render would be needless churn. */
const SINGLE_CANVAS: readonly SpectrumDrawPartition[] = ['all'];
const SPLIT_CANVASES: readonly SpectrumDrawPartition[] = ['main', 'instances'];

/** The partitions to draw, in paint order. One canvas each. */
export function resolveSpectrumPartitions(
	state: SpectrumCameraSplitSource
): readonly SpectrumDrawPartition[] {
	return spectrumCameraSplitActive(state) ? SPLIT_CANVASES : SINGLE_CANVAS;
}

/** The `data-camera-motion-layer` / Camera FX target a partition answers to. */
export function cameraTargetForSpectrumPartition(
	partition: SpectrumDrawPartition
): 'spectrum' | 'spectrum-2' {
	return partition === 'instances' ? 'spectrum-2' : 'spectrum';
}

/** Does this partition draw the main (flat-key) spectrum? */
export function partitionDrawsMainSpectrum(
	partition: SpectrumDrawPartition
): boolean {
	return partition !== 'instances';
}

/** Does this partition draw the extra instances? */
export function partitionDrawsSpectrumInstances(
	partition: SpectrumDrawPartition
): boolean {
	return partition !== 'main';
}
