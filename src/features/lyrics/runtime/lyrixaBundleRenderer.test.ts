import { describe, expect, it } from 'vitest';
import { DEFAULT_RAINBOW_PALETTE } from '@/lib/backgroundPalette';
import { drawLyrixaLyricsBundle } from './lyrixaBundleRenderer';
import type { LyrixaLyricsBundleEnvelope } from '@/features/lyrics/domain/lyrixaBundleTypes';
import type { LyrixaLayerOverrideMap } from '@/features/lyrics/domain/types';

type GradientRecord = { stops: Array<[number, string]> };
type FillCall = {
	text: string;
	style: unknown;
	filter: string;
	x: number;
	y: number;
};

/**
 * Records what the renderer paints with. Only the handful of 2D-context
 * members the lyric path touches are implemented.
 */
function createRecordingCtx() {
	const gradients: GradientRecord[] = [];
	const fills: FillCall[] = [];
	const strokes: Array<{ text: string; style: unknown; width: number }> = [];
	const ctx = {
		filter: 'none',
		shadowColor: '',
		shadowBlur: 0,
		globalAlpha: 1,
		font: '',
		textAlign: 'center' as CanvasTextAlign,
		textBaseline: 'middle' as CanvasTextBaseline,
		fillStyle: '' as unknown,
		strokeStyle: '' as unknown,
		lineWidth: 0,
		lineJoin: 'round' as CanvasLineJoin,
		save: () => {},
		restore: () => {},
		beginPath: () => {},
		closePath: () => {},
		moveTo: () => {},
		arcTo: () => {},
		fill: () => {},
		strokeText: (text: string) => {
			strokes.push({
				text,
				style: ctx.strokeStyle,
				width: ctx.lineWidth
			});
		},
		measureText: (text: string) => ({ width: text.length * 10 }),
		createLinearGradient: () => {
			const record: GradientRecord = { stops: [] };
			gradients.push(record);
			return {
				addColorStop: (offset: number, color: string) => {
					record.stops.push([offset, color]);
				},
				__record: record
			};
		},
		fillText: (text: string, x: number, y: number) => {
			fills.push({
				text,
				style: ctx.fillStyle,
				filter: ctx.filter,
				x,
				y
			});
		}
	};
	return {
		ctx: ctx as unknown as CanvasRenderingContext2D,
		raw: ctx,
		gradients,
		fills,
		strokes
	};
}

const CANVAS = { width: 1920, height: 1080 } as HTMLCanvasElement;

function createEnvelope(): LyrixaLyricsBundleEnvelope {
	return {
		schemaVersion: 1,
		app: 'Lyrixa',
		exportKind: 'lyrics-bundle',
		exportedAt: '2026-08-24T00:00:00.000Z',
		projectName: 'test',
		sourceTrack: null,
		project: {
			rawLyricsText: 'HELLO',
			normalizedLyrics: ['HELLO'],
			layers: [
				{
					id: 'layer-1',
					name: 'Main',
					layerType: 'lyrics',
					color: '#ffffff',
					visible: true,
					locked: false,
					order: 0
				}
			],
			clips: [
				{
					id: 'clip-1',
					text: 'HELLO',
					startTime: 0,
					endTime: 10,
					layerId: 'layer-1'
				}
			],
			styleConfig: {
				textColor: '#ffffff',
				glowColor: '#00ffff',
				glowIntensity: 1
			},
			animationConfig: {},
			fxConfig: {},
			progressIndicatorConfig: {}
		}
	} as unknown as LyrixaLyricsBundleEnvelope;
}

function render(overrides: LyrixaLayerOverrideMap) {
	const recorder = createRecordingCtx();
	drawLyrixaLyricsBundle(recorder.ctx, CANVAS, createEnvelope(), 1, {
		layerOverrides: overrides
	});
	return recorder;
}

describe('drawLyrixaLyricsBundle — active line color', () => {
	it('solid keeps painting a plain color string', () => {
		const { fills } = render({
			'layer-1': { textColor: '#ff0000', textColorMode: 'solid' }
		});
		expect(fills).toHaveLength(1);
		expect(fills[0]!.style).toBe('#ff0000');
	});

	it('a legacy override with no mode behaves as solid', () => {
		const { fills, gradients } = render({
			'layer-1': { textColor: '#ff0000' }
		});
		expect(fills[0]!.style).toBe('#ff0000');
		expect(gradients).toHaveLength(0);
	});

	it('gradient paints a two-stop gradient from both colors', () => {
		const { gradients } = render({
			'layer-1': {
				textColor: '#ff0000',
				textColorMode: 'gradient',
				textColorSecondary: '#0000ff'
			}
		});
		expect(gradients).toHaveLength(1);
		expect(gradients[0]!.stops).toEqual([
			[0, '#ff0000'],
			[1, '#0000ff']
		]);
	});

	it('an explicit solid color outranks a gradient baked into the bundle', () => {
		const recorder = createRecordingCtx();
		const envelope = createEnvelope();
		// Bundles can carry their own fill; the layer panel must still win.
		(
			envelope.project.styleConfig as unknown as {
				textFill: unknown;
			}
		).textFill = {
			type: 'gradient',
			gradient: { colorA: '#00ff00', colorB: '#ffff00', angle: 0 }
		};
		drawLyrixaLyricsBundle(recorder.ctx, CANVAS, envelope, 1, {
			layerOverrides: { 'layer-1': { textColor: '#030202' } }
		});
		expect(recorder.fills[0]!.style).toBe('#030202');
	});

	it('rainbow uses the shared Spectrum palette', () => {
		const { gradients } = render({
			'layer-1': { textColorMode: 'rainbow' }
		});
		expect(gradients[0]!.stops.map(([, color]) => color)).toEqual([
			...DEFAULT_RAINBOW_PALETTE
		]);
	});
});

describe('drawLyrixaLyricsBundle — glow color', () => {
	it('solid glow still goes through shadowColor and draws one pass', () => {
		const { fills, raw } = render({
			'layer-1': { glowColor: '#00ff00', glowColorMode: 'solid' }
		});
		expect(raw.shadowColor).toBe('#00ff00');
		expect(raw.shadowBlur).toBeGreaterThan(0);
		expect(fills).toHaveLength(1);
	});

	it('disables the shadow for a gradient glow and leaves the text solid', () => {
		// The halo itself is built on a scratch canvas (one shadowBlur pass,
		// then a source-in tint) and blitted, so it costs the main context a
		// single drawImage instead of five blurred full-canvas draws. Under
		// vitest there is no document, so only the main-context contract is
		// asserted here; the halo's appearance is verified in the browser.
		const { fills, raw } = render({
			'layer-1': {
				glowColor: '#ff0000',
				glowColorMode: 'gradient',
				glowColorSecondary: '#0000ff'
			}
		});
		// shadowColor cannot hold a gradient, so it must be turned off.
		expect(raw.shadowColor).toBe('transparent');
		expect(raw.shadowBlur).toBe(0);
		// Exactly one draw on the main context: the text.
		expect(fills).toHaveLength(1);
		expect(fills[0]!.style).toBe('#ffffff');
	});

	it('adds no extra full-canvas draws for a rainbow halo', () => {
		// The old implementation stacked five blurred fillText passes here,
		// every frame; the halo now costs one blit of a scratch canvas.
		const solid = render({ 'layer-1': { glowColorMode: 'solid' } });
		const rainbow = render({ 'layer-1': { glowColorMode: 'rainbow' } });
		expect(rainbow.fills).toHaveLength(solid.fills.length);
	});
});

describe('drawLyrixaLyricsBundle — stroke (border) color', () => {
	it('does not stroke at all when no width is configured', () => {
		const { strokes } = render({
			'layer-1': { strokeColorMode: 'rainbow' }
		});
		expect(strokes).toHaveLength(0);
	});

	it('a per-layer width enables the border and keeps solid as a string', () => {
		const { strokes } = render({
			'layer-1': { strokeWidth: 3, strokeColor: '#123456' }
		});
		expect(strokes).toHaveLength(1);
		expect(strokes[0]!.width).toBe(3);
		expect(strokes[0]!.style).toBe('#123456');
	});

	it('gradient border goes straight through strokeStyle (no extra pass)', () => {
		const { strokes, gradients } = render({
			'layer-1': {
				strokeWidth: 3,
				strokeColor: '#ff0000',
				strokeColorMode: 'gradient',
				strokeColorSecondary: '#0000ff'
			}
		});
		expect(strokes).toHaveLength(1);
		expect(gradients[0]!.stops).toEqual([
			[0, '#ff0000'],
			[1, '#0000ff']
		]);
	});
});

describe('drawLyrixaLyricsBundle — color sources', () => {
	const palettes = {
		background: {
			sourceUrl: 'blob:image',
			colors: ['#101010'],
			dominant: '#112233',
			secondary: '#445566',
			rainbow: ['#010101', '#020202'],
			accent: '#778899',
			backdrop: '#000000'
		},
		theme: {
			sourceUrl: 'theme',
			colors: ['#aa0000'],
			dominant: '#aa0000',
			secondary: '#00aa00',
			rainbow: ['#aa0000', '#00aa00'],
			accent: '#0000aa',
			backdrop: '#111111'
		}
	};

	it('an image-sourced solid fill takes the wallpaper dominant color', () => {
		const recorder = createRecordingCtx();
		drawLyrixaLyricsBundle(recorder.ctx, CANVAS, createEnvelope(), 1, {
			layerOverrides: {
				'layer-1': { textColorSource: 'image', textColor: '#ff0000' }
			},
			palettes
		});
		expect(recorder.fills[0]!.style).toBe('#112233');
	});

	it('a theme-sourced gradient fill uses the theme palette stops', () => {
		const recorder = createRecordingCtx();
		drawLyrixaLyricsBundle(recorder.ctx, CANVAS, createEnvelope(), 1, {
			layerOverrides: {
				'layer-1': {
					textColorSource: 'theme',
					textColorMode: 'gradient',
					textColor: '#ff0000'
				}
			},
			palettes
		});
		expect(recorder.gradients[0]!.stops).toEqual([
			[0, '#aa0000'],
			[1, '#00aa00']
		]);
	});
});

it('draws active lanes at block centers and applies manual offsets afterwards', () => {
	const envelope = createEnvelope();
	const baseLayer = envelope.project.layers[0]!;
	const baseClip = envelope.project.clips[0]!;
	envelope.project.layers = (
		['translation', 'primary', 'romanization'] as const
	).map((role, order) => ({ ...baseLayer, id: role, role, order }));
	envelope.project.clips = envelope.project.layers.map(layer => ({
		...baseClip,
		id: layer.id,
		layerId: layer.id,
		text: layer.id
	}));
	const recorder = createRecordingCtx();
	drawLyrixaLyricsBundle(recorder.ctx, CANVAS, envelope, 1, {
		layerOverrides: { primary: { positionOffsetY: 0.05 } }
	});
	expect(recorder.fills.map(({ text, x, y }) => ({ text, x, y }))).toEqual([
		{ text: 'translation', x: 960, y: 900 },
		{ text: 'primary', x: 960, y: 126 },
		{ text: 'romanization', x: 960, y: 540 }
	]);
});
