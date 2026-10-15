import { afterEach, describe, expect, it } from 'vitest';
import { useWallpaperStore } from '@/store/wallpaperStore';
import { getRenderNowMs, pinRenderClock } from '@/lib/visual/renderClock';
import type { VibrixScoreEnvelope } from '@/features/composition/vibrixScore';
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

const envelope: VibrixScoreEnvelope = {
	app: 'Lyrixa',
	exportKind: 'vibrix-score',
	schemaVersion: 2,
	exportedAt: '2026-10-03T00:00:00.000Z',
	projectName: 'Demo',
	sourceTrack: { fileName: 'demo.mp3', durationMs: 240000 },
	renderer: { minimumVersion: '0.7.0-alpha' },
	score: { tracks: [], cues: [] },
	dependencies: []
};

describe('export compose session', () => {
	it('captures the frozen score and base when Compose mode is on', () => {
		useWallpaperStore.setState({
			composeEnabled: true,
			composeScore: envelope,
			composeBaseState: {
				...useWallpaperStore.getState(),
				scanlineIntensity: 0.3
			}
		});
		const snapshot = getRenderStateSnapshot();
		expect(snapshot.composition).not.toBeNull();
		expect(snapshot.composition?.envelope).toBe(envelope);
		// The base is the authored document, at export quality: never the
		// playhead frame the store currently projects.
		expect(snapshot.composition?.base.scanlineIntensity).toBe(0.3);
		expect(snapshot.composition?.base.performanceMode).toBe('high');
		expect(Object.isFrozen(snapshot.composition)).toBe(true);
	});

	it('captures no composition when Compose mode is off', () => {
		useWallpaperStore.setState({
			composeEnabled: false,
			composeScore: envelope,
			composeBaseState: useWallpaperStore.getState()
		});
		expect(getRenderStateSnapshot().composition).toBeNull();
	});

	it('captures no composition when the session is half-torn-down', () => {
		useWallpaperStore.setState({
			composeEnabled: true,
			composeScore: null,
			composeBaseState: null
		});
		expect(getRenderStateSnapshot().composition).toBeNull();
	});
});
