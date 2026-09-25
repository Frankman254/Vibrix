import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '@/store/defaultState';
import type { WallpaperState } from '@/types/wallpaper';
import {
	resolveSubsystemDrawOrder,
	resolveTransitionAlpha
} from './frameComposition';

function state(patch: Partial<WallpaperState> = {}): WallpaperState {
	return { ...DEFAULT_STATE, ...patch } as WallpaperState;
}

describe('resolveSubsystemDrawOrder', () => {
	it('stacks the default layers like the live viewport', () => {
		const order = resolveSubsystemDrawOrder(state());
		const at = (id: string) => order.indexOf(id as never);
		expect(order[0]).toBe('globalBackground');
		expect(at('background')).toBeLessThan(at('stageLights'));
		expect(at('stageLights')).toBeLessThan(at('particles'));
		expect(at('particles')).toBeLessThan(at('rain'));
		expect(at('rain')).toBeLessThan(at('particlesForeground'));
		expect(at('particlesForeground')).toBeLessThan(at('spectrum'));
		expect(at('lyrics')).toBeLessThan(at('flashLight'));
		expect(order[order.length - 1]).toBe('hud');
	});

	it('keeps the two spectrum canvases together, instances above', () => {
		const order = resolveSubsystemDrawOrder(state());
		expect(order.indexOf('spectrum2')).toBe(order.indexOf('spectrum') + 1);
		expect(order.indexOf('spectrum2')).toBeLessThan(order.indexOf('logo'));
	});

	it('follows a z-index override', () => {
		const order = resolveSubsystemDrawOrder(
			state({
				layerZIndices: {
					...DEFAULT_STATE.layerZIndices,
					rain: 95
				}
			})
		);
		expect(order.indexOf('rain')).toBeGreaterThan(
			order.indexOf('flashLight')
		);
	});
});

describe('resolveTransitionAlpha', () => {
	const fading = state({
		visualTransition: {
			startedAtMs: 1000,
			durationMs: 500,
			subsystems: ['spectrum', 'particles']
		} as WallpaperState['visualTransition']
	});

	it('fades only the subsystems the transition names', () => {
		expect(resolveTransitionAlpha(fading, 'spectrum', 1000)).toBe(0);
		expect(
			resolveTransitionAlpha(fading, 'particlesForeground', 1250)
		).toBe(0.5);
		// Both spectrum canvases fade with the one `spectrum` subsystem.
		expect(resolveTransitionAlpha(fading, 'spectrum2', 1000)).toBe(0);
		expect(resolveTransitionAlpha(fading, 'rain', 1000)).toBe(1);
		expect(resolveTransitionAlpha(fading, 'lyrics', 1000)).toBe(1);
	});

	it('is settled after the duration and without a transition', () => {
		expect(resolveTransitionAlpha(fading, 'spectrum', 1500)).toBe(1);
		expect(resolveTransitionAlpha(state(), 'spectrum', 0)).toBe(1);
	});
});
