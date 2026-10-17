import { RotateCcw } from 'lucide-react';
import { Button, Caption, ICON_SIZE } from '@/ui';
import { useT } from '@/lib/i18n';
import { LYRICS_LAYER_RANGES, LYRICS_RANGES } from '@/config/ranges';
import { mergeLyrixaVisualStyle } from '@/features/lyrics/domain/lyrixaBundle';
import type {
	LyrixaLyricsBundleEnvelope,
	LyrixaLyricVisualStyle
} from '@/features/lyrics/domain/lyrixaBundleTypes';
import type {
	LyrixaLayerOverride,
	LyrixaLayerOverrideMap
} from '@/features/lyrics/domain/types';
import {
	resolveLyricsColorMode,
	type LyricsPalettes
} from '@/features/lyrics/domain/lyricsColorModes';
import LyricsColorSlotControls from './LyricsColorSlotControls';
import type { LyricsSlotPreviewRole } from './LyricsColorSlotPreview';
import { seedSecondaryColor } from '@/features/lyrics/domain/lyricsColorModes';
import ToggleControl from '@/editor/ToggleControl';
import SliderControl from '@/editor/SliderControl';
import LabeledSection from '@/editor/LabeledSection';

/**
 * The three independently colorable parts of a lyric layer. `bundleColor`
 * seeds the picker from whatever the imported bundle already carried.
 */
const COLOR_SLOTS: Array<{
	key: 'text' | 'stroke' | 'glow';
	labelKey:
		| 'label_lyrics_active_color'
		| 'lyrics_label_stroke_color'
		| 'label_glow_color';
	role: LyricsSlotPreviewRole;
	fallback: string;
	bundleColor: (style: LyrixaLyricVisualStyle) => string | undefined;
}> = [
	{
		key: 'text',
		labelKey: 'label_lyrics_active_color',
		role: 'fill',
		fallback: '#ffffff',
		bundleColor: (style: LyrixaLyricVisualStyle) => style.textColor
	},
	{
		key: 'stroke',
		// Hex, deliberately: the bundle defaults are rgba() strings, which the
		// native color input cannot display (it showed a raw "rgba(0, 0, …").
		labelKey: 'lyrics_label_stroke_color',
		role: 'stroke',
		fallback: '#000000',
		bundleColor: (style: LyrixaLyricVisualStyle) => style.strokeColor
	},
	{
		key: 'glow',
		labelKey: 'label_glow_color',
		role: 'glow',
		fallback: '#ffffff',
		bundleColor: (style: LyrixaLyricVisualStyle) => style.glowColor
	}
];

/** Mirrors the global lyrics stroke width default. */
const DEFAULT_LAYER_STROKE_WIDTH = 1.6;

type Props = {
	bundle: LyrixaLyricsBundleEnvelope;
	overrides: LyrixaLayerOverrideMap;
	onOverridesChange: (next: LyrixaLayerOverrideMap) => void;
	/** Palettes for the image/theme slot previews; threaded from LyricsTabBody. */
	palettes?: LyricsPalettes;
};

/** Hex the native color input can display; bundle colors may be rgba()/named. */
function toHexOrDefault(color: string | undefined, fallback: string): string {
	if (color && /^#[0-9a-fA-F]{6}$/.test(color.trim())) return color.trim();
	if (color && /^#[0-9a-fA-F]{3}$/.test(color.trim())) {
		const short = color.trim().slice(1);
		return `#${short[0]!}${short[0]!}${short[1]!}${short[1]!}${short[2]!}${short[2]!}`;
	}
	return fallback;
}

/**
 * Per-layer controls for an imported Lyrixa bundle.
 *
 * The override model (`lyrixaLayerOverrides`) was already honoured by BOTH
 * renderers — Editor Native and Lyrixa Look — but nothing in the editor ever
 * wrote to it, so a bundle's layers were effectively frozen wherever Lyrixa
 * placed them. This panel is that missing writer: it is the only way to move a
 * single layer, since the tab's global Position X/Y move every layer at once.
 */
export default function LyricsLayersPanel({
	bundle,
	overrides,
	onOverridesChange,
	palettes
}: Props) {
	const t = useT();
	const layers = [...bundle.project.layers].sort((a, b) => a.order - b.order);

	function patchLayer(layerId: string, patch: Partial<LyrixaLayerOverride>) {
		onOverridesChange({
			...overrides,
			[layerId]: { ...(overrides[layerId] ?? {}), ...patch }
		});
	}

	function resetLayer(layerId: string) {
		const next = { ...overrides };
		delete next[layerId];
		onOverridesChange(next);
	}

	if (layers.length === 0) {
		return <Caption as="p">{t.hint_lyrics_layers_empty}</Caption>;
	}

	return (
		<div className="flex flex-col gap-2.5">
			<Caption as="p">{t.hint_lyrics_layers}</Caption>
			{layers.map((layer, index) => {
				const override = overrides[layer.id] ?? {};
				const bundleStyle = mergeLyrixaVisualStyle(
					bundle.project.styleConfig,
					layer.styleDefaults
				);
				const clipCount = bundle.project.clips.filter(
					clip => clip.layerId === layer.id
				).length;
				const isVisible = override.visible ?? layer.visible !== false;
				const hasOverride = Object.keys(override).length > 0;
				// Which layer holds the translation is not something a
				// user can tell from a name the author is free to change.
				const roleLabel =
					layer.role === 'translation'
						? t.label_lyrics_layer_role_translation
						: layer.role === 'primary'
							? t.label_lyrics_layer_role_primary
							: '';

				return (
					<LabeledSection
						key={layer.id}
						label={`${index + 1}. ${layer.name || t.tab_lyrics}${
							hasOverride ? ' •' : ''
						}`}
						defaultOpen={index === 0}
					>
						<Caption as="p">
							{t.label_lyrics_bundle_clips}: {clipCount}
							{roleLabel ? ` • ${roleLabel}` : ''}
							{layer.language ? ` (${layer.language})` : ''}
						</Caption>
						<ToggleControl
							label={t.label_visible}
							value={isVisible}
							onChange={value =>
								patchLayer(layer.id, { visible: value })
							}
						/>
						<SliderControl
							label={t.label_position_x}
							value={override.positionOffsetX ?? 0}
							{...LYRICS_LAYER_RANGES.positionOffsetX}
							onChange={value =>
								patchLayer(layer.id, { positionOffsetX: value })
							}
							defaultValue={0}
						/>
						<SliderControl
							label={t.label_position_y}
							value={override.positionOffsetY ?? 0}
							{...LYRICS_LAYER_RANGES.positionOffsetY}
							onChange={value =>
								patchLayer(layer.id, { positionOffsetY: value })
							}
							defaultValue={0}
						/>
						<SliderControl
							label={t.label_scale}
							value={override.scale ?? 1}
							{...LYRICS_LAYER_RANGES.scale}
							onChange={value =>
								patchLayer(layer.id, { scale: value })
							}
							defaultValue={1}
						/>
						<SliderControl
							label={t.label_opacity}
							value={override.opacity ?? 1}
							{...LYRICS_LAYER_RANGES.opacity}
							onChange={value =>
								patchLayer(layer.id, { opacity: value })
							}
							defaultValue={1}
						/>
						<SliderControl
							label={t.label_glow_intensity}
							value={override.glowIntensity ?? 1}
							{...LYRICS_LAYER_RANGES.glowIntensity}
							onChange={value =>
								patchLayer(layer.id, { glowIntensity: value })
							}
							defaultValue={1}
						/>
						<SliderControl
							label={t.label_blur}
							value={override.blurAmount ?? 0}
							{...LYRICS_LAYER_RANGES.blurAmount}
							onChange={value =>
								patchLayer(layer.id, { blurAmount: value })
							}
							unit="px"
							defaultValue={0}
						/>
						<SliderControl
							label={t.lyrics_label_stroke_width}
							value={
								override.strokeWidth ??
								DEFAULT_LAYER_STROKE_WIDTH
							}
							{...LYRICS_RANGES.strokeWidth}
							onChange={value =>
								patchLayer(layer.id, { strokeWidth: value })
							}
							unit="px"
							defaultValue={DEFAULT_LAYER_STROKE_WIDTH}
						/>
						{COLOR_SLOTS.map(slot => {
							const colorKey = `${slot.key}Color` as const;
							const modeKey = `${slot.key}ColorMode` as const;
							const secondaryKey =
								`${slot.key}ColorSecondary` as const;
							const sourceKey = `${slot.key}ColorSource` as const;
							const mode = resolveLyricsColorMode(
								override[modeKey]
							);
							const primary = toHexOrDefault(
								override[colorKey] ??
									slot.bundleColor(bundleStyle),
								slot.fallback
							);
							return (
								<LyricsColorSlotControls
									key={slot.key}
									label={t[slot.labelKey]}
									role={slot.role}
									palettes={palettes}
									source={override[sourceKey] ?? 'manual'}
									onSourceChange={value =>
										patchLayer(layer.id, {
											[sourceKey]: value
										})
									}
									mode={mode}
									onModeChange={value =>
										patchLayer(layer.id, {
											[modeKey]: value,
											// Seed the second stop so switching
											// to Gradient shows a real gradient
											// instead of collapsing to solid.
											...(value === 'gradient' &&
											override[secondaryKey] === undefined
												? {
														[secondaryKey]:
															seedSecondaryColor(
																primary
															)
													}
												: {})
										})
									}
									primaryColor={primary}
									onPrimaryColorChange={value =>
										patchLayer(layer.id, {
											[colorKey]: value
										})
									}
									secondaryColor={toHexOrDefault(
										override[secondaryKey],
										seedSecondaryColor(primary)
									)}
									onSecondaryColorChange={value =>
										patchLayer(layer.id, {
											[secondaryKey]: value
										})
									}
								/>
							);
						})}
						<div className="flex justify-end">
							<Button
								type="button"
								size="sm"
								density="compact"
								variant="secondary"
								disabled={!hasOverride}
								onClick={() => resetLayer(layer.id)}
								icon={<RotateCcw size={ICON_SIZE.xs} />}
							>
								{t.label_lyrics_layer_reset}
							</Button>
						</div>
					</LabeledSection>
				);
			})}
		</div>
	);
}
