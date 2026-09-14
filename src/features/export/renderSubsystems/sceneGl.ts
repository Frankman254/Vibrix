/**
 * Offline render of the WebGL scene layers: the particle field (background
 * and foreground) and Classic Rain. They step through the same modules as
 * the live `ParticleField` / `RainLayer` and draw the same shaders, on a
 * Three renderer of their own, composited into the frame one layer at a time
 * so each keeps its z-index slot.
 *
 * Live, each layer is an R3F canvas behind a CSS wrapper (the particle
 * filters) with a `[0,0,1]` / fov 75 camera; the export rebuilds that camera
 * for the output aspect and replays the wrapper filter with `ctx.filter`.
 */
import * as THREE from 'three';
import {
	getEditorThemePalette,
	resolveModeDrivenColors
} from '@/lib/backgroundPalette';
import { buildSceneLayers } from '@/lib/layers';
import { getCurrentViewportResolution } from '@/features/layout/viewportMetrics';
import {
	applyParticleUniforms,
	createParticleBuffers,
	createParticleRuntime,
	createParticleUniforms,
	PARTICLE_BACKGROUND_Z,
	PARTICLE_FOREGROUND_Z,
	resolveParticleCanvasFilter,
	resolveParticleRotationPalette,
	stepParticles,
	type ParticleBuffers
} from '@/features/particles/render/particleSimulation';
import {
	applyRainUniforms,
	RAIN_MESH_OVERSCALE,
	RAIN_MESH_Z,
	RAIN_PALETTE_SIZE,
	resolveRainMeshRotation,
	resolveRainUniforms
} from '@/features/rain/render/rainUniforms';
import { resolveSceneLayerMaxDpr } from '@/runtime/outputRenderQuality';
import { useWallpaperStore } from '@/store/wallpaperStore';
import particleVertexShader from '@/shaders/particleVertex.glsl';
import particleFragmentShader from '@/shaders/particleFragment.glsl';
import rainVertexShader from '@/shaders/rainVertex.glsl';
import rainFragmentShader from '@/shaders/rainOverlayFragment.glsl';
import type { WallpaperState } from '@/types/wallpaper';
import type { RenderFrameContext } from '../renderFrameContext';
import type { RenderSubsystem } from '../renderSubsystem';

/** Delta above this is a seek or first frame, not a step (matches live). */
const MAX_STEP_SEC = 0.1;
const CAMERA_FOV = 75;
const CAMERA_Z = 1;

/**
 * One WebGL context for every scene layer of an export: created on the first
 * frame that needs it, released when the export ends.
 */
function createSceneGlHost() {
	let renderer: THREE.WebGLRenderer | null = null;
	const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1000);
	camera.position.set(0, 0, CAMERA_Z);
	let users = 0;

	return {
		/** Renders `scene` at the output size and returns the GL canvas. */
		draw(
			scene: THREE.Scene,
			width: number,
			height: number
		): HTMLCanvasElement | null {
			if (!renderer) {
				try {
					renderer = new THREE.WebGLRenderer({
						antialias: false,
						alpha: true,
						preserveDrawingBuffer: true
					});
				} catch {
					return null;
				}
				renderer.setPixelRatio(1);
				renderer.setClearColor(0x000000, 0);
			}
			const canvas = renderer.domElement;
			if (canvas.width !== width || canvas.height !== height) {
				renderer.setSize(width, height, false);
			}
			const aspect = width / height;
			if (camera.aspect !== aspect) {
				camera.aspect = aspect;
				camera.updateProjectionMatrix();
			}
			renderer.clear();
			renderer.render(scene, camera);
			return canvas;
		},
		retain() {
			users += 1;
		},
		release() {
			users = Math.max(0, users - 1);
			if (users > 0 || !renderer) return;
			renderer.dispose();
			renderer.forceContextLoss();
			renderer = null;
		}
	};
}

type SceneGlHost = ReturnType<typeof createSceneGlHost>;

/** World size the live R3F `viewport` reports at z = 0 for this aspect. */
function resolveWorldViewport(aspect: number) {
	const height = 2 * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180) * CAMERA_Z;
	return { width: height * aspect, height };
}

/**
 * Device pixels per CSS pixel of the live particle canvas. Read from the
 * live store, not the export snapshot (which forces `high`): point sizes are
 * device pixels, so this is what keeps them the size the preview shows.
 */
function readLiveParticleDpr(): number {
	if (typeof window === 'undefined') return 1;
	return Math.min(
		window.devicePixelRatio || 1,
		resolveSceneLayerMaxDpr(
			useWallpaperStore.getState().performanceMode,
			true
		)
	);
}

function readViewportMin(): number {
	const viewport = getCurrentViewportResolution();
	return Math.max(1, Math.min(viewport.width, viewport.height));
}

function hasParticleFilter(state: Readonly<WallpaperState>): boolean {
	return (
		state.particleFilterBrightness !== 1 ||
		state.particleFilterContrast !== 1 ||
		state.particleFilterSaturation !== 1 ||
		state.particleFilterBlur !== 0 ||
		state.particleFilterHueRotate !== 0
	);
}

function createParticleLayerSubsystem(
	id: 'particles' | 'particlesForeground',
	host: SceneGlHost
): RenderSubsystem {
	const layerType =
		id === 'particles' ? 'particle-background' : 'particle-foreground';
	const zPosition =
		id === 'particles' ? PARTICLE_BACKGROUND_Z : PARTICLE_FOREGROUND_Z;
	const scene = new THREE.Scene();
	const geometry = new THREE.BufferGeometry();
	const uniforms = createParticleUniforms();
	const material = new THREE.ShaderMaterial({
		vertexShader: particleVertexShader,
		fragmentShader: particleFragmentShader,
		uniforms,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		blending: THREE.AdditiveBlending
	});
	const points = new THREE.Points(geometry, material);
	points.frustumCulled = false;
	scene.add(points);

	let runtime = createParticleRuntime();
	let buffers: ParticleBuffers | null = null;
	let seedKey = '';
	let viewportMin = 1;
	let liveDpr = 1;
	let retained = false;

	const reseed = (ctx: RenderFrameContext) => {
		const state = ctx.state;
		const colors = resolveModeDrivenColors(
			state.particleColorSource,
			state.particleColor1,
			state.particleColor2,
			ctx.palette,
			getEditorThemePalette(state.editorTheme)
		);
		const key = JSON.stringify([
			state.particleCount,
			state.performanceMode,
			state.particleSizeMin,
			state.particleSizeMax,
			state.particleColorMode,
			state.particleColorSource,
			colors
		]);
		if (buffers && key === seedKey) return { colors, changed: false };
		seedKey = key;
		// Live reseeds the field whenever these change (a slideshow image
		// switch repaints an image-sourced palette), so the export does too.
		buffers = createParticleBuffers(state, colors, zPosition);
		const attribute = (array: Float32Array, size: number) =>
			new THREE.BufferAttribute(array, size).setUsage(
				THREE.DynamicDrawUsage
			);
		geometry.setAttribute('position', attribute(buffers.positions, 3));
		geometry.setAttribute('aSize', attribute(buffers.sizes, 1));
		geometry.setAttribute('aColor', attribute(buffers.colors, 3));
		geometry.setAttribute('aOffset', attribute(buffers.offsets, 1));
		geometry.setAttribute('aLife', attribute(buffers.lives, 1));
		return { colors, changed: true };
	};

	return {
		id,
		async prepare() {
			viewportMin = readViewportMin();
			liveDpr = readLiveParticleDpr();
		},
		render(ctx: RenderFrameContext) {
			if (!ctx.audio) return;
			const layer = buildSceneLayers(ctx.state as WallpaperState).find(
				entry => entry.type === layerType
			);
			if (!layer?.enabled) return;
			const target = ctx.canvas.getContext('2d');
			if (!target) return;

			const { colors } = reseed(ctx);
			if (!buffers || buffers.count === 0) return;
			const result = stepParticles(
				runtime,
				buffers,
				ctx.state,
				ctx.audio,
				Math.min(ctx.deltaMs / 1000, MAX_STEP_SEC),
				resolveParticleRotationPalette(ctx.state, colors)
			);
			applyParticleUniforms(uniforms, result.uniforms);
			const { width, height } = ctx.resolution;
			const outputMin = Math.min(width, height);
			// `gl_PointSize` is in device pixels of the live canvas.
			uniforms.uPixelScale.value = outputMin / (viewportMin * liveDpr);
			geometry.attributes.position.needsUpdate = true;
			geometry.attributes.aLife.needsUpdate = true;
			if (result.colorsChanged)
				geometry.attributes.aColor.needsUpdate = true;

			if (!retained) {
				host.retain();
				retained = true;
			}
			const glCanvas = host.draw(scene, width, height);
			if (!glCanvas) return;
			if (!hasParticleFilter(ctx.state)) {
				target.drawImage(glCanvas, 0, 0);
				return;
			}
			target.save();
			target.filter = resolveParticleCanvasFilter(
				ctx.state,
				outputMin / viewportMin
			);
			target.drawImage(glCanvas, 0, 0);
			target.restore();
		},
		reset() {
			runtime = createParticleRuntime();
			buffers = null;
			seedKey = '';
		},
		dispose() {
			buffers = null;
			seedKey = '';
			if (retained) {
				retained = false;
				host.release();
			}
		}
	};
}

function createRainSubsystem(host: SceneGlHost): RenderSubsystem {
	const scene = new THREE.Scene();
	const uniforms = {
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
	};
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(1, 1),
		new THREE.ShaderMaterial({
			vertexShader: rainVertexShader,
			fragmentShader: rainFragmentShader,
			uniforms,
			transparent: true,
			depthTest: false,
			depthWrite: false
		})
	);
	mesh.position.set(0, 0, RAIN_MESH_Z);
	scene.add(mesh);

	let motionTime = 0;
	let retained = false;

	return {
		id: 'rain',
		render(ctx: RenderFrameContext) {
			const layer = buildSceneLayers(ctx.state as WallpaperState).find(
				entry => entry.type === 'rain'
			);
			if (!layer?.enabled) return;
			const target = ctx.canvas.getContext('2d');
			if (!target) return;

			const { width, height } = ctx.resolution;
			motionTime += Math.min(ctx.deltaMs / 1000, MAX_STEP_SEC);
			uniforms.uTime.value = motionTime;
			applyRainUniforms(
				uniforms,
				resolveRainUniforms(ctx.state, {
					background: ctx.palette,
					theme: getEditorThemePalette(ctx.state.editorTheme)
				})
			);
			const world = resolveWorldViewport(width / height);
			mesh.scale.set(
				world.width * RAIN_MESH_OVERSCALE,
				world.height * RAIN_MESH_OVERSCALE,
				1
			);
			mesh.rotation.z = resolveRainMeshRotation(ctx.state);

			if (!retained) {
				host.retain();
				retained = true;
			}
			const glCanvas = host.draw(scene, width, height);
			if (glCanvas) target.drawImage(glCanvas, 0, 0);
		},
		reset() {
			motionTime = 0;
		},
		dispose() {
			if (retained) {
				retained = false;
				host.release();
			}
		}
	};
}

/** The particle (background + foreground) and rain subsystems, one GL host. */
export function createSceneGlSubsystems(): RenderSubsystem[] {
	const host = createSceneGlHost();
	return [
		createParticleLayerSubsystem('particles', host),
		createRainSubsystem(host),
		createParticleLayerSubsystem('particlesForeground', host)
	];
}
