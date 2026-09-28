# Plan — Plantillas, intro/outro y dinamismo total

Este documento ordena tres ideas que el usuario dejó pedidas la misma noche:

1. **Menos controles**: _"propon alguna manera de configurar las cosas ya que son
   demasiados controles para el usuario, puedes crear plantillas guardadas en el
   propio sistema para luego usarlas"_.
2. **Intro y ending animados** del propio sistema (§2, ya construido: los genera con las imágenes del setlist).
3. **Dinamismo total**: _"cambiar el spectrum o filtros o lo que sea sin cambiar
   de imagen, configurable… al final va a ser como un script activando y
   desactivando slots guardados del sistema o las mismas configuraciones"_.

Las tres comparten una misma pieza: **el sistema ya sabe guardar y aplicar
configuraciones con nombre** (slots de perfil por subsistema, escenas, presets de
transición). Ninguna de las tres necesita un motor nuevo de render; necesitan una
capa por encima que decida _qué configuración está activa y cuándo_.

---

## 0. El problema medido, no intuido

Recuento real de la interfaz hoy (grep sobre `src/**/*.tsx`):

| Control                       | Cantidad |
| ----------------------------- | -------- |
| `<Slider>`                    | 353      |
| `<SegmentedControl>`          | 46       |
| `<Switch>`                    | 40       |
| Secciones con `<FeatureGate>` | 13       |
| Archivos con `<AdvancedOnly>` | 11       |

Más de 400 mandos para un producto cuyo primer usuario quiere "ponerlo bonito y
grabar". El objetivo **no** es borrar controles: la potencia es el producto. El
objetivo es que el 95 % de ellos deje de ser el primer contacto.

Materia prima que ya existe y hay que aprovechar (no reinventar):

- **Slots de perfil con nombre** por subsistema: `spectrumProfileSlots`,
  `spectrumSecondProfileSlots`, `looksProfileSlots`, `particlesProfileSlots`,
  `rainProfileSlots`, `lightsProfileSlots`, `cameraFxProfileSlots`,
  `logoProfileSlots`, `trackTitleProfileSlots`, `backgroundProfileSlots`,
  `calibrationProfileSlots`.
- **Escenas** (`sceneSlots`), que ya combinan nueve de esos slots en un solo
  nombre, con `defaultSceneSlotId` y resolución efectiva por imagen.
- **Presets de transición con nombre** (Fase E3) — el primer ejemplo del patrón
  que el usuario pide: valores de fábrica sembrados por migración, editables,
  y el `transitionPresetId` es sólo una etiqueta.
- **El crossfade visual** (Fases E2/E4): cambiar de look ya puede disolverse en
  lugar de cortar. Es lo que hará que el "script" no parpadee.

---

## 1. Plantillas y modo simple

### 1.1 Tres niveles de exposición, uno solo nuevo

Hoy hay dos: normal y `AdvancedOnly`. Se propone:

| Nivel        | Qué ve                                                      |
| ------------ | ----------------------------------------------------------- |
| **Quick**    | Plantilla + imagen + audio + 6 mandos "grandes" y nada más. |
| **Studio**   | Lo de hoy sin `AdvancedOnly` (el nivel actual por defecto). |
| **Advanced** | Todo, como hoy con `AdvancedOnly` activo.                   |

Los seis mandos grandes de Quick son **macros**, no claves nuevas: Intensidad
(escala reactividad de spectrum/logo/partículas), Brillo, Color (fuente de color
global), Movimiento (cámara + drift + parallax), Densidad (barras/partículas/
gotas) y Grano (post-proceso de imagen). Cada macro escribe varias claves
existentes con una curva definida en un módulo puro y testeable
(`src/features/templates/domain/macros.ts`). Al mover un mando de Studio que una
macro controla, la macro se marca "modificada a mano" y deja de pisar ese valor:
misma regla que ya usa `transitionPresetId` (etiqueta, no dueño).

### 1.2 Plantillas de fábrica ("Style Packs")

Una **plantilla** es un documento con nombre que rellena de golpe varios slots y
los enlaza en una escena:

```ts
type StyleTemplate = {
	id: string;
	name: string;
	/** De fábrica: no se puede borrar, sí duplicar. */
	builtIn: boolean;
	/** Sembrada por migración; el usuario guarda las suyas desde el estado actual. */
	slots: {
		spectrum?: SpectrumProfileSettings;
		spectrumSecond?: SpectrumProfileSettings;
		looks?: LooksProfileSettings;
		particles?: ParticlesProfileSettings;
		rain?: RainProfileSettings;
		lights?: LightsProfileSettings;
		cameraFx?: CameraFxProfileSettings;
		logo?: LogoProfileSettings;
		trackTitle?: TrackTitleProfileSettings;
	};
	/** Valores de las macros con los que la plantilla se autoría. */
	macros: MacroValues;
	/** Preset de transición sugerido al cambiar de imagen. */
	transitionPresetId: string | null;
};
```

Aplicar una plantilla = crear/rellenar sus slots, crear una escena que los ate y
activarla. Es exactamente el camino que las escenas ya recorren, así que **no
hace falta tocar el renderer**: si la plantilla funciona, es porque las escenas
funcionan.

Set de fábrica propuesto (seis, suficientes para que se note y pocas para
mantener): `Neon Tokyo`, `Vinyl Warm`, `Minimal Mono`, `Rave Strobe`,
`Cinematic Slow`, `Retro Pixel` (esta última ya tiene el shape `pixel`).

### 1.3 Coste y riesgos

- Nueva clave persistida `styleTemplates` → **bump de `STORE_PERSIST_VERSION` +
  migración** que siembra las seis de fábrica (regla de `AGENTS.md`).
- Riesgo real: una plantilla que crea slots cada vez que se aplica llena el pool.
  Mitigación: la plantilla es **dueña de sus slots** (`ownerTemplateId` en el
  slot) y al reaplicarse los sobrescribe en lugar de duplicarlos.
- Advertencia del usuario ya dada en otra fase: **nada destructivo sin
  `useDialog().confirm()`**. Aplicar una plantilla sobre un proyecto con trabajo
  a mano pide confirmación y ofrece "guardar lo actual como plantilla mía".

---

## 2. Intro y ending generados — HECHO (store v129)

Lo que se pidió al final no fue el logo de Vibrix: fue que **el sistema los
genere con las imágenes del setlist seleccionado**, que el ending se arme con una
duración determinada, que se rendericen **como si fueran imágenes** y que el
orden sea el del setlist. Eso es lo que está construido.

### 2.1 Modelo (`src/types/wallpaper.ts`)

```ts
type StingerStyle = 'fade-stack' | 'film-strip' | 'grid-reveal';
type StingerOrder = 'setlist' | 'setlist-reverse';

interface StingerSettings {
	enabled: boolean;
	durationSec: number; // 0.5–20
	style: StingerStyle;
	imageCount: number; // 1–12
	order: StingerOrder;
}
```

Dos claves persistidas: `introStinger` y `outroStinger`, ambas **apagadas** por
defecto, así que un proyecto que ya existía exporta exactamente el mismo vídeo.

### 2.2 Ventanas, no tiempo extra

La decisión de diseño que importa: la intro y el ending **no alargan el vídeo**.
Son una ventana sobre la propia línea de tiempo — la intro es dueña de
`[0, introSec)`, el ending de `[max(introSec, total - outroSec), total]`, y cada
una se recorta a la mitad del tema para que nunca se solapen. Así el audio no se
desfasa ni un fotograma y nada más abajo (planificador de exportación, recorder,
HUD) tiene que aprender un reloj nuevo.

`resolveStingerWindow(state, timeSec, totalSec)` en
`src/features/stinger/stingerPlan.ts` devuelve la ventana activa con su progreso
`0→1`, o `null` cuando el tiempo cae fuera de las dos.

### 2.3 Cómo se dibuja

Todo el reparto es **puro**: `pickStingerImages` (las primeras N del pool del
setlist, o las últimas N invertidas), `resolveStingerCards(kind, style, progress,
count, viewport)` → cajas con alfa, y `resolveStingerBackdropAlpha`. El pool es
`resolveSlideshowPool(...)`, es decir el setlist ya filtrado y en orden.

Un solo pintor, `paintStinger(...)` en `stingerPaint.ts`, consume ese plan, y lo
comparten los dos caminos:

- **En vivo**: `StingerLayer` (rAF sobre canvas propio, zIndex 95) leyendo el
  reloj del tema de `useAudioContext()`.
- **En el vídeo**: el subsistema `stinger` de `RENDER_SUBSYSTEM_ORDER`, justo
  antes del HUD y **fuera** de `SUBSYSTEM_CAMERA_LAYER` — el montaje cubre la
  composición entera, la cámara no lo mueve.

Por eso la previsualización y el archivo coinciden fotograma a fotograma, y por
eso las 15 pruebas de `stingerPlan.test.ts` cubren la función sin DOM.

### 2.4 Mandos

Export → «Intro y ending»: dos tarjetas (intro / ending) con interruptor,
duración, estilo, número de imágenes y de qué punta del setlist se toman, más un
pie que dice cuántas usa de cuántas hay en el pool.

### 2.5 Qué NO se hizo

No hay línea de tiempo con keyframes. Tres montajes con duración, número de
imágenes y orden cubren el encargo y se amplían después sin romper datos.

---

## 3. Dinamismo total — el "script" (Autopilot)

Esta es la pieza grande y la que más valor visible tiene: **que el wallpaper
cambie solo sin cambiar de imagen**.

### 3.1 Inspiración externa

El Autopilot de Resolume resuelve el mismo problema con tres piezas que aquí
encajan tal cual: una **duración por paso**, un **orden** y un **modo de azar**
con tres sabores — _Other_ (salta a otro, nunca repite el actual), _Any_ (puede
repetir) y _Bag_ (bolsa: reproduce todos una vez antes de volver a mezclar). El
modelo de "bolsa" es el que evita la sensación de que el azar se atasca en dos
looks, y es un algoritmo de diez líneas.

### 3.2 Modelo de datos

```ts
type AutomationTargetKind =
	| 'spectrum'
	| 'spectrumSecond'
	| 'looks'
	| 'particles'
	| 'rain'
	| 'lights'
	| 'cameraFx'
	| 'logo'
	| 'trackTitle'
	| 'scene';

type AutomationStep = {
	id: string;
	/** Qué se enciende en este paso. Un slot vacío = "no toques esto". */
	bindings: Partial<Record<AutomationTargetKind, string | 'off'>>;
	/** Cuánto dura el paso, en la unidad del trigger. */
	hold: number;
	/** Duración del crossfade al entrar, 0 = corte seco. */
	fadeMs: number;
};

type AutomationScript = {
	id: string;
	name: string;
	enabled: boolean;
	trigger:
		| { kind: 'time'; seconds: number } // cada N segundos
		| { kind: 'beats'; beats: number } // cada N compases (usa estimatedBpm)
		| { kind: 'track-change' } // al cambiar de pista
		| { kind: 'energy'; threshold: number } // cuando la energía cruza un umbral
		| { kind: 'manual' }; // sólo con tecla / HUD
	order: 'sequential' | 'random-other' | 'random-any' | 'bag';
	steps: AutomationStep[];
	/** Congela la imagen: el script cambia looks, no fondo. */
	keepImage: boolean;
};
```

Clave del encargo: `bindings` apunta a **slots que ya existen**. El script no
guarda valores; guarda _qué configuración guardada se activa_. Eso es
literalmente lo que pidió el usuario y además hace el dato diminuto, exportable y
a prueba de futuros cambios de claves.

### 3.3 Cómo se ejecuta

- Un **módulo puro** `src/features/automation/domain/automationRunner.ts` con la
  firma
  `advanceScript(script, runtime, now) → { nextIndex, appliedStepId } | null`.
  Nada de DOM, nada de store: entra estado, sale decisión. Testeable, y es lo que
  garantiza que vivo y exportado hagan lo mismo.
- Un **coordinador** en el store que, en cada disparo, aplica el paso igual que
  hoy se aplica una escena, y **abre una transición visual** con `fadeMs` usando
  el `visualTransition` de las Fases E2/E4. Sin eso, un script de looks es un
  parpadeo; con eso, es un espectáculo.
- **En la exportación** el runner se evalúa contra `ctx.timeMs` del fotograma, no
  contra el reloj de pared: el vídeo sale idéntico en cada render. Para el
  trigger `beats` se usa el `estimatedBpm` ya analizado de la pista; para
  `energy`, la envolvente offline que el exportador ya calcula.
- `keepImage: true` desactiva el avance del slideshow mientras el script corre —
  es el caso que el usuario describió: **la imagen se queda, todo lo demás baila**.

### 3.4 Interfaz (poca)

Una sub-pestaña "Script" en Scene: lista de pasos como tarjetas (cada una muestra
sus bindings como chips con el nombre del slot), un selector de disparo, un
selector de orden y dos botones grandes: **Grabar paso desde lo actual** y
**Probar**. Un chip en el HUD cuando un script está corriendo, con paso actual y
"saltar al siguiente", como el chip de setlist que ya existe.

### 3.5 Riesgos identificados de antemano

- **Coste**: aplicar un paso escribe muchas claves del store de golpe y eso
  re-renderiza medio editor. Mitigación: aplicar en una sola acción del store
  (una notificación, no veinte) — el mismo cuidado que se tuvo con el crossfade.
- **Pelea con las escenas por imagen**: si una imagen trae escena y el script
  también manda, gana **el script mientras está activo** y el HUD lo dice. Hay
  que escribirlo en el documento de escenas para no repetir la confusión de
  `spectrumSecondOverride`.
- **Slots borrados**: un binding puede quedar colgando; el informe de salud del
  proyecto (`projectHealth.ts`) tiene que aprender a mirarlos, igual que se le
  acaba de enseñar a mirar los slots por imagen.

---

## 4. Orden de ejecución propuesto

| Fase   | Qué                                                              | Por qué en este orden                        |
| ------ | ---------------------------------------------------------------- | -------------------------------------------- |
| **T1** | Macros + nivel Quick (sin datos nuevos, sólo derivación)         | Se nota en un día y no arriesga persistencia |
| **T2** | `styleTemplates` + seis plantillas de fábrica (bump + migración) | Da contenido a Quick                         |
| **A1** | Runner puro + un solo trigger (`time`) + orden `sequential`      | El esqueleto honesto del script              |
| **A2** | Resto de triggers y órdenes (`bag`, `beats`, `energy`)           | Encima de algo ya probado                    |
| **A3** | Crossfade por paso + `keepImage` + chip de HUD                   | Es lo que lo vuelve bonito                   |
| **S1** | Intro/outro: subsistema + dos estilos                            | Independiente; se puede hacer en paralelo    |
| **S2** | Los otros dos estilos + integración en el planificador           | Cierra el vídeo de principio a fin           |

Cada fase deja las nueve puertas de `AGENTS.md` verdes y cada clave persistida
nueva lleva su bump y su migración.

## 5. Fuentes

- Autopilot de Resolume (duración por paso, azar _Other / Any / Bag_):
  <https://www.resolume.com/support/en/autopilot>
