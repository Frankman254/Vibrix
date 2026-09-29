import { describe, expect, it } from 'vitest';
import { resolveWindowLogoPlacement } from './introSpectrumDraw';

describe('resolveWindowLogoPlacement', () => {
	it('turns the canvas point into the renderer’s −1..1 frame, Y up', () => {
		const placement = resolveWindowLogoPlacement(
			{ x: 480, y: 135, sizePx: 90 },
			1920,
			1080
		);
		expect(placement).not.toBeNull();
		expect(placement?.logoPositionX).toBeCloseTo(-0.5, 5);
		expect(placement?.logoPositionY).toBeCloseTo(0.75, 5);
		expect(placement?.logoBaseSize).toBe(90);
		expect(placement?.logoMinScale).toBe(1);
		expect(placement?.spectrumFollowLogo).toBe(true);
	});

	it('is the centre of the canvas for a centred logo', () => {
		const placement = resolveWindowLogoPlacement(
			{ x: 960, y: 540, sizePx: 120 },
			1920,
			1080
		);
		expect(placement?.logoPositionX).toBeCloseTo(0, 5);
		expect(placement?.logoPositionY).toBeCloseTo(0, 5);
	});

	it('is null when the window draws no logo, or the canvas has no size', () => {
		// The caller reads this as "stop following": the wallpaper's own logo
		// position is not in this window and must never be inherited.
		expect(resolveWindowLogoPlacement(null, 1920, 1080)).toBeNull();
		expect(
			resolveWindowLogoPlacement({ x: 10, y: 10, sizePx: 10 }, 0, 0)
		).toBeNull();
	});
});
