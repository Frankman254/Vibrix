import type { RenderFrameContext } from '../renderFrameContext';
import type { RenderSubsystem } from '../renderSubsystem';

// Stub subsystems for layers whose live render is currently bound to React +
// @react-three/fiber (looks, motion, particles, rain).
// Registering them lets renderFrameAt iterate the full pipeline order today;
// the offline implementations attach later once each layer is migrated to a
// pure imperative path. Live preview keeps using the existing R3F components
// — these stubs only run when renderFrameAt is invoked offline.

function makeStub(id: RenderSubsystem['id']): RenderSubsystem {
	return {
		id,
		render(_ctx: RenderFrameContext) {
			void _ctx;
		}
	};
}

export const backgroundSubsystem = makeStub('background');
export const looksSubsystem = makeStub('looks');
export const motionSubsystem = makeStub('motion');
export const particlesSubsystem = makeStub('particles');
export const rainSubsystem = makeStub('rain');
export const hudSubsystem = makeStub('hud');
