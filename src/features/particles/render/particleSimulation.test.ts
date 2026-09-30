import { describe, expect, it } from 'vitest';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import { DEFAULT_STATE } from '@/store/defaultState';
import {
	createParticleBuffers,
	createParticleRuntime,
	DEFAULT_PARTICLE_FIELD_BOUNDS,
	resolveParticleCount,
	resolveParticleFieldBounds,
	resolveParticleRotationPalette,
	resolveParticleVisibleHalfExtent,
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

describe('particle field bounds — the field Camera Motion moves', () => {
	const visible16x9 = resolveParticleVisibleHalfExtent(16 / 9, 0.02);

	it('never shrinks below the historical field', () => {
		// A project with no movement on a normal frame has to render exactly as
		// it did: same box, same wrap, same count.
		const bounds = resolveParticleFieldBounds(visible16x9, 0);
		expect(bounds).toEqual(DEFAULT_PARTICLE_FIELD_BOUNDS);
	});

	it('covers an ultrawide frame the historical box already fell short of', () => {
		// 3440x1080 is wider than the 2:1 box, so the field edge was on screen
		// standing still.
		const visible = resolveParticleVisibleHalfExtent(3440 / 1080, 0.02);
		expect(visible.halfWidth).toBeGreaterThan(
			DEFAULT_PARTICLE_FIELD_BOUNDS.halfWidth
		);
		const bounds = resolveParticleFieldBounds(visible, 0);
		expect(bounds.halfWidth).toBeCloseTo(visible.halfWidth, 5);
	});

	it('grows by the whole travel the movement can ask for', () => {
		const bounds = resolveParticleFieldBounds(visible16x9, 0.9);
		expect(bounds.halfWidth).toBeCloseTo(visible16x9.halfWidth + 0.9, 5);
		expect(bounds.halfHeight).toBeCloseTo(visible16x9.halfHeight + 0.9, 5);
		// The whole field, visible part included, has to be past the frame edge
		// by the travel or the empty edge still arrives.
		expect(bounds.halfHeight - visible16x9.halfHeight).toBeCloseTo(0.9, 5);
	});

	it('keeps the wrap outside the field, in the same proportion as before', () => {
		const bounds = resolveParticleFieldBounds(visible16x9, 1.5);
		expect(bounds.wrapX / bounds.halfWidth).toBeCloseTo(
			DEFAULT_PARTICLE_FIELD_BOUNDS.wrapX /
				DEFAULT_PARTICLE_FIELD_BOUNDS.halfWidth,
			5
		);
		expect(bounds.wrapY / bounds.halfHeight).toBeCloseTo(
			DEFAULT_PARTICLE_FIELD_BOUNDS.wrapY /
				DEFAULT_PARTICLE_FIELD_BOUNDS.halfHeight,
			5
		);
	});

	it('seeds more particles so a bigger field is not a thinner one', () => {
		const bounds = resolveParticleFieldBounds(visible16x9, 1);
		expect(bounds.countScale).toBeGreaterThan(1);
		const wide = createParticleBuffers(settings, colors, 0.02, bounds);
		const plain = createParticleBuffers(settings, colors, 0.02);
		expect(wide.count).toBe(Math.round(plain.count * bounds.countScale));
	});

	it('caps how many extra particles an enormous field may seed', () => {
		const bounds = resolveParticleFieldBounds(visible16x9, 40);
		expect(bounds.countScale).toBe(4);
	});

	it('seeds and wraps inside the enlarged field', () => {
		const bounds = resolveParticleFieldBounds(visible16x9, 2);
		const buffers = createParticleBuffers(settings, colors, 0.02, bounds);
		let maxX = 0;
		let maxY = 0;
		for (let i = 0; i < buffers.count; i++) {
			maxX = Math.max(maxX, Math.abs(buffers.positions[i * 3]));
			maxY = Math.max(maxY, Math.abs(buffers.positions[i * 3 + 1]));
		}
		expect(maxX).toBeLessThanOrEqual(bounds.halfWidth);
		expect(maxY).toBeLessThanOrEqual(bounds.halfHeight);
		// Past the historical box: the whole point of the enlarged field.
		expect(maxX).toBeGreaterThan(DEFAULT_PARTICLE_FIELD_BOUNDS.halfWidth);

		const runtime = createParticleRuntime();
		for (let frame = 0; frame < 240; frame++) {
			stepParticles(
				runtime,
				buffers,
				{ ...settings, particleSpeed: 5 },
				silence,
				1 / 60,
				null,
				bounds
			);
		}
		for (let i = 0; i < buffers.count; i++) {
			expect(Math.abs(buffers.positions[i * 3])).toBeLessThanOrEqual(
				bounds.wrapX + 1e-6
			);
			expect(Math.abs(buffers.positions[i * 3 + 1])).toBeLessThanOrEqual(
				bounds.wrapY + 1e-6
			);
		}
	});
});
