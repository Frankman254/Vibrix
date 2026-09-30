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
		setlistIntroFallback: null,
		setlists: [
			{
				id: 'set-1',
				name: 'Show',
				imageAssetIds: [],
				trackIds: [],
				createdAt: 0,
				introSlotId: null
			},
			{
				id: 'set-2',
				name: 'Other show',
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

/**
 * A setlist is a curation, never a destructive edit. Its intro has to obey the
 * same rule: whatever the show installs, leaving it gives the project back.
 */
describe('a bound setlist never eats the project intro', () => {
	beforeEach(() => {
		useWallpaperStore.setState(freshState());
	});

	/** Slot 0 = 'THE SHOW', bound to set-1, with 'global' left on screen. */
	function bindShowToSet1() {
		store().setIntroSequence('intro', { titleText: 'THE SHOW' });
		store().setIntroSequence('outro', { titleText: 'THE END' });
		store().saveIntroProfileSlot(0);
		store().setIntroSequence('intro', { titleText: 'global' });
		store().setIntroSequence('outro', { titleText: 'global end' });
		store().bindSetlistIntroSlot('set-1', store().introProfileSlots[0].id);
	}

	it('gives the project windows back when the setlist is deactivated', () => {
		bindShowToSet1();
		store().setActiveSetlistId('set-1');
		expect(store().introSequence.titleText).toBe('THE SHOW');

		store().setActiveSetlistId(null);
		expect(store().introSequence.titleText).toBe('global');
		expect(store().outroSequence.titleText).toBe('global end');
		expect(store().setlistIntroFallback).toBeNull();
	});

	it('does not leak one setlist intro into the next, unbound one', () => {
		bindShowToSet1();
		store().setActiveSetlistId('set-1');
		store().setActiveSetlistId('set-2');
		expect(store().introSequence.titleText).toBe('global');
	});

	it('parks the project windows once across a chain of bound setlists', () => {
		bindShowToSet1();
		store().setIntroSequence('intro', { titleText: 'ENCORE' });
		store().saveIntroProfileSlot(1);
		store().setIntroSequence('intro', { titleText: 'global' });
		store().bindSetlistIntroSlot('set-2', store().introProfileSlots[1].id);

		store().setActiveSetlistId('set-1');
		store().setActiveSetlistId('set-2');
		expect(store().introSequence.titleText).toBe('ENCORE');
		// The park still holds the PROJECT's windows, not set-1's.
		expect(store().setlistIntroFallback?.introSequence.titleText).toBe(
			'global'
		);

		store().setActiveSetlistId(null);
		expect(store().introSequence.titleText).toBe('global');
	});

	it('applies a binding made while its setlist is already active', () => {
		store().setIntroSequence('intro', { titleText: 'THE SHOW' });
		store().saveIntroProfileSlot(0);
		store().setIntroSequence('intro', { titleText: 'global' });
		store().setActiveSetlistId('set-1');

		store().bindSetlistIntroSlot('set-1', store().introProfileSlots[0].id);
		expect(store().introSequence.titleText).toBe('THE SHOW');

		// Unbinding it puts the project's windows straight back.
		store().bindSetlistIntroSlot('set-1', null);
		expect(store().introSequence.titleText).toBe('global');
		expect(store().setlistIntroFallback).toBeNull();
	});

	it('does not touch the windows when binding an inactive setlist', () => {
		store().setIntroSequence('intro', { titleText: 'THE SHOW' });
		store().saveIntroProfileSlot(0);
		store().setIntroSequence('intro', { titleText: 'global' });
		store().setActiveSetlistId('set-2');

		store().bindSetlistIntroSlot('set-1', store().introProfileSlots[0].id);
		expect(store().introSequence.titleText).toBe('global');
	});

	it('restores the project windows when the active setlist is deleted', () => {
		bindShowToSet1();
		store().setActiveSetlistId('set-1');
		store().deleteSetlist('set-1');
		expect(store().activeSetlistId).toBeNull();
		expect(store().introSequence.titleText).toBe('global');
		expect(store().setlistIntroFallback).toBeNull();
	});
});
