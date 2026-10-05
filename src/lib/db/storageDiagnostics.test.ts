import { describe, expect, it } from 'vitest';
import {
	availableBytesFrom,
	formatStorageBytes,
	formatStorageEstimate,
	isQuotaExceededError
} from './storageDiagnostics';

describe('availableBytesFrom', () => {
	it('is the headroom between usage and quota', () => {
		expect(availableBytesFrom(1_000, 4_000)).toBe(3_000);
	});

	it('clamps a browser reporting usage above its own quota to zero', () => {
		// Chrome does this once the disk fills or debris from a crashed export
		// still counts: a negative "free" is a contradiction, not free space.
		expect(availableBytesFrom(9_000, 4_000)).toBe(0);
	});

	it('answers null when the browser would not say', () => {
		expect(availableBytesFrom(null, 4_000)).toBeNull();
		expect(availableBytesFrom(1_000, null)).toBeNull();
	});
});

describe('isQuotaExceededError', () => {
	it('recognises the modern name', () => {
		expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
	});

	it('recognises the legacy numeric codes', () => {
		expect(isQuotaExceededError({ code: 22 })).toBe(true);
		expect(isQuotaExceededError({ code: 1014 })).toBe(true);
	});

	it('recognises a wrapper that only kept the message', () => {
		expect(
			isQuotaExceededError(
				new Error(
					'The operation failed because it would cause the application to exceed its storage quota.'
				)
			)
		).toBe(true);
	});

	it('does NOT claim an encoder or I/O failure is a quota failure', () => {
		// This is the whole point of the predicate: the export path has to be
		// able to tell these three apart to say anything useful to the user.
		expect(
			isQuotaExceededError(
				new Error(
					'This specific encoder configuration (avc1.640032, 66600000 bps) is not supported in this environment.'
				)
			)
		).toBe(false);
		expect(
			isQuotaExceededError({
				name: 'DataError',
				message: 'Failed to write blobs (IOError)'
			})
		).toBe(false);
		expect(isQuotaExceededError(null)).toBe(false);
		expect(isQuotaExceededError('QuotaExceededError')).toBe(false);
	});
});

describe('formatStorageBytes', () => {
	it('scales to the unit a human would use', () => {
		expect(formatStorageBytes(512)).toBe('512 B');
		expect(formatStorageBytes(1024)).toBe('1 KB');
		expect(formatStorageBytes(5 * 1024 * 1024)).toBe('5 MB');
		expect(formatStorageBytes(12 * 1024 ** 3)).toBe('12 GB');
	});

	it('marks an unanswered question rather than printing a zero', () => {
		expect(formatStorageBytes(null)).toBe('?');
	});
});

describe('formatStorageEstimate', () => {
	it('puts usage, quota, headroom, durability and the backends on one line', () => {
		const line = formatStorageEstimate({
			usageBytes: 4 * 1024 ** 3,
			quotaBytes: 12 * 1024 ** 3,
			availableBytes: 8 * 1024 ** 3,
			persisted: true,
			breakdown: { indexedDB: 3 * 1024 ** 3, fileSystem: 1024 ** 3 }
		});
		expect(line).toBe(
			'usage 4 GB · quota 12 GB · 8 GB available · persistent · indexedDB 3 GB, fileSystem 1 GB'
		);
	});

	it('says what it can when the browser answers nothing', () => {
		expect(
			formatStorageEstimate({
				usageBytes: null,
				quotaBytes: null,
				availableBytes: null,
				persisted: null,
				breakdown: {}
			})
		).toBe('usage ? · quota ? · ? available');
	});
});
