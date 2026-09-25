import { useEffect, useRef } from 'react';
import { createAudioChannelSelectionState } from '@/lib/audio/audioChannels';
import { useAudioData } from '@/hooks/useAudioData';
import { createAudioEnvelope } from '@/utils/audioEnvelope';
import { useWallpaperStore } from '@/store/wallpaperStore';
import {
	getCanvasBlendMode,
	type ImageLayer
} from '@/features/background/imageLayerGeometry';
import {
	type ImageCanvasRuntimeRefs,
	renderImageCanvasFrame,
	syncCanvasViewport
} from './imageCanvasRuntime';
import { subscribeOutputRenderQuality } from '@/runtime/outputRenderQuality';
import { useImageCanvasSource } from './useImageCanvasSource';
import {
	transitionSubsystemsForLayerType,
	useVisualTransitionFade
} from '@/features/visualTransition/useVisualTransitionFade';

export default function ImageLayerCanvas({
	layer,
	renderBaseImage = true
}: {
	layer: ImageLayer;
	renderBaseImage?: boolean;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	// A look change repaints this canvas with no animation of its own (the
	// filter stack is baked into the draw), so the frozen-frame crossfade is
	// what keeps it from being a hard cut. An IMAGE change is excluded: the
	// slideshow transition engine already animates that one.
	const fadeRef = useVisualTransitionFade(
		transitionSubsystemsForLayerType(layer.type),
		{ skipOnImageChange: true }
	);
	const rafRef = useRef<number>(0);
	const layerRef = useRef(layer);
	const mouseRef = useRef({ x: 0, y: 0 });
	const smoothedMouseRef = useRef({ x: 0, y: 0 });
	const framePendingRef = useRef(false);
	const isLoopingRef = useRef(false);
	const wakeRenderRef = useRef<(() => void) | null>(null);
	const stateRef = useRef(useWallpaperStore.getState());
	const lastFrameTimeRef = useRef(0);
	const effectiveTimeRef = useRef(0);
	const backgroundEnvelopeRef = useRef(createAudioEnvelope());
	const rgbShiftEnvelopeRef = useRef(createAudioEnvelope());
	const imageChannelSelectionRef = useRef(
		createAudioChannelSelectionState('kick')
	);
	const transitionChannelSelectionRef = useRef(
		createAudioChannelSelectionState('instrumental')
	);
	const rgbShiftChannelSelectionRef = useRef(
		createAudioChannelSelectionState('hihat')
	);
	const {
		image,
		canRenderBackgroundFallback,
		imageRef,
		backgroundTransitionRefs
	} = useImageCanvasSource(layer, effectiveTimeRef);
	const { getAudioSnapshot } = useAudioData();

	useEffect(() => {
		layerRef.current = layer;
	}, [layer]);

	useEffect(() => {
		function handleMouseMove(event: MouseEvent) {
			mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
			mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
			wakeRenderRef.current?.();
		}

		window.addEventListener('mousemove', handleMouseMove);
		return () => window.removeEventListener('mousemove', handleMouseMove);
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || (!image && !canRenderBackgroundFallback)) return;
		const context = canvas.getContext('2d');
		if (context === null) return;
		const ctx = context;
		const loadedImage = imageRef.current ?? image;
		const runtimeRefs: ImageCanvasRuntimeRefs = {
			layerRef,
			mouseRef,
			smoothedMouseRef,
			...backgroundTransitionRefs,
			lastFrameTimeRef,
			effectiveTimeRef,
			backgroundEnvelopeRef,
			rgbShiftEnvelopeRef,
			imageChannelSelectionRef,
			transitionChannelSelectionRef,
			rgbShiftChannelSelectionRef
		};

		const requestRender = () => {
			if (isLoopingRef.current || framePendingRef.current) return;
			framePendingRef.current = true;
			rafRef.current = requestAnimationFrame(frame);
		};
		wakeRenderRef.current = requestRender;

		function resize() {
			const currentCanvas = canvasRef.current;
			if (!currentCanvas) return;
			syncCanvasViewport(currentCanvas);
			requestRender();
		}

		resize();
		const unsubQuality = subscribeOutputRenderQuality(resize);
		window.addEventListener('resize', resize);

		function frame(now: number) {
			framePendingRef.current = false;
			const currentCanvas = canvasRef.current;
			if (!currentCanvas) return;
			syncCanvasViewport(currentCanvas);
			const shouldKeepAnimating = renderImageCanvasFrame({
				now,
				canvas: currentCanvas,
				ctx,
				loadedImage,
				renderBaseImage,
				getAudioSnapshot,
				runtimeRefs,
				state: stateRef.current
			});
			isLoopingRef.current = shouldKeepAnimating;
			if (shouldKeepAnimating) {
				rafRef.current = requestAnimationFrame(frame);
			}
		}

		const unsubscribe = useWallpaperStore.subscribe(nextState => {
			stateRef.current = nextState;
			requestRender();
		});
		requestRender();
		return () => {
			cancelAnimationFrame(rafRef.current);
			framePendingRef.current = false;
			isLoopingRef.current = false;
			wakeRenderRef.current = null;
			unsubscribe();
			window.removeEventListener('resize', resize);
			unsubQuality();
		};
		// Both are stable containers — `imageRef` is a `useRef`, and
		// `backgroundTransitionRefs` is assigned once behind a null guard in
		// `useImageCanvasSource`. Listing them satisfies the rule honestly
		// without adding a single extra teardown of the render loop.
	}, [
		getAudioSnapshot,
		image,
		layer,
		renderBaseImage,
		canRenderBackgroundFallback,
		imageRef,
		backgroundTransitionRefs
	]);

	if (!layer.enabled || !layer.imageUrl) return null;

	return (
		<div
			ref={fadeRef}
			data-camera-motion-layer={
				layer.type === 'background-image'
					? 'background'
					: 'selected-overlay'
			}
			style={{
				position: 'fixed',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				zIndex: layer.zIndex,
				mixBlendMode: getCanvasBlendMode(layer)
			}}
		>
			<canvas
				ref={canvasRef}
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					pointerEvents: 'none'
				}}
			/>
		</div>
	);
}
