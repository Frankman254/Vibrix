import {
	Activity,
	AudioWaveform,
	Circle,
	Clapperboard,
	Download,
	FileText,
	Film,
	Gauge,
	Image as ImageIcon,
	Layers,
	Music2,
	Settings,
	SlidersHorizontal,
	Sparkles,
	Type,
	Wand2,
	Zap,
	type LucideIcon
} from 'lucide-react';
import type { TranslationKey } from '@/lib/i18n/en';

/**
 * Single source of truth for editor navigation identity.
 *
 * The compact ControlPanel (horizontal main tabs + nested Advanced sub-tabs)
 * and the maximized EditorOverlay (sidebar grouped) BOTH read icons, labels,
 * and Simple/Advanced visibility from this registry. Each editor still owns
 * its own layout — but choosing an icon, renaming a label, or flipping a
 * visibility flag is a one-line change here that lands in both editors.
 *
 * Why this exists: the two editors used to ship separate icon maps and
 * separate visibility logic, so e.g. Scene rendered as Layers in the compact
 * editor but Film in the maximized editor, Spectrum as Activity vs
 * AudioWaveform, Looks as Wand2 vs SlidersHorizontal, etc. Same product,
 * two visual identities.
 */
export type EditorNavId =
	| 'scene'
	| 'layers'
	| 'presets'
	| 'overlays'
	| 'spectrum'
	| 'looks'
	| 'motion'
	| 'logo'
	| 'track'
	| 'intro'
	| 'lyrics'
	| 'audio'
	| 'editor'
	| 'calibration'
	| 'diagnostics'
	| 'export'
	| 'perf'
	/** Compact-only container that groups the advanced-sub entries behind a
	 *  single slot on the horizontal main nav. The maximized editor doesn't
	 *  need this — its sidebar shows the Advanced items directly. */
	| 'advanced';

export type EditorNavGroup =
	| 'compose'
	| 'image'
	| 'effects'
	| 'branding'
	| 'audio'
	| 'advanced';

export type EditorNavCompactPlacement = 'main' | 'advanced-sub' | 'none';

export type EditorNavEntry = {
	id: EditorNavId;
	/** i18n key for the visible label. Resolved at render time so language
	 *  switching keeps both editors in sync. */
	labelKey: TranslationKey;
	/** Canonical icon component for this concept. Consumers render it with
	 *  whichever size fits their layout (ICON_SIZE.md for compact main tabs,
	 *  ICON_SIZE.sm for the maximized sidebar, ICON_SIZE.xs for compact
	 *  advanced sub-tabs and the secondary mini-nav). */
	icon: LucideIcon;
	/** Visual grouping in the maximized sidebar. */
	group: EditorNavGroup;
	/** Hidden in Simple UI mode. Applied equally by both editors. */
	advancedOnly?: boolean;
	/** Where the compact ControlPanel surfaces this entry. */
	compactPlacement: EditorNavCompactPlacement;
	/** Whether the maximized EditorOverlay surfaces this entry as a section. */
	showInMaximized: boolean;
};

export const EDITOR_NAV_ENTRIES: ReadonlyArray<EditorNavEntry> = [
	// Compose
	{
		id: 'scene',
		labelKey: 'tab_scene',
		icon: Film,
		group: 'compose',
		compactPlacement: 'main',
		showInMaximized: true
	},
	{
		id: 'layers',
		labelKey: 'tab_layers',
		icon: Layers,
		group: 'compose',
		compactPlacement: 'main',
		showInMaximized: true
	},

	// Image — presets/overlays only surface in the maximized editor; the
	// compact editor reaches BG editing via the Layers tab's sub-views.
	{
		id: 'presets',
		labelKey: 'tab_presets',
		icon: ImageIcon,
		group: 'image',
		compactPlacement: 'none',
		showInMaximized: true
	},
	{
		id: 'overlays',
		labelKey: 'tab_overlays',
		icon: Sparkles,
		group: 'image',
		compactPlacement: 'none',
		showInMaximized: true
	},

	// Effects
	{
		id: 'spectrum',
		labelKey: 'tab_spectrum',
		icon: AudioWaveform,
		group: 'effects',
		compactPlacement: 'main',
		showInMaximized: true
	},
	{
		id: 'looks',
		labelKey: 'tab_looks',
		icon: Wand2,
		group: 'effects',
		compactPlacement: 'main',
		showInMaximized: true
	},
	{
		id: 'motion',
		labelKey: 'tab_motion',
		icon: Zap,
		group: 'effects',
		compactPlacement: 'main',
		showInMaximized: true
	},

	// Branding — the Logo editor now lives inside the Spectrum tab (logo and
	// radial spectrums are configured together), so it has no nav entry.
	{
		id: 'logo',
		labelKey: 'tab_logo',
		icon: Circle,
		group: 'branding',
		compactPlacement: 'none',
		showInMaximized: false
	},
	{
		id: 'track',
		labelKey: 'tab_track',
		icon: Type,
		group: 'branding',
		compactPlacement: 'advanced-sub',
		showInMaximized: true
	},
	{
		id: 'intro',
		labelKey: 'tab_intro',
		icon: Clapperboard,
		group: 'branding',
		compactPlacement: 'advanced-sub',
		showInMaximized: true
	},
	{
		id: 'lyrics',
		labelKey: 'tab_lyrics',
		icon: FileText,
		group: 'branding',
		compactPlacement: 'advanced-sub',
		showInMaximized: true
	},

	// Audio
	{
		id: 'audio',
		labelKey: 'tab_audio',
		icon: Music2,
		group: 'audio',
		compactPlacement: 'main',
		showInMaximized: true
	},

	// Advanced
	{
		id: 'editor',
		labelKey: 'tab_editor',
		icon: SlidersHorizontal,
		group: 'advanced',
		advancedOnly: true,
		compactPlacement: 'advanced-sub',
		showInMaximized: true
	},
	{
		// Calibration only surfaces in the compact editor today. It still
		// belongs in the registry so its icon/label stay consistent if/when
		// the maximized editor adds it.
		id: 'calibration',
		labelKey: 'label_calibration',
		icon: Wand2,
		group: 'advanced',
		advancedOnly: true,
		compactPlacement: 'advanced-sub',
		showInMaximized: false
	},
	{
		id: 'diagnostics',
		labelKey: 'tab_diagnostics',
		icon: Activity,
		group: 'advanced',
		advancedOnly: true,
		compactPlacement: 'advanced-sub',
		showInMaximized: true
	},
	{
		id: 'export',
		labelKey: 'tab_export',
		icon: Download,
		group: 'advanced',
		advancedOnly: true,
		compactPlacement: 'advanced-sub',
		showInMaximized: true
	},
	{
		id: 'perf',
		labelKey: 'tab_perf',
		icon: Gauge,
		group: 'advanced',
		advancedOnly: true,
		compactPlacement: 'advanced-sub',
		showInMaximized: true
	},

	// Compact-only Advanced container.
	{
		id: 'advanced',
		labelKey: 'tab_advanced',
		icon: Settings,
		group: 'advanced',
		compactPlacement: 'main',
		showInMaximized: false
	}
];

const ENTRY_BY_ID = new Map<EditorNavId, EditorNavEntry>(
	EDITOR_NAV_ENTRIES.map(entry => [entry.id, entry])
);

/** i18n key for the maximized-editor sidebar group label. */
export const EDITOR_NAV_GROUP_LABEL_KEY: Record<
	EditorNavGroup,
	TranslationKey
> = {
	compose: 'editor_nav_group_compose',
	image: 'editor_nav_group_image',
	effects: 'editor_nav_group_effects',
	branding: 'editor_nav_group_branding',
	audio: 'editor_nav_group_audio',
	advanced: 'editor_nav_group_advanced'
};

/** Order in which maximized-editor groups are rendered. */
export const EDITOR_NAV_GROUP_ORDER: ReadonlyArray<EditorNavGroup> = [
	'compose',
	'image',
	'effects',
	'branding',
	'audio',
	'advanced'
];

export function getEditorNavEntry(id: EditorNavId): EditorNavEntry | undefined {
	return ENTRY_BY_ID.get(id);
}

/** Entries the compact ControlPanel renders as top-level horizontal tabs. */
export function getCompactMainEntries(): EditorNavEntry[] {
	return EDITOR_NAV_ENTRIES.filter(e => e.compactPlacement === 'main');
}

/** Entries the compact ControlPanel renders under its Advanced container. */
export function getCompactAdvancedSubEntries(): EditorNavEntry[] {
	return EDITOR_NAV_ENTRIES.filter(
		e => e.compactPlacement === 'advanced-sub'
	);
}

export type MaximizedNavGroup = {
	group: EditorNavGroup;
	/** True when every item in the group is advancedOnly — used by the
	 *  maximized editor to drop the whole group in Simple mode. */
	advancedOnly: boolean;
	items: EditorNavEntry[];
};

/** Maximized-editor sidebar groups, in render order, with their items in the
 *  registry's declaration order. */
export function getMaximizedGroups(): MaximizedNavGroup[] {
	const byGroup = new Map<EditorNavGroup, EditorNavEntry[]>();
	for (const entry of EDITOR_NAV_ENTRIES) {
		if (!entry.showInMaximized) continue;
		const arr = byGroup.get(entry.group) ?? [];
		arr.push(entry);
		byGroup.set(entry.group, arr);
	}
	return EDITOR_NAV_GROUP_ORDER.filter(g => byGroup.has(g)).map(g => {
		const items = byGroup.get(g)!;
		const advancedOnly = items.every(item => item.advancedOnly === true);
		return { group: g, advancedOnly, items };
	});
}
