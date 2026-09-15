import { drawLinearWave, drawLinearBars } from '@/features/spectrum/render';
import { drawRadialWave, drawRadialBars } from '@/features/spectrum/render';
import { drawOscilloscope } from '@/features/spectrum/render';
import type {
	SpectrumRuntimeState,
	SpectrumSettings
} from '@/features/spectrum';
import type { SpectrumFxLabMode } from './spectrumFxLabConfig';

export type LabFrameBuffers = {
	heights: Float32Array;
	peaks: Float32Array;
	timeDomain: Uint8Array;
};

export function renderLabFrame(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	mode: SpectrumFxLabMode,
	settings: SpectrumSettings,
	buffers: LabFrameBuffers,
	frame: number,
	runtime: SpectrumRuntimeState
): number {
	const t0 = performance.now();
	const barCount = buffers.heights.length;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#050508';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	const cx = canvas.width / 2;
	const cy = canvas.height / 2;
	const rotation = frame * 0.012;
	const dt = 1 / 60;
	const audioEnergy = 0.6;

	ctx.save();
	ctx.globalAlpha = settings.spectrumOpacity;

	if (mode.startsWith('oscilloscope')) {
		drawOscilloscope(
			ctx,
			canvas,
			runtime,
			settings,
			buffers.timeDomain,
			dt
		);
	} else if (mode.includes('bars')) {
		if (mode.endsWith('radial')) {
			drawRadialBars(
				ctx,
				cx,
				cy,
				buffers.heights,
				buffers.peaks,
				barCount,
				settings,
				rotation,
				settings.spectrumRadialAngle ?? 0
			);
		} else {
			drawLinearBars(
				ctx,
				canvas,
				buffers.heights,
				buffers.peaks,
				barCount,
				settings,
				{ runtime, audioEnergy, dt }
			);
		}
	} else if (mode.endsWith('radial')) {
		drawRadialWave(
			ctx,
			canvas,
			cx,
			cy,
			buffers.heights,
			barCount,
			settings,
			rotation,
			settings.spectrumRadialAngle ?? 0,
			{ audioEnergy, dt }
		);
	} else {
		drawLinearWave(ctx, canvas, buffers.heights, barCount, settings, {
			runtime,
			audioEnergy,
			dt
		});
	}

	ctx.restore();
	return performance.now() - t0;
}
