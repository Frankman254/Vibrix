import { describe, expect, it } from 'vitest';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import { DEFAULT_STATE } from '@/store/defaultState';
import {
	createFlashLightRuntime,
	createStageLightsRuntime,
	drawStageLights,
	stepFlashLight,
	stepStageLights
} from './render';

function audio(level: number): AudioSnapshot {
	return {
		bins: new Uint8Array(8).fill(Math.round(level * 255)),
		amplitude: level,
		peak: level,
		channels: {} as AudioSnapshot['channels'],
		timestampMs: 0
	};
}

const reactiveLights = {
	...DEFAULT_STATE,
	stageLightsAudioReactive: true,
	stageLightsAudioChannel: 'full' as const,
	stageLightsBandThresholds: { kick: 0.2, bass: 0.2, full: 0.2 },
	stageLightsPeakThreshold: 0.2,
	stageLightsAudioAmount: 1,
	stageLightsAudioHoldMs: 100,
	stageLightsAudioDecay: 0.5,
	stageLightsFixedMotion: false
};

describe('stepStageLights', () => {
	it('holds the peak, then decays and stops the sweep at silence', () => {
		const runtime = createStageLightsRuntime();
		const peak = stepStageLights(
			runtime,
			reactiveLights,
			audio(1),
			0,
			1 / 30
		);
		expect(peak).toBe(1);
		expect(runtime.time).toBeGreaterThan(0);

		expect(
			stepStageLights(runtime, reactiveLights, audio(0), 50, 1 / 30)
		).toBe(1);
		const decayed = stepStageLights(
			runtime,
			reactiveLights,
			audio(0),
			200,
			1 / 30
		);
		expect(decayed).toBeCloseTo(0.25, 5);

		for (let i = 0; i < 30; i++) {
			stepStageLights(runtime, reactiveLights, audio(0), 300 + i, 1 / 30);
		}
		const frozen = runtime.time;
		expect(
			stepStageLights(runtime, reactiveLights, audio(0), 400, 1 / 30)
		).toBe(0);
		expect(runtime.time).toBe(frozen);
	});

	it('freezes the sweep, not the envelope, while motion is paused', () => {
		const runtime = createStageLightsRuntime();
		expect(
			stepStageLights(runtime, reactiveLights, audio(1), 0, 1 / 30, true)
		).toBe(1);
		expect(runtime.time).toBe(0);
	});

	it('draws nothing when the beams would be invisible', () => {
		const runtime = createStageLightsRuntime();
		const gated = { ...reactiveLights, stageLightsAudioGateEnabled: true };
		const ctx = {} as CanvasRenderingContext2D;
		expect(
			drawStageLights(ctx, 100, 100, gated, runtime, 0, {
				background: {} as never,
				theme: {} as never
			})
		).toEqual({ drawn: false, beamCount: 0, passes: 0 });
	});
});

const flash = {
	...DEFAULT_STATE,
	flashLightAudioChannel: 'full' as const,
	flashLightBandThresholds: { kick: 0.5, bass: 0.5, full: 0.5 },
	flashLightThreshold: 0.5,
	flashLightSensitivity: 1,
	flashLightIntensity: 1,
	flashLightRetriggerMs: 200,
	flashLightDecay: 2
};

describe('stepFlashLight', () => {
	it('fires on a rising peak and decays linearly', () => {
		const runtime = createFlashLightRuntime();
		stepFlashLight(runtime, flash, audio(0.2), 0, 0);
		expect(runtime.drive).toBe(0);

		const drive = stepFlashLight(runtime, flash, audio(1), 33, 0);
		expect(drive).toBeGreaterThan(0);
		expect(runtime.lastTriggerMs).toBe(33);

		const after = stepFlashLight(runtime, flash, audio(0.2), 66, 0.1);
		expect(after).toBeCloseTo(drive - 0.2, 5);
	});

	it('does not retrigger inside the retrigger window', () => {
		const runtime = createFlashLightRuntime();
		stepFlashLight(runtime, flash, audio(1), 0, 0);
		stepFlashLight(runtime, flash, audio(0.2), 50, 0);
		stepFlashLight(runtime, flash, audio(1), 100, 0);
		expect(runtime.lastTriggerMs).toBe(0);
		stepFlashLight(runtime, flash, audio(0.2), 150, 0);
		stepFlashLight(runtime, flash, audio(1), 250, 0);
		expect(runtime.lastTriggerMs).toBe(250);
	});

	it('lets a hit climb to its peak inside the retrigger window', () => {
		const runtime = createFlashLightRuntime();
		stepFlashLight(runtime, flash, audio(0.2), 0, 0);
		// Crosses the threshold barely: a near-zero flash.
		const crossing = stepFlashLight(runtime, flash, audio(0.52), 33, 0);
		expect(crossing).toBeCloseTo(0.04, 5);
		const peak = stepFlashLight(runtime, flash, audio(0.9), 66, 0);
		expect(peak).toBeCloseTo(0.8, 5);
		expect(runtime.lastTriggerMs).toBe(33);
	});

	it('ignores a snapshot with no analysed bins', () => {
		const runtime = createFlashLightRuntime();
		const empty = { ...audio(1), bins: new Uint8Array(0) };
		expect(stepFlashLight(runtime, flash, empty, 0, 0)).toBe(0);
	});
});
