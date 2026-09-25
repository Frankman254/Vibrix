import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Loader2, PlugZap, XCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { useT } from '@/lib/i18n';
import { probeSceneIntentService } from '../index';
import type { SceneIntentServiceStatus } from '../index';
import {
	Button,
	EnumButtonGroup,
	SectionCard,
	Select,
	TextInput,
	UI_COLORS,
	FONT,
	ICON_SIZE
} from '@/ui';

type SetupPlatform = 'mac' | 'windows' | 'dgx';

const PLATFORMS = ['mac', 'windows', 'dgx'] as const;

function detectPlatform(): SetupPlatform {
	return /Windows/i.test(navigator.userAgent) ? 'windows' : 'mac';
}

/**
 * Scene-intent service: configure + status (Diagnostics tab).
 *
 * Two halves of one seam. The *base URL* decides which backend the browser
 * talks to: '' means same-origin (dev proxy / deployed server); a URL points
 * the app at a backend on the user's own machine or tailnet. The *command
 * generator* produces the exact shell line that starts such a backend — with
 * the current app origin baked into `LWAG_ALLOWED_ORIGIN` so CORS matches
 * without the user editing anything. The provider choice itself stays in the
 * server's environment; the browser never learns a key exists. `Test` asks
 * that backend `/api/health` and reports which provider it selected.
 */
export default function AiProviderStatusPanel() {
	const t = useT();
	const store = useWallpaperStore(
		useShallow(s => ({
			sceneServiceBaseUrl: s.sceneServiceBaseUrl,
			setSceneServiceBaseUrl: s.setSceneServiceBaseUrl,
			sceneServiceModel: s.sceneServiceModel,
			setSceneServiceModel: s.setSceneServiceModel
		}))
	);
	const [status, setStatus] = useState<SceneIntentServiceStatus | null>(null);
	const [testing, setTesting] = useState(false);
	const [draftUrl, setDraftUrl] = useState(store.sceneServiceBaseUrl);
	const [platform, setPlatform] = useState<SetupPlatform>(detectPlatform);
	const [dgxUrl, setDgxUrl] = useState('http://100.70.87.17:8888/v1');
	const [dgxModel, setDgxModel] = useState('qwen3.8-flash-next');
	const [copied, setCopied] = useState(false);

	const runTest = useCallback(async () => {
		setTesting(true);
		try {
			setStatus(await probeSceneIntentService(store.sceneServiceBaseUrl));
		} finally {
			setTesting(false);
		}
	}, [store.sceneServiceBaseUrl]);

	// Probe once on mount (and after the base URL changes) so the state is
	// visible without a click.
	useEffect(() => {
		void runTest();
	}, [runTest]);

	// Keep the draft in sync if the store value changes elsewhere.
	useEffect(() => {
		setDraftUrl(store.sceneServiceBaseUrl);
	}, [store.sceneServiceBaseUrl]);

	const saveUrl = () => {
		store.setSceneServiceBaseUrl(draftUrl);
	};

	const origin = window.location.origin;
	const commands: Record<SetupPlatform, string> = useMemo(
		() => ({
			mac: `# 1 · first time only: install + model
brew install ollama   # or download from https://ollama.com
ollama pull qwen3:8b

# 2 · run the scene service (repo root)
cd backend/server && npm install
LWAG_AI_PROVIDER=ollama OLLAMA_MODEL=qwen3:8b \\
LWAG_ALLOWED_ORIGIN="${origin}" \\
node src/index.mjs

# 3 · set Base URL above to http://localhost:8787 and Test`,
			windows: `# 1 · first time only: install + model
winget install Ollama.Ollama
ollama pull qwen3:8b

# 2 · run the scene service (repo root; PowerShell)
cd backend\\server; npm install
$env:LWAG_AI_PROVIDER='ollama'; $env:OLLAMA_MODEL='qwen3:8b'
$env:LWAG_ALLOWED_ORIGIN='${origin}'
node src\\index.mjs

# 3 · set Base URL above to http://localhost:8787 and Test`,
			dgx: `# vLLM (or any OpenAI-compatible server) already serving the
# model on the DGX. Run the backend on this machine; it
# reaches the DGX server-side, so no mixed-content issue.
cd backend/server && npm install
LWAG_AI_PROVIDER=openai OPENAI_BASE_URL="${dgxUrl}" \\
OPENAI_MODEL="${dgxModel}" \\
LWAG_ALLOWED_ORIGIN="${origin}" \\
node src/index.mjs

# then set Base URL above to http://localhost:8787 and Test`
		}),
		[origin, dgxUrl, dgxModel]
	);

	const copyCommand = async () => {
		try {
			await navigator.clipboard.writeText(commands[platform]);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard unavailable (insecure context): user selects manually.
		}
	};

	const ok = status !== null && status.providerReady;
	const label =
		status === null
			? t.ai_provider_testing
			: ok
				? t.ai_provider_ready.replace(
						'{provider}',
						status.provider ?? '?'
					)
				: status.reachable
					? t.ai_provider_not_ready.replace(
							'{reason}',
							status.reason ?? '—'
						)
					: t.ai_provider_unreachable.replace(
							'{reason}',
							status.reason ?? '—'
						);

	return (
		<SectionCard
			title={t.ai_provider_title}
			subtitle={t.ai_provider_subtitle}
			density="compact"
		>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					{testing ? (
						<Loader2
							size={ICON_SIZE.sm}
							className="animate-spin"
							style={{ color: UI_COLORS.fgMute }}
						/>
					) : ok ? (
						<CheckCircle2
							size={ICON_SIZE.sm}
							style={{ color: UI_COLORS.ok }}
						/>
					) : (
						<XCircle
							size={ICON_SIZE.sm}
							style={{ color: UI_COLORS.warn }}
						/>
					)}
					<span
						className="min-w-0 flex-1 text-[11px]"
						style={{
							color: ok ? UI_COLORS.ok : UI_COLORS.fgMute,
							fontFamily: FONT.mono
						}}
					>
						{label}
					</span>
					<Button
						type="button"
						size="sm"
						density="compact"
						variant="secondary"
						onClick={() => void runTest()}
						disabled={testing}
						icon={<PlugZap size={ICON_SIZE.xs} />}
					>
						{t.ai_btn_test_connection}
					</Button>
				</div>

				{/* Which backend the browser talks to */}
				<div className="flex items-center gap-2">
					<TextInput
						size="sm"
						full
						value={draftUrl}
						placeholder="http://localhost:8787"
						onChange={e => setDraftUrl(e.target.value)}
						onKeyDown={e => {
							if (e.key === 'Enter') saveUrl();
						}}
						style={{ fontFamily: FONT.mono, fontSize: 11 }}
					/>
					<Button
						type="button"
						size="sm"
						density="compact"
						variant="secondary"
						onClick={saveUrl}
						disabled={
							draftUrl.trim().replace(/\/+$/, '') ===
							store.sceneServiceBaseUrl
						}
					>
						{t.ai_service_save}
					</Button>
				</div>
				<p
					className="text-[10px] leading-relaxed"
					style={{ color: UI_COLORS.fgMute }}
				>
					{t.ai_service_base_url_hint}
				</p>

				{/* Which model, when the service offers more than one */}
				{status !== null && status.models.length > 1 ? (
					<div className="flex flex-col gap-1">
						<Select
							size="sm"
							density="compact"
							full
							ariaLabel={t.ai_service_model_label}
							value={store.sceneServiceModel}
							onChange={store.setSceneServiceModel}
							options={[
								{
									value: '',
									label: t.ai_service_model_auto.replace(
										'{model}',
										status.activeModel ?? '?'
									)
								},
								...status.models.map(id => ({
									value: id,
									label: id
								}))
							]}
						/>
						<p
							className="text-[10px] leading-relaxed"
							style={{ color: UI_COLORS.fgMute }}
						>
							{t.ai_service_model_hint}
						</p>
					</div>
				) : null}

				{!ok ? (
					<p
						className="text-[10px] leading-relaxed"
						style={{ color: UI_COLORS.fgMute }}
					>
						{t.ai_provider_hint_fallback}
					</p>
				) : null}

				{/* How to start a backend yourself */}
				<div className="flex items-center justify-between gap-2">
					<span
						className="text-[10px] uppercase tracking-wide"
						style={{ color: UI_COLORS.fgMute }}
					>
						{t.ai_service_setup_title}
					</span>
					<EnumButtonGroup
						options={PLATFORMS}
						value={platform}
						onChange={setPlatform}
					/>
				</div>
				<p
					className="text-[10px] leading-relaxed"
					style={{ color: UI_COLORS.fgMute }}
				>
					{platform === 'mac'
						? t.ai_service_req_mac
						: platform === 'windows'
							? t.ai_service_req_windows
							: t.ai_service_req_dgx}
				</p>
				{platform === 'dgx' ? (
					<div className="flex items-center gap-2">
						<TextInput
							size="xs"
							full
							value={dgxUrl}
							onChange={e => setDgxUrl(e.target.value)}
							style={{ fontFamily: FONT.mono, fontSize: 10 }}
						/>
						<TextInput
							size="xs"
							full
							value={dgxModel}
							onChange={e => setDgxModel(e.target.value)}
							style={{ fontFamily: FONT.mono, fontSize: 10 }}
						/>
					</div>
				) : null}
				<pre
					className="max-h-44 overflow-auto rounded p-2 text-[10px] leading-relaxed"
					style={{
						background: UI_COLORS.panel,
						color: UI_COLORS.fg,
						fontFamily: FONT.mono,
						whiteSpace: 'pre'
					}}
				>
					{commands[platform]}
				</pre>
				<div className="flex justify-end">
					<Button
						type="button"
						size="sm"
						density="compact"
						variant="secondary"
						onClick={() => void copyCommand()}
						icon={<Copy size={ICON_SIZE.xs} />}
					>
						{copied ? t.ai_service_copied : t.ai_service_copy}
					</Button>
				</div>
			</div>
		</SectionCard>
	);
}
