/**
 * Minimal RIFF/WAVE writer: 16-bit PCM, interleaved.
 *
 * Exists so generated audio can be handed to the rest of the app as an ordinary
 * file. Everything downstream — the playlist, IndexedDB, `decodeAudioData`, the
 * offline export's audio pass — already speaks "audio File", and WAV is the one
 * container a browser can both write without a codec and read back everywhere.
 */
const BYTES_PER_SAMPLE = 2;
const HEADER_BYTES = 44;

function clampToInt16(sample: number): number {
	// Float32 audio is nominally -1..1 but synthesis overshoots; clamping here
	// is what keeps an overshoot from wrapping around into a loud click.
	const clamped = Math.max(-1, Math.min(1, sample));
	return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
}

/**
 * @param channels One Float32Array per channel, all the same length.
 * @param sampleRate Frames per second.
 */
export function encodeWavFile(
	channels: readonly Float32Array[],
	sampleRate: number
): Uint8Array {
	if (channels.length === 0) throw new Error('encodeWavFile needs a channel');
	const frames = channels[0]!.length;
	for (const channel of channels) {
		if (channel.length !== frames) {
			throw new Error('encodeWavFile needs channels of equal length');
		}
	}

	const channelCount = channels.length;
	const dataBytes = frames * channelCount * BYTES_PER_SAMPLE;
	const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
	const view = new DataView(buffer);

	const writeAscii = (offset: number, text: string) => {
		for (let index = 0; index < text.length; index += 1) {
			view.setUint8(offset + index, text.charCodeAt(index));
		}
	};

	writeAscii(0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	writeAscii(8, 'WAVE');
	writeAscii(12, 'fmt ');
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channelCount * BYTES_PER_SAMPLE, true);
	view.setUint16(32, channelCount * BYTES_PER_SAMPLE, true);
	view.setUint16(34, 8 * BYTES_PER_SAMPLE, true);
	writeAscii(36, 'data');
	view.setUint32(40, dataBytes, true);

	let offset = HEADER_BYTES;
	for (let frame = 0; frame < frames; frame += 1) {
		for (let channel = 0; channel < channelCount; channel += 1) {
			view.setInt16(
				offset,
				clampToInt16(channels[channel]![frame]!),
				true
			);
			offset += BYTES_PER_SAMPLE;
		}
	}

	return new Uint8Array(buffer);
}
