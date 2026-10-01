import { IntroSequenceTab } from '@/features/intro/ui';

/**
 * The intro / ending tab.
 *
 * A pass-through on purpose: the tab's header carries the master switch of the
 * window you are looking at, and which window that is only the feature knows —
 * so the feature owns the whole `EditorTabLayout`, header included. Wrapping it
 * here again bought a second title row and a decorative icon above it.
 */
export default function IntroTab() {
	return <IntroSequenceTab />;
}
