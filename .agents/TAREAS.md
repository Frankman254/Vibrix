# Vibrix — qué hacer ahora

> Actualizado el 2026-10-14 después de conectar Compose al viewport. Contexto
> completo:
> [TAREA_COMPOSE_TIMELINE.md](TAREA_COMPOSE_TIMELINE.md) y
> [PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md](../docs/plans/PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md).

## Objetivo activo: cerrar Compose con Lyrixa

Vibrix es el **preparador y renderer**: guarda imágenes, escenas, slots,
transiciones y efectos, publica esos objetos y reproduce el resultado. Lyrixa
es el **secuenciador**: decide qué objeto se activa y en qué instante.

El trabajo de bugs y export offline de las últimas semanas fue útil, pero dejó
este circuito a medio conectar. Desde ahora Compose vuelve a ser la prioridad.
Sólo interrumpe esta cola una regresión que impida editar, reproducir, importar
o exportar el caso de integración.

## Estado real

| Pieza                                                              | Estado                           |
| ------------------------------------------------------------------ | -------------------------------- |
| Export `.vibrix-authoring` con manifiesto v2, snapshots y previews | Hecho                            |
| Parser/revisión de scores v1 y v2                                  | Hecho                            |
| Activaciones `scene`, `image`, `feature-slot` e `inherit`          | Hecho en dominio puro            |
| `resolveVisualStateAt(base, score, T)` determinista                | Hecho y conectado al viewport    |
| Transición temporal entre imágenes                                 | Hecha en el evaluador puro       |
| Score persistido y modo Compose                                    | Hecho; store v153 + confirmación |
| Preview, Play y seek consumiendo el score                          | Hecho                            |
| Export offline consumiendo el mismo estado                         | Pendiente                        |
| Import del contenedor `.vibrix-score`                              | Hecho; conserva JSON legacy      |

`STORE_PERSIST_VERSION` está en **153**. La migración abre proyectos anteriores
sin score y bajo control temporal manual.

## Orden de implementación en Vibrix

Un dominio y un commit por paso:

1. ✅ **W1 · Transición de imagen pura.** El evaluador usa la transición de la
   imagen saliente, el tiempo absoluto del cue y un id determinista. Hay casos
   de seek dentro y fuera de la transición.
2. ✅ **W2 · Sesión Compose persistida.** Score, base congelada y estado
   enabled/disabled; store 152→153 con migración. Activar Compose pide
   confirmación porque sustituye el control temporal manual.
3. ✅ **V2.2b · Paquete de score.** Abrir `.vibrix-score`, usar snapshots y
   previews autocontenidos, conservar `.vibrix-score.json` y excluir cues de
   carriles apagados durante revisión y cierre.
4. ✅ **W3 · Preview, Play y seek.** Conecta `resolveVisualStateAt` al viewport sin
   encadenar mutaciones históricas del store. El mismo `T` debe producir el
   mismo estado después de seek y de reproducción continua.
5. **W4 · Export offline.** Alimentar `renderFrameAt` con el mismo estado
   resuelto. No crear un segundo evaluador dentro de `features/export`.
6. **Integración real.** Importar un score producido por Lyrixa con dos
   imágenes, dos escenas, Spectrum 2 y un `inherit`; comprobar cortes,
   transiciones, seek, Play y export.

### Siguiente paso concreto

Empieza por **W4** en el export offline: entrega a `renderFrameAt` el resultado
de `resolveVisualStateAt(composeBaseState, composeScore, timeMs)` cuando Compose
esté activo. Hidrata los mismos assets y no dupliques el evaluador.

## Trabajo que queda en Lyrixa, en paralelo

Lyrixa completó L1–L5: importa `.vibrix-authoring`, secuencia score v2 con Image,
carriles granulares e `inherit`, y exporta `.vibrix-score` autocontenido con sólo
las dependencias usadas.

La coordinación entre repos se hace por el contrato
[VIBRIX_AUTHORING_CONTRACT.md](../docs/features/VIBRIX_AUTHORING_CONTRACT.md) y
sus fixtures. No se copian tipos a mano sin actualizar contrato y tests.

## Trabajo en pausa

- Fases restantes de `TAREA_EXPORT_RAPIDO_AISLADO.md` que no bloqueen W1–W5.
- Presets de plataforma, polish Pixel Art y contenido Showcase.
- Transporte HTTP, nube, cuentas y colaboración.
- Nuevos efectos que no formen parte del score actual.

La QA de export de larga duración sigue pendiente, pero no vuelve a desplazar
Compose. Se retoma después de W4, cuando el export ya consuma el score real.

## Puerta de salida

No declarar cerrado hasta que un score real de Lyrixa cumpla todo esto:

1. Image A en `00:00`, Image B en `03:00`.
2. Scene A en `00:00`, Scene B en `01:00`.
3. Spectrum 2 en `01:30`, `inherit` en `02:00`.
4. Seek a cada corte produce el mismo frame que reproducir desde cero.
5. Preview y export offline coinciden en cortes y transiciones.
6. El paquete se puede volver a abrir sin depender de URLs `blob:` ni del store
   del navegador que lo creó.

## Antes de cerrar cada paso

```bash
pnpm format
pnpm lint
pnpm architecture:check
pnpm structure:check
pnpm docs:check
pnpm i18n:check
pnpm test:types
pnpm test:run
pnpm build
```
