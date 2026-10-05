import { describe, expect, it } from 'vitest';
import {
	resolutionPresetForScreen,
	type ScreenMetrics
} from '@/features/export/offlineExportTypes';

function screen(
	width: number,
	height: number,
	devicePixelRatio = 1
): ScreenMetrics {
	return { width, height, devicePixelRatio };
}

describe('resolutionPresetForScreen', () => {
	it('matches the common desktop panels', () => {
		expect(resolutionPresetForScreen(screen(1280, 720))).toBe('720p');
		expect(resolutionPresetForScreen(screen(1920, 1080))).toBe('1080p');
		expect(resolutionPresetForScreen(screen(2560, 1440))).toBe('1440p');
		expect(resolutionPresetForScreen(screen(3840, 2160))).toBe('4k');
	});

	it('reads a Retina display at its real pixels, not its CSS ones', () => {
		// A 14" MacBook Pro reports 1512×982 CSS pixels at DPR 2.
		expect(resolutionPresetForScreen(screen(1512, 982, 2))).toBe('1440p');
		// A scaled Windows laptop: 1536×864 at 125%.
		expect(resolutionPresetForScreen(screen(1536, 864, 1.25))).toBe(
			'1080p'
		);
	});

	it('tolerates a panel a little short of the rung it really is', () => {
		// 1440p with the taskbar taken out is still a 1440p screen.
		expect(resolutionPresetForScreen(screen(2560, 1392))).toBe('1440p');
	});

	it('measures the short side, so an ultrawide is not read as 4K', () => {
		// 3440×1440 has 4K's width and 1440p's height. Every preset is 16:9.
		expect(resolutionPresetForScreen(screen(3440, 1440))).toBe('1440p');
	});

	it('measures the short side on a portrait panel too', () => {
		expect(resolutionPresetForScreen(screen(1440, 2560))).toBe('1440p');
	});

	it('never promises more than the top preset can encode', () => {
		expect(resolutionPresetForScreen(screen(7680, 4320))).toBe('4k');
	});

	it('falls back to the smallest rung on a tiny panel', () => {
		expect(resolutionPresetForScreen(screen(640, 480))).toBe('720p');
	});

	it('falls back to 1080p when there is no screen to read', () => {
		expect(resolutionPresetForScreen(null)).toBe('1080p');
	});

	it('treats a nonsense device pixel ratio as 1 instead of collapsing', () => {
		expect(resolutionPresetForScreen(screen(2560, 1440, 0))).toBe('1440p');
	});
});
