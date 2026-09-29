import { describe, expect, it } from 'vitest';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { WallpaperState } from '@/types/wallpaper';
import { createCameraFxRuntime, stepCameraFx } from './cameraFxDraw';
import {
	cameraMotionSlackMode,
	type CameraMotionTarget
} from './stageFxConfig';
import { createDefaultMotionLayer } from './motionLayers';

const VIEWPORT = { width: 1920, height: 1080 };

function audio(level: number): AudioSnapshot {
	return {
		bins: new Uint8Array(8).fill(Math.round(level * 255)),
		amplitude: level,
		peak: level,
		channels: {} as AudioSnapshot['channels'],
		timestampMs: 0
	};
}

function stateFor(targets: CameraMotionTarget[], range = 1): WallpaperState {
	const settings = {
		...DEFAULT_STATE,
		cameraMotionMode: 'circle' as const,
		cameraMotionAmount: 1,
		cameraMotionRange: range,
		cameraMotionSpeed: 4,
		cameraMotionDrive: 'fixed' as const,
		cameraMotionAudioInfluence: 0,
		cameraMotionAmplitudeAudio: 0,
		cameraMotionAudioChannel: 'full' as const,
		cameraMotionDirection: 'cw' as const
	};
	return {
		...settings,
		cameraMotionEnabled: true,
		cameraShakeEnabled: false,
		motionPaused: false,
		cameraMotionTargets: targets,
		motionLayers: [createDefaultMotionLayer(settings, targets)]
	} as WallpaperState;
}

/**
 * Walks a full revolution and returns the worst translation the layer asks
 * for against the room its own scale gives it. Anything above 1 is a canvas
 * sliding its own border into view — the cut-off spectrum edge.
 */
function worstOverflowRatio(targets: CameraMotionTarget[], range = 1): number {
	const state = stateFor(targets, range);
	const runtime = createCameraFxRuntime();
	let worst = 0;
	for (let i = 0; i < 240; i++) {
		const frame = stepCameraFx(
			runtime,
			state,
			() => audio(0),
			i * 16.6,
			1 / 60,
			VIEWPORT
		);
		const { tx, ty, scale } = frame.motion;
		const slackX = ((scale - 1) * VIEWPORT.width) / 2;
		const slackY = ((scale - 1) * VIEWPORT.height) / 2;
		worst = Math.max(
			worst,
			Math.abs(tx) / Math.max(slackX, 1e-6),
			Math.abs(ty) / Math.max(slackY, 1e-6)
		);
	}
	return worst;
}

describe('cameraMotionSlackMode', () => {
	it('calls the background and the overlays the frame', () => {
		expect(cameraMotionSlackMode(['background'])).toBe('frame');
		expect(cameraMotionSlackMode(['global-background'])).toBe('frame');
		expect(cameraMotionSlackMode(['selected-overlay'])).toBe('frame');
	});

	it('calls the full-screen canvases full-bleed', () => {
		expect(cameraMotionSlackMode(['spectrum'])).toBe('full-bleed');
		expect(cameraMotionSlackMode(['spectrum-2'])).toBe('full-bleed');
		expect(cameraMotionSlackMode(['rain'])).toBe('full-bleed');
		expect(cameraMotionSlackMode(['lyrics'])).toBe('full-bleed');
	});

	it('leaves the logo free to travel', () => {
		expect(cameraMotionSlackMode(['logo'])).toBe('free');
	});

	it('lets the frame decide when a layer moves both', () => {
		expect(cameraMotionSlackMode(['background', 'spectrum'])).toBe('frame');
	});
});

describe('stepCameraFx — no layer cuts its own edge', () => {
	it('keeps a spectrum inside the room its zoom gives it', () => {
		// The reported bug: Spectrum 2 was translated with no slack at all, so
		// the right-hand side of the canvas slid into view as a straight cut.
		expect(worstOverflowRatio(['spectrum'])).toBeLessThanOrEqual(1.0001);
	});

	it('keeps the second spectrum inside it too', () => {
		expect(worstOverflowRatio(['spectrum-2'])).toBeLessThanOrEqual(1.0001);
	});

	it('still keeps the background inside its own slack', () => {
		expect(worstOverflowRatio(['background'])).toBeLessThanOrEqual(1.0001);
	});

	it('does not zoom a layer that only moves the logo', () => {
		const state = stateFor(['logo']);
		const runtime = createCameraFxRuntime();
		const frame = stepCameraFx(
			runtime,
			state,
			() => audio(0),
			16.6,
			1 / 60,
			VIEWPORT
		);
		expect(frame.motion.scale).toBe(1);
	});
});

describe('stepCameraFx — movement scale', () => {
	/** The furthest the layer gets from centre over a full revolution. */
	function widestTravel(targets: CameraMotionTarget[], range: number) {
		const state = stateFor(targets, range);
		const runtime = createCameraFxRuntime();
		let widest = 0;
		for (let i = 0; i < 240; i++) {
			const frame = stepCameraFx(
				runtime,
				state,
				() => audio(0),
				i * 16.6,
				1 / 60,
				VIEWPORT
			);
			widest = Math.max(
				widest,
				Math.abs(frame.motion.tx),
				Math.abs(frame.motion.ty)
			);
		}
		return widest;
	}

	it('widens how far the logo travels, proportionally', () => {
		const base = widestTravel(['logo'], 1);
		expect(widestTravel(['logo'], 3) / base).toBeCloseTo(3, 1);
	});

	it('widens the spectrum too without letting it cut its edge', () => {
		// The point of scaling the slack ceiling with the reach: a bigger path
		// is useless if the clamp takes it straight back off.
		const base = widestTravel(['spectrum'], 1);
		expect(widestTravel(['spectrum'], 3)).toBeGreaterThan(base * 2);
		expect(worstOverflowRatio(['spectrum'], 3)).toBeLessThanOrEqual(1.0001);
	});

	it('changes nothing at the default scale', () => {
		expect(widestTravel(['logo'], 1)).toBe(widestTravel(['logo'], 0.2));
	});
});
