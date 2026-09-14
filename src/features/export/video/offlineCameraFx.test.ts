import { describe, expect, it } from 'vitest';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { WallpaperState } from '@/types/wallpaper';
import { createOfflineCameraFx } from './offlineCameraFx';

const silence: AudioSnapshot = {
	bins: new Uint8Array(8),
	amplitude: 0,
	peak: 0,
	channels: {} as AudioSnapshot['channels'],
	timestampMs: 0
};

function state(patch: Partial<WallpaperState>): WallpaperState {
	return {
		...DEFAULT_STATE,
		cameraMotionEnabled: false,
		cameraShakeEnabled: false,
		...patch
	} as WallpaperState;
}

const input = (s: WallpaperState, timeMs: number) => ({
	state: s,
	audio: silence,
	timeMs,
	deltaMs: 1000 / 30,
	resolution: { width: 1920, height: 1080 }
});

describe('createOfflineCameraFx', () => {
	it('does nothing while Camera FX is off', () => {
		const fx = createOfflineCameraFx(1080);
		expect(fx.step(input(state({}), 0))).toBeUndefined();
	});

	it('moves targeted layers and scales offsets to the output', () => {
		const motion = state({
			cameraMotionEnabled: true,
			cameraMotionMode: 'circle',
			cameraMotionDrive: 'fixed',
			cameraMotionSpeed: 1,
			cameraMotionAmount: 1,
			cameraMotionTargets: ['background']
		} as Partial<WallpaperState>);
		const atViewport = createOfflineCameraFx(1080);
		const atHalfViewport = createOfflineCameraFx(540);
		for (let i = 0; i < 10; i++) {
			atViewport.step(input(motion, i * 33));
			atHalfViewport.step(input(motion, i * 33));
		}
		const full = atViewport.step(input(motion, 330))!;
		const doubled = atHalfViewport.step(input(motion, 330))!;
		const offset = full('background')!;
		expect(offset.scale).toBeGreaterThan(1);
		expect(Math.abs(offset.tx) + Math.abs(offset.ty)).toBeGreaterThan(0);
		expect(doubled('background')!.tx).toBeCloseTo(offset.tx * 2, 5);
		expect(full('lyrics')).toBeNull();
		expect(full('hud')).toBeNull();
	});
});
