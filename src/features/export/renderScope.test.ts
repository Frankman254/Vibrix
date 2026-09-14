import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { SpectrumSettings } from '@/features/spectrum';
import {
	LIVE_SPECTRUM_SCOPE,
	createSpectrumRuntimeState,
	resetSpectrumScope
} from '@/features/spectrum';
import { resolveGradientFlowPhase } from '@/features/spectrum/effects/gradientFlow';
import { getLogoRotation } from '@/features/logo';
import {
	LIVE_FLASH_EDGE_SCOPE,
	getFlashEdgeDrive,
	updateFlashEdgeDrive
} from '@/features/stageFx/flashEdgeDrive';
import { createRenderScope, resetRenderScope } from './renderScope';

function flowSettings(): SpectrumSettings {
	return {
		...DEFAULT_STATE,
		spectrumGradientFlow: true,
		spectrumGradientFlowSpeed: 0.8
	} as unknown as SpectrumSettings;
}

describe('renderScope', () => {
	it('an export run never touches the live scopes', () => {
		// The regression this guards: exporting animated the on-screen canvas
		// because both loops shared module-level draw state.
		const run = createRenderScope();

		updateFlashEdgeDrive(0.7, '#ff0000', run.flashEdge);
		expect(getFlashEdgeDrive()).toBe(0);

		resolveGradientFlowPhase(flowSettings(), 0, 1 / 60, run.spectrum);
		expect(LIVE_SPECTRUM_SCOPE.gradientPhase).toBe(0);
		expect(LIVE_SPECTRUM_SCOPE.runtimes.size).toBe(0);

		run.logo.rotation += 1.25;
		expect(getLogoRotation()).toBe(0);
	});

	it('two runs interleaved advance independently', () => {
		const a = createRenderScope();
		const b = createRenderScope();
		const settings = flowSettings();

		resolveGradientFlowPhase(settings, 0, 1 / 60, a.spectrum);
		const bFirst = resolveGradientFlowPhase(
			settings,
			0,
			1 / 60,
			b.spectrum
		);
		resolveGradientFlowPhase(settings, 0, 1 / 60, a.spectrum);
		resolveGradientFlowPhase(settings, 0, 1 / 60, a.spectrum);

		// B took exactly one step; A's extra steps must not leak into it.
		expect(b.spectrum.gradientPhase).toBe(bFirst);
		expect(a.spectrum.gradientPhase).not.toBe(bFirst);

		updateFlashEdgeDrive(0.4, '#00ff00', a.flashEdge);
		expect(b.flashEdge.drive).toBe(0);
		expect(b.flashEdge.color).toBe('#ffffff');
	});

	it('reset returns every domain scope to frame zero', () => {
		const run = createRenderScope();
		resolveGradientFlowPhase(flowSettings(), 0, 1 / 60, run.spectrum);
		run.spectrum.runtimes.set(
			'spectrum:main',
			createSpectrumRuntimeState()
		);
		updateFlashEdgeDrive(0.9, '#123456', run.flashEdge);
		run.logo.rotation = 2.5;

		resetRenderScope(run);

		expect(run.spectrum.gradientPhase).toBe(0);
		expect(run.spectrum.runtimes.size).toBe(0);
		expect(run.flashEdge.drive).toBe(0);
		expect(run.flashEdge.color).toBe('#ffffff');
		expect(run.logo.rotation).toBe(0);
	});

	it('reset is per-scope, not global', () => {
		const a = createRenderScope();
		updateFlashEdgeDrive(0.5, '#abcdef', a.flashEdge);
		resolveGradientFlowPhase(flowSettings(), 0, 1 / 60, a.spectrum);

		resetRenderScope(a);
		const advanced = resolveGradientFlowPhase(
			flowSettings(),
			0,
			1 / 60,
			a.spectrum
		);

		// The live scopes keep their own animation state untouched.
		expect(LIVE_FLASH_EDGE_SCOPE.drive).toBe(0);
		expect(LIVE_SPECTRUM_SCOPE.gradientPhase).toBe(0);

		// A domain-level reset called on the live scope (legacy callers) must
		// not clear a run scope.
		resetSpectrumScope(LIVE_SPECTRUM_SCOPE);
		expect(a.spectrum.gradientPhase).toBe(advanced);
	});
});
