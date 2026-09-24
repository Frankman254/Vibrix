/**
 * Classic Rain's uniform values, shared by the live `RainLayer` (R3F) and the
 * offline video export, which draw the same shader plane.
 *
 * No React, no Three: colours come back as `[r, g, b]` in 0–1 and the caller
 * copies them into its own vectors.
 */
import {
	resolveModeDrivenColors,
	type BackgroundPalette
} from '@/lib/backgroundPalette';
import type { WallpaperState } from '@/types/wallpaper';
import { resolveFilterValue } from '@/features/filterLooks/filterStack';

export type RainSettings = Pick<
	WallpaperState,
	| 'rainIntensity'
	| 'rainDropCount'
	| 'rainAngle'
	| 'rainMeshRotationZ'
	| 'rainColor'
	| 'rainColorSource'
	| 'rainColorMode'
	| 'rainParticleType'
	| 'rainLength'
	| 'rainWidth'
	| 'rainBlur'
	| 'rainSpeed'
	| 'rainVariation'
	| 'effectLayers'
	| 'activeEffectLayerId'
	| 'filterTargets'
	| 'filterOpacity'
>;

type Vec3 = [number, number, number];

const PARTICLE_TYPE_INDEX: Record<string, number> = {
	lines: 0,
	drops: 1,
	dots: 2,
	bars: 3
};
const COLOR_MODE_INDEX: Record<string, number> = {
	solid: 0,
	rainbow: 1,
	completeRotate: 2
};

/** The shader declares `uPaletteColors[6]`. */
export const RAIN_PALETTE_SIZE = 6;

/** The plane overscales so its corners stay hidden while rotated. */
export const RAIN_MESH_OVERSCALE = 1.5;
export const RAIN_MESH_Z = 0.1;

function hexToVec3(hex: string): Vec3 {
	const c = hex.replace('#', '');
	return [
		parseInt(c.slice(0, 2), 16) / 255,
		parseInt(c.slice(2, 4), 16) / 255,
		parseInt(c.slice(4, 6), 16) / 255
	];
}

export type RainUniformValues = {
	uRainIntensity: number;
	uDropCount: number;
	uRainAngle: number;
	uRainSpeed: number;
	uRainLength: number;
	uRainWidth: number;
	uRainBlur: number;
	uRainVariation: number;
	uRainColor: Vec3;
	uColorMode: number;
	uUsePaletteRainbow: number;
	uPaletteCount: number;
	/** Always `RAIN_PALETTE_SIZE` entries. */
	uPaletteColors: Vec3[];
	uParticleType: number;
};

export function resolveRainUniforms(
	settings: RainSettings,
	palettes: { background: BackgroundPalette; theme: BackgroundPalette }
): RainUniformValues {
	// Looks' "filter opacity" reaches rain from whichever effect layer
	// targets it — not necessarily the one the Looks tab is editing.
	const rainOpacity = resolveFilterValue(settings, 'rain', 'filterOpacity');
	const intensity =
		rainOpacity === null
			? settings.rainIntensity
			: settings.rainIntensity * rainOpacity;
	const resolvedColors = resolveModeDrivenColors(
		settings.rainColorSource,
		settings.rainColor,
		settings.rainColor,
		palettes.background,
		palettes.theme
	);
	const activePalette =
		settings.rainColorSource === 'theme'
			? palettes.theme
			: palettes.background;
	const usePaletteRainbow =
		settings.rainColorSource !== 'manual' &&
		(settings.rainColorMode === 'rainbow' ||
			settings.rainColorMode === 'completeRotate');
	const paletteColors: Vec3[] = [];
	for (let i = 0; i < RAIN_PALETTE_SIZE; i++) {
		paletteColors.push(
			hexToVec3(activePalette.rainbow[i] ?? activePalette.dominant)
		);
	}
	return {
		uRainIntensity: intensity,
		uDropCount: Math.floor(settings.rainDropCount),
		uRainAngle: (settings.rainAngle * Math.PI) / 180,
		uRainSpeed: settings.rainSpeed,
		uRainLength: settings.rainLength,
		uRainWidth: settings.rainWidth,
		uRainBlur: settings.rainBlur,
		uRainVariation: settings.rainVariation,
		uRainColor: hexToVec3(resolvedColors.primaryColor),
		uColorMode: COLOR_MODE_INDEX[settings.rainColorMode] ?? 0,
		uUsePaletteRainbow: usePaletteRainbow ? 1 : 0,
		uPaletteCount: activePalette.rainbow.length,
		uPaletteColors: paletteColors,
		uParticleType: PARTICLE_TYPE_INDEX[settings.rainParticleType] ?? 0
	};
}

export function resolveRainMeshRotation(
	settings: Pick<RainSettings, 'rainMeshRotationZ'>
): number {
	return (settings.rainMeshRotationZ * Math.PI) / 180;
}

type UniformSlot = { value: unknown };
type Vector3Like = { set(x: number, y: number, z: number): unknown };

/**
 * Copies the values into a material's uniforms; vector uniforms must already
 * hold `Vector3`s (`uPaletteColors` an array of `RAIN_PALETTE_SIZE`).
 */
export function applyRainUniforms(
	uniforms: Record<string, UniformSlot>,
	values: RainUniformValues
): void {
	for (const key of Object.keys(values) as (keyof RainUniformValues)[]) {
		if (key === 'uRainColor') {
			(uniforms.uRainColor.value as Vector3Like).set(
				...values.uRainColor
			);
		} else if (key === 'uPaletteColors') {
			const slots = uniforms.uPaletteColors.value as Vector3Like[];
			values.uPaletteColors.forEach((color, i) =>
				slots[i]?.set(...color)
			);
		} else {
			uniforms[key].value = values[key];
		}
	}
}
