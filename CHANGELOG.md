# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project follows
the version scheme in `src/lib/version.ts`.

> **Versioning note** — three independent version numbers live in
> `src/lib/version.ts` and must not be conflated:
>
> - `APP_VERSION` — the human-facing product version (matches `package.json`).
> - `PROJECT_SCHEMA_VERSION` — the export/import project-package format.
> - `SETTINGS_SCHEMA_VERSION` — the standalone settings-file format.
> - `STORE_PERSIST_VERSION` — the Zustand `localStorage` migration counter (bumped
>   on every persisted-state shape change; **not** a product version).

## [Unreleased]

### Export de vídeo offline — Fase 1A/1B (en curso)

- **Exportar vídeo** (tab Export) genera un MP4 (H.264 + AAC) o, si el
  navegador no puede, WebM (VP9 + Opus), frame a frame a partir del audio del
  proyecto. No usa `getDisplayMedia`, no depende de que la pestaña esté visible
  y el resultado no depende de la velocidad de la máquina.
- Capas exportadas: fondo (imagen activa con bass zoom), spectrum, logo, track
  title y letras Lyrixa. Partículas, lluvia, overlays, fondo global, Stage FX y
  slideshow aún no: el planner avisa de cada una.
- Resolución y fps elegibles, progreso por fase con ETA, cancelación. Con
  `showSaveFilePicker` escribe en streaming al archivo (y lo descarta al
  cancelar); sin él, descarga al final.
- Nueva dependencia: `mediabunny` (MPL-2.0).

## [0.4.1-alpha] — 2026-09-13

**Fase 0 del [plan maestro de lanzamiento](docs/plans/PLAN_MAESTRO_LANZAMIENTO.md):**
higiene y deuda de la review del 2026-09-12. Sin features nuevas; store sigue en v113.

### i18n: la UI en inglés ya no muestra español

- Calibration (60 parámetros, 6 grupos, preview de envelope), descripciones de
  los Looks de fábrica, panel Insights y el pie de Diagnostics estaban escritos
  en español dentro del código. `calibrationConfig.ts` y `filterLooks.ts` ahora
  llevan `TranslationKey`s que se resuelven con `useT()`.
- Nombres por defecto de slots de calibración: `Calibration N` (como el resto
  de familias). Los slots ya guardados conservan su nombre.
- **Nuevo `pnpm i18n:check`** (`scripts/check-i18n-literals.mjs`): falla si un
  literal o texto JSX fuera de `src/lib/i18n` contiene caracteres solo del
  español. Añadido a la lista de AGENTS.md.

### Clear saved settings borra de verdad

- Solo quitaba claves de `localStorage`, pero el estado vive en IndexedDB y las
  copias `lwag-*` previas al renombrado se re-adoptan si falta la nueva: lo
  borrado podía volver. Nuevo `clearPersistedState()` limpia las tres. La
  biblioteca de imágenes/carpetas se conserva a propósito y el diálogo lo dice.

### Migración v110 ya no pierde el Custom look

- Con los 60 slots de Looks llenos, el Custom look legacy se descartaba en
  silencio. Ahora ocupa un slot vacío si lo hay y, si el banco está realmente
  lleno, se queda en `customFilterLookSettings` (persistido y exportable).

### Lyrics: el preset de posición gana a `coords`

- Los dos renderers dejaban que `coords` pisara un `position` no-centro, al
  revés de lo que declara Lyrixa. `resolveClipCoords()` unifica la regla;
  documentado en `LYRIXA_CONTRACT.md` §5b.

### Docs

- Plan maestro con la suite Vibrix + Lyrixa + Transcriptor (§0.5): qué se
  lanza, qué formatos de letra exportar, qué queda interno.
- Comentario de Keep Covered alineado con la procedencia `coverageFramingEdited`
  (el encuadre manual se respeta; solo se ajusta lo mínimo para cubrir).
- CHANGELOG: fusionadas las dos cabeceras duplicadas de `0.3.0-alpha.1`.

## [0.4.0-alpha.1] — 2026-09-12

Primer corte desde `0.3.0-alpha.1` (2026-06-16): ~150 commits, store
v98 → v113, renombrado a **Vibrix** (formato de proyecto `.vibrix`; los
`.lwag` se siguen importando). Minor bump porque cambian el nombre, las claves
de almacenamiento y el formato de export.

### Editor: el menú expandido ya no desborda el contenido

- Con el editor compacto, expandir la barra lateral (38px → ~134px) estrechaba
  la columna de contenido y los `SegmentedControl` con muchas opciones
  ("Complete RGB" en Lyrics, las 8 pestañas de Calibration) se salían del
  panel y quedaban recortados. `SegmentedControl` ahora envuelve a una segunda
  línea cuando no cabe, conservando anchos iguales cuando sí cabe.

### Repo

- `.pnpm-store/` quedó commiteado por error; se saca del índice y se ignora.

### Spectrum (scope): Scale agranda la figura y la rotación vuelve al radial

- En la familia scope, `Scale` solo engordaba la onda (amplitud) y el anillo
  quedaba fijo: la figura radial del osciloscopio _es_ el contorno alrededor
  de `Inner Radius`, así que ahora `Scale` también escala ese radio. Con
  Follow Logo activo se mantiene el comportamiento viejo — el anillo pertenece
  al logo, que ya tiene su propio scale.
- La sección de rotación (drive / dirección / invert) vuelve a estar
  disponible en scope radial: el renderer ya consumía `runtime.rotation`; la
  capacidad estaba mal apagada. En scope lineal sigue oculta (no hay giro
  visible). Classic y las demás familias no cambian.
- Sin claves nuevas de store: no hace falta bump de `STORE_PERSIST_VERSION`.

### Fondo: Keep Covered respeta el encuadre manual (store v113)

- Cada imagen guarda ahora la procedencia de su encuadre
  (`coverageFramingEdited`): si lo ajustaste a mano —escala, posición, foco,
  rotación o modo de ajuste— el reencuadre automático de Keep Covered ya no lo
  pisa. Un auto-fit explícito o un reset de encuadre devuelven la imagen a
  control de la máquina.
- Al reencuadrar con el lock encendido se usa el modo `cover` sugerido y el
  selector de modo de ajuste se oculta mientras el lock está activo, porque la
  máquina es dueña del ajuste en ese estado.
- Las imágenes persistidas antes de v113 heredan el flag derivado de su
  encuadre guardado: uno distinto del default queda protegido; el default
  sigue siendo gestionable por la máquina.

### Spectrum: por qué el glow manual reventaba el frame

- **La causa real no era el blur, era una copia de objeto por barra.**
  `resolveManualGlow()` construía un clon completo de `SpectrumSettings`
  (~155 claves) en cada llamada, solo para reemplazar cinco colores — y se
  llama una vez por barra y por pasada. Un spectrum a 256 barras copiaba
  ~119 000 propiedades por frame, y con el segundo spectrum encendido el doble.
  La función sale antes cuando Manual Glow está apagado, que es exactamente por
  qué el mismo dibujo iba fluido sin el toggle y se caía con él. Ahora arma una
  vista de cinco claves; el clon completo se conserva solo para los generadores
  de degradado, que corren una vez por figura y no por barra.
- **Shape `pixel` con relleno en degradado/arcoíris: 240 blurs → 16.** La rama
  que traza las celdas reales cortaba la serie de dibujo al cambiar el color de
  relleno _exacto_, así que cualquier modo de color no sólido rompía la serie en
  **cada** barra: un `fill()` con sombra por barra, cada uno trazando la columna
  LED entera. Ahora la pasada borrosa se separa y se agrupa por el color de glow
  cuantizado (tope `GLOW_COLOR_STEPS`), y los rellenos nítidos —sin sombra, que
  son órdenes de magnitud más baratos— siguen conservando el color exacto de
  cada barra. El caso sólido no cambia: ahí una sola pasada ya era óptima.
- **Paleta `complete-rotate` sin basura por barra.** Construía un array nuevo en
  cada `getColor()`; ahora se cachea contra la identidad del array de origen.
- **Buffers de viewport que no se liberaban.** `pixelateSceneCanvas`,
  `oscilloscopePhosphorCanvas` y `liquidLayerPixelateCanvas` sobrevivían el
  resto de la sesión una vez usados: probar Retro Pixelate una vez, o pasear por
  las familias, dejaba hasta tres backing stores de 1080p vivos **por
  instancia**. Se sueltan cuando su efecto o su familia no están activos, igual
  que `feedbackCanvas` ya hacía.
- Tests de regresión: el conteo de fills borrosos de `drawLinearPixel` deja de
  escalar con el número de barras, y una sonda de lectura sobre
  `SpectrumSettings` falla si `resolveManualGlow` vuelve a recorrer el objeto
  entero.

### Spectrum: Manual Glow deja de ser un toggle muerto

- **Manual Glow no hacía nada en seis de las ocho figuras clásicas.** Capsules,
  Spikes, Dots, Blocks (linear) y Blocks, Dots (radial) tomaban el color del
  glow con `getColor()` directo, es decir con la paleta del **relleno**,
  saltándose `resolveManualGlow()` por completo. Elegir un color de glow propio
  no cambiaba un píxel en ninguna de ellas. Ahora las ocho pasan por un único
  `resolveBarGlowColors()`, así que el modo de color del glow, `core-halo` y
  `peaks` se comportan igual en toda la familia clásica.
- **Blocks y Dots no agrupaban nada.** `drawLinearBlocks` hacía un `fill()` con
  sombra por barra, y los dos renderers de Dots uno por punto **y otro por su
  espejo** — 512 fills borrosos a 256 barras con mirror activo. Pasan al patrón
  de tres pasadas que ya usaban Bars y Pixel: halo agrupado, core agrupado,
  relleno nítido.
- **El piso de blur de Manual Glow ya no pisa el valor del usuario.** Encender
  el toggle forzaba `shadowBlur >= 12` aunque hubieras puesto 4 a propósito:
  cambiaba tu look y encarecía cada pasada sin pedirlo. Ahora solo rescata el
  caso de blur exactamente 0 (un preset sin radio ninguno) y escala con el modo
  de rendimiento, como el resto del glow.
- **Glow en degradado/arcoíris: hasta 32 fills borrosos → 2.** Un glow que barre
  color no puede agruparse con `shadowColor`, que es un color plano, así que se
  cuantizaba en hasta 16 tramos por pasada. Ahora el degradado se pinta una sola
  vez bajo `ctx.filter = blur(...)` — la misma técnica que ya usaban wave,
  liquid y scope. **Este es el único cambio del lote que altera píxeles**: el
  barrido queda continuo en lugar de escalonado en 16 pasos, que es lo que se
  pedía en primer lugar.
- Tests de regresión: cada figura clásica verifica que el color borroso sale de
  la paleta del glow y no de la del relleno, y que los fills borrosos no escalan
  con el número de barras.

### Logo Vibrix y variantes (store v112)

- El logo integrado ahora tiene modos Vector, Pixel y Auto. Auto sigue
  cualquier Spectrum 1 o 2 visible que use Classic Pixel/LED o Retro Pixelate,
  tanto radial como linear, sin sustituir logos personalizados.
- El editor y el HUD pueden elegir la variante; restaurar Vibrix desacopla el
  logo personalizado actual de la escena mediante confirmación.
- Drag Mode tiene un panel propio en el HUD: sus destinos ya no invaden la fila
  principal ni aparecen duplicados dentro de System.

### Identidad Vibrix completa (store v111)

- El nombre visible del editor, mini-player, Media Session y fallback del HUD
  usa Vibrix; se eliminan las etiquetas de producto anteriores del runtime.
- El navegador recibe favicon vectorial con URL nueva, PNG 192/512, manifest,
  Apple touch icon y metadatos de aplicación/Open Graph para que las miniaturas
  no reutilicen el icono anterior desde caché.
- El logo de fábrica migra a `/vibrix-logo.svg` sin tocar logos subidos.

### Rendimiento: donde se estaba despilfarrando

- **Lluvia (el peor con diferencia).** El shader recorre hasta 100 gotas **por
  píxel**, y calculaba seis `random()` —cada uno un `sin`— por gota _antes_ de
  comprobar si esa gota siquiera tocaba el píxel. A 1080p eso es del orden de
  1.400 millones de `sin` por frame para descartar el 98% del trabajo. Ahora
  calcula la posición X (un `sin`), rechaza por distancia horizontal contra la
  cota superior exacta del ancho de gota, y sólo entonces hace el resto. El
  resultado es idéntico píxel a píxel: la cota no puede descartar una gota que
  hubiera contribuido.
- **El filtro de Looks ya no da la vuelta larga cuando no hace nada.** Cualquier
  capa listada en `filterTargets` pasaba por un canvas offscreen a pantalla
  completa más un `drawImage` filtrado **cada frame**, incluso con todos los
  diales en su valor identidad. Con dos spectrums, logo, track y lyrics como
  targets son cinco limpiezas y cinco composiciones a pantalla completa por
  frame que producen exactamente la misma imagen.
- **Las capas apagadas ya no limpian su canvas cada frame.** Se limpia una vez
  al apagarlas y se deja en paz, igual que ya hacía StageLightsCanvas.
- **Bug de paso:** el renderer de capas de audio leía `scanlineIntensity`
  directamente, ignorando `scanlinesEnabled`. Apagar las scanlines en Looks las
  seguía dibujando sobre logo, spectrum, track y lyrics.

### HUD: el drag mode se activa desde el HUD, y con qué se arrastra

El toggle existía, pero enterrado en el panel _System_ — y **era inerte**: el
HUD nunca dejaba elegir `activeTool`, así que encenderlo con la herramienta en
`none` no movía nada. Ahora vive en la fila siempre visible del HUD, y al
encenderlo aparecen las fichas de destino (Logo / Spec / Track / Lyrics / HUD /
Off) junto al botón. Encender arma el logo; apagar devuelve el puntero a la UI.

### Spectrum: Visual Intent deja de reescribir la geometría

`clean / neon / massive / soft` reseteaba `barCount`, `barWidth`, `minHeight`,
`maxHeight` y los cuatro parámetros de túnel, así que aplicar un "intent" sobre
un spectrum ya afinado lo devolvía a una forma que el usuario no había pedido.
Ahora sólo toca lo que la palabra promete —opacidad, relleno de onda, glow y
blur— y la detección de cuál está activo se hace sobre esos mismos valores en
vez de sobre el tamaño.

### Looks: una sola lista, y el RGB shift deja de ser global (store v109 + v110)

La pestaña tenía **dos sistemas en paralelo**: los presets de fábrica por un
lado y los slots guardados por otro, más un tercer camino legacy con un único
look "Custom". De ahí salían todas las incongruencias: guardar encima de un
preset aplicado creaba un duplicado que la UI ya no podía reconocer como
activo, y el HUD y la pestaña llevaban cada uno su propia idea de qué look
estaba puesto.

**Un solo catálogo.** `buildFilterLookCatalog()` produce la lista que consumen
la pestaña y el HUD: primero los presets de fábrica —presentes en la misma
lista que los slots, y no borrables— y después los slots del usuario.
`activeFilterLookId` pasa a ser **un solo espacio de nombres**: un id de
fábrica, o `slot:<id>`. Un único `findFilterLookCatalogIndex()` resuelve la
selección para los dos consumidores, así que no pueden volver a divergir.

**Cuatro presets nuevos** (`noir-cinema`, `hologram`, `sunset-film`,
`ice-signal`), 12 en total.

**El ruteo audio-reactivo del RGB shift entra en el look (v109).** Guardar un
slot capturaba _cuánto_ se separaban los canales pero no _si seguían al
bombo_: las diez claves `rgbShiftAudio*` se editaban en Looks y vivían fuera
del look, así que cargar cualquier slot heredaba en silencio el ruteo del
anterior. Ahora `RGB_SHIFT_AUDIO_KEYS` es la lista canónica y entra tanto en
`LOOKS_PROFILE_KEYS` como en `FilterLookPreset['settings']`; cada preset de
fábrica tiene carácter propio (`club-glitch` late con el kick, `crt` no
reacciona). La migración rellena cada slot guardado **desde los globales que
estaban en efecto**, no desde los valores de fábrica — eran los que realmente
sonaban, así que nada cambia de aspecto al actualizar.

**`resetFiltersToDefaults` se deriva de la lista canónica.** La versión escrita
a mano se había desincronizado: reseteaba cuatro de las diez claves de audio y
nunca tocaba `scanlinesEnabled`, dejando la pestaña en un estado al que no se
llegaba de ninguna otra forma.

**`STORE_PERSIST_VERSION` 108 → 110.** v109 hace el backfill del ruteo; v110
pliega el look Custom legacy dentro del banco normal de slots y traduce la
selección. El campo legacy se queda en el esquema para que los proyectos
exportados antes sigan importándose.

`STORE_PERSIST_VERSION` is at **113**; `PROJECT_SCHEMA_VERSION` and `SETTINGS_SCHEMA_VERSION` remain at **1**. `APP_VERSION` / `package.json`: **0.3.0-alpha.1**.

---

### El proyecto pasa a llamarse Vibrix

Renombre completo de identificadores, no sólo del título. Lo que importa es que
nadie pierda nada en el camino, así que **cada cosa que el usuario ya tiene
guardada se sigue leyendo**:

- **Estado persistido.** La base pasa a `vibrix-store` y la clave a
  `vibrix-state`. En la primera lectura, si no hay nada bajo el nombre nuevo, se
  adopta lo que haya en `lwag-store` / `lwag-state` (IndexedDB o localStorage).
  La copia vieja **no se borra**: es la vuelta atrás si hace falta un build
  anterior al renombre.
- **Archivos de proyecto.** Las exportaciones nuevas se escriben como `.vibrix`
  con `format: 'vibrix-project'` / `'vibrix-settings'`. Los `.lwag` ya
  exportados se importan igual, para siempre — el selector de archivos acepta
  las dos extensiones y el parser acepta las cuatro etiquetas.
- **Canales y preferencias.** `BroadcastChannel` (`vibrix-audio-sync`,
  `vibrix-preview-sync`), eventos de salida, el token CSS `--vibrix-accent` y el
  prefijo de log `[vibrix]`. Las preferencias de vista del editor se renombran
  sin migración a propósito: perder qué acordeón estaba abierto cuesta un clic,
  y `spectrum-target` sí mantiene su cadena de fallbacks.
- **Caché del AI Director.** `vibrix-ai-director`; la base vieja se borra en el
  primer uso porque su contenido se recalcula desde las imágenes.

Sin tocar todavía: `lwag-images`, `lwag-sync` y `lwag-folders` (guardan los
blobs reales — imágenes, proyectos y handles de carpetas), y el repositorio de
GitHub.

### Lyrics: el bundle de Lyrixa como contrato externo de verdad

Lyrixa es la herramienta de autoría y este proyecto el renderer. El parser ya
preservaba `role`, `language`, `sourceId` y `originalText`; lo que faltaba era
todo lo que se hace **con** esos campos, y un agujero de datos.

- **Un rol desconocido ya no se descarta.** Había un test que celebraba el
  descarte. Estaba mal en la dirección más cara: Lyrixa avanza a su propio
  ritmo, así que `role: 'karaoke'` desde un build más nuevo es el caso
  esperado, no dato corrupto — y al borrarlo la capa caía al camino legacy por
  `layerType` y adivinaba algo que el bundle **sí había declarado**. Ahora se
  conserva en `roleRaw`.
- **`words[]` se preserva.** Nada los dibuja todavía. Se parsean porque la
  alternativa es que alguien importe un bundle con timing por palabra, guarde
  el proyecto y los timings desaparezcan sin que nada lo diga.
- **`romanization`** entra como rol propio junto a `transliteration`; los
  idiomas se canonizan a BCP-47 (`zh-hant` → `zh-Hant`) conservando la
  escritura del autor.
- **`sourceId` deja de ser decorativo:** `groupLyricsClipsBySource` empareja
  cada línea con sus traducciones y romanizaciones. Emparejar por posición en
  el array se rompe apenas un traductor fusiona dos líneas, que es justo lo que
  hacen los traductores.
- **`lyricsLayerSelection`** resuelve qué capas mostrar por rol e idioma, en dos
  slots (principal / secundaria). La UI sigue con el switch binario de
  traducción: cambiarla necesita key persistida y es una fase aparte.
- **`lyricsBundleLoader`** separa el transporte del contenido. Antes
  `handleImportLyrixaBundle` hacía `JSON.parse(await file.text())` **dentro de
  un componente React**, o sea que el componente era dueño del transporte; con
  IPC de escritorio eso terminaba en un componente React que sabe de IPC.

32 tests nuevos (1016 en total). Docs:
`docs/features/LYRIXA_CONTRACT.md` y `docs/plans/DESKTOP_SUITE_READINESS.md`
(barreras Windows/macOS + candidatos de nombre; **no se renombró nada**).

### Arquitectura: cero aristas de deuda en runtime (deuda 10 → 5)

Segunda ronda. Las cinco que sobreviven son posiciones de tipo
(`import('...').Foo` desde `types/wallpaper.ts`) que TypeScript borra al
compilar: **en el bundle no queda ninguna dependencia mal dirigida.**

- **`components/audio/` → `features/audioLayers/`.** Era presentación **por
  archivado, no por naturaleza**: de siete archivos, uno solo era React. Los
  otros seis son un motor de canvas que el exportador offline necesita, y por
  eso `features/export` importaba _hacia arriba_. El nudo que la doc describía
  resultó más chico al medirlo: seis de los siete imports a `components/` eran
  internos a la carpeta y se mudaron con ella. La mitad React
  (`AudioLayerCanvas`) se quedó atrás a propósito — un dominio es dueño del
  dibujo, no del montaje. Publica `@/features/audioLayers/render`.
- **`MotionSharedControls` cede `FxBandThresholdControls`** a
  `features/stageFx/controls/`. El chrome genérico no sabe qué es una banda de
  kick. Con eso muere la única arista `editor/ → features`.
- **`I18nProvider` deja de leer el store**: recibe `language` como prop desde
  `WallpaperAppProviders`. Un proveedor de traducciones no tiene por qué saber
  que existe un store de wallpaper.
- **`aiDirector` recibe la fachada que la doc decía que ya tenía.** La
  auditoría de estructura encontró 4.600 LOC —más que `logo` y `particles`
  juntos— con 22 imports profundos desde cuatro zonas y sus tres paneles
  archivados bajo `tabs/main/scene/`. Ahora publica `./index` (intent,
  compilador determinista, análisis, lotes) y `./ui`. Los paneles importan su
  propio dominio por `../index`, que es lo que hace la fachada **portante**: si
  se desalinea, rompen primero.
- **`calibration` deja de ser tres archivos sueltos.** Los 552 LOC del panel
  que es toda su cara visible salen de `components/controls/tabs/`. Fachadas
  `index` + `ui`. La arista congelada de `types/` se **retargeteó**, no se
  agregó: el check rechaza un delist silencioso en cualquiera de las dos
  direcciones, que es justo cómo detectó el rename.
- **La regla que sí generaliza**, escrita en ARCHITECTURE §3: un dominio
  necesita fachada cuando tiene **estructura interna**. Ocho dominios son
  carpetas planas de 1–4 archivos y no llevan; agregarles barriles habría sido
  churn disfrazado de rigor.
- **Verificado en vivo**: el panel de Calibration renderiza completo desde su
  nueva ubicación, `EnvelopeWaveformPreview` incluido.

### Arquitectura: se cierran las fases de migración (deuda 22 → 10)

Tres items del roadmap §6.5, y los tres tenían la misma forma: **el archivo
estaba en la zona equivocada, y la arista de deuda era el síntoma.** Ninguna
de las 12 aristas se cerró tocando el baseline.

- **`export` migrado.** Doce archivos de `tabs/export/` →
  `features/export/controls/`, con fachadas `index` (modelo: selección, plan,
  nombres) y `ui` (ocho paneles + cuatro hooks). `ExportTabBody` pasa de once
  imports a dos y se queda en `tabs/` porque componer secciones es trabajo de
  editor. Era el último dominio grande sin fachada.
- **`controlPanelResetKeys.ts` → `config/`.** 684 líneas de "qué keys son de
  qué pestaña", un solo `import type`, cero React. Vivía en `components/` sólo
  porque el panel de control fue su primer consumidor — y por eso
  `features/export` subía a `components/` a buscar constantes.
- **Nace la zona `services/`.** `projectSettings`,
  `wallpaperPersistenceCoordinator` y todo `sync/` salen de `lib/`. Una
  librería pura no llama a `useWallpaperStore.getState()`; un servicio de
  aplicación está **por encima** del store, no por debajo. Tiene prohibido
  `components` `pages` `ui` `context` `editor`: orquesta estado, no dibuja.
- **`restoreWallpaperAssets` deja de fingir ser un hook.** Era una función
  async de 200 líneas compartiendo archivo con el efecto de cinco líneas que
  la llama; tres consumidores queriendo esa función eran toda la razón por la
  que `lib/` subía a `hooks/`. El hook queda, como envoltorio.
- **`lib/constants.ts` → `store/defaultState.ts`.** El nombre es el punto: no
  era una bolsa de constantes, era el documento de escena de fábrica. Con él
  se movieron `featureProfiles` y `factoryDefaults` (a `store/`), `presets` (a
  `features/presets/`) y `backgroundImages` (a `features/background/`, que
  estaba explícitamente bloqueado hasta que `projectSettings` saliera de
  `lib/`).
- **Queda 1 arista de `types/` que no se arregla moviendo archivos**, y el
  baseline ahora explica por qué: los tipos de perfil son
  `Pick<WallpaperState, typeof KEYS[number]>`, derivados de la misma interfaz
  que después los guarda, y los arrays de keys son valores de runtime.
- **Verificado en vivo, no sólo en CI.** Mover `DEFAULT_STATE` cambia el orden
  de inicialización de módulos, que es lo que una vez rompió 18 suites: el
  store hidrata en v108 con 767 claves, los slots de perfil se construyen
  desde su nueva ubicación y las ocho secciones de Export montan por la
  fachada nueva sin errores de consola.

### AI Director: el pedido en vuelo se puede cancelar

- `handleAskModel` ya creaba un `AbortController` y lo guardaba, pero **el
  botón nunca se construyó**: un "Preguntando…" colgado no tenía más salida
  que recargar. Se agregó el control (`ai_btn_cancel_ask`, en/es). Con eso
  `pnpm lint` queda en **0 errores**.

### Borrado: el subsistema Edge Glow (store v107 → v108)

- **Edge Glow era inalcanzable de punta a punta.** `EdgeGlowSection` (360 LOC)
  no la montaba ninguna pestaña y `edgeGlowRenderer` (317 LOC) no lo llamaba
  ningún pipeline — pero sus **28 claves persistidas** viajaban dentro de cada
  proyecto guardado, con 28 setters y 116 líneas de migración manteniéndolas
  vivas. Lo reemplazó **Flash Edge** en su momento y nunca se retiró.
- **Había un control que mentía.** `AudioRoutingSection` —panel vivo— listaba
  una fila "BG Edge Glow" cuyo estado salía de `bgEdgeGlowEnabled` y mandaba al
  usuario a la pestaña Presets. Ese flag no lo podía encender ninguna UI y
  ningún renderer lo leía: la fila estaba **siempre** apagada y apuntaba a un
  control inexistente. Se eliminó la fila.
- **No se toca lo que sí vive**: `flashEdgeRenderer` + `FlashEdgeSection` (que
  es otra cosa) y `layer.edgeGlow`, el número por capa que `OverlayInspector`
  lee. Sus etiquetas i18n (`sfx_edge_glow`, `label_edge_glow`) se conservan;
  se borraron sólo las 20 claves `sfx_edge_glow_*` / `audio_route_bg_edge_glow`
  del subsistema muerto. `en.ts` y `es.ts` mantienen paridad exacta.
- **`features/edgeGlow/` pasó a llamarse `features/flashEdge/`**: con Edge Glow
  fuera, la carpeta sólo contiene Flash Edge y el nombre viejo apuntaba a un
  sistema que ya no existe.
- **`STORE_PERSIST_VERSION` 107 → 108**: la migración borra toda clave
  `logoEdgeGlow*` / `bgEdgeGlow*` para que no siga colándose en los proyectos
  guardados. Verificado en navegador sembrando un blob v107 real, no sólo en
  unit test.

### Borrado: huérfanos superseded y knobs sin lector (store v107 → v108)

Auditoría re-medida con **alcance real desde los puntos de entrada** (no por
coincidencia de nombres). Se borró sólo lo que tiene un reemplazo vivo:

- `TimestampTimeline.tsx` (412) — `ActiveWallpaperSection` ya pinta la UI de
  timestamps manuales; `AudioOverlay.tsx` (126) — `WallpaperViewport` monta las
  capas; `lib/textures.ts` (76); `ImageUploader.tsx` (44);
  `AudioTabSections.tsx` (37); `discovery/recentIds` + `constants` (15);
  `spectrumFxTypes.ts` (6); y dos shaders huérfanos (`scanlineFragment.glsl`,
  `rgbSplitFragment.glsl`).
- **5 keys persistidas con setter y sin lector**: `particleScanlineIntensity` /
  `Spacing` / `Thickness` — `ParticleField` nunca supo qué es una scanline; las
  de _Looks_ (`scanlineIntensity`, sin prefijo) son otra cosa y siguen vivas —,
  `audioSelectedChannelSmoothing` y `quickEditHudEnabled`.

**Se queda a propósito el andamiaje** de backend (`lib/sync/remoteSyncRepository`,
con `backend/` Postgres + Express detrás) y del exportador offline (~715 LOC):
está a medio cablear, no muerto.

**Corrección de la auditoría anterior:** `editor/MotionSharedControls.tsx` NO
está muerto — lo importan 13 archivos. El informe previo lo dio por huérfano
porque buscó por nombre en vez de resolver el grafo de imports.

### Lyrics: backdrop, colores globales y reorganización de la pestaña (store v106 → v107)

- **El backdrop ignoraba la animación del texto.** Se pintaba ANTES de resolver
  la animación y con alfa fija, así que la letra se desvanecía o se deslizaba
  mientras la caja seguía rígida, y luego desaparecía de golpe al acabar el
  clip. Ahora sigue a la línea más visible (alfa, escala y desplazamiento), con
  interruptor **Seguir Animación del Texto** por si se quiere el panel fijo.
- **El backdrop tiene los 5 modos de color** (Solid / Gradient / Rainbow /
  Rotate RGB / Complete RGB) y source real. Antes solo tenía source y encima
  resolvía con el rol `backdrop` de la paleta, que devuelve un tono casi negro:
  parecía que "Current Image" no hacía nada.
- **Relleno, borde y brillo globales tienen los mismos 5 modos**, con el mismo
  componente que los ajustes por capa — ya no pueden divergir.
- **La pestaña estaba desordenada**: `Lyrics Style` era una lista plana de 16
  controles. Ahora se agrupa en Posición / Tipografía / Líneas y Tiempo /
  Animación / Colores / Backdrop, se renombra a **Estilo Base** y los ajustes
  por capa quedan justo al lado como **Ajustes por Capa**.
- **Fuera la sección `Lyrics Preview`**: era un cuadro de solo lectura. Su
  información se movió bajo el slider de Time Offset, que es donde sirve.

### Lyrics: eliminado el Liquid Glass de canvas (store v106 → v107)

- **Se borra el panel liquid-glass de canvas** (`nowPlayingLiquidGlass*`,
  `audioLyricsLiquidGlass*` y `src/components/audio/liquidGlass.ts`). Volvía a
  desenfocar y magnificar el wallpaper detrás de la letra y de la tarjeta Now
  Playing **en cada frame**, y nunca llegó a verse como se pretendía. El
  backdrop sólido de siempre sigue disponible en ambos sitios.
- **`hudLiquidGlassEnabled` NO se toca**: es el cristal del HUD del editor,
  puro CSS (`backdrop-filter`), y funciona.
- Las claves persistidas se eliminan al rehidratar, así que no quedan colgando
  en proyectos guardados.
- **`STORE_PERSIST_VERSION` 106 → 107**.

### Spectrum: saneado de las formas radiales + Puntas Afiladas (store v105 → v106)

- **Las formas ya no se salen del radio pedido.** "Fit around logo" escalaba la
  figura por `1/minFactor` sin tope: `bowtie` pedía **×20**, o sea que un anillo
  de 120px se dibujaba a 2400px y sus lóbulos se iban de pantalla mientras la
  cintura se quedaba en el radio pedido. La inflación ahora está acotada
  (`MAX_LOGO_FIT_INFLATION = 3.5`) y todas las formas se han rediseñado por
  debajo de ese techo, así que el tope nunca llega a actuar.
- **Fuera los arcos planos.** `shield` recortaba con `Math.min(1, raw)` y dejaba
  el **33.9%** del contorno como un arco circular muerto; `moon` hacía lo propio
  con `Math.max(floor, raw)` en el 15.3%. Ninguna forma clampa ya: la curva se
  diseña para que sus extremos naturales caigan donde toca.
- **`minFactor` se mide, no se declara.** Cada forma se autoría como geometría
  pura y `calibrate()` mide su pico y su valle. El valor escrito a mano ya había
  derivado: las cinco `flower*`/`lobed3` declaraban 0.611 con un mínimo real de
  0.550 y por tanto **cortaban el logo** aunque el ajuste estuviese activo.
  Además toda forma llega ahora exactamente al radio pedido — `moon` se
  dibujaba al 76% y `concaveTriangle` al 68%.
- **Cuatro formas estaban boca abajo.** En canvas la Y crece hacia abajo, así
  que `sin θ > 0` es la mitad **inferior**. `heart`, `shield`, `drop` y
  `cardioid` lo leían como eje matemático: corazón invertido, escudo con el pico
  arriba, gota con la punta abajo. Se corrige con un helper `up()` explícito.
  El corazón además tenía un **segundo cleft abajo** (`|sin 2θ|` tiene picos en
  los cuatro cuadrantes); ahora va apuntado al hemisferio superior.
- **`cross` y `bowtie` tienen aristas de verdad.** Eran aproximaciones
  trigonométricas (`|cos 2θ|^0.3` daba brazos redondos con la punta en pico, lo
  contrario de una cruz; `bowtie` era literalmente dos círculos tangentes). Se
  trazan con un helper `fromPolygon()` de intersección rayo/arista exacta.
- **Seis formas eliminadas: `cardioid`, `drop`, `heart`, `shield`, `moon` y
  `wings`.** Todas por la misma razón de fondo: `r(θ)` solo describe siluetas
  que son estrelladas respecto de su propio centro, y estas necesitan una
  cúspide real o una mordida cóncava que el rayo cruza dos veces. Cualquier
  versión suya era un borrón con el nombre equivocado o se rompía en cuanto el
  ajuste al logo la escalaba. Los presets guardados se remapean a `oval`
  (`wings` a `lens`).
- **Ninguna forma puede salirse del canvas.** El ajuste al logo escala por
  `1/minFactor`, así que un logo grande (hasta 400px ⇒ ~260px de holgura) podía
  convertir un anillo modesto en un pico de ~900px, fuera de pantalla en 1080p.
  `resolveLogoSafeRadius` recibe ahora el viewport y acota la holgura por
  `distancia al borde más cercano / MAX_LOGO_FIT_INFLATION`.
- **Nuevo: Puntas Afiladas** (`spectrumRadialSharpness`, por instancia). Estrecha
  la forma **ya seleccionada** hacia sus puntas, así que las estrellas y flores
  de lóbulo redondeado tienen ahora también versión afilada sin duplicar el
  catálogo. En 0 es un no-op exacto: los presets guardados se ven igual.
- **El picker deja de mentir.** `ShapePreview` reescalaba cada forma a su propio
  pico, así que una figura que se renderizaba al 76% se veía a tamaño completo
  en el selector. Ahora muestrea directo y refleja también el sharpness activo.
- **`STORE_PERSIST_VERSION` 105 → 106**.

### Spectrum: Classic Linear "pixel" vuelve a ser usable

- **El ecualizador LED rellenaba una vez por celda, con la sombra puesta.**
  La versión original mataba el glow a propósito (`// Pixel art means crisp
edges` + `shadowBlur = 0`); al añadir las opciones de LED se cambió por
  `shadowColor`/`shadowBlur` **por barra**, y como cada celda se rellenaba
  aparte, Canvas2D reejecutaba el blur en cada una. Medido con 96 barras,
  mirror activo y barras altas: **22.464 rellenos con blur por frame**.
- Ahora la columna entera (incluido su espejo) se acumula en **un solo path** y
  se rellena una vez: **96 rellenos**, o sea **234× menos**. Las celdas no se
  solapan, así que una sombra sobre la unión dibuja lo mismo que las sombras por
  celda — con la diferencia de que ya no se acumulan entre celdas vecinas, así
  que el glow queda algo más limpio y menos empastado.
- Cuadrados y rombos emiten sus cuatro esquinas ya rotadas en vez de un
  `save`/`rotate`/`restore` por celda (el otro coste por celda).
- **Barras que comparten color se fusionan en un solo relleno.** Con color
  `solid` el spectrum entero pasa a ser **1 relleno con blur** en vez de 96. En
  los modos de barrido cada barra tiene su propio color y degrada al
  comportamiento por barra, nunca peor. Los tramos son contiguos, así que el
  orden de pintado no cambia.
- **El neon core es un único relleno** para todo el spectrum: su color no varía
  por barra, así que no había motivo para repetirlo 96 veces.
- **El color del glow se muestrea en 16 pasos.** Las sombras de Canvas2D aceptan
  un solo color plano por operación, así que un glow que barre necesita una
  pasada por color distinto — y el manual glow viene con modo de color
  `gradient` por defecto, dándole a las 96 barras un color distinto y anulando
  toda fusión. Justo la combinación que se reportaba como lenta. Muestrear el
  barrido en 16 pasos deja ese caso en **16 rellenos con blur en vez de 96**. El
  relleno nítido conserva su color exacto por barra; solo se escalona el color
  de la sombra, que ya va desenfocada varios píxeles.
- `linearPixel.test.ts` cuenta operaciones de dibujo y falla si el número de
  rellenos vuelve a escalar con el número de celdas o de barras.

### Editor: el HUD deja de quedar bloqueado por el drag del spectrum

- **Con el editor abierto y una herramienta de arrastre armada, los controles
  del HUD no respondían** si el spectrum quedaba por debajo. `DragInteractionLayer`
  se montaba como hermano de `WallpaperViewport`, y el `<main>` del viewport
  lleva `isolation: isolate`: eso crea un contexto de apilamiento, así que el
  `z-[126]` del HUD queda **encerrado dentro** y el capturador (z-40) se pintaba
  sobre todo el subárbol pasara lo que pasara. Ahora se monta **dentro** de ese
  `<main>` con z-100: por encima de todos los canvas del wallpaper (el más alto
  es flashlight, 90) y por debajo del overlay de FPS (120) y del HUD (126).
- **El drag solo captura donde está el elemento.** El capturador cubría el
  viewport entero, así que con una herramienta armada salía el cursor de agarre
  por toda la pantalla y había una superficie transparente encima de botones que
  no tenían nada que ver con lo que se arrastraba. Nuevo `dragHitArea.ts`
  resuelve el área real en pantalla de cada objetivo (círculo para spectrum
  radial y logo, banda para spectrum lineal, caja para los textos) y la capa se
  pone `pointer-events: none` fuera de ella. Sigue abarcando el viewport para
  que un arrastre pueda continuar más allá del borde del elemento.
- **La UI siempre gana al wallpaper que tiene debajo.** La geometría sola no
  basta: un spectrum lineal pegado al borde inferior ocupa legítimamente todo el
  ancho, así que su área incluye el HUD. HUD y panel del editor se marcan con
  `data-drag-blocker` y el capturador consulta `elementsFromPoint` antes de
  activarse. Como esa API ya ignora los nodos con `pointer-events: none`, la
  capa transparente a pantalla completa del HUD no cuenta — solo sus controles
  reales.

### Editor: re-render a 60Hz que competía con los canvas

- **`MediaDock` llamaba `setCurrentTime` + `setSeekValue` en cada frame** de RAF
  mientras sonaba un archivo, re-renderizando todo el dock 60 veces por segundo
  para pintar casi siempre lo mismo (la barra tiene ~300px y la etiqueta
  resolución de un segundo). Barato en producción; caro en desarrollo, donde el
  build de dev de React va 3–5× más lento y **StrictMode ejecuta cada render dos
  veces**. Ahora `publishTime` solo entra al estado cuando el valor movería medio
  píxel de la barra o cambiaría el segundo de la etiqueta; los saltos (seek,
  cambio de pista, loop) siguen siendo inmediatos.
- **`TimestampTimeline` tenía el mismo patrón** con `setPlayheadTime`; misma
  guarda.
- **`OutputModeDevDiagnostics` medía frames para nadie.** Su `useEffect`
  arrancaba un bucle RAF perpetuo **antes** del `if (!debugVisible) return null`
  — un guard de render no es un guard de efecto. En DEV el componente se monta
  siempre en modo edición, así que ese muestreo corría siempre aunque el
  overlay estuviese oculto (que es lo normal). Ahora el efecto depende de
  `debugVisible`.

### Spectrum: glow con color real + controles centralizados (store v104 → v105)

- **Glow Color Mode arreglado en todo el sistema.** `gradient` mezclaba los dos
  colores y devolvía **un solo color** — lo mismo que escribir ese color en
  `solid`. Ahora el glow usa la MISMA maquinaria de color que el relleno
  (`asGlowColorSettings` + `getColor` / `createWaveGradient`), así que:
    - `gradient` recorre color A → color B **a lo largo del contorno** (cónico en
      radial, por eje en linear),
    - **`rainbow`** y **`visible-rotate`** existen también para el glow, con su
      propia paleta (`spectrumGlowRainbowColors`, resuelta desde
      `spectrumGlowColorSource`, así que el glow puede seguir la imagen aunque el
      relleno no).
    - Como `shadowColor` de canvas solo acepta un color plano, el halo pasa a
      `filter: blur()` sobre el propio degradado cuando el modo no es `solid`.
- **Glow Reach y Shadow Blur vuelven a hacer algo en Liquid.** El tope
  atenuaba la petición del usuario por el stack de capas (a valores por defecto
  pedía ~8px y cualquier movimiento del slider se comía dentro del cap). Ahora
  los tres diales mandan hasta el techo, y el alivio por stack se aplica solo al
  **techo** (44px fluido / 26px rígido, ampliados por Reach). Cubierto por
  `liquidGlow.test.ts`, que falla si un slider deja de responder.
- **Controles centralizados**: la sección "Glow & finish" desaparece; Glow /
  Glow Reach / Shadow Blur viven ahora arriba de **Visual accents**, junto al
  resto de los acentos.
- **Retro Pixelate sale de "Glow & finish"** (no tiene nada que ver con el
  glow) a su propia sección, y **se puede aplicar por capa o a todas a la vez**:
  nuevas keys `spectrumLiquidLayer{1,2,3}Pixelate` pixelan una sola capa de
  Liquid mediante un canvas scratch reutilizado, mientras las otras siguen
  suaves. El toggle global sigue significando "todas las capas".
- **`STORE_PERSIST_VERSION` 104 → 105**.

### Spectrum: paridad de glow y de controles entre familias

- **Glow por capa en Liquid**: cada capa dibuja ahora su propio halo (la misma
  receta de Classic Radial Wave) trazado sobre **su** contorno, así que el
  brillo sigue la forma y la deformación de cada capa. Antes liquid solo seteaba
  `shadowBlur` con tope duro de 28px (10 rígido) y sin pase de halo: Glow y
  Glow Reach eran prácticamente inertes aunque los sliders se muestran para
  todas las familias. El halo nunca supera la opacidad de su capa
  (`alphaScale` nuevo en `drawClassicGlowHaloPass`).
- **Tope de blur sensible a Glow Reach** en liquid y scope (antes el cap se
  comía el slider) y **`performanceMode` aplicado en todas las familias**:
  liquid, tunnel, orbital, spiral y scope capaban un número crudo, así que el
  mismo preset costaba mucho más en medium/low según la familia
  (`resolveGlowPerfScale`, extraído de Classic).
- **Scope radial**: el Wave Fill se pintaba DESPUÉS del trazo y del neon core,
  lavándolos; ahora el orden es fill → halo → trazo → neon core, igual que el
  lineal. Y **Mirror funciona**: el scope lee el time-domain, así que nunca
  pasaba por `applyRadialMirrorFold`; se pliega con el mismo contrato.
- **Halo de glow manual en el scope** (lineal y radial, incluidos sus espejos),
  igual que ya hacía spiral: el toggle de manual glow significa lo mismo en
  todas las familias.
- **"Fit around logo" ya no es solo de Classic**: liquid, scope, orbital y
  tunnel pasan el radio seguro a la geometría (`resolveLogoSafeRadius`), así
  que las formas con vértices hacia adentro (estrella, polígonos) dejan de
  cortar el logo. Spiral queda fuera a propósito (usa su propia forma).
- **Follow logo / Logo gap / Inner radius visibles en toda familia radial**:
  `resolveSpectrumPlacement` ya los aplicaba a cualquier familia, pero el panel
  solo los mostraba en Classic — un preset con Follow logo dejaba el spectrum
  clavado al logo sin control para soltarlo. Liquid además no tenía slider de
  Inner Radius pese a usarlo. Sin cambios de estado persistido.

### Lyrics: capas del bundle conectadas a la UI + catálogo de fuentes

- **Nueva sección "Capas del Bundle"** en la tab Lyrics: por cada capa del
  bundle de Lyrixa hay visible / posición X / posición Y / escala / opacidad /
  glow / blur / color de texto / color de glow, con reset por capa. El modelo
  `lyrixaLayerOverrides` ya existía y ambos renderers lo respetaban, pero
  **nada en el editor lo escribía** — por eso las capas quedaban congeladas
  donde Lyrixa las había dejado. Sin cambios de estado persistido (los
  overrides ya migraban), así que **no hay bump de `STORE_PERSIST_VERSION`**.
- **Position X/Y globales vuelven a mover las capas con `positionPreset`**: el
  preset del bundle ahora es solo el ancla base y el offset global se suma
  encima (antes el preset ganaba y los dos sliders parecían muertos).
- **"Líneas visibles" aplica también a bundles**: limita, por capa, cuántos
  clips simultáneos se dibujan (antes solo servía para lyrics de texto plano).
- **Honestidad en modo "Look de Lyrixa"**: la sección de estilo global se
  oculta tras un `FeatureGate` con explicación, porque ese modo dibuja el
  estilo exportado desde Lyrixa y ninguno de esos controles llegaba al canvas.
- **17 fuentes nuevas** (25 en total, compartidas con Track Title): Poster,
  Black, Modern, Geometric, Slab, Elegant, Cinematic, Futuristic, Racing,
  Stencil, Pixel, Terminal, Comic, Marker, Brush, Kawaii, Blackletter. Se
  empaquetan vía `@fontsource` y se precalientan en `ensureTrackFontsLoaded()`;
  cada botón del selector se previsualiza en su propia tipografía.

### Backend-ready: slots con identidad estable (store v103 → v104)

- **`ProfileSlot` gana un `id` estable** en todas las familias (spectrum ×2,
  logo, particles, rain, looks, lights, camera FX, track title, background).
  Los ids se generan al crear slots y la migración los acuña para todo slot
  existente.
- **Las escenas referencian slots por id, no por posición**: los campos de
  binding pasan de `*SlotIndex` (número) a `*SlotId` (id del slot). Reordenar
  o borrar slots ya no puede re-apuntar un binding de escena a otro slot — el
  prerequisito #1 para sincronización multi-dispositivo. Las referencias a
  slots borrados colapsan a `null` de forma segura.
- **Bindings per-image por id**: `logo/spectrum/particles/rain/looksProfileSlotIndex`
  → `*ProfileSlotId`, con la misma conversión.
- **Migración v104**: cada ref numérico legacy se traduce al id del slot que
  ocupaba esa posición (idempotente por construcción: un ref numérico solo
  puede venir de un save pre-v104).
- **Exports versionados**: el settings file ahora graba `storePersistVersion`
  y el import corre la cadena de migraciones del store desde esa versión —
  un archivo viejo importado hoy aterriza en el modelo actual (antes los
  settings files se normalizaban sin migrar).
- **`STORE_PERSIST_VERSION` 103 → 104**.

### Consolidación: poda de legacy + editor UX (store v102 → v103)

- **Motion bundles retirados**: los slots combinados de Motion
  (`motionProfileSlots`, particles + rain en un solo perfil) se eliminaron del
  producto. La migración **divide sin pérdida** cada slot guardado en entradas
  separadas de `particlesProfileSlots` y `rainProfileSlots` (mismo nombre) y
  elimina la key persistida.
- **Override per-image de Spectrum 2 retirado** (`spectrumSecondOverride`): la
  composición por imagen de Spectrum 2 ahora es exclusiva del flujo scene-first.
  La migración **preserva** cada override guardado como un slot con nombre
  (`S2 · <imagen>`) en `spectrumSecondProfileSlots` antes de eliminar la key.
- **Lyrics — UI de ajustes por capa Lyrixa eliminada**: los controles por capa
  (posición/color/escala/glow por layer del bundle) se quitaron del tab de
  Lyrics; el renderer sigue soportando bundles multi-capa y respeta overrides ya
  guardados. El toggle de modo de render (Nativo del Editor / Look de Lyrixa) se
  conserva y ahora está traducido.
- **Editor UX**: `SpectrumTab`/`LogoTab` usan el wrapper canónico `FeatureGate`;
  el cambio de sub-vista del Spectrum ahora cruza con `TabFade`; la persistencia
  de sub-vista de Spectrum/Logo/Track Info se unificó en el hook
  `useTabViewState`. Se tradujeron (en/es) los targets de Looks, modos de
  scanline, títulos de secciones del Spectrum, labels de overrides per-image y
  todo el panel per-image del HUD. `LegacyTabAdapter` y `MotionProfilesSection`
  (componentes muertos) se eliminaron.
- **`STORE_PERSIST_VERSION` 102 → 103**: conversión de Motion slots y overrides
  de Spectrum 2 descrita arriba; ambas keys legacy se eliminan del estado
  persistido.

### Liquid glass surfaces (store v100 → v102)

- **Reworked to a real edge lens (v102)**: the glass panel now leaves its
  **centre fully transparent** (the wallpaper shows through untouched) and only
  the **interior rim** refracts — it samples the background behind the border and
  draws it magnified, the way the lip of a real glass lens bends what's behind
  it. This removes the grey "frosted box" the full-panel version produced. The
  **Glass Magnify** slider now drives the edge-lens strength, **Glass Blur** the
  rim softness, and **Glass Tint** a light rim hue. Because the three values
  changed meaning they are **re-seeded once** for stores below v102.

- **macOS-style "liquid glass"** frosted/magnified panel behind three surfaces,
  each behind its own switch: the **Track Info / Now Playing** widget
  (`nowPlayingLiquidGlassEnabled`), the **Lyrics** block
  (`audioLyricsLiquidGlassEnabled`), and the floating **media HUD**
  (`hudLiquidGlassEnabled`). All default **off**.
- Canvas surfaces (lyrics, track info) sample the already-rendered wallpaper
  behind the panel and blur + slightly magnify it (`drawLiquidGlassPanel` in
  `components/audio/liquidGlass.ts`); the DOM HUD uses `backdrop-filter`.
- **Per-surface tuning (v101)**: each canvas surface gains **Glass Blur**,
  **Glass Magnify** and **Glass Tint** sliders
  (`nowPlayingLiquidGlass{Blur,Magnify,Tint}`,
  `audioLyricsLiquidGlass{Blur,Magnify,Tint}`) with macOS-like defaults. The
  tint **hue** reuses each surface's existing backdrop color, and geometry
  reuses the existing padding/radius. The **HUD** glass reuses the existing
  **Quick HUD Blur** and **Surface/Backdrop Opacity** sliders (its
  `backdrop-filter` now follows `--editor-shell-blur` instead of a fixed value).
- **`STORE_PERSIST_VERSION` 101 → 102**: backfills the new toggles/sliders and
  re-seeds the reworked glass tuning values onto older stores.

`STORE_PERSIST_VERSION` is at **108**; `PROJECT_SCHEMA_VERSION` and `SETTINGS_SCHEMA_VERSION` remain at **1**. `APP_VERSION` / `package.json`: **0.3.0-alpha.1**.

---

### Spectrum S1→S2 setting bleed fix (store v99)

- **Defense-in-depth** in the S2 render path (`overlayLayerRegistry.ts`): the
  instance merge now layers `createDefaultSpectrumInstanceSettings()` between
  `responsiveState` (S1 flat values) and the raw `instance` object, so any key
  absent from a persisted instance falls back to its correct per-instance default
  instead of inheriting S1's value. Fixes `spectrumManualGlow`, `spectrumScale`,
  and `spectrumSpan` bleeding from Spectrum 1 to Spectrum 2.
- **`STORE_PERSIST_VERSION` 99**: re-runs `migrateSpectrumInstances` (which does
  `{ ...createDefaultSpectrumInstance(), ...instance }`) so the fix is also
  persisted permanently into localStorage for returning users.

`STORE_PERSIST_VERSION` is at **99**; `PROJECT_SCHEMA_VERSION` and `SETTINGS_SCHEMA_VERSION` remain at **1**. `APP_VERSION` / `package.json`: **0.3.0-alpha.1**.

---

## [0.3.0-alpha.1] — 2026-06-16

### Scene-first model (backbone) + smooth image transition (FASE 0)

- **`defaultSceneSlotId`** (store v98): the scene applied to any image without an
  explicit `sceneSlotId`. Resolved at runtime via
  `resolveEffectiveSceneSlotId(image, state)` (explicit scene → default scene →
  base + legacy overrides) — images never copy the default id. Backfilled to null
  on old stores; carried in export/import + project-health validation.
- **Scene-first precedence** in `setActiveImageId`: an effective scene wins and
  legacy per-image overrides are ignored; overrides only apply when an image has
  no effective scene (back-compat fallback).
- **Scene actions:** `setDefaultSceneSlot` / `clearDefaultSceneSlot` (re-apply +
  transition the active image when it rides the default), `assignSceneToImage`,
  `setImageUseDefaultScene`, `duplicateScene`; `removeSceneSlot` now also clears a
  dangling default. Changing an image's effective scene emits a `visualTransition`.
- **UI:** new "Scene for this image" block (scene picker + default indicator +
  "Set as default" + legacy-overrides notice); per-image overrides reframed as
  legacy/back-compat. All strings i18n (en/es).
- **FASE 0 transition** (prior commit): overlay fade-in envelope on image/scene
  change (spectrum 1/2, particles, rain, logo) driven by `visualTransitionProgress`.

### Spectrum 2 independent slots + HUD shortcut layout

- **Independent profile slots per spectrum:** Spectrum 2 now owns its own
  `spectrumSecondProfileSlots` array — separate names, add/delete, and active
  indicator from Spectrum 1. The editor and HUD swap which array they show based
  on the active target. Save/load/add/remove route per target.
- **Persistence:** `STORE_PERSIST_VERSION` **97** — migration seeds
  `spectrumSecondProfileSlots` from the previously-shared slots so existing
  second-spectrum looks carry over with no data loss.
- **Export/Import:** project bundles now carry `spectrumSecondProfileSlots`
  (full replace on full export, additive merge on partial import).
- **Scenes ↔ Spectrum 2:** Scene slots gained an independent
  `spectrumSecondSlotIndex` (separate column in the Scene tab) so a scene can bind
  each spectrum to its own slot. A `null` ref keeps the back-compat behaviour
  where Spectrum 1's bundled portion drives the second instance; a set ref
  overrides just `spectrumInstances[0]`; `'off'` disables only the second
  spectrum. Wired through migration, export-strip, and project-health validation.
- **Per-image ↔ Spectrum 2:** Background images gained an independent
  `spectrumSecondOverride` (instance-only) with its own capture/clear — a
  "Spectrum 2" row in both the HUD per-image panel and the BG tab's per-image
  overrides. Applied on top of the Spectrum 1 override, composing onto
  `spectrumInstances[0]`, so an image can carry its own Spectrum 2 look. Wired
  through serialization and export-strip. (The pre-existing full `spectrumOverride`
  already snapshotted both spectrums; this adds independent S2-only control.)
- **HUD:** header quick-action shortcuts render in an auto-fit grid instead of a
  flex-wrap row, so the last button (Editor) no longer orphans onto a near-empty
  second line. Added an always-visible **S1/S2 target toggle** to the header row
  (shown when a second spectrum exists) so the active spectrum can be switched
  without opening the Spectrum panel.

### Output / Presentation / Recording (commits `287e007`, `2b85603`, `a53f6a8`)

- **Shared provider lifecycle:** `WallpaperAppProviders` mounts once above routes; audio continues across `#/edit` ↔ `#/present` without remounting `AudioDataProvider`.
- **Routes:** `#/edit`, `#/present`, `#/record`, `#/preview`; `#/editor` redirects to `#/edit`.
- **Output shell:** render-only viewport, recovery layer (`Ctrl+Shift+E`), cursor auto-hide policy, session output settings in Export → Live Output.
- **Real render scale (recording mode):** `outputRenderQuality.ts` scales 2D canvas backing and WebGL DPR (not CSS transform). Removed `OutputRenderScaleStage`.
- **Internal recorder hardening:** `preferCurrentTab` display capture, fullscreen after picker, disabled manual fullscreen during record, WebM VP9 preferred, clearer error strings (EN/ES).
- **Tests:** provider lifecycle, output render quality, display media options, runtime UI mode.

### Spectrum Pixel Art (commit `0bf9d914`)

- **Pixel shape:** Classic linear LED cell renderer (`drawLinearPixel`); radial falls back to bars.
- **Pixelate post-process:** Per-instance offscreen scene + down/upscale (`spectrumPixelate`, `spectrumPixelateScale`).
- **Persistence:** `STORE_PERSIST_VERSION` **96** — migration backfills pixelate keys; shape available in linear style list.
- **Helpers/tests:** `pixelArtHelpers.ts`, unit tests for scale, radial fallback, quantization.

### Documentation & tooling

- Added `docs/status/CURRENT_SYSTEM_STATUS.md`, `docs/architecture/OUTPUT_MODES.md`, `docs/features/SPECTRUM_PIXEL_ART.md`, `docs/features/SPECTRUM_ENGINE.md`, `docs/performance/PERFORMANCE_BASELINE.md`.
- Re-audited `docs/audits/RECORDING_SUBSYSTEM_AUDIT.md`.
- Added `pnpm docs:check` (`scripts/check-doc-consistency.mjs`) in CI.
- Archived superseded status snapshots to `docs/archive/`.

### Schema versions (current)

`STORE_PERSIST_VERSION` is at **98**; `PROJECT_SCHEMA_VERSION` and `SETTINGS_SCHEMA_VERSION` remain at **1**. `APP_VERSION` / `package.json`: **0.3.0-alpha.1**.

### Release hygiene (initial alpha tag)

Release-hygiene pass — aligns version references for first public alpha.

### Fixes

- **Spectrum tab crash** (`Cannot read properties of undefined (reading 'toFixed')`).
  The new `spectrumScale` setting shipped without bumping `STORE_PERSIST_VERSION`, so
  existing persisted state never ran the migration that backfills it and the Scale
  slider read `undefined`. Bumped the store version to **91** (migration now runs) and
  hardened `useSpectrumTargetSettings` to merge over defaults for both the Main and
  instance targets, so no missing key can leak `undefined` into the editor controls.
  Added a regression test asserting every `SPECTRUM_INSTANCE_SETTING_KEYS` entry has a
  default.

### Housekeeping

- Bumped `APP_VERSION` / `package.json` to `0.3.0-alpha.1`.
- Standardized on **pnpm** as the package manager; removed the stray
  `package-lock.json` (dual-lockfile cleanup).
- Updated `README.md` and `docs/README.md` to the current version, pnpm commands,
  and the new alpha scope doc; dropped stale `0.2.0` references.
- Added `docs/product/V1_ALPHA_SCOPE.md` freezing the alpha scope (in / out).
- Archived obsolete root drafts into `docs/archive/`
  (`PLAN.md`, `POLISH.md`, `SPECTRUM_ENGINE.md`, the Lights/Camera/Motion draft)
  and moved `ESTADO_PROYECTO_0_2_0.md` there.
- Removed development junk from the repo root (build `.zip`, exported settings JSON).

### Testing & tooling (Fase 3)

- Added **Vitest** with an isolated `vitest.config.ts` (Node env, no build plugins)
  and a dedicated `tsconfig.test.json`; `*.test.ts` are excluded from the app build.
- First **39 pure-logic tests**: `math`, `audioEnvelope`, version consistency
  (`APP_VERSION` ↔ `package.json`), and `resolveImageTransform` (fit modes, rotation
  extents, min-cover scale, keep-covered clamping/warnings, mirror-fill depth).
- New scripts: `test`, `test:run`, `test:types`.
- Formatted the entire repo with Prettier and cleared all ESLint **errors**
  (typed File System Access usages off `any`, `@ts-ignore` → typed input, removed an
  unused prop binding) so `lint` and `format:check` are green ahead of CI.

### CI (Fase 4)

- Added **GitHub Actions** workflow `.github/workflows/ci.yml` running on push to
  `main`, every pull request, and manual dispatch. Steps (pnpm via
  `pnpm/action-setup`, Node 22 with pnpm cache): `install --frozen-lockfile` →
  `format:check` → `lint` → `test:types` → `test:run` → `build`.
- Added a CI status badge to the README.

### Spectrum manual glow

- New opt-in **manual glow** for the classic `bars` and `wave` shapes (radial and
  linear). The fill keeps its color-source colors (rainbow / image / theme) while
  the glow is tinted by the two manual colors, **decoupled from `spectrumColorSource`**
  (the raw manual colors are carried to the renderer as runtime-only
  `spectrumGlowPrimary/SecondaryColor`), so it works in manual, image and theme alike.
- Three modes: **Core + Halo** (inner glow = primary, outer halo = secondary),
  **Gradient** (glow blends primary→secondary), **Glow + Peaks** (glow = primary,
  peak markers = secondary — offered for `bars` only, since `wave` has no peaks).
  Controls live in the Spectrum → Style panel; per-spectrum (Spectrum 1 and 2).
- When manual glow is on, the primary/secondary swatches stay editable even under the
  **Current Image / Theme** sources (shown under a "Glow colors" sub-label), so the
  glow colors no longer require switching back to Manual.
- Store persist version bumped to **93**. i18n en/es.
- **RGB split (chromatic aberration)** effect for the classic wave — an opt-in
  toggle + amount slider that re-strokes the trace with offset red/blue copies
  (additive blend) for a glitchy retro-CRT fringe. Cheap (~2 extra strokes/frame,
  Canvas-2D). On theme with the "anime glitch" identity.
- **Spiral family rework**: manual glow extended to spiral (core-halo / gradient
  modes) plus a lush additive **bloom halo** under the spine — the same premium glow
  that makes the classic wave appealing — and a subtle radial depth falloff on the
  dots. Opt-in via the manual glow toggle; off = unchanged.
- **Manual glow extended to all animated families** — spiral, oscilloscope, tunnel,
  liquid and orbital now honor the manual glow toggle. The fill keeps its color-source
  colors; the glow uses the manual colors (decoupled from the source). In Gradient mode
  the per-element glow blends primary→secondary across the shape. The oscilloscope —
  which had no bloom at all — now gets a real trace glow. All opt-in; off = unchanged.

### First-run experience (Fase 5)

- Added an inline **first-run empty state** over the wallpaper (editor only, not a
  modal) shown while no background image exists. Three golden-path CTAs: **Try a demo
  scene** (one click — generates a procedural gradient background and activates it;
  spectrum/particles are on by default so it reacts immediately), **Load image**, and
  **Load audio**. Dismissable for the session ("Start from blank") without a persisted
  flag, so no store migration. Fully internationalized (en/es).

## [0.3.0-alpha]

This release stabilizes a large wave of feature growth. `STORE_PERSIST_VERSION` is
at **82**; `PROJECT_SCHEMA_VERSION` and `SETTINGS_SCHEMA_VERSION` are at **1**.

### Editor / UI

- **Modern editor UI** with a `legacy | modern` variant switch and an isolated
  `editorTheme` resolver (branch-isolated palette, neutral image fallback, universal
  rainbow boost).
- **Simple / Advanced UI modes** — tabs collapse to essential controls in simple mode
  and reveal detailed controls in advanced mode.
- Design-system consolidation under `src/ui` (tokens + base components).

### Projects, Setlists & Scenes

- **Project / setlist system** — named curations of the global image pool with strict
  filtering when active, a Scene sub-tab, and a HUD chip.
- **Scene bindings are explicit** — edits do not auto-apply; empty slots render
  disabled and an explicit Apply with a visible diff is required.

### Background

- **Background transform model** — `Keep Screen Covered` is now independent from bass;
  a single `resolveCoveredImageTransform` helper drives both render and preview, and
  previews use the real screen aspect (WYSIWYG).
- **Mirror Fill** — minimal dynamic clones with a 1px seam overlap and Y-axis mirroring;
  `coverageActive = keepCovered && !mirrorFill`.

### Spectrum

- Spectrum **family improvements** across linear / radial / spiral / tunnel / orbital /
  liquid / oscilloscope renderers, including mirror handling.
- Time-domain pipeline (`getTimeDomainBins`) plumbed end-to-end with phosphor + grid FX.
- **Synthetic calibration** sprint — honest slider behavior, scope smoothing tied to
  scroll speed, spectrogram removed.
- **Manual spectrum control** — keyboard-driven spectrum (audio / max / add / manual
  modes) via a reusable runtime module.

### Stage FX (new)

- **Stage Lights** — directional concert beams from configurable edges, with sweep
  styles, audio reactivity (hold + decay envelope), gating, and blend modes.
- **Flash Light** — audio-peak impact overlay, independent from the beams, using a
  cached shape canvas and a decay-to-zero envelope.
- **Camera FX (Camera Motion)** — drift / circle / figure-eight / orbit / pendulum
  motion applied to marked visual roots only (HUD/editor stay fixed), with per-target
  selection.
- **Screen Shake** — horizontal / vertical / punch / jitter / kick-snap modes that
  trigger on audio peaks and decay back to rest.

### Audio

- **Multitrack playlist** system (playlist tracks, auto-advance on track end, mix UI).
- Background bass-zoom envelope with Classic / Smooth / Punchy presets.

### Import / Export

- Project-package import/export improvements, including partial imports that tolerate
  missing audio (shallow-merge path that avoids the `structuredClone` + Zustand-setter
  pitfall).

### Performance & safety caps

- Hard FX ceilings in `STAGE_FX_CAPS` / `CAMERA_FX_CAPS` so effects can never whiteout
  the screen or run unbounded blur (`maxBeamCount`, `maxBeamBlurPx`, `maxFlashOpacity`,
  `maxShakePx`, `maxMotionPx`, `maxScale`).
- Per-`performanceMode` budgets (`resolveStageLightsBudget`) that scale beam count and
  blur down on `low` / `medium`.
- **Stage Lights render audit (this release):** the beam loop now early-outs when the
  layer is effectively invisible (opacity/intensity 0 or audio-gated below threshold),
  parses the beam color once per frame instead of per gradient stop, and drops/softens
  the haze, core, and flare shadow-blur passes on `low` / `medium` performance modes.

### HUD / QuickActions

- Added on/off toggles for **Stage Lights, Flash Light, Camera FX, Screen Shake** to the
  Motion quick-actions group, plus **Keep Covered** and **Mirror Fill** (background
  transform) to the Looks group — all wired to existing store flags.
- Fully internationalized the QuickActions HUD under the `qa_*` key namespace (every chip
  label + tooltip, both EN/ES); builders now take the active translations object.

### Notes / known debt

- Stage Lights gradients are still re-created each frame because beam geometry changes
  per sweep; an offscreen gradient/mask cache is a larger architectural change deferred
  past this sprint.
