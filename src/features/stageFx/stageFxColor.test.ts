import { describe, expect, it } from 'vitest';
import {
	DEFAULT_BACKGROUND_PALETTE,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import { resolveStageFxPalette, sampleStageFxColor } from './stageFxColor';

const theme: BackgroundPalette = {
	...DEFAULT_BACKGROUND_PALETTE,
	sourceUrl: 'theme:test',
	dominant: '#112233',
	secondary: '#445566',
	rainbow: ['#ff0000', '#00ff00', '#0000ff']
};
const image: BackgroundPalette = {
	...DEFAULT_BACKGROUND_PALETTE,
	sourceUrl: 'image:test',
	dominant: '#abcdef',
	secondary: '#fedcba',
	rainbow: ['#110000', '#001100', '#000011']
};
const palettes = { theme, background: image };

const manual = {
	colorSource: 'manual' as const,
	colorMode: 'solid' as const,
	primaryColor: '#123456',
	secondaryColor: '#654321',
	rainbowColors: ['#ff0000', '#00ff00', '#0000ff']
};

describe('Stage FX color system', () => {
	it('resolves theme, image and manual palettes without mixing sources', () => {
		expect(resolveStageFxPalette(manual, palettes).primaryColor).toBe(
			'#123456'
		);
		expect(
			resolveStageFxPalette({ ...manual, colorSource: 'theme' }, palettes)
				.primaryColor
		).toBe('#112233');
		expect(
			resolveStageFxPalette({ ...manual, colorSource: 'image' }, palettes)
				.primaryColor
		).toBe('#abcdef');
	});

	it('supports solid, gradient and palette modes', () => {
		expect(sampleStageFxColor(manual, palettes, 0.75, 0)).toBe('#123456');
		expect(
			sampleStageFxColor(
				{ ...manual, colorMode: 'gradient' },
				palettes,
				0.25,
				0
			)
		).not.toBe('#123456');
		expect(
			sampleStageFxColor(
				{ ...manual, colorMode: 'rainbow' },
				palettes,
				1,
				0
			)
		).toBe('#0000ff');
	});

	it('adds black and white to Complete RGB', () => {
		const complete = { ...manual, colorMode: 'complete-rotate' as const };
		expect(sampleStageFxColor(complete, palettes, 0, 0.8)).toBe('#333333');
	});
});
