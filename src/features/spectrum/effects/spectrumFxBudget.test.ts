import { describe, expect, it } from 'vitest';
import {
	curveRgbSplitAmount,
	resolvePeakSparkCount,
	resolveRgbSplitAlpha,
	resolveRgbSplitOffsetPx
} from './spectrumFxBudget';
import { resolveGradientFlowPhase } from './gradientFlow';
import {
	resolveNeonCoreLineWidth,
	resolveNeonCoreStrokeStyle
} from './neonCorePass';
import { countPeakSparkCandidates } from './peakSparksPass';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { SpectrumSettings } from '../runtime/spectrumRuntime';
import {
	createSpectrumRuntimeState,
	createSpectrumScope
} from '../runtime/spectrumRuntime';
import { drawEchoTracePasses, updateEchoTraceHistory } from './echoTrace';

function fxSettings(
	overrides: Partial<SpectrumSettings> = {}
): SpectrumSettings {
	return { ...DEFAULT_STATE, ...overrides } as SpectrumSettings;
}

describe('spectrumFxBudget rgb split', () => {
	it('disabled = zero offset and alpha', () => {
		expect(resolveRgbSplitOffsetPx(false, 1, 1080, 'high', 128)).toBe(0);
		expect(resolveRgbSplitAlpha(0)).toBe(0);
	});

	it('amount zero = zero offset', () => {
		expect(resolveRgbSplitOffsetPx(true, 0, 1080, 'high', 128)).toBe(0);
	});

	it('max offset exceeds midpoint', () => {
		const mid = resolveRgbSplitOffsetPx(true, 0.5, 720, 'high', 128);
		const max = resolveRgbSplitOffsetPx(true, 1, 720, 'high', 128);
		expect(max).toBeGreaterThan(mid);
	});

	it('High >= Medium >= Low perf caps', () => {
		const low = resolveRgbSplitOffsetPx(true, 1, 1920, 'low', 64);
		const med = resolveRgbSplitOffsetPx(true, 1, 1920, 'medium', 64);
		const high = resolveRgbSplitOffsetPx(true, 1, 1920, 'high', 64);
		expect(high).toBeGreaterThanOrEqual(med);
		expect(med).toBeGreaterThanOrEqual(low);
	});

	it('density cap reduces offset at high bar count', () => {
		const sparse = resolveRgbSplitOffsetPx(true, 0.6, 500, 'high', 64);
		const dense = resolveRgbSplitOffsetPx(true, 0.6, 500, 'high', 256);
		expect(sparse).toBeGreaterThanOrEqual(dense);
		expect(sparse).toBeGreaterThan(0);
	});
});

describe('neon core', () => {
	it('zero intensity yields skip width when multiplied', () => {
		expect(resolveNeonCoreLineWidth(4, 0)).toBeGreaterThanOrEqual(1);
	});

	it('stroke style is stable hex/rgb string', () => {
		const s = resolveNeonCoreStrokeStyle(
			fxSettings({
				spectrumPrimaryColor: '#00ffff',
				spectrumSecondaryColor: '#ff00ff'
			}),
			1
		);
		expect(s).toMatch(/^rgb\(/);
		expect(
			resolveNeonCoreStrokeStyle(
				fxSettings({
					spectrumPrimaryColor: '#00ffff',
					spectrumSecondaryColor: '#ff00ff'
				}),
				1
			)
		).toBe(s);
	});
});

describe('gradient flow', () => {
	it('returns 0 when disabled', () => {
		expect(
			resolveGradientFlowPhase(
				fxSettings({ spectrumGradientFlow: false }),
				0.5,
				1 / 60,
				createSpectrumScope()
			)
		).toBe(0);
	});

	it('phase advances when enabled', () => {
		const settings = fxSettings({
			spectrumGradientFlow: true,
			spectrumGradientFlowSpeed: 0.8
		});
		const scope = createSpectrumScope();
		const a = resolveGradientFlowPhase(settings, 0, 1 / 60, scope);
		const b = resolveGradientFlowPhase(settings, 0, 1 / 60, scope);
		expect(b).not.toBe(a);
	});

	it('reverse direction moves opposite sign', () => {
		const fwd = fxSettings({
			spectrumGradientFlow: true,
			spectrumGradientFlowDirection: 'forward',
			spectrumGradientFlowSpeed: 1
		});
		const rev = fxSettings({
			spectrumGradientFlow: true,
			spectrumGradientFlowDirection: 'reverse',
			spectrumGradientFlowSpeed: 1
		});
		const fwdScope = createSpectrumScope();
		const f0 = resolveGradientFlowPhase(fwd, 0, 1 / 60, fwdScope);
		const f1 = resolveGradientFlowPhase(fwd, 0, 1 / 60, fwdScope);
		const revScope = createSpectrumScope();
		const r0 = resolveGradientFlowPhase(rev, 0, 1 / 60, revScope);
		const r1 = resolveGradientFlowPhase(rev, 0, 1 / 60, revScope);
		expect(f1 - f0).toBeGreaterThan(0);
		expect(r1 - r0).toBeLessThan(0);
	});

	it('speed zero still advances at base rate', () => {
		const settings = fxSettings({
			spectrumGradientFlow: true,
			spectrumGradientFlowSpeed: 0
		});
		const scope = createSpectrumScope();
		const a = resolveGradientFlowPhase(settings, 0, 1 / 60, scope);
		const b = resolveGradientFlowPhase(settings, 0, 1 / 60, scope);
		expect(b).not.toBe(a);
	});
});

describe('peak sparks', () => {
	it('selects peaks from synthetic data', () => {
		const heights = new Float32Array([10, 80, 20, 90, 15, 70, 12]);
		const count = countPeakSparkCandidates(
			heights,
			heights.length,
			fxSettings({
				spectrumPeakSparks: true,
				spectrumPeakSparksThreshold: 0.3,
				spectrumMaxHeight: 100,
				spectrumPeakSparksAmount: 4
			})
		);
		expect(count).toBeGreaterThan(0);
	});

	it('silence selects none', () => {
		const heights = new Float32Array(32).fill(5);
		const count = countPeakSparkCandidates(
			heights,
			heights.length,
			fxSettings({
				spectrumPeakSparks: true,
				spectrumPeakSparksThreshold: 0.5,
				spectrumMaxHeight: 100
			})
		);
		expect(count).toBe(0);
	});

	it('respects hard cap', () => {
		const heights = new Float32Array(32);
		for (let i = 1; i < 31; i++) {
			heights[i] = i % 2 === 0 ? 95 : 20;
		}
		const count = countPeakSparkCandidates(
			heights,
			heights.length,
			fxSettings({
				spectrumPeakSparks: true,
				spectrumPeakSparksThreshold: 0.2,
				spectrumMaxHeight: 100,
				spectrumPeakSparksAmount: 99
			})
		);
		expect(count).toBeLessThanOrEqual(resolvePeakSparkCount(99));
	});
});

describe('echo trace lifecycle', () => {
	it('disabled clears buffers', () => {
		const runtime = createSpectrumRuntimeState();
		runtime.echoTraceFrameCount = 2;
		runtime.echoTraceBuffers = [new Float32Array(8)];
		updateEchoTraceHistory(
			runtime,
			fxSettings({ spectrumEchoTrace: false }),
			new Float32Array(8),
			8
		);
		expect(runtime.echoTraceBuffers).toBeUndefined();
		expect(runtime.echoTraceFrameCount).toBe(0);
	});

	it('stores history after update', () => {
		const runtime = createSpectrumRuntimeState();
		const heights = new Float32Array([1, 2, 3, 4]);
		updateEchoTraceHistory(
			runtime,
			fxSettings({ spectrumEchoTrace: true, spectrumEchoTraceCount: 1 }),
			heights,
			4
		);
		expect(runtime.echoTraceFrameCount).toBe(1);
		expect(runtime.echoTraceBuffers?.[0][0]).toBe(1);
	});

	it('skips draw before first stored frame', () => {
		const runtime = createSpectrumRuntimeState();
		let drew = false;
		drawEchoTracePasses(runtime, {
			ctx: {} as CanvasRenderingContext2D,
			settings: fxSettings({ spectrumEchoTrace: true }),
			traceHeights: () => {
				drew = true;
			}
		});
		expect(drew).toBe(false);
	});
});

describe('curveRgbSplitAmount', () => {
	it('endpoints are 0 and 1', () => {
		expect(curveRgbSplitAmount(0)).toBe(0);
		expect(curveRgbSplitAmount(1)).toBe(1);
	});
});
