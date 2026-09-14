import { describe, expect, it } from 'vitest';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import { DEFAULT_STATE } from '@/store/defaultState';
import {
	createParticleBuffers,
	createParticleRuntime,
	resolveParticleCount,
	resolveParticleRotationPalette,
	stepParticles
} from './particleSimulation';

const colors = {
	primaryColor: '#ff0000',
	secondaryColor: '#0000ff',
	rainbowColors: ['#ff0000', '#00ff00', '#0000ff']
};

const silence = {
	bins: new Uint8Array(8),
	amplitude: 0,
	peak: 0,
	channels: {
		kick: 0,
		bass: 0,
		instrumental: 0,
		full: 0
	} as unknown as AudioSnapshot['channels'],
	timestampMs: 0
} as AudioSnapshot;

const settings = {
	...DEFAULT_STATE,
	particleCount: 50,
	performanceMode: 'high' as const,
	particleColorMode: 'solid' as const,
	particleColorSource: 'manual' as const
};

describe('particle simulation', () => {
	it('caps the count by performance mode', () => {
		expect(
			resolveParticleCount({
				particleCount: 10_000,
				performanceMode: 'low'
			})
		).toBeLessThan(10_000);
	});

	it('seeds buffers at the layer depth with valid sizes', () => {
		const buffers = createParticleBuffers(
			{ ...settings, particleSizeMin: 9, particleSizeMax: 3 },
			colors,
			0.5
		);
		expect(buffers.count).toBe(50);
		for (let i = 0; i < buffers.count; i++) {
			expect(buffers.positions[i * 3 + 2]).toBe(0.5);
			expect(buffers.sizes[i]).toBeGreaterThanOrEqual(3);
			expect(buffers.sizes[i]).toBeLessThanOrEqual(9);
			expect(buffers.colors[i * 3]).toBe(1);
		}
	});

	it('advances time, scales opacity by the Looks filter and moves particles', () => {
		const buffers = createParticleBuffers(settings, colors, 0.02);
		const before = buffers.positions.slice();
		const runtime = createParticleRuntime();
		const result = stepParticles(
			runtime,
			buffers,
			{
				...settings,
				particleSpeed: 1,
				particleOpacity: 0.8,
				filterTargets: ['particles'],
				filterOpacity: 0.5
			},
			silence,
			1 / 30,
			null
		);
		expect(result.uniforms.uTime).toBeCloseTo(1 / 30, 6);
		expect(result.uniforms.uOpacity).toBeCloseTo(0.4, 6);
		expect(result.positionsChanged).toBe(true);
		expect(buffers.positions).not.toEqual(before);
	});

	it('rotates palette colours on the CPU only for non-manual sources', () => {
		expect(
			resolveParticleRotationPalette(
				{
					particleColorMode: 'rotateRgb',
					particleColorSource: 'manual'
				},
				colors
			)
		).toBeNull();
		expect(
			resolveParticleRotationPalette(
				{
					particleColorMode: 'rotateRgb',
					particleColorSource: 'theme'
				},
				colors
			)
		).toHaveLength(3);
	});
});
