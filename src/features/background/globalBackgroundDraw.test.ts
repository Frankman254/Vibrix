import { describe, expect, it } from 'vitest';
import {
	hasAnimatedGlobalBackgroundFilter,
	resolveGlobalBackgroundDrawPlan,
	type GlobalBackgroundDrawSettings
} from './globalBackgroundDraw';

function settings(
	overrides: Partial<GlobalBackgroundDrawSettings> = {}
): GlobalBackgroundDrawSettings {
	return {
		globalBackgroundFitMode: 'cover',
		globalBackgroundScale: 1,
		globalBackgroundPositionX: 0,
		globalBackgroundPositionY: 0,
		globalBackgroundOpacity: 1,
		globalBackgroundBrightness: 1,
		globalBackgroundContrast: 1,
		globalBackgroundSaturation: 1,
		globalBackgroundBlur: 0,
		globalBackgroundHueRotate: 0,
		layoutResponsiveEnabled: false,
		layoutBackgroundReframeEnabled: false,
		layoutReferenceWidth: 1920,
		layoutReferenceHeight: 1080,
		// One active effect layer, the shape every migrated project has: its
		// live targets are `filterTargets`, so overrides below still drive it.
		effectLayers: [
			{
				id: 'effect-layer-1',
				name: '',
				enabled: true,
				targets: [],
				lookId: null,
				settings: {}
			}
		],
		activeEffectLayerId: 'effect-layer-1',
		filterTargets: [],
		filterBrightness: 2,
		filterContrast: 1,
		filterSaturation: 1,
		filterBlur: 20,
		filterHueRotate: 0,
		filterOpacity: 0.5,
		filterVignette: 0,
		filterBloom: 0,
		filterLumaThreshold: 0,
		rgbShift: 0,
		noiseIntensity: 0,
		scanlineMode: 'always',
		scanlinesEnabled: false,
		scanlineIntensity: 0.5,
		scanlineSpacing: 3,
		scanlineThickness: 1,
		...overrides
	} as GlobalBackgroundDrawSettings;
}

const CANVAS = { width: 1920, height: 1080 };
const SQUARE_IMAGE = { width: 1000, height: 1000 };

describe('resolveGlobalBackgroundDrawPlan', () => {
	it('covers the canvas and centres the image by default', () => {
		const plan = resolveGlobalBackgroundDrawPlan(
			settings(),
			CANVAS,
			SQUARE_IMAGE
		);
		expect(plan.cx).toBe(960);
		expect(plan.cy).toBe(540);
		expect(plan.width).toBe(1920);
		expect(plan.height).toBe(1920);
		expect(plan.filterActive).toBe(false);
	});

	it('moves by half the canvas per unit, with Y up', () => {
		const plan = resolveGlobalBackgroundDrawPlan(
			settings({
				globalBackgroundPositionX: 0.5,
				globalBackgroundPositionY: 0.5,
				globalBackgroundScale: 2
			}),
			CANVAS,
			SQUARE_IMAGE
		);
		expect(plan.cx).toBe(1440);
		expect(plan.cy).toBe(270);
		expect(plan.width).toBe(3840);
	});

	it('stacks the editor filters only when they target the global background', () => {
		const untargeted = resolveGlobalBackgroundDrawPlan(
			settings({ globalBackgroundBlur: 12 }),
			CANVAS,
			SQUARE_IMAGE
		);
		expect(untargeted.opacity).toBe(1);
		expect(untargeted.filter).toContain('brightness(1)');
		expect(untargeted.filter).toContain('blur(12px)');

		const targeted = resolveGlobalBackgroundDrawPlan(
			settings({
				globalBackgroundBlur: 12,
				filterTargets: ['global-background']
			}),
			CANVAS,
			SQUARE_IMAGE
		);
		expect(targeted.opacity).toBe(0.5);
		expect(targeted.filter).toContain('brightness(2)');
		// 12 + 20 is capped.
		expect(targeted.filter).toContain('blur(28px)');
	});
});

describe('hasAnimatedGlobalBackgroundFilter', () => {
	it('ignores scanlines that are switched off', () => {
		const targeted = {
			filterTargets: ['global-background']
		} as Partial<GlobalBackgroundDrawSettings>;
		expect(hasAnimatedGlobalBackgroundFilter(settings(targeted))).toBe(
			false
		);
		expect(
			hasAnimatedGlobalBackgroundFilter(
				settings({ ...targeted, scanlinesEnabled: true })
			)
		).toBe(true);
		expect(
			hasAnimatedGlobalBackgroundFilter(
				settings({ scanlinesEnabled: true })
			)
		).toBe(false);
	});
});
