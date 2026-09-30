import { describe, expect, it } from 'vitest';
import {
	DEFAULT_BACKGROUND_PALETTE,
	getEditorThemePalette
} from '@/lib/backgroundPalette';
import type { IntroSequenceSettings } from '@/types/wallpaper';
import { createDefaultIntroSequence } from './introPlan';
import { resolveIntroColors, resolveIntroFocusMap } from './introColors';

const IMAGE_PALETTE = {
	...DEFAULT_BACKGROUND_PALETTE,
	sourceUrl: 'blob:first',
	dominant: '#112233',
	secondary: '#445566',
	backdrop: '#010203',
	rainbow: ['#ff0000', '#00ff00', '#0000ff']
};
const THEME_PALETTE = getEditorThemePalette('aurora');

function colors(patch: Partial<IntroSequenceSettings>) {
	return resolveIntroColors(
		{ ...createDefaultIntroSequence('intro'), ...patch },
		IMAGE_PALETTE,
		THEME_PALETTE
	);
}

describe('resolveIntroColors — fills', () => {
	it('uses the role colour for a solid backdrop from the image', () => {
		// `solid` goes through the role-aware resolver, so the backdrop gets the
		// palette's dark backdrop colour instead of its dominant one.
		expect(colors({ backdropColorSource: 'image' }).backdrop).toEqual({
			mode: 'solid',
			primary: '#010203',
			secondary: '#445566',
			rainbow: ['#ff0000', '#00ff00', '#0000ff']
		});
	});

	it('takes both gradient stops from the source', () => {
		const fill = colors({
			backdropColorSource: 'image',
			backdropFillMode: 'gradient'
		}).backdrop;
		expect(fill.mode).toBe('gradient');
		expect(fill.primary).toBe('#112233');
		expect(fill.secondary).toBe('#445566');
	});

	it('keeps the manual colours when the source is manual', () => {
		const fill = colors({
			backdropColorSource: 'manual',
			backdropColor: '#0a0a0a',
			backdropColorSecondary: '#ff00aa',
			backdropFillMode: 'gradient'
		}).backdrop;
		expect(fill.primary).toBe('#0a0a0a');
		expect(fill.secondary).toBe('#ff00aa');
	});

	it("gives the title frame its own colour, not the title's", () => {
		const resolved = colors({
			titleColor: '#ffffff',
			titleFrameColor: '#ff3ea5'
		});
		expect(resolved.title).toBe('#ffffff');
		expect(resolved.titleFrame.primary).toBe('#ff3ea5');
	});

	it('hands the rainbow palette down for a rainbow fill', () => {
		const fill = colors({
			backdropColorSource: 'image',
			backdropFillMode: 'rainbow'
		}).backdrop;
		expect(fill.rainbow).toEqual(['#ff0000', '#00ff00', '#0000ff']);
	});
});

describe('resolveIntroFocusMap', () => {
	const image = (
		assetId: string,
		patch: Partial<{
			faceFocusX: number | null;
			faceFocusY: number | null;
			focusX: number | null;
			focusY: number | null;
		}> = {}
	) => ({
		assetId,
		faceFocusX: null,
		faceFocusY: null,
		focusX: null,
		focusY: null,
		...patch
	});

	it('prefers the face annotation', () => {
		const map = resolveIntroFocusMap(
			[
				image('a', {
					faceFocusX: 0.3,
					faceFocusY: 0.2,
					focusX: 0.9,
					focusY: 0.9
				})
			],
			['a']
		);
		expect(map.get(0)).toEqual({ x: 0.3, y: 0.2 });
	});

	it('falls back to the framing focus the user placed by hand', () => {
		const map = resolveIntroFocusMap(
			[image('a', { focusX: 0.75, focusY: 0.25 })],
			['a']
		);
		expect(map.get(0)).toEqual({ x: 0.75, y: 0.25 });
	});

	it('leaves an image with neither point out, so the painter centres it', () => {
		const map = resolveIntroFocusMap([image('a')], ['a']);
		expect(map.has(0)).toBe(false);
	});

	it('keys by card position, not by pool position', () => {
		const map = resolveIntroFocusMap(
			[image('a'), image('b', { faceFocusX: 0.1, faceFocusY: 0.9 })],
			['b', 'a']
		);
		expect(map.get(0)).toEqual({ x: 0.1, y: 0.9 });
		expect(map.has(1)).toBe(false);
	});
});
