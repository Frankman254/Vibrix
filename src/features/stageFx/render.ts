/**
 * Stage FX domain — canvas draw path.
 *
 * The beam and flash math without React or the store, split by consumer like
 * `features/background/render.ts`: the live canvases in `./ui` and the
 * offline video exporter import this.
 */
export {
	createFlashLightRuntime,
	drawFlashLight,
	resolveFlashLightColor,
	stepFlashLight
} from './flashLightDraw';
export type { FlashLightRuntime, FlashLightSettings } from './flashLightDraw';
export {
	createStageLightsRuntime,
	drawStageLights,
	stepStageLights
} from './stageLightsDraw';
export type {
	StageLightsDrawResult,
	StageLightsPalettes,
	StageLightsRuntime,
	StageLightsSettings
} from './stageLightsDraw';
export {
	createCameraFxRuntime,
	isCameraFxActive,
	resolveCameraLayerOffset,
	stepCameraFx
} from './cameraFxDraw';
export type {
	CameraFxFrame,
	CameraFxRuntime,
	CameraFxSettings,
	CameraOffset
} from './cameraFxDraw';
