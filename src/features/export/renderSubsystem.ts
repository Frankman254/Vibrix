import type { WallpaperState } from '@/types/wallpaper';
import type {
	RenderFrameContext,
	RenderSubsystemId
} from './renderFrameContext';
import { RENDER_SUBSYSTEM_ORDER } from './renderFrameContext';

export type RenderSubsystem = {
	id: RenderSubsystemId;
	/**
	 * Async work a frame loop cannot do inline (loading images, fonts).
	 * Called once per export, before frame 0, with the state of frame 0 and
	 * every state a frame will carry (more than one when the slideshow
	 * switches images mid-track).
	 */
	prepare?(
		state: Readonly<WallpaperState>,
		frameStates: readonly Readonly<WallpaperState>[]
	): Promise<void>;
	/**
	 * Runs for every subsystem before any of them paints: state other layers
	 * read this frame (the Flash Light drive behind Flash Edge) steps here.
	 */
	beginFrame?(ctx: RenderFrameContext): void;
	render(ctx: RenderFrameContext): void;
	reset?(): void;
	dispose?(): void;
};

const registry = new Map<RenderSubsystemId, RenderSubsystem>();

export function registerRenderSubsystem(subsystem: RenderSubsystem): void {
	registry.set(subsystem.id, subsystem);
}

export function unregisterRenderSubsystem(id: RenderSubsystemId): void {
	const existing = registry.get(id);
	if (existing?.dispose) existing.dispose();
	registry.delete(id);
}

export function getRenderSubsystem(
	id: RenderSubsystemId
): RenderSubsystem | undefined {
	return registry.get(id);
}

export function listRegisteredSubsystems(): RenderSubsystem[] {
	const out: RenderSubsystem[] = [];
	for (const id of RENDER_SUBSYSTEM_ORDER) {
		const subsystem = registry.get(id);
		if (subsystem) out.push(subsystem);
	}
	return out;
}

export function resetAllRenderSubsystems(): void {
	for (const subsystem of registry.values()) {
		subsystem.reset?.();
	}
}

export function disposeAllRenderSubsystems(): void {
	for (const subsystem of registry.values()) {
		subsystem.dispose?.();
	}
	registry.clear();
}

/**
 * Frees what every subsystem holds (scratch canvases, the WebGL context)
 * while keeping them registered: the next export prepares them again.
 */
export function releaseRenderSubsystems(): void {
	for (const subsystem of registry.values()) {
		subsystem.dispose?.();
	}
}

export async function prepareAllRenderSubsystems(
	state: Readonly<WallpaperState>,
	frameStates: readonly Readonly<WallpaperState>[] = [state]
): Promise<void> {
	for (const subsystem of listRegisteredSubsystems()) {
		await subsystem.prepare?.(state, frameStates);
	}
}
