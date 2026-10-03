import { describe, expect, it } from 'vitest';
import {
	RAIN_MESH_DEPTH_SCALE,
	RAIN_MESH_OVERSCALE,
	resolveRainMeshTiles
} from './rainUniforms';

/** Screens of plane the mesh covers for a given tile count. */
function coverageScreens(tiles: number): number {
	return (RAIN_MESH_OVERSCALE * tiles) / RAIN_MESH_DEPTH_SCALE;
}

describe('resolveRainMeshTiles', () => {
	it('stays at one tile when nothing moves the layer', () => {
		expect(resolveRainMeshTiles(0, 1080)).toBe(1);
	});

	it('stays at one tile for movements the existing slack covers', () => {
		// One tile reaches a third of the short side past each edge.
		expect(resolveRainMeshTiles(300, 1080)).toBe(1);
	});

	it('covers the travel on both sides of the frame', () => {
		for (const overscanPx of [0, 120, 361, 500, 864, 2000]) {
			const tiles = resolveRainMeshTiles(overscanPx, 1080);
			expect(coverageScreens(tiles)).toBeGreaterThanOrEqual(
				1 + (2 * overscanPx) / 1080
			);
		}
	});

	it('grows for the maximum travel Camera Motion allows', () => {
		expect(resolveRainMeshTiles(864, 1080)).toBeGreaterThan(1);
	});

	it('counts tiles in whole pattern copies so the wrap stays seamless', () => {
		const tiles = resolveRainMeshTiles(864, 1080);
		expect(Number.isInteger(tiles)).toBe(true);
	});

	it('answers one tile for a degenerate viewport instead of dividing by zero', () => {
		expect(resolveRainMeshTiles(500, 0)).toBe(1);
	});
});

// Project the four frame corners into mesh-local coordinates. Each must stay
// inside the plane even at the travel extremes, irrespective of orientation.
describe('rotated rain coverage', () => {
	it.each([16 / 9, 9 / 16, 21 / 9, 1])(
		'covers every corner at aspect %s',
		aspect => {
			const min = 540;
			const w = min * Math.max(1, aspect);
			const h = min * Math.max(1, 1 / aspect);
			for (const bleed of [0, 120, 864]) {
				for (const degrees of [0, 30, 45, 60, 90, 135, 180]) {
					const angle = (degrees * Math.PI) / 180;
					const tiles = resolveRainMeshTiles(
						bleed,
						min,
						aspect,
						angle
					);
					const halfW = (w * coverageScreens(tiles)) / 2;
					const halfH = (h * coverageScreens(tiles)) / 2;
					for (const x of [-w / 2 - bleed, w / 2 + bleed]) {
						for (const y of [-h / 2 - bleed, h / 2 + bleed]) {
							expect(
								Math.abs(
									x * Math.cos(angle) + y * Math.sin(angle)
								)
							).toBeLessThanOrEqual(halfW + 1e-8);
							expect(
								Math.abs(
									-x * Math.sin(angle) + y * Math.cos(angle)
								)
							).toBeLessThanOrEqual(halfH + 1e-8);
						}
					}
				}
			}
		}
	);
});
