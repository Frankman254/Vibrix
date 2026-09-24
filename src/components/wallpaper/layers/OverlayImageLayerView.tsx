import { useEffect, useState } from 'react';
import type { OverlayImageLayer } from '@/types/layers';
import ImageLayerCanvas from '@/components/wallpaper/layers/ImageLayerCanvas';
import { useAudioData } from '@/hooks/useAudioData';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { resolveFilterStack } from '@/features/filterLooks/filterStack';

function getBlendMode(
	blendMode: OverlayImageLayer['blendMode']
): React.CSSProperties['mixBlendMode'] {
	if (blendMode === 'screen') return 'screen';
	if (blendMode === 'lighten') return 'lighten';
	if (blendMode === 'multiply') return 'multiply';
	return 'normal';
}

function getCropStyles(
	cropShape: OverlayImageLayer['cropShape']
): Pick<React.CSSProperties, 'clipPath' | 'borderRadius'> {
	if (cropShape === 'circle') {
		return { clipPath: 'circle(50% at 50% 50%)' };
	}
	if (cropShape === 'rounded') {
		return { borderRadius: '18px' };
	}
	if (cropShape === 'diamond') {
		return { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' };
	}
	return {};
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function resolveAudioOpacityFactor(
	value: number,
	amount: number,
	invert: boolean
): number {
	const driver = invert ? 1 - clamp01(value) : clamp01(value);
	return clamp01(1 - amount + driver * amount);
}

export default function OverlayImageLayerView({
	layer
}: {
	layer: OverlayImageLayer;
}) {
	const { getAudioSnapshot } = useAudioData();
	const [audioOpacityFactor, setAudioOpacityFactor] = useState(1);
	const state = useWallpaperStore();
	// The effect layer that paints overlays is not necessarily the one the
	// Looks tab is editing, so the values come from the resolver, never from
	// the state's own `filter*` keys.
	const stack = resolveFilterStack(state, 'selected-overlay');
	const look = state.selectedOverlayId === layer.id ? stack : null;
	const advancedEffectsActive =
		look !== null &&
		(look.rgbShift > 0.0001 ||
			(look.scanlinesEnabled && look.scanlineIntensity > 0.001) ||
			look.noiseIntensity > 0.001);
	const blurPx = Math.max(0, layer.edgeBlur);
	const glowPx = 8 + layer.edgeGlow * 26;
	const fadePercent = Math.max(48, 100 - layer.edgeFade * 120);
	const cropStyles = getCropStyles(layer.cropShape);

	useEffect(() => {
		if (!layer.audioOpacityReactive) {
			setAudioOpacityFactor(1);
			return undefined;
		}

		let frame = 0;
		const tick = () => {
			const snapshot = getAudioSnapshot();
			const channel =
				layer.audioOpacityChannel === 'auto'
					? snapshot.amplitude
					: (snapshot.channels[layer.audioOpacityChannel] ??
						snapshot.amplitude);
			setAudioOpacityFactor(
				resolveAudioOpacityFactor(
					channel,
					layer.audioOpacityAmount,
					layer.audioOpacityInvert
				)
			);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [
		getAudioSnapshot,
		layer.audioOpacityAmount,
		layer.audioOpacityChannel,
		layer.audioOpacityInvert,
		layer.audioOpacityReactive
	]);

	if (!layer.enabled || !layer.imageUrl) return null;

	return (
		<>
			<div
				data-camera-motion-layer="selected-overlay"
				style={{
					position: 'fixed',
					inset: 0,
					pointerEvents: 'none',
					zIndex: layer.zIndex,
					mixBlendMode: getBlendMode(layer.blendMode)
				}}
			>
				<img
					src={layer.imageUrl}
					alt=""
					draggable={false}
					style={{
						position: 'absolute',
						left: `calc(50% + ${layer.positionX * 100}vw)`,
						top: `calc(50% - ${layer.positionY * 100}vh)`,
						width: layer.width * layer.scale,
						height: layer.height * layer.scale,
						transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
						opacity:
							layer.opacity *
							audioOpacityFactor *
							(look ? look.filterOpacity : 1),
						userSelect: 'none',
						pointerEvents: 'none',
						objectFit: 'fill',
						filter: `brightness(${look ? look.filterBrightness : 1}) contrast(${look ? look.filterContrast : 1}) saturate(${look ? look.filterSaturation : 1}) blur(${blurPx + (look ? look.filterBlur : 0)}px) hue-rotate(${look ? look.filterHueRotate : 0}deg) drop-shadow(0 0 ${glowPx}px rgba(255,255,255,${0.18 + layer.edgeGlow * 0.2}))`,
						WebkitMaskImage: `radial-gradient(ellipse at center, rgba(0,0,0,1) ${fadePercent}%, rgba(0,0,0,0) 100%)`,
						maskImage: `radial-gradient(ellipse at center, rgba(0,0,0,1) ${fadePercent}%, rgba(0,0,0,0) 100%)`,
						...cropStyles
					}}
				/>
			</div>
			{advancedEffectsActive && (
				<ImageLayerCanvas layer={layer} renderBaseImage={false} />
			)}
		</>
	);
}
