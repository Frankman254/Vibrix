import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { Button } from '@/ui';
import BgSlideshowControls from './BgSlideshowControls';

export default function SlideshowHudControls() {
	const t = useT();
	const [open, setOpen] = useState(false);
	return (
		<div className="min-w-0 flex flex-col gap-2">
			<Button
				size="sm"
				variant="secondary"
				aria-expanded={open}
				onClick={() => setOpen(value => !value)}
			>
				{t.slideshow_edit_timing}
			</Button>
			{open && (
				<div className="max-h-[50vh] min-w-0 overflow-auto flex flex-col gap-2 p-2">
					<BgSlideshowControls />
				</div>
			)}
		</div>
	);
}
