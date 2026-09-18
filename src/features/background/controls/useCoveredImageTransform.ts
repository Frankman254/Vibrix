import { useCallback, useEffect, useRef } from 'react';
import type { useBackgroundPositionRanges } from './useBackgroundPositionRanges';
import type { BackgroundStore } from './useBackgroundStore';

type BackgroundPositionRanges = ReturnType<typeof useBackgroundPositionRanges>;

type CoveredStore = Pick<
	BackgroundStore,
	| 'imageFitMode'
	| 'imageFramingManualEnabled'
	| 'imageMirrorFill'
	| 'imagePositionX'
	| 'imagePositionY'
	| 'imageScale'
	| 'setImageFitMode'
	| 'setImageMirrorFill'
	| 'setImagePositionX'
	| 'setImagePositionY'
	| 'setImageScale'
	| 'setActiveImageFramingEdited'
>;

function clampToRange(value: number, range: { min: number; max: number }) {
	return Math.min(range.max, Math.max(range.min, value));
}

/**
 * Coverage is the default: the draw side clamps to the covered composition
 * (`resolveImageTransform` keepCovered=true), so every UI edit goes through
 * the same clamp. Persisting a transform the renderer would immediately
 * overwrite would desync editor state from pixels.
 *
 * Manual framing (`imageFramingManualEnabled`) turns the whole thing off:
 * the renderer skips the clamp too, so the sliders write what the user typed
 * and nothing snaps back.
 */
export function useCoveredImageTransform(
	store: CoveredStore,
	activeImagePositionRanges: BackgroundPositionRanges
) {
	const manual = store.imageFramingManualEnabled;

	function handleChangeScale(value: number) {
		store.setActiveImageFramingEdited(true);
		store.setImageScale(
			!manual && activeImagePositionRanges.ready
				? Math.max(value, activeImagePositionRanges.minScale)
				: value
		);
	}

	function handleChangePositionX(value: number) {
		store.setActiveImageFramingEdited(true);
		store.setImagePositionX(
			!manual && activeImagePositionRanges.ready
				? clampToRange(value, {
						min: activeImagePositionRanges.coverageBounds.minX,
						max: activeImagePositionRanges.coverageBounds.maxX
					})
				: value
		);
	}

	function handleChangePositionY(value: number) {
		store.setActiveImageFramingEdited(true);
		store.setImagePositionY(
			!manual && activeImagePositionRanges.ready
				? clampToRange(value, {
						min: activeImagePositionRanges.coverageBounds.minY,
						max: activeImagePositionRanges.coverageBounds.maxY
					})
				: value
		);
	}

	const normalizeCoveredTransform = useCallback(() => {
		if (store.imageFramingManualEnabled) return;
		if (!activeImagePositionRanges.ready) return;
		const { minScale, coverageBounds } = activeImagePositionRanges;
		const nextScale = Math.max(store.imageScale, minScale);
		const nextPositionX = clampToRange(store.imagePositionX, {
			min: coverageBounds.minX,
			max: coverageBounds.maxX
		});
		const nextPositionY = clampToRange(store.imagePositionY, {
			min: coverageBounds.minY,
			max: coverageBounds.maxY
		});

		if (nextScale !== store.imageScale) store.setImageScale(nextScale);
		if (nextPositionX !== store.imagePositionX) {
			store.setImagePositionX(nextPositionX);
		}
		if (nextPositionY !== store.imagePositionY) {
			store.setImagePositionY(nextPositionY);
		}
	}, [activeImagePositionRanges, store]);

	// Mirror Fill / Fit Mode changes shift minScale: RAISE scale to the
	// recomputed minimum once per transition (AutoZoom invariant: never lower
	// a deliberate zoom-in).
	const pendingCoverageSnap = useRef(false);
	function handleToggleMirrorFill(enabled: boolean) {
		store.setImageMirrorFill(enabled);
		if (enabled && !manual) {
			pendingCoverageSnap.current = true;
		}
	}
	function handleChangeFitMode(value: CoveredStore['imageFitMode']) {
		store.setActiveImageFramingEdited(true);
		store.setImageFitMode(value);
		if (!manual) pendingCoverageSnap.current = true;
	}
	useEffect(() => {
		if (!pendingCoverageSnap.current) return;
		if (!activeImagePositionRanges.ready) return;
		store.setImageScale(
			Math.max(store.imageScale, activeImagePositionRanges.minScale)
		);
		pendingCoverageSnap.current = false;
		// Only react to ranges changes; don't re-snap on every store
		// change (scale included).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeImagePositionRanges.ready, activeImagePositionRanges.minScale]);

	useEffect(() => {
		normalizeCoveredTransform();
	}, [normalizeCoveredTransform]);

	return {
		handleChangeFitMode,
		handleChangePositionX,
		handleChangePositionY,
		handleChangeScale,
		handleToggleMirrorFill
	};
}
