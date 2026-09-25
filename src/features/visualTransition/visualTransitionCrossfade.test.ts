import { describe, expect, it } from 'vitest';
import {
	FREEZE_MAX_PIXELS,
	canFreezeFrame,
	crossfadeOpacities,
	shouldStartCrossfade,
	type CrossfadeGate
} from '@/features/visualTransition/visualTransitionCrossfade';

describe('canFreezeFrame', () => {
	it('accepts a normal full-screen backing store', () => {
		expect(canFreezeFrame(2560, 1440)).toBe(true);
	});

	it('rejects a canvas that has not been sized yet', () => {
		expect(canFreezeFrame(0, 0)).toBe(false);
		expect(canFreezeFrame(1920, 0)).toBe(false);
	});

	it('rejects negative or non-finite sizes', () => {
		expect(canFreezeFrame(-1920, 1080)).toBe(false);
		expect(canFreezeFrame(Number.NaN, 1080)).toBe(false);
		expect(canFreezeFrame(Number.POSITIVE_INFINITY, 1080)).toBe(false);
	});

	it('accepts exactly the cap and rejects one pixel more', () => {
		expect(canFreezeFrame(FREEZE_MAX_PIXELS, 1)).toBe(true);
		expect(canFreezeFrame(FREEZE_MAX_PIXELS + 1, 1)).toBe(false);
	});
});

describe('crossfadeOpacities', () => {
	it('starts with the old look fully visible and the new one hidden', () => {
		expect(crossfadeOpacities(0)).toEqual({ incoming: 0, outgoing: 1 });
	});

	it('ends with the new look fully visible', () => {
		expect(crossfadeOpacities(1)).toEqual({ incoming: 1, outgoing: 0 });
	});

	it('is complementary in between', () => {
		const mid = crossfadeOpacities(0.25);
		expect(mid.incoming + mid.outgoing).toBeCloseTo(1);
		expect(mid.incoming).toBeCloseTo(0.25);
	});

	it('clamps out-of-range and non-finite progress', () => {
		expect(crossfadeOpacities(-1)).toEqual({ incoming: 0, outgoing: 1 });
		expect(crossfadeOpacities(4)).toEqual({ incoming: 1, outgoing: 0 });
		expect(crossfadeOpacities(Number.NaN)).toEqual({
			incoming: 1,
			outgoing: 0
		});
	});
});

describe('shouldStartCrossfade', () => {
	const gate = (over: Partial<CrossfadeGate> = {}): CrossfadeGate => ({
		durationMs: 420,
		subsystems: ['looks'],
		fromImageId: 'img-a',
		toImageId: 'img-a',
		...over
	});

	it('starts when the transition touches one of the watched subsystems', () => {
		expect(shouldStartCrossfade(gate(), ['spectrum', 'looks'])).toBe(true);
	});

	it('does not start for a subsystem this layer does not draw', () => {
		expect(shouldStartCrossfade(gate(), ['spectrum'])).toBe(false);
	});

	it('does not start without a transition, a duration or a subsystem', () => {
		expect(shouldStartCrossfade(null, ['looks'])).toBe(false);
		expect(shouldStartCrossfade(gate({ durationMs: 0 }), ['looks'])).toBe(
			false
		);
		expect(shouldStartCrossfade(gate(), [])).toBe(false);
	});

	it('skips an image change for the layers that already animate it', () => {
		const imageChange = gate({ toImageId: 'img-b' });
		expect(
			shouldStartCrossfade(imageChange, ['looks'], {
				skipOnImageChange: true
			})
		).toBe(false);
		// The audio and scene layers have no engine of their own: they fade.
		expect(shouldStartCrossfade(imageChange, ['looks'])).toBe(true);
	});

	it('still fades a look change on the image layers', () => {
		expect(
			shouldStartCrossfade(gate(), ['looks', 'scene'], {
				skipOnImageChange: true
			})
		).toBe(true);
	});
});
