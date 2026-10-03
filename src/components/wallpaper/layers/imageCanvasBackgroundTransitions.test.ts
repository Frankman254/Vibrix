import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { BackgroundImageSnapshot } from '@/features/background/imageLayerGeometry';
import { runBackgroundTransitionPass } from './imageCanvasBackgroundTransitions';
import type {
	BgDrawContext,
	BgTransitionCtx
} from './imageCanvasBackgroundRenderTypes';

/** Records the scene composite separately from offscreen image preparation. */
function recordingContext() {
	const drawn: unknown[] = [];
	const ctx = {
		drawn,
		filter: 'none',
		globalAlpha: 1,
		save() {},
		restore() {},
		beginPath() {},
		rect() {},
		clip() {},
		clearRect() {},
		fillRect() {},
		setTransform() {},
		createImageData(w: number, h: number) {
			return { data: new Uint8ClampedArray(w * h * 4) };
		},
		putImageData() {},
		translate() {},
		rotate() {},
		scale() {},
		drawImage(source: unknown) {
			drawn.push(source);
		}
	};
	return ctx as unknown as CanvasRenderingContext2D & { drawn: unknown[] };
}

const IMAGE = {
	naturalWidth: 1920,
	naturalHeight: 1080
} as unknown as HTMLImageElement;

const SNAPSHOT: BackgroundImageSnapshot = {
	scale: 1,
	positionX: 0,
	positionY: 0,
	fitMode: 'cover',
	keepCovered: true,
	focusX: 0.5,
	focusY: 0.5,
	mirror: false,
	mirrorFill: false,
	mirrorFillInvert: false,
	mirrorFillCount: 2,
	rotation: 0
};

let offscreens: Array<{ width: number; height: number }> = [];
const realDocument = (globalThis as Record<string, unknown>).document;

beforeEach(() => {
	offscreens = [];
	(globalThis as Record<string, unknown>).document = {
		createElement(tag: string) {
			if (tag !== 'canvas') throw new Error(`unexpected <${tag}>`);
			const canvas = { width: 0, height: 0, getContext: () => ctx };
			const ctx = recordingContext();
			Object.defineProperty(ctx, 'canvas', { value: canvas });
			offscreens.push(canvas);
			return canvas;
		}
	};
});

afterEach(() => {
	(globalThis as Record<string, unknown>).document = realDocument;
});

function pass(type: string) {
	const ctx = recordingContext();
	const dc: BgDrawContext = {
		ctx,
		canvasWidth: 1920,
		canvasHeight: 1080,
		layerOpacity: 1,
		baseFilter: 'brightness(1) blur(0px)',
		blur: 0,
		parallaxX: 0,
		parallaxY: 0,
		bassBoost: 0,
		layoutResponsiveEnabled: false,
		layoutBackgroundReframeEnabled: false,
		layoutReferenceWidth: 1920,
		layoutReferenceHeight: 1080
	};
	const tc: BgTransitionCtx = {
		...dc,
		transitionForce: 1,
		transitionForceNorm: 0.5,
		time: 1000
	};
	runBackgroundTransitionPass({
		dc,
		tc,
		type,
		easedProgress: 0.5,
		activeImage: IMAGE,
		activeSnapshot: SNAPSHOT,
		previousBackgroundImage: IMAGE,
		previousBackgroundParams: SNAPSHOT
	});
	const onScreen = ctx.drawn;
	return {
		imageDraws: onScreen.filter(source => source === IMAGE).length,
		tileBlits: onScreen.filter(source => source !== IMAGE).length
	};
}

describe('background transition integration', () => {
	it.each([
		'fade',
		'slide-left',
		'cross-zoom',
		'iris',
		'bars-horizontal',
		'blur-dissolve',
		'distortion',
		'rgb-shift'
	])('%s composites once onto the scene', type => {
		expect(pass(type)).toEqual({ imageDraws: 0, tileBlits: 1 });
	});
});
