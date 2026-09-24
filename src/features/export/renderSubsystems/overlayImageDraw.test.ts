import { describe, expect, it } from 'vitest';
import {
	createAudioChannelSelectionState,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';
import { createAudioEnvelope } from '@/utils/audioEnvelope';
import type { OverlayImageLayer } from '@/types/layers';
import {
	resolveOverlayAdvancedEffects,
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

/** The stack an effect layer hands over once it targets this overlay. */
const LOOK = {
	filterOpacity: 0.5,
	filterBrightness: 2,
	filterContrast: 1,
	filterSaturation: 1,
	filterBlur: 4,
	filterHueRotate: 90
} as unknown as NonNullable<Parameters<typeof resolveOverlayDrawPlan>[1]>;

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
			null,
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
			null,
			AUDIO,
			OUTPUT,
			1
		);
		expect(untargeted.opacity).toBe(1);
		expect(untargeted.filter).toContain('brightness(1)');

		const targeted = resolveOverlayDrawPlan(
			overlay(),
			LOOK,
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
			null,
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
				null,
				AUDIO,
				OUTPUT,
				1
			).fadeStart
		).toBe(0.48);
		expect(
			resolveOverlayDrawPlan(overlay(), null, AUDIO, OUTPUT, 1).fadeStart
		).toBe(1);
	});
});

const LOOKS = {
	rgbShift: 0.02,
	scanlinesEnabled: false,
	scanlineIntensity: 0,
	scanlineMode: 'static',
	scanlineSpacing: 4,
	scanlineThickness: 1,
	noiseIntensity: 0,
	filterOpacity: 0.6,
	rgbShiftAudioReactive: false,
	rgbShiftAudioSensitivity: 1,
	rgbShiftAudioChannel: 'kick',
	rgbShiftAudioSmoothing: 0.5,
	rgbShiftAudioAttack: 0.1,
	rgbShiftAudioRelease: 0.3,
	rgbShiftAudioReactivitySpeed: 1,
	rgbShiftAudioPeakWindow: 0.5,
	rgbShiftAudioPeakFloor: 0.05,
	rgbShiftAudioPunch: 0.4
} as unknown as NonNullable<
	Parameters<typeof resolveOverlayAdvancedEffects>[0]['look']
>;

const CHANNEL_STATE = {
	audioAutoKickThreshold: 0.5,
	audioAutoSwitchHoldMs: 500
} as Parameters<typeof resolveOverlayAdvancedEffects>[0]['state'];

const LOOKS_AUDIO = {
	amplitude: 0.25,
	channels: { kick: 0.8 },
	timestampMs: 1000
} as unknown as AudioSnapshot;

function advanced(
	overrides: Partial<Parameters<typeof resolveOverlayAdvancedEffects>[0]> = {}
) {
	return resolveOverlayAdvancedEffects({
		layerOpacity: 1,
		look: LOOKS,
		state: CHANNEL_STATE,
		audio: LOOKS_AUDIO,
		channelSelection: createAudioChannelSelectionState(),
		envelope: createAudioEnvelope(),
		dt: 1 / 60,
		timeMs: 1000,
		output: OUTPUT,
		sizeFactor: 1,
		...overrides
	});
}

describe('resolveOverlayAdvancedEffects', () => {
	it('is off for untargeted overlays (gate mirrors the live view)', () => {
		expect(advanced({ look: null })).toBeNull();
	});

	it('is off when every advanced effect is zero', () => {
		expect(advanced({ look: { ...LOOKS, rgbShift: 0 } })).toBeNull();
	});

	it('needs scanlines enabled *and* intense to count as active', () => {
		expect(
			advanced({
				look: {
					...LOOKS,
					rgbShift: 0,
					scanlinesEnabled: true,
					scanlineIntensity: 0
				}
			})
		).toBeNull();
		expect(
			advanced({
				look: {
					...LOOKS,
					rgbShift: 0,
					scanlinesEnabled: true,
					scanlineIntensity: 0.5
				}
			})
		).not.toBeNull();
	});

	it('computes rgbShiftPixels at 0.65 of the short edge, clamped at 36', () => {
		const fx = advanced();
		expect(fx?.rgbShiftPixels).toBeCloseTo(0.02 * 1080 * 0.65, 5);
		const low = advanced({ look: { ...LOOKS, rgbShift: 2 } });
		expect(low?.rgbShiftPixels).toBe(36);
	});

	it('scales one clamped shift per output size factor', () => {
		const half = advanced({
			look: { ...LOOKS, rgbShift: 2 },
			sizeFactor: 2
		});
		expect(half?.rgbShiftPixels).toBe(72);
	});

	it('keeps an unclamped shift proportional, not double-scaled', () => {
		// Same live canvas (output and sizeFactor double together): the shift
		// must double once, never four times via the offline short edge.
		const one = advanced()!.rgbShiftPixels;
		const two = advanced({
			output: { width: 3840, height: 2160 },
			sizeFactor: 2
		})!.rgbShiftPixels;
		expect(two).toBeCloseTo(one * 2, 5);
	});

	it('lets the audio envelope push the shift past the base state', () => {
		const base = advanced()!.rgbShiftPixels;
		const reactive = advanced({
			look: { ...LOOKS, rgbShiftAudioReactive: true }
		})!;
		expect(reactive.rgbShiftPixels).toBeGreaterThan(base);
	});

	it('bakes the pass alpha from layer opacity and filter opacity', () => {
		expect(advanced()?.passAlpha).toBeCloseTo(0.6, 5);
		expect(advanced({ layerOpacity: 0.5 })?.passAlpha).toBeCloseTo(0.3, 5);
	});

	it('keeps scanline spacing raw and scales thickness', () => {
		const fx = advanced({
			look: {
				...LOOKS,
				rgbShift: 0,
				scanlinesEnabled: true,
				scanlineIntensity: 0.5
			},
			sizeFactor: 2
		});
		expect(fx?.scanlineSpacing).toBe(4);
		expect(fx?.scanlineThickness).toBe(2);
	});
});
