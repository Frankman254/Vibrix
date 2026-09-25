import { Globe, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { UI_COLORS, ICON_SIZE } from '@/ui';
import { useT } from '@/lib/i18n';

/**
 * The chip that says the global composition mode is on.
 *
 * It has no "hide me" toggle on purpose: a global mode that silently ignores
 * everything the user saved per image is a trap unless it is visible while it
 * is on. One click turns it off.
 */
export default function GlobalCompositionHud() {
	const t = useT();
	const { globalCompositionOverride, setGlobalCompositionOverride } =
		useWallpaperStore(
			useShallow(s => ({
				globalCompositionOverride: s.globalCompositionOverride,
				setGlobalCompositionOverride: s.setGlobalCompositionOverride
			}))
		);
	if (!globalCompositionOverride) return null;

	const accent = 'rgba(251, 191, 36, 0.62)';

	return (
		<div
			className="rounded-md px-2 py-1.5"
			style={{
				border: `1px solid ${accent}`,
				background: 'rgba(0,0,0,0.34)',
				color: UI_COLORS.fg,
				backdropFilter: 'blur(8px)',
				fontFamily: 'var(--editor-font-mono, ui-monospace, monospace)',
				fontSize: 10,
				letterSpacing: '0.08em'
			}}
		>
			<div
				className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-widest"
				style={{ color: accent }}
			>
				<Globe size={ICON_SIZE.xs} aria-hidden />
				<span>{t.global_composition_hud_title}</span>
			</div>
			<div
				className="flex items-center justify-between gap-2"
				style={{ color: UI_COLORS.fgMute }}
			>
				<span>{t.global_composition_hud_note}</span>
				<button
					type="button"
					onClick={() => setGlobalCompositionOverride(false)}
					className="pointer-events-auto inline-flex h-5 w-5 items-center justify-center rounded-full transition"
					style={{
						border: `1px solid ${UI_COLORS.border}`,
						background: 'rgba(0,0,0,0.25)',
						color: UI_COLORS.fgMute
					}}
					title={t.global_composition_hud_exit}
				>
					<X size={10} strokeWidth={2.5} aria-hidden />
				</button>
			</div>
		</div>
	);
}
