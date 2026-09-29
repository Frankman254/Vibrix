/**
 * FACTORY looks for an intro / ending window.
 *
 * The window has around fifty controls, and «ofrecerle algo rapido al usuario y
 * partiendo de ahi poder seguir editando» is exactly what a factory look is
 * for: one click puts a finished composition on screen, and every control stays
 * editable afterwards — a preset is a patch, never a mode.
 *
 * What a preset NEVER touches, because it belongs to the user and not to a
 * look: `enabled`, the title and tagline TEXT, the hand-picked image list and
 * the image source mode, and the spectrum slot bindings (a look cannot know
 * which figures this project saved). Everything a preset does set is listed in
 * its patch, so what a click is about to change is readable here.
 */
import type { IntroSequenceSettings } from '@/types/wallpaper';

export type IntroPresetId =
	| 'poster'
	| 'cinematic'
	| 'neon'
	| 'strip'
	| 'burst'
	| 'minimal';

export type IntroPreset = {
	id: IntroPresetId;
	/** i18n key of the name shown on the button. */
	labelKey: string;
	/** i18n key of the one-line description. */
	hintKey: string;
	patch: Partial<IntroSequenceSettings>;
};

export const INTRO_PRESETS: readonly IntroPreset[] = [
	{
		id: 'poster',
		labelKey: 'intro_preset_poster',
		hintKey: 'intro_preset_poster_hint',
		patch: {
			durationSec: 8,
			buildSec: 2.5,
			releaseSec: 2.5,
			montage: 'mosaic-grid',
			divisionPattern: 'grid',
			divisionAngleDeg: 0,
			montageArrival: 'reading',
			montageMove: 'zoom-in',
			imageCount: 9,
			imageDim: 0.45,
			backdropColorSource: 'manual',
			backdropFillMode: 'solid',
			backdropColor: '#000000',
			titleEnabled: true,
			titleFontStyle: 'display',
			titleSizePct: 11,
			titleReveal: 'pop',
			titleFrameEnabled: true,
			titleFrameShape: 'rect',
			titleFrameStyle: 'outline',
			titleFrameAnimation: 'draw',
			titleFrameFillMode: 'solid',
			titleFrameThickness: 1,
			taglineEnabled: true,
			taglineFontStyle: 'clean',
			taglineSizePct: 4,
			taglineReveal: 'typewriter',
			spectrumCentered: true
		}
	},
	{
		id: 'cinematic',
		labelKey: 'intro_preset_cinematic',
		hintKey: 'intro_preset_cinematic_hint',
		patch: {
			durationSec: 11,
			buildSec: 3.5,
			releaseSec: 3.5,
			montage: 'fade-stack',
			divisionPattern: 'rows',
			divisionAngleDeg: 0,
			montageArrival: 'together',
			montageMove: 'pan',
			imageCount: 5,
			imageDim: 0.55,
			backdropColorSource: 'manual',
			backdropFillMode: 'solid',
			backdropColor: '#000000',
			titleEnabled: true,
			titleFontStyle: 'serif',
			titleSizePct: 9,
			titleReveal: 'fade',
			titleFrameEnabled: true,
			titleFrameShape: 'underline',
			titleFrameStyle: 'outline',
			titleFrameAnimation: 'sweep',
			titleFrameFillMode: 'solid',
			titleFrameThickness: 0.75,
			taglineEnabled: true,
			taglineFontStyle: 'serif',
			taglineSizePct: 3.4,
			taglineReveal: 'fade',
			spectrumCentered: true
		}
	},
	{
		id: 'neon',
		labelKey: 'intro_preset_neon',
		hintKey: 'intro_preset_neon_hint',
		patch: {
			durationSec: 7,
			buildSec: 2,
			releaseSec: 2,
			montage: 'shutter-wipe',
			divisionPattern: 'diagonal',
			divisionAngleDeg: 18,
			montageArrival: 'edges-in',
			montageMove: 'pulse',
			imageCount: 8,
			imageDim: 0.35,
			backdropColorSource: 'image',
			backdropFillMode: 'gradient',
			titleEnabled: true,
			titleFontStyle: 'techno',
			titleSizePct: 12,
			titleReveal: 'wipe',
			titleFrameEnabled: true,
			titleFrameShape: 'hexagon',
			titleFrameStyle: 'both',
			titleFrameAnimation: 'expand',
			titleFrameColorSource: 'image',
			titleFrameFillMode: 'rainbow',
			titleFrameThickness: 1.5,
			taglineEnabled: true,
			taglineFontStyle: 'mono',
			taglineSizePct: 3.6,
			taglineReveal: 'typewriter',
			spectrumCentered: true
		}
	},
	{
		id: 'strip',
		labelKey: 'intro_preset_strip',
		hintKey: 'intro_preset_strip_hint',
		patch: {
			durationSec: 9,
			buildSec: 2.5,
			releaseSec: 2,
			montage: 'film-strip',
			divisionPattern: 'columns',
			divisionAngleDeg: 0,
			montageArrival: 'reading',
			montageMove: 'still',
			imageCount: 7,
			imageDim: 0.4,
			backdropColorSource: 'manual',
			backdropFillMode: 'gradient',
			backdropColor: '#070310',
			backdropColorSecondary: '#1b0a2a',
			titleEnabled: true,
			titleFontStyle: 'condensed',
			titleSizePct: 10,
			titleReveal: 'rise',
			titleFrameEnabled: true,
			titleFrameShape: 'ribbon',
			titleFrameStyle: 'filled',
			titleFrameAnimation: 'grow',
			titleFrameFillMode: 'gradient',
			titleFrameThickness: 1,
			taglineEnabled: true,
			taglineFontStyle: 'clean',
			taglineSizePct: 3.8,
			taglineReveal: 'wipe',
			spectrumCentered: true
		}
	},
	{
		id: 'burst',
		labelKey: 'intro_preset_burst',
		hintKey: 'intro_preset_burst_hint',
		patch: {
			durationSec: 6,
			buildSec: 1.6,
			releaseSec: 1.6,
			montage: 'mosaic-burst',
			divisionPattern: 'starburst',
			divisionAngleDeg: 0,
			montageArrival: 'centre-out',
			montageMove: 'zoom-out',
			imageCount: 12,
			imageDim: 0.3,
			backdropColorSource: 'image',
			backdropFillMode: 'solid',
			titleEnabled: true,
			titleFontStyle: 'black',
			titleSizePct: 13,
			titleReveal: 'pop',
			titleFrameEnabled: true,
			titleFrameShape: 'diamond',
			titleFrameStyle: 'outline',
			titleFrameAnimation: 'grow',
			titleFrameFillMode: 'solid',
			titleFrameThickness: 1.75,
			taglineEnabled: true,
			taglineFontStyle: 'geometric',
			taglineSizePct: 4,
			taglineReveal: 'pop',
			spectrumCentered: true
		}
	},
	{
		id: 'minimal',
		labelKey: 'intro_preset_minimal',
		hintKey: 'intro_preset_minimal_hint',
		patch: {
			durationSec: 6,
			buildSec: 2,
			releaseSec: 2,
			montage: 'ken-burns',
			divisionPattern: 'grid',
			divisionAngleDeg: 0,
			montageArrival: 'together',
			montageMove: 'zoom-in',
			imageCount: 3,
			imageDim: 0.25,
			backdropColorSource: 'manual',
			backdropFillMode: 'solid',
			backdropColor: '#000000',
			titleEnabled: true,
			titleFontStyle: 'clean',
			titleSizePct: 8,
			titleReveal: 'fade',
			titleFrameEnabled: false,
			taglineEnabled: true,
			taglineFontStyle: 'clean',
			taglineSizePct: 3.2,
			taglineReveal: 'fade',
			spectrumCentered: true
		}
	}
];

/** The preset with this id, or `null` — ids come from persisted UI state. */
export function findIntroPreset(id: string): IntroPreset | null {
	return INTRO_PRESETS.find(preset => preset.id === id) ?? null;
}
