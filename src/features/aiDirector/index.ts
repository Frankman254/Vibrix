/**
 * AI Director — pure model.
 *
 * Turns an image into a `SceneIntent` (a small, versioned description of how
 * the wallpaper should look) and compiles that intent into a scene patch. The
 * compiler is deterministic: same intent, same patch, model or not. The model
 * only ever produces the *intent*, never the state — which is what keeps a
 * bad completion from writing nonsense into a saved project.
 *
 * Nothing here touches React or the network except `client/sceneIntentClient`,
 * which talks to `backend/server/` (the API key lives there, never in the
 * browser). `./ui` carries the editor panels.
 *
 * At 3.6k LOC this is the fourth-largest domain in the repo, and until now it
 * had no facade at all and its three panels lived under
 * `components/controls/tabs/main/scene/` — the same shape `export` had before
 * it was migrated.
 */

// --- The intent vocabulary ----------------------------------------------
export {
	SCENE_INTENT_VERSION,
	PARTICLES_PRESETS,
	RAIN_PRESETS,
	LOOKS_PRESETS,
	LIGHTS_PRESETS,
	SPECTRUM_FAMILIES,
	SPECTRUM_MODES,
	SPECTRUM_SHAPES,
	defaultSceneIntent,
	parseSceneIntent
} from './intent/sceneIntent';
export type {
	SceneIntent,
	ParticlesPreset,
	RainPreset,
	LooksPreset
} from './intent/sceneIntent';

// --- Draft: intent + signature → a previewable patch ---------------------
export {
	draftFromSignature,
	draftWithIntent,
	buildDraftPatch,
	snapshotForPatch,
	shouldApplySceneIntentResult
} from './sceneDraft';
export type { SceneDraft, SceneDraftSource } from './sceneDraft';

// --- Asking the model (through our own backend) -------------------------
export {
	requestSceneIntent,
	probeSceneIntentService
} from './client/sceneIntentClient';
export type {
	SceneIntentResult,
	SceneIntentSource,
	SceneIntentServiceStatus,
	RequestSceneIntentOptions
} from './client/sceneIntentClient';

// --- Image analysis ------------------------------------------------------
export { analyzeImageUrl } from './analysis/analyzeImageUrl';
export {
	IMAGE_SIGNATURE_VERSION,
	computeImageSignature
} from './analysis/imageSignature';
export type {
	ImageSignature,
	PaletteEntry,
	PixelSource
} from './analysis/imageSignature';
export {
	getOrComputeSignature,
	readCachedSignature,
	writeCachedSignature,
	invalidateCachedSignature
} from './analysis/signatureCache';
export { clusterSignatures } from './analysis/clusterSignatures';
export type {
	SignatureEntry,
	SignatureCluster,
	ClusterOptions
} from './analysis/clusterSignatures';

// --- Batch: one pass over the whole pool ---------------------------------
export { buildBatchScenes } from './batch/buildBatchScenes';
export type {
	BatchImageIntent,
	BatchScenesResult,
	BuildBatchScenesOptions
} from './batch/buildBatchScenes';

// --- Music Director plan seam (pure; deterministic producer today) -------
export {
	MUSIC_DIRECTOR_PLAN_VERSION,
	sectionsFromEnergyTimeline,
	modulateIntent,
	buildMusicDirectorPlan,
	parseMusicDirectorPlan
} from './music/musicDirectorPlan';
export type {
	MusicSection,
	MusicDirectorPlan,
	BuildMusicDirectorPlanOptions,
	ParseMusicDirectorPlanResult
} from './music/musicDirectorPlan';
export { energyWindows, median } from './music/energyWindows';
export type { EnergyPoint } from './music/energyWindows';
export { personalizeIntent } from './batch/personalizeIntent';
