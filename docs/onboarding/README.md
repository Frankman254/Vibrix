# Onboarding — Entender el código de cero a complejo

Esta carpeta es una **ruta de aprendizaje progresiva** de **Vibrix**. Está
pensada para leerse en orden: cada nivel
asume lo del anterior y sube en complejidad.

No es una guía de "cómo usar la app". Es una guía de **cómo está hecho el
código y cómo pensarlo** — para que puedas ubicar cualquier feature sin abrir
40 archivos a ciegas, y para atacar la deuda técnica con un mapa real.

> **Estilo de la serie:** está escrita **asumiendo cero conocimiento de
> programación**. Cada término técnico se explica con analogías del mundo real
> la primera vez que aparece. Si algo sigue sin entenderse, es para mejorarlo:
> avísame.

> Fecha de la serie: 2026-06 · Versión del proyecto: `0.3.0-alpha` ·
> `STORE_PERSIST_VERSION = 117` (see `src/lib/version.ts`).

---

## Cómo usar esta ruta

- **Si nunca tocaste el repo:** lee `00` y `01`, y vuelve aquí.
- **Si vas a tocar un subsistema:** lee `00` (mapa) + el nivel de ese
  subsistema.
- **Si vas a refactorizar / pagar deuda:** lee `06` al final, pero solo
  después de entender `01` y `02`.

Regla de oro del proyecto (directiva de consolidación): **un feature a la vez,
identifica el subsistema dueño antes de tocar nada, sin expandir el scope.**
Esta doc existe justamente para que sepas _quién es el dueño_ de cada cosa.

---

## Índice de niveles

| Nivel | Documento                                          | Qué cubre                                                                                                                 | Estado   |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| 00    | [`00-fundamentos.md`](./00-fundamentos.md)         | Qué es, stack, modelo mental de 4 capas, flujo de arranque real, mapa del repo, glosario                                  | ✅ Listo |
| 01    | [`01-estado-y-store.md`](./01-estado-y-store.md)   | El store Zustand: 12 slices, `wallpaper.ts` types, persist + migraciones (v85), IndexedDB de assets                       | ✅ Listo |
| 02    | [`02-pipeline-render.md`](./02-pipeline-render.md) | `layers.ts` → `WallpaperViewport` → renderers. Los 3 pipelines (DOM / Canvas 2D / WebGL) y orden de composición           | ✅ Listo |
| 03    | [`03-audio.md`](./03-audio.md)                     | `AudioDataContext` como orquestador, los 3 adapters (desktop/mic/file), bins/canales, playlist, envelopes, calibración    | ✅ Listo |
| 04    | [`04-spectrum-engine.md`](./04-spectrum-engine.md) | El motor de spectrum en `features/spectrum/` (familias, registry, runtime, frame effects, el clon, drive modes)           | ✅ Listo |
| 05    | [`05-subsistemas.md`](./05-subsistemas.md)         | Lyrics/Lyrixa, stageFx (lights/camera), motion (partículas/lluvia), perfiles/scenes/setlists, export, design system `ui/` | ✅ Listo |
| 06    | [`06-deuda-tecnica.md`](./06-deuda-tecnica.md)     | Mapa honesto de deuda: sin tests, monolito del estado, duplicación BG, techo de rendimiento, riesgos al tocar             | ✅ Listo |

La serie está completa (2026-06). Si el código evoluciona y un dato deja de
ser cierto, se corrige aquí — esta serie es la fuente actual.

---

## Relación con la doc existente (`docs/`)

Hay documentación previa que **sigue siendo útil pero está parcialmente
desactualizada** (escrita en 2026-04, antes de varios refactors grandes):

- `docs/ARQUITECTURA_GENERAL.md` — buen mapa de sistema, pero **no menciona**
  `src/features/`, el design system `src/ui/`, ni el split del store en 13
  slices. Úsalo como referencia histórica, no como verdad actual.
- `docs/AUDIO_RENDER_Y_SHADERS.md` — notas de audio/render/efectos.
- `docs/product/V1_ALPHA_SCOPE.md` — alcance/estado actual de la alpha (0.3.0-alpha.1).
- `docs/archive/ESTADO_PROYECTO_0_2_0.md` — estado a 0.2.0 (histórico, atrasado).
- `docs/archive/SPECTRUM_ENGINE.md` — referencia del motor de spectrum (histórico).
- `docs/status/` y `docs/plans/` — handoffs y roadmaps por feature.

Esta serie `onboarding/` es la fuente **actual y pedagógica**. Cuando un dato
de aquí contradiga la doc vieja, gana esta.
