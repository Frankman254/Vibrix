# Relevo de Vibrix

> Actualizado el 2026-10-14. Empieza aquí, sigue con
> [TAREAS.md](TAREAS.md) y después lee
> [TAREA_COMPOSE_TIMELINE.md](TAREA_COMPOSE_TIMELINE.md).

## Cómo trabaja el usuario

- Responde y documenta en español; código y comentarios en inglés.
- Trabaja directo sobre `main`, sin push. Haz commit sólo cuando el usuario lo
  pida o la sesión ya tenga esa autorización.
- Usa `pnpm`; `pnpm-lock.yaml` es el único lockfile.
- Un dominio por cambio. No aproveches Compose para refactorizar otro sistema.
- Antes de decir “listo”, ejecuta la batería indicada al final de `TAREAS.md`.

## Norte de producto

Vibrix prepara y renderiza la experiencia visual. Lyrixa ordena esos objetos en
el tiempo. El intercambio final es:

```text
Vibrix ── proyecto.vibrix-authoring ──▶ Lyrixa
Vibrix ◀──── proyecto.vibrix-score ──── Lyrixa
```

Lyrixa no edita shaders, slots ni transiciones internas. Vibrix no se convierte
en editor de timeline. Un cue coloca una activación en `startTimeMs` y ésta se
mantiene hasta la siguiente activación del carril o hasta el final del audio.

## Estado comprobado

Vibrix ya exporta `.vibrix-authoring` con manifiesto schema v2, snapshots de
slots e imágenes y previews transportables. El lector acepta el contenedor
`.vibrix-score` autocontenido y el sobre JSON legacy; revisa v1/v2 con snapshots
y previews del paquete sin depender del proyecto vivo.

`src/features/composition/resolveVisualStateAt.ts` ya resuelve de forma pura el
estado visual en un instante. Sus tests cubren orden, overrides sostenidos,
`inherit`, transición de imagen y seek determinista. El score y su base
congelada se guardan como sesión Compose. W3 conecta el viewport al reloj
absoluto de audio para Play y seek; el export offline todavía no la consume.

El historial posterior se concentró en bugs, slideshow, storage, WebGL, Stage
FX, proyecto demo y export. Esos cambios no cierran Compose. La tarea activa es
conectar el dominio ya construido, no volver a diseñarlo.

## Próximo movimiento

**W1, W2, V2.2b y W3 están implementados:** la transición es determinista, la
sesión persiste bajo store v153 y el viewport resuelve desde la base congelada
con el reloj de audio. El siguiente paso es **W4**: alimentar el export offline
con el mismo evaluador.

Lyrixa completó L1–L5 y ya produce el paquete v2 autocontenido. Queda ejecutar
la fixture cruzada real cuando W4 cierre la paridad con export.

## Reglas técnicas que no se negocian

- `types/`, `ui/` y `lib/` son hojas; `features/*` no importa `components/` ni
  `pages/`; `store/` no importa presentación.
- Toda clave persistida nueva exige bump de `STORE_PERSIST_VERSION` y migración.
  El valor actual es 153.
- Toda acción destructiva espera `useDialog().confirm()`.
- Los textos visibles pasan por i18n.
- Preview y export offline deben consumir el mismo evaluador y la misma base.
- Las pruebas Node no importan módulos que carguen `.glsl`; extrae lógica pura.

## Documentos que mandan

- [VIBRIX_AUTHORING_CONTRACT.md](../docs/features/VIBRIX_AUTHORING_CONTRACT.md):
  contrato de paquetes, manifiesto, score y fixtures.
- [TAREA_COMPOSE_TIMELINE.md](TAREA_COMPOSE_TIMELINE.md): modelo funcional y
  criterios de salida.
- [PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md](../docs/plans/PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md):
  orden coordinado de ambos repos.
- [CURRENT_SYSTEM_STATUS.md](../docs/status/CURRENT_SYSTEM_STATUS.md): estado
  as-built; actualízalo cuando un paso cambie de pendiente a implementado.

## Al cerrar una sesión

Actualiza `TAREAS.md`, este relevo y el estado técnico afectado. Registra qué
paso W se completó, qué validaste y cuál es la siguiente acción concreta. No
vuelvas a dejar “conectar después” sin indicar el primer importador real del
evaluador.
