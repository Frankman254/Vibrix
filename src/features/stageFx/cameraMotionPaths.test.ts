/**
 * The three things the Motion tab gained together: polygon paths, the
 * smoothing that decides how abruptly they are travelled, and the halo the
 * layer drags behind it.
 */
import { describe, expect, it } from 'vitest';
import type { AudioSnapshot } from '@/lib/audio/audioChannels';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { WallpaperState } from '@/types/wallpaper';
import {
	cameraTrailFilter,
	createCameraFxRuntime,
	stepCameraFx
} from './cameraFxDraw';
import type { CameraMotionMode } from './stageFxConfig';
import { createDefaultMotionLayer } from './motionLayers';

const VIEWPORT = { width: 1920, height: 1080 };

const SILENCE: AudioSnapshot = {
	bins: new Uint8Array(8),
	amplitude: 0,
	peak: 0,
	channels: {} as AudioSnapshot['channels'],
	timestampMs: 0
};

function stateFor(patch: Partial<WallpaperState>): WallpaperState {
	const settings = {
		...DEFAULT_STATE,
		cameraMotionMode: 'triangle' as CameraMotionMode,
		cameraMotionAmount: 1,
		cameraMotionRange: 1,
		cameraMotionSpeed: 2,
		cameraMotionDrive: 'fixed' as const,
		cameraMotionAudioInfluence: 0,
		cameraMotionAmplitudeAudio: 0,
		cameraMotionAudioChannel: 'full' as const,
		cameraMotionDirection: 'cw' as const,
		cameraMotionEdgeZoom: 0,
		cameraMotionSmoothing: 0,
		cameraMotionTrail: 0,
		cameraMotionTrailColor: '#ffffff',
		...patch
	};
	return {
		...settings,
		cameraMotionEnabled: true,
		cameraShakeEnabled: false,
		motionPaused: false,
		cameraMotionTargets: ['logo'],
		motionLayers: [createDefaultMotionLayer(settings, ['logo'])]
	} as WallpaperState;
}

/** Every position the layer visits over `frames` steps of 1/60 s. */
function walk(patch: Partial<WallpaperState>, frames = 600) {
	const state = stateFor(patch);
	const runtime = createCameraFxRuntime();
	const path: Array<{ tx: number; ty: number; scale: number }> = [];
	for (let i = 0; i < frames; i++) {
		const frame = stepCameraFx(
			runtime,
			state,
			() => SILENCE,
			i * 16.6,
			1 / 60,
			VIEWPORT
		);
		path.push({ ...frame.motion });
	}
	return path;
}

describe('polygon movement patterns', () => {
	const POLYGONS: Array<[CameraMotionMode, number]> = [
		['triangle', 3],
		['diamond', 4],
		['pentagon', 5],
		['hexagon', 6]
	];

	it('actually moves, and stays inside the amplitude it was given', () => {
		for (const [mode] of POLYGONS) {
			const path = walk({ cameraMotionMode: mode });
			const widest = Math.max(
				...path.map(p => Math.max(Math.abs(p.tx), Math.abs(p.ty)))
			);
			expect(widest).toBeGreaterThan(10);
			// The radius is the amplitude, so no axis may exceed it.
			const radius = Math.max(...path.map(p => Math.hypot(p.tx, p.ty)));
			expect(radius).toBeLessThanOrEqual(widest * Math.SQRT2 + 1e-6);
		}
	});

	it('has corners: the distance from centre is NOT constant', () => {
		// That is exactly what separates a polygon from the circle — the middle
		// of an edge is closer to the centre than a vertex.
		for (const [mode, sides] of POLYGONS) {
			const path = walk({ cameraMotionMode: mode });
			const radii = path.map(p => Math.hypot(p.tx, p.ty));
			const min = Math.min(...radii);
			const max = Math.max(...radii);
			// cos(π/n) is the exact ratio for a regular polygon.
			expect(min / max).toBeLessThan(0.999);
			expect(min / max).toBeGreaterThan(Math.cos(Math.PI / sides) - 0.05);
		}
	});

	it('draws the star with two radii and the ribbon with one sweep', () => {
		const star = walk({ cameraMotionMode: 'star' });
		const radii = star.map(p => Math.hypot(p.tx, p.ty));
		// The inner vertices are pulled in to 0.42 of the outer ones.
		expect(Math.min(...radii) / Math.max(...radii)).toBeLessThan(0.6);

		const zigzag = walk({ cameraMotionMode: 'zigzag' });
		const spanX = Math.max(...zigzag.map(p => Math.abs(p.tx)));
		const spanY = Math.max(...zigzag.map(p => Math.abs(p.ty)));
		// A ribbon: wide across, shallow up and down.
		expect(spanX).toBeGreaterThan(spanY * 1.5);
	});

	it('winds the spiral in and out instead of retracing one ring', () => {
		const radii = walk({
			cameraMotionMode: 'spiral',
			cameraMotionSpeed: 4
		}).map(p => Math.hypot(p.tx, p.ty));
		expect(Math.min(...radii) / Math.max(...radii)).toBeLessThan(0.5);
	});
});

describe('movement smoothing', () => {
	it('rounds the jump instead of snapping into it', () => {
		const biggestStep = (smoothing: number) => {
			const path = walk({
				cameraMotionMode: 'beat-jump',
				cameraMotionSmoothing: smoothing
			});
			let worst = 0;
			for (let i = 1; i < path.length; i++) {
				worst = Math.max(
					worst,
					Math.hypot(
						path[i].tx - path[i - 1].tx,
						path[i].ty - path[i - 1].ty
					)
				);
			}
			return worst;
		};
		const raw = biggestStep(0);
		expect(biggestStep(0.5)).toBeLessThan(raw * 0.5);
		expect(biggestStep(1)).toBeLessThan(biggestStep(0.5));
	});

	it('follows the path exactly when it is off', () => {
		const a = walk({ cameraMotionMode: 'circle' });
		const b = walk({
			cameraMotionMode: 'circle',
			cameraMotionSmoothing: 0
		});
		expect(a).toEqual(b);
	});

	it('still travels the whole path, only later', () => {
		const widest = (smoothing: number) =>
			Math.max(
				...walk({
					cameraMotionMode: 'circle',
					cameraMotionSmoothing: smoothing
				}).map(p => Math.hypot(p.tx, p.ty))
			);
		// A lag of 0.3 of the maximum cannot cost more than a little reach.
		expect(widest(0.3)).toBeGreaterThan(widest(0) * 0.7);
	});
});

describe('movement trail', () => {
	function trailAt(trail: number) {
		const state = stateFor({
			cameraMotionMode: 'circle',
			cameraMotionSpeed: 4,
			cameraMotionTrail: trail,
			cameraMotionTrailColor: '#22ccff'
		});
		const runtime = createCameraFxRuntime();
		let last = null as ReturnType<typeof stepCameraFx>['motion']['trail'];
		for (let i = 0; i < 120; i++) {
			last = stepCameraFx(
				runtime,
				state,
				() => SILENCE,
				i * 16.6,
				1 / 60,
				VIEWPORT
			).motion.trail;
		}
		return last;
	}

	it('is absent when the dial is at zero', () => {
		expect(trailAt(0)).toBeNull();
		expect(cameraTrailFilter(null)).toBeNull();
	});

	it('points back along the movement and carries its colour', () => {
		const trail = trailAt(1);
		expect(trail).not.toBeNull();
		expect(Math.hypot(trail!.dx, trail!.dy)).toBeGreaterThan(0.4);
		expect(trail!.alpha).toBeGreaterThan(0);
		expect(trail!.color).toBe('#22ccff');
	});

	it('gets stronger with the dial', () => {
		expect(trailAt(1)!.alpha).toBeGreaterThan(trailAt(0.3)!.alpha);
	});

	it('collapses when the movement stops', () => {
		const state = stateFor({
			cameraMotionMode: 'circle',
			cameraMotionSpeed: 0,
			cameraMotionTrail: 1
		});
		const runtime = createCameraFxRuntime();
		let trail = null as ReturnType<typeof stepCameraFx>['motion']['trail'];
		for (let i = 0; i < 180; i++) {
			trail = stepCameraFx(
				runtime,
				state,
				() => SILENCE,
				i * 16.6,
				1 / 60,
				VIEWPORT
			).motion.trail;
		}
		expect(trail).toBeNull();
	});

	it('renders one drop-shadow per ghost, scaled to the caller pixels', () => {
		const filter = cameraTrailFilter(
			{ dx: -12, dy: 6, blur: 9, alpha: 0.6, color: '#ff0000' },
			2
		);
		expect(filter).not.toBeNull();
		expect(filter!.match(/drop-shadow/g)).toHaveLength(3);
		// The first ghost sits a third of the way back, at double scale.
		expect(filter!).toContain('-8.00px 4.00px');
		expect(filter!).toContain('rgba(255, 0, 0,');
	});
});
