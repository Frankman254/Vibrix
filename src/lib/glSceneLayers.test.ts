import { describe, expect, it } from 'vitest';
import {
	GL_SCENE_LAYER_TYPES,
	isGlSceneLayer,
	type GlSceneLayerType
} from '@/lib/layers';
import type { OverlayLayer, SceneLayer, WallpaperLayer } from '@/types/layers';

/**
 * The mount decision in `WallpaperViewport`: a layer that answers yes here gets
 * a real WebGL context. A type with no GL scene answering yes means a context
 * spent drawing nothing — and, because the canvas now outlives the layer's
 * on/off switch, one held open for the whole session.
 */

// Exhaustive records, so adding a layer type is a type error here until someone
// decides whether it draws through GL.
const SCENE_IS_GL: Record<SceneLayer['type'], boolean> = {
	'background-image': false,
	'particle-background': true,
	'particle-foreground': true,
	rain: true
};

const OVERLAY_TYPES: Record<OverlayLayer['type'], true> = {
	'overlay-image': true,
	logo: true,
	spectrum: true,
	'track-title': true,
	lyrics: true
};

function sceneLayer(type: SceneLayer['type'], enabled: boolean) {
	return { id: type, type, kind: 'scene', enabled } as unknown as SceneLayer;
}

describe('isGlSceneLayer', () => {
	it('claims exactly the scene layers with a GL renderer', () => {
		for (const [type, isGl] of Object.entries(SCENE_IS_GL)) {
			expect(
				isGlSceneLayer(sceneLayer(type as SceneLayer['type'], true)),
				type
			).toBe(isGl);
		}
	});

	it('agrees with the exported type list', () => {
		expect([...GL_SCENE_LAYER_TYPES].sort()).toEqual(
			Object.entries(SCENE_IS_GL)
				.filter(([, isGl]) => isGl)
				.map(([type]) => type as GlSceneLayerType)
				.sort()
		);
	});

	it('never claims background-image — it draws through the DOM', () => {
		expect(isGlSceneLayer(sceneLayer('background-image', true))).toBe(
			false
		);
	});

	it('never claims an overlay layer', () => {
		for (const type of Object.keys(OVERLAY_TYPES)) {
			const layer = {
				id: type,
				type,
				kind: 'overlay',
				enabled: true
			} as unknown as WallpaperLayer;
			expect(isGlSceneLayer(layer), type).toBe(false);
		}
	});

	it('does not care whether the layer is enabled', () => {
		expect(isGlSceneLayer(sceneLayer('rain', false))).toBe(true);
		expect(isGlSceneLayer(sceneLayer('rain', true))).toBe(true);
	});
});
