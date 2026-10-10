import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import type { Group } from 'three';
import type { SceneLayer } from '@/types/layers';
import { renderSceneLayer } from '@/components/wallpaper/layers/sceneLayerRegistry';
import ParallaxController from '@/components/wallpaper/ParallaxController';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useRuntimeUiModeStore } from '@/runtime/runtimeUiModeStore';
import { useOutputPerformanceStore } from '@/runtime/outputPerformanceStore';
import {
	resolveOutputMinFrameMs,
	resolveSceneLayerMaxDpr
} from '@/runtime/outputRenderQuality';
import {
	transitionSubsystemsForLayerType,
	useVisualTransitionFade
} from '@/features/visualTransition/useVisualTransitionFade';

/**
 * Caps the R3F render rate. The Canvas runs in `frameloop="demand"` and this
 * pump drives `invalidate()` at the performance-mode cadence (30/45/60), so on
 * a high-refresh display (120Hz) the particle/rain GPU draw — and the heavy
 * additive glow overdraw — happens ~half as often with no visible difference.
 */
function FrameRateLimiter({
	minFrameMs,
	active
}: {
	minFrameMs: number;
	active: boolean;
}) {
	const invalidate = useThree(s => s.invalidate);
	useEffect(() => {
		// Layer switched off: draw ONE more frame so the scene — now empty —
		// clears what it had on screen, then stop scheduling entirely. The
		// context survives for the next time the layer comes back; the work
		// does not.
		if (!active) {
			invalidate();
			return undefined;
		}
		let rafId = 0;
		let last = 0;
		const tick = (now: number) => {
			if (now - last >= minFrameMs) {
				last = now;
				invalidate();
			}
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}, [invalidate, minFrameMs, active]);
	return null;
}

export default function SceneLayerCanvas({ layer }: { layer: SceneLayer }) {
	const groupRef = useRef<Group>(null);
	const fadeRef = useVisualTransitionFade(
		transitionSubsystemsForLayerType(layer.type)
	);
	const outputMode = useRuntimeUiModeStore(s => s.mode);
	const recordingRenderScale = useOutputPerformanceStore(
		s => s.recordingRenderScale
	);
	const recordingTargetFps = useOutputPerformanceStore(
		s => s.recordingTargetFps
	);
	const {
		performanceMode,
		particleFilterBrightness,
		particleFilterContrast,
		particleFilterSaturation,
		particleFilterBlur,
		particleFilterHueRotate
	} = useWallpaperStore(
		useShallow(s => ({
			performanceMode: s.performanceMode,
			particleFilterBrightness: s.particleFilterBrightness,
			particleFilterContrast: s.particleFilterContrast,
			particleFilterSaturation: s.particleFilterSaturation,
			particleFilterBlur: s.particleFilterBlur,
			particleFilterHueRotate: s.particleFilterHueRotate
		}))
	);

	// Mount on first use, then never give the context back. Unmounting a
	// <Canvas> destroys its WebGLRenderer, and R3F's teardown calls
	// `forceContextLoss()` half a second later — which is the
	// `THREE.WebGLRenderer: Context Lost.` that filled the console. A
	// scene-driven slideshow toggles `particlesEnabled` / `rainEnabled` per
	// image, so every switch was throwing away a renderer and building a new
	// one: fresh context, shaders recompiled, particle buffers re-uploaded.
	// A layer the user has never turned on still costs nothing.
	const usedOnce = useRef(layer.enabled);
	if (layer.enabled) usedOnce.current = true;
	if (!layer.enabled && !usedOnce.current) return null;

	const particleFilterActive =
		layer.type === 'particle-background' ||
		layer.type === 'particle-foreground';
	// Every GL scene layer moves what it DRAWS, never itself: rain offsets its
	// plane inside the scene (`RainLayer`) and the particle fields offset their
	// points. Only the image background still takes an element translation.
	const drawsOwnCameraMotion = particleFilterActive || layer.type === 'rain';
	// Lives on the <Canvas> INSIDE the motion root, never on the root itself.
	// Camera FX owns `style.filter` on every `[data-camera-motion-layer]`
	// element — it writes the movement trail there each frame and clears it to
	// '' when there is no trail or when the camera is switched off — so a
	// filter set here by React was wiped and never restored (React only
	// rewrites the style prop when one of these five values changes). The
	// particle filter was therefore dead in the editor for anybody with Camera
	// Motion or Screen Shake on, while the offline export read the same keys
	// straight from the state and applied them: a blur nobody could see in the
	// preview turned up in the video. Every other camera layer already keeps
	// its own filter on an inner element (`OverlayImageLayerView`); this is the
	// same rule.
	const canvasFilter =
		particleFilterActive && layer.enabled
			? `brightness(${particleFilterBrightness}) contrast(${particleFilterContrast}) saturate(${particleFilterSaturation}) blur(${particleFilterBlur}px) hue-rotate(${particleFilterHueRotate}deg)`
			: 'none';
	const maxDpr = resolveSceneLayerMaxDpr(
		performanceMode,
		particleFilterActive
	);
	const canvasDpr: [number, number] = [1, maxDpr];
	const minFrameMs = resolveOutputMinFrameMs(performanceMode);
	const canvasKey = `${outputMode}-${recordingRenderScale}-${recordingTargetFps}-${maxDpr.toFixed(2)}`;

	return (
		<div
			ref={fadeRef}
			data-camera-motion-layer={
				layer.type === 'particle-background'
					? 'particles'
					: layer.type === 'particle-foreground'
						? 'particles'
						: layer.type === 'rain'
							? 'rain'
							: 'background'
			}
			// Sliding the element is what put a straight empty edge in the
			// frame: the canvas is the size of the screen, so translating it
			// uncovers the screen underneath. The field is generated past the
			// frame instead (`resolveParticleFieldBounds`, `resolveRainMeshTiles`)
			// and offset inside the scene, so there is nothing to uncover — the
			// same trade the spectrum canvases already make.
			{...(drawsOwnCameraMotion ? { 'data-camera-motion-draw': '' } : {})}
			style={{
				position: 'fixed',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				zIndex: layer.zIndex
			}}
		>
			<Canvas
				key={canvasKey}
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					pointerEvents: 'none',
					filter: canvasFilter
				}}
				// `preserveDrawingBuffer` is what makes the visual-transition
				// crossfade possible: without it the drawing buffer is already
				// cleared when `freezeLayerFrame` reads this canvas and the frozen
				// copy comes out empty (a hard cut again).
				gl={{
					antialias: false,
					alpha: true,
					preserveDrawingBuffer: true
				}}
				onCreated={({ gl }) => {
					gl.setClearColor(0x000000, 0);
				}}
				camera={{ position: [0, 0, 1], fov: 75 }}
				dpr={canvasDpr}
				frameloop="demand"
			>
				<FrameRateLimiter
					minFrameMs={minFrameMs}
					active={layer.enabled}
				/>
				<Suspense fallback={null}>
					<ParallaxController groupRef={groupRef}>
						<group ref={groupRef}>{renderSceneLayer(layer)}</group>
					</ParallaxController>
				</Suspense>
			</Canvas>
		</div>
	);
}
