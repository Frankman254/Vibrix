import { describe, expect, it } from 'vitest';
import { classifyPlatform, platformName } from './platform';

describe('classifyPlatform', () => {
	it('reads the platforms the export orders its encoders by', () => {
		expect(classifyPlatform('Windows')).toBe('windows');
		expect(classifyPlatform('Win32')).toBe('windows');
		expect(classifyPlatform('MacIntel')).toBe('macos');
		expect(classifyPlatform('macOS')).toBe('macos');
		expect(classifyPlatform('Linux x86_64')).toBe('linux');
		// Android and ChromeOS want the same Linux-style ordering.
		expect(classifyPlatform('Linux armv8l')).toBe('linux');
		expect(classifyPlatform('Android')).toBe('linux');
		expect(classifyPlatform('')).toBe('other');
	});

	it('leaves an unknown platform unnamed rather than guessing', () => {
		expect(platformName('other')).toBe('');
		expect(platformName('windows')).toBe('Windows');
	});
});
