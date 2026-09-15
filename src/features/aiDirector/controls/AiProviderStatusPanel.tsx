import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, PlugZap, XCircle } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { probeSceneIntentService } from '../index';
import type { SceneIntentServiceStatus } from '../index';
import { Button, SectionCard, UI_COLORS, FONT, ICON_SIZE } from '@/ui';

/**
 * Scene-intent provider status (Settings-adjacent surface: Diagnostics tab).
 *
 * The provider choice lives in the server's environment (`LWAG_AI_PROVIDER`,
 * `ANTHROPIC_API_KEY`, `OLLAMA_MODEL` — see backend/server/.env.example); the
 * browser must never know a key exists. This panel is the read-back side of
 * that abstraction: it asks `/api/health` which provider the server selected
 * and whether its runtime answers, so "which model is this deployment using,
 * and is it up?" is visible in-app instead of only via curl.
 */
export default function AiProviderStatusPanel() {
	const t = useT();
	const [status, setStatus] = useState<SceneIntentServiceStatus | null>(null);
	const [testing, setTesting] = useState(false);

	const runTest = useCallback(async () => {
		setTesting(true);
		try {
			setStatus(await probeSceneIntentService());
		} finally {
			setTesting(false);
		}
	}, []);

	// Probe once on mount so the state is visible without a click.
	useEffect(() => {
		void runTest();
	}, [runTest]);

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
				{!ok ? (
					<p
						className="text-[10px] leading-relaxed"
						style={{ color: UI_COLORS.fgMute }}
					>
						{t.ai_provider_hint_fallback}
					</p>
				) : null}
			</div>
		</SectionCard>
	);
}
