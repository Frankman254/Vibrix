import { describe, expect, it } from 'vitest';
import type { OverlayImageLayer } from '@/types/layers';
import {
	resolveOverlayAudioOpacity,
	resolveOverlayDrawPlan,
	resolveOverlaySizeFactor
} from './overlayImageDraw';

function overlay(
	overrides: Partial<OverlayImageLayer> = {}
): OverlayImageLayer {
	return {
		id: 'ov-1',
		type: 'overlay-image',
		kind: 'overlay',
		enabled: true,
		zIndex: 91,
		opacity: 1,
		positionX: 0,
		positionY: 0,
		scale: 1,
		rotation: 0,
		blendMode: 'normal',
		locked: false,
		draggable: true,
		assetId: 'asset',
		imageUrl: 'blob:overlay',
		name: 'Overlay',
		cropShape: 'rectangle',
		edgeFade: 0,
		edgeBlur: 0,
		edgeGlow: 0,
		width: 200,
		height: 100,
		audioOpacityReactive: false,
		audioOpacityAmount: 0,
		audioOpacityInvert: false,
		audioOpacityChannel: 'auto',
		...overrides
	};
}

const FILTERS = {
	filterTargets: [],
	selectedOverlayId: null,
	filterOpacity: 0.5,
	filterBrightness: 2,
	filterContrast: 1,
	filterSaturation: 1,
	filterBlur: 4,
	filterHueRotate: 90,
	layoutResponsiveEnabled: false
} as unknown as Parameters<typeof resolveOverlayDrawPlan>[1];

const AUDIO = {
	amplitude: 0.25,
	channels: { kick: 0.8 }
} as unknown as Parameters<typeof resolveOverlayAudioOpacity>[1];

const OUTPUT = { width: 1920, height: 1080 };

describe('resolveOverlaySizeFactor', () => {
	it('keeps CSS pixels when the layout is not responsive', () => {
		expect(
			resolveOverlaySizeFactor(
				{ layoutResponsiveEnabled: false },
				{ width: 1280, height: 720 },
				OUTPUT
			)
		).toBe(1);
	});

	it('scales by the short edge when the layout is responsive', () => {
		expect(
			resolveOverlaySizeFactor(
				{ layoutResponsiveEnabled: true },
				{ width: 1280, height: 720 },
				OUTPUT
			)
		).toBe(1.5);
	});
});

describe('resolveOverlayAudioOpacity', () => {
	it('is fully opaque when not audio reactive', () => {
		expect(resolveOverlayAudioOpacity(overlay(), AUDIO)).toBe(1);
	});

	it('follows the chosen channel, optionally inverted', () => {
		const reactive = overlay({
			audioOpacityReactive: true,
			audioOpacityAmount: 1,
			audioOpacityChannel: 'kick'
		});
		expect(resolveOverlayAudioOpacity(reactive, AUDIO)).toBeCloseTo(0.8);
		expect(
			resolveOverlayAudioOpacity(
				{ ...reactive, audioOpacityInvert: true },
				AUDIO
			)
		).toBeCloseTo(0.2);
	});
});

describe('resolveOverlayDrawPlan', () => {
	it('places the overlay like the CSS view (Y up, relative to the output)', () => {
		const plan = resolveOverlayDrawPlan(
			overlay({
				positionX: 0.25,
				positionY: 0.25,
				scale: 2,
				rotation: 90
			}),
			FILTERS,
			AUDIO,
			OUTPUT,
			1
		);
		expect(plan.centerX).toBe(1440);
		expect(plan.centerY).toBe(270);
		expect(plan.width).toBe(400);
		expect(plan.height).toBe(200);
		expect(plan.rotationRad).toBeCloseTo(Math.PI / 2);
	});

	it('applies the editor filters only to the targeted overlay', () => {
		const untargeted = resolveOverlayDrawPlan(
			overlay(),
			FILTERS,
			AUDIO,
			OUTPUT,
			1
		);
		expect(untargeted.opacity).toBe(1);
		expect(untargeted.filter).toContain('brightness(1)');

		const targeted = resolveOverlayDrawPlan(
			overlay(),
			{
				...FILTERS,
				filterTargets: ['selected-overlay'],
				selectedOverlayId: 'ov-1'
			} as typeof FILTERS,
			AUDIO,
			OUTPUT,
			1
		);
		expect(targeted.opacity).toBe(0.5);
		expect(targeted.filter).toContain('brightness(2)');
		expect(targeted.filter).toContain('blur(4px)');
	});

	it('scales pixel effects with the size factor and maps blend modes', () => {
		const plan = resolveOverlayDrawPlan(
			overlay({ edgeBlur: 2, blendMode: 'screen', cropShape: 'rounded' }),
			FILTERS,
			AUDIO,
			OUTPUT,
			2
		);
		expect(plan.filter).toContain('blur(4px)');
		expect(plan.cornerRadius).toBe(36);
		expect(plan.composite).toBe('screen');
	});

	it('never starts the edge fade before 48 %', () => {
		expect(
			resolveOverlayDrawPlan(
				overlay({ edgeFade: 1 }),
				FILTERS,
				AUDIO,
				OUTPUT,
				1
			).fadeStart
		).toBe(0.48);
		expect(
			resolveOverlayDrawPlan(overlay(), FILTERS, AUDIO, OUTPUT, 1)
				.fadeStart
		).toBe(1);
	});
});
