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
	RAIN_MESH_DEPTH_SCALE,
	RAIN_MESH_OVERSCALE,
	RAIN_MESH_Z,
	RAIN_PALETTE_SIZE,
	resolveRainMeshRotation,
	resolveRainMeshTiles,
	resolveRainUniforms
} from '@/features/rain/render/rainUniforms';
import { cameraMotionOverscanPx } from '@/features/stageFx/motionLayers';
import { readCameraDrawOffset } from '@/features/stageFx/cameraDrawOffset';
import vertexShader from '@/shaders/rainVertex.glsl';
import fragmentShader from '@/shaders/rainOverlayFragment.glsl';

export default function RainLayer({
	renderOrder = 20
}: {
	renderOrder?: number;
}) {
	const meshRef = useRef<THREE.Mesh>(null);
	const motionTimeRef = useRef(0);
	const { viewport, size } = useThree();
	const { motionPaused, sleepModeActive, editorTheme } = useWallpaperStore(
		useShallow(state => ({
			motionPaused: state.motionPaused,
			sleepModeActive: state.sleepModeActive,
			editorTheme: state.editorTheme
		}))
	);
	// How far past the frame the plane has to reach. Camera Motion moves what
	// this layer DRAWS (the plane inside the scene), never the canvas, so the
	// pattern has to exist where the movement takes it — otherwise the plane's
	// own edge is what arrives in the picture. Read from the settings, so the
	// plane is sized once per configuration instead of per frame.
	const cameraOverscanPx = useWallpaperStore(s =>
		cameraMotionOverscanPx(s, 'rain')
	);
	const meshRotation = useWallpaperStore(s => resolveRainMeshRotation(s));
	const meshTiles = resolveRainMeshTiles(
		cameraOverscanPx,
		Math.max(1, Math.min(size.width, size.height)),
		size.width / Math.max(1, size.height),
		meshRotation
	);
	const meshTilesRef = useRef(meshTiles);
	meshTilesRef.current = meshTiles;
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
			uParticleType: { value: 0 },
			uRainTiles: { value: 1 }
		}),
		[]
	);

	useFrame((_, dt) => {
		if (!meshRef.current) return;
		// Applied before the pause check so a paused project stays where the
		// movement left it, exactly as the particle field does.
		const drawOffset = readCameraDrawOffset('rain');
		const worldPerPx =
			viewport.factor > 0 ? RAIN_MESH_DEPTH_SCALE / viewport.factor : 0;
		meshRef.current.position.x = (drawOffset?.tx ?? 0) * worldPerPx;
		// Screen Y grows downward, world Y upward.
		meshRef.current.position.y = -(drawOffset?.ty ?? 0) * worldPerPx;
		const mat = meshRef.current.material as THREE.ShaderMaterial;
		// Kept in step with the mesh scale even while paused: a bigger plane with
		// a one-tile pattern would draw the drops as big as the plane grew.
		mat.uniforms.uRainTiles.value = meshTilesRef.current;
		if (motionPaused || sleepModeActive) return;
		const state = useWallpaperStore.getState();
		motionTimeRef.current += Math.min(dt, 0.1);
		mat.uniforms.uTime.value = motionTimeRef.current;
		applyRainUniforms(
			mat.uniforms,
			resolveRainUniforms(
				state,
				{
					background: backgroundPalette,
					theme: themePalette
				},
				meshTilesRef.current
			)
		);
		meshRef.current.rotation.z = resolveRainMeshRotation(state);
	});

	return (
		<mesh
			ref={meshRef}
			position={[0, 0, RAIN_MESH_Z]}
			scale={[
				viewport.width * RAIN_MESH_OVERSCALE * meshTiles,
				viewport.height * RAIN_MESH_OVERSCALE * meshTiles,
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
