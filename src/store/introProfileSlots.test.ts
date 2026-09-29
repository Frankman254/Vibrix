import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => void mem.set(k, v),
	removeItem: (k: string) => void mem.delete(k),
	clear: () => void mem.clear()
};

const { useWallpaperStore } = await import('@/store/wallpaperStore');
const { DEFAULT_STATE } = await import('@/store/defaultState');

const store = () => useWallpaperStore.getState();

function freshState() {
	return {
		...DEFAULT_STATE,
		introSequence: { ...DEFAULT_STATE.introSequence },
		outroSequence: { ...DEFAULT_STATE.outroSequence },
		introProfileSlots: DEFAULT_STATE.introProfileSlots.map(slot => ({
			...slot
		})),
		setlists: [
			{
				id: 'set-1',
				name: 'Show',
				imageAssetIds: [],
				trackIds: [],
				createdAt: 0,
				introSlotId: null
			}
		],
		activeSetlistId: null
	};
}

describe('intro profile slots', () => {
	beforeEach(() => {
		useWallpaperStore.setState(freshState());
	});

	it('saves both windows into one slot and loads them back', () => {
		store().setIntroSequence('intro', { titleText: 'OPENING' });
		store().setIntroSequence('outro', { titleText: 'CLOSING' });
		store().saveIntroProfileSlot(0);
		store().setIntroSequence('intro', { titleText: 'something else' });
		store().setIntroSequence('outro', { titleText: 'something else' });
		store().loadIntroProfileSlot(0);
		expect(store().introSequence.titleText).toBe('OPENING');
		expect(store().outroSequence.titleText).toBe('CLOSING');
	});

	it('ignores a load from an empty slot', () => {
		store().setIntroSequence('intro', { titleText: 'untouched' });
		store().loadIntroProfileSlot(1);
		expect(store().introSequence.titleText).toBe('untouched');
	});

	it('adds slots and protects the first three from deletion', () => {
		const before = store().introProfileSlots.length;
		store().addIntroProfileSlot();
		expect(store().introProfileSlots).toHaveLength(before + 1);
		store().removeIntroProfileSlot(0);
		expect(store().introProfileSlots).toHaveLength(before + 1);
		store().removeIntroProfileSlot(before);
		expect(store().introProfileSlots).toHaveLength(before);
	});

	it('applies the bound slot when its setlist is activated', () => {
		store().setIntroSequence('intro', { titleText: 'THE SHOW' });
		store().saveIntroProfileSlot(0);
		const slotId = store().introProfileSlots[0].id;
		store().setIntroSequence('intro', { titleText: 'global' });
		store().bindSetlistIntroSlot('set-1', slotId);
		store().setActiveSetlistId('set-1');
		expect(store().introSequence.titleText).toBe('THE SHOW');
	});

	it('leaves the windows alone for an unbound setlist', () => {
		store().setIntroSequence('intro', { titleText: 'global' });
		store().setActiveSetlistId('set-1');
		expect(store().introSequence.titleText).toBe('global');
	});
});
