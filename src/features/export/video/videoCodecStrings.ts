/**
 * Codec strings for the export's encoder candidates.
 *
 * WebCodecs takes a full codec string (`avc1.640033`), not a family name, and
 * the string carries the profile and level — which is exactly what a platform
 * encoder accepts or rejects. Picking the level from the real macroblock rate
 * (instead of from a bitrate guess, as a generic muxer must) is what keeps a
 * 1440p60 export inside what a Windows Media Foundation encoder will take.
 *
 * Nothing here asks whether a string is *supported*: these are candidates.
 * `offlineEncoderNegotiation.ts` puts every one of them through
 * `VideoEncoder.isConfigSupported()` before an export may start.
 */

export type AvcProfile = 'high' | 'main' | 'baseline';

/**
 * H.264 Annex A levels, with the two limits that decide which one a given
 * resolution and frame rate needs: `maxFrameMbs` (frame size in macroblocks)
 * and `maxMbsPerSec` (macroblocks per second).
 */
const AVC_LEVELS = [
	{ id: '3.1', hex: '1f', maxFrameMbs: 3600, maxMbsPerSec: 108_000 },
	{ id: '3.2', hex: '20', maxFrameMbs: 5120, maxMbsPerSec: 216_000 },
	{ id: '4.0', hex: '28', maxFrameMbs: 8192, maxMbsPerSec: 245_760 },
	{ id: '4.1', hex: '29', maxFrameMbs: 8192, maxMbsPerSec: 245_760 },
	{ id: '4.2', hex: '2a', maxFrameMbs: 8704, maxMbsPerSec: 522_240 },
	{ id: '5.0', hex: '32', maxFrameMbs: 22_080, maxMbsPerSec: 589_824 },
	{ id: '5.1', hex: '33', maxFrameMbs: 36_864, maxMbsPerSec: 983_040 },
	{ id: '5.2', hex: '34', maxFrameMbs: 36_864, maxMbsPerSec: 2_073_600 },
	{ id: '6.0', hex: '3c', maxFrameMbs: 139_264, maxMbsPerSec: 4_177_920 },
	{ id: '6.1', hex: '3d', maxFrameMbs: 139_264, maxMbsPerSec: 8_355_840 },
	{ id: '6.2', hex: '3e', maxFrameMbs: 139_264, maxMbsPerSec: 16_711_680 }
] as const;

/** `profile_idc` + `constraint_set` bytes, as the codec string spells them. */
const AVC_PROFILE_PREFIX: Record<AvcProfile, string> = {
	high: '6400',
	main: '4d40',
	baseline: '42e0'
};

const AVC_PROFILE_NAME: Record<AvcProfile, string> = {
	high: 'High',
	main: 'Main',
	baseline: 'Baseline'
};

function frameMacroblocks(width: number, height: number): number {
	return Math.ceil(width / 16) * Math.ceil(height / 16);
}

/**
 * The lowest level that can carry this resolution and frame rate, as an index
 * into `AVC_LEVELS`. Falls back to the top level rather than failing: an
 * over-sized request is the encoder's call to refuse, not ours.
 */
function avcLevelIndexFor(options: {
	width: number;
	height: number;
	fps: number;
}): number {
	const mbs = frameMacroblocks(options.width, options.height);
	const mbsPerSec = mbs * Math.max(1, options.fps);
	const index = AVC_LEVELS.findIndex(
		level => level.maxFrameMbs >= mbs && level.maxMbsPerSec >= mbsPerSec
	);
	return index === -1 ? AVC_LEVELS.length - 1 : index;
}

export type AvcCodecChoice = {
	codecString: string;
	/** For the diagnostics line, e.g. `High 5.1`. */
	profileLabel: string;
};

export function avcCodecString(
	profile: AvcProfile,
	levelIndex: number
): AvcCodecChoice {
	const level = AVC_LEVELS[Math.min(levelIndex, AVC_LEVELS.length - 1)];
	return {
		codecString: `avc1.${AVC_PROFILE_PREFIX[profile]}${level.hex}`,
		profileLabel: `${AVC_PROFILE_NAME[profile]} ${level.id}`
	};
}

/**
 * AVC candidates for one resolution/fps, best first: High at the level the
 * stream actually needs, then Main at that level, then High one level up
 * (some Windows drivers only advertise the next tier), then Baseline as the
 * floor every encoder implements.
 */
export function avcCodecCandidates(options: {
	width: number;
	height: number;
	fps: number;
}): AvcCodecChoice[] {
	const levelIndex = avcLevelIndexFor(options);
	return [
		avcCodecString('high', levelIndex),
		avcCodecString('main', levelIndex),
		avcCodecString('high', levelIndex + 1),
		avcCodecString('baseline', levelIndex)
	];
}

/**
 * HEVC Main candidates. HEVC levels are defined on luma samples rather than
 * macroblocks, so this is a coarse ladder by pixel count — the probe is what
 * decides, and HEVC is only ever an optional tier.
 */
export function hevcCodecCandidates(options: {
	width: number;
	height: number;
	fps: number;
}): AvcCodecChoice[] {
	const pixels = options.width * options.height;
	const high = options.fps > 60 || pixels > 2560 * 1440;
	const ladder = high
		? [
				{ idc: 180, id: '6.0' },
				{ idc: 156, id: '5.2' },
				{ idc: 153, id: '5.1' }
			]
		: [
				{ idc: 153, id: '5.1' },
				{ idc: 123, id: '4.1' }
			];
	return ladder.map(level => ({
		codecString: `hvc1.1.6.L${level.idc}.B0`,
		profileLabel: `Main ${level.id}`
	}));
}

/**
 * VP9 profile-0 8-bit candidates, the WebM escape hatch. Chromium is lenient
 * about the level field, so the ladder is short and ends at the generic 1.0
 * string that every build accepts.
 */
export function vp9CodecCandidates(options: {
	width: number;
	height: number;
	fps: number;
}): AvcCodecChoice[] {
	const pixels = options.width * options.height;
	const level =
		pixels > 2560 * 1440
			? options.fps > 30
				? { code: '51', id: '5.1' }
				: { code: '50', id: '5.0' }
			: pixels > 1920 * 1080
				? { code: '50', id: '5.0' }
				: { code: '41', id: '4.1' };
	return [
		{
			codecString: `vp09.00.${level.code}.08`,
			profileLabel: `Profile 0 ${level.id}`
		},
		{ codecString: 'vp09.00.10.08', profileLabel: 'Profile 0' }
	];
}
