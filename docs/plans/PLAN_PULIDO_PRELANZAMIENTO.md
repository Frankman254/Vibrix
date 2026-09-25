# Plan de pulido pre-lanzamiento

**Qué es esto.** Una auditoría de los cuatro subsistemas que hoy se notan a
medio terminar cuando alguien usa Vibrix en serio para montar un vídeo:
capas de efectos y su guardado, overrides por imagen, transiciones, y el
control manual de los tiempos de cambio de imagen. No es la hoja de ruta de
lanzamiento — esa vive en
[PLAN_MAESTRO_LANZAMIENTO.md](PLAN_MAESTRO_LANZAMIENTO.md). Esto es la lista de
detalles que, si se lanzan como están, hacen que el sistema se sienta
inconsistente.

Cada hallazgo lleva la evidencia en el código. Lo que no verifiqué lo digo.

---

## 0. Resumen: lo que está roto o a medias

| #   | Síntoma que ve el usuario                                                           | Causa real                                                                   | Fase |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---- |
| 1   | Al guardar un slot de Looks y recargarlo, las otras capas de efectos no vuelven     | El slot solo guarda la capa activa                                           | A    |
| 2   | Dos capas pueden pelear por el mismo destino y la de abajo no hace nada, sin avisar | No hay UI de propiedad de destino                                            | A    |
| 3   | Un override por imagen de Looks puede quedar invisible                              | Escribe la capa activa, pero otra capa por encima puede tener ese destino    | A    |
| 4   | Camera Motion "se olvidó": un solo juego de valores para todo                       | Igual que Looks antes de v119: un stack compartido                           | B    |
| 5   | Camera Motion no distingue Spectrum 1 de Spectrum 2                                 | Los dos se pintan en el **mismo canvas**                                     | D    |
| 6   | Faltan movimientos y reactividad (saltos por beat, trazos por intensidad)           | Solo hay 6 caminos senoidales continuos                                      | C    |
| 7   | Las transiciones se ven poco profesionales                                          | El subsistema no hace crossfade: parpadea a 0 y vuelve                       | E    |
| 8   | Las transiciones laguean la UI                                                      | Dissolve dibuja ~190 veces la imagen completa por frame                      | E    |
| 9   | Los controles de transición son demasiados y están repartidos                       | 6 dials globales + 5 por imagen, misma cosa en dos sitios                    | E    |
| 10  | Poner a mano el tiempo de cambio de imagen es incómodo                              | Falta el botón "marcar aquí"; solo se puede arrastrar el clip                | F    |
| 11  | Las transiciones no se tienen en cuenta al marcar el tiempo                         | La imagen cambia _en_ el timestamp y la transición empieza ahí               | F    |
| 12  | Las transiciones solo afectan a la imagen, no al spectrum/logo que también cambian  | El fade de subsistema existe pero es de baja calidad (ver #7)                | E    |
| 13  | Unas cosas se pueden poner por imagen y otras no, sin lógica aparente               | El modelo por imagen y el de escena cubren conjuntos distintos               | G    |
| 14  | Un override por imagen no se aplica y no se entiende por qué                        | Si la imagen tiene escena, el código **vuelve antes** de mirar los overrides | H    |
| 15  | No se puede ajustar la composición de todo el vídeo sin pisar lo guardado           | No existe un modo global que ignore per-image sin borrarlo                   | H    |
| 16  | Las escenas no las usa nadie                                                        | 9 desplegables de tres estados y sin «capturar la escena actual»             | I    |
| 17  | La versión del sistema lleva congelada varias funciones                             | Solo se sube `STORE_PERSIST_VERSION`, nunca `APP_VERSION`                    | 13   |

---

## 1. Capas de efectos y el guardado (slots / overrides / escenas)

### 1.1 El slot de Looks solo guarda una capa — confirmado

`LOOKS_PROFILE_KEYS` en `src/store/featureProfiles.ts:228` es
`['filterTargets', ...FILTER_LOOK_PRESET_KEYS]`. **No incluye `effectLayers` ni
`activeEffectLayerId`.**

Consecuencia exacta: guardar un slot captura los valores de la capa **activa**
y su lista de destinos. Al cargarlo, esa capa se sobreescribe y **las demás
capas se quedan como estaban**. Si el usuario montó "Layer 1 = fondo,
Layer 2 = spectrum" y guarda el slot estando en Layer 2, el slot solo lleva el
spectrum; al aplicarlo sobre otro proyecto o tras un reset, el fondo no vuelve.

Lo mismo aplica a `looksOverride` por imagen: `src/store/activeImageSelection.ts:137`
hace `Object.assign(patch, match.looksOverride)`, que escribe las claves planas
`filter*` — o sea, **la capa activa**, no la capa que realmente pinta ese
destino.

### 1.2 El agujero silencioso del override por imagen

Como `resolveFilterStack` resuelve con "gana la de arriba", este caso es real:

1. Layer 1 (arriba) apunta a `Background Set`.
2. El usuario está editando Layer 2 y le guarda a la imagen 3 un
   `looksOverride` con `filterTargets: ['background']`.
3. Al llegar a la imagen 3, el override escribe las claves planas → Layer 2.
4. Pero Layer 1 sigue por encima y sigue reclamando `background`.
5. **El override no se ve.** Nada avisa.

Es el mismo problema que el conflicto de destinos en la UI, pero por una vía
que el usuario no puede inspeccionar.

### 1.3 Decisión de diseño a tomar

Un slot / override de Looks debe pasar a guardar **la pila completa**:
`effectLayers` + `activeEffectLayerId` + las claves planas de la capa activa.
Con dos consecuencias que hay que aceptar a propósito:

- **Un slot de Looks pasa a ser "el aspecto completo"**, no "un juego de
  filtros". Es lo que el usuario espera cuando dice _"que el slot guarde las
  configuraciones de las capas"_.
- Los slots guardados **antes** de este cambio solo tienen las claves planas.
  Al aplicarlos hay que envolverlos en una capa única y **borrar las demás**,
  o dejarlos como están y solo tocar la activa. Recomiendo lo primero
  (resultado predecible) y avisarlo en la UI del slot: "slot antiguo: una sola
  capa".

**Esto es un cambio de forma en una clave persistida → bump de
`STORE_PERSIST_VERSION` + migración.** No hay atajo.

### 1.4 El mismo problema, adelantado, para Motion/Camera

Si en la Fase B se convierten los ajustes de cámara en capas, `CAMERA_FX_PROFILE_KEYS`
(`src/store/featureProfiles.ts:193`) hereda exactamente el mismo defecto. La
regla a fijar de una vez, para todos los subsistemas que se vuelvan por capas:

> **Un slot guarda el array completo de capas del subsistema, nunca la capa
> activa sola.** El "editor apunta a la capa N" es estado de UI, no de guardado.

Escribir esa regla ahora ahorra repetir la migración tres veces.

### 1.5 Escenas

`SceneSlot` (`src/types/wallpaper.ts:510`) referencia slots por id
(`looksSlotId`, `cameraFxSlotId`, …). Si el slot de Looks pasa a llevar la pila
completa, **las escenas se arreglan solas** sin tocar su modelo: siguen
apuntando a un slot, y ese slot ahora es completo. Esto es un argumento fuerte
a favor de arreglarlo en el slot y no en cada consumidor.

---

## 2. Auditoría de "per image": qué es global y qué no

### 2.1 Lo que hoy puede llevar una imagen

De `BackgroundImageItem` (`src/types/wallpaper.ts:395`):

- **Encuadre**: `scale`, `positionX/Y`, `focusX/Y`, `rotation`, `fitMode`,
  `coverageFramingEdited`, `mirror*`, `opacity`.
- **Reactividad al audio de la imagen**: `bassReactive`, `bassIntensity`,
  `audioReactiveDecay`, `audioChannel`.
- **Transición**: `transitionType`, `transitionDuration`, `transitionIntensity`,
  `transitionAudioDrive`, `transitionAudioChannel`.
- **Subsistemas por referencia a slot**: logo, spectrum, particles, rain, looks.
- **Subsistemas inline (override)**: `logoOverride`, `spectrumOverride`,
  `particlesOverride`, `rainOverride`, `looksOverride`.
- **Escena**: `sceneSlotId`.
- **Tiempo**: `playbackSwitchAt`.
- **Pool**: `enabled`.

### 2.2 Lo que NO puede llevar una imagen, y sí puede llevar una escena

`SceneSlot` referencia además: **lights** (`lightsSlotId`), **camera FX**
(`cameraFxSlotId`), **track title** (`trackTitleSlotId`) y **Spectrum 2**
(`spectrumSecondSlotId`).

O sea: hoy, para que una imagen cambie las luces de escenario o la cámara, hay
que pasar **obligatoriamente por una escena**. No hay override directo. El
usuario no tiene por qué saber eso, y la UI no lo explica. Ésta es la causa
real de _"unas cosas se pueden poner a las imágenes y otras no"_.

### 2.3 Lo que no puede llevar ni imagen ni escena

- **Flash Light** — no está en `SceneSlot` ni como override.
- **Lyrics** — tampoco, y tiene sentido: las letras pertenecen a la canción, no
  a la imagen. **Debe quedarse global a propósito** y decirlo en la doc.
- **Global Background** — es el lienzo de debajo; por definición global.
- **Rain / Particles ya están**, pero solo como override, sin `*SlotId` en
  escena… no: sí están en ambos. Correcto.

### 2.4 Clasificación propuesta (la regla que falta)

Hay que fijar tres categorías y documentarlas, porque hoy la pertenencia es
histórica, no razonada:

| Categoría                     | Qué significa                                                           | Miembros propuestos                                                                             |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Global de proyecto**        | Una sola vez por proyecto; cambiarlo por imagen no tiene sentido físico | Lyrics, Global Background, audio/playlist, layout responsive, export                            |
| **Por imagen**                | Es composición visual; cambia con la imagen                             | Encuadre, transición, looks (pila completa), spectrum 1 y 2, logo, particles, rain, track title |
| **Por escena, no por imagen** | Es atmósfera reutilizable entre imágenes                                | Lights, Camera FX, Flash Light                                                                  |

La discusión real es dónde cae **Camera FX**. Argumento para dejarlo en escena:
si la cámara cambia de comportamiento en cada imagen, el vídeo se vuelve
epiléptico. Argumento para permitirlo por imagen: el usuario ya lo está
pidiendo implícitamente al querer aplicar cámara al spectrum y al logo por
separado. **Recomiendo: escena por defecto, override por imagen disponible pero
escondido detrás de Advanced.**

### 2.5 Deuda menor encontrada de paso

`src/types/wallpaper.ts:443-445` tiene un comentario huérfano describiendo
`spectrumSecondOverride`, un campo que **ya no existe** (solo vive en
migraciones y fixtures: `wallpaperStoreMigrations.ts:3207`). Comentario a
borrar.

---

## 3. Transiciones

### 3.1 El fade de subsistema no es un crossfade — es un parpadeo

`useVisualTransitionFade` (`src/features/visualTransition/useVisualTransitionFade.ts:60`)
hace `el.style.opacity = String(progress)` con `progress` de 0 → 1.

Pero el estado **ya se parcheó con los valores nuevos** antes de que el fade
empiece (`backgroundCollectionActions.ts:171` crea el snapshot dentro del mismo
`set`). Así que lo que ocurre es:

1. El spectrum salta a su configuración nueva instantáneamente.
2. Su wrapper se pone a `opacity: 0`.
3. Sube a 1 en 520 ms.

**El spectrum desaparece y reaparece.** No hay fundido entre el aspecto viejo y
el nuevo: el viejo simplemente se pierde. Eso es exactamente lo que se ve
"poco profesional", y no se arregla con más duración ni con otra curva.

Un crossfade de verdad exige **renderizar los dos estados a la vez** durante la
transición (dos pasadas del subsistema, o una captura del frame anterior a un
offscreen y un fundido contra él). La segunda opción es mucho más barata y es
la que recomiendo: congelar un frame y fundirlo, en vez de simular dos
spectrums vivos.

### 3.2 El lag tiene un culpable concreto: Dissolve

`drawDissolveTransition` (`imageCanvasBackgroundTransitions.ts:225`) recorre
hasta **17 columnas × 11 filas ≈ 187 celdas**, y cada celda llama a
`drawClippedBgImage` → `save()` + `clip()` + **dibujar la imagen de fondo
entera** recortada a ese tile (`imageCanvasBackgroundTransitions.ts:125`).

Son ~190 dibujos de una imagen a pantalla completa **por frame**, durante toda
la transición. A 4K eso no cabe en el presupuesto de frame de ninguna GPU
integrada. Los demás modos son mucho más baratos (`bars` ≈ 16 bandas,
`distortion` ≈ 19 franjas), así que **el problema de rendimiento no es "las
transiciones", es Dissolve** — y secundariamente `blur-dissolve`, que además
mete `ctx.filter = blur(...)` sobre la imagen completa
(`imageCanvasBackgroundTransitions.ts:109`), la operación de Canvas2D más cara
que existe.

Arreglo: dibujar la imagen **una vez a un offscreen** al inicio de la
transición y que las celdas recorten del offscreen, no de la imagen original
con toda su matemática de encuadre. Pasa de ~190 composiciones a 1 + 190 blits.

### 3.3 Demasiados controles, y duplicados

Hay **dos juegos** de los mismos ajustes:

- Globales: `slideshowTransitionType/Duration/Intensity/AudioDrive/AudioChannel/Smoothing`
  (`src/types/wallpaper.ts:1683`).
- Por imagen: `transitionType/Duration/Intensity/AudioDrive/AudioChannel`
  (`src/types/wallpaper.ts:429`).

Y los globales **se derivan de la imagen activa**
(`src/features/background/backgroundImages.ts:228`), así que no son ajustes
globales de verdad: son un espejo de la imagen activa con nombre de global.
Eso explica por qué tocar un dial "global" a veces parece que no hace nada
duradero.

Propuesta de rediseño de la UI:

- **Un preset de transición con nombre** (como los slots), elegible por imagen,
  en vez de 5 dials por imagen. Tres o cuatro presets de fábrica bien tuneados
  ("Corte limpio", "Fundido suave", "Golpe al beat", "Glitch").
- Los 5 dials pasan a **Advanced**, editando el preset, no la imagen.
- Quitar el juego "global" o renombrarlo a lo que es: "transición por defecto
  para imágenes nuevas".

### 3.4 Semántica que hay que decidir

Hoy la transición se toma de la imagen **entrante**
(`backgroundImages.ts:228` lee la imagen activa). Una transición pertenece
conceptualmente al **par** (de A a B). Tomarla de la entrante es defendible y
es lo más simple — pero hay que escribirlo, porque ahora mismo no está dicho en
ningún sitio y lleva a que el usuario edite la imagen equivocada.

---

## 4. Tiempos manuales de cambio de imagen — **HECHA** (store v123)

### 4.1 Lo que ya existe (más de lo que parece)

- `playbackSwitchAt: number | null` por imagen (`src/types/wallpaper.ts:457`).
- Modo `manualTimestampsEnabled`: con él activo,
  `slideshowPlayback.ts:90` usa `playbackSwitchAt` **y para las imágenes que no
  lo tienen cae al reparto automático** `(duración / nº imágenes) * i`.
- Una línea de tiempo con clips arrastrables: `SlideshowClipTimeline.tsx`.
- Acciones de store: `setImagePlaybackSwitchAt`,
  `setBackgroundImagePlaybackSwitchAt`, `resetAllManualTimestamps`
  (`src/store/slices/backgroundCollectionActions.ts:257`).

**El modelo mental que describe el usuario — "primero se calcula automático y
los manuales mandan" — ya es el comportamiento implementado.** Lo que falta es
la ergonomía.

### 4.2 Lo que falta

1. **El botón "marcar aquí"**. No existe (no hay clave i18n ni control). Debe:
   leer el tiempo de reproducción actual y escribir `playbackSwitchAt` **de la
   imagen siguiente**. Eso automáticamente cierra la actual, porque el final de
   un clip es el inicio del siguiente (`buildTimelineClips`, línea 145). No hace
   falta un campo `end`.
2. **Atajo de teclado** (tipo `M`), porque marcar a ojo con el ratón durante la
   reproducción es justo lo que se siente mal.
3. **Un aviso de orden**: `slideshowPlayback.ts:100` **ordena por `switchAt`**,
   así que marcar un tiempo fuera de orden reordena el pase en silencio
   respecto al orden del pool. Hay que mostrarlo en la línea de tiempo (el clip
   se mueve) o bloquearlo.
4. **Descubribilidad del modo manual**: hoy solo aparece como un toggle en el
   HUD (`qa_manual_ts_t`). El botón de marcar debería **activar el modo manual
   automáticamente** la primera vez que se usa.

### 4.3 El cruce con las transiciones — la parte que el usuario detectó bien

Hoy la imagen cambia **exactamente en** `switchAt` y la transición **empieza**
ahí. Si el usuario marca el drop a 3:00 con una transición de 1 s, la imagen
nueva no está del todo puesta hasta 3:01. Para sincronizar con música eso está
mal.

Hay que introducir una política explícita, por preset de transición:

| Anclaje  | Qué significa                                                 | Para qué sirve                                 |
| -------- | ------------------------------------------------------------- | ---------------------------------------------- |
| `start`  | La transición empieza en el timestamp (comportamiento actual) | Cortes suaves fuera de tiempo                  |
| `center` | El timestamp queda en la mitad de la transición               | Fundidos sobre un beat                         |
| `end`    | La transición **termina** en el timestamp                     | Drops: la imagen nueva llega justo en el golpe |

Recomiendo `end` por defecto para el botón de marcar, porque marcar es un gesto
de sincronía. **Esto exige arrancar la transición antes del timestamp**, o sea,
que `slideshowPlayback` mire hacia adelante — un cambio real en el resolutor,
no solo un offset en la UI.

---

## 5. Camera Motion (del análisis anterior, consolidado aquí)

### 5.1 Un solo juego de valores para todo

El estado tiene un único `cameraMotion*` + una lista de destinos
(`cameraFxDraw.ts:21`). Es literalmente el problema que las capas de efectos
resolvieron en Looks. Misma solución: `motionLayers` con valores y destinos
propios, resueltos por "gana la de arriba".

### 5.2 No puede separar Spectrum 1 de Spectrum 2 — límite arquitectónico

`overlayLayerRegistry.ts:507` pinta el spectrum principal **y todas las
instancias en el mismo canvas**, bajo un único layer `'spectrum'`. Camera
Motion es un `transform` CSS sobre la raíz de ese canvas
(`CameraFxStage.tsx:102`) y offline una transformación de canvas sobre el
subsistema `spectrum` entero (`frameComposition.ts:30`).

**Separarlos exige bajar la transformación dentro del renderer**, como
transformación por instancia, en el camino vivo y en el de export. Es la pieza
más cara de todo este plan.

### 5.3 Faltan movimientos, y el clamp es el techo real

Los 6 modos (`cameraFxDraw.ts:157`) son todos senoides continuas. Faltan:

- **Saltos de posición por beat** (estilo Osu). La detección ya existe:
  `shouldTriggerFxPeak`, hoy usada solo por Screen Shake. Reusarla como
  selector de punto de anclaje es barato.
- **Trazos con velocidad según intensidad**. Medio hecho:
  `cameraMotionDrive: 'audio'` ya acelera el tiempo con el nivel
  (`cameraFxDraw.ts:143`). Falta que la **amplitud** reaccione y que haya
  caminos no periódicos entre anclas con easing.
- **`zoom-pulse`**: hoy la escala solo se usa como zoom base oculto.
- **`lissajous`**: dos frecuencias, mucho más orgánico que un seno.

**El obstáculo:** la traslación se recorta contra la holgura que da el zoom —
`clamp(txMotion, motionSlackX)` con `maxMotionPx: 96` y `maxScale: 1.18`
(`stageFxConfig.ts:85`). Para saltos grandes hace falta **mucho más zoom en el
fondo**, o se ven los bordes. En spectrum, logo o título da igual porque no
llenan la pantalla. Por tanto **el clamp tiene que pasar a ser por tipo de
capa**, no global.

### 5.4 Conflictos de destino en la UI

Hoy dos capas pueden nombrar el mismo destino y la de abajo no hace nada, sin
aviso. Propuesta: el chip de un destino ya tomado se muestra **atenuado con el
nombre del dueño** y, al pulsarlo, **se lo quita** a la otra capa. Un destino,
un dueño.

Lo que **no** hay que hacer es bloquear duro: al reordenar capas el dueño
cambia, y presets/escenas/imports escriben `filterTargets` de golpe — un
bloqueo los rompería en silencio.

---

## 6. Fases propuestas

Ordenadas por (valor visible ÷ riesgo), no por tema.

### Fase A — Capas: propiedad de destino y guardado completo — **HECHA** (store v120)

- Chips de destino con dueño + "robar" (Looks).
- `effectLayers` dentro de `LOOKS_PROFILE_KEYS` → slot = pila completa.
- Migración de slots antiguos a capa única.
- El override por imagen de Looks guarda y restaura la pila.
- **Bump de `STORE_PERSIST_VERSION` + migración. Obligatorio.**

### Fase B — Camera Motion por capas — **HECHA** (store v124)

- `motionLayers` calcado de `effectLayers` (mismo invariante: los valores vivos
  de la capa activa son las claves planas). Modelo en
  `src/features/stageFx/motionLayers.ts`, acciones en
  `src/store/slices/motionLayerActions.ts`.
- `stepCameraFx` resuelve **una capa por destino** (gana la de arriba, nunca se
  mezclan) y lleva un reloj por capa en `CameraFxRuntime.motionTimes`; el margen
  de zoom se calcula por capa porque la amplitud es por capa.
- Slot de Camera FX guarda el array completo desde el día uno
  (`motionLayers` + `activeMotionLayerId` en `CAMERA_FX_PROFILE_KEYS`).
- UI: `MotionLayerStack` (solo Advanced) + chips de destino con dueño y robo,
  igual que en Looks.

### Fase C — Movimientos nuevos y reactividad — **HECHA** (store v125)

- `beat-jump`, `path-trace`, `zoom-pulse`, `lissajous` en `motionOffsetForMode`.
- Amplitud reactiva al audio (`cameraMotionAmplitudeAudio`), independiente de la
  velocidad reactiva que ya existía.
- Clamp por tipo de capa: `cameraMotionIsEdgeBound` decide si la capa se queda
  dentro del margen de zoom (mueve el cuadro) o usa la amplitud completa (flota
  encima).

### Fase D — Separar Spectrum 1 / Spectrum 2 en la cámara

- Bajar la transformación al renderer, por instancia.
- Vivo **y** export. Es la fase más invasiva; va sola.

### Fase E — Transiciones

- **E1 (rendimiento)**: offscreen para Dissolve y `blur-dissolve`.
- **E2 (calidad)**: crossfade real por captura de frame, en vez del fade desde 0.
- **E3 (UI)**: presets de transición con nombre; los 5 dials a Advanced;
  eliminar el juego "global" duplicado.
- **E4**: extender el crossfade a spectrum/logo/particles/rain con la misma
  captura.

### Fase F — Tiempos manuales

- Botón "marcar aquí" + atajo de teclado; activa el modo manual solo.
- Política de anclaje de transición (`start` / `center` / `end`), por defecto
  `end` al marcar.
- Aviso visual cuando marcar reordena el pase.

### Fase I — UI de escenas — **HECHA** (sin cambio de persistencia)

- Tres estados por subsistema como **tres botones** (`SceneBindingRow`), no como
  las dos primeras opciones del desplegable de slots. El selector de slot aparece
  solo cuando el estado es «Slot».
- `resolveSceneBindingChange` / `sceneBindingMode` (`features/scenes/sceneSlot.ts`)
  son puras y tienen test: pulsar «Slot» sin ningún slot guardado **no hace nada**,
  en vez de atar la escena a un slot vacío.
- «Capturar escena actual» ya existía (`captureSceneSlotFromCurrent`, con test) y
  se deja como está: el botón de cámara de la cabecera de Scenes.

### Fase G — Coherencia de "per image" — **HECHA** (store v126)

- Documentar y aplicar las tres categorías (global / por imagen / por escena).
- Override por imagen de Camera FX y Lights detrás de Advanced.
- Borrar el comentario huérfano de `spectrumSecondOverride`.
- Una pantalla única que muestre **qué lleva esta imagen** (hoy está repartido
  entre `ActiveWallpaperSection`, `ImageSceneAssignment` y el panel PER IMG del
  HUD).

**Cómo quedó:**

- Tres claves nuevas por imagen: `cameraFxOverride`, `lightsOverride`,
  `trackTitleOverride` (`types/wallpaper.ts`), con sus `set*` / `capture*` en
  `store/slices/backgroundSlice.ts`, incluidas en `captureCompositionToAllImages`
  y en la migración **v126** (todas a `null`: ninguna imagen gana una composición
  que no tenía).
- Se aplican **tal como se guardaron, con su interruptor**, no como logo/spectrum
  (que preservan el `*Enabled` vivo): una composición guardada tiene derecho a
  decir «y aquí sin shake». Por eso van sobre `extract…(state)`, que rellena las
  claves que un snapshot viejo no traía.
- La precedencia entera vive en **una** función pura nueva,
  `describeImageComposition` (`src/store/imageCompositionSummary.ts`), que
  describe el orden de `buildActiveImageSelectionPatch`: modo global → escena
  efectiva → override inline → slot de la imagen → controles globales. La UI no
  la recalcula.
- `ImageCompositionPanel` es esa pantalla única. Cada fila dice **qué fuente
  gana** y marca el caso que antes era invisible: un override _guardado pero
  tapado_ por la escena. Absorbe `ImageSceneAssignment` y sustituye la lista de
  overrides; `ActiveWallpaperSection` pierde los 10 callbacks que le llegaban por
  props desde `BackgroundTab`.
- El panel PER IMG del HUD se queda como está a propósito: es un atajo de
  captura rápida, no una pantalla de configuración.
- `spectrumSecondOverride` **no se reintrodujo**. Estaba retirado desde la v103
  (cada override guardado se convirtió en un slot con nombre de Spectrum 2) y la
  migración lo borra de cada imagen en cada carga; el ítem del plan era el
  comentario huérfano, no el campo. Reponerlo habría creado una clave que la
  propia migración borra en el siguiente arranque.

---

## 7. Riesgos y cosas que NO hay que hacer

- **No mezclar A con E.** Capas y transiciones tocan sitios distintos; juntarlas
  en un commit hace imposible bisecar una regresión visual.
- **No convertir Lyrics en per-image.** Pertenece a la canción. Si alguien lo
  pide, es señal de que falta otra cosa (probablemente estilos de letra por
  sección).
- **No subir `maxScale` globalmente** para que quepan los saltos de cámara:
  recorta el fondo de todo el mundo. El clamp es por tipo de capa o no es.
- **No hacer crossfade renderizando dos spectrums vivos.** Duplica el coste del
  subsistema más caro del programa. Captura de frame.
- **Cada fase que toque una clave persistida lleva su propio bump y su propia
  migración.** Agrupar dos cambios de forma en una versión hace la migración
  imposible de revertir.

---

## 8. Estado de verificación

Lo que afirma este documento sobre el código está leído directamente de los
archivos citados, a fecha **2026-09-24**, sobre `main`.

**No verificado** (haría falta medir, no leer):

- El coste real en ms de la transición Dissolve a 4K. La cuenta de ~190
  dibujos por frame es del código; el impacto medido, no.
- Si el `useWallpaperStore.subscribe` por capa de
  `useVisualTransitionFade.ts:82` contribuye al lag de UI. Es un callback
  barato, pero se suscribe una vez por capa visual montada.
- Si hay algún camino, además de `activeImageSelection.ts`, que escriba las
  claves planas de Looks sin pasar por las capas.

---

## 9. Dissolve: decisión tomada

Hay dos caminos y no son excluyentes, pero conviene decir cuál se hace primero.

**Se optimiza, no se borra.** Razón: el arreglo es pequeño y acotado — dibujar
la imagen **una vez** a un offscreen al empezar la transición y que las celdas
hagan `drawImage` de ese offscreen. Pasa de ~190 composiciones completas por
frame a 1 composición + 190 blits, que es lo que un navegador hace sin
despeinarse. Borrar un modo que el usuario ya usó en vídeos publicados rompe
proyectos guardados; optimizarlo no rompe nada.

**Después** se cura el catálogo. Los 9 modos actuales se escribieron a mano y
se nota: unos son sólidos (`fade`, `slide-*`, `zoom-in`) y otros son de relleno.
La referencia obvia para reemplazarlos por transiciones de calidad es el
catálogo **gl-transitions** (MIT, ~80 transiciones escritas como shaders GLSL
de un solo `transition(vec2 uv)`), que es el estándar de facto en editores web.
El proyecto ya tiene Three.js/R3F, así que hay ruta técnica para portarlas como
paso GL en vez de como matemática de Canvas2D.

Eso es un cambio de motor de transiciones, no un pulido — **va en su propia
fase (E5) y después del lanzamiento si hace falta**. Lo que no puede quedarse
como está es el coste de Dissolve.

---

## 10. Los tres sitios donde se guarda lo mismo

Hoy una composición puede vivir en tres capas de guardado y **nadie ha escrito
la jerarquía**. Leída del código (`src/store/activeImageSelection.ts:48-63`),
la real es ésta, y tiene una sorpresa:

1. **Escena** de la imagen, o la escena por defecto global
   (`resolveEffectiveSceneSlotId`, `sceneSlot.ts:45`).
   → **Si hay escena, la función devuelve ahí mismo.**
2. Override inline por imagen (`logoOverride`, `spectrumOverride`, …).
3. Referencia a slot por imagen (`spectrumProfileSlotId`, …).
4. Lo que hubiera en el estado (heredado de la imagen anterior).

**La sorpresa: los pasos 2 y 3 no se ejecutan nunca si la imagen tiene escena**
— ni siquiera si el override existe. El código los llama literalmente
_"legacy back-compat fallback"_. O sea: el codebase ya decidió que el modelo
bueno es la escena y que per-image es lo viejo, pero la UI de escenas es tan
incómoda que el usuario vive en el camino "viejo" sin saberlo.

Hay que elegir una de las dos y decirlo:

- **Opción 1 — escena primero de verdad**: arreglar la UI de escenas (§11) y
  dejar per-image como atajo.
- **Opción 2 — per-image primero**: la escena es una plantilla que _rellena_ la
  imagen al asignarla, y a partir de ahí la imagen manda.

**Recomiendo la 2.** Es la que coincide con cómo el usuario ya trabaja, no
tiene cortocircuito invisible, y convierte las escenas en algo opcional en vez
de en un modo paralelo. Además hace que "guardar" signifique siempre lo mismo:
se guarda en la imagen.

### 10.1 El modo global que pisa (sin borrar)

Falta un modo que el usuario pidió explícitamente y que hoy no existe:

> Un interruptor global que **ignore** los overrides por imagen sin
> sobreescribirlos, para poder ajustar la composición entera de un vídeo de una
> sola vez; y un botón **"Guardar en todas"** que sí los escriba, a propósito.

Diseño propuesto:

- `globalCompositionOverride: boolean` (nuevo, persistido → bump + migración).
- Con él activo, `buildActiveImageSelectionPatch` **no aplica** escena ni
  override ni slot: el estado actual manda y cambiar de imagen solo cambia la
  imagen. Nada se borra.
- Por imagen, un `ignoreGlobalOverride: boolean` para que una imagen concreta
  pueda seguir mandando aun en modo global (es lo que pidió: _"que la propia
  imagen tenga en su configuración si ese modo global está activo"_).
- Botón **"Guardar en todas"**, destructivo → `useDialog().confirm()` con
  recuento explícito ("se escribirán 34 imágenes").
- Indicador permanente en el HUD mientras el modo está activo. Un modo global
  invisible que ignora lo guardado es una trampa; tiene que verse siempre.

### 10.2 Lo que falta añadir a per-image

Con la Opción 2, una imagen debe poder llevar todo lo que lleva una escena:

| Añadir                          | Tipo                                                          | Nota                                                                                      |
| ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `cameraFxOverride`              | `CameraFxProfileSettings` (o la pila de capas tras la Fase B) | El que el usuario pidió primero                                                           |
| `lightsOverride`                | `LightsProfileSettings`                                       | Ya existe el slot y la escena                                                             |
| `trackTitleOverride`            | `TrackTitleProfileSettings`                                   | Ya existe el slot y la escena                                                             |
| `flashLightOverride`            | pendiente de definir sus claves de perfil                     | Hoy no está ni en escena                                                                  |
| `looksOverride` → pila completa | `effectLayers` + activa                                       | Fase A                                                                                    |
| `spectrumSecondOverride`        | Spectrum 2                                                    | El campo **se borró**; la escena sí lo tiene (`spectrumSecondSlotId`). Asimetría a cerrar |

Cada uno es una clave persistida nueva dentro de `BackgroundImageItem` → **un
bump por fase, con su migración**. No agrupar.

---

## 11. Escenas: por qué nadie las usa

Dato del propio usuario: en el proyecto exportado real solo usó **setlist de
imágenes y audios**; ninguna escena por imagen. La causa que da es la interfaz:
desplegables.

Y tiene razón estructural: una escena es una fila de **9 referencias**
(`spectrumSlotId`, `spectrumSecondSlotId`, `looksSlotId`, `particlesSlotId`,
`rainSlotId`, `lightsSlotId`, `cameraFxSlotId`, `logoSlotId`,
`trackTitleSlotId`), y **cada una tiene tres estados** (`null` = no tocar,
`'off'` = apagar, id = aplicar ese slot). Eso son 9 desplegables con semántica
de tres valores que no es evidente en un `<select>`. Es una hoja de cálculo
disfrazada de panel.

Rediseño propuesto — **una rejilla de subsistemas, no una lista de campos**:

- Una tarjeta por subsistema, con su icono.
- Tres estados en un botón de ciclo con color propio:
  **gris = no tocar · tachado = apagar · el nombre del slot = aplicar**.
- El slot se elige pulsando la tarjeta (popover con los slots y su miniatura),
  no con un desplegable.
- Arriba, lo que hoy falta del todo: **"Capturar la composición actual como
  escena"**. Hoy `captureSceneSlotFromCurrent` es un stub, así que crear una
  escena obliga a montarla campo a campo. Es probablemente **la razón número
  uno** de que nadie las use, más que los desplegables.

---

## 12. El futuro: línea de tiempo de eventos (el guion)

La dirección a la que apunta todo esto, y que conviene escribir ahora para no
tomar decisiones que la impidan:

> Un nivel **por encima** del global: una línea de tiempo donde el usuario
> declara **eventos del sistema** con un tiempo — _"en el segundo 84, aplicar el
> slot 3 de partículas"_ —, de modo que cambiar algo deje de depender de que
> cambie la imagen. Un guion determinista del vídeo.

Por qué encaja con lo que ya hay:

- **Ya existe el vocabulario**: un evento es "aplicar el slot X del subsistema
  Y", y los slots ya tienen id estable (`ProfileSlot.id`, backfilled en v104).
  Una escena **ya es** un conjunto de esas referencias. Un evento de timeline es
  una escena con un tiempo pegado.
- **Ya existe el determinismo**: el export offline aplica la selección de imagen
  con la misma función que el preview (`buildActiveImageSelectionPatch`), y el
  `playbackSwitchAt` ya es un evento con tiempo. La línea de tiempo generaliza
  eso.
- **Ya existe la superficie**: `SlideshowClipTimeline` dibuja tiempo, clips y
  playhead. Le faltan pistas.

Condiciones para que esto sea posible, que **hay que respetar en las fases
A–G**:

1. **Todo lo aplicable debe ser un slot con id**, nunca un puñado de claves
   sueltas. Por eso la regla de §1.4 (los slots guardan la pila completa) no es
   solo higiene: es el requisito del guion.
2. **Aplicar un evento debe ser una función pura `(state, evento) → patch`**,
   como ya lo es la selección de imagen. Sin tocar el store desde la UI.
3. **Los eventos se ordenan por tiempo y se resuelven "el último que pasó
   manda"**, igual que `slideshowPlayback` ya hace con `playbackSwitchAt`.
4. Las transiciones necesitan el anclaje de §4.3 antes de esto, o los eventos
   caerán fuera de tiempo igual que hoy.

Esto **no se implementa en este plan**. Se apunta para que ninguna fase cierre
la puerta.

---

## 13. Higiene de versión (esto se nos olvida)

Cada fase que toque estado persistido tiene que mover **tres cosas a la vez**, y
hasta ahora se ha movido solo una:

1. `STORE_PERSIST_VERSION` en `src/lib/version.ts` + su migración.
2. `APP_VERSION` / `package.json` — **hoy congelado en `0.4.1-alpha`** aunque
   han entrado funciones enteras (capas de efectos, entre otras). `docs:check`
   verifica que `APP_VERSION` y `package.json` coincidan, pero **no** que la
   versión suba cuando entra una función: eso es disciplina humana.
3. `CHANGELOG.md` con la sección de esa versión.

**Regla a aplicar desde la Fase A**: una fase que añade función de usuario sube
la **minor** de alpha (`0.4.1-alpha` → `0.5.0-alpha`); una que solo corrige,
la patch. Y la fase no se da por cerrada sin las tres.

---

## 14. Fases (actualizado)

| Fase   | Qué                                                                            | Persistencia     |
| ------ | ------------------------------------------------------------------------------ | ---------------- |
| **A**  | ✅ Capas: propiedad de destino + el slot/override guarda la pila completa      | v120 hecho       |
| **B**  | ✅ Camera Motion por capas (`motionLayers`)                                    | v124 hecho       |
| **C**  | ✅ Movimientos nuevos + amplitud reactiva + clamp por tipo de capa             | v125 hecho       |
| **D**  | Separar Spectrum 1 / 2 en la cámara (transformación en el renderer)            | —                |
| **E1** | ✅ Dissolve y compañía a offscreen (el lag)                                    | hecho            |
| **E2** | Crossfade real por captura de frame (la calidad)                               | —                |
| **E3** | Presets de transición con nombre; dials a Advanced; quitar el duplicado global | bump + migración |
| **E4** | Extender el crossfade a spectrum/logo/particles/rain                           | —                |
| **E5** | _(post-lanzamiento)_ Motor GL de transiciones estilo gl-transitions            | —                |
| **F**  | ✅ Botón "marcar aquí" + atajo `M` + anclaje de transición                     | v123 hecho       |
| **G**  | ✅ Coherencia per-image + pantalla única «qué lleva esta imagen»               | v126 hecho       |
| **H**  | ✅ Modo global que pisa per-image sin borrarlo + "Guardar en todas"            | v121 hecho       |
| **I**  | ✅ UI de escenas con botones de tres estados + "capturar escena actual"        | sin persistencia |
| **J**  | _(futuro, no en este plan)_ Línea de tiempo de eventos                         | —                |

Orden de ejecución: **A → E1 → H → F → B → C → G → I → E2 → E3 → E4 → D**.
E1 se adelanta porque es el arreglo más barato del síntoma más molesto, y H y F
se adelantan porque son los que cambian el día a día del usuario.
