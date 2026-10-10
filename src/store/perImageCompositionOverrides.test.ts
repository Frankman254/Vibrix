import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => void mem.set(k, v),
	removeItem: (k: string) => void mem.delete(k),
	clear: () => void mem.clear()
};

const { useWallpaperStore } = await import('@/store/wallpaperStore');
const { createBackgroundImageItem } =
	await import('@/features/background/backgroundImages');
const { buildActiveImageSelectionPatch } =
	await import('@/store/activeImageSelection');
const { buildGlobalCompositionPatch } =
	await import('@/store/globalComposition');
const { extractRainProfileSettings } = await import('@/store/featureProfiles');

/** Two images so "only the active one" is actually testable. */
function seedImages() {
	useWallpaperStore.setState({
		backgroundImages: [
			createBackgroundImageItem('img-1', 'one.png'),
			createBackgroundImageItem('img-2', 'two.png')
		],
		activeImageId: 'img-1',
		sceneSlots: [],
		defaultSceneSlotId: null,
		globalCompositionOverride: false
	});
}

const active = () => {
	const state = useWallpaperStore.getState();
	return state.backgroundImages.find(
		img => img.assetId === state.activeImageId
	)!;
};

describe('per-image Camera FX / Lights / Track Title overrides', () => {
	beforeEach(seedImages);

	it('start empty on a fresh image', () => {
		expect(active().cameraFxOverride).toBeNull();
		expect(active().lightsOverride).toBeNull();
		expect(active().trackTitleOverride).toBeNull();
	});

	it('capture writes the live composition onto the ACTIVE image only', () => {
		useWallpaperStore.setState({
			cameraMotionEnabled: true,
			cameraMotionAmount: 0.77
		});
		useWallpaperStore.getState().captureImageCameraFxOverride();

		expect(active().cameraFxOverride?.cameraMotionAmount).toBe(0.77);
		const other = useWallpaperStore
			.getState()
			.backgroundImages.find(img => img.assetId === 'img-2')!;
		expect(other.cameraFxOverride).toBeNull();
	});

	it('capture then clear leaves the image exactly as it was', () => {
		useWallpaperStore.getState().captureImageLightsOverride();
		expect(active().lightsOverride).not.toBeNull();
		useWallpaperStore.getState().setImageLightsOverride(null);
		expect(active().lightsOverride).toBeNull();
	});

	it('selecting the image applies the stored Camera FX, enable flag included', () => {
		useWallpaperStore.setState({
			cameraMotionEnabled: true,
			cameraMotionAmount: 0.4
		});
		useWallpaperStore.getState().captureImageCameraFxOverride();
		// Now the live state disagrees with what the image carries.
		useWallpaperStore.setState({
			cameraMotionEnabled: false,
			cameraMotionAmount: 0.1
		});

		const { patch } = buildActiveImageSelectionPatch(
			useWallpaperStore.getState(),
			'img-1'
		);
		// Unlike logo/spectrum, Camera FX carries its own switch on purpose: a
		// stored composition is allowed to say "and movement ON here".
		expect(patch.cameraMotionEnabled).toBe(true);
		expect(patch.cameraMotionAmount).toBe(0.4);
	});

	it('global composition mode ignores the stored override entirely', () => {
		useWallpaperStore.setState({ cameraMotionAmount: 0.9 });
		useWallpaperStore.getState().captureImageCameraFxOverride();
		useWallpaperStore.setState({
			globalCompositionOverride: true,
			cameraMotionAmount: 0.2
		});

		const { patch } = buildActiveImageSelectionPatch(
			useWallpaperStore.getState(),
			'img-1'
		);
		expect(patch.cameraMotionAmount).toBeUndefined();
		// And nothing stored was touched.
		expect(active().cameraFxOverride?.cameraMotionAmount).toBe(0.9);
	});

	it('a global slot capture includes the three new subsystems', () => {
		useWallpaperStore.getState().captureGlobalCompositionSlot(0);
		const slot = useWallpaperStore.getState().globalCompositionSlots[0];
		expect(slot.values?.cameraFx).toBeTruthy();
		expect(slot.values?.lights).toBeTruthy();
		expect(slot.values?.trackTitle).toBeTruthy();
		// And capturing wrote into the SLOT, not into the images.
		for (const img of useWallpaperStore.getState().backgroundImages) {
			expect(img.lightsOverride).toBeNull();
			expect(img.trackTitleOverride).toBeNull();
		}
	});
});

/**
 * Particles and Rain are the effect, not a visibility switch.
 *
 * `logoEnabled` / `spectrumEnabled` are global "hide this everywhere" toggles,
 * so a per-image snapshot must not fight them. `particlesEnabled` /
 * `rainEnabled` are the opposite: "this image has rain and that one doesn't" is
 * the only reason to bind them per image, and `buildSceneSlotActivationPatch`
 * has always applied them as saved. The per-image path used to clamp both to
 * live state, so a capture carried every drop's length, angle and colour and
 * still could not decide whether it rained.
 */
describe('per-image Particles / Rain carry their own on/off', () => {
	beforeEach(seedImages);

	it('an override captured with rain ON turns it on, against live state', () => {
		useWallpaperStore.setState({ rainEnabled: true, rainDropCount: 900 });
		useWallpaperStore.getState().captureImageRainOverride();
		useWallpaperStore.setState({ rainEnabled: false, rainDropCount: 10 });

		const { patch } = buildActiveImageSelectionPatch(
			useWallpaperStore.getState(),
			'img-1'
		);
		expect(patch.rainEnabled).toBe(true);
		expect(patch.rainDropCount).toBe(900);
	});

	it('an override captured with rain OFF turns it off, against live state', () => {
		useWallpaperStore.setState({ rainEnabled: false });
		useWallpaperStore.getState().captureImageRainOverride();
		useWallpaperStore.setState({ rainEnabled: true });

		const { patch } = buildActiveImageSelectionPatch(
			useWallpaperStore.getState(),
			'img-1'
		);
		expect(patch.rainEnabled).toBe(false);
	});

	it('does the same for particles', () => {
		useWallpaperStore.setState({
			particlesEnabled: false,
			particleCount: 42
		});
		useWallpaperStore.getState().captureImageParticlesOverride();
		useWallpaperStore.setState({
			particlesEnabled: true,
			particleCount: 400
		});

		const { patch } = buildActiveImageSelectionPatch(
			useWallpaperStore.getState(),
			'img-1'
		);
		expect(patch.particlesEnabled).toBe(false);
		expect(patch.particleCount).toBe(42);
	});

	it('a bound rain SLOT brings its own switch too', () => {
		useWallpaperStore.setState({ rainEnabled: true, rainDropCount: 700 });
		const values = extractRainProfileSettings(useWallpaperStore.getState());
		const slots = useWallpaperStore.getState().rainProfileSlots;
		useWallpaperStore.setState({
			rainEnabled: false,
			rainProfileSlots: slots.map((slot, index) =>
				index === 0 ? { ...slot, values } : slot
			),
			backgroundImages: useWallpaperStore
				.getState()
				.backgroundImages.map(img =>
					img.assetId === 'img-1'
						? { ...img, rainProfileSlotId: slots[0]!.id }
						: img
				)
		});

		const { patch } = buildActiveImageSelectionPatch(
			useWallpaperStore.getState(),
			'img-1'
		);
		expect(patch.rainEnabled).toBe(true);
		expect(patch.rainDropCount).toBe(700);
	});

	it('leaves the logo/spectrum visibility clamp alone', () => {
		useWallpaperStore.setState({ logoEnabled: false });
		useWallpaperStore.getState().captureImageLogoOverride();
		useWallpaperStore.setState({ logoEnabled: true });

		const { patch } = buildActiveImageSelectionPatch(
			useWallpaperStore.getState(),
			'img-1'
		);
		// Hiding the logo is a global decision; an image may not undo it.
		expect(patch.logoEnabled).toBe(true);
	});
});

describe('global composition slots carry Particles / Rain on/off', () => {
	beforeEach(seedImages);

	it('a slot captured with rain off turns it off when applied', () => {
		useWallpaperStore.setState({ rainEnabled: false, rainDropCount: 33 });
		useWallpaperStore.getState().captureGlobalCompositionSlot(0);
		const values =
			useWallpaperStore.getState().globalCompositionSlots[0]!.values!;
		// Live state now says the opposite of what the slot holds.
		useWallpaperStore.setState({ rainEnabled: true, rainDropCount: 500 });

		const patch = buildGlobalCompositionPatch(
			useWallpaperStore.getState(),
			values
		);
		expect(patch.rainEnabled).toBe(false);
		expect(patch.rainDropCount).toBe(33);
	});
});
