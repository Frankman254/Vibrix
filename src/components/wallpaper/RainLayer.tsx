// Classic Rain renderer. Stable/frozen feature set — see RainSection.tsx.
// TODO (V2): fold into the Particles emitter path (streak particles).
import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useBackgroundPalette } from '@/hooks/useBackgroundPalette';
import { getEditorThemePalette } from '@/lib/backgroundPalette';
import {
	applyRainUniforms,
	RAIN_MESH_OVERSCALE,
	RAIN_MESH_Z,
	RAIN_PALETTE_SIZE,
	resolveRainMeshRotation,
	resolveRainUniforms
} from '@/features/rain/render/rainUniforms';
import vertexShader from '@/shaders/rainVertex.glsl';
import fragmentShader from '@/shaders/rainOverlayFragment.glsl';

export default function RainLayer({
	renderOrder = 20
}: {
	renderOrder?: number;
}) {
	const meshRef = useRef<THREE.Mesh>(null);
	const motionTimeRef = useRef(0);
	const { viewport } = useThree();
	const { motionPaused, sleepModeActive, editorTheme } = useWallpaperStore(
		useShallow(state => ({
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

	// Built ONCE on purpose: GPU uniform objects whose `.value` is mutated in
	// `useFrame`; the frame fills them before the first draw.
	const uniforms = useMemo(
		() => ({
			uTime: { value: 0 },
			uRainIntensity: { value: 0 },
			uDropCount: { value: 0 },
			uRainAngle: { value: 0 },
			uRainSpeed: { value: 0 },
			uRainLength: { value: 0 },
			uRainWidth: { value: 0 },
			uRainBlur: { value: 0 },
			uRainVariation: { value: 0 },
			uRainColor: { value: new THREE.Vector3() },
			uColorMode: { value: 0 },
			uUsePaletteRainbow: { value: 0 },
			uPaletteCount: { value: 0 },
			uPaletteColors: {
				value: Array.from(
					{ length: RAIN_PALETTE_SIZE },
					() => new THREE.Vector3()
				)
			},
			uParticleType: { value: 0 }
		}),
		[]
	);

	useFrame((_, dt) => {
		if (!meshRef.current) return;
		if (motionPaused || sleepModeActive) return;
		const mat = meshRef.current.material as THREE.ShaderMaterial;
		const state = useWallpaperStore.getState();
		motionTimeRef.current += Math.min(dt, 0.1);
		mat.uniforms.uTime.value = motionTimeRef.current;
		applyRainUniforms(
			mat.uniforms,
			resolveRainUniforms(state, {
				background: backgroundPalette,
				theme: themePalette
			})
		);
		meshRef.current.rotation.z = resolveRainMeshRotation(state);
	});

	return (
		<mesh
			ref={meshRef}
			position={[0, 0, RAIN_MESH_Z]}
			scale={[
				viewport.width * RAIN_MESH_OVERSCALE,
				viewport.height * RAIN_MESH_OVERSCALE,
				1
			]}
			renderOrder={renderOrder}
		>
			<planeGeometry args={[1, 1]} />
			<shaderMaterial
				vertexShader={vertexShader}
				fragmentShader={fragmentShader}
				uniforms={uniforms}
				transparent
				depthTest={false}
				depthWrite={false}
			/>
		</mesh>
	);
}
