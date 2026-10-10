import { describe, expect, it } from 'vitest';
import { encodeWavFile } from '@/lib/audio/wavFile';

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
	return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readUint32(bytes: Uint8Array, offset: number): number {
	return new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset, true);
}

function readInt16(bytes: Uint8Array, offset: number): number {
	return new DataView(bytes.buffer, bytes.byteOffset).getInt16(offset, true);
}

describe('encodeWavFile', () => {
	it('writes a header a decoder can read', () => {
		const wav = encodeWavFile(
			[new Float32Array(4), new Float32Array(4)],
			48000
		);
		expect(readAscii(wav, 0, 4)).toBe('RIFF');
		expect(readAscii(wav, 8, 4)).toBe('WAVE');
		expect(readAscii(wav, 12, 4)).toBe('fmt ');
		expect(readAscii(wav, 36, 4)).toBe('data');
		// 2 channels × 4 frames × 2 bytes
		expect(readUint32(wav, 40)).toBe(16);
		expect(readUint32(wav, 4)).toBe(36 + 16);
		expect(wav.length).toBe(44 + 16);
	});

	it('records the sample rate and byte rate it was given', () => {
		const wav = encodeWavFile([new Float32Array(2)], 22050);
		expect(readUint32(wav, 24)).toBe(22050);
		// mono, 16-bit
		expect(readUint32(wav, 28)).toBe(22050 * 2);
	});

	it('interleaves channels frame by frame', () => {
		const left = Float32Array.from([1, 0]);
		const right = Float32Array.from([0, -1]);
		const wav = encodeWavFile([left, right], 44100);
		expect(readInt16(wav, 44)).toBe(32767);
		expect(readInt16(wav, 46)).toBe(0);
		expect(readInt16(wav, 48)).toBe(0);
		expect(readInt16(wav, 50)).toBe(-32768);
	});

	it('clamps overshoot instead of wrapping it into a click', () => {
		const wav = encodeWavFile([Float32Array.from([4, -4])], 44100);
		expect(readInt16(wav, 44)).toBe(32767);
		expect(readInt16(wav, 46)).toBe(-32768);
	});

	it('refuses input it cannot lay out', () => {
		expect(() => encodeWavFile([], 44100)).toThrow();
		expect(() =>
			encodeWavFile([new Float32Array(2), new Float32Array(3)], 44100)
		).toThrow();
	});
});
