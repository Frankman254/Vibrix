/**
 * Spectrum Family Registry.
 *
 * Single source of truth for everything family-shaped in the spectrum
 * engine: capabilities (what controls apply), categories (UI grouping),
 * the renderer function, and optional preset bundles. The dispatcher in
 * `CircularSpectrum.ts`, the capability-aware UI panels under
 * and the macro range tables in `spectrumStateTransforms` all derive their
 * behavior from this registry — so adding a new family is one entry, not
 * three sites of conditionals.
 *
 * Design notes:
 * - Render functions keep their **current** signatures. The registry tags
 *   each one with the shape it expects so the dispatcher can hand it the
 *   right arguments without forcing every renderer to a single ABI.
 * - Capabilities are re-exported from `spectrumFamilyCapabilities.ts` so
 *   existing consumers keep working.
 * - This file is _purely structural_; it does not own state and has no
 *   React/Zustand dependencies.
 */

import type { SpectrumFamily, SpectrumShape } from '@/types/wallpaper';
import type { SpectrumFamilyCapabilities } from './spectrumFamilyCapabilities';
import { getSpectrumFamilyCapabilities } from './spectrumFamilyCapabilities';
import type {
	SpectrumRuntimeState,
	SpectrumScope,
	SpectrumSettings
} from '../runtime/spectrumRuntime';

// Renderer module imports (existing files, unchanged signatures).
import {
	drawLinearBars,
	drawLinearBlocks,
	drawLinearDots,
	drawLinearPixel,
	drawLinearWave
} from '../renderers/linear/linearRenderer';
import {
	drawRadialBars,
	drawRadialBlocks,
	drawRadialDots,
	drawRadialPixel,
	drawRadialWave
} from '../renderers/radial/radialRenderer';
import { drawOscilloscope } from '../renderers/oscilloscope/oscilloscopeRenderer';
import { drawTunnel } from '../renderers/tunnel/tunnelRenderer';
import { drawLiquid } from '../renderers/liquid/liquidRenderer';
import { drawOrbital } from '../renderers/orbital/orbitalRenderer';
import { drawSpiral } from '../renderers/spiral/spiralRenderer';
import { resolveClassicRadialShapeFallback } from './pixelArtHelpers';

/** Category tags surface in the family picker; no behavior is attached. */
export type SpectrumFamilyCategory =
	| 'geometric'
	| 'temporal'
	| 'depth'
	| 'generative'
	| 'analytic';

/**
 * Inputs that every dispatch path can hand the renderer. Concrete renderers
 * pick what they need; the registry tags each family with its render kind
 * so the dispatcher knows which subset to pass.
 */
export interface SpectrumRenderContext {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	bins: Uint8Array;
	/**
	 * Raw PCM waveform samples (0–255, 128 = silence). Empty when the
	 * source can't produce time-domain data (paused / remote replica).
	 * Oscilloscope is currently the only consumer.
	 */
	timeDomain: Uint8Array;
	runtime: SpectrumRuntimeState;
	settings: SpectrumSettings;
	dt: number;
	/** Normalized 0..1 energy envelope for gradient-flow audio drive. */
	audioEnergy: number;
	cx: number;
	cy: number;
	resolvedShape: SpectrumShape;
	barCount: number;
	radialAngle: number;
	/** Scope whose gradient-flow phase this draw advances. Defaults to live. */
	scope?: SpectrumScope;
}

/**
 * Render-kind tag. Each kind matches a renderer signature group already in
 * the codebase — we tag at the registry so the dispatcher can call the
 * right function without growing into a switch (and so the engineer adding
 * a family states the contract once, here).
 */
export type SpectrumRenderKind =
	| 'classic-linear'
	| 'classic-radial'
	| 'oscilloscope'
	| 'tunnel'
	| 'liquid'
	| 'orbital'
	| 'spiral';

/**
 * Numeric ranges used by the macro inference helpers in
 * `spectrumStateTransforms.ts`. Lifting them into the registry means a new
 * family doesn't have to add itself to every `if (family === ...)` chain in
 * that file — define them here, the inference functions read from the
 * registry.
 */
export interface SpectrumFamilyMacroTuning {
	/** [min, max] pixel height range used to infer the Energy macro. */
	energyHeightLinear: readonly [number, number];
	energyHeightRadial: readonly [number, number];
	/** [min, max] glow intensity used by Energy inference. */
	energyGlow: readonly [number, number];
	/** Max abs rotation speed considered "max chaos" for Chaos inference. */
	chaosRotationLinear: number;
	chaosRotationRadial: number;
	/** Max afterglow used by frame-memory inference. */
	afterglowMax: number;
	/** Max motion-trails value used by Chaos / frame-memory inference. */
	motionTrailsMax: number;
}

export interface SpectrumFamilyDefinition {
	id: SpectrumFamily;
	label: string;
	description: string;
	categories: ReadonlyArray<SpectrumFamilyCategory>;
	capabilities: SpectrumFamilyCapabilities;
	/** Which renderer ABI this family uses. */
	renderKind: SpectrumRenderKind;
	/** Macro range tunings consumed by `spectrumStateTransforms`. */
	macroTuning: SpectrumFamilyMacroTuning;
}

const FAMILY_DEFINITIONS: Record<SpectrumFamily, SpectrumFamilyDefinition> = {
	classic: {
		id: 'classic',
		label: 'Classic',
		description: 'Bars, blocks, wave or dots — linear or radial layout.',
		categories: ['geometric'],
		capabilities: getSpectrumFamilyCapabilities('classic'),
		renderKind: 'classic-linear',
		macroTuning: {
			energyHeightLinear: [55, 220],
			energyHeightRadial: [40, 180],
			energyGlow: [0.15, 2.2],
			chaosRotationLinear: 0.25,
			chaosRotationRadial: 0.85,
			afterglowMax: 0.18,
			motionTrailsMax: 0.24
		}
	},
	oscilloscope: {
		id: 'oscilloscope',
		label: 'Oscilloscope',
		description: 'Time-domain trace with adjustable history + line width.',
		categories: ['temporal', 'analytic'],
		capabilities: getSpectrumFamilyCapabilities('oscilloscope'),
		renderKind: 'oscilloscope',
		macroTuning: {
			energyHeightLinear: [50, 165],
			energyHeightRadial: [40, 145],
			energyGlow: [0.1, 1.8],
			chaosRotationLinear: 0.3,
			chaosRotationRadial: 0.75,
			afterglowMax: 0.28,
			motionTrailsMax: 0.24
		}
	},
	tunnel: {
		id: 'tunnel',
		label: 'Tunnel',
		description: 'Concentric depth rings driven by frequency bands.',
		categories: ['depth', 'geometric'],
		capabilities: getSpectrumFamilyCapabilities('tunnel'),
		renderKind: 'tunnel',
		macroTuning: {
			energyHeightLinear: [70, 220],
			energyHeightRadial: [70, 220],
			energyGlow: [0.1, 1.8],
			chaosRotationLinear: 1.15,
			chaosRotationRadial: 1.15,
			afterglowMax: 0.28,
			motionTrailsMax: 0.24
		}
	},
	liquid: {
		id: 'liquid',
		label: 'Liquid',
		description: 'Stacked sine layers that breathe with audio energy.',
		categories: ['generative'],
		capabilities: getSpectrumFamilyCapabilities('liquid'),
		renderKind: 'liquid',
		macroTuning: {
			energyHeightLinear: [60, 190],
			energyHeightRadial: [45, 165],
			energyGlow: [0.1, 1.8],
			chaosRotationLinear: 0.45,
			chaosRotationRadial: 0.9,
			afterglowMax: 0.28,
			motionTrailsMax: 0.24
		}
	},
	orbital: {
		id: 'orbital',
		label: 'Orbital',
		description: 'Particles orbiting the center, modulated by audio.',
		categories: ['generative', 'depth'],
		capabilities: getSpectrumFamilyCapabilities('orbital'),
		renderKind: 'orbital',
		macroTuning: {
			energyHeightLinear: [60, 170],
			energyHeightRadial: [60, 170],
			energyGlow: [0.1, 1.8],
			chaosRotationLinear: 1.4,
			chaosRotationRadial: 1.4,
			afterglowMax: 0.28,
			motionTrailsMax: 0.36
		}
	},
	spiral: {
		id: 'spiral',
		label: 'Spiral',
		description: 'Frequency bins glow along a logarithmic spiral.',
		categories: ['depth', 'generative'],
		capabilities: getSpectrumFamilyCapabilities('spiral'),
		renderKind: 'spiral',
		macroTuning: {
			energyHeightLinear: [55, 195],
			energyHeightRadial: [55, 195],
			energyGlow: [0.1, 2.0],
			chaosRotationLinear: 1.2,
			chaosRotationRadial: 1.2,
			afterglowMax: 0.28,
			motionTrailsMax: 0.3
		}
	}
};

/** Read-only registry. Mutate via code change, never at runtime. */
export const SPECTRUM_FAMILY_REGISTRY: ReadonlyArray<SpectrumFamilyDefinition> =
	Object.freeze(Object.values(FAMILY_DEFINITIONS));

export function getSpectrumFamilyDefinition(
	family: SpectrumFamily
): SpectrumFamilyDefinition {
	return FAMILY_DEFINITIONS[family] ?? FAMILY_DEFINITIONS.classic;
}

/**
 * Dispatch a render frame to the correct renderer.
 *
 * Centralizes the if/else cascade that lived in `CircularSpectrum.ts`. The
 * registry tags each family with a `renderKind`; this function maps the
 * tag to the concrete render function with the right argument layout.
 *
 * The dispatcher is _intentionally explicit_ per kind (one branch each)
 * because the underlying renderers each take a different argument shape.
 * The win over the previous setup is that the branches now live in a
 * single registry-aware function instead of being interleaved with the
 * top-level draw loop.
 */
export function dispatchSpectrumRenderer(
	family: SpectrumFamily,
	mode: 'radial' | 'linear',
	input: SpectrumRenderContext
): void {
	const definition = getSpectrumFamilyDefinition(family);
	switch (definition.renderKind) {
		case 'oscilloscope':
			drawOscilloscope(
				input.ctx,
				input.canvas,
				input.runtime,
				input.settings,
				input.timeDomain,
				input.dt
			);
			return;
		case 'tunnel':
			drawTunnel(input.ctx, input.canvas, input.runtime, input.settings);
			return;
		case 'liquid':
			drawLiquid(input.ctx, input.canvas, input.runtime, input.settings);
			return;
		case 'orbital':
			drawOrbital(
				input.ctx,
				input.canvas,
				input.runtime,
				input.settings,
				input.dt
			);
			return;
		case 'spiral':
			drawSpiral(
				input.ctx,
				input.canvas,
				input.runtime,
				input.settings,
				input.dt
			);
			return;
		case 'classic-linear':
		case 'classic-radial':
			renderClassic(mode, input);
			return;
	}
}

function renderClassic(
	mode: 'radial' | 'linear',
	input: SpectrumRenderContext
): void {
	const {
		ctx,
		canvas,
		runtime,
		settings,
		cx,
		cy,
		resolvedShape,
		barCount,
		radialAngle
	} = input;
	if (mode === 'radial') {
		const radialShape = resolveClassicRadialShapeFallback(resolvedShape);
		switch (radialShape) {
			case 'bars':
				drawRadialBars(
					ctx,
					cx,
					cy,
					runtime.pixelHeights,
					runtime.pixelPeaks,
					barCount,
					settings,
					runtime.rotation,
					radialAngle
				);
				return;
			case 'blocks':
				drawRadialBlocks(
					ctx,
					cx,
					cy,
					runtime.pixelHeights,
					barCount,
					settings,
					runtime.rotation,
					radialAngle
				);
				return;
			case 'pixel':
				drawRadialPixel(
					ctx,
					cx,
					cy,
					runtime.pixelHeights,
					barCount,
					settings,
					runtime.rotation,
					radialAngle
				);
				return;
			case 'wave':
				drawRadialWave(
					ctx,
					canvas,
					cx,
					cy,
					runtime.pixelHeights,
					barCount,
					settings,
					runtime.rotation,
					radialAngle,
					{
						audioEnergy: input.audioEnergy,
						dt: input.dt,
						scope: input.scope
					}
				);
				return;
			case 'dots':
				drawRadialDots(
					ctx,
					cx,
					cy,
					runtime.pixelHeights,
					barCount,
					settings,
					runtime.rotation,
					radialAngle
				);
				return;
		}
		return;
	}
	if (resolvedShape === 'wave') {
		drawLinearWave(ctx, canvas, runtime.pixelHeights, barCount, settings, {
			runtime,
			audioEnergy: input.audioEnergy,
			dt: input.dt,
			scope: input.scope
		});
		return;
	}
	if (resolvedShape === 'dots') {
		drawLinearDots(ctx, canvas, runtime.pixelHeights, barCount, settings);
		return;
	}
	if (resolvedShape === 'blocks') {
		drawLinearBlocks(ctx, canvas, runtime.pixelHeights, barCount, settings);
		return;
	}
	if (resolvedShape === 'pixel') {
		drawLinearPixel(ctx, canvas, runtime.pixelHeights, barCount, settings);
		return;
	}
	drawLinearBars(
		ctx,
		canvas,
		runtime.pixelHeights,
		runtime.pixelPeaks,
		barCount,
		settings,
		{ audioEnergy: input.audioEnergy, dt: input.dt, scope: input.scope }
	);
}
