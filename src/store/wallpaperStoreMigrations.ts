/**
 * PERSISTENCE MODEL — THREE LAYERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Layer 1 — SCENE STATE  (persisted to IndexedDB, key: 'vibrix-state')
 *   All visual settings: filters, spectrum, logo, particles, rain, slideshow,
 *   filters, layer z-indices, presets, editor theme, language.
 *   BackgroundImageItem.url and OverlayImageItem.url are set to null before
 *   saving — they are reconstructed from Layer 2 on load.
 *
 * Layer 2 — ASSET REFERENCES  (persisted to IndexedDB via imageDb.ts)
 *   Blob URLs for uploaded background images, overlay images, and logo.
 *   Keys: imageIds[], logoId, overlays[].assetId
 *   Reconstructed on load by useRestoreWallpaperAssets hook.
 *
 * Layer 3 — RUNTIME STATE  (never persisted, dropped by partialize)
 *   audioCaptureState, imageUrl, globalBackgroundUrl, logoUrl, imageUrls,
 *   isPresetDirty, editorPanelOpen, editorOverlayOpen, backgroundFallbackVisible,
 *   and all UI-only action setters.
 *
 * When adding a new state field:
 *   - Scene field: add to WallpaperState, include in DEFAULT_STATE, and add
 *     a ?? fallback in migrateWallpaperStore.
 *   - Asset field: store the id in Layer 1 and the blob URL in Layer 2.
 *   - Runtime field: add to the exclusion list in partializeWallpaperStore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { DEFAULT_STATE } from '@/store/defaultState';
import { APP_LOGO_URL, LEGACY_APP_LOGO_URL } from '@/config/appLogo';
import { CANONICAL_FACTORY_LOGO_URL } from '@/lib/canonicalFactoryPresets';
import {
	convertLegacySpectrumCloneState,
	createDefaultSpectrumInstance
} from '@/features/spectrum';
import { hydrateSpectrumProfileValues } from '@/features/spectrum';
import {
	RGB_SHIFT_AUDIO_KEYS,
	CUSTOM_FILTER_LOOK_ID,
	extractFilterLookSettingsFromState,
	extractRgbShiftAudioSettings,
	toFilterLookSlotSelectionId
} from '@/features/filterLooks/filterLooks';
import {
	createDefaultEffectLayer,
	DEFAULT_EFFECT_LAYER_ID
} from '@/features/filterLooks/effectLayers';
import {
	createDefaultMotionLayer,
	DEFAULT_MOTION_LAYER_ID,
	extractMotionLayerSettingsFromState
} from '@/features/stageFx/motionLayers';
import { getCurrentViewportResolution } from '@/features/layout/viewportMetrics';
import { normalizeSpectrumSettings } from '@/features/spectrum';
import {
	normalizeSpectrumFamily,
	normalizeSpectrumShape
} from '@/features/spectrum';
import {
	createProfileSlotId,
	createDefaultBackgroundProfileSlots,
	createDefaultCameraFxProfileSlots,
	createDefaultLightsProfileSlots,
	createDefaultLogoProfileSlots,
	createDefaultLooksProfileSlots,
	createDefaultParticlesProfileSlots,
	createDefaultRainProfileSlots,
	createDefaultSpectrumProfileSlots,
	createDefaultSpectrumSecondProfileSlots,
	createDefaultTrackTitleProfileSlots,
	extractLooksProfileSettings,
	hydrateLooksProfileValues,
	normalizeProfileSlots,
	BACKGROUND_PROFILE_SLOT_COUNT,
	MAX_CAMERA_FX_SLOT_COUNT,
	MAX_LIGHTS_SLOT_COUNT,
	MAX_LOGO_SLOT_COUNT,
	MAX_LOOKS_SLOT_COUNT,
	MAX_PARTICLES_SLOT_COUNT,
	MAX_RAIN_SLOT_COUNT,
	MAX_SPECTRUM_SLOT_COUNT,
	MAX_TRACK_TITLE_SLOT_COUNT,
	PARTICLES_PROFILE_KEYS,
	RAIN_PROFILE_KEYS,
	type ParticlesProfileSettings,
	type RainProfileSettings
} from '@/store/featureProfiles';
import {
	buildBackgroundImageCollectionPatch,
	normalizePersistedBackgroundImages
} from '@/store/backgroundStoreUtils';
import type { WallpaperStore } from '@/store/wallpaperStoreTypes';
import type { ProfileSlot } from '@/types/wallpaper';
import type { LyricsLayerColorMode } from '@/features/lyrics';
import type { ColorSourceMode } from '@/types/wallpaper';

function normalizeParticleColorMode(
	raw: unknown,
	fallback: WallpaperStore['particleColorMode']
): WallpaperStore['particleColorMode'] {
	if (raw === 'random') return 'rainbow';
	if (
		raw === 'solid' ||
		raw === 'gradient' ||
		raw === 'rainbow' ||
		raw === 'rotateRgb' ||
		raw === 'completeRotate'
	) {
		return raw;
	}
	return fallback;
}

function normalizeParticleAudioDriftMode(
	value: unknown,
	fallback: WallpaperStore['particleAudioDriftMode']
): WallpaperStore['particleAudioDriftMode'] {
	switch (value) {
		case 'velocity':
		case 'offset':
		case 'burst':
			return value;
		default:
			return fallback;
	}
}

function normalizeNowPlayingTextTreatment(
	value: unknown,
	fallback: WallpaperStore['nowPlayingTextTreatment']
): WallpaperStore['nowPlayingTextTreatment'] {
	switch (value) {
		case 'solid':
		case 'gradient':
		case 'metallic':
		case 'neon':
		case 'glass':
		case 'shadow':
			return value;
		default:
			return fallback;
	}
}

function normalizeLyricsTextTransition(
	value: unknown,
	fallback: WallpaperStore['audioLyricsTransitionIn']
): WallpaperStore['audioLyricsTransitionIn'] {
	switch (value) {
		case 'none':
		case 'fade':
		case 'slide-up':
		case 'slide-down':
		case 'scale':
		case 'blur':
		case 'pop':
			return value;
		default:
			return fallback;
	}
}

function normalizeLyricsActiveAnimation(
	value: unknown,
	fallback: WallpaperStore['audioLyricsActiveAnimation']
): WallpaperStore['audioLyricsActiveAnimation'] {
	switch (value) {
		case 'none':
		case 'pulse':
		case 'glow-pulse':
		case 'breathing':
		case 'shake-light':
		case 'wave':
		case 'flicker':
			return value;
		default:
			return fallback;
	}
}

function normalizeParticleDepthFlowDirection(
	value: unknown,
	fallback: WallpaperStore['particleDepthFlowDirection']
): WallpaperStore['particleDepthFlowDirection'] {
	switch (value) {
		case 'towardViewer':
		case 'awayFromViewer':
			return value;
		default:
			return fallback;
	}
}

function normalizeParticleDepthFlowMode(
	value: unknown,
	fallback: WallpaperStore['particleDepthFlowMode']
): WallpaperStore['particleDepthFlowMode'] {
	switch (value) {
		case 'pullToCamera':
		case 'pushFromFocus':
		case 'tunnelBurst':
		case 'snowRush':
			return value;
		default:
			return fallback;
	}
}

function normalizeParticleDepthFlowSpawnOrigin(
	value: unknown,
	fallback: WallpaperStore['particleDepthFlowSpawnOrigin']
): WallpaperStore['particleDepthFlowSpawnOrigin'] {
	switch (value) {
		case 'randomScreen':
		case 'fromFocus':
		case 'fromEdges':
		case 'fromCenter':
		case 'fromTop':
		case 'fromBottom':
			return value;
		default:
			return fallback;
	}
}

function normalizeParticleDepthFlowLowEnergyAxis(
	value: unknown,
	fallback: WallpaperStore['particleDepthFlowInvertFocusAxis']
): WallpaperStore['particleDepthFlowInvertFocusAxis'] {
	switch (value) {
		case 'x':
		case 'y':
		case 'both':
			return value;
		default:
			return fallback;
	}
}

function normalizeAudioChannel(
	value: unknown,
	fallback: WallpaperStore['logoBandMode']
) {
	switch (value) {
		case 'auto':
		case 'full':
		case 'kick':
		case 'instrumental':
		case 'bass':
		case 'hihat':
		case 'vocal':
			return value;
		case 'peak':
			return 'kick';
		case 'mid':
			return 'instrumental';
		case 'treble':
			return 'hihat';
		case 'low-mid':
			return 'instrumental';
		case 'high-mid':
			return 'vocal';
		default:
			return fallback;
	}
}

function normalizeAudioSourceMode(
	value: unknown,
	fallback: WallpaperStore['audioSourceMode']
) {
	switch (value) {
		case 'none':
		case 'desktop':
		case 'microphone':
		case 'file':
			return value;
		default:
			return fallback;
	}
}

function normalizeThemeColorSource(
	value: unknown,
	fallback: WallpaperStore['editorThemeColorSource']
): WallpaperStore['editorThemeColorSource'] {
	switch (value) {
		case 'manual':
		case 'theme':
		case 'image':
			return value;
		case 'background':
			return 'image';
		case 'default':
			return 'theme';
		default:
			return fallback;
	}
}

function normalizeColorSourceMode(
	value: unknown,
	fallback: WallpaperStore['particleColorSource']
): WallpaperStore['particleColorSource'] {
	if (value === 'manual' || value === 'theme' || value === 'image')
		return value;
	if (value === 'background') return 'image';
	return fallback;
}

function normalizeSpectrumRotationDrive(
	value: unknown
): WallpaperStore['spectrumRotationDrive'] {
	if (
		value === 'off' ||
		value === 'fixed' ||
		value === 'audio' ||
		value === 'fixed-audio'
	) {
		return value;
	}
	return DEFAULT_STATE.spectrumRotationDrive;
}

function normalizeSpectrumRotationChannel(
	value: unknown
): WallpaperStore['spectrumRotationChannel'] {
	if (
		value === 'kick' ||
		value === 'bass' ||
		value === 'full' ||
		value === 'selected'
	) {
		return value;
	}
	return DEFAULT_STATE.spectrumRotationChannel;
}

function normalizeRotationDirection(
	value: unknown,
	legacySpeed: number
): WallpaperStore['spectrumRotationDirection'] {
	if (value === 'cw' || value === 'ccw') return value;
	return legacySpeed < 0 ? 'ccw' : 'cw';
}

function normalizeFxAudioChannel(
	value: unknown,
	fallback: WallpaperStore['stageLightsAudioChannel']
): WallpaperStore['stageLightsAudioChannel'] {
	if (value === 'kick' || value === 'bass' || value === 'full') return value;
	return fallback;
}

function normalizeFxBandThresholds(
	value: unknown,
	fallback: WallpaperStore['stageLightsBandThresholds']
): WallpaperStore['stageLightsBandThresholds'] {
	const record =
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	return {
		kick: finiteOrDefault(record.kick, fallback.kick),
		bass: finiteOrDefault(record.bass, fallback.bass),
		full: finiteOrDefault(record.full, fallback.full)
	};
}

function normalizeStageLightsBlendMode(
	value: unknown
): WallpaperStore['stageLightsBlendMode'] {
	if (value === 'lighter' || value === 'screen' || value === 'source-over') {
		return value;
	}
	return DEFAULT_STATE.stageLightsBlendMode;
}

function normalizeStageLightsOrigin(
	value: unknown
): WallpaperStore['stageLightsOrigin'] {
	if (
		value === 'top' ||
		value === 'bottom' ||
		value === 'left' ||
		value === 'right' ||
		value === 'top-bottom' ||
		value === 'sides' ||
		value === 'all'
	) {
		return value;
	}
	return DEFAULT_STATE.stageLightsOrigin;
}

function normalizeStageLightsMovementMode(
	value: unknown
): WallpaperStore['stageLightsMovementMode'] {
	if (
		value === 'top-down' ||
		value === 'bottom-up' ||
		value === 'left-right' ||
		value === 'right-left' ||
		value === 'cross-sweep' ||
		value === 'radial-sweep' ||
		value === 'circular-sweep'
	) {
		return value;
	}
	return DEFAULT_STATE.stageLightsMovementMode;
}

function normalizeFlashLightShape(
	value: unknown
): WallpaperStore['flashLightShape'] {
	if (
		value === 'full-screen' ||
		value === 'circular-burst' ||
		value === 'horizontal-blast' ||
		value === 'vertical-blast' ||
		value === 'center-bloom' ||
		value === 'edge-flash' ||
		value === 'vignette-invert'
	) {
		return value;
	}
	return DEFAULT_STATE.flashLightShape;
}

function normalizeCameraMotionMode(
	value: unknown
): WallpaperStore['cameraMotionMode'] {
	if (
		value === 'none' ||
		value === 'drift' ||
		value === 'circle' ||
		value === 'semicircle' ||
		value === 'figure-eight' ||
		value === 'orbit' ||
		value === 'pendulum'
	) {
		return value;
	}
	return DEFAULT_STATE.cameraMotionMode;
}

function normalizeCameraMotionDirection(
	value: unknown
): WallpaperStore['cameraMotionDirection'] {
	return value === 'ccw' ? 'ccw' : 'cw';
}

function normalizeCameraMotionDrive(
	value: unknown
): WallpaperStore['cameraMotionDrive'] {
	if (value === 'fixed' || value === 'audio' || value === 'fixed-audio') {
		return value;
	}
	return DEFAULT_STATE.cameraMotionDrive;
}

function normalizeCameraMotionTarget(
	value: unknown
): WallpaperStore['cameraMotionTarget'] {
	if (
		value === 'global-background' ||
		value === 'background' ||
		value === 'selected-overlay' ||
		value === 'logo' ||
		value === 'spectrum' ||
		value === 'particles' ||
		value === 'rain' ||
		value === 'track-title' ||
		value === 'lyrics' ||
		value === 'stage-lights' ||
		value === 'flash-light'
	) {
		return value;
	}
	return DEFAULT_STATE.cameraMotionTarget;
}

function normalizeCameraMotionTargets(
	value: unknown,
	legacyValue: unknown
): WallpaperStore['cameraMotionTargets'] {
	const normalizeOne = (
		target: unknown
	): WallpaperStore['cameraMotionTargets'][number] | null => {
		if (target === 'all') return null;
		if (target === 'background-spectrum') return null;
		const normalized = normalizeCameraMotionTarget(target);
		return normalized === DEFAULT_STATE.cameraMotionTarget &&
			target !== DEFAULT_STATE.cameraMotionTarget
			? null
			: normalized;
	};

	const source = Array.isArray(value) ? value : [legacyValue];
	const next = new Set<WallpaperStore['cameraMotionTargets'][number]>();
	for (const target of source) {
		if (target === 'all') {
			next.add('global-background');
			next.add('background');
			next.add('selected-overlay');
			next.add('logo');
			next.add('spectrum');
			next.add('particles');
			next.add('rain');
			next.add('track-title');
			next.add('lyrics');
			next.add('stage-lights');
			next.add('flash-light');
			continue;
		}
		if (target === 'background-spectrum') {
			next.add('background');
			next.add('spectrum');
			continue;
		}
		const normalized = normalizeOne(target);
		if (normalized) next.add(normalized);
	}

	return next.size > 0 ? [...next] : DEFAULT_STATE.cameraMotionTargets;
}

function normalizeCameraShakeMode(
	value: unknown
): WallpaperStore['cameraShakeMode'] {
	if (
		value === 'horizontal' ||
		value === 'vertical' ||
		value === 'free' ||
		value === 'punch' ||
		value === 'jitter' ||
		value === 'kick-snap'
	) {
		return value;
	}
	return DEFAULT_STATE.cameraShakeMode;
}

function finiteOrDefault(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: fallback;
}

function normalizeAudioLyricsTrackEntries(
	value: unknown
): WallpaperStore['audioLyricsByTrackAssetId'] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return DEFAULT_STATE.audioLyricsByTrackAssetId;
	}
	const next: WallpaperStore['audioLyricsByTrackAssetId'] = {};
	for (const [assetId, rawEntry] of Object.entries(value)) {
		if (
			!rawEntry ||
			typeof rawEntry !== 'object' ||
			Array.isArray(rawEntry)
		) {
			continue;
		}
		const entry = rawEntry as Record<string, unknown>;
		const lyrixaLayerOverrides = normalizeLyrixaLayerOverrides(
			entry.lyrixaLayerOverrides
		);
		next[assetId] = {
			mode:
				entry.mode === 'lrc' ||
				entry.mode === 'plain' ||
				entry.mode === 'auto'
					? entry.mode
					: 'auto',
			rawText: typeof entry.rawText === 'string' ? entry.rawText : '',
			lyrixaBundle:
				entry.lyrixaBundle &&
				typeof entry.lyrixaBundle === 'object' &&
				!Array.isArray(entry.lyrixaBundle)
					? (entry.lyrixaBundle as WallpaperStore['audioLyricsByTrackAssetId'][string]['lyrixaBundle'])
					: null,
			lyrixaRenderMode:
				entry.lyrixaRenderMode === 'bundle' ? 'bundle' : 'editor',
			...(lyrixaLayerOverrides ? { lyrixaLayerOverrides } : {})
		};
	}
	return next;
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: undefined;
}

function normalizeLyricsColorMode(
	value: unknown
): LyricsLayerColorMode | undefined {
	return value === 'solid' ||
		value === 'gradient' ||
		value === 'rainbow' ||
		value === 'visible-rotate' ||
		value === 'complete-rotate'
		? value
		: undefined;
}

function normalizeLyricsColorSource(
	value: unknown
): ColorSourceMode | undefined {
	return value === 'manual' || value === 'image' || value === 'theme'
		? value
		: undefined;
}

/**
 * The three color slots of a lyric layer (fill / stroke / glow) persist the
 * same four keys each; keeping them in one place is what stops a new slot from
 * being silently dropped on rehydrate.
 */
function lyricsColorSlotFields(
	slot: 'text' | 'stroke' | 'glow',
	override: Record<string, unknown>
): Record<string, unknown> {
	const colorKey = `${slot}Color`;
	const modeKey = `${slot}ColorMode`;
	const secondaryKey = `${slot}ColorSecondary`;
	const sourceKey = `${slot}ColorSource`;
	const mode = normalizeLyricsColorMode(override[modeKey]);
	const source = normalizeLyricsColorSource(override[sourceKey]);
	return {
		...(typeof override[colorKey] === 'string'
			? { [colorKey]: override[colorKey] }
			: {}),
		...(mode ? { [modeKey]: mode } : {}),
		...(typeof override[secondaryKey] === 'string'
			? { [secondaryKey]: override[secondaryKey] }
			: {}),
		...(source ? { [sourceKey]: source } : {})
	};
}

function normalizeLyrixaLayerOverrides(
	value: unknown
): WallpaperStore['audioLyricsByTrackAssetId'][string]['lyrixaLayerOverrides'] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const next: NonNullable<
		WallpaperStore['audioLyricsByTrackAssetId'][string]['lyrixaLayerOverrides']
	> = {};
	for (const [layerId, rawOverride] of Object.entries(value)) {
		if (
			!layerId ||
			!rawOverride ||
			typeof rawOverride !== 'object' ||
			Array.isArray(rawOverride)
		) {
			continue;
		}
		const override = rawOverride as Record<string, unknown>;
		const normalized = {
			...(typeof override.visible === 'boolean'
				? { visible: override.visible }
				: {}),
			...(finiteNumber(override.positionOffsetX) !== undefined
				? { positionOffsetX: finiteNumber(override.positionOffsetX) }
				: {}),
			...(finiteNumber(override.positionOffsetY) !== undefined
				? { positionOffsetY: finiteNumber(override.positionOffsetY) }
				: {}),
			...(finiteNumber(override.scale) !== undefined
				? { scale: finiteNumber(override.scale) }
				: {}),
			...(finiteNumber(override.opacity) !== undefined
				? { opacity: finiteNumber(override.opacity) }
				: {}),
			...(finiteNumber(override.glowIntensity) !== undefined
				? { glowIntensity: finiteNumber(override.glowIntensity) }
				: {}),
			...(finiteNumber(override.blurAmount) !== undefined
				? { blurAmount: finiteNumber(override.blurAmount) }
				: {}),
			...lyricsColorSlotFields('text', override),
			...lyricsColorSlotFields('stroke', override),
			...lyricsColorSlotFields('glow', override),
			...(finiteNumber(override.strokeWidth) !== undefined
				? { strokeWidth: finiteNumber(override.strokeWidth) }
				: {})
		};
		if (Object.keys(normalized).length > 0) {
			next[layerId] = normalized;
		}
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

function migrateParticlesProfileSlots(state: Partial<WallpaperStore>) {
	return normalizeProfileSlots(
		state.particlesProfileSlots,
		createDefaultParticlesProfileSlots,
		'Particles',
		MAX_PARTICLES_SLOT_COUNT
	);
}

function migrateRainProfileSlots(state: Partial<WallpaperStore>) {
	return normalizeProfileSlots(
		state.rainProfileSlots,
		createDefaultRainProfileSlots,
		'Rain',
		MAX_RAIN_SLOT_COUNT
	);
}

function migrateLooksProfileSlots(state: Partial<WallpaperStore>) {
	return normalizeProfileSlots(
		state.looksProfileSlots,
		createDefaultLooksProfileSlots,
		'Look',
		MAX_LOOKS_SLOT_COUNT
	);
}

function migrateLightsProfileSlots(state: Partial<WallpaperStore>) {
	return normalizeProfileSlots(
		state.lightsProfileSlots,
		createDefaultLightsProfileSlots,
		'Lights',
		MAX_LIGHTS_SLOT_COUNT
	);
}

function migrateCameraFxProfileSlots(state: Partial<WallpaperStore>) {
	return normalizeProfileSlots(
		state.cameraFxProfileSlots,
		createDefaultCameraFxProfileSlots,
		'Camera',
		MAX_CAMERA_FX_SLOT_COUNT
	);
}

function migrateTrackTitleProfileSlots(state: Partial<WallpaperStore>) {
	return normalizeProfileSlots(
		state.trackTitleProfileSlots,
		createDefaultTrackTitleProfileSlots,
		'Track Title',
		MAX_TRACK_TITLE_SLOT_COUNT
	);
}

type MigratedSlotFamilies = {
	spectrumProfileSlots: WallpaperStore['spectrumProfileSlots'];
	spectrumSecondProfileSlots: WallpaperStore['spectrumSecondProfileSlots'];
	looksProfileSlots: WallpaperStore['looksProfileSlots'];
	particlesProfileSlots: WallpaperStore['particlesProfileSlots'];
	rainProfileSlots: WallpaperStore['rainProfileSlots'];
	lightsProfileSlots: WallpaperStore['lightsProfileSlots'];
	cameraFxProfileSlots: WallpaperStore['cameraFxProfileSlots'];
	logoProfileSlots: WallpaperStore['logoProfileSlots'];
	trackTitleProfileSlots: WallpaperStore['trackTitleProfileSlots'];
};

/**
 * v104: bindings reference slots by stable `id`, never by array position.
 * A legacy numeric ref translates to the id of the slot at that position in
 * the already-migrated family (which minted/preserved ids in
 * `normalizeProfileSlots`). Numeric refs only exist in pre-v104 saves, so the
 * conversion is idempotent by construction — no version gate needed.
 */
function migrateSlotRef(
	value: unknown,
	family: ReadonlyArray<{ id: string }>
): import('@/types/wallpaper').SceneSlotRef {
	if (value === 'off') return 'off';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' && Number.isFinite(value)) {
		return family[Math.trunc(value)]?.id ?? null;
	}
	return null;
}

function migrateSceneSlots(
	state: Partial<WallpaperStore>,
	families: MigratedSlotFamilies
): WallpaperStore['sceneSlots'] {
	const raw = (state as { sceneSlots?: unknown }).sceneSlots;
	if (!Array.isArray(raw)) return DEFAULT_STATE.sceneSlots;
	return raw
		.filter(
			(s): s is Record<string, unknown> =>
				!!s && typeof s === 'object' && typeof s.id === 'string'
		)
		.map(s => ({
			id: String(s.id),
			name: typeof s.name === 'string' ? s.name : 'Scene',
			// Pre-v104 saves carry the *SlotIndex field names with numeric refs;
			// read whichever key is present and translate to a slot id.
			spectrumSlotId: migrateSlotRef(
				s.spectrumSlotId ?? s.spectrumSlotIndex,
				families.spectrumProfileSlots
			),
			// v97: scenes can bind Spectrum 2 independently; old scenes lack the
			// field → null (Spectrum 1's bundled portion keeps driving it).
			spectrumSecondSlotId: migrateSlotRef(
				s.spectrumSecondSlotId ?? s.spectrumSecondSlotIndex,
				families.spectrumSecondProfileSlots
			),
			looksSlotId: migrateSlotRef(
				s.looksSlotId ?? s.looksSlotIndex,
				families.looksProfileSlots
			),
			particlesSlotId: migrateSlotRef(
				s.particlesSlotId ?? s.particlesSlotIndex,
				families.particlesProfileSlots
			),
			rainSlotId: migrateSlotRef(
				s.rainSlotId ?? s.rainSlotIndex,
				families.rainProfileSlots
			),
			lightsSlotId: migrateSlotRef(
				s.lightsSlotId ?? s.lightsSlotIndex,
				families.lightsProfileSlots
			),
			cameraFxSlotId: migrateSlotRef(
				s.cameraFxSlotId ?? s.cameraFxSlotIndex,
				families.cameraFxProfileSlots
			),
			logoSlotId: migrateSlotRef(
				s.logoSlotId ?? s.logoSlotIndex,
				families.logoProfileSlots
			),
			trackTitleSlotId: migrateSlotRef(
				s.trackTitleSlotId ?? s.trackTitleSlotIndex,
				families.trackTitleProfileSlots
			)
		}));
}

function migrateLogoProfileSlots(state: Partial<WallpaperStore>) {
	return normalizeProfileSlots(
		state.logoProfileSlots,
		createDefaultLogoProfileSlots,
		'Logo',
		MAX_LOGO_SLOT_COUNT
	).map(slot => ({
		...slot,
		values: slot.values
			? {
					...slot.values,
					logoGlowColorSource: normalizeColorSourceMode(
						slot.values.logoGlowColorSource,
						DEFAULT_STATE.logoGlowColorSource
					),
					logoShadowColorSource: normalizeColorSourceMode(
						slot.values.logoShadowColorSource,
						DEFAULT_STATE.logoShadowColorSource
					),
					logoBackdropColorSource: normalizeColorSourceMode(
						slot.values.logoBackdropColorSource,
						DEFAULT_STATE.logoBackdropColorSource
					),
					logoBandMode: normalizeAudioChannel(
						slot.values.logoBandMode,
						DEFAULT_STATE.logoBandMode
					),
					logoCircularCrop:
						slot.values.logoCircularCrop ??
						DEFAULT_STATE.logoCircularCrop,
					logoCropRadius:
						slot.values.logoCropRadius ??
						DEFAULT_STATE.logoCropRadius
				}
			: null
	}));
}

function migrateBackgroundProfileSlots(state: Partial<WallpaperStore>) {
	return normalizeProfileSlots(
		state.backgroundProfileSlots,
		createDefaultBackgroundProfileSlots,
		'BG',
		BACKGROUND_PROFILE_SLOT_COUNT
	).map(slot => ({
		...slot,
		values: slot.values
			? {
					...slot.values,
					imageAudioChannel: normalizeAudioChannel(
						slot.values.imageAudioChannel,
						DEFAULT_STATE.imageAudioChannel
					)
				}
			: null
	}));
}

type LegacyLiquidSource = Partial<WallpaperStore> & {
	spectrumLiquidRigidShape?: unknown;
};

/**
 * Resolves the per-layer rigidShape field for both new (per-layer)
 * persisted state and legacy state where rigidShape was a single global
 * flag. The legacy single-flag value seeds all 3 layers so users who had
 * the rigid shape enabled before keep the same visual after migration.
 */
function resolveLegacyLiquidRigidShape(
	source: LegacyLiquidSource,
	layer: 1 | 2 | 3
): boolean {
	const newKey = `spectrumLiquidLayer${layer}RigidShape` as const;
	const direct = source[newKey];
	if (typeof direct === 'boolean') return direct;
	if (typeof source.spectrumLiquidRigidShape === 'boolean') {
		return source.spectrumLiquidRigidShape;
	}
	return DEFAULT_STATE[newKey] as boolean;
}

/**
 * v86: the flat `spectrumClone*` key space became `spectrumInstances`. A
 * pre-v86 store carries no instances array, so the legacy clone keys (still
 * present on the raw persisted object) are converted wholesale — same math
 * the old getCloneSpectrumState remap applied at render time.
 */
function migrateSpectrumInstances(
	state: Partial<WallpaperStore>
): WallpaperStore['spectrumInstances'] {
	if (Array.isArray(state.spectrumInstances)) {
		return state.spectrumInstances.map(instance => {
			const merged = { ...createDefaultSpectrumInstance(), ...instance };
			// v95: seed glow colors from this instance's fill colors when the
			// instance predates the glow color identity, preserving its look.
			if (instance.spectrumGlowColorSource === undefined) {
				merged.spectrumGlowColorSource = 'manual';
				merged.spectrumGlowColorMode = 'gradient';
				merged.spectrumGlowPrimaryColor =
					instance.spectrumPrimaryColor ??
					merged.spectrumGlowPrimaryColor;
				merged.spectrumGlowSecondaryColor =
					instance.spectrumSecondaryColor ??
					merged.spectrumGlowSecondaryColor;
			}
			return merged;
		});
	}
	return [convertLegacySpectrumCloneState(state as Record<string, unknown>)];
}

function migrateSpectrumProfileSlots(state: Partial<WallpaperStore>) {
	// Field-by-field hydration lives in hydrateSpectrumProfileValues (shared
	// with profile loading); it also converts pre-v86 slots that still carry
	// flat legacy `spectrumClone*` keys into `spectrumInstances`.
	return normalizeProfileSlots(
		state.spectrumProfileSlots,
		createDefaultSpectrumProfileSlots,
		'Spectrum',
		MAX_SPECTRUM_SLOT_COUNT
	).map(slot => ({
		...slot,
		values: slot.values ? hydrateSpectrumProfileValues(slot.values) : null
	}));
}

// v97: Spectrum 2 gained its own independent slot list. Pre-v97 stores kept a
// single shared array where each slot carried both spectrums' looks (Spectrum 2
// in `spectrumInstances[0]`). Seed the new array from the existing slots so a
// returning user keeps the second-spectrum looks they had saved; brand-new
// fields fall back to the demo defaults.
/**
 * v97 seeds Spectrum 2's bank from Spectrum 1's when a save predates the split.
 *
 * The two banks share no mutable state afterwards: `hydrateSpectrumProfileValues`
 * whitelists scalar fields and rebuilds its one nested object
 * (`spectrumShockwaveBandThresholds`) as a fresh literal, so each bank gets its
 * own values. `spectrumSecondProfileSlots.independence` in the test suite pins
 * that down — add a nested array to the hydrate whitelist and it will fail.
 */
function migrateSpectrumSecondProfileSlots(state: Partial<WallpaperStore>) {
	const source =
		state.spectrumSecondProfileSlots ?? state.spectrumProfileSlots;
	return normalizeProfileSlots(
		source,
		createDefaultSpectrumSecondProfileSlots,
		'Spectrum',
		MAX_SPECTRUM_SLOT_COUNT
	).map(slot => ({
		...slot,
		values: slot.values ? hydrateSpectrumProfileValues(slot.values) : null
	}));
}

export function migrateWallpaperStore(
	persistedState: unknown,
	version?: number
): WallpaperStore {
	const state = persistedState as Partial<WallpaperStore> | undefined;
	if (!state) return persistedState as WallpaperStore;
	// An absent version means the payload predates versioning (or was
	// hand-written), which is the OLDEST possible shape — not the newest.
	// Reading it as "no version gate applies" made the version-gated blocks
	// below skip their conversions while the unconditional cleanup that
	// follows still deleted the legacy keys, silently destroying saved Motion
	// slots and per-image Spectrum 2 overrides. Treat unknown as 0 so every
	// conversion runs; each one is a no-op when its legacy key is absent.
	const fromVersion = typeof version === 'number' ? version : 0;
	const currentViewportReference = getCurrentViewportResolution();
	const legacyState = state as Partial<WallpaperStore> & {
		filterTarget?: string;
		spectrumLayout?: string;
		spectrumDirection?: string;
	};
	const legacySpectrumLayout = legacyState.spectrumLayout;
	const legacySpectrumDirection = legacyState.spectrumDirection;
	const legacySpectrumMode =
		legacySpectrumLayout === 'circular' ? 'radial' : 'linear';
	const legacySpectrumLinearOrientation =
		legacySpectrumLayout === 'left' || legacySpectrumLayout === 'right'
			? 'vertical'
			: 'horizontal';
	const legacySpectrumLinearDirection =
		legacySpectrumLayout === 'top' || legacySpectrumLayout === 'left'
			? 'flipped'
			: 'normal';
	const legacySpectrumPositionX =
		legacySpectrumLayout === 'left'
			? -0.85
			: legacySpectrumLayout === 'right'
				? 0.85
				: (state.spectrumPositionX ?? DEFAULT_STATE.spectrumPositionX);
	const legacySpectrumPositionY =
		legacySpectrumLayout === 'top' ||
		legacySpectrumLayout === 'top-inverted'
			? 0.85
			: legacySpectrumLayout === 'bottom' ||
				  legacySpectrumLayout === 'horizontal'
				? -0.85
				: (state.spectrumPositionY ?? DEFAULT_STATE.spectrumPositionY);
	const sanitizedState = { ...state } as Partial<WallpaperStore> &
		Record<string, unknown>;
	delete sanitizedState.glitchIntensity;
	delete sanitizedState.glitchBarWidth;
	delete sanitizedState.glitchDirection;
	delete sanitizedState.glitchFrequency;
	delete sanitizedState.glitchStyle;
	delete sanitizedState.glitchAudioReactive;
	delete sanitizedState.glitchAudioSensitivity;
	delete sanitizedState.audioTrackTitleGlitchIntensity;
	delete sanitizedState.audioTrackTitleGlitchBarWidth;
	delete sanitizedState.spectrumLayout;
	delete sanitizedState.spectrumDirection;
	delete sanitizedState.spectrumLiquidRigidShape;
	delete sanitizedState.spectrumCloneLiquidRigidShape;
	// v86: drop every legacy flat clone key after conversion to instances.
	for (const key of Object.keys(sanitizedState)) {
		if (
			key.startsWith('spectrumClone') ||
			key === 'spectrumCircularClone'
		) {
			delete sanitizedState[key];
		}
	}
	// v108: Edge Glow is gone. The subsystem was unreachable — no live UI could
	// switch it on and no renderer read it — but its 28 keys still rode along in
	// every saved project. "Flash Edge" replaced it and is unaffected; so is
	// `layer.edgeGlow`, the per-layer number, which is a different thing.
	for (const key of Object.keys(sanitizedState)) {
		if (key.startsWith('logoEdgeGlow') || key.startsWith('bgEdgeGlow')) {
			delete sanitizedState[key];
		}
	}
	// v108: knobs that were persisted but wired to nothing. `particleScanline*`
	// promised scanlines over particles — `ParticleField` has never known what a
	// scanline is. (The *Looks* scanlines, `scanlineIntensity` with no prefix,
	// are a different and very much live effect.) The other two had setters and
	// no reader at all.
	delete sanitizedState.particleScanlineIntensity;
	delete sanitizedState.particleScanlineSpacing;
	delete sanitizedState.particleScanlineThickness;
	delete sanitizedState.audioSelectedChannelSmoothing;
	delete sanitizedState.quickEditHudEnabled;
	// Dropped: every subsystem owns its own smoothing slider now. The toggles
	// previously gated a hidden value↔instantLevel branch; consumers always
	// read the smoothed value and the slider at 0 means raw.
	// v107: the canvas liquid-glass panel was removed — it re-blurred and
	// re-magnified the wallpaper behind the lyrics / Now Playing card EVERY
	// frame, and never looked the way it was meant to. Its keys are dropped so
	// they cannot linger in saved projects. (`hudLiquidGlassEnabled` is a
	// different, CSS-only feature and stays.)
	delete sanitizedState.nowPlayingLiquidGlassEnabled;
	delete sanitizedState.nowPlayingLiquidGlassBlur;
	delete sanitizedState.nowPlayingLiquidGlassMagnify;
	delete sanitizedState.nowPlayingLiquidGlassTint;
	delete sanitizedState.audioLyricsLiquidGlassEnabled;
	delete sanitizedState.audioLyricsLiquidGlassBlur;
	delete sanitizedState.audioLyricsLiquidGlassMagnify;
	delete sanitizedState.audioLyricsLiquidGlassTint;
	delete sanitizedState.spectrumAudioSmoothingEnabled;
	delete sanitizedState.spectrumCloneAudioSmoothingEnabled;
	delete sanitizedState.logoAudioSmoothingEnabled;
	delete sanitizedState.imageAudioSmoothingEnabled;
	delete sanitizedState.rgbShiftAudioSmoothingEnabled;
	// v116: Keep-Covered is unconditional. The global lock, its per-image
	// mirror (item rebuilds drop it automatically), and its per-profile-slot
	// mirrors are gone; strip them so they cannot linger in saved projects.
	delete sanitizedState.imageCoverageLockEnabled;
	for (const slot of sanitizedState.backgroundProfileSlots ?? []) {
		if (slot.values) {
			delete (slot.values as unknown as Record<string, unknown>)
				.imageCoverageLockEnabled;
		}
	}

	const persistedParticleColorMode = (state as { particleColorMode?: string })
		.particleColorMode;
	const legacyFilterTarget = legacyState.filterTarget;
	const normalizedFilterTargets = Array.isArray(state.filterTargets)
		? state.filterTargets.flatMap(target =>
				String(target) === 'all-images'
					? ['background', 'selected-overlay']
					: [target]
			)
		: [
				legacyFilterTarget === 'all-images'
					? 'background'
					: (legacyFilterTarget ?? 'background')
			];
	const normalizedBackgroundImages =
		normalizePersistedBackgroundImages(state);
	const backgroundState = buildBackgroundImageCollectionPatch(
		{
			...DEFAULT_STATE,
			...state,
			backgroundImages: normalizedBackgroundImages,
			activeImageId:
				state.activeImageId ??
				normalizedBackgroundImages[0]?.assetId ??
				null
		},
		normalizedBackgroundImages,
		state.activeImageId ?? normalizedBackgroundImages[0]?.assetId ?? null
	);
	const normalizedOverlays = (state.overlays ?? []).map(overlay => ({
		...overlay,
		zIndex: Math.max(overlay.zIndex ?? 90, 90),
		blendMode: overlay.blendMode ?? 'normal',
		cropShape: overlay.cropShape ?? 'rectangle',
		edgeFade: overlay.edgeFade ?? 0.08,
		edgeBlur: overlay.edgeBlur ?? 0,
		edgeGlow: overlay.edgeGlow ?? 0.12,
		audioOpacityReactive: overlay.audioOpacityReactive ?? true,
		audioOpacityAmount: overlay.audioOpacityAmount ?? 0.35,
		audioOpacityInvert: overlay.audioOpacityInvert ?? false,
		audioOpacityChannel: normalizeAudioChannel(
			overlay.audioOpacityChannel,
			'kick'
		)
	}));
	const migratedCustomPresets = Object.fromEntries(
		Object.entries(state.customPresets ?? {}).map(([id, preset]) => [
			id,
			{
				...preset,
				values: {
					...preset.values,
					filterTargets: Array.isArray(
						(preset.values as { filterTargets?: unknown })
							.filterTargets
					)
						? (
								preset.values as { filterTargets: string[] }
							).filterTargets.map(target =>
								target === 'all-images' ? 'background' : target
							)
						: [
								((preset.values as { filterTarget?: string })
									.filterTarget ??
									DEFAULT_STATE
										.filterTargets[0]) as WallpaperStore['filterTargets'][number]
							],
					filterOpacity:
						(preset.values as { filterOpacity?: number })
							.filterOpacity ?? DEFAULT_STATE.filterOpacity,
					logoBandMode: normalizeAudioChannel(
						preset.values.logoBandMode,
						DEFAULT_STATE.logoBandMode
					),
					spectrumBandMode: normalizeAudioChannel(
						preset.values.spectrumBandMode,
						DEFAULT_STATE.spectrumBandMode
					),
					imageAudioChannel: normalizeAudioChannel(
						preset.values.imageAudioChannel,
						DEFAULT_STATE.imageAudioChannel
					),
					rgbShiftAudioChannel: normalizeAudioChannel(
						preset.values.rgbShiftAudioChannel,
						DEFAULT_STATE.rgbShiftAudioChannel
					),
					particleAudioChannel: normalizeAudioChannel(
						preset.values.particleAudioChannel,
						DEFAULT_STATE.particleAudioChannel
					),
					slideshowTransitionAudioChannel: normalizeAudioChannel(
						preset.values.slideshowTransitionAudioChannel,
						DEFAULT_STATE.slideshowTransitionAudioChannel
					),
					spectrumColorSource:
						(
							preset.values as {
								spectrumColorSource?: WallpaperStore['spectrumColorSource'];
							}
						).spectrumColorSource ??
						DEFAULT_STATE.spectrumColorSource,
					logoGlowColorSource:
						(
							preset.values as {
								logoGlowColorSource?: WallpaperStore['logoGlowColorSource'];
							}
						).logoGlowColorSource ??
						DEFAULT_STATE.logoGlowColorSource,
					logoShadowColorSource:
						(
							preset.values as {
								logoShadowColorSource?: WallpaperStore['logoShadowColorSource'];
							}
						).logoShadowColorSource ??
						DEFAULT_STATE.logoShadowColorSource,
					logoBackdropColorSource:
						(
							preset.values as {
								logoBackdropColorSource?: WallpaperStore['logoBackdropColorSource'];
							}
						).logoBackdropColorSource ??
						DEFAULT_STATE.logoBackdropColorSource,
					particleColorSource:
						(
							preset.values as {
								particleColorSource?: WallpaperStore['particleColorSource'];
							}
						).particleColorSource ??
						DEFAULT_STATE.particleColorSource,
					rainColorSource:
						(
							preset.values as {
								rainColorSource?: WallpaperStore['rainColorSource'];
							}
						).rainColorSource ?? DEFAULT_STATE.rainColorSource,
					audioTrackTitleTextColorSource:
						(
							preset.values as {
								audioTrackTitleTextColorSource?: WallpaperStore['audioTrackTitleTextColorSource'];
							}
						).audioTrackTitleTextColorSource ??
						DEFAULT_STATE.audioTrackTitleTextColorSource,
					audioTrackTitleStrokeColorSource:
						(
							preset.values as {
								audioTrackTitleStrokeColorSource?: WallpaperStore['audioTrackTitleStrokeColorSource'];
							}
						).audioTrackTitleStrokeColorSource ??
						DEFAULT_STATE.audioTrackTitleStrokeColorSource,
					audioTrackTitleGlowColorSource:
						(
							preset.values as {
								audioTrackTitleGlowColorSource?: WallpaperStore['audioTrackTitleGlowColorSource'];
							}
						).audioTrackTitleGlowColorSource ??
						DEFAULT_STATE.audioTrackTitleGlowColorSource,
					audioTrackTitleBackdropColorSource:
						(
							preset.values as {
								audioTrackTitleBackdropColorSource?: WallpaperStore['audioTrackTitleBackdropColorSource'];
							}
						).audioTrackTitleBackdropColorSource ??
						DEFAULT_STATE.audioTrackTitleBackdropColorSource,
					audioTrackTimeTextColorSource:
						(
							preset.values as {
								audioTrackTimeTextColorSource?: WallpaperStore['audioTrackTimeTextColorSource'];
							}
						).audioTrackTimeTextColorSource ??
						DEFAULT_STATE.audioTrackTimeTextColorSource,
					audioTrackTimeStrokeColorSource:
						(
							preset.values as {
								audioTrackTimeStrokeColorSource?: WallpaperStore['audioTrackTimeStrokeColorSource'];
							}
						).audioTrackTimeStrokeColorSource ??
						DEFAULT_STATE.audioTrackTimeStrokeColorSource,
					audioTrackTimeGlowColorSource:
						(
							preset.values as {
								audioTrackTimeGlowColorSource?: WallpaperStore['audioTrackTimeGlowColorSource'];
							}
						).audioTrackTimeGlowColorSource ??
						DEFAULT_STATE.audioTrackTimeGlowColorSource
				}
			}
		])
	);

	const migratedSlotFamilies: MigratedSlotFamilies = {
		spectrumProfileSlots: migrateSpectrumProfileSlots(state),
		spectrumSecondProfileSlots: migrateSpectrumSecondProfileSlots(state),
		looksProfileSlots: migrateLooksProfileSlots(state),
		particlesProfileSlots: migrateParticlesProfileSlots(state),
		rainProfileSlots: migrateRainProfileSlots(state),
		lightsProfileSlots: migrateLightsProfileSlots(state),
		cameraFxProfileSlots: migrateCameraFxProfileSlots(state),
		logoProfileSlots: migrateLogoProfileSlots(state),
		trackTitleProfileSlots: migrateTrackTitleProfileSlots(state)
	};

	const migratedState = {
		...sanitizedState,
		...backgroundState,
		visualTransition: null,
		overlays: normalizedOverlays,
		selectedOverlayId: state.selectedOverlayId ?? null,
		// v106: "sharp points". Seeded here rather than left to the store's
		// merge so anything reading the migrated object directly (project
		// import/export, profile capture) sees a number instead of undefined.
		spectrumRadialSharpness:
			state.spectrumRadialSharpness ??
			DEFAULT_STATE.spectrumRadialSharpness,
		layoutResponsiveEnabled:
			state.layoutResponsiveEnabled ??
			DEFAULT_STATE.layoutResponsiveEnabled,
		layoutBackgroundReframeEnabled:
			state.layoutBackgroundReframeEnabled ??
			DEFAULT_STATE.layoutBackgroundReframeEnabled,
		editorSidebarCollapsed:
			typeof state.editorSidebarCollapsed === 'boolean'
				? state.editorSidebarCollapsed
				: DEFAULT_STATE.editorSidebarCollapsed,
		layoutReferenceWidth:
			typeof state.layoutReferenceWidth === 'number' &&
			Number.isFinite(state.layoutReferenceWidth) &&
			state.layoutReferenceWidth > 0
				? Math.round(state.layoutReferenceWidth)
				: currentViewportReference.width,
		layoutReferenceHeight:
			typeof state.layoutReferenceHeight === 'number' &&
			Number.isFinite(state.layoutReferenceHeight) &&
			state.layoutReferenceHeight > 0
				? Math.round(state.layoutReferenceHeight)
				: currentViewportReference.height,
		layerZIndices: state.layerZIndices ?? {},
		spectrumMode: state.spectrumMode ?? legacySpectrumMode,
		spectrumLinearOrientation:
			state.spectrumLinearOrientation ?? legacySpectrumLinearOrientation,
		spectrumLinearDirection:
			state.spectrumLinearDirection ?? legacySpectrumLinearDirection,
		spectrumRadialShape:
			state.spectrumRadialShape ?? DEFAULT_STATE.spectrumRadialShape,
		spectrumRadialAngle:
			state.spectrumRadialAngle ?? DEFAULT_STATE.spectrumRadialAngle,
		spectrumRadialFitLogo:
			state.spectrumRadialFitLogo ?? DEFAULT_STATE.spectrumRadialFitLogo,
		spectrumMainVisible:
			typeof state.spectrumMainVisible === 'boolean'
				? state.spectrumMainVisible
				: DEFAULT_STATE.spectrumMainVisible,
		spectrumInstances: migrateSpectrumInstances(state),
		spectrumLogoGap: state.spectrumLogoGap ?? DEFAULT_STATE.spectrumLogoGap,
		spectrumSpan: state.spectrumSpan ?? DEFAULT_STATE.spectrumSpan,
		spectrumScale: state.spectrumScale ?? DEFAULT_STATE.spectrumScale,
		spectrumManualGlow:
			state.spectrumManualGlow ?? DEFAULT_STATE.spectrumManualGlow,
		spectrumManualGlowMode:
			state.spectrumManualGlowMode ??
			DEFAULT_STATE.spectrumManualGlowMode,
		// v95: glow color identity. Seed from the fill colors (source 'manual',
		// mode 'gradient') so pre-v95 setups keep their exact glow look.
		spectrumGlowColorSource: state.spectrumGlowColorSource ?? 'manual',
		spectrumGlowColorMode: state.spectrumGlowColorMode ?? 'gradient',
		spectrumGlowPrimaryColor:
			state.spectrumGlowPrimaryColor ??
			state.spectrumPrimaryColor ??
			DEFAULT_STATE.spectrumGlowPrimaryColor,
		spectrumGlowSecondaryColor:
			state.spectrumGlowSecondaryColor ??
			state.spectrumSecondaryColor ??
			DEFAULT_STATE.spectrumGlowSecondaryColor,
		spectrumPixelate:
			state.spectrumPixelate ?? DEFAULT_STATE.spectrumPixelate,
		spectrumPixelateScale:
			state.spectrumPixelateScale ?? DEFAULT_STATE.spectrumPixelateScale,
		spectrumLedCellSize:
			state.spectrumLedCellSize ?? DEFAULT_STATE.spectrumLedCellSize,
		spectrumLedCellGap:
			state.spectrumLedCellGap ?? DEFAULT_STATE.spectrumLedCellGap,
		spectrumLedAngle:
			state.spectrumLedAngle ?? DEFAULT_STATE.spectrumLedAngle,
		spectrumLedShape:
			state.spectrumLedShape ?? DEFAULT_STATE.spectrumLedShape,
		spectrumRgbSplit:
			state.spectrumRgbSplit ?? DEFAULT_STATE.spectrumRgbSplit,
		spectrumRgbSplitAmount:
			state.spectrumRgbSplitAmount ??
			DEFAULT_STATE.spectrumRgbSplitAmount,
		spectrumNeonCore:
			state.spectrumNeonCore ?? DEFAULT_STATE.spectrumNeonCore,
		spectrumNeonCoreIntensity:
			state.spectrumNeonCoreIntensity ??
			DEFAULT_STATE.spectrumNeonCoreIntensity,
		spectrumNeonCoreWidth:
			state.spectrumNeonCoreWidth ?? DEFAULT_STATE.spectrumNeonCoreWidth,
		spectrumGradientFlow:
			state.spectrumGradientFlow ?? DEFAULT_STATE.spectrumGradientFlow,
		spectrumGradientFlowSpeed:
			state.spectrumGradientFlowSpeed ??
			DEFAULT_STATE.spectrumGradientFlowSpeed,
		spectrumGradientFlowAudio:
			state.spectrumGradientFlowAudio ??
			DEFAULT_STATE.spectrumGradientFlowAudio,
		spectrumGradientFlowDirection:
			state.spectrumGradientFlowDirection ??
			DEFAULT_STATE.spectrumGradientFlowDirection,
		spectrumPeakSparks:
			state.spectrumPeakSparks ?? DEFAULT_STATE.spectrumPeakSparks,
		spectrumPeakSparksAmount:
			state.spectrumPeakSparksAmount ??
			DEFAULT_STATE.spectrumPeakSparksAmount,
		spectrumPeakSparksSize:
			state.spectrumPeakSparksSize ??
			DEFAULT_STATE.spectrumPeakSparksSize,
		spectrumPeakSparksThreshold:
			state.spectrumPeakSparksThreshold ??
			DEFAULT_STATE.spectrumPeakSparksThreshold,
		spectrumEchoTrace:
			state.spectrumEchoTrace ?? DEFAULT_STATE.spectrumEchoTrace,
		spectrumEchoTraceCount:
			state.spectrumEchoTraceCount ??
			DEFAULT_STATE.spectrumEchoTraceCount,
		spectrumEchoTraceOpacity:
			state.spectrumEchoTraceOpacity ??
			DEFAULT_STATE.spectrumEchoTraceOpacity,
		spectrumEchoTraceOffset:
			state.spectrumEchoTraceOffset ??
			DEFAULT_STATE.spectrumEchoTraceOffset,
		spectrumEchoTraceDecay:
			state.spectrumEchoTraceDecay ??
			DEFAULT_STATE.spectrumEchoTraceDecay,
		spectrumWaveFillOpacity:
			state.spectrumWaveFillOpacity ??
			DEFAULT_STATE.spectrumWaveFillOpacity,
		spectrumShape: normalizeSpectrumShape(
			state.spectrumShape ?? DEFAULT_STATE.spectrumShape
		),
		spectrumRotationSpeed: Math.abs(
			state.spectrumRotationSpeed ?? DEFAULT_STATE.spectrumRotationSpeed
		),
		spectrumRotationDrive: normalizeSpectrumRotationDrive(
			state.spectrumRotationDrive
		),
		spectrumRotationAudioAmount: finiteOrDefault(
			state.spectrumRotationAudioAmount,
			DEFAULT_STATE.spectrumRotationAudioAmount
		),
		spectrumRotationChannel: normalizeSpectrumRotationChannel(
			state.spectrumRotationChannel
		),
		spectrumRotationDirection:
			legacySpectrumDirection === 'counterclockwise'
				? 'ccw'
				: normalizeRotationDirection(
						state.spectrumRotationDirection,
						state.spectrumRotationSpeed ??
							DEFAULT_STATE.spectrumRotationSpeed
					),
		spectrumRotationSmoothing: finiteOrDefault(
			state.spectrumRotationSmoothing,
			DEFAULT_STATE.spectrumRotationSmoothing
		),
		spectrumRotationInvertOnLowEnergy:
			typeof state.spectrumRotationInvertOnLowEnergy === 'boolean'
				? state.spectrumRotationInvertOnLowEnergy
				: DEFAULT_STATE.spectrumRotationInvertOnLowEnergy,
		spectrumRotationInvertThreshold: finiteOrDefault(
			state.spectrumRotationInvertThreshold,
			DEFAULT_STATE.spectrumRotationInvertThreshold
		),
		spectrumRotationInvertHoldMs: finiteOrDefault(
			state.spectrumRotationInvertHoldMs,
			DEFAULT_STATE.spectrumRotationInvertHoldMs
		),
		stageLightsEnabled:
			typeof state.stageLightsEnabled === 'boolean'
				? state.stageLightsEnabled
				: DEFAULT_STATE.stageLightsEnabled,
		stageLightsIntensity: finiteOrDefault(
			state.stageLightsIntensity,
			DEFAULT_STATE.stageLightsIntensity
		),
		stageLightsBeamCount: finiteOrDefault(
			state.stageLightsBeamCount,
			DEFAULT_STATE.stageLightsBeamCount
		),
		stageLightsMinBeamCount: finiteOrDefault(
			state.stageLightsMinBeamCount,
			Math.min(
				DEFAULT_STATE.stageLightsMinBeamCount,
				finiteOrDefault(
					state.stageLightsBeamCount,
					DEFAULT_STATE.stageLightsBeamCount
				)
			)
		),
		stageLightsMaxBeamCount: finiteOrDefault(
			state.stageLightsMaxBeamCount,
			finiteOrDefault(
				state.stageLightsBeamCount,
				DEFAULT_STATE.stageLightsMaxBeamCount
			)
		),
		stageLightsBeamWidth: finiteOrDefault(
			state.stageLightsBeamWidth,
			DEFAULT_STATE.stageLightsBeamWidth
		),
		stageLightsBeamLength: finiteOrDefault(
			state.stageLightsBeamLength,
			DEFAULT_STATE.stageLightsBeamLength
		),
		stageLightsSoftness: finiteOrDefault(
			state.stageLightsSoftness,
			DEFAULT_STATE.stageLightsSoftness
		),
		stageLightsSpeed: finiteOrDefault(
			state.stageLightsSpeed,
			DEFAULT_STATE.stageLightsSpeed
		),
		stageLightsFixedMotion:
			typeof state.stageLightsFixedMotion === 'boolean'
				? state.stageLightsFixedMotion
				: DEFAULT_STATE.stageLightsFixedMotion,
		stageLightsColorSource: normalizeColorSourceMode(
			state.stageLightsColorSource,
			DEFAULT_STATE.stageLightsColorSource
		),
		stageLightsColor:
			typeof state.stageLightsColor === 'string'
				? state.stageLightsColor
				: DEFAULT_STATE.stageLightsColor,
		stageLightsAudioReactive:
			typeof state.stageLightsAudioReactive === 'boolean'
				? state.stageLightsAudioReactive
				: DEFAULT_STATE.stageLightsAudioReactive,
		stageLightsAudioChannel: normalizeFxAudioChannel(
			state.stageLightsAudioChannel,
			DEFAULT_STATE.stageLightsAudioChannel
		),
		stageLightsAudioAmount: finiteOrDefault(
			state.stageLightsAudioAmount,
			DEFAULT_STATE.stageLightsAudioAmount
		),
		stageLightsAudioOscillationAmount: finiteOrDefault(
			state.stageLightsAudioOscillationAmount,
			DEFAULT_STATE.stageLightsAudioOscillationAmount
		),
		stageLightsAudioHoldMs: finiteOrDefault(
			state.stageLightsAudioHoldMs,
			DEFAULT_STATE.stageLightsAudioHoldMs
		),
		stageLightsAudioDecay: finiteOrDefault(
			state.stageLightsAudioDecay,
			DEFAULT_STATE.stageLightsAudioDecay
		),
		stageLightsAudioGateEnabled:
			typeof state.stageLightsAudioGateEnabled === 'boolean'
				? state.stageLightsAudioGateEnabled
				: DEFAULT_STATE.stageLightsAudioGateEnabled,
		stageLightsPeakFlash:
			typeof state.stageLightsPeakFlash === 'boolean'
				? state.stageLightsPeakFlash
				: DEFAULT_STATE.stageLightsPeakFlash,
		stageLightsPeakThreshold: finiteOrDefault(
			state.stageLightsPeakThreshold,
			DEFAULT_STATE.stageLightsPeakThreshold
		),
		stageLightsBandThresholds: normalizeFxBandThresholds(
			state.stageLightsBandThresholds,
			DEFAULT_STATE.stageLightsBandThresholds
		),
		stageLightsOpacity: finiteOrDefault(
			state.stageLightsOpacity,
			DEFAULT_STATE.stageLightsOpacity
		),
		stageLightsBlendMode: normalizeStageLightsBlendMode(
			state.stageLightsBlendMode
		),
		stageLightsOrigin: normalizeStageLightsOrigin(state.stageLightsOrigin),
		stageLightsMovementMode: normalizeStageLightsMovementMode(
			state.stageLightsMovementMode
		),
		stageLightsInvertDirection:
			typeof state.stageLightsInvertDirection === 'boolean'
				? state.stageLightsInvertDirection
				: DEFAULT_STATE.stageLightsInvertDirection,
		stageLightsMirrorDirections:
			typeof state.stageLightsMirrorDirections === 'boolean'
				? state.stageLightsMirrorDirections
				: DEFAULT_STATE.stageLightsMirrorDirections,
		flashLightEnabled:
			typeof state.flashLightEnabled === 'boolean'
				? state.flashLightEnabled
				: state.stageLightsEnabled === true &&
					state.stageLightsPeakFlash === true,
		flashLightIntensity: finiteOrDefault(
			state.flashLightIntensity,
			DEFAULT_STATE.flashLightIntensity
		),
		flashLightColorSource: normalizeColorSourceMode(
			state.flashLightColorSource,
			DEFAULT_STATE.flashLightColorSource
		),
		flashLightColor:
			typeof state.flashLightColor === 'string'
				? state.flashLightColor
				: DEFAULT_STATE.flashLightColor,
		flashLightSoftness: finiteOrDefault(
			state.flashLightSoftness,
			DEFAULT_STATE.flashLightSoftness
		),
		flashLightBrightness: finiteOrDefault(
			state.flashLightBrightness,
			DEFAULT_STATE.flashLightBrightness
		),
		flashLightDecay: finiteOrDefault(
			state.flashLightDecay,
			DEFAULT_STATE.flashLightDecay
		),
		flashLightAudioChannel: normalizeFxAudioChannel(
			state.flashLightAudioChannel ?? state.stageLightsAudioChannel,
			DEFAULT_STATE.flashLightAudioChannel
		),
		flashLightThreshold: finiteOrDefault(
			state.flashLightThreshold,
			finiteOrDefault(
				state.stageLightsPeakThreshold,
				DEFAULT_STATE.flashLightThreshold
			)
		),
		flashLightBandThresholds: normalizeFxBandThresholds(
			state.flashLightBandThresholds,
			DEFAULT_STATE.flashLightBandThresholds
		),
		flashLightSensitivity: finiteOrDefault(
			state.flashLightSensitivity,
			DEFAULT_STATE.flashLightSensitivity
		),
		flashLightRetriggerMs: finiteOrDefault(
			state.flashLightRetriggerMs,
			DEFAULT_STATE.flashLightRetriggerMs
		),
		flashLightShape: normalizeFlashLightShape(state.flashLightShape),
		flashLightBlendMode: normalizeStageLightsBlendMode(
			state.flashLightBlendMode
		),
		cameraFxEnabled:
			typeof state.cameraFxEnabled === 'boolean'
				? state.cameraFxEnabled
				: DEFAULT_STATE.cameraFxEnabled,
		cameraMotionEnabled:
			typeof state.cameraMotionEnabled === 'boolean'
				? state.cameraMotionEnabled
				: typeof state.cameraFxEnabled === 'boolean'
					? state.cameraFxEnabled
					: DEFAULT_STATE.cameraMotionEnabled,
		cameraMotionMode: normalizeCameraMotionMode(state.cameraMotionMode),
		cameraMotionAmount: finiteOrDefault(
			state.cameraMotionAmount,
			DEFAULT_STATE.cameraMotionAmount
		),
		cameraMotionSpeed: finiteOrDefault(
			state.cameraMotionSpeed,
			DEFAULT_STATE.cameraMotionSpeed
		),
		cameraMotionDrive: normalizeCameraMotionDrive(state.cameraMotionDrive),
		cameraMotionAudioInfluence: finiteOrDefault(
			state.cameraMotionAudioInfluence,
			DEFAULT_STATE.cameraMotionAudioInfluence
		),
		cameraMotionAudioChannel: normalizeFxAudioChannel(
			state.cameraMotionAudioChannel,
			DEFAULT_STATE.cameraMotionAudioChannel
		),
		cameraMotionDirection: normalizeCameraMotionDirection(
			state.cameraMotionDirection
		),
		cameraMotionTarget: normalizeCameraMotionTarget(
			state.cameraMotionTarget
		),
		cameraMotionTargets: normalizeCameraMotionTargets(
			state.cameraMotionTargets,
			state.cameraMotionTarget
		),
		cameraShakeEnabled:
			typeof state.cameraShakeEnabled === 'boolean'
				? state.cameraShakeEnabled
				: DEFAULT_STATE.cameraShakeEnabled,
		cameraShakeAmount: finiteOrDefault(
			state.cameraShakeAmount,
			DEFAULT_STATE.cameraShakeAmount
		),
		cameraShakeDecay: finiteOrDefault(
			state.cameraShakeDecay,
			DEFAULT_STATE.cameraShakeDecay
		),
		cameraShakeThreshold: finiteOrDefault(
			state.cameraShakeThreshold,
			DEFAULT_STATE.cameraShakeThreshold
		),
		cameraShakeBandThresholds: normalizeFxBandThresholds(
			state.cameraShakeBandThresholds,
			DEFAULT_STATE.cameraShakeBandThresholds
		),
		cameraShakeTargets: normalizeCameraMotionTargets(
			state.cameraShakeTargets,
			'all'
		),
		cameraShakeSensitivity: finiteOrDefault(
			state.cameraShakeSensitivity,
			DEFAULT_STATE.cameraShakeSensitivity
		),
		cameraShakeRetriggerMs: finiteOrDefault(
			state.cameraShakeRetriggerMs,
			DEFAULT_STATE.cameraShakeRetriggerMs
		),
		cameraShakeChannel: normalizeFxAudioChannel(
			state.cameraShakeChannel,
			DEFAULT_STATE.cameraShakeChannel
		),
		cameraShakeMode: normalizeCameraShakeMode(state.cameraShakeMode),
		cameraShakeFrequency: finiteOrDefault(
			state.cameraShakeFrequency,
			DEFAULT_STATE.cameraShakeFrequency
		),
		cameraShakeRoughness: finiteOrDefault(
			state.cameraShakeRoughness,
			DEFAULT_STATE.cameraShakeRoughness
		),
		showBackgroundScaleMeter:
			state.showBackgroundScaleMeter ??
			DEFAULT_STATE.showBackgroundScaleMeter,
		showSpectrumDiagnosticsHud:
			state.showSpectrumDiagnosticsHud ??
			DEFAULT_STATE.showSpectrumDiagnosticsHud,
		showLogoDiagnosticsHud:
			state.showLogoDiagnosticsHud ??
			DEFAULT_STATE.showLogoDiagnosticsHud,
		diagnosticsHudPositionX:
			typeof state.diagnosticsHudPositionX === 'number'
				? Math.min(1, Math.max(0, state.diagnosticsHudPositionX))
				: DEFAULT_STATE.diagnosticsHudPositionX,
		diagnosticsHudPositionY:
			typeof state.diagnosticsHudPositionY === 'number'
				? Math.min(1, Math.max(0, state.diagnosticsHudPositionY))
				: DEFAULT_STATE.diagnosticsHudPositionY,
		filterTargets: normalizedFilterTargets,
		filterOpacity: state.filterOpacity ?? DEFAULT_STATE.filterOpacity,
		filterBrightness: state.filterBrightness ?? 1,
		filterContrast: state.filterContrast ?? 1,
		filterSaturation: state.filterSaturation ?? 1,
		filterBlur: state.filterBlur ?? 0,
		filterHueRotate: state.filterHueRotate ?? 0,
		filterVignette: state.filterVignette ?? DEFAULT_STATE.filterVignette,
		filterBloom: state.filterBloom ?? DEFAULT_STATE.filterBloom,
		filterLumaThreshold:
			state.filterLumaThreshold ?? DEFAULT_STATE.filterLumaThreshold,
		filterLensWarp: state.filterLensWarp ?? DEFAULT_STATE.filterLensWarp,
		filterHeatDistortion:
			state.filterHeatDistortion ?? DEFAULT_STATE.filterHeatDistortion,
		activeFilterLookId:
			state.activeFilterLookId ?? DEFAULT_STATE.activeFilterLookId,
		backgroundImageEnabled:
			state.backgroundImageEnabled ??
			DEFAULT_STATE.backgroundImageEnabled,
		imageOpacity: state.imageOpacity ?? DEFAULT_STATE.imageOpacity,
		globalBackgroundEnabled:
			state.globalBackgroundEnabled ??
			DEFAULT_STATE.globalBackgroundEnabled,
		globalBackgroundId:
			state.globalBackgroundId ?? DEFAULT_STATE.globalBackgroundId,
		globalBackgroundUrl: null,
		globalBackgroundScale:
			state.globalBackgroundScale ?? DEFAULT_STATE.globalBackgroundScale,
		globalBackgroundPositionX:
			state.globalBackgroundPositionX ??
			DEFAULT_STATE.globalBackgroundPositionX,
		globalBackgroundPositionY:
			state.globalBackgroundPositionY ??
			DEFAULT_STATE.globalBackgroundPositionY,
		globalBackgroundFitMode:
			state.globalBackgroundFitMode ??
			DEFAULT_STATE.globalBackgroundFitMode,
		globalBackgroundOpacity:
			state.globalBackgroundOpacity ??
			DEFAULT_STATE.globalBackgroundOpacity,
		globalBackgroundBrightness:
			state.globalBackgroundBrightness ??
			DEFAULT_STATE.globalBackgroundBrightness,
		globalBackgroundContrast:
			state.globalBackgroundContrast ??
			DEFAULT_STATE.globalBackgroundContrast,
		globalBackgroundSaturation:
			state.globalBackgroundSaturation ??
			DEFAULT_STATE.globalBackgroundSaturation,
		globalBackgroundBlur:
			state.globalBackgroundBlur ?? DEFAULT_STATE.globalBackgroundBlur,
		globalBackgroundHueRotate:
			state.globalBackgroundHueRotate ??
			DEFAULT_STATE.globalBackgroundHueRotate,
		particleColorMode: normalizeParticleColorMode(
			persistedParticleColorMode === 'random'
				? 'rainbow'
				: state.particleColorMode,
			DEFAULT_STATE.particleColorMode
		),
		particleFilterBrightness:
			state.particleFilterBrightness ??
			DEFAULT_STATE.particleFilterBrightness,
		particleFilterContrast:
			state.particleFilterContrast ??
			DEFAULT_STATE.particleFilterContrast,
		particleFilterSaturation:
			state.particleFilterSaturation ??
			DEFAULT_STATE.particleFilterSaturation,
		particleFilterBlur:
			state.particleFilterBlur ?? DEFAULT_STATE.particleFilterBlur,
		particleFilterHueRotate:
			state.particleFilterHueRotate ??
			DEFAULT_STATE.particleFilterHueRotate,
		particleRotationIntensity:
			state.particleRotationIntensity ??
			DEFAULT_STATE.particleRotationIntensity,
		particleRotationDirection:
			state.particleRotationDirection ??
			DEFAULT_STATE.particleRotationDirection,
		logoBandMode: normalizeAudioChannel(
			state.logoBandMode,
			DEFAULT_STATE.logoBandMode
		),
		logoPositionX: state.logoPositionX ?? DEFAULT_STATE.logoPositionX,
		logoPositionY: state.logoPositionY ?? DEFAULT_STATE.logoPositionY,
		logoCircularCrop:
			state.logoCircularCrop ?? DEFAULT_STATE.logoCircularCrop,
		logoCropRadius: state.logoCropRadius ?? DEFAULT_STATE.logoCropRadius,
		logoPeakWindow: state.logoPeakWindow ?? DEFAULT_STATE.logoPeakWindow,
		logoPeakFloor: state.logoPeakFloor ?? DEFAULT_STATE.logoPeakFloor,
		backgroundProfileSlots: migrateBackgroundProfileSlots(state),
		logoProfileSlots: migratedSlotFamilies.logoProfileSlots,
		spectrumProfileSlots: migratedSlotFamilies.spectrumProfileSlots,
		spectrumSecondProfileSlots:
			migratedSlotFamilies.spectrumSecondProfileSlots,
		audioSourceMode: normalizeAudioSourceMode(
			state.audioSourceMode,
			DEFAULT_STATE.audioSourceMode
		),
		audioFileAssetId:
			state.audioFileAssetId ?? DEFAULT_STATE.audioFileAssetId,
		audioFileName: state.audioFileName ?? DEFAULT_STATE.audioFileName,
		audioFileVolume: state.audioFileVolume ?? DEFAULT_STATE.audioFileVolume,
		audioFileLoop: state.audioFileLoop ?? DEFAULT_STATE.audioFileLoop,
		audioPaused: state.audioPaused ?? DEFAULT_STATE.audioPaused,
		motionPaused: state.motionPaused ?? DEFAULT_STATE.motionPaused,
		audioChannelSmoothing:
			state.audioChannelSmoothing ?? DEFAULT_STATE.audioChannelSmoothing,
		audioAutoKickThreshold:
			state.audioAutoKickThreshold ??
			DEFAULT_STATE.audioAutoKickThreshold,
		audioAutoSwitchHoldMs:
			state.audioAutoSwitchHoldMs ?? DEFAULT_STATE.audioAutoSwitchHoldMs,
		audioTracks: Array.isArray(state.audioTracks)
			? state.audioTracks
			: DEFAULT_STATE.audioTracks,
		activeAudioTrackId:
			state.activeAudioTrackId ?? DEFAULT_STATE.activeAudioTrackId,
		queuedAudioTrackId:
			state.queuedAudioTrackId ?? DEFAULT_STATE.queuedAudioTrackId,
		audioCrossfadeEnabled:
			state.audioCrossfadeEnabled ?? DEFAULT_STATE.audioCrossfadeEnabled,
		audioCrossfadeSeconds:
			state.audioCrossfadeSeconds ?? DEFAULT_STATE.audioCrossfadeSeconds,
		audioAutoAdvance:
			state.audioAutoAdvance ?? DEFAULT_STATE.audioAutoAdvance,
		audioMixMode:
			state.audioMixMode === 'manual' ||
			state.audioMixMode === 'sequential' ||
			state.audioMixMode === 'energy-match' ||
			state.audioMixMode === 'contrast'
				? state.audioMixMode
				: DEFAULT_STATE.audioMixMode,
		audioTransitionStyle:
			state.audioTransitionStyle === 'linear' ||
			state.audioTransitionStyle === 'smooth' ||
			state.audioTransitionStyle === 'quick' ||
			state.audioTransitionStyle === 'early-blend' ||
			state.audioTransitionStyle === 'late-blend'
				? state.audioTransitionStyle
				: DEFAULT_STATE.audioTransitionStyle,
		mediaSessionEnabled:
			state.mediaSessionEnabled ?? DEFAULT_STATE.mediaSessionEnabled,
		trackMetadataMode:
			state.trackMetadataMode ?? DEFAULT_STATE.trackMetadataMode,
		trackMetadataAutoSource:
			state.trackMetadataAutoSource ??
			DEFAULT_STATE.trackMetadataAutoSource,
		// Existing configs keep the legacy two-loose-lines layout; only fresh
		// installs (DEFAULT_STATE) default to the cohesive widget.
		nowPlayingMode:
			state.nowPlayingMode ??
			(state.audioTrackTitleEnabled !== undefined
				? 'free'
				: DEFAULT_STATE.nowPlayingMode),
		nowPlayingCoverEnabled:
			state.nowPlayingCoverEnabled ??
			DEFAULT_STATE.nowPlayingCoverEnabled,
		nowPlayingArtistEnabled:
			state.nowPlayingArtistEnabled ??
			DEFAULT_STATE.nowPlayingArtistEnabled,
		nowPlayingProgressEnabled:
			state.nowPlayingProgressEnabled ??
			DEFAULT_STATE.nowPlayingProgressEnabled,
		nowPlayingScale: state.nowPlayingScale ?? DEFAULT_STATE.nowPlayingScale,
		nowPlayingAccentColor:
			state.nowPlayingAccentColor ?? DEFAULT_STATE.nowPlayingAccentColor,
		nowPlayingAccentColorSource:
			state.nowPlayingAccentColorSource ??
			DEFAULT_STATE.nowPlayingAccentColorSource,
		nowPlayingTextTreatment: normalizeNowPlayingTextTreatment(
			state.nowPlayingTextTreatment,
			DEFAULT_STATE.nowPlayingTextTreatment
		),
		trackManualArtist:
			state.trackManualArtist ?? DEFAULT_STATE.trackManualArtist,
		trackManualTitle:
			state.trackManualTitle ?? DEFAULT_STATE.trackManualTitle,
		audioTrackTitleEnabled:
			state.audioTrackTitleEnabled ??
			DEFAULT_STATE.audioTrackTitleEnabled,
		audioTrackTitleLayoutMode:
			state.audioTrackTitleLayoutMode ??
			DEFAULT_STATE.audioTrackTitleLayoutMode,
		audioTrackTitleFontStyle:
			state.audioTrackTitleFontStyle ??
			DEFAULT_STATE.audioTrackTitleFontStyle,
		audioTrackTitleUppercase:
			state.audioTrackTitleUppercase ??
			DEFAULT_STATE.audioTrackTitleUppercase,
		audioTrackTitlePositionX:
			state.audioTrackTitlePositionX ??
			DEFAULT_STATE.audioTrackTitlePositionX,
		audioTrackTitlePositionY:
			state.audioTrackTitlePositionY ??
			DEFAULT_STATE.audioTrackTitlePositionY,
		audioTrackTitleFontSize:
			state.audioTrackTitleFontSize ??
			DEFAULT_STATE.audioTrackTitleFontSize,
		audioTrackTitleLetterSpacing:
			state.audioTrackTitleLetterSpacing ??
			DEFAULT_STATE.audioTrackTitleLetterSpacing,
		audioTrackTitleWidth:
			state.audioTrackTitleWidth ?? DEFAULT_STATE.audioTrackTitleWidth,
		audioTrackTitleOpacity:
			state.audioTrackTitleOpacity ??
			DEFAULT_STATE.audioTrackTitleOpacity,
		audioTrackTitleScrollSpeed:
			state.audioTrackTitleScrollSpeed ??
			DEFAULT_STATE.audioTrackTitleScrollSpeed,
		audioTrackTitleRgbShift:
			state.audioTrackTitleRgbShift ??
			DEFAULT_STATE.audioTrackTitleRgbShift,
		audioTrackTitleTextColor:
			state.audioTrackTitleTextColor ??
			DEFAULT_STATE.audioTrackTitleTextColor,
		audioTrackTitleTextColorSource: normalizeColorSourceMode(
			state.audioTrackTitleTextColorSource,
			DEFAULT_STATE.audioTrackTitleTextColorSource
		),
		audioTrackTitleStrokeColor:
			state.audioTrackTitleStrokeColor ??
			DEFAULT_STATE.audioTrackTitleStrokeColor,
		audioTrackTitleStrokeColorSource: normalizeColorSourceMode(
			state.audioTrackTitleStrokeColorSource,
			DEFAULT_STATE.audioTrackTitleStrokeColorSource
		),
		audioTrackTitleStrokeWidth:
			state.audioTrackTitleStrokeWidth ??
			DEFAULT_STATE.audioTrackTitleStrokeWidth,
		audioTrackTitleGlowColor:
			state.audioTrackTitleGlowColor ??
			DEFAULT_STATE.audioTrackTitleGlowColor,
		audioTrackTitleGlowColorSource: normalizeColorSourceMode(
			state.audioTrackTitleGlowColorSource,
			DEFAULT_STATE.audioTrackTitleGlowColorSource
		),
		audioTrackTitleGlowBlur:
			state.audioTrackTitleGlowBlur ??
			DEFAULT_STATE.audioTrackTitleGlowBlur,
		audioTrackTitleGlowReach:
			state.audioTrackTitleGlowReach ??
			DEFAULT_STATE.audioTrackTitleGlowReach,
		audioTrackTitleBackdropEnabled:
			state.audioTrackTitleBackdropEnabled ??
			DEFAULT_STATE.audioTrackTitleBackdropEnabled,
		audioTrackTitleBackdropColor:
			state.audioTrackTitleBackdropColor ??
			DEFAULT_STATE.audioTrackTitleBackdropColor,
		audioTrackTitleBackdropColorSource: normalizeColorSourceMode(
			state.audioTrackTitleBackdropColorSource,
			DEFAULT_STATE.audioTrackTitleBackdropColorSource
		),
		audioTrackTitleBackdropOpacity:
			state.audioTrackTitleBackdropOpacity ??
			DEFAULT_STATE.audioTrackTitleBackdropOpacity,
		audioTrackTitleBackdropPadding:
			state.audioTrackTitleBackdropPadding ??
			DEFAULT_STATE.audioTrackTitleBackdropPadding,
		audioTrackTitleFilterBrightness:
			state.audioTrackTitleFilterBrightness ??
			DEFAULT_STATE.audioTrackTitleFilterBrightness,
		audioTrackTitleFilterContrast:
			state.audioTrackTitleFilterContrast ??
			DEFAULT_STATE.audioTrackTitleFilterContrast,
		audioTrackTitleFilterSaturation:
			state.audioTrackTitleFilterSaturation ??
			DEFAULT_STATE.audioTrackTitleFilterSaturation,
		audioTrackTitleFilterBlur:
			state.audioTrackTitleFilterBlur ??
			DEFAULT_STATE.audioTrackTitleFilterBlur,
		audioTrackTitleFilterHueRotate:
			state.audioTrackTitleFilterHueRotate ??
			DEFAULT_STATE.audioTrackTitleFilterHueRotate,
		audioTrackTimeEnabled:
			state.audioTrackTimeEnabled ?? DEFAULT_STATE.audioTrackTimeEnabled,
		audioTrackTimeWidth:
			state.audioTrackTimeWidth ?? DEFAULT_STATE.audioTrackTimeWidth,
		audioTrackTimePositionX:
			state.audioTrackTimePositionX ??
			state.audioTrackTitlePositionX ??
			DEFAULT_STATE.audioTrackTimePositionX,
		audioTrackTimePositionY:
			state.audioTrackTimePositionY ??
			DEFAULT_STATE.audioTrackTimePositionY,
		audioTrackTimeFontStyle:
			state.audioTrackTimeFontStyle ??
			DEFAULT_STATE.audioTrackTimeFontStyle,
		audioTrackTimeFontSize:
			state.audioTrackTimeFontSize ??
			DEFAULT_STATE.audioTrackTimeFontSize,
		audioTrackTimeLetterSpacing:
			state.audioTrackTimeLetterSpacing ??
			DEFAULT_STATE.audioTrackTimeLetterSpacing,
		audioTrackTimeOpacity:
			state.audioTrackTimeOpacity ?? DEFAULT_STATE.audioTrackTimeOpacity,
		audioTrackTimeRgbShift:
			state.audioTrackTimeRgbShift ??
			DEFAULT_STATE.audioTrackTimeRgbShift,
		audioTrackTimeTextColor:
			state.audioTrackTimeTextColor ??
			DEFAULT_STATE.audioTrackTimeTextColor,
		audioTrackTimeTextColorSource: normalizeColorSourceMode(
			state.audioTrackTimeTextColorSource,
			DEFAULT_STATE.audioTrackTimeTextColorSource
		),
		audioTrackTimeStrokeColor:
			state.audioTrackTimeStrokeColor ??
			DEFAULT_STATE.audioTrackTimeStrokeColor,
		audioTrackTimeStrokeColorSource: normalizeColorSourceMode(
			state.audioTrackTimeStrokeColorSource,
			DEFAULT_STATE.audioTrackTimeStrokeColorSource
		),
		audioTrackTimeStrokeWidth:
			state.audioTrackTimeStrokeWidth ??
			DEFAULT_STATE.audioTrackTimeStrokeWidth,
		audioTrackTimeGlowColor:
			state.audioTrackTimeGlowColor ??
			DEFAULT_STATE.audioTrackTimeGlowColor,
		audioTrackTimeGlowColorSource: normalizeColorSourceMode(
			state.audioTrackTimeGlowColorSource,
			DEFAULT_STATE.audioTrackTimeGlowColorSource
		),
		audioTrackTimeGlowBlur:
			state.audioTrackTimeGlowBlur ??
			DEFAULT_STATE.audioTrackTimeGlowBlur,
		audioTrackTimeGlowReach:
			state.audioTrackTimeGlowReach ??
			DEFAULT_STATE.audioTrackTimeGlowReach,
		audioTrackTimeFilterBrightness:
			state.audioTrackTimeFilterBrightness ??
			DEFAULT_STATE.audioTrackTimeFilterBrightness,
		audioTrackTimeFilterContrast:
			state.audioTrackTimeFilterContrast ??
			DEFAULT_STATE.audioTrackTimeFilterContrast,
		audioTrackTimeFilterSaturation:
			state.audioTrackTimeFilterSaturation ??
			DEFAULT_STATE.audioTrackTimeFilterSaturation,
		audioTrackTimeFilterBlur:
			state.audioTrackTimeFilterBlur ??
			DEFAULT_STATE.audioTrackTimeFilterBlur,
		audioTrackTimeFilterHueRotate:
			state.audioTrackTimeFilterHueRotate ??
			DEFAULT_STATE.audioTrackTimeFilterHueRotate,
		audioLyricsEnabled:
			state.audioLyricsEnabled ?? DEFAULT_STATE.audioLyricsEnabled,
		audioLyricsLayoutMode:
			state.audioLyricsLayoutMode ?? DEFAULT_STATE.audioLyricsLayoutMode,
		audioLyricsUppercase:
			state.audioLyricsUppercase ?? DEFAULT_STATE.audioLyricsUppercase,
		audioLyricsPositionX:
			state.audioLyricsPositionX ?? DEFAULT_STATE.audioLyricsPositionX,
		audioLyricsPositionY:
			state.audioLyricsPositionY ?? DEFAULT_STATE.audioLyricsPositionY,
		audioLyricsWidth:
			state.audioLyricsWidth ?? DEFAULT_STATE.audioLyricsWidth,
		audioLyricsFontStyle:
			state.audioLyricsFontStyle ?? DEFAULT_STATE.audioLyricsFontStyle,
		audioLyricsFontSize:
			state.audioLyricsFontSize ?? DEFAULT_STATE.audioLyricsFontSize,
		audioLyricsLetterSpacing:
			state.audioLyricsLetterSpacing ??
			DEFAULT_STATE.audioLyricsLetterSpacing,
		audioLyricsLineHeight:
			state.audioLyricsLineHeight ?? DEFAULT_STATE.audioLyricsLineHeight,
		audioLyricsVisibleLineCount:
			state.audioLyricsVisibleLineCount ??
			DEFAULT_STATE.audioLyricsVisibleLineCount,
		audioLyricsShowTranslation:
			state.audioLyricsShowTranslation ??
			DEFAULT_STATE.audioLyricsShowTranslation,
		audioLyricsOpacity:
			state.audioLyricsOpacity ?? DEFAULT_STATE.audioLyricsOpacity,
		audioLyricsInactiveOpacity:
			state.audioLyricsInactiveOpacity ??
			DEFAULT_STATE.audioLyricsInactiveOpacity,
		audioLyricsTimeOffsetMs:
			state.audioLyricsTimeOffsetMs ??
			DEFAULT_STATE.audioLyricsTimeOffsetMs,
		audioLyricsActiveColor:
			state.audioLyricsActiveColor ??
			DEFAULT_STATE.audioLyricsActiveColor,
		audioLyricsActiveColorSource: normalizeColorSourceMode(
			state.audioLyricsActiveColorSource,
			DEFAULT_STATE.audioLyricsActiveColorSource
		),
		audioLyricsActiveColorMode:
			normalizeLyricsColorMode(state.audioLyricsActiveColorMode) ??
			DEFAULT_STATE.audioLyricsActiveColorMode,
		audioLyricsActiveColorSecondary:
			typeof state.audioLyricsActiveColorSecondary === 'string'
				? state.audioLyricsActiveColorSecondary
				: DEFAULT_STATE.audioLyricsActiveColorSecondary,
		audioLyricsInactiveColor:
			state.audioLyricsInactiveColor ??
			DEFAULT_STATE.audioLyricsInactiveColor,
		audioLyricsInactiveColorSource: normalizeColorSourceMode(
			state.audioLyricsInactiveColorSource,
			DEFAULT_STATE.audioLyricsInactiveColorSource
		),
		audioLyricsTextTreatment: normalizeNowPlayingTextTreatment(
			state.audioLyricsTextTreatment,
			DEFAULT_STATE.audioLyricsTextTreatment
		),
		audioLyricsStrokeColor:
			state.audioLyricsStrokeColor ??
			DEFAULT_STATE.audioLyricsStrokeColor,
		audioLyricsStrokeColorSource: normalizeColorSourceMode(
			state.audioLyricsStrokeColorSource,
			DEFAULT_STATE.audioLyricsStrokeColorSource
		),
		audioLyricsStrokeColorMode:
			normalizeLyricsColorMode(state.audioLyricsStrokeColorMode) ??
			DEFAULT_STATE.audioLyricsStrokeColorMode,
		audioLyricsStrokeColorSecondary:
			typeof state.audioLyricsStrokeColorSecondary === 'string'
				? state.audioLyricsStrokeColorSecondary
				: DEFAULT_STATE.audioLyricsStrokeColorSecondary,
		audioLyricsStrokeWidth:
			state.audioLyricsStrokeWidth ??
			DEFAULT_STATE.audioLyricsStrokeWidth,
		audioLyricsGlowColor:
			state.audioLyricsGlowColor ?? DEFAULT_STATE.audioLyricsGlowColor,
		audioLyricsGlowColorSource: normalizeColorSourceMode(
			state.audioLyricsGlowColorSource,
			DEFAULT_STATE.audioLyricsGlowColorSource
		),
		audioLyricsGlowColorMode:
			normalizeLyricsColorMode(state.audioLyricsGlowColorMode) ??
			DEFAULT_STATE.audioLyricsGlowColorMode,
		audioLyricsGlowColorSecondary:
			typeof state.audioLyricsGlowColorSecondary === 'string'
				? state.audioLyricsGlowColorSecondary
				: DEFAULT_STATE.audioLyricsGlowColorSecondary,
		audioLyricsGlowBlur:
			state.audioLyricsGlowBlur ?? DEFAULT_STATE.audioLyricsGlowBlur,
		audioLyricsGlowReach:
			state.audioLyricsGlowReach ?? DEFAULT_STATE.audioLyricsGlowReach,
		audioLyricsTransitionIn: normalizeLyricsTextTransition(
			state.audioLyricsTransitionIn,
			DEFAULT_STATE.audioLyricsTransitionIn
		),
		audioLyricsTransitionOut: normalizeLyricsTextTransition(
			state.audioLyricsTransitionOut,
			DEFAULT_STATE.audioLyricsTransitionOut
		),
		audioLyricsActiveAnimation: normalizeLyricsActiveAnimation(
			state.audioLyricsActiveAnimation,
			DEFAULT_STATE.audioLyricsActiveAnimation
		),
		audioLyricsAnimationDurationMs:
			state.audioLyricsAnimationDurationMs ??
			DEFAULT_STATE.audioLyricsAnimationDurationMs,
		audioLyricsBackdropEnabled:
			state.audioLyricsBackdropEnabled ??
			DEFAULT_STATE.audioLyricsBackdropEnabled,
		audioLyricsBackdropColor:
			state.audioLyricsBackdropColor ??
			DEFAULT_STATE.audioLyricsBackdropColor,
		audioLyricsBackdropColorSource: normalizeColorSourceMode(
			state.audioLyricsBackdropColorSource,
			DEFAULT_STATE.audioLyricsBackdropColorSource
		),
		audioLyricsBackdropColorMode:
			normalizeLyricsColorMode(state.audioLyricsBackdropColorMode) ??
			DEFAULT_STATE.audioLyricsBackdropColorMode,
		audioLyricsBackdropColorSecondary:
			typeof state.audioLyricsBackdropColorSecondary === 'string'
				? state.audioLyricsBackdropColorSecondary
				: DEFAULT_STATE.audioLyricsBackdropColorSecondary,
		audioLyricsBackdropFollowAnimation:
			state.audioLyricsBackdropFollowAnimation ??
			DEFAULT_STATE.audioLyricsBackdropFollowAnimation,
		audioLyricsBackdropOpacity:
			state.audioLyricsBackdropOpacity ??
			DEFAULT_STATE.audioLyricsBackdropOpacity,
		audioLyricsBackdropPadding:
			state.audioLyricsBackdropPadding ??
			DEFAULT_STATE.audioLyricsBackdropPadding,
		audioLyricsBackdropRadius:
			state.audioLyricsBackdropRadius ??
			DEFAULT_STATE.audioLyricsBackdropRadius,
		audioLyricsByTrackAssetId: normalizeAudioLyricsTrackEntries(
			state.audioLyricsByTrackAssetId
		),
		slideshowTransitionIntensity:
			state.slideshowTransitionIntensity ??
			DEFAULT_STATE.slideshowTransitionIntensity,
		slideshowTransitionAudioDrive:
			state.slideshowTransitionAudioDrive ??
			DEFAULT_STATE.slideshowTransitionAudioDrive,
		slideshowTransitionAudioChannel: normalizeAudioChannel(
			state.slideshowTransitionAudioChannel,
			DEFAULT_STATE.slideshowTransitionAudioChannel
		),
		slideshowAudioCheckpointsEnabled:
			state.slideshowAudioCheckpointsEnabled ??
			DEFAULT_STATE.slideshowAudioCheckpointsEnabled,
		slideshowTrackChangeSyncEnabled:
			state.slideshowTrackChangeSyncEnabled ??
			DEFAULT_STATE.slideshowTrackChangeSyncEnabled,
		slideshowManualTimestampsEnabled:
			state.slideshowManualTimestampsEnabled ??
			DEFAULT_STATE.slideshowManualTimestampsEnabled,
		imageAudioReactiveDecay:
			state.imageAudioReactiveDecay ??
			DEFAULT_STATE.imageAudioReactiveDecay,
		imageAudioSmoothing:
			state.imageAudioSmoothing ?? DEFAULT_STATE.imageAudioSmoothing,
		imageOpacityReactive:
			state.imageOpacityReactive ?? DEFAULT_STATE.imageOpacityReactive,
		imageOpacityReactiveAmount:
			state.imageOpacityReactiveAmount ??
			DEFAULT_STATE.imageOpacityReactiveAmount,
		imageOpacityReactiveInvert:
			state.imageOpacityReactiveInvert ??
			DEFAULT_STATE.imageOpacityReactiveInvert,
		imageOpacityReactiveThreshold:
			state.imageOpacityReactiveThreshold ??
			DEFAULT_STATE.imageOpacityReactiveThreshold,
		imageOpacityReactiveSoftness:
			state.imageOpacityReactiveSoftness ??
			DEFAULT_STATE.imageOpacityReactiveSoftness,
		imageBlurReactive:
			state.imageBlurReactive ?? DEFAULT_STATE.imageBlurReactive,
		imageBlurReactiveAmount:
			state.imageBlurReactiveAmount ??
			DEFAULT_STATE.imageBlurReactiveAmount,
		imageBlurReactiveInvert:
			state.imageBlurReactiveInvert ??
			DEFAULT_STATE.imageBlurReactiveInvert,
		imageBlurReactiveThreshold:
			state.imageBlurReactiveThreshold ??
			DEFAULT_STATE.imageBlurReactiveThreshold,
		imageBlurReactiveSoftness:
			state.imageBlurReactiveSoftness ??
			DEFAULT_STATE.imageBlurReactiveSoftness,
		imageBassAttack: state.imageBassAttack ?? DEFAULT_STATE.imageBassAttack,
		imageBassRelease:
			state.imageBassRelease ??
			0.02 +
				(1 -
					(state.imageAudioReactiveDecay ??
						DEFAULT_STATE.imageAudioReactiveDecay)) *
					0.2,
		imageBassReactivitySpeed:
			state.imageBassReactivitySpeed ??
			DEFAULT_STATE.imageBassReactivitySpeed,
		imageBassPeakWindow:
			state.imageBassPeakWindow ?? DEFAULT_STATE.imageBassPeakWindow,
		imageBassPeakFloor:
			state.imageBassPeakFloor ?? DEFAULT_STATE.imageBassPeakFloor,
		imageBassPunch: state.imageBassPunch ?? DEFAULT_STATE.imageBassPunch,
		imageBassReactiveScaleIntensity:
			state.imageBassReactiveScaleIntensity ??
			DEFAULT_STATE.imageBassReactiveScaleIntensity,
		imageBassZoomPresetId:
			state.imageBassZoomPresetId ?? DEFAULT_STATE.imageBassZoomPresetId,
		imageAudioChannel: normalizeAudioChannel(
			state.imageAudioChannel,
			DEFAULT_STATE.imageAudioChannel
		),
		rgbShiftAudioChannel: normalizeAudioChannel(
			state.rgbShiftAudioChannel,
			DEFAULT_STATE.rgbShiftAudioChannel
		),
		rgbShiftAudioSmoothing:
			state.rgbShiftAudioSmoothing ??
			DEFAULT_STATE.rgbShiftAudioSmoothing,
		rgbShiftAudioAttack:
			state.rgbShiftAudioAttack ?? DEFAULT_STATE.rgbShiftAudioAttack,
		rgbShiftAudioRelease:
			state.rgbShiftAudioRelease ?? DEFAULT_STATE.rgbShiftAudioRelease,
		rgbShiftAudioReactivitySpeed:
			state.rgbShiftAudioReactivitySpeed ??
			DEFAULT_STATE.rgbShiftAudioReactivitySpeed,
		rgbShiftAudioPeakWindow:
			state.rgbShiftAudioPeakWindow ??
			DEFAULT_STATE.rgbShiftAudioPeakWindow,
		rgbShiftAudioPeakFloor:
			state.rgbShiftAudioPeakFloor ??
			DEFAULT_STATE.rgbShiftAudioPeakFloor,
		rgbShiftAudioPunch:
			state.rgbShiftAudioPunch ?? DEFAULT_STATE.rgbShiftAudioPunch,
		slideshowTransitionAudioSmoothing:
			state.slideshowTransitionAudioSmoothing ??
			DEFAULT_STATE.slideshowTransitionAudioSmoothing,
		particleGlowAudioAmount:
			state.particleGlowAudioAmount ??
			DEFAULT_STATE.particleGlowAudioAmount,
		particleAudioChannel: normalizeAudioChannel(
			state.particleAudioChannel,
			DEFAULT_STATE.particleAudioChannel
		),
		particleAudioSmoothing:
			state.particleAudioSmoothing ??
			DEFAULT_STATE.particleAudioSmoothing,
		particleAudioAttack:
			state.particleAudioAttack ?? DEFAULT_STATE.particleAudioAttack,
		particleAudioRelease:
			state.particleAudioRelease ?? DEFAULT_STATE.particleAudioRelease,
		particleAudioReactivitySpeed:
			state.particleAudioReactivitySpeed ??
			DEFAULT_STATE.particleAudioReactivitySpeed,
		particleAudioPeakWindow:
			state.particleAudioPeakWindow ??
			DEFAULT_STATE.particleAudioPeakWindow,
		particleAudioPeakFloor:
			state.particleAudioPeakFloor ??
			DEFAULT_STATE.particleAudioPeakFloor,
		particleAudioPunch:
			state.particleAudioPunch ?? DEFAULT_STATE.particleAudioPunch,
		particleAudioDriftEnabled:
			typeof state.particleAudioDriftEnabled === 'boolean'
				? state.particleAudioDriftEnabled
				: DEFAULT_STATE.particleAudioDriftEnabled,
		particleAudioDriftAngle:
			state.particleAudioDriftAngle ??
			DEFAULT_STATE.particleAudioDriftAngle,
		particleAudioDriftAmount:
			state.particleAudioDriftAmount ??
			DEFAULT_STATE.particleAudioDriftAmount,
		particleAudioDriftBase:
			state.particleAudioDriftBase ??
			DEFAULT_STATE.particleAudioDriftBase,
		particleAudioDriftChannel: normalizeAudioChannel(
			state.particleAudioDriftChannel,
			DEFAULT_STATE.particleAudioDriftChannel
		),
		particleAudioDriftThreshold:
			state.particleAudioDriftThreshold ??
			DEFAULT_STATE.particleAudioDriftThreshold,
		particleAudioDriftRelease:
			state.particleAudioDriftRelease ??
			DEFAULT_STATE.particleAudioDriftRelease,
		particleAudioDriftMode: normalizeParticleAudioDriftMode(
			state.particleAudioDriftMode,
			DEFAULT_STATE.particleAudioDriftMode
		),
		particleDepthFlowEnabled:
			typeof state.particleDepthFlowEnabled === 'boolean'
				? state.particleDepthFlowEnabled
				: DEFAULT_STATE.particleDepthFlowEnabled,
		particleDepthFlowAmount:
			state.particleDepthFlowAmount ??
			DEFAULT_STATE.particleDepthFlowAmount,
		particleDepthFlowDirection: normalizeParticleDepthFlowDirection(
			state.particleDepthFlowDirection,
			DEFAULT_STATE.particleDepthFlowDirection
		),
		particleDepthFlowChannel: normalizeAudioChannel(
			state.particleDepthFlowChannel,
			DEFAULT_STATE.particleDepthFlowChannel
		),
		particleDepthFlowThreshold:
			state.particleDepthFlowThreshold ??
			DEFAULT_STATE.particleDepthFlowThreshold,
		particleDepthFlowSensitivity:
			state.particleDepthFlowSensitivity ??
			DEFAULT_STATE.particleDepthFlowSensitivity,
		particleDepthFlowAttack:
			state.particleDepthFlowAttack ??
			DEFAULT_STATE.particleDepthFlowAttack,
		particleDepthFlowRelease:
			state.particleDepthFlowRelease ??
			DEFAULT_STATE.particleDepthFlowRelease,
		particleDepthFlowSpeed:
			state.particleDepthFlowSpeed ??
			DEFAULT_STATE.particleDepthFlowSpeed,
		particleDepthFlowSpread:
			state.particleDepthFlowSpread ??
			DEFAULT_STATE.particleDepthFlowSpread,
		particleDepthFlowFocusX:
			state.particleDepthFlowFocusX ??
			DEFAULT_STATE.particleDepthFlowFocusX,
		particleDepthFlowFocusY:
			state.particleDepthFlowFocusY ??
			DEFAULT_STATE.particleDepthFlowFocusY,
		particleDepthFlowMode: normalizeParticleDepthFlowMode(
			state.particleDepthFlowMode,
			DEFAULT_STATE.particleDepthFlowMode
		),
		particleDepthFlowSpawnOrigin: normalizeParticleDepthFlowSpawnOrigin(
			state.particleDepthFlowSpawnOrigin,
			DEFAULT_STATE.particleDepthFlowSpawnOrigin
		),
		particleDepthFlowInvertFocusOnLowEnergy:
			typeof state.particleDepthFlowInvertFocusOnLowEnergy === 'boolean'
				? state.particleDepthFlowInvertFocusOnLowEnergy
				: typeof state.particleAudioDriftInvertOnLowEnergy === 'boolean'
					? state.particleAudioDriftInvertOnLowEnergy
					: DEFAULT_STATE.particleDepthFlowInvertFocusOnLowEnergy,
		particleDepthFlowInvertFocusAxis:
			normalizeParticleDepthFlowLowEnergyAxis(
				state.particleDepthFlowInvertFocusAxis,
				DEFAULT_STATE.particleDepthFlowInvertFocusAxis
			),
		particleDepthFlowWindInfluence:
			state.particleDepthFlowWindInfluence ??
			DEFAULT_STATE.particleDepthFlowWindInfluence,
		particleLifetime:
			state.particleLifetime ?? DEFAULT_STATE.particleLifetime,
		particleColorSource: normalizeColorSourceMode(
			state.particleColorSource,
			DEFAULT_STATE.particleColorSource
		),
		spectrumBandMode: normalizeAudioChannel(
			state.spectrumBandMode,
			DEFAULT_STATE.spectrumBandMode
		),
		spectrumColorSource: normalizeColorSourceMode(
			state.spectrumColorSource,
			DEFAULT_STATE.spectrumColorSource
		),
		spectrumAudioSmoothing:
			state.spectrumAudioSmoothing ??
			DEFAULT_STATE.spectrumAudioSmoothing,
		spectrumGlowAudioAmount:
			state.spectrumGlowAudioAmount ??
			DEFAULT_STATE.spectrumGlowAudioAmount,
		spectrumPositionX: state.spectrumPositionX ?? legacySpectrumPositionX,
		spectrumPositionY: state.spectrumPositionY ?? legacySpectrumPositionY,
		logoAudioSmoothing:
			state.logoAudioSmoothing ?? DEFAULT_STATE.logoAudioSmoothing,
		logoGlowAudioAmount:
			state.logoGlowAudioAmount ?? DEFAULT_STATE.logoGlowAudioAmount,
		logoGlowColorSource: normalizeColorSourceMode(
			state.logoGlowColorSource,
			DEFAULT_STATE.logoGlowColorSource
		),
		logoShadowColorSource: normalizeColorSourceMode(
			state.logoShadowColorSource,
			DEFAULT_STATE.logoShadowColorSource
		),
		logoBackdropColorSource: normalizeColorSourceMode(
			state.logoBackdropColorSource,
			DEFAULT_STATE.logoBackdropColorSource
		),
		rainColorSource: normalizeColorSourceMode(
			state.rainColorSource,
			DEFAULT_STATE.rainColorSource
		),
		showFps: state.showFps ?? DEFAULT_STATE.showFps,
		controlPanelAnchor:
			state.controlPanelAnchor ?? DEFAULT_STATE.controlPanelAnchor,
		controlPanelOffsetX:
			state.controlPanelOffsetX ?? DEFAULT_STATE.controlPanelOffsetX,
		controlPanelOffsetY:
			state.controlPanelOffsetY ?? DEFAULT_STATE.controlPanelOffsetY,
		hudLiquidGlassEnabled:
			typeof state.hudLiquidGlassEnabled === 'boolean'
				? state.hudLiquidGlassEnabled
				: DEFAULT_STATE.hudLiquidGlassEnabled,
		quickEditCaptureMode:
			state.quickEditCaptureMode === 'total' ||
			state.quickEditCaptureMode === 'selection'
				? state.quickEditCaptureMode
				: DEFAULT_STATE.quickEditCaptureMode,
		colorFavorites: (() => {
			const stored = Array.isArray(state.colorFavorites)
				? state.colorFavorites.filter(
						(entry): entry is string => typeof entry === 'string'
					)
				: [];
			// Seed the curated starter palette for fresh/legacy installs whose
			// favourites strip is still empty; keep any user-curated list as-is.
			return stored.length > 0 ? stored : DEFAULT_STATE.colorFavorites;
		})(),
		fpsOverlayAnchor:
			state.fpsOverlayAnchor ?? DEFAULT_STATE.fpsOverlayAnchor,
		editorTheme: state.editorTheme ?? DEFAULT_STATE.editorTheme,
		editorImagePreviewQuality:
			state.editorImagePreviewQuality === 'original' ||
			state.editorImagePreviewQuality === 'optimized'
				? state.editorImagePreviewQuality
				: DEFAULT_STATE.editorImagePreviewQuality,
		editorThemeColorSource: normalizeThemeColorSource(
			state.editorThemeColorSource,
			DEFAULT_STATE.editorThemeColorSource
		),
		editorCornerRadius:
			state.editorCornerRadius ?? DEFAULT_STATE.editorCornerRadius,
		editorControlCornerRadius:
			state.editorControlCornerRadius ??
			state.editorCornerRadius ??
			DEFAULT_STATE.editorControlCornerRadius,
		editorShowPreciseNumericControls:
			typeof state.editorShowPreciseNumericControls === 'boolean'
				? state.editorShowPreciseNumericControls
				: DEFAULT_STATE.editorShowPreciseNumericControls,
		editorCompactSlotIcons:
			typeof state.editorCompactSlotIcons === 'boolean'
				? state.editorCompactSlotIcons
				: DEFAULT_STATE.editorCompactSlotIcons,
		editorManualAccentColor:
			state.editorManualAccentColor ??
			DEFAULT_STATE.editorManualAccentColor,
		editorManualSecondaryColor:
			state.editorManualSecondaryColor ??
			DEFAULT_STATE.editorManualSecondaryColor,
		editorManualBackdropColor:
			state.editorManualBackdropColor ??
			DEFAULT_STATE.editorManualBackdropColor,
		editorManualTextPrimaryColor:
			state.editorManualTextPrimaryColor ??
			DEFAULT_STATE.editorManualTextPrimaryColor,
		editorManualTextSecondaryColor:
			state.editorManualTextSecondaryColor ??
			DEFAULT_STATE.editorManualTextSecondaryColor,
		editorManualBackdropOpacity:
			state.editorManualBackdropOpacity ??
			DEFAULT_STATE.editorManualBackdropOpacity,
		editorManualBlurPx:
			state.editorManualBlurPx ?? DEFAULT_STATE.editorManualBlurPx,
		editorManualSurfaceOpacity:
			state.editorManualSurfaceOpacity ??
			DEFAULT_STATE.editorManualSurfaceOpacity,
		editorManualItemOpacity:
			state.editorManualItemOpacity ??
			DEFAULT_STATE.editorManualItemOpacity,
		quickActionsEnabled:
			state.quickActionsEnabled ?? DEFAULT_STATE.quickActionsEnabled,
		// Migrate from old px-based offset (±1400) to normalized 0–1.
		// Values outside [−1.5, 1.5] are treated as legacy px values and reset.
		quickActionsPositionX:
			typeof state.quickActionsPositionX === 'number' &&
			Math.abs(state.quickActionsPositionX) <= 1.5
				? state.quickActionsPositionX
				: DEFAULT_STATE.quickActionsPositionX,
		quickActionsPositionY:
			typeof state.quickActionsPositionY === 'number' &&
			Math.abs(state.quickActionsPositionY) <= 1.5
				? state.quickActionsPositionY
				: DEFAULT_STATE.quickActionsPositionY,
		quickActionsLauncherPositionX:
			typeof state.quickActionsLauncherPositionX === 'number' &&
			Math.abs(state.quickActionsLauncherPositionX) <= 1.5
				? state.quickActionsLauncherPositionX
				: DEFAULT_STATE.quickActionsLauncherPositionX,
		quickActionsLauncherPositionY:
			typeof state.quickActionsLauncherPositionY === 'number' &&
			Math.abs(state.quickActionsLauncherPositionY) <= 1.5
				? state.quickActionsLauncherPositionY
				: DEFAULT_STATE.quickActionsLauncherPositionY,
		quickActionsBackdropOpacity:
			state.quickActionsBackdropOpacity ??
			DEFAULT_STATE.quickActionsBackdropOpacity,
		quickActionsBlurPx:
			state.quickActionsBlurPx ?? DEFAULT_STATE.quickActionsBlurPx,
		quickActionsScale:
			state.quickActionsScale ?? DEFAULT_STATE.quickActionsScale,
		quickActionsLauncherSize:
			state.quickActionsLauncherSize ??
			DEFAULT_STATE.quickActionsLauncherSize,
		quickActionsColorSource: normalizeThemeColorSource(
			state.quickActionsColorSource,
			DEFAULT_STATE.quickActionsColorSource
		),
		quickActionsManualAccentColor:
			state.quickActionsManualAccentColor ??
			DEFAULT_STATE.quickActionsManualAccentColor,
		quickActionsManualSecondaryColor:
			state.quickActionsManualSecondaryColor ??
			DEFAULT_STATE.quickActionsManualSecondaryColor,
		quickActionsManualBackdropColor:
			state.quickActionsManualBackdropColor ??
			DEFAULT_STATE.quickActionsManualBackdropColor,
		quickActionsManualTextPrimaryColor:
			state.quickActionsManualTextPrimaryColor ??
			DEFAULT_STATE.quickActionsManualTextPrimaryColor,
		quickActionsManualTextSecondaryColor:
			state.quickActionsManualTextSecondaryColor ??
			DEFAULT_STATE.quickActionsManualTextSecondaryColor,
		quickActionsManualSurfaceOpacity:
			state.quickActionsManualSurfaceOpacity ??
			DEFAULT_STATE.quickActionsManualSurfaceOpacity,
		quickActionsManualItemOpacity:
			state.quickActionsManualItemOpacity ??
			DEFAULT_STATE.quickActionsManualItemOpacity,
		sleepModeEnabled:
			state.sleepModeEnabled ?? DEFAULT_STATE.sleepModeEnabled,
		sleepModeDelaySeconds:
			state.sleepModeDelaySeconds ?? DEFAULT_STATE.sleepModeDelaySeconds,
		sleepModeActive: DEFAULT_STATE.sleepModeActive,
		virtualFoldersEnabled:
			state.virtualFoldersEnabled ?? DEFAULT_STATE.virtualFoldersEnabled,
		customPresets: migratedCustomPresets,
		// Slot refactor v46: legacy `userScenes` / `activeUserSceneId` were a
		// bundle-based scene system. The new `sceneSlots` model stores refs
		// only; saved bundles are intentionally discarded (the user chose the
		// clean-replace migration path). New arrays are initialized empty.
		sceneSlots: migrateSceneSlots(state, migratedSlotFamilies),
		activeSceneSlotId:
			typeof (state as { activeSceneSlotId?: unknown })
				.activeSceneSlotId === 'string' ||
			(state as { activeSceneSlotId?: unknown }).activeSceneSlotId ===
				null
				? ((state as { activeSceneSlotId: string | null })
						.activeSceneSlotId ?? null)
				: DEFAULT_STATE.activeSceneSlotId,
		// v98: Scene-first default scene. Older stores lack it → null.
		defaultSceneSlotId:
			typeof (state as { defaultSceneSlotId?: unknown })
				.defaultSceneSlotId === 'string'
				? (state as { defaultSceneSlotId: string }).defaultSceneSlotId
				: DEFAULT_STATE.defaultSceneSlotId,
		particlesProfileSlots: migratedSlotFamilies.particlesProfileSlots,
		rainProfileSlots: migratedSlotFamilies.rainProfileSlots,
		looksProfileSlots: migratedSlotFamilies.looksProfileSlots,
		lightsProfileSlots: migratedSlotFamilies.lightsProfileSlots,
		cameraFxProfileSlots: migratedSlotFamilies.cameraFxProfileSlots,
		trackTitleProfileSlots: migratedSlotFamilies.trackTitleProfileSlots,
		imageRotation:
			typeof state.imageRotation === 'number'
				? state.imageRotation
				: DEFAULT_STATE.imageRotation,
		spectrumFamily: normalizeSpectrumFamily(
			state.spectrumFamily ?? DEFAULT_STATE.spectrumFamily
		),
		spectrumAfterglow:
			state.spectrumAfterglow ?? DEFAULT_STATE.spectrumAfterglow,
		spectrumMotionTrails:
			state.spectrumMotionTrails ?? DEFAULT_STATE.spectrumMotionTrails,
		spectrumGhostFrames:
			state.spectrumGhostFrames ?? DEFAULT_STATE.spectrumGhostFrames,
		spectrumFrameHistoryDepth:
			state.spectrumFrameHistoryDepth ??
			DEFAULT_STATE.spectrumFrameHistoryDepth,
		spectrumGainExpressiveness:
			state.spectrumGainExpressiveness ??
			DEFAULT_STATE.spectrumGainExpressiveness,
		spectrumEnvelopeAttack:
			state.spectrumEnvelopeAttack ??
			DEFAULT_STATE.spectrumEnvelopeAttack,
		spectrumEnvelopeRelease:
			state.spectrumEnvelopeRelease ??
			DEFAULT_STATE.spectrumEnvelopeRelease,
		spectrumEnvelopeReactivitySpeed:
			state.spectrumEnvelopeReactivitySpeed ??
			DEFAULT_STATE.spectrumEnvelopeReactivitySpeed,
		spectrumEnvelopePeakWindow:
			state.spectrumEnvelopePeakWindow ??
			DEFAULT_STATE.spectrumEnvelopePeakWindow,
		spectrumEnvelopePeakFloor:
			state.spectrumEnvelopePeakFloor ??
			DEFAULT_STATE.spectrumEnvelopePeakFloor,
		spectrumEnvelopePunch:
			state.spectrumEnvelopePunch ?? DEFAULT_STATE.spectrumEnvelopePunch,
		spectrumPeakRibbons:
			state.spectrumPeakRibbons ?? DEFAULT_STATE.spectrumPeakRibbons,
		spectrumBassShockwave:
			state.spectrumBassShockwave ?? DEFAULT_STATE.spectrumBassShockwave,
		spectrumShockwaveBandMode:
			state.spectrumShockwaveBandMode ??
			DEFAULT_STATE.spectrumShockwaveBandMode,
		spectrumShockwaveBandThresholds: {
			...DEFAULT_STATE.spectrumShockwaveBandThresholds,
			...state.spectrumShockwaveBandThresholds
		},
		spectrumShockwaveThickness:
			state.spectrumShockwaveThickness ??
			DEFAULT_STATE.spectrumShockwaveThickness,
		spectrumShockwaveOpacity:
			state.spectrumShockwaveOpacity ??
			DEFAULT_STATE.spectrumShockwaveOpacity,
		spectrumShockwaveBlur:
			state.spectrumShockwaveBlur ?? DEFAULT_STATE.spectrumShockwaveBlur,
		spectrumShockwaveColorMode:
			state.spectrumShockwaveColorMode ??
			DEFAULT_STATE.spectrumShockwaveColorMode,
		spectrumEnergyBloom:
			state.spectrumEnergyBloom ?? DEFAULT_STATE.spectrumEnergyBloom,
		spectrumPeakRibbonAngle:
			state.spectrumPeakRibbonAngle ??
			DEFAULT_STATE.spectrumPeakRibbonAngle,
		spectrumFigureRotationSpeed:
			state.spectrumFigureRotationSpeed ??
			DEFAULT_STATE.spectrumFigureRotationSpeed,
		spectrumOscilloscopeLineWidth:
			state.spectrumOscilloscopeLineWidth ??
			DEFAULT_STATE.spectrumOscilloscopeLineWidth,
		spectrumTunnelRingCount:
			state.spectrumTunnelRingCount ??
			DEFAULT_STATE.spectrumTunnelRingCount,
		spectrumTunnelDepthFalloff:
			state.spectrumTunnelDepthFalloff ??
			DEFAULT_STATE.spectrumTunnelDepthFalloff,
		spectrumTunnelRingSpacing:
			state.spectrumTunnelRingSpacing ??
			DEFAULT_STATE.spectrumTunnelRingSpacing,
		spectrumTunnelWallOpacity:
			state.spectrumTunnelWallOpacity ??
			DEFAULT_STATE.spectrumTunnelWallOpacity,
		spectrumTunnelPulseStrength:
			state.spectrumTunnelPulseStrength ??
			DEFAULT_STATE.spectrumTunnelPulseStrength,
		spectrumTunnelAlternateRotation:
			state.spectrumTunnelAlternateRotation ??
			DEFAULT_STATE.spectrumTunnelAlternateRotation,
		spectrumLiquidLayer1Opacity:
			state.spectrumLiquidLayer1Opacity ??
			DEFAULT_STATE.spectrumLiquidLayer1Opacity,
		spectrumLiquidLayer2Opacity:
			state.spectrumLiquidLayer2Opacity ??
			DEFAULT_STATE.spectrumLiquidLayer2Opacity,
		spectrumLiquidLayer3Opacity:
			state.spectrumLiquidLayer3Opacity ??
			DEFAULT_STATE.spectrumLiquidLayer3Opacity,
		spectrumLiquidLayer1Amp:
			state.spectrumLiquidLayer1Amp ??
			DEFAULT_STATE.spectrumLiquidLayer1Amp,
		spectrumLiquidLayer2Amp:
			state.spectrumLiquidLayer2Amp ??
			DEFAULT_STATE.spectrumLiquidLayer2Amp,
		spectrumLiquidLayer3Amp:
			state.spectrumLiquidLayer3Amp ??
			DEFAULT_STATE.spectrumLiquidLayer3Amp,
		spectrumLiquidLayer1Fill:
			state.spectrumLiquidLayer1Fill ??
			DEFAULT_STATE.spectrumLiquidLayer1Fill,
		spectrumLiquidLayer2Fill:
			state.spectrumLiquidLayer2Fill ??
			DEFAULT_STATE.spectrumLiquidLayer2Fill,
		spectrumLiquidLayer3Fill:
			state.spectrumLiquidLayer3Fill ??
			DEFAULT_STATE.spectrumLiquidLayer3Fill,
		spectrumLiquidLayer1Speed:
			state.spectrumLiquidLayer1Speed ??
			DEFAULT_STATE.spectrumLiquidLayer1Speed,
		spectrumLiquidLayer2Speed:
			state.spectrumLiquidLayer2Speed ??
			DEFAULT_STATE.spectrumLiquidLayer2Speed,
		spectrumLiquidLayer3Speed:
			state.spectrumLiquidLayer3Speed ??
			DEFAULT_STATE.spectrumLiquidLayer3Speed,
		spectrumLiquidLayer1RotationSpeed:
			state.spectrumLiquidLayer1RotationSpeed ??
			DEFAULT_STATE.spectrumLiquidLayer1RotationSpeed,
		spectrumLiquidLayer2RotationSpeed:
			state.spectrumLiquidLayer2RotationSpeed ??
			DEFAULT_STATE.spectrumLiquidLayer2RotationSpeed,
		spectrumLiquidLayer3RotationSpeed:
			state.spectrumLiquidLayer3RotationSpeed ??
			DEFAULT_STATE.spectrumLiquidLayer3RotationSpeed,
		spectrumLiquidLayer1Shape:
			state.spectrumLiquidLayer1Shape ??
			DEFAULT_STATE.spectrumLiquidLayer1Shape,
		spectrumLiquidLayer2Shape:
			state.spectrumLiquidLayer2Shape ??
			DEFAULT_STATE.spectrumLiquidLayer2Shape,
		spectrumLiquidLayer3Shape:
			state.spectrumLiquidLayer3Shape ??
			DEFAULT_STATE.spectrumLiquidLayer3Shape,
		spectrumLiquidLayer1RigidShape: resolveLegacyLiquidRigidShape(state, 1),
		spectrumLiquidLayer2RigidShape: resolveLegacyLiquidRigidShape(state, 2),
		spectrumLiquidLayer3RigidShape: resolveLegacyLiquidRigidShape(state, 3),
		spectrumLiquidLayer1Pixelate:
			state.spectrumLiquidLayer1Pixelate ??
			DEFAULT_STATE.spectrumLiquidLayer1Pixelate,
		spectrumLiquidLayer2Pixelate:
			state.spectrumLiquidLayer2Pixelate ??
			DEFAULT_STATE.spectrumLiquidLayer2Pixelate,
		spectrumLiquidLayer3Pixelate:
			state.spectrumLiquidLayer3Pixelate ??
			DEFAULT_STATE.spectrumLiquidLayer3Pixelate,
		spectrumSpiralTurns:
			state.spectrumSpiralTurns ?? DEFAULT_STATE.spectrumSpiralTurns,
		spectrumSpiralOuterRadius:
			state.spectrumSpiralOuterRadius ??
			DEFAULT_STATE.spectrumSpiralOuterRadius,
		spectrumSpiralTightness:
			state.spectrumSpiralTightness ??
			DEFAULT_STATE.spectrumSpiralTightness,
		spectrumSpiralShape:
			state.spectrumSpiralShape ?? DEFAULT_STATE.spectrumSpiralShape,
		spectrumSpiralLogarithmic:
			typeof state.spectrumSpiralLogarithmic === 'boolean'
				? state.spectrumSpiralLogarithmic
				: DEFAULT_STATE.spectrumSpiralLogarithmic,
		spectrumSpiralGradientStroke:
			typeof state.spectrumSpiralGradientStroke === 'boolean'
				? state.spectrumSpiralGradientStroke
				: DEFAULT_STATE.spectrumSpiralGradientStroke,
		spectrumSpiralArms:
			state.spectrumSpiralArms ?? DEFAULT_STATE.spectrumSpiralArms,
		spectrumSpiralAudioTurns:
			state.spectrumSpiralAudioTurns ??
			DEFAULT_STATE.spectrumSpiralAudioTurns,
		spectrumSpiralDotShape:
			state.spectrumSpiralDotShape ??
			DEFAULT_STATE.spectrumSpiralDotShape,
		spectrumSpiralStrokeWidth:
			state.spectrumSpiralStrokeWidth ??
			DEFAULT_STATE.spectrumSpiralStrokeWidth,
		spectrumOscilloscopeScrollSpeed:
			state.spectrumOscilloscopeScrollSpeed ??
			DEFAULT_STATE.spectrumOscilloscopeScrollSpeed,
		spectrumOscilloscopeReactiveWidth:
			typeof state.spectrumOscilloscopeReactiveWidth === 'boolean'
				? state.spectrumOscilloscopeReactiveWidth
				: DEFAULT_STATE.spectrumOscilloscopeReactiveWidth,
		spectrumOscilloscopePhosphor:
			typeof state.spectrumOscilloscopePhosphor === 'boolean'
				? state.spectrumOscilloscopePhosphor
				: DEFAULT_STATE.spectrumOscilloscopePhosphor,
		spectrumOscilloscopePhosphorDecay:
			state.spectrumOscilloscopePhosphorDecay ??
			DEFAULT_STATE.spectrumOscilloscopePhosphorDecay,
		spectrumOscilloscopeGrid:
			typeof state.spectrumOscilloscopeGrid === 'boolean'
				? state.spectrumOscilloscopeGrid
				: DEFAULT_STATE.spectrumOscilloscopeGrid,
		spectrumOscilloscopeGridDivisions:
			state.spectrumOscilloscopeGridDivisions ??
			DEFAULT_STATE.spectrumOscilloscopeGridDivisions,
		discoveryOnboardingDismissed:
			typeof state.discoveryOnboardingDismissed === 'boolean'
				? state.discoveryOnboardingDismissed
				: true,
		performanceSafeEnabled:
			typeof state.performanceSafeEnabled === 'boolean'
				? state.performanceSafeEnabled
				: DEFAULT_STATE.performanceSafeEnabled,
		performanceModeBeforeSafe:
			state.performanceModeBeforeSafe === 'low' ||
			state.performanceModeBeforeSafe === 'medium' ||
			state.performanceModeBeforeSafe === 'high'
				? state.performanceModeBeforeSafe
				: DEFAULT_STATE.performanceModeBeforeSafe,
		customFilterLookSettings:
			state.customFilterLookSettings ??
			DEFAULT_STATE.customFilterLookSettings,
		calibrationRangeOverrides:
			state.calibrationRangeOverrides &&
			typeof state.calibrationRangeOverrides === 'object'
				? state.calibrationRangeOverrides
				: DEFAULT_STATE.calibrationRangeOverrides,
		calibrationProfileSlots: Array.isArray(state.calibrationProfileSlots)
			? state.calibrationProfileSlots
			: DEFAULT_STATE.calibrationProfileSlots,

		// Logo Flash Edge
		logoFlashEdgeEnabled:
			state.logoFlashEdgeEnabled ?? DEFAULT_STATE.logoFlashEdgeEnabled,
		logoFlashEdgeIntensityMult: finiteOrDefault(
			state.logoFlashEdgeIntensityMult,
			DEFAULT_STATE.logoFlashEdgeIntensityMult
		),
		logoFlashEdgeThickness: finiteOrDefault(
			state.logoFlashEdgeThickness,
			DEFAULT_STATE.logoFlashEdgeThickness
		),
		logoFlashEdgeRadius: finiteOrDefault(
			state.logoFlashEdgeRadius,
			DEFAULT_STATE.logoFlashEdgeRadius
		),
		logoFlashEdgeColorMode:
			state.logoFlashEdgeColorMode === 'flash' ||
			state.logoFlashEdgeColorMode === 'manual'
				? state.logoFlashEdgeColorMode
				: DEFAULT_STATE.logoFlashEdgeColorMode,
		logoFlashEdgeColor:
			typeof state.logoFlashEdgeColor === 'string'
				? state.logoFlashEdgeColor
				: DEFAULT_STATE.logoFlashEdgeColor,

		// Background Flash Edge
		bgFlashEdgeEnabled:
			state.bgFlashEdgeEnabled ?? DEFAULT_STATE.bgFlashEdgeEnabled,
		bgFlashEdgeIntensityMult: finiteOrDefault(
			state.bgFlashEdgeIntensityMult,
			DEFAULT_STATE.bgFlashEdgeIntensityMult
		),
		bgFlashEdgeThickness: finiteOrDefault(
			state.bgFlashEdgeThickness,
			DEFAULT_STATE.bgFlashEdgeThickness
		),
		bgFlashEdgeRadius: finiteOrDefault(
			state.bgFlashEdgeRadius,
			DEFAULT_STATE.bgFlashEdgeRadius
		),
		bgFlashEdgeColorMode:
			state.bgFlashEdgeColorMode === 'flash' ||
			state.bgFlashEdgeColorMode === 'manual'
				? state.bgFlashEdgeColorMode
				: DEFAULT_STATE.bgFlashEdgeColorMode,
		bgFlashEdgeColor:
			typeof state.bgFlashEdgeColor === 'string'
				? state.bgFlashEdgeColor
				: DEFAULT_STATE.bgFlashEdgeColor
	} as WallpaperStore;

	// v103: the combined Motion bundles (particles + rain in one slot) were
	// retired. Any user-saved legacy slot is split into the separate
	// particles/rain slot families so no data is lost, and the
	// `motionProfileSlots` key is dropped from the store. The per-image
	// Spectrum 2 override was retired the same way: any saved override is
	// preserved as a named Spectrum 2 profile slot the user can re-apply.
	if (fromVersion < 103) {
		convertLegacyMotionSlots(state, migratedState);
		convertLegacySecondSpectrumOverrides(state, migratedState);
	}
	delete (migratedState as Record<string, unknown>).motionProfileSlots;
	for (const image of migratedState.backgroundImages ?? []) {
		delete (image as unknown as Record<string, unknown>)
			.spectrumSecondOverride;
	}

	// v104: per-image slot bindings reference slots by id. Legacy saves carry
	// numeric `*ProfileSlotIndex` fields (dropped by image normalization) —
	// translate them here against the migrated families. Idempotent: post-v104
	// images already have the id fields and no legacy keys.
	const rawImages = Array.isArray(state.backgroundImages)
		? (state.backgroundImages as unknown as Array<Record<string, unknown>>)
		: [];
	const imageSlotRef = (
		value: unknown,
		family: ReadonlyArray<{ id: string }>
	): string | null => {
		const ref = migrateSlotRef(value, family);
		return typeof ref === 'string' && ref !== 'off' ? ref : null;
	};
	for (const image of migratedState.backgroundImages ?? []) {
		const raw = rawImages.find(r => r?.assetId === image.assetId);
		if (!raw) continue;
		image.logoProfileSlotId ??= imageSlotRef(
			raw.logoProfileSlotIndex,
			migratedSlotFamilies.logoProfileSlots
		);
		image.spectrumProfileSlotId ??= imageSlotRef(
			raw.spectrumProfileSlotIndex,
			migratedSlotFamilies.spectrumProfileSlots
		);
		image.particlesProfileSlotId ??= imageSlotRef(
			raw.particlesProfileSlotIndex,
			migratedSlotFamilies.particlesProfileSlots
		);
		image.rainProfileSlotId ??= imageSlotRef(
			raw.rainProfileSlotIndex,
			migratedSlotFamilies.rainProfileSlots
		);
		image.looksProfileSlotId ??= imageSlotRef(
			raw.looksProfileSlotIndex,
			migratedSlotFamilies.looksProfileSlots
		);
	}

	// v109: the ten `rgbShiftAudio*` keys joined the Looks snapshot. Until now
	// they were globals sitting beside every look, so the honest backfill for a
	// slot saved earlier is the values that were actually in effect for it —
	// the current globals — not the factory defaults. Saves stay visually
	// identical; from here on each slot carries its own routing.
	if (fromVersion < 109) {
		backfillLooksRgbShiftAudio(migratedState);
	}
	if (fromVersion < 110) {
		migrateLegacyCustomLook(migratedState);
	}
	if (
		fromVersion < 111 &&
		!migratedState.logoId &&
		(migratedState.logoUrl === LEGACY_APP_LOGO_URL ||
			migratedState.logoUrl === CANONICAL_FACTORY_LOGO_URL)
	) {
		migratedState.logoUrl = APP_LOGO_URL;
	}
	if (fromVersion < 112) {
		migratedState.logoVariantMode ??= 'auto';
		for (const slot of migratedState.logoProfileSlots ?? []) {
			if (slot.values) slot.values.logoVariantMode ??= 'auto';
		}
		for (const image of migratedState.backgroundImages ?? []) {
			if (image.logoOverride) {
				image.logoOverride.logoVariantMode ??= 'auto';
			}
		}
	}
	if (fromVersion < 114) {
		migratedState.showAutoZoomDebug ??= false;
	}
	if (fromVersion < 115) {
		migratedState.sceneServiceBaseUrl ??= '';
	}
	if (fromVersion < 122) {
		migratedState.sceneServiceModel ??= '';
	}
	if (fromVersion < 117) {
		// Manual framing is opt-in: existing projects keep the coverage math.
		migratedState.imageFramingManualEnabled ??= false;
	}
	if (fromVersion < 118) {
		// The export profile used to be component state, so nothing was
		// stored; the historical defaults become the persisted ones.
		migratedState.offlineExportResolutionId ??= '1080p';
		migratedState.offlineExportFps ??= 30;
	}
	if (fromVersion < 119) {
		// The single Looks stack becomes the first effect layer. Its values are
		// still the legacy `filter*` keys — the entry is the snapshot — so the
		// editor opens exactly as the user left it, with an "add layer" button
		// it did not have before.
		migratedState.activeEffectLayerId ??= DEFAULT_EFFECT_LAYER_ID;
		migratedState.effectLayers ??= [
			createDefaultEffectLayer(
				extractFilterLookSettingsFromState(migratedState),
				migratedState.filterTargets ?? [],
				migratedState.activeFilterLookId ?? null
			)
		];
	}
	if (fromVersion < 120) {
		// Looks slots and per-image Looks overrides used to hold only the flat
		// `filter*` keys, which meant they restored the layer being edited
		// instead of the composition. Rewriting them as a one-layer stack makes
		// what is on disk say what it always meant, so the apply paths no longer
		// have to guess which shape they are reading.
		const looksDefaults = extractLooksProfileSettings(DEFAULT_STATE);
		migratedState.looksProfileSlots = (
			migratedState.looksProfileSlots ?? []
		).map(slot =>
			slot?.values
				? {
						...slot,
						values: hydrateLooksProfileValues(
							slot.values,
							looksDefaults
						)
					}
				: slot
		);
		migratedState.backgroundImages = (
			migratedState.backgroundImages ?? []
		).map(image =>
			image?.looksOverride
				? {
						...image,
						looksOverride: hydrateLooksProfileValues(
							image.looksOverride,
							looksDefaults
						)
					}
				: image
		);
	}

	if (fromVersion < 121) {
		// The global composition mode starts off: an existing project must keep
		// applying its per-image compositions exactly as it did yesterday.
		migratedState.globalCompositionOverride = false;
		migratedState.backgroundImages = (
			migratedState.backgroundImages ?? []
		).map(image =>
			image ? { ...image, ignoreGlobalOverride: false } : image
		);
	}

	if (fromVersion < 123) {
		// `end` is a behaviour change, not just a new key: a manual timestamp
		// now marks where the incoming image is fully ON, which is what the
		// marking gesture always meant. `start` stays available in the UI.
		migratedState.slideshowTransitionAnchor = 'end';
	}

	if (fromVersion < 124) {
		// The single Camera Motion movement becomes the first motion layer. Its
		// values are still the flat `cameraMotion*` keys — the entry is the
		// snapshot — so the editor opens exactly as the user left it, with an
		// "add layer" button it did not have before.
		migratedState.activeMotionLayerId ??= DEFAULT_MOTION_LAYER_ID;
		migratedState.motionLayers ??= [
			createDefaultMotionLayer(
				extractMotionLayerSettingsFromState(migratedState),
				migratedState.cameraMotionTargets ?? ['background']
			)
		];
	}

	if (fromVersion < 125) {
		// Audio → amplitude is new and opt-in: 0 keeps every existing movement
		// exactly as loud as it was, reacting only in speed. The layers written
		// by the v124 migration need the key too, or the slider reads undefined.
		migratedState.cameraMotionAmplitudeAudio ??= 0;
		migratedState.motionLayers = (migratedState.motionLayers ?? []).map(
			layer => ({
				...layer,
				settings: {
					...layer.settings,
					cameraMotionAmplitudeAudio:
						layer.settings?.cameraMotionAmplitudeAudio ?? 0
				}
			})
		);
	}

	if (fromVersion < 126) {
		// Three new per-image overrides. Image normalization above already
		// fills them for every persisted load; spelling it out here keeps the
		// "new persisted key => visible migration" contract readable and is a
		// no-op on a save that came through that path.
		migratedState.backgroundImages = (
			migratedState.backgroundImages ?? []
		).map(image => ({
			...image,
			cameraFxOverride: image.cameraFxOverride ?? null,
			lightsOverride: image.lightsOverride ?? null,
			trackTitleOverride: image.trackTitleOverride ?? null
		}));
	}

	return normalizeSpectrumSettings(migratedState) as WallpaperStore;
}

/**
 * Copy the live `rgbShiftAudio*` values into every stored Looks snapshot that
 * predates them: the user's saved slots and the legacy single custom look.
 * Existing keys are never overwritten, so running this twice is a no-op.
 */
function backfillLooksRgbShiftAudio(migratedState: WallpaperStore): void {
	const live = extractRgbShiftAudioSettings(migratedState);
	const fill = (target: Record<string, unknown> | null | undefined) => {
		if (!target) return;
		for (const key of RGB_SHIFT_AUDIO_KEYS) {
			if (!(key in target)) target[key] = live[key];
		}
	};
	for (const slot of migratedState.looksProfileSlots ?? []) {
		fill(slot.values as unknown as Record<string, unknown> | null);
	}
	fill(
		migratedState.customFilterLookSettings as unknown as Record<
			string,
			unknown
		> | null
	);
}

/**
 * Fold the old single Custom look into the normal stable-id slot bank and
 * remove selection metadata from snapshots. The legacy field remains in the
 * schema so projects exported before v110 can still be imported.
 */
function migrateLegacyCustomLook(migratedState: WallpaperStore): void {
	for (const slot of migratedState.looksProfileSlots ?? []) {
		if (!slot.values) continue;
		delete (slot.values as unknown as Record<string, unknown>)
			.activeFilterLookId;
	}

	const legacy = migratedState.customFilterLookSettings;
	if (!legacy) return;
	const values = {
		...extractLooksProfileSettings(DEFAULT_STATE),
		...legacy
	};
	const slots = migratedState.looksProfileSlots;
	// Prefer an empty slot, then a new one. A full bank used to drop the look
	// silently; now it stays in the legacy field (still persisted and
	// exported) instead of being thrown away.
	const emptySlot = slots.find(slot => !slot.values);
	let target: (typeof slots)[number] | null = null;
	if (emptySlot) {
		emptySlot.name = 'Custom Look';
		emptySlot.values = values;
		target = emptySlot;
	} else if (slots.length < MAX_LOOKS_SLOT_COUNT) {
		target = { id: createProfileSlotId(), name: 'Custom Look', values };
		slots.push(target);
	}
	if (migratedState.activeFilterLookId === CUSTOM_FILTER_LOOK_ID) {
		migratedState.activeFilterLookId = target
			? toFilterLookSlotSelectionId(target.id)
			: null;
	}
	if (target) migratedState.customFilterLookSettings = null;
}

type LegacyMotionSlot = {
	name?: unknown;
	values?: Record<string, unknown> | null;
};

function pickLegacyKeys<T>(
	source: Record<string, unknown>,
	keys: ReadonlyArray<string>
): Partial<T> {
	const out: Record<string, unknown> = {};
	for (const key of keys) {
		if (key in source) out[key] = source[key];
	}
	return out as Partial<T>;
}

function convertLegacyMotionSlots(
	state: Partial<WallpaperStore>,
	migratedState: {
		particlesProfileSlots: ProfileSlot<ParticlesProfileSettings>[];
		rainProfileSlots: ProfileSlot<RainProfileSettings>[];
	}
): void {
	const legacySlots = (state as { motionProfileSlots?: LegacyMotionSlot[] })
		.motionProfileSlots;
	if (!Array.isArray(legacySlots)) return;
	for (const slot of legacySlots) {
		const values = slot?.values;
		if (!values || typeof values !== 'object') continue;
		const name =
			typeof slot.name === 'string' && slot.name.trim()
				? slot.name
				: 'Motion (legacy)';
		const particlesValues = pickLegacyKeys<ParticlesProfileSettings>(
			values,
			PARTICLES_PROFILE_KEYS
		);
		if (
			Object.keys(particlesValues).length > 0 &&
			migratedState.particlesProfileSlots.length <
				MAX_PARTICLES_SLOT_COUNT
		) {
			migratedState.particlesProfileSlots.push({
				id: createProfileSlotId(),
				name,
				values: particlesValues as ParticlesProfileSettings
			});
		}
		const rainValues = pickLegacyKeys<RainProfileSettings>(
			values,
			RAIN_PROFILE_KEYS
		);
		if (
			Object.keys(rainValues).length > 0 &&
			migratedState.rainProfileSlots.length < MAX_RAIN_SLOT_COUNT
		) {
			migratedState.rainProfileSlots.push({
				id: createProfileSlotId(),
				name,
				values: rainValues as RainProfileSettings
			});
		}
	}
}

function convertLegacySecondSpectrumOverrides(
	state: Partial<WallpaperStore>,
	migratedState: {
		spectrumSecondProfileSlots: WallpaperStore['spectrumSecondProfileSlots'];
	}
): void {
	const legacyImages = state.backgroundImages as
		| Array<{
				name?: unknown;
				spectrumSecondOverride?: Record<string, unknown> | null;
		  }>
		| undefined;
	if (!Array.isArray(legacyImages)) return;
	const slots = migratedState.spectrumSecondProfileSlots;
	for (const image of legacyImages) {
		const override = image?.spectrumSecondOverride;
		if (!override || typeof override !== 'object') continue;
		if (slots.length >= MAX_SPECTRUM_SLOT_COUNT) break;
		const imageName =
			typeof image.name === 'string' && image.name.trim()
				? image.name
				: 'image';
		slots.push({
			id: createProfileSlotId(),
			name: `S2 · ${imageName}`,
			values: hydrateSpectrumProfileValues(
				override
			) as (typeof slots)[number]['values']
		});
	}
}
