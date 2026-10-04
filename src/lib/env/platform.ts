/**
 * Which desktop platform the browser is running on.
 *
 * Used by the video export to *prioritise* encoder candidates — never to
 * assume a codec exists. Windows machines get H.264 first because that is
 * what Media Foundation exposes; the actual decision still comes from
 * `VideoEncoder.isConfigSupported()`. A wrong guess here costs a few extra
 * probes, not a failed export.
 */

export type RuntimePlatform = 'windows' | 'macos' | 'linux' | 'other';

type NavigatorUAData = {
	platform?: string;
	getHighEntropyValues?: (
		hints: string[]
	) => Promise<{ platform?: string; platformVersion?: string }>;
};

function navigatorUAData(): NavigatorUAData | undefined {
	if (typeof navigator === 'undefined') return undefined;
	return (navigator as Navigator & { userAgentData?: NavigatorUAData })
		.userAgentData;
}

/**
 * Coarse platform from the lowest-entropy hint available. `userAgentData`
 * first (Chromium froze `navigator.platform`), then the legacy fields.
 */
export function classifyPlatform(raw: string): RuntimePlatform {
	const value = raw.toLowerCase();
	if (/win/.test(value)) return 'windows';
	if (/mac|iphone|ipad|ipod/.test(value)) return 'macos';
	// Android reports "Linux armv8l" in `platform`; both want the same
	// Linux-style WebCodecs ordering, so they are not separated here.
	if (/linux|android|cros|x11/.test(value)) return 'linux';
	return 'other';
}

export function detectRuntimePlatform(): RuntimePlatform {
	if (typeof navigator === 'undefined') return 'other';
	const hints = [
		navigatorUAData()?.platform ?? '',
		navigator.platform ?? '',
		navigator.userAgent ?? ''
	];
	for (const hint of hints) {
		if (!hint) continue;
		const platform = classifyPlatform(hint);
		if (platform !== 'other') return platform;
	}
	return 'other';
}

const PLATFORM_NAMES: Record<RuntimePlatform, string> = {
	windows: 'Windows',
	macos: 'macOS',
	linux: 'Linux',
	other: ''
};

export function platformName(platform: RuntimePlatform): string {
	return PLATFORM_NAMES[platform];
}

/**
 * Windows 11 reports itself as Windows 10 in the user-agent string; only the
 * high-entropy `platformVersion` separates them (major >= 13 is Windows 11).
 * Purely cosmetic — the export never branches on the version.
 */
export async function resolvePlatformLabel(): Promise<string> {
	const platform = detectRuntimePlatform();
	const base = platformName(platform);
	const uaData = navigatorUAData();
	if (platform !== 'windows' || !uaData?.getHighEntropyValues) return base;
	try {
		const detail = await uaData.getHighEntropyValues(['platformVersion']);
		const major = Number.parseInt(detail.platformVersion ?? '', 10);
		if (!Number.isFinite(major)) return base;
		return major >= 13 ? `${base} 11` : `${base} 10`;
	} catch {
		return base;
	}
}
