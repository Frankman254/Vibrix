import { describe, expect, it } from 'vitest';
import { collectBundleFontSpecs } from './trackFonts';

describe('collectBundleFontSpecs', () => {
	it('finds every family/weight pair a bundle declares, once', () => {
		const bundle = {
			project: {
				layers: [
					{
						style: {
							fontFamily: '"Bebas Neue", sans-serif',
							fontWeight: 400
						}
					},
					{ style: { fontFamily: 'inherit', fontWeight: 700 } }
				],
				clips: [
					{ override: { fontFamily: '"Oswald"', fontWeight: 700 } },
					{ override: { fontFamily: '"Oswald"', fontWeight: 700 } },
					{ override: { fontFamily: '"Anton"' } }
				]
			}
		};
		expect(collectBundleFontSpecs(bundle)).toEqual([
			'400 32px "Bebas Neue", sans-serif',
			'700 32px "Oswald"',
			'400 32px "Anton"'
		]);
	});

	it('returns nothing for an empty bundle', () => {
		expect(collectBundleFontSpecs(null)).toEqual([]);
	});
});
