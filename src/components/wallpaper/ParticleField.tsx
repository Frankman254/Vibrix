import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import {
	getEditorThemePalette,
	resolveModeDrivenColors
} from '@/lib/backgroundPalette';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useAudioData } from '@/hooks/useAudioData';
import {
	applyParticleUniforms,
	createParticleBuffers,
	createParticleRuntime,
	createParticleUniforms,
	resolveParticleFieldBounds,
	resolveParticleRotationPalette,
	resolveParticleVisibleHalfExtent,
	stepParticles
} from '@/features/particles/render/particleSimulation';
import { cameraMotionOverscanPx } from '@/features/stageFx/motionLayers';
import { readCameraDrawOffset } from '@/features/stageFx/cameraDrawOffset';
import vertexShader from '@/shaders/particleVertex.glsl';
import fragmentShader from '@/shaders/particleFragment.glsl';

interface ParticleFieldProps {
	renderOrder?: number;
	zPosition: number;
}

export default function ParticleField({
	renderOrder = 10,
	zPosition
}: ParticleFieldProps) {
	const pointsRef = useRef<THREE.Points>(null);
	const runtimeRef = useRef(createParticleRuntime());
	// Only what reseeds the buffers or gates the loop re-renders; the frame
	// step reads the rest of the settings straight from the store.
	const {
		particleCount,
		particleColor1,
		particleColor2,
		particleColorSource,
		particleColorMode,
		particleSizeMin,
		particleSizeMax,
		performanceMode,
		motionPaused,
		sleepModeActive,
		editorTheme
	} = useWallpaperStore(
		useShallow(state => ({
			particleCount: state.particleCount,
			particleColor1: state.particleColor1,
			particleColor2: state.particleColor2,
			particleColorSource: state.particleColorSource,
			particleColorMode: state.particleColorMode,
			particleSizeMin: state.particleSizeMin,
			particleSizeMax: state.particleSizeMax,
			performanceMode: state.performanceMode,
			motionPaused: state.motionPaused,
			sleepModeActive: state.sleepModeActive,
			editorTheme: state.editorTheme
		}))
	);
	const backgroundPalette = useBackgroundPalette();
	const themePalette = useMemo(
		() => getEditorThemePalette(editorTheme),
		[editorTheme]
	);
	const { getAudioSnapshot } = useAudioData();

	const resolvedColors = useMemo(
		() =>
			resolveModeDrivenColors(
				particleColorSource,
				particleColor1,
				particleColor2,
				backgroundPalette,
				themePalette
			),
		[
			particleColorSource,
			particleColor1,
			particleColor2,
			backgroundPalette,
			themePalette
		]
	);
	const rotationPalette = useMemo(
		() =>
			resolveParticleRotationPalette(
				{ particleColorMode, particleColorSource },
				resolvedColors
			),
		[particleColorMode, particleColorSource, resolvedColors]
	);
	const rotationPaletteRef = useRef(rotationPalette);
	rotationPaletteRef.current = rotationPalette;

	// How far past the frame the field has to reach. Camera Motion translates
	// this layer's whole canvas (a particle field has no figure whose drawing
	// could be offset instead), so anything the field does not cover arrives in
	// the picture as a straight, empty edge. Read from the settings and
	// quantised, never from the live offset: this decides the buffer size, and
	// resizing it per frame would reseed the field sixty times a second.
	const cameraOverscanPx = useWallpaperStore(s =>
		cameraMotionOverscanPx(s, 'particles')
	);
	const viewportFactor = useThree(s => s.viewport.factor);
	const viewportAspect = useThree(s => s.viewport.aspect);
	const bounds = useMemo(() => {
		const depthScale = Math.max(0.01, 1 - zPosition);
		const overscanWorld =
			viewportFactor > 0
				? (cameraOverscanPx * depthScale) / viewportFactor
				: 0;
		const visible = resolveParticleVisibleHalfExtent(
			viewportAspect,
			zPosition
		);
		// Quantised so that dragging a window edge does not reseed the field on
		// every resize event.
		const quantise = (value: number) => Math.ceil(value * 10) / 10;
		return resolveParticleFieldBounds(
			{
				halfWidth: quantise(visible.halfWidth),
				halfHeight: quantise(visible.halfHeight)
			},
			quantise(overscanWorld)
		);
	}, [cameraOverscanPx, viewportAspect, viewportFactor, zPosition]);

	const buffers = useMemo(
		() =>
			createParticleBuffers(
				{
					particleCount,
					performanceMode,
					particleSizeMin,
					particleSizeMax,
					particleColorMode,
					particleColorSource
				},
				resolvedColors,
				zPosition,
				bounds
			),
		[
			bounds,
			particleCount,
			performanceMode,
			particleSizeMin,
			particleSizeMax,
			particleColorMode,
			particleColorSource,
			resolvedColors,
			zPosition
		]
	);
	const buffersRef = useRef(buffers);
	buffersRef.current = buffers;
	const boundsRef = useRef(bounds);
	boundsRef.current = bounds;

	const uniforms = useMemo(() => createParticleUniforms(), []);

	useEffect(() => {
		if (!pointsRef.current) return;
		const geometry = pointsRef.current.geometry;
		(geometry.attributes.position as THREE.BufferAttribute).setUsage(
			THREE.DynamicDrawUsage
		);
		(geometry.attributes.aLife as THREE.BufferAttribute).setUsage(
			THREE.DynamicDrawUsage
		);
	}, [buffers.count]);

	useFrame((_, dt) => {
		if (!pointsRef.current) return;
		// Camera Motion moves the points inside the scene, not the canvas: the
		// canvas is exactly the screen, so translating it would uncover the
		// screen behind it — the straight empty edge the user saw. The field is
		// seeded past the frame for precisely this, so what scrolls in is more
		// field instead of nothing. Applied before the pause check so a paused
		// project still sits where the movement left it.
		const drawOffset = readCameraDrawOffset('particles');
		const worldPerPx =
			viewportFactor > 0
				? Math.max(0.01, 1 - zPosition) / viewportFactor
				: 0;
		pointsRef.current.position.x = (drawOffset?.tx ?? 0) * worldPerPx;
		// Screen Y grows downward, world Y upward.
		pointsRef.current.position.y = -(drawOffset?.ty ?? 0) * worldPerPx;
		if (motionPaused || sleepModeActive) return;
		const mat = pointsRef.current.material as THREE.ShaderMaterial;
		const geometry = pointsRef.current.geometry;

		const result = stepParticles(
			runtimeRef.current,
			buffersRef.current,
			useWallpaperStore.getState(),
			getAudioSnapshot(),
			dt,
			rotationPaletteRef.current,
			boundsRef.current
		);
		applyParticleUniforms(mat.uniforms, result.uniforms);
		if (result.positionsChanged) {
			geometry.attributes.position.needsUpdate = true;
		}
		geometry.attributes.aLife.needsUpdate = true;
		if (result.colorsChanged) {
			geometry.attributes.aColor.needsUpdate = true;
		}
	});

	if (buffers.count === 0) return null;

	return (
		<points
			ref={pointsRef}
			position={[0, 0, 0]}
			renderOrder={renderOrder}
			frustumCulled={false}
		>
			<bufferGeometry>
				<bufferAttribute
					attach="attributes-position"
					args={[buffers.positions, 3]}
				/>
				<bufferAttribute
					attach="attributes-aSize"
					args={[buffers.sizes, 1]}
				/>
				<bufferAttribute
					attach="attributes-aColor"
					args={[buffers.colors, 3]}
				/>
				<bufferAttribute
					attach="attributes-aOffset"
					args={[buffers.offsets, 1]}
				/>
				<bufferAttribute
					attach="attributes-aLife"
					args={[buffers.lives, 1]}
				/>
			</bufferGeometry>
			<shaderMaterial
				vertexShader={vertexShader}
				fragmentShader={fragmentShader}
				uniforms={uniforms}
				transparent
				depthTest={false}
				depthWrite={false}
				blending={THREE.AdditiveBlending}
			/>
		</points>
	);
}
