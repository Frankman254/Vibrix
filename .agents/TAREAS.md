# Vibrix — qué hacer ahora

> Fuente: [plan maestro](../docs/plans/PLAN_MAESTRO_LANZAMIENTO.md) §Fase 1 y
> [diseño as-built del export](../docs/architecture/OFFLINE_VIDEO_RENDERER_DESIGN.md).
> Actualiza este archivo al cerrar cada sub-fase. Contexto de la suite:
> [SUITE.md](SUITE.md).

## Fase 1 · Export de vídeo offline — **en curso**

| Sub-fase | Qué                                                                                       | Estado                                                                                             |
| -------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1A       | Fondo + spectrum + logo + audio → MP4, progreso, cancelar                                 | Implementado, **falta la prueba real del usuario** (canción de 3 min en VLC / QuickTime / YouTube) |
| 1B       | Letras Lyrixa en el export                                                                | Implementado (subsistema `lyrics`), falta verificar sincronía ±1 frame con un bundle real          |
| 1C       | Partículas, lluvia, Stage FX, Camera FX, overlays, fondo global, slideshow/escenas, Looks | **Implementado** — falta verificar letras con un bundle real y la paridad frame a frame (1E)       |
| 1D       | Presets YouTube/Shorts/Instagram, rango in/out                                            | Pendiente (ya hay selector de resolución y fps)                                                    |
| 1E       | Test de paridad offline vs preview                                                        | Pendiente                                                                                          |

### Siguiente paso concreto

0. **[TAREA_EXPORT_RAPIDO_AISLADO.md](TAREA_EXPORT_RAPIDO_AISLADO.md)**
   (fases A→F, un commit por fase, auditoría de Claude entre fases).
   **Fase A commiteada (`76e9d981`), Fase A.bis commiteada (`d9809cc6`),
   Fase C (audio por ventanas, §1.4) y el punto B.2 de Fase B (bitrate
   explícito en tabla + gate de almacenamiento honesto) commiteados en esta
   sesión** — todas esperan la auditoría de Claude. De Fase B quedan B.1
   (instrumentación/tabla), B.3 (`powerPreference` + `webglcontextlost` en
   `sceneGl.ts`) y B.4 (diagnóstico GPU/encoder en la tab). Sigue Fase D
   (tramos con pausa/reanudación, que reusa el sink OPFS).

1. Pedir al usuario el resultado de la prueba de 3 min (tiempo, peso, si
   reproduce, si el audio va sincronizado). Si falla, arreglar antes de 1C.
2. Medir el criterio "≤ 1,5× la duración" y apuntarlo aquí.
3. Verificar letras con un bundle Lyrixa real (sincronía ±1 frame y estilos).
4. ~~Memoria de 1 h: decodificar/analizar el audio por ventanas~~ — **hecho
   (Fase C)**: `video/offlineAudioTrack.ts`; el `AudioBuffer` entero se borró.

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
