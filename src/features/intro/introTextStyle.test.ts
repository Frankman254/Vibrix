import { describe, expect, it } from 'vitest';
import {
	DEFAULT_BACKGROUND_PALETTE,
	getEditorThemePalette
} from '@/lib/backgroundPalette';
import { DEFAULT_STATE } from '@/store/defaultState';
import {
	introOwnTextStyle,
	resolveIntroTextStyle,
	type IntroTextStyleState
} from './introTextStyle';

const THEME = getEditorThemePalette('aurora');

function style(patch: Partial<IntroTextStyleState> = {}) {
	return resolveIntroTextStyle(
		'track-info',
		'display',
		{ ...DEFAULT_STATE, ...patch },
		DEFAULT_BACKGROUND_PALETTE,
		THEME
	);
}

describe('resolveIntroTextStyle', () => {
	it('keeps the line on its own style when it is not borrowing', () => {
		const own = resolveIntroTextStyle(
			'own',
			'display',
			DEFAULT_STATE,
			DEFAULT_BACKGROUND_PALETTE,
			THEME
		);
		expect(own).toEqual(introOwnTextStyle('display'));
		expect(own.font).toBe('display');
		expect(own.backdrop).toBeNull();
	});

	it("takes Track Info's font, uppercase and treatment", () => {
		const borrowed = style({
			audioTrackTitleFontStyle: 'techno',
			audioTrackTitleUppercase: true,
			nowPlayingTextTreatment: 'metallic'
		});
		expect(borrowed.font).toBe('techno');
		expect(borrowed.uppercase).toBe(true);
		expect(borrowed.treatment).toBe('metallic');
	});

	it('converts every pixel value into a share of the line size', () => {
		// The widget draws at 28px; the intro's title is several times bigger,
		// so a borrowed 14px of spacing has to arrive as half an em.
		const borrowed = style({
			audioTrackTitleFontSize: 28,
			audioTrackTitleLetterSpacing: 14,
			audioTrackTitleStrokeWidth: 2.8,
			audioTrackTitleGlowBlur: 14,
			audioTrackTitleBackdropPadding: 7
		});
		expect(borrowed.letterSpacingEm).toBeCloseTo(0.5);
		expect(borrowed.stroke?.widthEm).toBeCloseTo(0.1);
		expect(borrowed.glow?.blurEm).toBeCloseTo(0.5);
		expect(borrowed.backdrop?.paddingEm).toBeCloseTo(0.25);
	});

	it('drops the pieces Track Info has turned off', () => {
		const borrowed = style({
			audioTrackTitleStrokeWidth: 0,
			audioTrackTitleGlowBlur: 0,
			audioTrackTitleBackdropEnabled: false
		});
		expect(borrowed.stroke).toBeNull();
		expect(borrowed.glow).toBeNull();
		expect(borrowed.backdrop).toBeNull();
	});

	it('resolves the borrowed colours through the colour system', () => {
		const borrowed = style({
			audioTrackTitleGlowColorSource: 'theme',
			audioTrackTitleGlowColor: '#123456'
		});
		expect(borrowed.glow?.color).not.toBe('#123456');
		expect(borrowed.glow?.color).toMatch(/^#|rgb/);
	});
});
