import type {
	ImageTransitionLayerTarget,
	VisualTransitionSnapshot,
	WallpaperState
} from '@/types/wallpaper';
import {
	resolveAudioChannelValue,
	type AudioSnapshot,
	type AudioChannelSelectionState
} from '@/lib/audio/audioChannels';

export function linkedImageTransition(
	transition: VisualTransitionSnapshot | null,
	target?: ImageTransitionLayerTarget
) {
	if (!target || transition?.fromImageId === transition?.toImageId)
		return null;
	const settings = transition?.imageTransition;
	return settings?.targets.includes(target) ? settings : null;
}

export function linkedTransitionProgress(
	transition: VisualTransitionSnapshot,
	nowMs: number
): number {
	const duration =
		(transition.imageTransition?.transitionDuration ?? 0) * 1000;
	if (duration <= 0) return 1;
	const p = Math.max(
		0,
		Math.min(1, (nowMs - transition.startedAtMs) / duration)
	);
	return p * p * (3 - 2 * p);
}

export function linkedTransitionForce(
	transition: VisualTransitionSnapshot,
	audio: AudioSnapshot | null,
	state: Pick<
		WallpaperState,
		| 'slideshowTransitionAudioSmoothing'
		| 'audioAutoKickThreshold'
		| 'audioAutoSwitchHoldMs'
	>,
	selection: AudioChannelSelectionState
) {
	const settings = transition.imageTransition;
	if (!settings) return 1;
	const level = audio
		? resolveAudioChannelValue(
				audio.channels,
				settings.transitionAudioChannel,
				selection,
				state.slideshowTransitionAudioSmoothing,
				state.audioAutoKickThreshold,
				state.audioAutoSwitchHoldMs,
				audio.timestampMs
			).value
		: 0;
	return Math.max(
		0.2,
		Math.min(
			3.5,
			settings.transitionIntensity + level * settings.transitionAudioDrive
		)
	);
}
