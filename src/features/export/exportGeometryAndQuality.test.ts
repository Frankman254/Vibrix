import { describe, expect, it, afterEach } from 'vitest';
import {
	MAX_EXPORT_DIMENSION,
	OFFLINE_EXPORT_QUALITY_PRESETS,
	qualityScaleFor,
	resolveExportDimensions
} from '@/features/export/offlineExportTypes';
import {
	beginExportViewport,
	endExportViewport,
	readExportViewport
} from '@/features/export/exportViewport';
import { recommendedVideoBitrateFor } from '@/features/export/video/offlineVideoFormat';

const screen = (width: number, height: number, devicePixelRatio = 1) => ({
	width,
	height,
	devicePixelRatio
});

describe('resolveExportDimensions', () => {
	it('takes the long side from the monitor, not from 16:9', () => {
		// A 34" ultrawide at 1440p is 3440 across, which is the file a
		// wallpaper on that monitor has to be.
		expect(resolveExportDimensions('1440p', screen(3440, 1440))).toEqual({
			width: 3440,
			height: 1440
		});
	});

	it('keeps the preset as the SHORT side on a portrait panel', () => {
		const { width, height } = resolveExportDimensions(
			'1080p',
			screen(1440, 2560)
		);
		expect(height).toBe(1080);
		expect(width).toBeLessThan(height);
	});

	it('scales the whole frame down rather than cropping it past the cap', () => {
		// 21:9 at 2160 asks for 5160 across, which no encoder here accepts.
		const { width, height } = resolveExportDimensions(
			'4k',
			screen(3440, 1440)
		);
		expect(width).toBeLessThanOrEqual(MAX_EXPORT_DIMENSION);
		expect(height).toBeLessThan(2160);
		expect(width / height).toBeCloseTo(3440 / 1440, 2);
	});

	it('both sides stay even, as H.264 chroma requires', () => {
		const { width, height } = resolveExportDimensions(
			'1440p',
			screen(1512, 982)
		);
		expect(width % 2).toBe(0);
		expect(height % 2).toBe(0);
	});

	it('falls back to the preset shape with no screen to read', () => {
		expect(resolveExportDimensions('1080p', null)).toEqual({
			width: 1920,
			height: 1080
		});
	});
});

describe('export quality', () => {
	it('original is the full quality table and the rungs below it are lower', () => {
		expect(qualityScaleFor('original')).toBe(1);
		expect(qualityScaleFor('medium')).toBeLessThan(1);
		expect(qualityScaleFor('low')).toBeLessThan(qualityScaleFor('medium'));
	});

	it('scales the bitrate without touching the geometry', () => {
		const size = { width: 3440, height: 1440, fps: 60 };
		const full = recommendedVideoBitrateFor(size);
		const medium = recommendedVideoBitrateFor({
			...size,
			qualityScale: qualityScaleFor('medium')
		});
		expect(medium).toBeLessThan(full);
		expect(medium / full).toBeCloseTo(qualityScaleFor('medium'), 2);
	});

	it('exposes exactly the three rungs the editor offers', () => {
		expect(OFFLINE_EXPORT_QUALITY_PRESETS.map(preset => preset.id)).toEqual(
			['low', 'medium', 'original']
		);
	});
});

describe('the export viewport', () => {
	afterEach(() => endExportViewport());

	it('holds the value it was given for the whole run', () => {
		beginExportViewport({ width: 1600, height: 1000 });
		expect(readExportViewport()).toEqual({ width: 1600, height: 1000 });
		// The window moving mid render must not reach the frame loop.
		expect(readExportViewport()).toEqual({ width: 1600, height: 1000 });
	});

	it('falls through to the live viewport outside a run', () => {
		beginExportViewport({ width: 1600, height: 1000 });
		endExportViewport();
		expect(readExportViewport()).not.toEqual({
			width: 1600,
			height: 1000
		});
	});
});
