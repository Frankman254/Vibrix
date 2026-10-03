import { drawCinematicTransition } from '@/features/background/render';
import type {
	ImageTransitionLayerTarget,
	VisualTransitionSnapshot,
	WallpaperState
} from '@/types/wallpaper';
import {
	createAudioChannelSelectionState,
	type AudioSnapshot
} from '@/lib/audio/audioChannels';
import {
	linkedImageTransition,
	linkedTransitionForce,
	linkedTransitionProgress
} from './linkedImageTransition';

/** Offline counterpart of the live frozen frame. Owned by one layer surface. */
export class LayerTransitionSurface {
	private transitionId: string | null = null;
	private frozen: HTMLCanvasElement | null = null;
	private output: HTMLCanvasElement | null = null;
	private showingOutput = false;
	private selection = createAudioChannelSelectionState();

	capture(
		live: HTMLCanvasElement,
		transition: VisualTransitionSnapshot | null,
		target: ImageTransitionLayerTarget
	) {
		if (transition?.id === this.transitionId) return;
		this.transitionId = transition?.id ?? null;
		const settings = linkedImageTransition(transition, target);
		if (!settings) {
			this.showingOutput = false;
			return;
		}
		this.frozen ??= document.createElement('canvas');
		this.frozen.width = live.width;
		this.frozen.height = live.height;
		this.frozen
			.getContext('2d')
			?.drawImage(
				this.showingOutput && this.output ? this.output : live,
				0,
				0
			);
		this.showingOutput = false;
	}

	composite(
		live: HTMLCanvasElement,
		transition: VisualTransitionSnapshot | null,
		target: ImageTransitionLayerTarget,
		timeMs: number,
		audio: AudioSnapshot | null,
		state: WallpaperState
	): HTMLCanvasElement {
		const settings = linkedImageTransition(transition, target);
		const progress = transition
			? linkedTransitionProgress(transition, timeMs)
			: 1;
		if (!settings || !transition || !this.frozen || progress >= 1) {
			this.showingOutput = false;
			return live;
		}
		this.output ??= document.createElement('canvas');
		const output = this.output;
		if (output.width !== live.width) output.width = live.width;
		if (output.height !== live.height) output.height = live.height;
		const ctx = output.getContext('2d');
		if (!ctx) return live;
		ctx.clearRect(0, 0, output.width, output.height);
		const from = this.frozen;
		drawCinematicTransition({
			ctx,
			width: output.width,
			height: output.height,
			type: settings.transitionType,
			progress,
			intensity: linkedTransitionForce(
				transition,
				audio,
				state,
				this.selection
			),
			opacity: 1,
			drawFrom: targetCtx =>
				targetCtx.drawImage(from, 0, 0, output.width, output.height),
			drawTo: targetCtx => targetCtx.drawImage(live, 0, 0)
		});
		this.showingOutput = true;
		return output;
	}
	dispose() {
		for (const canvas of [this.frozen, this.output])
			if (canvas) {
				canvas.width = 0;
				canvas.height = 0;
			}
		this.frozen = null;
		this.output = null;
		this.transitionId = null;
		this.showingOutput = false;
		this.selection = createAudioChannelSelectionState();
	}
}
