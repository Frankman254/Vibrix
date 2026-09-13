import { registerRenderSubsystem } from '../renderSubsystem';
import {
	logoSubsystem,
	lyricsSubsystem,
	spectrumSubsystem,
	trackTitleSubsystem
} from './audioLayers';
import {
	backgroundSubsystem,
	hudSubsystem,
	looksSubsystem,
	motionSubsystem,
	particlesSubsystem,
	rainSubsystem
} from './stubs';
import { createOverlaysSubsystem } from './overlays';

let installed = false;

export function installDefaultRenderSubsystems(): void {
	if (installed) return;
	installed = true;
	registerRenderSubsystem(backgroundSubsystem);
	registerRenderSubsystem(looksSubsystem);
	registerRenderSubsystem(motionSubsystem);
	registerRenderSubsystem(particlesSubsystem);
	registerRenderSubsystem(rainSubsystem);
	registerRenderSubsystem(spectrumSubsystem);
	registerRenderSubsystem(logoSubsystem);
	registerRenderSubsystem(trackTitleSubsystem);
	registerRenderSubsystem(lyricsSubsystem);
	registerRenderSubsystem(createOverlaysSubsystem());
	registerRenderSubsystem(hudSubsystem);
}
