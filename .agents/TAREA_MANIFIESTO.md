# Tarea — publicar el catálogo de autoría (Vía 2, Fase A)

> **Contrato:** [docs/features/VIBRIX_AUTHORING_CONTRACT.md](../docs/features/VIBRIX_AUTHORING_CONTRACT.md).
> Léelo antes que esto; aquí sólo está el **cómo** de este lado.
> El otro lado: `Lyrixa/.agents/TAREA_SECUENCIADOR.md`.
> Orden general: [docs/plans/PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md](../docs/plans/PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md).

> **HECHA — 2026-10-02.** A1, A2 y A3 están en código con 54 tests nuevos, y el
> circuito se verificó contra el **parser real de Lyrixa**, no contra este doc.
> Lo que sigue abierto es la Fase C (`resolveVisualStateAt`), en su propia
> ventana. Las desviaciones respecto a lo que pedía esta tarea están marcadas
> abajo con **Cómo salió**; ninguna cambia el contrato de archivo.

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
	state: AuthoringManifestSource,
	options: { exportedAt: string; projectName: string }
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

**Cómo salió:** dos desviaciones, las dos a favor.

- `projectName` se inyecta junto a `exportedAt`, porque **no existe en el
  store**: hoy es estado local de `ProjectLibrarySection.tsx`. Inventarlo dentro
  habría sido adivinar.
- El parámetro es `AuthoringManifestSource` (un `Pick` de los 12 bancos) y no
  `WallpaperState`. Así «nunca publica `calibrationProfileSlots`» lo comprueba el
  compilador, y la suscripción de la UI a esos 12 bancos es una dependencia real
  en vez de un `useMemo` que se queda rancio cuando editas Looks.

Además de `buildAuthoringManifest` hay `buildAuthoringManifestReport`, que
devuelve lo mismo más `droppedBindings`: las referencias colgadas que hubo que
normalizar para que el archivo fuera válido. El porqué está en el contrato,
§«Un binding que apunta a un slot que ya no está».

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

**Cómo salió:** `VibrixAuthoringSection` en la pestaña **Export**
(`src/features/export/controls/`), dos botones y un informe por cue. El parser y
el transporte van aparte, en `src/features/composition/`:
`vibrixScore.ts` (puro: valida la envoltura de Lyrixa, junta **todos** los
errores legibles y no revienta) y `vibrixScoreLoader.ts` (modelado sobre
`lyricsBundleLoader.ts`, con `fetchImpl` inyectable para cuando HTTP llegue).

«Lo guarda» acabó siendo **el informe, no el store**. El score importado vive en
estado del componente a propósito: nada puede evaluarlo hasta la Fase C, así que
persistirlo hoy sería clave nueva + bump + migración para datos que ningún código
lee, y rompería el criterio 4 de esta misma tarea.

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

1. ✅ `buildAuthoringManifest` genera el fixture del contrato **byte a byte**
   (`JSON.stringify(…, null, '\t')` comparado con el bloque del doc).

    **Ojo, esto no se podía cumplir como estaba escrito.** Los hashes del fixture
    estaban inventados y un manifiesto **no lleva** los `values` de los que sale
    el hash, así que ninguna función real podía reproducirlos. Se arregló
    publicando la entrada —`CONTRACT_FIXTURE_STATE` en
    `src/features/scenes/authoringManifestFixture.ts`— y regenerando el fixture
    con los hashes derivados. La copia literal de Lyrixa sigue pasando: su suite
    compara revisiones entre sí y nunca afirma un hex concreto (verificado en
    `Lyrixa/src/core/composition/authoringManifest.test.ts`). Puede
    re-sincronizar las 9 cadenas cuando quiera; no es urgente.

2. ✅ Manifiesto de un proyecto real (`DEFAULT_STATE` + tres escenas guardadas:
   49 slots, las 12 familias) pasado por el **`parseAuthoringManifest` real de
   Lyrixa**: `ok: true`, y lista las tres escenas. Se verificó con un test
   desechable que importaba el parser del repo vecino por ruta absoluta y se
   borró después — ningún test de Vibrix depende de que Lyrixa esté clonada.
3. ✅ Renombrar no mueve la revisión; cambiar un valor sí, y entonces
   `reviewVibrixScore` marca el cue `updated`. Cubierto por valor en
   `authoringManifest.test.ts` y `vibrixScore.test.ts` en vez de a mano.

    Más de lo que pedía: la revisión de una **escena** también se mueve cuando se
    edita un slot que liga, aunque sus referencias no cambien. Sin eso, Lyrixa
    diría `Current` con el frame ya cambiado.

4. ✅ Suite entera verde **sin** bump de `STORE_PERSIST_VERSION` (sigue en 144).
   El score importado vive en estado de componente, no en el store: nada puede
   evaluarlo hasta la Fase C, así que persistirlo ahora sería una clave nueva,
   un bump y una migración para datos que ningún código lee.
