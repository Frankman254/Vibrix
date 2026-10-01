/**
 * «Enséñame la intro ahora», sin mover el reloj del tema.
 *
 * Configurar una ventana sin esto costaba llevar el playhead a la cabeza del
 * tema (o a su cola, para el ending) y rebobinar por cada ajuste, que es lo que
 * hacía la pestaña inservible para iterar.
 *
 * Es su PROPIO store y NO se persiste a propósito: un preview es un gesto, no
 * un ajuste. No debe sobrevivir a un reload, no debe viajar en el fichero de
 * proyecto y no debe costar un bump de `STORE_PERSIST_VERSION`.
 *
 * Y `features/export` no importa este módulo, ni debe hacerlo nunca: eso es lo
 * que garantiza que el archivo exportado se rija siempre por el reloj del tema.
 * Un preview corriendo cuando arranca un export no puede colar una ventana en
 * el fichero.
 */
import { create } from 'zustand';
import type { IntroSequenceKind } from '@/types/wallpaper';

export type IntroPreview = {
	kind: IntroSequenceKind;
	/** `performance.now()` del momento en que se abrió la ventana. */
	startedAtMs: number;
};

type IntroPreviewStore = {
	preview: IntroPreview | null;
	/** Abre un preview; pedir otro sustituye al que hubiera, nunca se solapan. */
	startIntroPreview: (kind: IntroSequenceKind, nowMs?: number) => void;
	stopIntroPreview: () => void;
};

export const useIntroPreviewStore = create<IntroPreviewStore>(set => ({
	preview: null,
	startIntroPreview: (kind, nowMs) =>
		set({
			preview: { kind, startedAtMs: nowMs ?? performance.now() }
		}),
	stopIntroPreview: () => set({ preview: null })
}));

/** El preview vivo, leído fuera de React — el bucle de render lo pregunta. */
export function getIntroPreview(): IntroPreview | null {
	return useIntroPreviewStore.getState().preview;
}

/** Cierra el preview desde fuera de React (lo hace el bucle al terminar). */
export function stopIntroPreview(): void {
	useIntroPreviewStore.getState().stopIntroPreview();
}
