import { describe, expect, it } from 'vitest';
import {
	createVisualTransitionSnapshot,
	detectVisualTransitionSubsystems,
	isVisualTransitionActive,
	transitionSubsystemsForLayerType,
	visualTransitionProgress
} from './visualTransitionCoordinator';
import type { WallpaperState } from '@/types/wallpaper';

describe('visualTransitionCoordinator', () => {
	it('detects the visual subsystems touched by an image or scene patch', () => {
		const subsystems = detectVisualTransitionSubsystems({
			activeSceneSlotId: 'scene-1',
			spectrumMode: 'radial',
			particlesEnabled: true,
			rainIntensity: 0.7,
			filterBrightness: 1.2,
			logoPositionX: 0.25
		} as Partial<WallpaperState>);

		expect(subsystems).toEqual([
			'scene',
			'spectrum',
			'particles',
			'rain',
			'looks',
			'logo'
		]);
	});

	it('creates a transition when the active image changes', () => {
		const transition = createVisualTransitionSnapshot({
			state: { activeImageId: 'img-a', performanceMode: 'high' },
			patch: {},
			toImageId: 'img-b',
			startedAtMs: 1000
		});

		expect(transition).toMatchObject({
			fromImageId: 'img-a',
			toImageId: 'img-b',
			startedAtMs: 1000,
			durationMs: 520,
			easing: 'smoothstep',
			subsystems: []
		});
		expect(transition?.id).toMatch(/^vt-1000-/);
	});

	it('creates a reduced-motion transition without extending animation time', () => {
		const transition = createVisualTransitionSnapshot({
			state: { activeImageId: 'img-a', performanceMode: 'medium' },
			patch: { spectrumMode: 'linear' } as Partial<WallpaperState>,
			toImageId: 'img-a',
			startedAtMs: 1000,
			prefersReducedMotion: true
		});

		expect(transition?.durationMs).toBe(0);
		expect(transition?.subsystems).toEqual(['spectrum']);
		expect(isVisualTransitionActive(transition, 1000)).toBe(false);
	});

	it('smoothsteps progress and ends after its duration', () => {
		const transition = createVisualTransitionSnapshot({
			state: { activeImageId: 'img-a', performanceMode: 'low' },
			patch: { logoEnabled: true },
			toImageId: 'img-a',
			startedAtMs: 1000
		});

		expect(visualTransitionProgress(transition, 1000)).toBe(0);
		expect(visualTransitionProgress(transition, 1110)).toBeCloseTo(0.5, 5);
		expect(visualTransitionProgress(transition, 1220)).toBe(1);
		expect(isVisualTransitionActive(transition, 1219)).toBe(true);
		expect(isVisualTransitionActive(transition, 1220)).toBe(false);
	});

	it('maps layer types to the subsystems that drive their fade envelope', () => {
		// Every drawn layer answers to `looks`: the filter stack is baked into
		// its pixels, so a look change with no image change was a hard cut.
		expect(transitionSubsystemsForLayerType('spectrum')).toEqual([
			'spectrum',
			'looks'
		]);
		expect(transitionSubsystemsForLayerType('logo')).toEqual([
			'logo',
			'looks'
		]);
		expect(transitionSubsystemsForLayerType('rain')).toEqual([
			'rain',
			'looks'
		]);
		expect(transitionSubsystemsForLayerType('particle-background')).toEqual(
			['particles', 'looks']
		);
		expect(transitionSubsystemsForLayerType('particle-foreground')).toEqual(
			['particles', 'looks']
		);
		// The image layers: looks and re-framing by a scene, never the image
		// change itself (the slideshow engine owns that animation).
		expect(transitionSubsystemsForLayerType('background-image')).toEqual([
			'looks',
			'scene'
		]);
		expect(transitionSubsystemsForLayerType('overlay-image')).toEqual([
			'looks',
			'scene'
		]);
		// Layers outside the crossfade pass.
		expect(transitionSubsystemsForLayerType('track-title')).toEqual([]);
		expect(transitionSubsystemsForLayerType('lyrics')).toEqual([]);
		expect(transitionSubsystemsForLayerType('slideshow')).toEqual([]);
	});

	it('does not create a transition for an unrelated state patch', () => {
		const transition = createVisualTransitionSnapshot({
			state: { activeImageId: 'img-a', performanceMode: 'high' },
			patch: { language: 'es' } as Partial<WallpaperState>,
			toImageId: 'img-a',
			startedAtMs: 1000
		});

		expect(transition).toBeNull();
	});
});
