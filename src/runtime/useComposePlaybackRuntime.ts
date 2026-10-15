import { useEffect } from 'react';
import {
	compositionActivationKeyAt,
	resolveVisualStateAt
} from '@/features/composition/resolveVisualStateAt';
import { setComposePlaybackClock } from '@/features/composition/composePlaybackClock';
import { useAudioContext } from '@/context/useAudioContext';
import {
	buildComposeRuntimePatch,
	composeAssetUrlSignature,
	hydrateComposeBaseState
} from '@/store/compositionRuntimeState';
import { useWallpaperStore } from '@/store/wallpaperStore';

/**
 * Drives the live wallpaper from the persisted Compose session.
 *
 * Every frame is resolved from the same frozen base and absolute audio clock;
 * the current store frame is never fed back into the evaluator. Store writes
 * are restricted to visual keys and the persistence layer substitutes the
 * frozen base, so play/seek cannot mutate the saved project.
 */
export function useComposePlaybackRuntime(enabled: boolean): void {
	const { getCurrentTime } = useAudioContext();
	const composeEnabled = useWallpaperStore(state => state.composeEnabled);
	const composeScore = useWallpaperStore(state => state.composeScore);
	const composeBaseState = useWallpaperStore(state => state.composeBaseState);

	useEffect(() => {
		if (
			!enabled ||
			!composeEnabled ||
			!composeScore ||
			!composeBaseState ||
			typeof requestAnimationFrame === 'undefined'
		) {
			return undefined;
		}

		let frameId = 0;
		let assetSignature = '';
		let activationKey = '';
		let hydratedBase = composeBaseState;
		let previousTimeMs: number | null = null;
		let previousWallMs: number | null = null;

		const render = () => {
			const current = useWallpaperStore.getState();
			if (
				!current.composeEnabled ||
				current.composeScore !== composeScore ||
				current.composeBaseState !== composeBaseState
			) {
				return;
			}

			const nextAssetSignature = composeAssetUrlSignature(current);
			const assetsChanged = nextAssetSignature !== assetSignature;
			if (assetsChanged) {
				hydratedBase = hydrateComposeBaseState(
					composeBaseState,
					current
				);
			}

			const seconds = getCurrentTime();
			const timeMs = Number.isFinite(seconds)
				? Math.max(0, seconds * 1000)
				: 0;
			const wallMs = performance.now();
			const clockDiscontinuity =
				previousTimeMs !== null &&
				previousWallMs !== null &&
				Math.abs(timeMs - previousTimeMs - (wallMs - previousWallMs)) >
					50;
			previousTimeMs = timeMs;
			previousWallMs = wallMs;
			setComposePlaybackClock(true, timeMs);
			const nextActivationKey = compositionActivationKeyAt(
				composeScore,
				timeMs
			);
			if (
				nextActivationKey === activationKey &&
				!assetsChanged &&
				!clockDiscontinuity
			) {
				frameId = requestAnimationFrame(render);
				return;
			}
			activationKey = nextActivationKey;
			assetSignature = nextAssetSignature;
			const resolved = resolveVisualStateAt(
				hydratedBase,
				composeScore,
				timeMs
			);
			const patch = buildComposeRuntimePatch(current, resolved);
			if (Object.keys(patch).length > 0) {
				useWallpaperStore.setState(patch);
			}
			frameId = requestAnimationFrame(render);
		};

		render();
		return () => {
			cancelAnimationFrame(frameId);
			setComposePlaybackClock(false, 0);
		};
	}, [
		composeBaseState,
		composeEnabled,
		composeScore,
		enabled,
		getCurrentTime
	]);
}
