/**
 * The demo track, as a schedule of events.
 *
 * Pure on purpose: this is the half worth testing (the synthesis itself needs a
 * real `OfflineAudioContext`, which the node test suite does not have). It is
 * also the half that matters for the wallpaper — the editor reacts to kick, bass
 * and hi-hat bands, so a demo that fails to put energy in those bands shows a
 * motionless wallpaper no matter how good the look is.
 *
 * It is a TRACK and not a bare loop on purpose too: an intro that builds, a drop
 * that carries the groove, and an ending that resolves. The two outer sections
 * exist so the generated intro/ending montage has something to arrive and leave
 * on — a riser under the title montage and a downlifter under the outro burst —
 * which is the difference between "a demo" and something worth building on.
 */
export const DEMO_TRACK_BPM = 120;

const BEAT_SECONDS = 60 / DEMO_TRACK_BPM;
const BAR_SECONDS = BEAT_SECONDS * 4;

export type DemoTrackSectionId = 'intro' | 'drop' | 'outro';

export type DemoTrackSection = {
	id: DemoTrackSectionId;
	startBar: number;
	bars: number;
	startSeconds: number;
	seconds: number;
};

function section(
	id: DemoTrackSectionId,
	startBar: number,
	bars: number
): DemoTrackSection {
	return {
		id,
		startBar,
		bars,
		startSeconds: startBar * BAR_SECONDS,
		seconds: bars * BAR_SECONDS
	};
}

/** 4 + 8 + 4 bars at 120 BPM: 8 s of build, 16 s of groove, 8 s of ending. */
export const DEMO_TRACK_SECTIONS = [
	section('intro', 0, 4),
	section('drop', 4, 8),
	section('outro', 12, 4)
] as const satisfies readonly DemoTrackSection[];

export const DEMO_TRACK_BARS = DEMO_TRACK_SECTIONS.reduce(
	(total, part) => total + part.bars,
	0
);
export const DEMO_TRACK_SECONDS = DEMO_TRACK_BARS * BAR_SECONDS;

function sectionSeconds(id: DemoTrackSectionId): number {
	return DEMO_TRACK_SECTIONS.find(part => part.id === id)!.seconds;
}

/**
 * The windows the generated intro and ending should occupy, so the montage
 * lands on the same build and the same resolve the audio does.
 */
export const DEMO_TRACK_INTRO_SECONDS = sectionSeconds('intro');
export const DEMO_TRACK_OUTRO_SECONDS = sectionSeconds('outro');

export type DemoTrackVoice =
	| 'kick'
	| 'snare'
	| 'hat'
	| 'bass'
	| 'pad'
	/** Noise sweep upwards, for the last bars of the intro. */
	| 'riser'
	/** Crash plus sub boom, on each section's downbeat. */
	| 'impact'
	/** Pitch falling away, under the ending. */
	| 'downlifter';

export type DemoTrackEvent = {
	voice: DemoTrackVoice;
	/** Seconds from the start of the track. */
	time: number;
	durationSeconds: number;
	/**
	 * Hz for the pitched voices; the START of the sweep for `riser` and
	 * `downlifter` (the synth derives where it ends). Ignored by the
	 * percussive voices.
	 */
	frequency: number;
	/** 0..1 before the voice's own mix level. */
	velocity: number;
};

/**
 * A minor progression, two bars per chord: Am – F through the intro, Am – F –
 * C – G across the drop, then C – Am to resolve the ending. Enough harmonic
 * movement that a static wallpaper looks like it is responding to music rather
 * than to a metronome.
 */
const PROGRESSION = [
	220, 174.61, 220, 174.61, 261.63, 196, 261.63, 220
] as const;
const CHORD_THIRD_RATIO = 1.1892; // ~minor third up, averaged; voiced loosely
const CHORD_FIFTH_RATIO = 1.4983;

function beat(bar: number, position: number): number {
	return bar * BAR_SECONDS + position * BEAT_SECONDS;
}

function chordRoot(bar: number): number {
	return PROGRESSION[Math.floor(bar / 2) % PROGRESSION.length]!;
}

function pushKick(
	events: DemoTrackEvent[],
	bar: number,
	position: number,
	velocity: number
): void {
	events.push({
		voice: 'kick',
		time: beat(bar, position),
		durationSeconds: 0.24,
		frequency: 52,
		velocity
	});
}

function pushSnare(
	events: DemoTrackEvent[],
	bar: number,
	position: number,
	velocity: number
): void {
	events.push({
		voice: 'snare',
		time: beat(bar, position),
		durationSeconds: 0.16,
		frequency: 0,
		velocity
	});
}

function pushHats(
	events: DemoTrackEvent[],
	bar: number,
	options: { offbeatsOnly?: boolean; scale: number }
): void {
	for (let eighth = 0; eighth < 8; eighth += 1) {
		const offbeat = eighth % 2 === 1;
		if (options.offbeatsOnly && !offbeat) continue;
		events.push({
			voice: 'hat',
			time: beat(bar, eighth / 2),
			durationSeconds: 0.05,
			frequency: 0,
			velocity: (offbeat ? 0.55 : 0.3) * options.scale
		});
	}
}

function pushPad(
	events: DemoTrackEvent[],
	bar: number,
	bars: number,
	velocity: number
): void {
	const root = chordRoot(bar);
	for (const ratio of [1, CHORD_THIRD_RATIO, CHORD_FIFTH_RATIO]) {
		events.push({
			voice: 'pad',
			time: beat(bar, 0),
			durationSeconds: bars * BAR_SECONDS,
			frequency: root * ratio,
			velocity
		});
	}
}

function pushImpact(
	events: DemoTrackEvent[],
	bar: number,
	velocity: number
): void {
	events.push({
		voice: 'impact',
		time: beat(bar, 0),
		// Deliberately long: the crash tail is what makes a section change
		// sound like a section change instead of an edit.
		durationSeconds: 1.8,
		frequency: 60,
		velocity
	});
}

/** Root, root, fifth, octave — a shape, not a riff. */
const BASS_PATTERN = [
	{ position: 0, ratio: 0.5, length: 0.9 },
	{ position: 1.5, ratio: 0.5, length: 0.4 },
	{ position: 2, ratio: 0.75, length: 0.9 },
	{ position: 3.5, ratio: 1, length: 0.4 }
] as const;

function pushBassBar(
	events: DemoTrackEvent[],
	bar: number,
	velocity: number
): void {
	const root = chordRoot(bar);
	for (const note of BASS_PATTERN) {
		events.push({
			voice: 'bass',
			time: beat(bar, note.position),
			durationSeconds: note.length * BEAT_SECONDS,
			frequency: root * note.ratio,
			velocity
		});
	}
}

function buildIntro(events: DemoTrackEvent[]): void {
	// Pad first and alone: the montage's first second should not open on a
	// drum hit.
	pushPad(events, 0, 2, 0.18);
	pushPad(events, 2, 2, 0.26);
	pushKick(events, 0, 0, 0.7);
	pushKick(events, 2, 0, 0.85);

	for (const bar of [2, 3]) {
		pushHats(events, bar, { scale: bar === 2 ? 0.45 : 0.7 });
	}

	// A 16th roll that tightens across the last bar, then the pickup into the
	// drop: this is the part a listener hears as "something is about to open".
	const roll = [
		{ position: 2, velocity: 0.3 },
		{ position: 2.5, velocity: 0.38 },
		{ position: 2.75, velocity: 0.44 },
		{ position: 3, velocity: 0.52 },
		{ position: 3.25, velocity: 0.6 },
		{ position: 3.5, velocity: 0.68 },
		{ position: 3.625, velocity: 0.76 },
		{ position: 3.75, velocity: 0.86 },
		{ position: 3.875, velocity: 1 }
	];
	for (const hit of roll) pushSnare(events, 3, hit.position, hit.velocity);

	events.push({
		voice: 'bass',
		time: beat(3, 3.5),
		durationSeconds: 0.4 * BEAT_SECONDS,
		frequency: chordRoot(3) * 0.5,
		velocity: 0.8
	});

	// Two bars of sweep, landing exactly on the drop's downbeat.
	events.push({
		voice: 'riser',
		time: beat(2, 0),
		durationSeconds: 8 * BEAT_SECONDS,
		frequency: 220,
		velocity: 0.9
	});
}

function buildDrop(events: DemoTrackEvent[]): void {
	const drop = DEMO_TRACK_SECTIONS[1];
	const lastBar = drop.startBar + drop.bars - 1;
	pushImpact(events, drop.startBar, 1);
	// Halfway through, where the progression turns to C: a second crash keeps
	// eight bars from flattening out.
	pushImpact(events, drop.startBar + 4, 0.6);

	for (let bar = drop.startBar; bar <= lastBar; bar += 1) {
		pushKick(events, bar, 0, 1);
		pushKick(events, bar, 2, 0.9);
		// A pickup on the final bar so the hand-off to the ending lands on an
		// accent instead of a gap.
		if (bar === lastBar) pushKick(events, bar, 3.5, 0.85);
		pushSnare(events, bar, 1, 0.8);
		pushSnare(events, bar, 3, 0.8);
		pushHats(events, bar, { scale: 1 });
		pushBassBar(events, bar, 0.9);
		if ((bar - drop.startBar) % 2 === 0) pushPad(events, bar, 2, 0.22);
	}
}

function buildOutro(events: DemoTrackEvent[]): void {
	const outro = DEMO_TRACK_SECTIONS[2];
	const [first, second, third] = [
		outro.startBar,
		outro.startBar + 1,
		outro.startBar + 2
	];
	pushImpact(events, first, 0.85);
	pushPad(events, first, 2, 0.28);

	pushKick(events, first, 0, 0.95);
	pushKick(events, first, 2, 0.85);
	pushSnare(events, first, 1, 0.75);
	pushSnare(events, first, 3, 0.75);
	pushHats(events, first, { scale: 0.9 });
	pushBassBar(events, first, 0.85);

	// Thinning out: offbeat hats, the backbeat only on 3, two bass roots.
	pushKick(events, second, 0, 0.8);
	pushSnare(events, second, 2, 0.6);
	pushHats(events, second, { offbeatsOnly: true, scale: 0.7 });
	for (const position of [0, 2]) {
		events.push({
			voice: 'bass',
			time: beat(second, position),
			durationSeconds: 1.6 * BEAT_SECONDS,
			frequency: chordRoot(second) * 0.5,
			velocity: 0.7
		});
	}

	// The resolve: one last hit, the chord held to the end of the track, and
	// the pitch falling away under it. Nothing new starts after this.
	pushImpact(events, third, 0.7);
	pushKick(events, third, 0, 0.9);
	pushPad(events, third, 2, 0.3);
	events.push({
		voice: 'downlifter',
		time: beat(third, 0),
		durationSeconds: 6 * BEAT_SECONDS,
		frequency: 440,
		velocity: 0.8
	});
}

export function buildDemoTrackScore(): DemoTrackEvent[] {
	const events: DemoTrackEvent[] = [];
	buildIntro(events);
	buildDrop(events);
	buildOutro(events);
	return events.sort((a, b) => a.time - b.time);
}
