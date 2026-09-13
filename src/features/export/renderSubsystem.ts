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
	 * Called once per export with the frozen state, before frame 0.
	 */
	prepare?(state: Readonly<WallpaperState>): Promise<void>;
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

export async function prepareAllRenderSubsystems(
	state: Readonly<WallpaperState>
): Promise<void> {
	for (const subsystem of listRegisteredSubsystems()) {
		await subsystem.prepare?.(state);
	}
}
