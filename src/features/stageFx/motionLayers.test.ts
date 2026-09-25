import { describe, expect, it } from 'vitest';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { MotionLayer, WallpaperState } from '@/types/wallpaper';
import {
	createCameraFxRuntime,
	resolveCameraLayerOffset,
	stepCameraFx
} from './cameraFxDraw';
import {
	DEFAULT_MOTION_LAYER_ID,
	extractMotionLayerSettingsFromState,
	findMotionLayerForTarget,
	motionLayerToStatePatch,
	resolveMotionLayerStack,
	syncActiveMotionLayer
} from './motionLayers';

const silence: AudioSnapshot = {
	bins: new Uint8Array(8),
	amplitude: 0,
	peak: 0,
	channels: {} as AudioSnapshot['channels'],
	timestampMs: 0
};

function layer(patch: Partial<MotionLayer> & { id: string }): MotionLayer {
	return {
		name: '',
		enabled: true,
		targets: [],
		settings: {
			...extractMotionLayerSettingsFromState(DEFAULT_STATE),
			cameraMotionMode: 'circle',
			cameraMotionDrive: 'fixed',
			cameraMotionSpeed: 1,
			cameraMotionAmount: 1
		},
		...patch
	};
}

function state(patch: Partial<WallpaperState>): WallpaperState {
	return {
		...DEFAULT_STATE,
		cameraMotionEnabled: true,
		cameraShakeEnabled: false,
		cameraMotionMode: 'circle',
		cameraMotionDrive: 'fixed',
		cameraMotionSpeed: 1,
		cameraMotionAmount: 1,
		...patch
	} as WallpaperState;
}

describe('motion layers — the active layer is the flat keys', () => {
	it('reads the live flat values for the active layer, the snapshot for the rest', () => {
		const s = state({
			cameraMotionAmount: 0.75,
			cameraMotionTargets: ['logo'],
			activeMotionLayerId: 'a',
			motionLayers: [
				layer({ id: 'a', targets: ['background'] }),
				layer({ id: 'b', targets: ['spectrum'] })
			]
		});
		const stack = resolveMotionLayerStack(s);
		// Layer `a` is active: its stale snapshot says `background` / amount 1,
		// the live keys say `logo` / 0.75, and the live keys must win.
		expect(stack[0]).toMatchObject({
			id: 'a',
			targets: ['logo']
		});
		expect(stack[0].settings.cameraMotionAmount).toBe(0.75);
		expect(stack[1].settings.cameraMotionAmount).toBe(1);
	});

	it('folds the live values back into the snapshot before writing the array', () => {
		const s = state({
			cameraMotionAmount: 0.4,
			cameraMotionTargets: ['rain'],
			activeMotionLayerId: 'a',
			motionLayers: [layer({ id: 'a', targets: ['background'] })]
		});
		const synced = syncActiveMotionLayer(s);
		expect(synced[0].targets).toEqual(['rain']);
		expect(synced[0].settings.cameraMotionAmount).toBe(0.4);
	});

	it('hands the flat keys over when a different layer becomes active', () => {
		const patch = motionLayerToStatePatch(
			layer({
				id: 'b',
				targets: ['spectrum', 'logo'],
				settings: {
					...extractMotionLayerSettingsFromState(DEFAULT_STATE),
					cameraMotionMode: 'pendulum',
					cameraMotionAmount: 0.2
				}
			})
		);
		expect(patch.cameraMotionTargets).toEqual(['spectrum', 'logo']);
		expect(patch.cameraMotionTarget).toBe('spectrum');
		expect(patch.cameraMotionMode).toBe('pendulum');
		expect(patch.cameraMotionAmount).toBe(0.2);
	});

	it('drops layers that are off, empty or set to none', () => {
		const s = state({
			cameraMotionTargets: ['background'],
			activeMotionLayerId: DEFAULT_MOTION_LAYER_ID,
			motionLayers: [
				layer({ id: DEFAULT_MOTION_LAYER_ID, targets: ['background'] }),
				layer({ id: 'off', targets: ['logo'], enabled: false }),
				layer({ id: 'empty', targets: [] }),
				layer({
					id: 'none',
					targets: ['rain'],
					settings: {
						...extractMotionLayerSettingsFromState(DEFAULT_STATE),
						cameraMotionMode: 'none'
					}
				})
			]
		});
		expect(resolveMotionLayerStack(s).map(entry => entry.id)).toEqual([
			DEFAULT_MOTION_LAYER_ID
		]);
	});

	it('gives a target to the first enabled layer that names it', () => {
		const s = state({
			cameraMotionTargets: ['background'],
			activeMotionLayerId: 'a',
			motionLayers: [
				layer({ id: 'a', targets: ['background'] }),
				layer({ id: 'b', targets: ['background', 'logo'] })
			]
		});
		expect(findMotionLayerForTarget(s, 'background')?.id).toBe('a');
		expect(findMotionLayerForTarget(s, 'logo')?.id).toBe('b');
		expect(findMotionLayerForTarget(s, 'particles')).toBeNull();
		const hidden = {
			...s,
			motionLayers: [
				{ ...s.motionLayers[0], enabled: false },
				s.motionLayers[1]
			]
		};
		// Hiding the top layer reveals what is under it, like an image editor.
		expect(findMotionLayerForTarget(hidden, 'background')?.id).toBe('b');
	});
});

describe('stepCameraFx — one movement per layer', () => {
	function run(s: WallpaperState, frames = 8) {
		const runtime = createCameraFxRuntime();
		let frame = stepCameraFx(
			runtime,
			s,
			() => silence,
			0,
			1 / 30,
			{ width: 1920, height: 1080 },
			() => 0.5
		);
		for (let i = 1; i < frames; i++) {
			frame = stepCameraFx(
				runtime,
				s,
				() => silence,
				i * 33,
				1 / 30,
				{ width: 1920, height: 1080 },
				() => 0.5
			);
		}
		return { runtime, frame };
	}

	it('moves two targets differently and keeps a clock per layer', () => {
		const s = state({
			// Small amplitudes on purpose: at amount 1 both layers sit on the
			// zoom-slack clamp and the comparison would read as "identical".
			cameraMotionAmount: 0.2,
			cameraMotionTargets: ['background'],
			activeMotionLayerId: 'a',
			motionLayers: [
				layer({ id: 'a', targets: ['background'] }),
				layer({
					id: 'b',
					targets: ['logo'],
					settings: {
						...extractMotionLayerSettingsFromState(DEFAULT_STATE),
						cameraMotionMode: 'circle',
						cameraMotionDrive: 'fixed',
						// Half the speed, so the same shape sits at a different
						// phase — which is the whole point of a second layer.
						cameraMotionSpeed: 0.5,
						cameraMotionAmount: 0.2
					}
				})
			]
		});
		// Far enough in that both phases are off the zoom-slack clamp, which
		// bites near the extremes of the path on a 16:9 viewport.
		const { runtime, frame } = run(s, 40);
		expect(frame.motions.map(entry => entry.layerId)).toEqual(['a', 'b']);
		expect(Object.keys(runtime.motionTimes).sort()).toEqual(['a', 'b']);
		expect(runtime.motionTimes.b).toBeCloseTo(runtime.motionTimes.a / 2, 6);
		const background = resolveCameraLayerOffset(frame, s, 'background')!;
		const logo = resolveCameraLayerOffset(frame, s, 'logo')!;
		expect(background.tx).not.toBeCloseTo(logo.tx, 4);
		expect(resolveCameraLayerOffset(frame, s, 'rain')).toBeNull();
	});

	it('never blends two layers over the same target', () => {
		const s = state({
			cameraMotionTargets: ['background'],
			activeMotionLayerId: 'a',
			motionLayers: [
				layer({ id: 'a', targets: ['background'] }),
				layer({ id: 'b', targets: ['background'] })
			]
		});
		const { frame } = run(s);
		const offset = resolveCameraLayerOffset(frame, s, 'background')!;
		expect(offset.tx).toBeCloseTo(frame.motions[0].offset.tx, 6);
		expect(offset.ty).toBeCloseTo(frame.motions[0].offset.ty, 6);
	});

	it('stops every layer when the master switch is off', () => {
		const s = state({
			cameraMotionEnabled: false,
			cameraMotionTargets: ['background'],
			activeMotionLayerId: 'a',
			motionLayers: [layer({ id: 'a', targets: ['background'] })]
		});
		const { frame } = run(s);
		expect(frame.motionActive).toBe(false);
		expect(frame.motions).toEqual([]);
		expect(resolveCameraLayerOffset(frame, s, 'background')).toBeNull();
	});
});
