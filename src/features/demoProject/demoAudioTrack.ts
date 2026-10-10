import { encodeWavFile } from '@/lib/audio/wavFile';
import {
	DEMO_TRACK_SECONDS,
	buildDemoTrackScore,
	type DemoTrackEvent
} from '@/features/demoProject/demoTrackScore';

/**
 * Renders the demo track to an audio File, in the browser, with no asset.
 *
 * The demo project needs something playing — a wallpaper that reacts to music
 * cannot be judged in silence — and shipping music would mean shipping a
 * licence. So the track is synthesised: `OfflineAudioContext` renders the score
 * from `demoTrackScore` and the result is written out as a WAV, which is then an
 * ordinary file as far as the playlist, IndexedDB and the offline export are
 * concerned.
 *
 * It is deliberately a synth sketch, not a song. Its job is to put real energy
 * in the kick, bass and hi-hat bands so every audio-reactive control in the
 * editor has something honest to respond to, and to give the generated intro
 * and ending a build and a resolve to sit on.
 */
const SAMPLE_RATE = 44100;
const VOICE_MIX = {
	kick: 0.9,
	snare: 0.35,
	hat: 0.16,
	bass: 0.5,
	pad: 0.3,
	riser: 0.26,
	impact: 0.44,
	downlifter: 0.34
} as const;

/** How much of each voice goes to the delay send. Dry voices stay at 0. */
const VOICE_SEND = {
	kick: 0,
	snare: 0.25,
	hat: 0.12,
	bass: 0,
	pad: 0.45,
	riser: 0.3,
	impact: 0.55,
	downlifter: 0.3
} as const;

/** Long enough to loop under a four-second riser without an audible seam. */
const NOISE_SECONDS = 2;

function createNoiseBuffer(context: OfflineAudioContext): AudioBuffer {
	const frames = Math.floor(SAMPLE_RATE * NOISE_SECONDS);
	const buffer = context.createBuffer(1, frames, SAMPLE_RATE);
	const data = buffer.getChannelData(0);
	for (let index = 0; index < frames; index += 1) {
		data[index] = Math.random() * 2 - 1;
	}
	return buffer;
}

type Buses = {
	/** Everything goes here. */
	dry: AudioNode;
	/** Feedback delay, for the voices that should bloom. */
	send: AudioNode;
	noise: AudioBuffer;
};

function createNoiseSource(
	context: OfflineAudioContext,
	noise: AudioBuffer,
	loop: boolean
): AudioBufferSourceNode {
	const source = context.createBufferSource();
	source.buffer = noise;
	source.loop = loop;
	return source;
}

function scheduleEvent(
	context: OfflineAudioContext,
	buses: Buses,
	event: DemoTrackEvent
): void {
	const gain = context.createGain();
	const level = VOICE_MIX[event.voice] * event.velocity;
	const start = event.time;
	const end = start + event.durationSeconds;
	gain.connect(buses.dry);
	const sendAmount = VOICE_SEND[event.voice];
	if (sendAmount > 0) {
		const send = context.createGain();
		send.gain.value = sendAmount;
		gain.connect(send);
		send.connect(buses.send);
	}

	if (event.voice === 'kick') {
		// Pitch drop plus a fast decay: the classic synthesised kick, and the
		// voice that carries the sub energy the bass-driven controls read.
		const osc = context.createOscillator();
		osc.frequency.setValueAtTime(event.frequency * 2.2, start);
		osc.frequency.exponentialRampToValueAtTime(event.frequency, end);
		gain.gain.setValueAtTime(level, start);
		gain.gain.exponentialRampToValueAtTime(0.0001, end);
		osc.connect(gain);
		osc.start(start);
		osc.stop(end);
		return;
	}

	if (event.voice === 'impact') {
		// A crash and a boom on the same event: filtered noise with a long
		// tail, plus a sine dropping out from under it.
		const source = createNoiseSource(context, buses.noise, true);
		const filter = context.createBiquadFilter();
		filter.type = 'highpass';
		filter.frequency.value = 900;
		const crash = context.createGain();
		crash.gain.setValueAtTime(level * 0.8, start);
		crash.gain.exponentialRampToValueAtTime(0.0001, end);
		source.connect(filter);
		filter.connect(crash);
		crash.connect(gain);
		gain.gain.value = 1;
		source.start(start);
		source.stop(end);

		const boom = context.createOscillator();
		const boomGain = context.createGain();
		boom.frequency.setValueAtTime(event.frequency * 1.8, start);
		boom.frequency.exponentialRampToValueAtTime(
			event.frequency * 0.6,
			start + 0.5
		);
		boomGain.gain.setValueAtTime(level, start);
		boomGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
		boom.connect(boomGain);
		boomGain.connect(gain);
		boom.start(start);
		boom.stop(start + 0.9);
		return;
	}

	if (event.voice === 'riser' || event.voice === 'downlifter') {
		const up = event.voice === 'riser';
		const source = createNoiseSource(context, buses.noise, true);
		const filter = context.createBiquadFilter();
		filter.type = 'bandpass';
		filter.Q.value = 1.4;
		filter.frequency.setValueAtTime(up ? 300 : 6000, start);
		filter.frequency.exponentialRampToValueAtTime(up ? 9000 : 180, end);
		source.connect(filter);
		filter.connect(gain);

		// A saw sweeping with it, so the move has pitch and not only hiss.
		const osc = context.createOscillator();
		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(
			up ? event.frequency * 0.5 : event.frequency,
			start
		);
		osc.frequency.exponentialRampToValueAtTime(
			up ? event.frequency * 2 : event.frequency * 0.12,
			end
		);
		const tone = context.createGain();
		tone.gain.value = 0.35;
		osc.connect(tone);
		tone.connect(gain);

		// A riser grows into its landing; a downlifter is loudest at the hit
		// and falls away.
		gain.gain.setValueAtTime(0.0001, start);
		if (up) {
			gain.gain.exponentialRampToValueAtTime(level, end);
		} else {
			gain.gain.linearRampToValueAtTime(level, start + 0.08);
			gain.gain.exponentialRampToValueAtTime(0.0001, end);
		}
		source.start(start);
		source.stop(end);
		osc.start(start);
		osc.stop(end);
		return;
	}

	if (event.voice === 'snare' || event.voice === 'hat') {
		const source = createNoiseSource(context, buses.noise, false);
		const filter = context.createBiquadFilter();
		filter.type = event.voice === 'hat' ? 'highpass' : 'bandpass';
		filter.frequency.value = event.voice === 'hat' ? 7000 : 1800;
		filter.Q.value = event.voice === 'hat' ? 0.7 : 1.1;
		gain.gain.setValueAtTime(level, start);
		gain.gain.exponentialRampToValueAtTime(0.0001, end);
		source.connect(filter);
		filter.connect(gain);
		source.start(start);
		source.stop(end);
		return;
	}

	const osc = context.createOscillator();
	osc.type = event.voice === 'bass' ? 'sawtooth' : 'triangle';
	osc.frequency.value = event.frequency;
	const filter = context.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.value = event.voice === 'bass' ? 420 : 1600;
	// Soft attack and release so sustained voices do not click at note edges.
	const attack = Math.min(0.02, event.durationSeconds / 4);
	const release = Math.min(0.12, event.durationSeconds / 3);
	gain.gain.setValueAtTime(0.0001, start);
	gain.gain.linearRampToValueAtTime(level, start + attack);
	gain.gain.setValueAtTime(level, Math.max(start + attack, end - release));
	gain.gain.linearRampToValueAtTime(0.0001, end);
	osc.connect(filter);
	filter.connect(gain);
	osc.start(start);
	osc.stop(end);
}

/**
 * A feedback delay, panned apart, lowpassed so the repeats sit behind the dry
 * signal. No convolver: a reverb would mean shipping an impulse response, and
 * two short delays buy most of the space for nothing.
 */
function createSendBus(
	context: OfflineAudioContext,
	destination: AudioNode
): AudioNode {
	const input = context.createGain();
	const tone = context.createBiquadFilter();
	tone.type = 'lowpass';
	tone.frequency.value = 2600;
	input.connect(tone);

	for (const [time, pan] of [
		[0.21, -0.6],
		[0.37, 0.6]
	] as const) {
		const delay = context.createDelay(1);
		delay.delayTime.value = time;
		const feedback = context.createGain();
		feedback.gain.value = 0.32;
		const panner = context.createStereoPanner();
		panner.pan.value = pan;
		const level = context.createGain();
		level.gain.value = 0.5;
		tone.connect(delay);
		delay.connect(feedback);
		feedback.connect(delay);
		delay.connect(level);
		level.connect(panner);
		panner.connect(destination);
	}
	return input;
}

export const DEMO_AUDIO_FILE_NAME = 'Vibrix Demo Remix.wav';

/** Null when the browser has no `OfflineAudioContext` (the demo then stays silent). */
export async function createDemoAudioTrackFile(): Promise<File | null> {
	const Ctor =
		typeof OfflineAudioContext !== 'undefined'
			? OfflineAudioContext
			: undefined;
	if (!Ctor) return null;

	const frames = Math.ceil(DEMO_TRACK_SECONDS * SAMPLE_RATE);
	const context = new Ctor(2, frames, SAMPLE_RATE);
	// One compressor across the whole mix: the voices are summed without any
	// headroom budget, and clipping a demo would read as a bug in the app.
	const master = context.createDynamicsCompressor();
	master.threshold.value = -10;
	master.ratio.value = 6;
	const trim = context.createGain();
	// Measured, not guessed: at 0.8 the crash on the drop and the one that
	// opens the ending both came out of the compressor above 1.0, and a WAV
	// cannot hold that — it clips, which in a demo reads as a broken app.
	trim.gain.value = 0.66;
	master.connect(trim);
	trim.connect(context.destination);

	const buses: Buses = {
		dry: master,
		send: createSendBus(context, master),
		noise: createNoiseBuffer(context)
	};
	for (const event of buildDemoTrackScore()) {
		scheduleEvent(context, buses, event);
	}

	const rendered = await context.startRendering();
	const channels = Array.from(
		{ length: rendered.numberOfChannels },
		(_, channel) => rendered.getChannelData(channel)
	);
	const wav = encodeWavFile(channels, rendered.sampleRate);
	return new File([wav as BlobPart], DEMO_AUDIO_FILE_NAME, {
		type: 'audio/wav'
	});
}
