import { describe, it, expect } from 'vitest';
import { describeImageComposition } from '@/store/imageCompositionSummary';
import { FACTORY_DEFAULT_STATE } from '@/store/factoryDefaults';
import { createBackgroundImageItem } from '@/features/background/backgroundImages';
import { createEmptySceneSlot } from '@/features/scenes/sceneSlot';
import type { BackgroundImageItem, WallpaperState } from '@/types/wallpaper';

function image(patch: Partial<BackgroundImageItem> = {}): BackgroundImageItem {
	return {
		...createBackgroundImageItem('img-1', 'one.png'),
		...patch
	};
}

function state(patch: Partial<WallpaperState> = {}): WallpaperState {
	return { ...FACTORY_DEFAULT_STATE, ...patch } as WallpaperState;
}

function row(summary: ReturnType<typeof describeImageComposition>, id: string) {
	const found = summary.rows.find(entry => entry.id === id);
	if (!found) throw new Error(`no row for ${id}`);
	return found;
}

describe('describeImageComposition', () => {
	it('says the global controls win when the image carries nothing', () => {
		const summary = describeImageComposition(state(), image());
		expect(summary.sceneName).toBeNull();
		expect(summary.rows.every(entry => entry.source === 'global')).toBe(
			true
		);
		expect(summary.rows.every(entry => !entry.hasOverride)).toBe(true);
	});

	it('reports every subsystem as global-mode while global mode is on', () => {
		const summary = describeImageComposition(
			state({ globalCompositionOverride: true }),
			image({ looksOverride: { filterBrightness: 1.2 } as never })
		);
		expect(summary.globalMode).toBe(true);
		expect(row(summary, 'looks').source).toBe('global-mode');
		// The override is still stored — the point of the mode is that nothing
		// is lost — and the panel has to be able to say so.
		expect(row(summary, 'looks').hasOverride).toBe(true);
	});

	it('honours the per-image opt-out of global mode', () => {
		const summary = describeImageComposition(
			state({ globalCompositionOverride: true }),
			image({
				ignoreGlobalOverride: true,
				looksOverride: { filterBrightness: 1.2 } as never
			})
		);
		expect(summary.globalMode).toBe(false);
		expect(summary.ignoresGlobalMode).toBe(true);
		expect(row(summary, 'looks').source).toBe('override');
	});

	it('a scene beats a stored per-image override and says which slot wins', () => {
		const scene = {
			...createEmptySceneSlot('Night'),
			looksSlotId: 'looks-slot-1'
		};
		const summary = describeImageComposition(
			state({
				sceneSlots: [scene],
				looksProfileSlots: [
					{ id: 'looks-slot-1', name: 'Cold', values: {} }
				] as never
			}),
			image({
				sceneSlotId: scene.id,
				looksOverride: { filterBrightness: 1.2 } as never
			})
		);
		expect(summary.sceneName).toBe('Night');
		expect(summary.usedDefaultScene).toBe(false);
		const looks = row(summary, 'looks');
		expect(looks.source).toBe('scene');
		expect(looks.detail).toBe('Night · Cold');
		// Stored but shadowed: this is the case the old split UI could not show.
		expect(looks.hasOverride).toBe(true);
	});

	it('a scene that binds nothing for a subsystem leaves it on the globals', () => {
		const scene = createEmptySceneSlot('Empty');
		const summary = describeImageComposition(
			state({ sceneSlots: [scene] }),
			image({ sceneSlotId: scene.id })
		);
		expect(row(summary, 'spectrum').source).toBe('global');
	});

	it('marks a subsystem the scene forces off', () => {
		const scene = { ...createEmptySceneSlot('Bare'), logoSlotId: 'off' };
		const summary = describeImageComposition(
			state({ sceneSlots: [scene] }),
			image({ sceneSlotId: scene.id })
		);
		expect(row(summary, 'logo').source).toBe('scene-off');
		expect(row(summary, 'logo').detail).toBe('Bare');
	});

	it('falls back to the default scene and says the choice was not the image own', () => {
		const scene = createEmptySceneSlot('Default one');
		const summary = describeImageComposition(
			state({ sceneSlots: [scene], defaultSceneSlotId: scene.id }),
			image()
		);
		expect(summary.sceneName).toBe('Default one');
		expect(summary.usedDefaultScene).toBe(true);
	});

	it('an inline override beats the image slot binding', () => {
		const summary = describeImageComposition(
			state({
				logoProfileSlots: [
					{ id: 'logo-slot-1', name: 'Big', values: {} }
				] as never
			}),
			image({
				logoProfileSlotId: 'logo-slot-1',
				logoOverride: { logoScale: 2 } as never
			})
		);
		expect(row(summary, 'logo').source).toBe('override');
	});

	it('reports the slot binding when there is no inline override', () => {
		const summary = describeImageComposition(
			state({
				logoProfileSlots: [
					{ id: 'logo-slot-1', name: 'Big', values: {} }
				] as never
			}),
			image({ logoProfileSlotId: 'logo-slot-1' })
		);
		expect(row(summary, 'logo').source).toBe('slot');
		expect(row(summary, 'logo').detail).toBe('Big');
	});

	it('covers the three new overrides, which have no slot binding of their own', () => {
		const summary = describeImageComposition(
			state(),
			image({
				cameraFxOverride: { cameraMotionEnabled: true } as never,
				lightsOverride: { stageLightsEnabled: true } as never,
				trackTitleOverride: { trackTitleEnabled: true } as never
			})
		);
		for (const id of ['cameraFx', 'lights', 'trackTitle']) {
			expect(row(summary, id).source).toBe('override');
			expect(row(summary, id).supportsOverride).toBe(true);
		}
	});
});
