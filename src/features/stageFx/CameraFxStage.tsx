import { useEffect, useRef, type ReactNode } from 'react';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioData } from '@/hooks/useAudioData';
import {
	updateCameraFxDiag,
	type CameraMotionLayer
} from '@/features/stageFx/stageFxConfig';
import {
	cameraTrailFilter,
	createCameraFxRuntime,
	resolveCameraLayerOffset,
	stepCameraFx
} from '@/features/stageFx/cameraFxDraw';
import {
	clearCameraDrawOffsets,
	publishCameraDrawOffset
} from '@/features/stageFx/cameraDrawOffset';

/**
 * Whether this root paints its camera translation itself.
 *
 * A canvas that carries `data-camera-motion-draw` translates its drawing
 * context instead of its element (see `cameraDrawOffset`), so its own bitmap
 * border never enters the frame and the figure is never cut. Its element still
 * takes the zoom, which only ever grows the layer and so exposes nothing.
 */
function drawsItsOwnMotion(target: HTMLElement): boolean {
	return target.dataset.cameraMotionDraw !== undefined;
}

function clearMotionTargets(targets: HTMLElement[]) {
	clearCameraDrawOffsets();
	for (const target of targets) {
		target.style.transform = '';
		target.style.transformOrigin = '';
		target.style.willChange = '';
		target.style.filter = '';
	}
}

/**
 * The motion and shake math lives in `cameraFxDraw`, shared with the video
 * export. Screen Shake is applied to the complete visual stage. Camera Motion is
 * applied to marked visual roots so it can target BG, spectrum, or both while
 * preserving the original z-index ordering. HUD/editor elements remain fixed.
 */
export default function CameraFxStage({ children }: { children: ReactNode }) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const motionTargetsRef = useRef<HTMLElement[]>([]);
	const rafRef = useRef<number>(0);
	const lastTimeRef = useRef<number>(0);
	const runtimeRef = useRef(createCameraFxRuntime());
	const cameraMotionEnabled = useWallpaperStore(s => s.cameraMotionEnabled);
	const cameraShakeEnabled = useWallpaperStore(s => s.cameraShakeEnabled);
	const animatedTargetsRef = useRef(new Set<HTMLElement>());
	const { getAudioSnapshot } = useAudioData();

	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const animatedTargets = animatedTargetsRef.current;

		const refreshMotionTargets = () => {
			motionTargetsRef.current = Array.from(
				wrapper.querySelectorAll<HTMLElement>(
					'[data-camera-motion-layer]'
				)
			);
		};
		refreshMotionTargets();
		const observer = new MutationObserver(refreshMotionTargets);
		observer.observe(wrapper, { childList: true, subtree: true });

		updateCameraFxDiag(cameraMotionEnabled, cameraShakeEnabled);
		const cameraActive = cameraMotionEnabled || cameraShakeEnabled;
		if (!cameraActive) {
			wrapper.style.transform = '';
			wrapper.style.willChange = '';
			clearMotionTargets(motionTargetsRef.current);
			return () => observer.disconnect();
		}

		function frame(time: number) {
			const el = wrapperRef.current;
			if (!el) return;
			const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
			lastTimeRef.current = time;

			const state = useWallpaperStore.getState();
			const cameraFrame = stepCameraFx(
				runtimeRef.current,
				state,
				getAudioSnapshot,
				time,
				dt,
				{ width: window.innerWidth, height: window.innerHeight }
			);

			for (const target of motionTargetsRef.current) {
				const layer = target.dataset.cameraMotionLayer as
					| CameraMotionLayer
					| undefined;
				const offset =
					layer === undefined
						? null
						: resolveCameraLayerOffset(cameraFrame, state, layer);
				const wasAnimated = animatedTargetsRef.current.has(target);

				if (!offset) {
					// Only clear styles on the frame this target stops being animated.
					if (wasAnimated) {
						if (layer) publishCameraDrawOffset(layer, null);
						target.style.transform = '';
						target.style.transformOrigin = '';
						target.style.willChange = '';
						target.style.filter = '';
						animatedTargetsRef.current.delete(target);
					}
					continue;
				}

				const { tx, ty, scale } = offset;
				const viaDraw =
					layer !== undefined && drawsItsOwnMotion(target);
				if (viaDraw) {
					// The canvas moves what it paints, not itself, so its border
					// stays outside the frame at the figure's own size. The
					// element's zoom still scales whatever the canvas paints, so
					// the offset is divided out of it: the figure lands on the
					// same pixel it would have with an element translation, and
					// with the same math the export uses.
					const unzoom = scale > 0 ? 1 / scale : 1;
					publishCameraDrawOffset(layer, {
						tx: tx * unzoom,
						ty: ty * unzoom
					});
					target.style.transform =
						scale === 1 ? '' : `scale(${scale.toFixed(4)})`;
				} else {
					target.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
				}
				// The halo is a stack of drop-shadows behind the layer: a blurred
				// copy of its own silhouette, offset where it came from. Writing
				// '' when there is none keeps the cheap path cheap — a layer with
				// the trail dial at zero never pays for a filter.
				const filter = cameraTrailFilter(offset.trail);
				const nextFilter = filter ?? '';
				if (target.style.filter !== nextFilter) {
					target.style.filter = nextFilter;
				}
				if (!wasAnimated) {
					// Set these compositor hints once when the target first becomes
					// active — no need to re-assign the same string every frame.
					target.style.transformOrigin = 'center center';
					target.style.willChange = 'transform';
				}
				animatedTargetsRef.current.add(target);
			}
			el.style.transform = '';
			el.style.willChange = '';
			rafRef.current = requestAnimationFrame(frame);
		}

		lastTimeRef.current = performance.now();
		rafRef.current = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(rafRef.current);
			observer.disconnect();
			wrapper.style.transform = '';
			wrapper.style.willChange = '';
			clearMotionTargets(motionTargetsRef.current);
			animatedTargets.clear();
		};
	}, [cameraMotionEnabled, cameraShakeEnabled, getAudioSnapshot]);

	return (
		<div
			ref={wrapperRef}
			style={{
				position: 'fixed',
				inset: 0,
				transformOrigin: 'center center'
			}}
		>
			{children}
		</div>
	);
}
