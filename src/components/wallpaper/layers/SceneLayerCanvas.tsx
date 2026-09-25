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
	transitionSubsystemForLayerType,
	useVisualTransitionFade
} from '@/features/visualTransition/useVisualTransitionFade';

/**
 * Caps the R3F render rate. The Canvas runs in `frameloop="demand"` and this
 * pump drives `invalidate()` at the performance-mode cadence (30/45/60), so on
 * a high-refresh display (120Hz) the particle/rain GPU draw — and the heavy
 * additive glow overdraw — happens ~half as often with no visible difference.
 */
function FrameRateLimiter({ minFrameMs }: { minFrameMs: number }) {
	const invalidate = useThree(s => s.invalidate);
	useEffect(() => {
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
	}, [invalidate, minFrameMs]);
	return null;
}

export default function SceneLayerCanvas({ layer }: { layer: SceneLayer }) {
	const groupRef = useRef<Group>(null);
	const fadeRef = useVisualTransitionFade(
		transitionSubsystemForLayerType(layer.type)
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

	if (!layer.enabled) return null;

	const particleFilterActive =
		layer.type === 'particle-background' ||
		layer.type === 'particle-foreground';
	const canvasFilter = particleFilterActive
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
			style={{
				position: 'fixed',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				zIndex: layer.zIndex,
				filter: canvasFilter
			}}
		>
			<Canvas
				key={canvasKey}
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					pointerEvents: 'none'
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
				<FrameRateLimiter minFrameMs={minFrameMs} />
				<Suspense fallback={null}>
					<ParallaxController groupRef={groupRef}>
						<group ref={groupRef}>{renderSceneLayer(layer)}</group>
					</ParallaxController>
				</Suspense>
			</Canvas>
		</div>
	);
}
