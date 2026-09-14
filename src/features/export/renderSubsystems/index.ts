import { registerRenderSubsystem } from '../renderSubsystem';
import {
	logoSubsystem,
	lyricsSubsystem,
	spectrumSubsystem,
	trackTitleSubsystem
} from './audioLayers';
import { backgroundSubsystem, hudSubsystem } from './stubs';
import { createGlobalBackgroundSubsystem } from './globalBackground';
import { createOverlaysSubsystem } from './overlays';
import { createSceneGlSubsystems } from './sceneGl';
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
	for (const subsystem of createSceneGlSubsystems()) {
		registerRenderSubsystem(subsystem);
	}
	registerRenderSubsystem(spectrumSubsystem);
	registerRenderSubsystem(logoSubsystem);
	registerRenderSubsystem(trackTitleSubsystem);
	registerRenderSubsystem(lyricsSubsystem);
	registerRenderSubsystem(createOverlaysSubsystem());
	registerRenderSubsystem(createFlashLightSubsystem());
	registerRenderSubsystem(hudSubsystem);
}
