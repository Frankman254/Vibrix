# Plan coordinado — Vibrix renderer + Lyrixa secuenciador

> Revisión del 2026-10-13. Sustituye el orden de congelación escrito en
> septiembre: el manifiesto, el paquete de autoría y el evaluador puro ya
> existen. La tarea ahora es cerrar el circuito entre ambos repos.

## Resultado de producto

Vibrix prepara imágenes, escenas, slots, efectos y transiciones. Lyrixa recibe
ese catálogo y coloca activaciones en la canción. Vibrix importa el score,
reproduce la secuencia y genera el mismo resultado en el export offline.

```text
Vibrix                         Lyrixa
  crea objetos visuales          importa catálogo + previews
  exporta .vibrix-authoring ───▶ coloca activaciones por carril
  importa .vibrix-score      ◀─── exporta score + dependencias usadas
  preview / Play / seek
  export offline
```

Un cue v2 sólo guarda `startTimeMs`. Permanece activo hasta el siguiente cue
del mismo carril o el final del audio. Image y Scene son agregados; los carriles
granulares pueden sobrescribir una familia y `inherit` vuelve a entregar esa
familia a los agregados.

## Estado comprobado, no estado deseado

### Vibrix

- Publica `.vibrix-authoring` con manifiesto schema v2, snapshots de slots e
  imágenes y previews transportables.
- Lee y revisa score v1/v2, incluidos `image`, `scene`, `feature-slot` e
  `inherit`.
- Tiene `resolveVisualStateAt(base, score, T)` puro y probado.
- El evaluador no dirige el viewport ni el export offline.
- El score todavía no vive en el store; `STORE_PERSIST_VERSION` es 152.
- La transición de imagen ya usa la configuración saliente y el reloj absoluto
  del score dentro del evaluador puro.
- Sólo importa el score JSON legacy, no el contenedor `.vibrix-score`.

### Lyrixa

- Tiene dominio v1, parser de `.vibrix-manifest.json`, comparación de revisiones,
  catálogo Scene, `Add at playhead`, drag, una pista Scene y export
  `.vibrix-score.json`.
- Sus cues guardan `startTimeMs` + `endTimeMs` y nacen con ocho segundos.
- No abre `.vibrix-authoring`, no lee schema v2 ni publica `.vibrix-score`.
- No conoce imágenes, carriles granulares ni `inherit`.
- Su árbol tiene trabajo local de exports de letra y refactor del editor. Ese
  trabajo se preserva y se valida por separado; no se mezcla con la migración
  del secuenciador.

## Dos colas paralelas

Los repos pueden avanzar a la vez porque comparten contrato y fixtures, no
archivos fuente. Cada paso debe ser revisable por sí mismo.

### Cola W · Vibrix

| Paso  | Entrega                                                                  | Dependencia |
| ----- | ------------------------------------------------------------------------ | ----------- |
| W1 ✅ | Progreso de transición de imagen en tiempo absoluto dentro del evaluador | Ninguna     |
| W2    | Score/base/mode Compose persistidos; store 152→153 y migración           | W1          |
| W3    | Preview, Play y seek consumen `resolveVisualStateAt`                     | W2          |
| W4    | Export offline consume el mismo estado resuelto                          | W3          |
| W5    | Import del contenedor `.vibrix-score`; JSON queda legacy                 | Paquete L5  |

El cambio peligroso empieza en W3. Antes de tocar el runtime, la base congelada
y el score deben tener dueño y ciclo de vida claros. W4 reutiliza el camino de
W3; no se implementa otro pliegue en `features/export`.

### Cola L · Lyrixa

| Paso | Entrega                                                             | Dependencia     |
| ---- | ------------------------------------------------------------------- | --------------- |
| L1   | Parser de `.vibrix-authoring` y manifiestos JSON v1/v2              | Contrato actual |
| L2   | Dominio score v2; migración aditiva de proyectos v1                 | L1              |
| L3   | Image, Scene y carriles granulares con bloques de duración derivada | L2              |
| L4   | Catálogo con previews, drag, `Add at playhead` e `inherit`          | L3              |
| L5   | `.vibrix-score` con score y sólo dependencias referenciadas         | L4              |

L1 empieza por código puro y fixtures. La UI actual continúa leyendo proyectos
v1 durante L1/L2. La migración elimina la edición manual de `endTimeMs` en
proyectos nuevos; el ancho visual se deriva del siguiente corte.

## Puntos de encuentro

1. **Después de L1:** un paquete real exportado por Vibrix abre desconectado en
   Lyrixa, sin URLs `blob:` ni acceso a la IndexedDB de Vibrix.
2. **Después de L2/W2:** ambos parsers aceptan el mismo score v2 y conservan v1.
3. **Después de L5/W3:** Vibrix importa un score real y el viewport responde a
   Play y seek.
4. **Después de W4:** el frame offline coincide con el preview en cada corte y
   durante las transiciones.

El contrato que manda es
[VIBRIX_AUTHORING_CONTRACT.md](../features/VIBRIX_AUTHORING_CONTRACT.md). Un
cambio de forma se hace primero allí y después en los fixtures de ambos repos.

## Disciplina para no volver a desviarse

- Compose tiene prioridad hasta pasar la puerta de salida.
- Un bug entra delante sólo si bloquea edición, importación, reproducción o
  export del caso de integración.
- Export rápido, presets, Showcase, Pixel Art y polish visual quedan en pausa.
- Un dominio por cambio: parser, persistencia, runtime y export no comparten
  commit.
- Cada documento de tareas termina con un siguiente archivo o módulo concreto;
  “conectar después” no cuenta como plan.

## Puerta de salida compartida

El fixture real debe colocar:

1. Image A en `00:00` e Image B en `03:00`.
2. Scene A en `00:00` y Scene B en `01:00`.
3. Spectrum 2 en `01:30` e `inherit` en `02:00`.

Pasa cuando:

- el bloque de cada activación llega visualmente al siguiente corte;
- seek a cualquier corte da el mismo frame que reproducir desde cero;
- la transición de Image A a Image B usa la configuración guardada en A;
- el override de Spectrum 2 sobrevive a Scene B y `inherit` lo libera;
- preview y export offline coinciden;
- cerrar y volver a abrir los paquetes no pierde ids, revisiones, previews ni
  dependencias usadas.

## Primer movimiento en cada repo

- **Vibrix:** W2 en `src/store/`: sesión Compose, store 152→153 y migración.
- **Lyrixa:** L1 en `src/core/composition/`, empezando por el parser del paquete
  y el fixture v2 antes de tocar componentes React.
