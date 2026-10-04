import type { ReactElement } from 'react';
import type { SceneLayer } from '@/types/layers';
import {
	isGlSceneLayer,
	type GlSceneLayer,
	type GlSceneLayerType
} from '@/lib/layers';
import ParticlesBackground from '@/components/wallpaper/ParticlesBackground';
import ParticlesForeground from '@/components/wallpaper/ParticlesForeground';
import RainLayer from '@/components/wallpaper/RainLayer';

type SceneLayerRenderer = (layer: GlSceneLayer) => ReactElement | null;

// `Record`, not `Partial<Record>`: every type `GL_SCENE_LAYER_TYPES` promises a
// WebGL context for must have something to draw in it, and adding one to that
// list without a renderer here is a type error rather than an empty canvas.
const registry: Record<GlSceneLayerType, SceneLayerRenderer> = {
	'particle-background': layer => (
		<ParticlesBackground renderOrder={layer.zIndex} />
	),
	'particle-foreground': layer => (
		<ParticlesForeground renderOrder={layer.zIndex} />
	),
	rain: layer => <RainLayer renderOrder={layer.zIndex} />
};

export function renderSceneLayer(layer: SceneLayer): ReactElement | null {
	if (!layer.enabled) return null;
	if (!isGlSceneLayer(layer)) return null;
	return registry[layer.type](layer);
}
