import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { BackgroundImageSnapshot } from '@/features/background/imageLayerGeometry';
import { runBackgroundTransitionPass } from './imageCanvasBackgroundTransitions';
import type {
	BgDrawContext,
	BgTransitionCtx
} from './imageCanvasBackgroundRenderTypes';

/**
 * A 2D context that only remembers what it was asked to draw.
 *
 * The point of these tests is the *number and kind* of draws: the tiled
 * transitions used to redraw the whole image inside every tile, which is the
 * lag the user reported, and nothing was watching for a regression.
 */
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
		setTransform() {},
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
		previousBackgroundParams: SNAPSHOT,
		colorFilter: 'none'
	});
	const onScreen = ctx.drawn;
	return {
		imageDraws: onScreen.filter(source => source === IMAGE).length,
		tileBlits: onScreen.filter(source => source !== IMAGE).length
	};
}

describe('tiled background transitions', () => {
	it('composes Dissolve once and copies the tiles', () => {
		const { imageDraws, tileBlits } = pass('blur-dissolve');
		// One draw for the outgoing image; the incoming one is composed into
		// the offscreen canvas, never onto the visible canvas.
		expect(imageDraws).toBe(1);
		// Every tile already revealed at 50 % is a copy, not a full-image
		// redraw: dozens of them, and not one of them touches IMAGE.
		expect(tileBlits).toBeGreaterThan(50);
	});

	it('copies the tiles for bars and distortion too', () => {
		for (const type of ['bars-horizontal', 'bars-vertical', 'distortion']) {
			const { imageDraws, tileBlits } = pass(type);
			expect(imageDraws, type).toBe(1);
			expect(tileBlits, type).toBeGreaterThan(5);
		}
	});

	it('still draws both images for the plain crossfade', () => {
		expect(pass('fade')).toEqual({ imageDraws: 2, tileBlits: 0 });
	});
});
