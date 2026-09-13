import { afterEach, describe, expect, it } from 'vitest';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { getRenderNowMs, pinRenderClock } from '@/lib/visual/renderClock';
import { getRenderStateSnapshot } from './getRenderStateSnapshot';

describe('export render state', () => {
	const initial = useWallpaperStore.getState();

	afterEach(() => {
		useWallpaperStore.setState(initial, true);
		pinRenderClock(null);
	});

	it('renders at full quality whatever the live preview is tuned to', () => {
		useWallpaperStore.setState({
			performanceMode: 'low',
			motionPaused: true,
			sleepModeActive: true,
			calibrationSyntheticGroups: { logo: true, bgZoom: true }
		});
		const { state } = getRenderStateSnapshot();
		expect(state.performanceMode).toBe('high');
		expect(state.motionPaused).toBe(false);
		expect(state.sleepModeActive).toBe(false);
		expect(state.calibrationSyntheticGroups).toEqual({});
		// The editor keeps its own setting.
		expect(useWallpaperStore.getState().performanceMode).toBe('low');
	});

	it('pins the render clock to the frame and releases it', () => {
		pinRenderClock(12_345);
		expect(getRenderNowMs()).toBe(12_345);
		pinRenderClock(null);
		expect(getRenderNowMs()).not.toBe(12_345);
	});
});
