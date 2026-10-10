/**
 * Camera FX owns `style.filter` on every motion root, so no layer may set a
 * filter of its own on that same element.
 *
 * `CameraFxStage` writes the movement trail into `target.style.filter` on each
 * `[data-camera-motion-layer]` element every frame, and clears it to '' when
 * the trail is zero or the camera is switched off. A filter React put on the
 * root is therefore wiped on the first frame and never restored — React only
 * rewrites the style prop when one of its inputs changes. That is exactly how
 * the particle brightness/contrast/saturation/blur/hue stack went missing from
 * the preview while the offline export, which reads the state instead of the
 * DOM, kept applying it: a blur nobody could see in the editor showed up in
 * the video.
 *
 * The rule is "keep it on an inner element" (`OverlayImageLayerView` on its
 * <img>, `SceneLayerCanvas` on its <Canvas>), and this test is a source-level
 * guard because the suite has no DOM.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ATTRIBUTE = 'data-camera-motion-layer';

function filesWithMotionRoots(): string[] {
	const out = execFileSync(
		'grep',
		['-rl', '--include=*.tsx', ATTRIBUTE, 'src'],
		{ encoding: 'utf8' }
	);
	return out.split('\n').filter(Boolean);
}

/** The style object literal attached to the element carrying the attribute. */
function rootStyleLiteral(source: string, attributeIndex: number): string {
	const styleStart = source.indexOf('style={{', attributeIndex);
	if (styleStart === -1) return '';
	const end = source.indexOf('}}', styleStart);
	return end === -1
		? source.slice(styleStart)
		: source.slice(styleStart, end);
}

describe('camera motion roots', () => {
	const files = filesWithMotionRoots();

	it('finds the layer roots to check', () => {
		// A rename of the attribute must fail here rather than pass vacuously.
		expect(files.length).toBeGreaterThan(3);
	});

	it.each(files)('%s does not set a filter on the motion root', file => {
		const source = readFileSync(file, 'utf8');
		let index = source.indexOf(`${ATTRIBUTE}=`);
		while (index !== -1) {
			expect(rootStyleLiteral(source, index)).not.toMatch(/\bfilter:/);
			index = source.indexOf(`${ATTRIBUTE}=`, index + 1);
		}
	});
});

describe('the particle canvas filter', () => {
	it('is applied inside the motion root, on the Canvas itself', () => {
		const source = readFileSync(
			'src/components/wallpaper/layers/SceneLayerCanvas.tsx',
			'utf8'
		);
		const canvasIndex = source.indexOf('<Canvas');
		expect(canvasIndex).toBeGreaterThan(-1);
		expect(source.slice(canvasIndex)).toMatch(/filter: canvasFilter/);
	});
});
