import { useState, useSyncExternalStore } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import {
	clearPersistenceFailure,
	getPersistenceFailureSnapshot,
	subscribePersistenceFailure
} from '@/store/persistenceStatus';
import {
	isPersistenceSuspended,
	retryPersistedState
} from '@/store/persistedStateStorage';
import { BLUR, FONT, GLOW, UI_COLORS, Z_INDEX } from '@/ui';

export default function StoragePersistenceNotice() {
	const t = useT();
	const failure = useSyncExternalStore(
		subscribePersistenceFailure,
		getPersistenceFailureSnapshot,
		getPersistenceFailureSnapshot
	);
	// 'idle' until the user asks; the outcome then stays on screen, because a
	// retry that silently did nothing visible is indistinguishable from a
	// button that does not work.
	const [retry, setRetry] = useState<'idle' | 'running' | 'ok' | 'failed'>(
		'idle'
	);
	if (!failure) return null;

	async function onRetry() {
		setRetry('running');
		await retryPersistedState();
		// The writer reopens its breaker on success and closes it again on
		// another failure, so asking it is the honest test of whether the
		// write actually landed.
		setRetry(isPersistenceSuspended() ? 'failed' : 'ok');
	}

	const detail =
		failure.kind === 'quota'
			? t.storage_persistence_quota_detail
			: t.storage_persistence_unavailable_detail;

	return (
		<div
			role="alert"
			aria-live="assertive"
			style={{
				position: 'fixed',
				left: '50%',
				bottom: 24,
				transform: 'translateX(-50%)',
				zIndex: Z_INDEX.toast,
				display: 'flex',
				alignItems: 'flex-start',
				gap: 12,
				width: 'min(560px, calc(100vw - 32px))',
				padding: '14px 16px',
				border: `1px solid ${UI_COLORS.dangerBorder}`,
				borderRadius: 'var(--editor-radius-lg, 16px)',
				background: UI_COLORS.shell,
				backdropFilter: BLUR.heavy,
				WebkitBackdropFilter: BLUR.heavy,
				boxShadow: GLOW.popover,
				color: UI_COLORS.fg,
				fontFamily: FONT.ui
			}}
		>
			<AlertTriangle
				aria-hidden="true"
				size={22}
				style={{
					color: UI_COLORS.danger,
					flex: '0 0 auto',
					marginTop: 1
				}}
			/>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ fontWeight: 800, fontSize: 14 }}>
					{t.storage_persistence_title}
				</div>
				<div
					style={{
						marginTop: 4,
						fontSize: 12,
						lineHeight: 1.45,
						color: UI_COLORS.fgMute
					}}
				>
					{detail} {t.storage_persistence_export_hint}
					{retry === 'idle' ? ` ${t.storage_persistence_paused}` : ''}
				</div>
				{/* The project is intact in memory; this is the one action
				    that can put it back on disk without losing anything. */}
				<div
					style={{
						marginTop: 8,
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						flexWrap: 'wrap'
					}}
				>
					<button
						type="button"
						disabled={retry === 'running'}
						onClick={() => void onRetry()}
						style={{
							padding: '5px 10px',
							border: `1px solid ${UI_COLORS.accentBorder}`,
							borderRadius: 8,
							background: UI_COLORS.panel,
							color: UI_COLORS.fg,
							fontSize: 12,
							fontWeight: 700,
							cursor: retry === 'running' ? 'default' : 'pointer',
							opacity: retry === 'running' ? 0.6 : 1
						}}
					>
						{retry === 'running'
							? t.storage_persistence_retrying
							: t.storage_persistence_retry}
					</button>
					{retry === 'ok' || retry === 'failed' ? (
						<span
							style={{
								fontSize: 12,
								color:
									retry === 'ok'
										? UI_COLORS.accent
										: UI_COLORS.danger
							}}
						>
							{retry === 'ok'
								? t.storage_persistence_retry_ok
								: t.storage_persistence_retry_failed}
						</span>
					) : null}
				</div>
			</div>
			<button
				type="button"
				aria-label={t.storage_persistence_dismiss}
				onClick={() => clearPersistenceFailure(failure.id)}
				style={{
					display: 'grid',
					placeItems: 'center',
					width: 30,
					height: 30,
					padding: 0,
					border: `1px solid ${UI_COLORS.border}`,
					borderRadius: 9,
					background: UI_COLORS.panel,
					color: UI_COLORS.fg,
					cursor: 'pointer'
				}}
			>
				<X aria-hidden="true" size={16} />
			</button>
		</div>
	);
}
