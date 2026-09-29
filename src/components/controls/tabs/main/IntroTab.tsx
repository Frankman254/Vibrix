import { Clapperboard } from 'lucide-react';
import { EditorTabHeader, EditorTabLayout, ICON_SIZE, UI_COLORS } from '@/ui';
import { useT } from '@/lib/i18n';
import { IntroSequenceTab } from '@/features/intro/ui';

export default function IntroTab() {
	const t = useT();

	return (
		<EditorTabLayout
			header={
				<EditorTabHeader
					title={t.tab_intro}
					subtitle={t.intro_subtitle}
				>
					<Clapperboard
						size={ICON_SIZE.sm}
						style={{ color: UI_COLORS.accent }}
					/>
				</EditorTabHeader>
			}
		>
			<IntroSequenceTab />
		</EditorTabLayout>
	);
}
