import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { AUDIO_ROUTING_RANGES } from '@/config/ranges';
import { DEFAULT_STATE } from '@/store/defaultState';
import {
	getSpectrumFamilyGpuCostHint,
	resolveSpectrumRenderQuality
} from '@/lib/visual/performanceQuality';
import { useAudioData } from '@/hooks/useAudioData';
import { usePerformanceTelemetry } from '@/hooks/usePerformanceTelemetry';
import { useT } from '@/lib/i18n';
import { useWallpaperStore } from '@/store/wallpaperStore';
import type { WallpaperState } from '@/types/wallpaper';
import {
	Button,
	EditorTabFooter,
	EditorTabHeader,
	EditorTabLayout,
	SectionCard,
	Slider,
	ToggleSwitch,
	UI_COLORS,
	FONT,
	ICON_SIZE
} from '@/ui';
import DiagnosticsAudioPreviews from './DiagnosticsAudioPreviews';
import { AiProviderStatusPanel } from '@/features/aiDirector/ui';

function formatMegabytes(value: number | null): string {
	return value != null ? `${value.toFixed(1)} MB` : 'n/a';
}

function formatDecimal(value: number): string {
	return value.toFixed(2);
}

function formatInteger(value: number): string {
	return Math.round(value).toString();
}

function ToggleRow({
	label,
	hint,
	checked,
	onChange
}: {
	label: string;
	hint?: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<div
			className="flex items-center justify-between gap-3 rounded-[var(--editor-radius-md)] border px-3 py-2"
			style={{
				borderColor: UI_COLORS.border,
				background: UI_COLORS.raised
			}}
		>
			<div className="min-w-0">
				<div
					className="text-[12px] font-medium"
					style={{ color: UI_COLORS.fg }}
				>
					{label}
				</div>
				{hint ? (
					<div
						className="text-[11px] leading-snug"
						style={{ color: UI_COLORS.fgMute }}
					>
						{hint}
					</div>
				) : null}
			</div>
			<ToggleSwitch
				checked={checked}
				onChange={onChange}
				size="sm"
				ariaLabel={label}
			/>
		</div>
	);
}

function DiagnosticsGrid({
	title,
	rows,
	footer
}: {
	title: string;
	rows: Array<[string, string | number | boolean]>;
	footer?: string;
}) {
	return (
		<SectionCard title={title} density="compact">
			<div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
				{rows.map(([label, value]) => (
					<div
						key={label}
						className="rounded-[var(--editor-radius-sm)] border px-2 py-1.5"
						style={{
							borderColor: UI_COLORS.border,
							background: UI_COLORS.raised
						}}
					>
						<div
							className="text-[9px] uppercase tracking-widest"
							style={{
								color: UI_COLORS.fgMute,
								fontFamily: FONT.mono
							}}
						>
							{label}
						</div>
						<div
							className="truncate text-[11px]"
							style={{
								color: UI_COLORS.fg,
								fontFamily: FONT.mono
							}}
						>
							{String(value)}
						</div>
					</div>
				))}
			</div>
			{footer ? (
				<p
					className="mt-2 text-[11px] leading-snug"
					style={{ color: UI_COLORS.fgMute }}
				>
					{footer}
				</p>
			) : null}
		</SectionCard>
	);
}

export default function DiagnosticsTab({ onReset }: { onReset: () => void }) {
	const t = useT();
	const store = useWallpaperStore(
		useShallow(s => ({
			showBackgroundScaleMeter: s.showBackgroundScaleMeter,
			showSpectrumDiagnosticsHud: s.showSpectrumDiagnosticsHud,
			showLogoDiagnosticsHud: s.showLogoDiagnosticsHud,
			diagnosticsHudPositionX: s.diagnosticsHudPositionX,
			diagnosticsHudPositionY: s.diagnosticsHudPositionY,
			setShowBackgroundScaleMeter: s.setShowBackgroundScaleMeter,
			setShowSpectrumDiagnosticsHud: s.setShowSpectrumDiagnosticsHud,
			setShowLogoDiagnosticsHud: s.setShowLogoDiagnosticsHud,
			setDiagnosticsHudPositionX: s.setDiagnosticsHudPositionX,
			setDiagnosticsHudPositionY: s.setDiagnosticsHudPositionY
		}))
	);
	const anyHudVisible =
		store.showBackgroundScaleMeter ||
		store.showSpectrumDiagnosticsHud ||
		store.showLogoDiagnosticsHud;

	return (
		<EditorTabLayout
			header={<EditorTabHeader title={t.tab_diagnostics} />}
			footer={
				<EditorTabFooter title={t.label_reset}>
					<Button
						type="button"
						size="sm"
						density="compact"
						variant="secondary"
						icon={<RotateCcw size={ICON_SIZE.xs} />}
						onClick={onReset}
					>
						{t.reset_tab}
					</Button>
				</EditorTabFooter>
			}
		>
			<SectionCard
				title={t.section_diagnostics_huds}
				subtitle={t.hint_diagnostics_intro}
				density="compact"
			>
				<div className="flex flex-col gap-2">
					<ToggleRow
						label={t.label_bg_scale_meter}
						hint={t.hint_bg_scale_meter}
						checked={store.showBackgroundScaleMeter}
						onChange={store.setShowBackgroundScaleMeter}
					/>
					<ToggleRow
						label={t.label_spectrum_diag_toggle}
						hint={t.hint_spectrum_diag_hud}
						checked={store.showSpectrumDiagnosticsHud}
						onChange={store.setShowSpectrumDiagnosticsHud}
					/>
					<ToggleRow
						label={t.label_logo_diag_toggle}
						hint={t.hint_logo_diag_hud}
						checked={store.showLogoDiagnosticsHud}
						onChange={store.setShowLogoDiagnosticsHud}
					/>
					{anyHudVisible ? (
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							<Slider
								label={t.label_diag_hud_position_x}
								value={store.diagnosticsHudPositionX}
								min={0}
								max={1}
								step={0.01}
								onChange={store.setDiagnosticsHudPositionX}
								variant="compact"
								formatValue={formatDecimal}
							/>
							<Slider
								label={t.label_diag_hud_position_y}
								value={store.diagnosticsHudPositionY}
								min={0}
								max={1}
								step={0.01}
								onChange={store.setDiagnosticsHudPositionY}
								variant="compact"
								formatValue={formatDecimal}
							/>
						</div>
					) : null}
				</div>
			</SectionCard>

			<SectionCard
				title={t.section_diagnostics_previews}
				density="compact"
			>
				<DiagnosticsAudioPreviews />
			</SectionCard>

			<AiProviderStatusPanel />

			<DiagnosticsStateSnapshot />
		</EditorTabLayout>
	);
}

function DiagnosticsStateSnapshot() {
	const t = useT();
	const store = useWallpaperStore.getState() as WallpaperState;
	const setAudioAutoKickThreshold = useWallpaperStore(
		s => s.setAudioAutoKickThreshold
	);
	const setAudioAutoSwitchHoldMs = useWallpaperStore(
		s => s.setAudioAutoSwitchHoldMs
	);
	const { getAudioSnapshot } = useAudioData();
	const [audioValues, setAudioValues] = useState(() => getAudioSnapshot());

	useEffect(() => {
		let raf = 0;
		let alive = true;
		const tick = () => {
			if (!alive) return;
			setAudioValues(getAudioSnapshot());
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
		};
	}, [getAudioSnapshot]);

	const audioRows: Array<[string, string | number | boolean]> = [
		['Capture', store.audioCaptureState],
		['Audio paused', store.audioPaused],
		['Motion paused', store.motionPaused],
		['Amplitude', audioValues.amplitude.toFixed(3)],
		['Peak', audioValues.peak.toFixed(3)],
		['Channel full', audioValues.channels.full.toFixed(3)],
		['Channel kick', audioValues.channels.kick.toFixed(3)],
		['Channel instrumental', audioValues.channels.instrumental.toFixed(3)],
		['Channel bass', audioValues.channels.bass.toFixed(3)],
		['Channel hihat', audioValues.channels.hihat.toFixed(3)],
		['Channel vocal', audioValues.channels.vocal.toFixed(3)],
		['FFT size', store.fftSize]
	];
	const backgroundRows: Array<[string, string | number | boolean]> = [
		['Images loaded', store.backgroundImages.length],
		['Active image', store.activeImageId ?? 'none'],
		['Scene BG enabled', store.backgroundImageEnabled],
		['Global BG enabled', store.globalBackgroundEnabled],
		['BG fit', store.imageFitMode],
		['BG opacity', store.imageOpacity.toFixed(2)],
		['BG reactive', store.imageBassReactive],
		['BG channel', store.imageAudioChannel],
		['BG smoothing', store.imageAudioSmoothing.toFixed(2)],
		['BG opacity reactive', store.imageOpacityReactive],
		['Transition', store.slideshowTransitionType],
		['Transition dur', store.slideshowTransitionDuration.toFixed(2)],
		['Transition intensity', store.slideshowTransitionIntensity.toFixed(2)],
		[
			'Transition audio drive',
			store.slideshowTransitionAudioDrive.toFixed(2)
		]
	];
	const overlayRows: Array<[string, string | number | boolean]> = [
		['Filter targets', store.filterTargets.join(', ') || 'none'],
		['Filter opacity', store.filterOpacity.toFixed(2)],
		['Brightness', store.filterBrightness.toFixed(2)],
		['Contrast', store.filterContrast.toFixed(2)],
		['Saturation', store.filterSaturation.toFixed(2)],
		['Blur', store.filterBlur.toFixed(2)],
		['Hue rotate', store.filterHueRotate.toFixed(1)],
		[
			'Track details',
			store.audioTrackTitleEnabled || store.audioTrackTimeEnabled
		],
		['Particles', store.particlesEnabled],
		['Rain', store.rainEnabled]
	];
	const logoRows: Array<[string, string | number | boolean]> = [
		['Enabled', store.logoEnabled],
		['Channel', store.logoBandMode],
		['Smoothing', store.logoAudioSmoothing.toFixed(2)],
		[
			'Position',
			`${store.logoPositionX.toFixed(2)}, ${store.logoPositionY.toFixed(2)}`
		],
		['Min scale', store.logoMinScale.toFixed(2)],
		['Max scale', store.logoMaxScale.toFixed(2)]
	];
	const spectrumRenderQ = resolveSpectrumRenderQuality(
		store.performanceMode,
		store.spectrumFamily
	);
	const spectrumFamilyCost = getSpectrumFamilyGpuCostHint(
		store.spectrumFamily
	);
	const spectrumRows: Array<[string, string | number | boolean]> = [
		['Enabled', store.spectrumEnabled],
		['Mode', store.spectrumMode],
		['Family', store.spectrumFamily],
		['Render quality tier', spectrumRenderQ],
		['Family GPU hint (static)', spectrumFamilyCost],
		['Channel', store.spectrumBandMode],
		['Audio smoothing', store.spectrumAudioSmoothing.toFixed(2)],
		['Visual smoothing', store.spectrumSmoothing.toFixed(2)],
		[
			'Position',
			`${store.spectrumPositionX.toFixed(2)}, ${store.spectrumPositionY.toFixed(2)}`
		],
		['Bar count', store.spectrumBarCount],
		['Bar width', store.spectrumBarWidth.toFixed(1)]
	];
	const systemRows: Array<[string, string | number | boolean]> = [
		['Performance', store.performanceMode],
		['Theme', store.editorTheme],
		['FPS visible', store.showFps],
		['Anchor panel', store.controlPanelAnchor],
		['Anchor fps', store.fpsOverlayAnchor]
	];
	const performanceTelemetry = usePerformanceTelemetry({
		particlesEnabled: store.particlesEnabled,
		rainEnabled: store.rainEnabled,
		spectrumEnabled: store.spectrumEnabled,
		logoEnabled: store.logoEnabled,
		globalBackgroundEnabled: store.globalBackgroundEnabled,
		backgroundImageEnabled: store.backgroundImageEnabled,
		rgbShiftAudioReactive: store.rgbShiftAudioReactive,
		imageBassReactive: store.imageBassReactive,
		scanlineIntensity: store.scanlineIntensity,
		noiseIntensity: store.noiseIntensity
	});
	const performanceRows: Array<[string, string | number | boolean]> = [
		[
			'RAM (JS heap used)',
			formatMegabytes(performanceTelemetry.jsHeapUsedMb)
		],
		[
			'RAM (heap total)',
			formatMegabytes(performanceTelemetry.jsHeapTotalMb)
		],
		['RAM limit', formatMegabytes(performanceTelemetry.jsHeapLimitMb)],
		[
			'CPU estimate',
			performanceTelemetry.cpuEstimate != null
				? `${performanceTelemetry.cpuEstimate.toFixed(0)}%`
				: 'n/a'
		],
		[
			'GPU estimate',
			performanceTelemetry.gpuEstimate != null
				? `${performanceTelemetry.gpuEstimate.toFixed(0)}%`
				: 'n/a'
		],
		['FPS live', performanceTelemetry.fps.toFixed(1)],
		['Frame time', `${performanceTelemetry.avgFrameMs.toFixed(1)} ms`],
		[
			'Device memory',
			performanceTelemetry.deviceMemoryGb != null
				? `${performanceTelemetry.deviceMemoryGb.toFixed(1)} GB`
				: 'n/a'
		],
		['CPU threads', performanceTelemetry.hardwareConcurrency ?? 'n/a']
	];

	function resetCalibrationDefaults() {
		setAudioAutoKickThreshold(DEFAULT_STATE.audioAutoKickThreshold);
		setAudioAutoSwitchHoldMs(DEFAULT_STATE.audioAutoSwitchHoldMs);
	}

	return (
		<div className="flex flex-col gap-2">
			<SectionCard
				title={t.diag_section_calibration}
				density="compact"
				action={
					<Button
						size="sm"
						density="compact"
						onClick={resetCalibrationDefaults}
						icon={<RotateCcw size={ICON_SIZE.xs} />}
					>
						{t.reset_tab}
					</Button>
				}
			>
				<div className="flex flex-col gap-3">
					<Slider
						label={t.label_auto_kick_threshold}
						hint={t.diag_hint_auto_kick_threshold}
						value={store.audioAutoKickThreshold}
						{...AUDIO_ROUTING_RANGES.autoKickThreshold}
						onChange={setAudioAutoKickThreshold}
						variant="compact"
						formatValue={formatDecimal}
					/>
					<Slider
						label={t.label_auto_switch_hold}
						hint={t.diag_hint_auto_switch_hold}
						value={store.audioAutoSwitchHoldMs}
						{...AUDIO_ROUTING_RANGES.autoSwitchHoldMs}
						onChange={setAudioAutoSwitchHoldMs}
						unit=" ms"
						variant="compact"
						formatValue={formatInteger}
					/>
				</div>
			</SectionCard>
			<DiagnosticsGrid title={t.diag_grid_audio} rows={audioRows} />
			<DiagnosticsGrid
				title={t.diag_grid_performance}
				rows={performanceRows}
				footer={t.diag_grid_performance_footer}
			/>
			<DiagnosticsGrid title={t.diag_grid_bg} rows={backgroundRows} />
			<DiagnosticsGrid title={t.diag_grid_logo} rows={logoRows} />
			<DiagnosticsGrid title={t.diag_grid_spectrum} rows={spectrumRows} />
			<DiagnosticsGrid title={t.diag_grid_overlays} rows={overlayRows} />
			<DiagnosticsGrid title={t.diag_grid_system} rows={systemRows} />
		</div>
	);
}
