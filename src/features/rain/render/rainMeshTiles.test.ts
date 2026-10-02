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
