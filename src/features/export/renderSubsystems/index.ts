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
import { createGlobalBackgroundSubsystem } from './globalBackground';
import { createOverlaysSubsystem } from './overlays';
import {
	createFlashLightSubsystem,
	createStageLightsSubsystem
} from './stageFx';

let installed = false;

export function installDefaultRenderSubsystems(): void {
	if (installed) return;
	installed = true;
	registerRenderSubsystem(createGlobalBackgroundSubsystem());
	registerRenderSubsystem(backgroundSubsystem);
	registerRenderSubsystem(createStageLightsSubsystem());
	registerRenderSubsystem(looksSubsystem);
	registerRenderSubsystem(motionSubsystem);
	registerRenderSubsystem(particlesSubsystem);
	registerRenderSubsystem(rainSubsystem);
	registerRenderSubsystem(spectrumSubsystem);
	registerRenderSubsystem(logoSubsystem);
	registerRenderSubsystem(trackTitleSubsystem);
	registerRenderSubsystem(lyricsSubsystem);
	registerRenderSubsystem(createOverlaysSubsystem());
	registerRenderSubsystem(createFlashLightSubsystem());
	registerRenderSubsystem(hudSubsystem);
}
