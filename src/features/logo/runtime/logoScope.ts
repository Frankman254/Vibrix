/**
 * Per-scope logo state.
 *
 * The logo runtime used to keep one envelope, one rotation counter and (in
 * the overlay registry) one channel-selection state as module globals: the
 * offline export and the live viewport mutated the same objects, so exporting
 * changed the on-screen logo and vice versa. A scope owns that state; live
 * components keep the default scope, each export run creates its own.
 */
import {
	createAudioChannelSelectionState,
	type AudioChannelSelectionState
} from '@/lib/audio/audioChannels';
import { createAudioEnvelope, type AudioEnvelope } from '@/utils/audioEnvelope';

export type LogoScope = {
	envelope: AudioEnvelope;
	/** Accumulated rotation (rad). Driven by `logoRotationSpeed * dt`. */
	rotation: number;
	/** Auto channel-selection state for the logo's audio-reactive drive. */
	channelSelection: AudioChannelSelectionState;
};

export function createLogoScope(): LogoScope {
	return {
		envelope: createAudioEnvelope(),
		rotation: 0,
		channelSelection: createAudioChannelSelectionState('kick')
	};
}

/** The scope live components use when no scope is threaded to them. */
export const LIVE_LOGO_SCOPE: LogoScope = createLogoScope();

export function resetLogoScope(scope: LogoScope): void {
	scope.envelope.reset();
	scope.rotation = 0;
	scope.channelSelection = createAudioChannelSelectionState('kick');
}
