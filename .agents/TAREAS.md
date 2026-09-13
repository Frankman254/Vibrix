# Vibrix — qué hacer ahora

> Fuente: [plan maestro](../docs/plans/PLAN_MAESTRO_LANZAMIENTO.md) §Fase 1 y
> [diseño as-built del export](../docs/architecture/OFFLINE_VIDEO_RENDERER_DESIGN.md).
> Actualiza este archivo al cerrar cada sub-fase. Contexto de la suite:
> [SUITE.md](SUITE.md).

## Fase 1 · Export de vídeo offline — **en curso**

| Sub-fase | Qué                                                                                       | Estado                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1A       | Fondo + spectrum + logo + audio → MP4, progreso, cancelar                                 | Implementado, **falta la prueba real del usuario** (canción de 3 min en VLC / QuickTime / YouTube)                     |
| 1B       | Letras Lyrixa en el export                                                                | Implementado (subsistema `lyrics`), falta verificar sincronía ±1 frame con un bundle real                              |
| 1C       | Partículas, lluvia, Stage FX, Camera FX, overlays, fondo global, slideshow/escenas, Looks | **En curso** — overlays, fondo global y slideshow hechos (verificados contra el preview); el resto avisa en el planner |
| 1D       | Presets YouTube/Shorts/Instagram, rango in/out                                            | Pendiente (ya hay selector de resolución y fps)                                                                        |
| 1E       | Test de paridad offline vs preview                                                        | Pendiente                                                                                                              |

### Siguiente paso concreto

1. Pedir al usuario el resultado de la prueba de 3 min (tiempo, peso, si
   reproduce, si el audio va sincronizado). Si falla, arreglar antes de 1C.
2. Medir el criterio "≤ 1,5× la duración" y apuntarlo aquí.
3. 1C, siguiente capa: Stage FX → Camera FX →
   partículas/lluvia (R3F, `WebGLRenderer` propio fuera de React).
   Cada capa que entra quita su aviso del planner y su test.
4. Memoria de 1 h: decodificar/analizar el audio por ventanas en vez del
   `AudioBuffer` entero.

### Propuesta pendiente de aprobar · looks "Showcase" de fábrica

Auditoría web ↔ producto del 2026-09-13
(`vibrix-web/.agents/AJUSTES_ALINEACION_VIBRIX.md`).

- Las 8 capturas del showcase de la web son renders reales de Vibrix, pero
  ningún preset ni slot de fábrica las reproduce.
- Propuesta: 8 slots de espectro de fábrica "Showcase · …" con los mismos
  ajustes: radial, scope, tunnel, liquid, orbital, spiral, linear blocks y
  pixel LED.
- Así la web puede prometer "a un clic" y regenerar las capturas o vídeos
  desde ahí.
- **No empezar sin el OK del usuario:** es contenido nuevo, no parte de la
  Fase 1.

### No hacer

- No subir a `0.5.0-alpha` hasta cumplir los criterios de salida del plan.
- No meter watermark ni licencias aquí: eso es Fase 4.
- No usar `getDisplayMedia` como atajo en este flujo.
