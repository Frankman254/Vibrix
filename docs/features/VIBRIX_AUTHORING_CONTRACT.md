# Contrato de autoría Vibrix → Lyrixa (manifiesto y score)

> **Dirección.** Este contrato es el **inverso** de
> [LYRIXA_CONTRACT.md](LYRIXA_CONTRACT.md): allí Lyrixa escribe letras y Vibrix
> las lee; aquí **Vibrix publica su catálogo de slots** y Lyrixa lo consume para
> componer un score temporal que Vibrix luego evalúa.
>
> **Dueño del contrato: Vibrix**, porque el catálogo es su estado. Lyrixa
> construye contra este documento, igual que Vibrix construye contra el de
> letras. Diseño del secuenciador, en Lyrixa:
> `Lyrixa/docs/03-vibrix-composition-sequencer.md`.
>
> **Estado: contrato acordado, sin implementar.** `slotRevision` tiene 0
> ocurrencias en `src/` a día de hoy. Las tareas que lo implementan son
> [.agents/TAREA_MANIFIESTO.md](../../.agents/TAREA_MANIFIESTO.md) (aquí) y
> `Lyrixa/.agents/TAREA_SECUENCIADOR.md` (allí).

## Regla que hace posible trabajar en paralelo

Los dos repos **no se esperan**. Lo que comparten es este documento y el
**ejemplo literal** de más abajo, que cada lado guarda como fixture y valida en
su propia suite:

- Vibrix tiene un test que afirma que su productor genera **exactamente** la
  forma del ejemplo.
- Lyrixa tiene un test que afirma que su parser acepta **exactamente** ese
  ejemplo y detecta sus casos de borde.

Si alguien edita el ejemplo sin actualizar los dos lados, falla un test. Es el
mismo patrón que ya sostiene el bundle de letras, y es lo que permite que Lyrixa
construya el catálogo y el score **antes** de que exista un manifiesto real.

## Las familias que existen de verdad

Verificado en `src/types/wallpaper.ts`. Esta tabla manda sobre cualquier lista de
familias escrita antes, incluida la de `CompositionTrack['kind']` en el doc de
Lyrixa.

| Familia en el manifiesto | Array en el store            | ¿La liga una escena?   | ¿Pista de timeline? |
| ------------------------ | ---------------------------- | ---------------------- | ------------------- |
| `scene`                  | `sceneSlots`                 | — (es el agregado)     | **Sí, la primaria** |
| `spectrum`               | `spectrumProfileSlots`       | `spectrumSlotId`       | Sí (granular)       |
| `spectrum-second`        | `spectrumSecondProfileSlots` | `spectrumSecondSlotId` | Sí (granular)       |
| `looks`                  | `looksProfileSlots`          | `looksSlotId`          | Sí (granular)       |
| `particles`              | `particlesProfileSlots`      | `particlesSlotId`      | Sí (granular)       |
| `rain`                   | `rainProfileSlots`           | `rainSlotId`           | Sí (granular)       |
| `lights`                 | `lightsProfileSlots`         | `lightsSlotId`         | Sí (granular)       |
| `camera-fx`              | `cameraFxProfileSlots`       | `cameraFxSlotId`       | Sí (granular)       |
| `logo`                   | `logoProfileSlots`           | `logoSlotId`           | Sí (granular)       |
| `track-title`            | `trackTitleProfileSlots`     | `trackTitleSlotId`     | Sí (granular)       |
| `background-zoom`        | `backgroundProfileSlots`     | **No**                 | Sí, pero ver abajo  |
| `intro-window`           | `introProfileSlots`          | No (la liga `Setlist`) | **No**, informativa |

### Las tres decisiones que estaban abiertas, cerradas

**`motion` no es una familia: bórrala del contrato.** No es que falte, es que
**se eliminó**: `src/store/wallpaperStoreMigrations.ts:2974` hace
`delete migratedState.motionProfileSlots`. «Motion» era el nombre de
partículas+lluvia juntas y hoy se compone granularmente, como dice el comentario
de `SceneSlot`. Un `kind: 'motion'` en un score no podría resolverse nunca.

**`background` no es «qué imagen se ve»; es el envelope de zoom por graves.**
`backgroundProfileSlots` lo consume `BgZoomAudioSection.tsx` y ninguna escena lo
referencia. Se publica como `background-zoom` **a propósito**: si se llamara
`background`, la UI de Lyrixa prometería cambiar la imagen de fondo desde la
línea temporal, y eso no es un slot — es el pool y los setlists. Lleva
`sceneBindable: false`, y una pista de esta familia sólo puede existir en modo
`Advanced`.

**`intro-window` se publica pero no es cueable.** Una ventana de intro **cubre**
la cabeza del tema (y el ending su cola) por diseño; no le añade duración y no
se coloca en un instante arbitrario. Ya la liga `Setlist.introSlotId`. Va en el
manifiesto para que Lyrixa pueda **mostrar** qué intro abre el tema, con
`cueable: false`.

**`calibrationProfileSlots` no se publica nunca.** Es calibración del
dispositivo: depende de la pantalla y del equipo de quien edita. Un score que la
moviera cambiaría la calibración de otra máquina al importarlo.

## `slotRevision` — derivado, no persistido

Un hash del **contenido** de un slot, para que Lyrixa pueda decir
`Updated in Vibrix` en vez de cambiar la composición en silencio.

```ts
revisionOf(slot: ProfileSlot<T>): string
```

Reglas:

1. **Sólo sobre `values`.** Renombrar un slot **no** cambia su revisión: el
   nombre es una etiqueta para el humano, no contenido. Cambiar un valor sí.
2. **Serialización canónica**: claves ordenadas en todos los niveles, para que
   el orden de inserción no mueva el hash.
3. `values: null` (slot vacío) ⇒ `'empty'`. Un slot vacío no es referenciable.
4. **No es criptografía**, es un detector de cambios: vale un hash determinista
   en JS puro (FNV-1a / cyrb53) en hex. Nada de `crypto.subtle`, que es `async`
   y sólo de navegador — esto tiene que correr en el suite de Node.

**Se calcula a demanda; no se guarda en el store.** La versión anterior de este
plan lo daba por clave persistida nueva, con su bump de `STORE_PERSIST_VERSION` y
su migración. Es peor: duplica la verdad (`values` y su hash pueden divergir si
una ruta de escritura olvida recalcularlo) y añade una migración que puede
fallar, a cambio de ahorrar un hash sobre ~120 slots que no se nota. **Derivarlo
no necesita bump ni migración.**

## El manifiesto

```ts
interface VibrixAuthoringManifest {
	schemaVersion: 1;
	app: 'Vibrix';
	exportKind: 'vibrix-manifest';
	exportedAt: string; // ISO 8601
	rendererVersion: string; // APP_VERSION
	storePersistVersion: number; // STORE_PERSIST_VERSION: detecta formas viejas
	projectName: string;
	/** Hash de todas las revisiones juntas: cambia si cambió cualquier slot. */
	revision: string;
	slots: VibrixManifestSlot[];
}

interface VibrixManifestSlot {
	id: string; // ProfileSlot.id / SceneSlot.id — estable
	family: VibrixSlotFamily; // la tabla de arriba
	name: string;
	revision: string; // 'empty' si no tiene valores
	/** Sólo en `family: 'scene'`: a qué slot granular apunta cada subsistema.
	 *  `'off'` = apágalo; ausente = «no tocar» (el `null` de `SceneSlotRef`). */
	bindings?: Partial<Record<VibrixSlotFamily, string | 'off'>>;
	/** Falso para `background-zoom`: ninguna escena puede referenciarlo. */
	sceneBindable: boolean;
	/** Falso para `intro-window`: no se puede poner en un cue. */
	cueable: boolean;
}
```

**Derivado del estado, puro, testeable por valor.** Una función
`buildAuthoringManifest(state): VibrixAuthoringManifest` sin reloj ni azar
dentro: `exportedAt` se inyecta. Un slot vacío se publica con
`revision: 'empty'` en vez de omitirse — Lyrixa necesita saber que la ranura
existe para explicar por qué está deshabilitada.

## El ejemplo literal (el fixture compartido)

Esto es el manifiesto que los dos repos validan. **Cópialo tal cual**; es el
«primer corte» del doc de Lyrixa: tres escenas y los granulares que ligan.

```json
{
	"schemaVersion": 1,
	"app": "Vibrix",
	"exportKind": "vibrix-manifest",
	"exportedAt": "2026-10-02T00:00:00.000Z",
	"rendererVersion": "0.7.0-alpha",
	"storePersistVersion": 144,
	"projectName": "Demo",
	"revision": "7f3a1c9e",
	"slots": [
		{
			"id": "scene-a",
			"family": "scene",
			"name": "Verse",
			"revision": "1a2b3c4d",
			"sceneBindable": false,
			"cueable": true,
			"bindings": {
				"spectrum": "spec-1",
				"looks": "look-1",
				"particles": "off"
			}
		},
		{
			"id": "scene-b",
			"family": "scene",
			"name": "Chorus",
			"revision": "5e6f7a8b",
			"sceneBindable": false,
			"cueable": true,
			"bindings": { "spectrum": "spec-2", "looks": "look-1" }
		},
		{
			"id": "scene-c",
			"family": "scene",
			"name": "Bridge",
			"revision": "empty",
			"sceneBindable": false,
			"cueable": true
		},
		{
			"id": "spec-1",
			"family": "spectrum",
			"name": "Bars tight",
			"revision": "9c0d1e2f",
			"sceneBindable": true,
			"cueable": true
		},
		{
			"id": "spec-2",
			"family": "spectrum",
			"name": "Bars wide",
			"revision": "3a4b5c6d",
			"sceneBindable": true,
			"cueable": true
		},
		{
			"id": "look-1",
			"family": "looks",
			"name": "Warm grade",
			"revision": "7e8f9a0b",
			"sceneBindable": true,
			"cueable": true
		},
		{
			"id": "bgz-1",
			"family": "background-zoom",
			"name": "Punchy",
			"revision": "1c2d3e4f",
			"sceneBindable": false,
			"cueable": true
		},
		{
			"id": "intro-1",
			"family": "intro-window",
			"name": "Title fade",
			"revision": "5a6b7c8d",
			"sceneBindable": false,
			"cueable": false
		}
	]
}
```

Los casos de borde que el fixture mete a propósito, y que cada lado debe cubrir
con un test:

| En el ejemplo                      | Lo que tiene que pasar                                           |
| ---------------------------------- | ---------------------------------------------------------------- |
| `scene-c` con `revision: "empty"`  | Se lista, pero deshabilitada y sin poder arrastrarse a una pista |
| `scene-c` sin `bindings`           | Ausente ≠ vacío: significa «no toca ningún subsistema»           |
| `"particles": "off"` en `scene-a`  | Apagado explícito; distinto de que la clave no esté              |
| `scene-b` sin `particles`          | No toca partículas: hereda lo que hubiera                        |
| `bgz-1` con `sceneBindable: false` | Ninguna escena puede apuntarle; sólo pista propia en `Advanced`  |
| `intro-1` con `cueable: false`     | Se muestra, no se arrastra                                       |
| `spec-1` y `spec-2`                | Dos slots de la misma familia: el caso de «comparar dos slots»   |

## El score

El de `Lyrixa/docs/03-vibrix-composition-sequencer.md`, con estos cambios:

- `CompositionTrack['kind']` usa **`VibrixSlotFamily`** de este documento: fuera
  `'motion'`, `'background'` pasa a `'background-zoom'`, `'spectrum-second'`
  existe como familia propia (Spectrum 2 tiene su propio banco desde v97).
- `target.slotRevision` es el de aquí: derivado y sólo sobre `values`.
- Tiempos en **milisegundos enteros**, como ya decía. Sin cambios.

## Transporte: archivo primero, y por qué

Verificado, para que nadie construya contra algo que no responde:

- `Lyrixa/src/core/bridge/liveWallpaperTarget.ts` hace
  `POST {base}/api/lyrics-bundle`.
- El servidor de Vibrix (`backend/server/src/index.mjs`) sirve `/api/health`,
  `/api/ai/scene-intent` y `/api/projects*`. **`/api/lyrics-bundle` no
  existe.** Es decir: hoy ese target siempre informa «no disponible» y todo cae
  al fallback de archivo, que es el camino que de verdad funciona.
- Y el manifiesto sale del **store del navegador**, que el servidor no tiene. Un
  `GET /api/authoring/manifest` servido por Express no podría contestar sin que
  Vibrix se lo publique antes.

Por eso la primera versión va **por archivo**, igual que el bundle de letras:

```
Vibrix  ──exporta──▶  <proyecto>.vibrix-manifest.json  ──importa──▶  Lyrixa
Lyrixa  ──exporta──▶  <proyecto>.vibrix-score.json     ──importa──▶  Vibrix
```

HTTP llega después y **con los mismos bytes** — que es exactamente lo que el
comentario de `liveWallpaperTarget.ts` ya promete al separar la entrega de la
construcción. Si luego se sirve por HTTP, los paths son los que propone el doc de
Lyrixa (`GET /api/authoring/manifest`, `POST /api/composition-bundle`).

## Lo que este contrato NO resuelve

**El estado visual en T todavía depende del camino recorrido**, así que un score
determinista no se puede evaluar aún. Verificado en
`src/features/scenes/sceneSlot.ts:156`: `buildSceneSlotActivationPatch(state,
slot)` ya es **pura** en `(state, slot)` —no lee el store— pero no es **total**:
una referencia `null` significa «no toques este subsistema» y hay composición
explícita sobre lo que ya había (`patch.spectrumInstances ??
state.spectrumInstances`). Reproducir 0→1:42 y saltar a 1:42 dan frames
distintos.

Que el constructor de parches ya sea puro es la buena noticia: el arreglo **lo
reutiliza sin tocarlo**. Consiste en plegar los cues desde una **base declarada**
en vez de desde el estado vivo:

```ts
resolveVisualStateAt(base, score, timeMs) => Partial<WallpaperState>
```

Lo caro no es el pliegue, es decidir qué es `base` y dejarlo escrito en las
`dependencies` del score, para que el mismo score dé el mismo frame en otra
máquina. Eso es la Fase C de Vibrix y va en su propia ventana, después del tag.
