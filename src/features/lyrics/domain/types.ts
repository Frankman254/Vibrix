import type { ColorSourceMode } from '@/types/wallpaper';
import type { LyrixaLyricsBundleEnvelope } from './lyrixaBundleTypes';

export type AudioLyricsSourceMode = 'auto' | 'lrc' | 'plain';
export type LyrixaRenderMode = 'bundle' | 'editor';

/**
 * Color modes a lyric layer can paint its text / border / halo with. A subset
 * of `SpectrumColorMode` — the ones that make sense on a text run — reusing
 * Spectrum's rainbow palette and rotation clock so both subsystems stay
 * visually consistent. `visible-rotate` is the animated one.
 */
export type LyricsLayerColorMode =
	| 'solid'
	| 'gradient'
	| 'rainbow'
	| 'visible-rotate'
	/** Rainbow + black + white, cycled over time. */
	| 'complete-rotate';

export interface LyrixaLayerOverride {
	visible?: boolean;
	positionOffsetX?: number;
	positionOffsetY?: number;
	scale?: number;
	opacity?: number;
	glowIntensity?: number;
	blurAmount?: number;
	// ── Fill (Active Line) ────────────────────────────────────────────────
	textColor?: string;
	/** Absent (legacy configs) behaves exactly like `'solid'`. */
	textColorMode?: LyricsLayerColorMode;
	/** Second gradient stop; ignored unless `textColorMode === 'gradient'`. */
	textColorSecondary?: string;
	/** Absent behaves like `'manual'`, the historical behaviour. */
	textColorSource?: ColorSourceMode;
	// ── Stroke (border) ───────────────────────────────────────────────────
	strokeColor?: string;
	strokeColorMode?: LyricsLayerColorMode;
	strokeColorSecondary?: string;
	strokeColorSource?: ColorSourceMode;
	/** Per-layer width; falls back to the global lyrics stroke width. */
	strokeWidth?: number;
	// ── Glow ──────────────────────────────────────────────────────────────
	glowColor?: string;
	glowColorMode?: LyricsLayerColorMode;
	/** Second gradient stop; ignored unless `glowColorMode === 'gradient'`. */
	glowColorSecondary?: string;
	glowColorSource?: ColorSourceMode;
}

export type LyrixaLayerOverrideMap = Record<string, LyrixaLayerOverride>;

/**
 * Lightweight identity kept with the lyrics, independently from the audio
 * bytes. A project can therefore omit a multi-gigabyte song and still retain
 * which song owns the bundle; adding that file again can reconnect it.
 */
export interface LyricsTrackReference {
	name: string;
	fileKey?: string;
	durationMs?: number;
}

export interface AudioLyricsTrackEntry {
	mode: AudioLyricsSourceMode;
	rawText: string;
	targetTrack?: LyricsTrackReference;
	lyrixaBundle?: LyrixaLyricsBundleEnvelope | null;
	lyrixaRenderMode?: LyrixaRenderMode;
	lyrixaLayerOverrides?: LyrixaLayerOverrideMap;
}

export interface ParsedLyricsLine {
	text: string;
	startTime: number;
	endTime: number;
}

export interface ParsedLyricsDocument {
	mode: Exclude<AudioLyricsSourceMode, 'auto'>;
	hasTimestamps: boolean;
	metadata: Record<string, string>;
	lines: ParsedLyricsLine[];
}
