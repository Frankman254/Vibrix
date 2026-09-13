# Vibrix — qué hacer ahora

> Fuente: [plan maestro](../docs/plans/PLAN_MAESTRO_LANZAMIENTO.md) §Fase 1 y
> [diseño as-built del export](../docs/architecture/OFFLINE_VIDEO_RENDERER_DESIGN.md).
> Actualiza este archivo al cerrar cada sub-fase. Contexto de la suite:
> [SUITE.md](SUITE.md).

## Fase 1 · Export de vídeo offline — **en curso**

| Sub-fase | Qué                                                                            | Estado                                                                                             |
| -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1A       | Fondo + spectrum + logo + audio → MP4, progreso, cancelar                      | Implementado, **falta la prueba real del usuario** (canción de 3 min en VLC / QuickTime / YouTube) |
| 1B       | Letras Lyrixa en el export                                                     | Implementado (subsistema `lyrics`), falta verificar sincronía ±1 frame con un bundle real          |
| 1C       | Partículas, lluvia, Stage FX, overlays, fondo global, slideshow/escenas, Looks | Pendiente — hoy el planner avisa de cada una                                                       |
| 1D       | Presets YouTube/Shorts/Instagram, rango in/out                                 | Pendiente (ya hay selector de resolución y fps)                                                    |
| 1E       | Test de paridad offline vs preview                                             | Pendiente                                                                                          |

### Siguiente paso concreto

1. Pedir al usuario el resultado de la prueba de 3 min (tiempo, peso, si
   reproduce, si el audio va sincronizado). Si falla, arreglar antes de 1C.
2. Medir el criterio "≤ 1,5× la duración" y apuntarlo aquí.
3. 1C empezando por lo más barato: overlays (2D) → fondo global → slideshow →
   Stage FX → partículas/lluvia (R3F, `WebGLRenderer` propio fuera de React).
   Cada capa que entra quita su aviso del planner y su test.
4. Memoria de 1 h: decodificar/analizar el audio por ventanas en vez del
   `AudioBuffer` entero.

### No hacer

- No subir a `0.5.0-alpha` hasta cumplir los criterios de salida del plan.
- No meter watermark ni licencias aquí: eso es Fase 4.
- No usar `getDisplayMedia` como atajo en este flujo.
