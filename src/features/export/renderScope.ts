/**
 * RenderScope — the mutable cross-run state the export pipeline owns.
 *
 * The draw code used to keep its per-frame state (spectrum runtimes, logo
 * envelope/rotation, flash-edge drive) in module globals shared by the live
 * viewport and the offline export. Exporting a video therefore animated the
 * on-screen canvas, and a live animation corrupted the exported frames.
 *
 * A `RenderScope` bundles the per-domain scopes: the export runner creates one
 * per run, resets it between runs, and threads it through
 * `RenderFrameContext.scope`; every subsystem and draw function reads/writes
 * the scope instead of a global. Live components never pass a scope, so they
 * keep using their domains' default (LIVE) scopes untouched.
 *
 * Direction: `features/export` may import spectrum/logo/stageFx (ARCHITECTURE
 * §2); none of those domains import this module back.
 */
import {
	createSpectrumScope,
	resetSpectrumScope,
	type SpectrumScope
} from '@/features/spectrum';
import {
	createLogoScope,
	resetLogoScope,
	type LogoScope
} from '@/features/logo';
import {
	createFlashEdgeScope,
	type FlashEdgeScope
} from '@/features/stageFx/flashEdgeDrive';

export type RenderScope = {
	spectrum: SpectrumScope;
	logo: LogoScope;
	flashEdge: FlashEdgeScope;
};

export function createRenderScope(): RenderScope {
	return {
		spectrum: createSpectrumScope(),
		logo: createLogoScope(),
		flashEdge: createFlashEdgeScope()
	};
}

/** Restores every domain scope to its frame-zero state (start of a run). */
export function resetRenderScope(scope: RenderScope): void {
	resetSpectrumScope(scope.spectrum);
	resetLogoScope(scope.logo);
	scope.flashEdge.drive = 0;
	scope.flashEdge.color = '#ffffff';
}
