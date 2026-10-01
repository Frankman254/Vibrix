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
	/**
	 * Segundo de la ventana en el que está congelada, o `null` si corre.
	 *
	 * Pausar es la razón de ser del preview tanto como reproducirlo: el cuadro
	 * se queda quieto pero el renderer sigue leyendo el estado vivo, así que
	 * mover un dial se ve EN ESE cuadro, al instante, sin esperar a que la
	 * ventana vuelva a pasar por ahí.
	 */
	pausedAtSec: number | null;
};

type IntroPreviewStore = {
	preview: IntroPreview | null;
	/** Abre un preview; pedir otro sustituye al que hubiera, nunca se solapan. */
	startIntroPreview: (kind: IntroSequenceKind, nowMs?: number) => void;
	/** Congela el cuadro actual. `elapsedSec` lo mide el bucle de render. */
	pauseIntroPreview: (elapsedSec: number) => void;
	/** Reanuda desde donde se quedó, no desde el principio. */
	resumeIntroPreview: (nowMs?: number) => void;
	stopIntroPreview: () => void;
};

export const useIntroPreviewStore = create<IntroPreviewStore>((set, get) => ({
	preview: null,
	startIntroPreview: (kind, nowMs) =>
		set({
			preview: {
				kind,
				startedAtMs: nowMs ?? performance.now(),
				pausedAtSec: null
			}
		}),
	pauseIntroPreview: elapsedSec => {
		const preview = get().preview;
		if (!preview || preview.pausedAtSec !== null) return;
		set({
			preview: {
				...preview,
				pausedAtSec: Math.max(0, elapsedSec)
			}
		});
	},
	resumeIntroPreview: nowMs => {
		const preview = get().preview;
		if (!preview || preview.pausedAtSec === null) return;
		// Rewind the start instead of restarting: the window picks up exactly
		// where the frozen frame left it.
		set({
			preview: {
				...preview,
				startedAtMs:
					(nowMs ?? performance.now()) - preview.pausedAtSec * 1000,
				pausedAtSec: null
			}
		});
	},
	stopIntroPreview: () => set({ preview: null })
}));

/** Seconds into the window a preview is showing, running or frozen. */
export function introPreviewElapsedSec(
	preview: IntroPreview,
	nowMs: number
): number {
	return preview.pausedAtSec !== null
		? preview.pausedAtSec
		: Math.max(0, (nowMs - preview.startedAtMs) / 1000);
}

/** El preview vivo, leído fuera de React — el bucle de render lo pregunta. */
export function getIntroPreview(): IntroPreview | null {
	return useIntroPreviewStore.getState().preview;
}

/** Cierra el preview desde fuera de React (lo hace el bucle al terminar). */
export function stopIntroPreview(): void {
	useIntroPreviewStore.getState().stopIntroPreview();
}
