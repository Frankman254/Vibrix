/**
 * How the offline frame stacks its layers, mirroring the live viewport:
 * draw order by each layer's z-index, which Camera FX target a subsystem
 * belongs to, and the scene fade a subsystem takes part in.
 *
 * Pure: no canvas, no registry, so it is tested by value.
 */
import { buildOverlayLayers, buildSceneLayers } from '@/lib/layers';
import type { CameraMotionLayer } from '@/features/stageFx/stageFxConfig';
import { visualTransitionProgress } from '@/features/visualTransition/visualTransitionCoordinator';
import type {
	VisualTransitionSubsystem,
	WallpaperState
} from '@/types/wallpaper';
import {
	RENDER_SUBSYSTEM_ORDER,
	type RenderSubsystemId
} from './renderFrameContext';

/** The `data-camera-motion-layer` each subsystem's live root carries. */
export const SUBSYSTEM_CAMERA_LAYER: Partial<
	Record<RenderSubsystemId, CameraMotionLayer>
> = {
	globalBackground: 'global-background',
	background: 'background',
	stageLights: 'stage-lights',
	particles: 'particles',
	rain: 'rain',
	particlesForeground: 'particles',
	spectrum: 'spectrum',
	logo: 'logo',
	trackTitle: 'track-title',
	lyrics: 'lyrics',
	overlays: 'selected-overlay',
	flashLight: 'flash-light'
};

/** Layers whose live wrapper fades in with a scene change. */
const SUBSYSTEM_TRANSITION: Partial<
	Record<RenderSubsystemId, VisualTransitionSubsystem>
> = {
	particles: 'particles',
	rain: 'rain',
	particlesForeground: 'particles',
	spectrum: 'spectrum',
	logo: 'logo'
};

/** Live mounts these outside the layer list at a fixed z-index. */
const FIXED_Z: Partial<Record<RenderSubsystemId, number>> = {
	globalBackground: -Infinity,
	stageLights: 1,
	flashLight: 90,
	hud: Infinity
};

function minZ(values: number[]): number | undefined {
	return values.length > 0 ? Math.min(...values) : undefined;
}

/**
 * Subsystems in paint order. Ties keep `RENDER_SUBSYSTEM_ORDER`, which is
 * the live DOM order for layers sharing a z-index.
 */
export function resolveSubsystemDrawOrder(
	state: Readonly<WallpaperState>
): RenderSubsystemId[] {
	const scene = buildSceneLayers(state as WallpaperState);
	const overlay = buildOverlayLayers(state as WallpaperState);
	const zOf = (type: string) =>
		minZ(
			[...scene, ...overlay]
				.filter(layer => layer.type === type)
				.map(layer => layer.zIndex)
		);
	const z: Partial<Record<RenderSubsystemId, number | undefined>> = {
		...FIXED_Z,
		background: zOf('background-image'),
		particles: zOf('particle-background'),
		rain: zOf('rain'),
		particlesForeground: zOf('particle-foreground'),
		spectrum: zOf('spectrum'),
		logo: zOf('logo'),
		trackTitle: zOf('track-title'),
		lyrics: zOf('lyrics'),
		overlays: zOf('overlay-image')
	};
	return RENDER_SUBSYSTEM_ORDER.map((id, index) => ({
		id,
		index,
		z: z[id] ?? 0
	}))
		.sort((a, b) => a.z - b.z || a.index - b.index)
		.map(entry => entry.id);
}

/** Opacity of a subsystem's layer at `timeMs` while a scene fade runs. */
export function resolveTransitionAlpha(
	state: Readonly<WallpaperState>,
	id: RenderSubsystemId,
	timeMs: number
): number {
	const subsystem = SUBSYSTEM_TRANSITION[id];
	const transition = state.visualTransition;
	if (
		!subsystem ||
		!transition ||
		transition.durationMs <= 0 ||
		!transition.subsystems.includes(subsystem)
	) {
		return 1;
	}
	return visualTransitionProgress(transition, timeMs);
}
