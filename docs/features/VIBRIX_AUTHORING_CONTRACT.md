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
> **Estado:** la versión 1 del catálogo de slots y del score está implementada.
> La versión 2, acordada el 2026-10-03, añade las imágenes como objetos de
> autoría y cambia el timeline a activaciones sostenidas. La tarea ejecutable
> está en
> [.agents/TAREA_COMPOSE_TIMELINE.md](../../.agents/TAREA_COMPOSE_TIMELINE.md).

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

### Las imágenes son objetos de autoría, no slots

La tabla anterior enumera bancos de slots. No enumera todo lo que puede ocupar
un carril. Una imagen de `backgroundImages` también tiene identidad estable
(`assetId`), encuadre, transición hacia la siguiente imagen, una escena asociada
y overrides por imagen. Por eso la versión 2 del manifiesto publica además un
catálogo `images`; **no** disfraza las imágenes como `background-zoom` ni las
mete en un banco de slots que no existe.

```ts
interface VibrixManifestImage {
	id: string; // BackgroundImageItem.assetId
	kind: 'image';
	name: string; // originalFileName o etiqueta estable de respaldo
	revision: string;
	enabled: boolean;
	sceneSlotId: string | null;
	/** Miniatura transportable y acotada; nunca una blob URL del navegador. */
	thumbnailDataUrl?: string;
}
```

La revisión de una imagen cubre lo que cambia su resultado visual: identidad
del asset, encuadre, opacidad, reactividad, transición a la siguiente, escena,
referencias de perfiles y overrides inline. No incluye `url`, `thumbnailUrl` ni
el nombre: son transporte o presentación. Cambiar el nombre no rompe un score;
cambiar la transición sí.

La miniatura es opcional para que un manifiesto siga siendo válido si el asset
no se puede leer. Cuando exista debe ser autocontenida y pequeña; una `blob:` URL
no sirve porque Lyrixa corre en otro origen y no puede abrirla.

## `slotRevision` — derivado, no persistido

Un hash del **contenido** de un slot, para que Lyrixa pueda decir
`Updated in Vibrix` en vez de cambiar la composición en silencio.

```ts
revisionOf(values: unknown): string;
manifestRevision(revisions: readonly string[]): string;
```

Implementado en
[`src/features/scenes/slotRevision.ts`](../../src/features/scenes/slotRevision.ts)
(cyrb53 sobre una serialización canónica etiquetada y con longitudes, 14 dígitos
hex).

Reglas:

1. **Sólo sobre `values`.** Renombrar un slot **no** cambia su revisión: el
   nombre es una etiqueta para el humano, no contenido. Cambiar un valor sí.
2. **Serialización canónica**: claves ordenadas en todos los niveles, para que
   el orden de inserción no mueva el hash.
3. `values: null` (slot vacío) ⇒ `'empty'`. Un slot vacío no es referenciable.
4. **No es criptografía**, es un detector de cambios: vale un hash determinista
   en JS puro (FNV-1a / cyrb53) en hex. Nada de `crypto.subtle`, que es `async`
   y sólo de navegador — esto tiene que correr en el suite de Node.
5. **Los tipos se etiquetan.** `'1'` y `1` no pueden colisionar, ni `{a: null}`
   con `{}`, ni `[1, 2]` con `[2, 1]` — en un array el orden **es** contenido,
   mientras en un objeto no lo es. Una clave ausente ≡ una clave con `undefined`,
   porque es lo que hace `JSON.stringify` al salir por el archivo.

### La revisión de una escena incluye lo que liga

Una escena no tiene `values`: tiene referencias. Hashear **sólo** sus
referencias deja un agujero semántico que se ve a simple vista: edita el
Spectrum que la escena apunta y la escena no se mueve, así que Lyrixa diría
`Current` mientras el frame que se renderiza ya cambió.

Así que la revisión de una escena se calcula sobre
`familia=slotId@revisiónDeEseSlot` (y `familia=off` para un apagado explícito).
Consecuencias, que son las deseadas:

- Editar un slot mueve la escena que lo liga **y** deja quietas las que no.
- Renombrar sigue siendo invisible, en la escena y en el slot.
- Re-apuntar una escena a otro slot la mueve aunque los dos slots tengan los
  mismos valores, porque el `slotId` entra en el hash.

### Un binding que apunta a un slot que ya no está se cae en el productor

`Lyrixa/src/core/composition/authoringManifest.ts` (`validateSceneBindings`)
rechaza el **archivo entero** si una escena referencia un slot que el manifiesto
no publica. Y eso pasa sin que nadie haga nada raro: `featureProfiles.ts` recorta
los bancos a su tope, y una importación parcial puede traer escenas sin sus
slots.

Por eso Vibrix **normaliza la referencia colgada al publicar** (el mismo
`normalizeSlotRef` que ya usa al activar una escena) y la reporta aparte en
`droppedBindings`, que la UI muestra como aviso. Un proyecto con una referencia
podrida exporta un manifiesto válido con una escena que liga menos cosas, en vez
de un archivo que Lyrixa no abre.

**Se calcula a demanda; no se guarda en el store.** La versión anterior de este
plan lo daba por clave persistida nueva, con su bump de `STORE_PERSIST_VERSION` y
su migración. Es peor: duplica la verdad (`values` y su hash pueden divergir si
una ruta de escritura olvida recalcularlo) y añade una migración que puede
fallar, a cambio de ahorrar un hash sobre ~120 slots que no se nota. **Derivarlo
no necesita bump ni migración.**

## El manifiesto

```ts
interface VibrixAuthoringManifest {
	schemaVersion: 2;
	app: 'Vibrix';
	exportKind: 'vibrix-manifest';
	exportedAt: string; // ISO 8601
	rendererVersion: string; // APP_VERSION
	storePersistVersion: number; // STORE_PERSIST_VERSION: detecta formas viejas
	projectName: string;
	/** Hash de todas las revisiones juntas: cambia si cambió cualquier slot. */
	revision: string;
	slots: VibrixManifestSlot[];
	images: VibrixManifestImage[];
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

**Derivado del estado, puro, testeable por valor.** Sin reloj ni azar dentro:

```ts
buildAuthoringManifest(
	state: AuthoringManifestSource,
	options: { exportedAt: string; projectName: string }
): VibrixAuthoringManifest;

// La misma cosa, más lo que tuvo que descartar para publicar algo válido.
buildAuthoringManifestReport(state, options): {
	manifest: VibrixAuthoringManifest;
	droppedBindings: DroppedBindingWarning[];
};
```

`exportedAt` se inyecta, y **`projectName` también**: no existe en el store —
hoy es estado local de `ProjectLibrarySection.tsx` —, así que pedirlo es más
honesto que inventarlo dentro.

`AuthoringManifestSource` es un `Pick<WallpaperState, …>` de exactamente los 12
bancos que se publican. Eso convierte «nunca publica `calibrationProfileSlots`»
en una garantía del compilador en vez de un comentario, y hace que la
suscripción de la UI a esos 12 bancos sea una dependencia real.

Un slot vacío se publica con `revision: 'empty'` en vez de omitirse — Lyrixa
necesita saber que la ranura existe para explicar por qué está deshabilitada.

## El ejemplo literal (el fixture compartido)

Esto es el manifiesto que los dos repos validan. **Cópialo tal cual**; es el
«primer corte» del doc de Lyrixa: tres escenas y los granulares que ligan.

**Las revisiones de abajo son salida, no invención.** Se derivan del estado
declarado en
[`src/features/scenes/authoringManifestFixture.ts`](../../src/features/scenes/authoringManifestFixture.ts)
(`CONTRACT_FIXTURE_STATE`), que es parte del contrato tanto como el JSON: un
manifiesto **no lleva** los `values` de los que sale el hash, así que sin
publicar la entrada nadie puede reproducir la salida. La primera versión de este
doc traía hashes inventados, y por eso el criterio «byte a byte» era imposible de
cumplir; ahora `authoringManifest.test.ts` compara contra este bloque
literalmente, con el mismo sangrado de tabuladores.

**Para Lyrixa son cadenas opacas.** Su suite compara revisiones entre sí
(`slot.revision === cue.target.slotRevision`) y nunca afirma un valor hex
concreto, así que regenerar estos hashes no rompe su suite: es una copia que se
re-sincroniza cuando convenga, no una dependencia.

```json
{
	"schemaVersion": 2,
	"app": "Vibrix",
	"exportKind": "vibrix-manifest",
	"exportedAt": "2026-10-02T00:00:00.000Z",
	"rendererVersion": "0.7.0-alpha",
	"storePersistVersion": 145,
	"projectName": "Demo",
	"revision": "169bbe48d6a777",
	"slots": [
		{
			"id": "scene-a",
			"family": "scene",
			"name": "Verse",
			"revision": "06f5cbdcbb8aad",
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
			"revision": "1badfdd9cedaf2",
			"sceneBindable": false,
			"cueable": true,
			"bindings": {
				"spectrum": "spec-2",
				"looks": "look-1"
			}
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
			"revision": "0f79ebd4d5f3e6",
			"sceneBindable": true,
			"cueable": true
		},
		{
			"id": "spec-2",
			"family": "spectrum",
			"name": "Bars wide",
			"revision": "037549f677038c",
			"sceneBindable": true,
			"cueable": true
		},
		{
			"id": "look-1",
			"family": "looks",
			"name": "Warm grade",
			"revision": "09cffd31a5fce4",
			"sceneBindable": true,
			"cueable": true
		},
		{
			"id": "bgz-1",
			"family": "background-zoom",
			"name": "Punchy",
			"revision": "16fbe6c624044d",
			"sceneBindable": false,
			"cueable": true
		},
		{
			"id": "intro-1",
			"family": "intro-window",
			"name": "Title fade",
			"revision": "05ea8b323e0e09",
			"sceneBindable": false,
			"cueable": false
		}
	],
	"images": []
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

### Versión 1 implementada

El de `Lyrixa/docs/03-vibrix-composition-sequencer.md`, con estos cambios:

- `CompositionTrack['kind']` usa **`VibrixSlotFamily`** de este documento: fuera
  `'motion'`, `'background'` pasa a `'background-zoom'`, `'spectrum-second'`
  existe como familia propia (Spectrum 2 tiene su propio banco desde v97).
- `target.slotRevision` es el de aquí: derivado y sólo sobre `values`.
- Tiempos en **milisegundos enteros**, como ya decía. Sin cambios.

La versión 1 modela cada cue con `startTimeMs` y `endTimeMs`. Lyrixa crea hoy
un bloque de ocho segundos al soltarlo. Eso queda aceptado al importar archivos
viejos, pero no es el modelo de edición definitivo.

### Versión 2 — activaciones sostenidas

Un carril representa una fuente de activaciones ordenadas. Colocar un objeto en
`startTimeMs` lo activa en ese instante. Se mantiene hasta la siguiente
activación que afecte ese estado o hasta el final de la canción. La duración que
Lyrixa dibuja es **derivada**; no se guarda como una segunda verdad que el
usuario tenga que estirar a mano.

Ejemplo: una imagen en `00:00` y otra en `03:00` hacen que la primera ocupe tres
minutos. Al llegar a `03:00`, Vibrix usa la transición «hacia la siguiente» que
ya pertenece a la primera imagen. Lyrixa decide cuándo ocurre el cambio; Vibrix
sigue siendo dueño de cómo se ve.

```ts
type VibrixTimelineKind = VibrixSlotFamily | 'image';

interface CompositionTrackV2 {
	id: string;
	name: string;
	kind: VibrixTimelineKind;
	order: number;
	enabled: boolean;
	locked: boolean;
}

type CompositionTargetV2 =
	| {
			kind: 'scene' | 'feature-slot';
			family: VibrixSlotFamily;
			id: string;
			revision: string;
	  }
	| { kind: 'image'; family: 'image'; id: string; revision: string }
	| { kind: 'inherit'; family: VibrixSlotFamily };

interface CompositionCueV2 {
	id: string;
	trackId: string;
	startTimeMs: number;
	target: CompositionTargetV2;
	priority: number;
	enabled: boolean;
}
```

El sobre v2 mantiene los metadatos del v1, cambia `schemaVersion` a `2` y usa
dependencias discriminadas para slots e imágenes:

```ts
interface VibrixScoreDependencyV2 {
	kind: 'slot' | 'image';
	id: string;
	family: VibrixTimelineKind;
	name: string;
	revision: string;
}
```

`inherit` devuelve un carril granular al resultado de los objetos agregados.
Es necesario porque un Spectrum 2 colocado en un carril se sostiene; sin una
activación explícita de herencia no habría forma clara de dejar de sobrescribir
las escenas posteriores.

No se crea un carril por cada pestaña visible de Vibrix. Se crea uno por cada
estado temporal independiente y cueable: Image, Scene, Spectrum 1, Spectrum 2,
Looks, Particles, Rain, Lights, Camera FX, Logo, Track Title y, en modo avanzado,
Background Zoom. `intro-window` sigue siendo informativo y `calibration` sigue
fuera del contrato.

### Cómo se resuelve un instante

El evaluador parte de una base declarada y pliega todas las activaciones con
`startTimeMs <= T`, ordenadas por tiempo y con un desempate estable. Cada objeto
toca únicamente lo que posee:

- una feature granular toca sólo su familia;
- una escena toca los bindings presentes y respeta ausente frente a `off`;
- una imagen cambia el asset, aplica su encuadre y prepara su transición; su
  escena y overrides por imagen conservan la semántica que ya tienen en Vibrix;
- `inherit` retira el override sostenido de su familia.

El pliegue desde la misma base hace que reproducir desde cero y saltar
directamente a `01:42` produzcan el mismo estado. Un cue no es un `toggle` y no
depende del historial del store vivo.

El orden en un mismo milisegundo es: Scene, Image y después las pistas
granulares. Así un override granular situado exactamente en el corte puede
afinar el resultado agregado de la escena o de la imagen. Un override granular
se mantiene por encima de escenas e imágenes posteriores hasta otro cue del
mismo carril o un `inherit`; ésa es la razón de que `inherit` exista.

Los lectores v2 deben seguir aceptando score v1. Para un cue v1, su activación
empieza en `startTimeMs`; `endTimeMs` conserva su semántica histórica durante la
migración, pero Lyrixa guarda los proyectos nuevos como v2.

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

### Transporte definitivo: paquete de autoría → paquete de score

El manifiesto JSON suelto de v1 sigue siendo legible. El flujo nuevo usa dos
paquetes con responsabilidades distintas. El primer contenedor es JSON
autocontenido —igual que el paquete de proyecto actual de Vibrix— y puede pasar
a binario/ZIP cuando entren originales portables sin cambiar `manifest.json` ni
`score.json`:

```text
Vibrix
  └─ exporta proyecto.vibrix-authoring
       ├─ manifest         catálogo v2
       └─ snapshots        valores inmutables de slots e imágenes
                 ↓
              Lyrixa
                 └─ ordena objetos en el tiempo; no renderiza Vibrix
                      ↓
                 exporta proyecto.vibrix-score
                      ├─ score.json
                      └─ dependencies/  sólo lo usado por la composición
                                ↓
                             Vibrix
                                └─ modo Compose: preview, play y export offline
```

El paquete que Vibrix entrega a Lyrixa contiene todo lo necesario para
identificar, mostrar y colocar los objetos sin depender de `blob:` URLs ni de la
IndexedDB de otro origen. Incluye el catálogo, snapshots y las previews
transportables disponibles en el manifiesto. Lyrixa no
necesita el renderer de Vibrix ni duplica sus controles.

El paquete que vuelve desde Lyrixa contiene el score y únicamente sus
dependencias usadas. Su primera versión también puede ser un contenedor JSON.
En el mismo proyecto, Vibrix puede resolver por id y
revisión. Para abrirlo en otra máquina, una variante portable añade los assets
binarios originales referenciados; nunca se meten como base64 dentro del JSON.

Vibrix es la autoridad de reproducción. Al importar el paquete, el modo Compose
usa el score para resolver qué imagen, escena y slots corresponden al playhead.
El preview en vivo y el export offline consumen el mismo evaluador; Lyrixa sólo
decide qué se activa y cuándo.

La forma concreta del primer paquete es:

```ts
interface VibrixAuthoringPackage {
	format: 'vibrix-authoring';
	packageVersion: 1;
	exportedAt: string;
	manifest: VibrixAuthoringManifest; // schemaVersion 2
	snapshots: Array<
		| {
				kind: 'slot';
				id: string;
				family: VibrixSlotFamily;
				name: string;
				revision: string;
				values: unknown;
		  }
		| {
				kind: 'image';
				id: string;
				name: string;
				revision: string;
				values: unknown;
		  }
	>;
}
```

El archivo se llama `<proyecto>.vibrix-authoring`. Las previews transportables
viven en `manifest.images[].thumbnailDataUrl`; los snapshots nunca llevan
`blob:` URLs ni timestamps del slideshow anterior.

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
