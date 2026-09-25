import { useEffect, useRef } from 'react';
import { useWallpaperStore } from '@/store/wallpaperStore';
import {
	transitionSubsystemsForLayerType,
	visualTransitionProgress
} from '@/features/visualTransition/visualTransitionCoordinator';
import {
	applyCrossfade,
	freezeLayerFrame,
	releaseFrozenFrame,
	type FrozenLayerFrame
} from '@/features/visualTransition/freezeLayerFrame';
import {
	crossfadeOpacities,
	shouldStartCrossfade,
	type CrossfadeGateOptions
} from '@/features/visualTransition/visualTransitionCrossfade';
import type { VisualTransitionSubsystem } from '@/types/wallpaper';

export { transitionSubsystemsForLayerType };

/**
 * Crossfades a layer wrapper while a `visualTransition` that touches this
 * subsystem is active, so the new look dissolves into the old one instead of
 * snapping when the active image (and its bound spectrum, particles, rain,
 * logo, …) changes.
 *
 * Implementation notes:
 *  - The store patch lands BEFORE any of this runs, so fading the layer in from
 *    0 (FASE 0) faded in the *new* look against nothing: the old spectrum
 *    vanished on frame one and the new one grew back. So at the instant the
 *    transition is published — synchronously, while the canvas still holds the
 *    outgoing frame — we copy that frame into an overlay canvas and fade the two
 *    against each other (`freezeLayerFrame`).
 *  - If the freeze is not possible (no canvas yet, or an absurd resolution) we
 *    fall back to the old plain fade on the wrapper, which is still better than
 *    a hard cut.
 *  - Drives `style.opacity` imperatively from a single rAF — no React re-render
 *    per frame. `opacity` is never part of either React style object, so React
 *    leaves the imperative values alone across re-renders.
 *  - The loop only runs while a relevant transition is live; between transitions
 *    nothing is scheduled and opacity is left at its natural value.
 *  - Reduced-motion and a disabled transition both report `durationMs <= 0`, so
 *    the loop never starts (no fade) and `performanceMode` already scales the
 *    duration upstream in `createVisualTransitionSnapshot`.
 */
export function useVisualTransitionFade(
	subsystems: readonly VisualTransitionSubsystem[],
	options?: CrossfadeGateOptions
) {
	const ref = useRef<HTMLDivElement>(null);
	// The callers build the list per render, so an array would be a new
	// dependency every time; the joined key is stable for the same layer.
	const subsystemKey = subsystems.join('|');
	const skipOnImageChange = options?.skipOnImageChange === true;

	useEffect(() => {
		const watched = (
			subsystemKey ? subsystemKey.split('|') : []
		) as VisualTransitionSubsystem[];
		if (watched.length === 0) return undefined;
		let raf = 0;
		let safety = 0;
		let activeId: string | null = null;
		let frame: FrozenLayerFrame | null = null;

		const clearSafety = () => {
			if (safety) window.clearTimeout(safety);
			safety = 0;
		};

		const finish = () => {
			const el = ref.current;
			if (el) el.style.opacity = '';
			releaseFrozenFrame(frame);
			frame = null;
			activeId = null;
			clearSafety();
		};

		const paint = (progress: number) => {
			if (frame) {
				applyCrossfade(frame, progress);
				return;
			}
			const el = ref.current;
			// No frozen frame: fade the whole wrapper in, the FASE 0 behaviour.
			if (el)
				el.style.opacity = String(
					crossfadeOpacities(progress).incoming
				);
		};

		const tick = () => {
			raf = 0;
			const el = ref.current;
			const transition = useWallpaperStore.getState().visualTransition;
			if (!el || !transition || transition.id !== activeId) {
				finish();
				return;
			}
			// `startedAtMs` is wall-clock (`Date.now()`); progress MUST use the
			// same clock. `performance.now()` is a different epoch and would clamp
			// progress to 0 forever, freezing the layer at opacity 0 (invisible).
			const progress = visualTransitionProgress(transition, Date.now());
			if (progress >= 1) {
				finish();
				return;
			}
			paint(progress);
			raf = requestAnimationFrame(tick);
		};

		const maybeStart = () => {
			const transition = useWallpaperStore.getState().visualTransition;
			if (!transition || transition.id === activeId) return;
			if (
				!shouldStartCrossfade(transition, watched, {
					skipOnImageChange
				})
			) {
				return;
			}
			// A transition arriving mid-transition: drop the previous frozen
			// frame (it is two looks old) and freeze what is on screen now.
			releaseFrozenFrame(frame);
			frame = null;
			activeId = transition.id;
			// Synchronous on purpose: this runs inside the store notification,
			// so the canvas still holds the outgoing frame.
			frame = freezeLayerFrame(ref.current);
			paint(0);
			if (raf) cancelAnimationFrame(raf);
			raf = requestAnimationFrame(tick);
			// rAF stops in a window that is hidden, occluded or minimised, and
			// the fade starts with the live layer at opacity 0 under the frozen
			// frame. Without this net the layer would stay that way until the
			// window paints again. Timers are throttled there too, but they do
			// fire, and by this point the fade is over by wall clock anyway.
			clearSafety();
			safety = window.setTimeout(() => {
				safety = 0;
				finish();
			}, transition.durationMs + 250);
		};

		// Catch a transition that is already live when this layer mounts, then
		// react to every later transition the store publishes.
		maybeStart();
		const unsubscribe = useWallpaperStore.subscribe(() => maybeStart());

		return () => {
			if (raf) cancelAnimationFrame(raf);
			unsubscribe();
			finish();
		};
	}, [subsystemKey, skipOnImageChange]);

	return ref;
}
