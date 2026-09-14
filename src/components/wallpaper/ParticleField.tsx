import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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
	resolveParticleRotationPalette,
	stepParticles
} from '@/features/particles/render/particleSimulation';
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
				zPosition
			),
		[
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
		if (motionPaused || sleepModeActive) return;
		const mat = pointsRef.current.material as THREE.ShaderMaterial;
		const geometry = pointsRef.current.geometry;

		const result = stepParticles(
			runtimeRef.current,
			buffersRef.current,
			useWallpaperStore.getState(),
			getAudioSnapshot(),
			dt,
			rotationPaletteRef.current
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
