# Tarea — publicar el catálogo de autoría (Vía 2, Fase A)

> **Contrato:** [docs/features/VIBRIX_AUTHORING_CONTRACT.md](../docs/features/VIBRIX_AUTHORING_CONTRACT.md).
> Léelo antes que esto; aquí sólo está el **cómo** de este lado.
> El otro lado: `Lyrixa/.agents/TAREA_SECUENCIADOR.md`.
> Orden general: [docs/plans/PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md](../docs/plans/PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md).

## La puerta

Esto va **después del tag de congelación**, que depende del visto bueno del
usuario, no de esta lista. La [lista viva](TAREA_CONGELACION.md) está en cero
(F0–F3 cerradas), así que la puerta está en su mano.

**Lo que no hay que esperar:** Lyrixa no está bloqueada mientras tanto. Construye
contra el **fixture** del contrato, no contra un manifiesto vivo. Si empiezas
esta tarea y el fixture cambia, el que avisa es un test, no una conversación.

## A1 · `revisionOf` — el detector de cambios

**Dónde:** `src/features/scenes/slotRevision.ts` (nuevo) — zona `features`, puro,
sin React ni store.

**Qué:**

```ts
export function revisionOf(values: unknown | null): string;
export function manifestRevision(revisions: readonly string[]): string;
```

- `values: null` ⇒ `'empty'`.
- Serialización canónica con claves ordenadas en todos los niveles antes de
  hashear; si no, el orden de inserción mueve el hash y todo el mecanismo miente.
- Hash determinista en JS puro (FNV-1a o cyrb53) en hex. **No** `crypto.subtle`:
  es `async` y sólo de navegador, y esto tiene que correr en el suite de Node.
- **No toca el store.** No es una clave persistida ⇒ **no hay bump de
  `STORE_PERSIST_VERSION` ni migración** en toda esta tarea. Si acabas
  necesitando uno, algo se torció: vuelve al contrato, §`slotRevision`.

**Tests** (`slotRevision.test.ts`): mismo contenido con claves en otro orden ⇒
misma revisión; cambiar un valor ⇒ cambia; **renombrar no se ve** (el nombre no
entra); `null` ⇒ `'empty'`; anidamiento profundo; arrays donde el orden **sí**
cuenta; `manifestRevision` estable ante el orden de los slots de entrada.

## A2 · `buildAuthoringManifest` — el manifiesto

**Dónde:** `src/features/scenes/authoringManifest.ts` (nuevo).

```ts
export function buildAuthoringManifest(
	state: WallpaperState,
	exportedAt: string
): VibrixAuthoringManifest;
```

**Puro y total.** `exportedAt` se inyecta — sin reloj dentro, o el test no puede
comparar por valor. Sin azar, sin `Date.now()`, sin leer el store.

Recorre **exactamente** las familias de la tabla del contrato. Las dos reglas que
se olvidan:

- `calibrationProfileSlots` **no se publica**. Nunca.
- Un slot vacío se **lista** con `revision: 'empty'`, no se omite: Lyrixa tiene
  que poder explicar por qué una ranura está deshabilitada.

Los `bindings` de una escena salen de `SceneSlot`, traduciendo los tres estados
de `SceneSlotRef` (`src/types/wallpaper.ts:1006`): `'off'` ⇒ `"off"`, un id ⇒ el
id, **`null` ⇒ la clave no aparece**. Ausente y `"off"` significan cosas
distintas y el score las resuelve distinto; aplanarlos es el bug caro de esta
tarea.

**Tests** (`authoringManifest.test.ts`): el primero es **generar el fixture
literal del contrato y compararlo entero**. Después: que no aparezca ninguna
familia `calibration`; que una escena con ref `null` no traiga la clave; que una
con `'off'` sí; `background-zoom` con `sceneBindable: false`; `intro-window` con
`cueable: false`; y que `motion` no exista por ningún lado.

## A3 · Exportarlo e importarlo por archivo

**Por qué archivo y no HTTP:** el contrato lo explica con lo verificado — el
manifiesto sale del store del **navegador**, que el servidor no tiene, y la ruta
`/api/lyrics-bundle` contra la que apunta el puente de Lyrixa **no existe** en
`backend/server/src/index.mjs`. Un endpoint ahora sería andamio sin suelo.

- **Export:** `<proyecto>.vibrix-manifest.json`, en la pestaña que ya exporta
  proyecto (`src/features/export/`). Un botón, no una pestaña nueva.
- **Import del score:** `<proyecto>.vibrix-score.json`, por el mismo camino que
  el bundle de letras (`src/features/lyrics/domain/lyricsBundleLoader.ts` es el
  modelo a copiar: parser puro, valida, devuelve errores legibles, no revienta).
- **Importar un score no pisa el proyecto sin preguntar.** Es un riesgo que el
  doc de Lyrixa ya anota: va con `useDialog().confirm()`.

En esta fase importar un score **sólo lo valida y lo guarda** — informe de qué
cues entiende, qué familias no y qué slots no están. Evaluarlo es la Fase C y no
cabe aquí.

## Lo que NO entra

- **Nada de `resolveVisualStateAt`.** Es la Fase C, en su propia ventana, desde
  el tag. Mezclarla aquí es exactamente el «no feature creep durante un
  refactor» de AGENTS.md.
- **Nada de endpoints.** Cuando HTTP llegue, serán los mismos bytes.
- **Nada de pistas granulares en ninguna UI de aquí.** Vibrix publica el
  catálogo; componer es de Lyrixa.
- **Nada de tocar `activeImageSelection` ni `sceneSlot`.** Son la cirugía de la
  Fase C y están vetados mientras la congelación esté abierta.

## Criterio de salida

1. `buildAuthoringManifest` genera el fixture del contrato **byte a byte**.
2. Exportar el manifiesto de un proyecto real con tres escenas guardadas, y que
   Lyrixa lo importe y liste las tres.
3. Renombrar un slot en Vibrix, reexportar: **la revisión no cambia**. Cambiarle
   un valor: **sí cambia**, y Lyrixa marca el cue como `Updated in Vibrix`.
4. La suite entera verde (la lista de AGENTS.md), **sin** bump de
   `STORE_PERSIST_VERSION`.
