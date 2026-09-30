# Nivel 05 — Los demás subsistemas (la vuelta completa)

> Requisitos: niveles [00](./00-fundamentos.md)–[04](./04-spectrum-engine.md).
> Aquí ya no aprendemos conceptos nuevos de base: **aplicamos el mapa** que ya
> tienes (store → capas → dibujantes; snapshot de audio; patrón registry;
> settings vs. runtime) a cada subsistema restante. Cada sección responde lo
> mismo: _qué es, dónde vive, cómo encaja en lo que ya sabes_.

---

## Índice

1. [Letras de canciones: Lyrixa](#1-letras-de-canciones-lyrixa)
2. [Stage FX: luces, flashes y cámara](#2-stage-fx-luces-flashes-y-cámara)
3. [Motion: partículas y lluvia](#3-motion-partículas-y-lluvia)
4. [Perfiles, escenas y setlists](#4-perfiles-escenas-y-setlists)
5. [Export: sacar tu trabajo de la app](#5-export-sacar-tu-trabajo-de-la-app)
6. [El design system: `src/ui/`](#6-el-design-system-srcui)

---

## 1. Letras de canciones: Lyrixa

**Dónde:** `src/features/lyrics/` (6 archivos) + el dibujante
`src/features/lyrics/runtime/LyricsOverlay.ts` + la pestaña Lyrics.

**La decisión de diseño más importante:** este proyecto **no es un editor de
letras**. Hubo un mini-editor local y se eliminó a propósito. Las letras se
autoran en una herramienta externa llamada **Lyrixa**, que produce un
**bundle** (un paquete autocontenido con las líneas, sus tiempos y sus capas
de estilo). Aquí solo se hace tres cosas: **importar** el bundle, elegir el
modo de dibujo, y ajustar estilo.

> **Analogía:** somos el **cine, no el estudio de doblaje**. La película
> llega con los subtítulos ya sincronizados; en el cine solo eliges el
> proyector y el tamaño de la fuente.

Las piezas:

- `types.ts` — cada pista de la playlist puede llevar una entrada de letras
  (`AudioLyricsTrackEntry`): la fuente (`auto`/`lrc`/`plain`), el bundle de
  Lyrixa si existe, y el modo de render.
- `parser.ts` + `cache.ts` — para letras simples sin bundle: el parser
  entiende formato **LRC** (el clásico `[00:12.34] verso…` con tiempos) y
  texto plano; el cache evita reparsear.
- `lyrixaBundle.ts` / `lyrixaBundleTypes.ts` — lectura y validación tipada
  del paquete de Lyrixa.
- `lyrixaBundleRenderer.ts` — el dibujado fiel del bundle (con sus capas).
- **Dos modos de render** por pista: `bundle` (dibuja Lyrixa tal cual lo
  autoró, fiel al diseño original) o `editor` ("Native/Look": el texto se
  dibuja con el estilo configurado aquí). En modo bundle se pueden aplicar
  **overrides por capa** (mover/escalar/recolorear capas individuales del
  bundle sin tocar el original).

¿Cómo se dibuja? Ya lo sabes: `lyrics` es una de las 4 capas de audio del
Nivel 02 — `LyricsOverlay` corre dentro de `AudioLayerCanvas`, lee el tiempo
actual de la pista (vía el contexto de audio) y pinta las líneas que tocan,
con su layout y su relleno (incluidos degradados de texto).

---

## 2. Stage FX: luces, flashes y cámara

**Dónde:** `src/features/stageFx/` (5 archivos). Estado en
`stageCameraSlice`. Los tres ya los viste montados en el director (Nivel 02,
sección 3.3) — aquí va qué hace cada uno:

- **`StageLightsCanvas.tsx`** — los **haces de luz de concierto**: vigas que
  salen de un origen configurable (arriba, abajo, lados, todos…) y pulsan con
  la energía del canal elegido, cada viga con su fase para que no respiren
  todas a la vez. Es un lienzo Canvas 2D con su propio bucle (con las
  optimizaciones de rendimiento ya aplicadas: early-out cuando no hay nada
  que pintar, color rápido, blur según `performanceMode`).
- **`FlashLightCanvas.tsx`** — los **flashes de impacto**: destellos desde
  los bordes disparados por picos del audio. Es una capa separada de las
  luces (se activan independientemente) con su propia máquina de estados de
  animación (`flashEdgeDrive.ts`).
- **`CameraFxStage.tsx`** — el **temblor/movimiento de cámara**. No dibuja
  nada: es el envoltorio que aplica transformaciones (sacudidas con los
  picos, vaivén continuo) a las capas visuales. Recuerda la regla: envuelve
  SOLO el wallpaper; el HUD y el editor quedan fuera.
- **`stageFxConfig.ts`** — los límites y utilidades compartidas: topes de
  vigas y de píxeles de movimiento, y los helpers de umbral/pico
  (`shouldTriggerFxPeak` etc.) que comparten luces, flashes y cámara para que
  "pico" signifique lo mismo en los tres.

Luces y Cámara tienen **perfiles guardables** (slots) como el resto de
features, y las escenas pueden referenciarlos (sección 4).

---

## 3. Motion: partículas y lluvia

**Dónde:** los dibujantes GPU `ParticleField.tsx` (975 líneas),
`ParticlesBackground/Foreground.tsx` y `RainLayer.tsx` en
`components/wallpaper/`; shaders en `src/shaders/`; los controles del editor
en `features/particles/controls/` y `features/rain/controls/`; el randomizador
en `features/particles/presets/`; estado en `particlesRainSlice`.

> Ojo con el nombre: **no existe una carpeta `features/motion/`**. "Motion" es
> el nombre de una **pestaña** del editor (`tabs/main/MotionTab.tsx`) que
> apila secciones de tres dominios distintos — partículas, lluvia y Stage FX —
> no el nombre de un dominio. Si buscas el código de las partículas, la
> carpeta es `features/particles/`.

### Partículas (`ParticleField`)

El plato fuerte del dibujante GPU del Nivel 02. Cómo funciona por dentro,
contado simple:

- Se crea **una geometría con miles de puntos** (un "BufferGeometry" de
  Three.js: básicamente las listas de posiciones/tamaños/colores de todos los
  puntos en un solo paquete para la GPU).
- Dos **shaders** propios (`particleVertex.glsl` y `particleFragment.glsl`)
  corren EN la GPU: el primero decide dónde y de qué tamaño está cada punto
  en este cuadro; el segundo, de qué color y forma se pinta (9 formas:
  círculos, estrellas, cruces…).
- El mundo de las partículas usa coordenadas propias normalizadas, y la capa
  se monta dos veces si hace falta (delante y/o detrás del wallpaper, según
  `particleLayerMode` — por eso viste DOS capas de partículas en
  `layers.ts`).

Lo configurable (todo audio-reactivo si quieres):

- **Drift** (deriva con el audio): 3 modos — `velocity` (el audio acelera),
  `offset` (el audio desplaza), `burst` (el audio dispara ráfagas).
- **Depth flow** (flujo en profundidad): las partículas viajan hacia ti o
  alejándose (`towardViewer`/`awayFromViewer`) con modos de
  comportamiento (pullToCamera, pushFromFocus, tunnelBurst, snowRush) y
  **orígenes de spawn** (desde dónde renacen: pantalla aleatoria, el foco,
  los bordes, el centro, arriba, abajo) más influencia de viento.
- Rotación, color (sólido/degradado/arcoíris/RGB rotativo), filtros propios.

`features/particles/presets/particlesRandomizer.ts` genera perfiles
aleatorios coherentes
(el botón de "sorpréndeme").

### Lluvia (`RainLayer`)

La lluvia es **deliberadamente "clásica" y congelada**: tipos de gota
(líneas/gotas/puntos/barras), color sólido o arcoíris, y para de contar. El
propio código lleva la nota: _TODO (V2): fusionarla en el emisor de
partículas_ (como partículas-racha). Hasta entonces, es un dibujante GPU
aparte con sus propios shaders, que se apaga sola en `performanceMode: low`
(lo viste en `layers.ts`).

> Si vas a añadir features de lluvia: **no**. La decisión registrada es no
> invertir en la V1; el futuro de la lluvia es ser un modo de partículas.

---

## 4. Perfiles, escenas y setlists

Tres niveles de "guardar mi configuración", de menor a mayor alcance. Esta
jerarquía es de las cosas que más confunden al llegar, así que despacio:

### 4.1 Perfiles por feature (slots)

Casi cada feature (espectro, logo, partículas, lluvia, looks, luces, cámara,
título…) tiene **slots de perfil**: huecos numerados donde guardas "mi
configuración favorita de ESTA feature". Viven en el store
(`spectrumProfileSlots`, `logoProfileSlots`…) y la maquinaria común está en
`src/store/featureProfiles.ts` (1.006 líneas): los extractores ("saca del
estado solo las claves de esta feature"), los hidratadores ("rellena lo que
falte con defaults") y los topes de slots.

### 4.2 Escenas (`features/scenes/sceneSlot.ts`)

Una **escena** es una **receta de composición**: "espectro del slot 2 +
looks del slot 0 + partículas apagadas + lo demás como esté". Las reglas
duras están en el comentario de cabecera del archivo y conviene citarlas:

- Una escena **NO guarda valores**: solo **referencias** a slots de cada
  feature (`spectrumSlotIndex`, `looksSlotIndex`, `particlesSlotIndex`,
  `rainSlotIndex`, `lightsSlotIndex`, `cameraFxSlotIndex`, `logoSlotIndex`,
  `trackTitleSlotIndex`).
- Cada referencia puede ser: un **número** (aplica ese slot), **`'off'`**
  (fuerza la feature apagada), o **`null`** (no toques esa feature: se queda
  como esté).
- Los valores siguen siendo propiedad de cada feature; la escena **solo
  lee**. Aplicar una escena = resolver cada referencia y construir un parche
  de estado (`buildSceneSlotActivationPatch`).

Regla de UX registrada como feedback: **editar una escena no la aplica**;
los huecos vacíos se muestran deshabilitados; aplicar es un acto explícito
con diff visible. Nada de magia silenciosa.

> **Analogía:** la escena es el **programa de mano** de la función: "esta
> noche: iluminación nº 2, vestuario nº 5, sin lluvia". No contiene los
> vestidos: contiene los números de percha.

### 4.3 Setlists (`setlistsSlice`)

Una **setlist** es una **curación con nombre del pool global**: qué imágenes
(y pistas) participan. La biblioteca sigue siendo global; la setlist guarda
**referencias por id**. Su regla de activación es estricta: con
`activeSetlistId = null` ves el pool completo; con una setlist activa, **todo
filtra** a sus elementos — el pool visible, la playlist, el ciclo del
slideshow y el auto-avance de audio. Hay un chip en el HUD para saber cuál
está activa.

### 4.4 Y además: overrides por imagen

Del Nivel 01 recuerda que cada imagen del pool puede llevar **sus propios
slots/overrides** (logo, espectro, partículas, lluvia, looks por imagen):
cuando esa imagen se activa, su configuración pisa la global. Es otra capa de
la misma idea: configuración con dueño claro y aplicación explícita.

---

## 5. Export: sacar tu trabajo de la app

**Dónde:** `src/features/export/` (13 archivos) + la pestaña Export
(`components/controls/tabs/export/`). Hay **dos caminos de export**
distintos, no uno:

> Hubo un tercero — grabación en vivo con `MediaRecorder`, tiempo real y a
> merced de los FPS de la máquina. Se **eliminó el 2026-09-30**: no era
> determinista y el render offline lo supera en todo.

### 5.1 Render offline (`offlineExportPlanner` + `renderFrame`)

El camino serio, y la razón de la arquitectura interesante:

- **Offline = no en tiempo real.** Se pre-analiza el audio completo
  (`offlineAudioAnalysis.ts`), se planifica cuadro a cuadro
  (`offlineExportPlanner.ts`), y se renderiza cada cuadro con calma
  (`renderFrame.ts`) — aunque tarde más que la duración real. Resultado:
  vídeo perfecto a FPS constantes aunque tu máquina no pueda en vivo.
  Usa WebCodecs (`VideoEncoder`) si el navegador lo tiene.
- Para eso, el dibujo se reorganiza en **render subsystems**
  (`renderSubsystem.ts`): otro **registry** (¡el patrón del Nivel 04 otra
  vez!) donde cada subsistema visual (logo, espectro, título…) se registra
  con su función `render(ctx)` y un orden fijo. Los subsistemas de audio ya
  están implementados (`renderSubsystems/audioLayers.ts`); otros son aún
  **stubs** (huecos declarados pero sin implementación completa —
  `renderSubsystems/stubs.ts`): el export offline todavía no cubre todas las
  capas.

### 5.2 Paquete de proyecto (`useProjectPackageExport`)

Exporta **tu proyecto entero** (configuración + imágenes + audios) a un
archivo, e importa el de otra persona. Detalles con cicatrices:

- **Protección anti-reventón:** antes de empaquetar un asset se consulta su
  tamaño (`getImageAssetByteLength`, Nivel 01) sin cargarlo; los audios
  enormes sin letras pueden excluirse para que el paquete no mate la pestaña
  — y si pasa, **se avisa** en vez de fallar en silencio.
- **El gotcha de `structuredClone`** (Nivel 01): el estado lleva funciones
  dentro, así que el export/import usa copias superficiales y el merge de
  imports parciales (p. ej. ajustes sin audio) es deliberadamente cuidadoso.
- También hay export de **solo ajustes** (JSON pequeño, sin binarios) y un
  chequeo de salud del proyecto (`lib/projectHealth.ts`).

---

## 6. El design system: `src/ui/`

**Dónde:** `src/ui/` — 26 componentes base + `tokens/`.

Es el **kit de piezas oficial** de la interfaz del editor: `Button`,
`Slider`/`SliderRow`, `ToggleSwitch`, `Select`, `SegmentedControl`,
`SectionCard`, `CollapsibleSection`, `Tabs`, `ProfileSlotsEditor` (el editor
genérico de slots de perfil que usan todas las features), `EditorTabLayout` /
`Header` / `Footer` (el esqueleto estándar de toda pestaña)…

Los **tokens** (`tokens/`: spacing, radius, colors, glow, blur, motion,
z-index) son los valores oficiales de diseño: si un componente necesita un
espaciado, lo toma de ahí, no se lo inventa. Así toda la UI envejece junta.

Dos piezas con regla de oro asociada:

- **`FeatureGate`** — el patrón **estricto** de "interruptor apagado =
  cuerpo oculto": el switch maestro de una feature vive en la cabecera
  (siempre visible) y el cuerpo de controles se renderiza SOLO si está
  encendida; apagada, ves el switch y una línea de pista, nunca controles
  muertos. Toda pestaña nueva debe usarlo. (Lyrics es la excepción
  registrada.)
- **`FloatingPanel`/inline** — recuerda la regla nº 3 del Nivel 00: nada de
  modales a pantalla completa que tapen el wallpaper; se prefiere acordeón
  inline y paneles que dejan ver el resultado.

**Nota de historia** (por si lees docs o memorias viejas): existió un flag
`editorUiVariant: legacy | modern` para convivir dos generaciones de UI.
**Ya no existe** — la migración terminó, y las pestañas actuales viven en
`components/controls/tabs/main/` (renombrada desde `tabs/modern/` en 2026-06,
cuando "modern" pasó a significar "la UI actual"). El shell de todo esto es
`ControlPanel.tsx` (1.235 líneas;
candidato a dieta, ver Nivel 06).

---

## 7. Glosario nuevo de este nivel

- **Lyrixa / bundle:** la herramienta externa que autora letras y su paquete
  autocontenido. Aquí solo se importa, estiliza y dibuja.
- **LRC:** formato clásico de letras con marcas de tiempo.
- **Override por capa:** retoque local sobre una capa de un bundle sin
  modificar el original.
- **BufferGeometry:** el paquete de datos (posiciones, tamaños, colores) de
  miles de puntos que se entrega a la GPU de una vez.
- **Spawn / respawn:** dónde "nace" una partícula cuando entra o se recicla.
- **Slot de perfil:** hueco numerado para guardar la configuración de UNA
  feature.
- **Escena:** receta de composición que referencia slots (número / 'off' /
  null). No posee valores.
- **Setlist:** curación con nombre del pool global; al activarse, todo
  filtra a ella.
- **Render offline:** renderizar sin tiempo real, cuadro a cuadro, para
  vídeo perfecto.
- **Stub:** pieza declarada pero aún no implementada del todo.
- **Token (de diseño):** valor oficial de espaciado/color/etc. del kit de UI.
- **`FeatureGate`:** el envoltorio canónico "apagado ⇒ cuerpo oculto".

---

## 8. Resumen en una frase

> Letras: **Lyrixa autora, aquí se proyecta**. Stage FX: tres lienzos
> (luces, flashes, cámara) que comparten la definición de "pico". Motion:
> miles de puntos en la GPU con drift/profundidad/spawn configurables, y una
> lluvia congelada esperando ser partícula. La configuración escala en tres
> niveles — **slots por feature → escenas (recetas de referencias) →
> setlists (curaciones del pool)** — siempre con aplicación explícita. El
> export tiene **tres caminos** (grabar en vivo, render offline por
> subsystems, paquete de proyecto). Y toda la UI se construye con el kit de
> `src/ui/`, con `FeatureGate` como ley.

---

**Siguiente:** [`06-deuda-tecnica.md`](./06-deuda-tecnica.md) — el mapa
honesto de lo que cruje: dónde está la deuda, por qué existe, y por dónde
atacarla sin romper nada.
