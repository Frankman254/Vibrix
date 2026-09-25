# Nivel 01 — El estado y el store (el almacén por dentro)

> Requisito: haber leído el [Nivel 00](./00-fundamentos.md). De ahí nos
> traemos la analogía: el store es **el almacén / libreto maestro**, la única
> fuente de la verdad. Hoy abrimos sus puertas y recorremos los pasillos.
>
> Como siempre: **cero conocimientos asumidos**. Cada término nuevo se explica
> la primera vez.

---

## 0. Lo que vas a entender al terminar

1. Qué forma tiene el estado (spoiler: es **un mueble de un solo nivel con
   cientos de cajones etiquetados**, no una caja de cajas).
2. Cómo se organizan las **acciones** que modifican ese estado (las 12
   "rebanadas" o slices).
3. Cómo sobrevive tu configuración al cerrar el navegador (**persistencia**),
   y por qué tus imágenes viajan por un camino separado (**IndexedDB**).
4. Qué pasa cuando abres la app con una configuración guardada hace meses
   (**migraciones**, versión 85).
5. La checklist exacta para **añadir un ajuste nuevo** sin romper nada.

---

## 1. La forma del estado: un mueble plano con cientos de cajones

Lo primero que sorprende al abrir el almacén: **no hay cajas dentro de
cajas**. Casi todo el estado es **una sola lista plana de claves**, definida
en `src/types/wallpaper.ts` dentro del tipo `WallpaperState` (que ocupa unas
900 líneas él solo).

> **¿Qué es un "tipo"?** En este proyecto se usa TypeScript, una variante de
> JavaScript que permite escribir **fichas técnicas**: "esta cosa existe, se
> llama así, y solo puede contener esta clase de valor". El compilador (un
> revisor automático) protesta si alguien mete un texto donde va un número.
> `types/wallpaper.ts` es la ficha técnica de TODO el estado: si un ajuste no
> está declarado ahí, no existe.

En vez de agrupar por carpetitas (`{ logo: { size, color } }`), el estado usa
**prefijos en el nombre**:

```
imageScale, imagePositionX, imageOpacity, ...        ← todo lo "image..." es del fondo
logoSize, logoBandMode, logoPulseIntensity, ...      ← todo lo "logo..." es del logo
spectrumMode, spectrumBarCount, spectrumColor, ...   ← todo lo "spectrum..." es del espectro
particleCount, particleShape, particleSpeed, ...     ← partículas
rainEnabled, rainSpeed, rainColorMode, ...           ← lluvia
audioSensitivity, audioSourceMode, fftSize, ...      ← audio
```

> **Analogía:** es un **archivador gigante de un solo nivel**, donde cada
> cajón tiene una etiqueta que empieza por el nombre de su dueño:
> "LOGO-tamaño", "LOGO-color", "ESPECTRO-modo"… No hay subcarpetas; el
> _prefijo_ ES la organización.

**Por qué te importa:** cuando busques cualquier ajuste, búscalo por prefijo.
¿Algo del logo? Busca `logo` en `types/wallpaper.ts`. El prefijo también te
dice **qué slice es la dueña** (siguiente sección) y qué pestaña del editor
lo controla.

Hay unas pocas excepciones que sí son "cajas" (listas u objetos):
`backgroundImages` (la lista de imágenes del pool), `overlays` (imágenes
encima), `audioTracks` (la playlist), `customPresets`, `sceneSlots`,
`setlists`, y los `...ProfileSlots` (presets tuyos por feature). Son listas
porque guardan _varias cosas del mismo tipo_.

---

## 2. Estado vs. acciones: el inventario y los empleados

El store completo (`WallpaperStore`, definido en
`src/store/wallpaperStoreTypes.ts`) es la suma de dos cosas:

```
WallpaperStore = WallpaperState  +  las acciones
                 (el inventario)    (los empleados que lo modifican)
```

- **El inventario** (`WallpaperState`): los datos. "El logo mide 120".
- **Las acciones**: funciones con nombres tipo `setLogoSize(v)`,
  `addAudioTrack(track)`, `saveSpectrumProfileSlot(i)`. Son **la única forma
  legal de cambiar el inventario**.

> **Analogía:** en un almacén serio nadie entra y mueve cajas por su cuenta.
> Le pides al **empleado de ese pasillo**: "pon el logo a 120". Él lo apunta
> en el inventario y avisa a quien esté mirando ese cajón. Eso de "avisar" es
> clave: cuando una acción cambia un valor, **React redibuja automáticamente**
> los componentes que estaban leyendo ese valor. Por eso mover un slider se ve
> al instante.

### Cómo "lee" un componente el almacén

Cualquier pieza de la interfaz lee así:

```ts
const logoSize = useWallpaperStore(state => state.logoSize);
```

Esa función flecha (`state => state.logoSize`) se llama **selector**: "del
almacén entero, a mí solo me interesa este cajón". El componente queda
**suscrito** a ese cajón: si cambia, se redibuja; si cambia otro cajón
cualquiera, no se entera (y eso es bueno para el rendimiento).

> ⚠️ **Detalle de rendimiento que ya mordió una vez:** si un selector devuelve
> _varias cosas a la vez_ en un objeto nuevo (`state => ({ a, b, c })`), React
> cree que "cambió" en cada redibujado aunque no cambiara nada, y redibuja de
> más. La cura es un ayudante llamado `useShallow` que compara el contenido en
> vez del envoltorio. `ControlPanel` y `MediaDock` ya lo usan; varias pestañas
> viejas todavía no (deuda conocida, ver Nivel 06).

---

## 3. Las 12 rebanadas (slices): un empleado por pasillo

Las acciones no viven todas en un archivo gigante: están repartidas en
**slices** ("rebanadas") dentro de `src/store/slices/`. Cada slice es **el
conjunto de empleados de un pasillo**: agrupa las acciones de un tema.

Aclaración importante (el Nivel 00 decía "13" y era impreciso): en la carpeta
hay **13 archivos**, pero solo **12 son slices**. El archivo
`backgroundCollectionActions.ts` no es una rebanada propia: es una **caja de
herramientas interna** del slice de fondo (lo usa para las operaciones de
colección: añadir/quitar/activar imágenes del pool).

| Slice (archivo)                                           | Pasillo del que se encarga                                                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backgroundSlice.ts` (+ `backgroundCollectionActions.ts`) | El fondo: imágenes del pool, escala/posición/opacidad, reacción al bajo (bass zoom), espejo/mirror fill, fondo global, filtros y "Looks", overrides por imagen. Es la más grande. |
| `audioSlice.ts`                                           | El "oído": sensibilidad, fuente (escritorio/micro/archivo), suavizados, FFT, y el título de pista (track title).                                                                  |
| `audioPlaylistSlice.ts`                                   | La playlist de audio: añadir/quitar/reordenar pistas, crossfade, auto-avance.                                                                                                     |
| `audioLyricsSlice.ts`                                     | Letras de canciones: qué pista tiene qué letra, modos y overrides de Lyrixa.                                                                                                      |
| `spectrumSlice.ts`                                        | El espectro (las barras que bailan): modo, familia, colores, clones, perfiles. Valida rangos contra `config/ranges.ts`.                                                           |
| `logoSlice.ts`                                            | El logo que late: tamaño, pulso, banda que lo dispara, perfiles de logo.                                                                                                          |
| `particlesRainSlice.ts`                                   | Partículas y lluvia (los dos efectos GPU) + perfiles "Motion" combinados y su randomizador.                                                                                       |
| `stageCameraSlice.ts`                                     | Stage FX: luces de concierto, efectos de cámara, y la rotación del espectro radial.                                                                                               |
| `layoutSlice.ts`                                          | La resolución de referencia del lienzo (para que lo guardado se vea igual en otra pantalla).                                                                                      |
| `calibrationSlice.ts`                                     | Calibración del audio: grupos de parámetros, valores sugeridos, overrides de rangos.                                                                                              |
| `setlistsSlice.ts`                                        | Setlists: curaciones con nombre del pool global (cuando una está activa, TODO filtra a sus elementos).                                                                            |
| `systemSlice.ts`                                          | Lo transversal: presets de fábrica y personalizados, escenas (scene slots), idioma, tema del editor, modo de rendimiento, acciones masivas.                                       |

Todas las slices se ensamblan en `src/store/wallpaperStore.ts`, que es
sorprendentemente corto (70 líneas) porque solo hace el montaje:

```
estado inicial (FACTORY_DEFAULT_STATE)
   + empleados del pasillo fondo     (createBackgroundSlice)
   + empleados del pasillo audio     (createAudioSlice)
   + ... (las 12)
   = el store completo
```

### ¿Y de dónde sale el estado inicial?

Las slices aportan **acciones**, no datos. Los **valores de fábrica** viven en
`src/store/defaultState.ts` (`DEFAULT_STATE`, ~800 líneas de "el logo por defecto
mide tanto, el espectro arranca en tal modo…"), retocados por un parche
canónico en `src/store/factoryDefaults.ts`. Es decir:

> **Analogía:** `constants.ts` es el **catálogo de fábrica** ("así sale el
> producto de serie"), y las slices son el personal. El almacén se inaugura
> con el catálogo de serie, y luego tu configuración guardada lo sobreescribe
> (sección 4).

---

## 4. Persistencia: cómo sobrevive tu configuración

Cuando cierras la pestaña, el navegador olvida todo lo que estaba en memoria.
Para que tu diseño no muera, el store usa el middleware **`persist`** de
Zustand (un "middleware" es un complemento que envuelve al store y le añade
una habilidad; aquí, la de guardarse solo).

Cada vez que cambias algo, `persist` escribe el estado al cajón de texto del
navegador (**localStorage**) bajo la etiqueta **`vibrix-state`**, junto con un
número de versión (**`STORE_PERSIST_VERSION = 124`**, definido en
`src/lib/version.ts`). Al volver a abrir la app, lo lee y **rehidrata** el
almacén.

Tres detalles del código real que conviene conocer:

### 4.1 El guardia de seguridad (`safeStorage`)

En `wallpaperStore.ts` hay un envoltorio alrededor de localStorage: antes de
entregar lo guardado, **intenta leerlo**; si está corrupto (un JSON roto, por
ejemplo porque el navegador cortó una escritura), **lo tira a la basura y
arranca de fábrica** en vez de dejar la app colgada con datos podridos.

> **Analogía:** el guardia de la puerta revisa el paquete; si llega
> reventado, no te lo entrega — prefiere que estrenes uno nuevo a que te
> intoxiques.

### 4.2 No todo se guarda (`partialize`)

`src/store/wallpaperStorePersistence.ts` define **qué se queda fuera** del
guardado. Se excluye todo lo que solo tiene sentido _mientras la app está
abierta_:

- `audioCaptureState` (si el micrófono está capturando AHORA — no tiene
  sentido guardarlo),
- la pestaña activa del panel de control,
- el estado del modo de reposo (sleep),
- y — esto es lo importante — **todas las URLs de imágenes**
  (`imageUrl`, `logoUrl`, `imageUrls`…). En `backgroundImages` y `overlays`
  se guardan las fichas de cada imagen, pero con su `url` puesta a `null` a
  propósito.

¿Por qué borrar las URLs? Porque no son direcciones de verdad: son **blob
URLs**.

> **¿Qué es una blob URL?** Cuando subes una imagen, el navegador la tiene en
> memoria y te da un "ticket" temporal para referirte a ella (algo tipo
> `blob:http://localhost/3f9a…`). Ese ticket **caduca al cerrar la pestaña**.
> Guardarlo sería como guardar el ticket del guardarropa de una fiesta que ya
> terminó: mañana no vale nada. Lo que sí se guarda es el **`assetId`**, el
> número de percha permanente — y con él se recupera el abrigo del trastero
> (sección 6).

### 4.3 El estado guardado es texto plano

Todo lo persistido debe poder convertirse a texto (JSON). Por eso las
imágenes (binarios pesados) no pueden ir aquí, y por eso existe la regla de
oro nº 5 del Nivel 00: el store contiene funciones (las acciones), y
**`structuredClone` revienta** si intentas clonar el estado completo con
ellas dentro. Los exports/imports del proyecto usan copias superficiales
(shallow copy) por esta razón.

---

## 5. Migraciones: el traductor de configuraciones viejas

Tu configuración guardada puede ser de hace 3 meses, cuando los ajustes se
llamaban distinto. Si la app la cargara tal cual, explotaría. Para eso está
`src/store/wallpaperStoreMigrations.ts` — con 3.500 líneas, uno de los
archivos más grandes del proyecto.

Cómo funciona de verdad (es menos elegante de lo que suena, y es deuda
conocida):

- **No hay una lista de pasos "de v84 a v85, de v83 a v84…"**. Hay UNA
  función gigante (`migrateWallpaperStore`) que actúa de **normalizador
  universal**: recibe lo que haya guardado, sea de la versión que sea, y lo
  empuja al formato actual.
- Su herramienta principal es el patrón `valor ?? DEFAULT_STATE.valor`, que
  significa: "si este cajón no existe en lo guardado (porque es un ajuste
  nuevo que no existía entonces), rellénalo con el valor de fábrica". Esto
  aparece **167 veces** en el archivo.
- También **borra fósiles**: ajustes que ya no existen (`glitchIntensity`,
  `spectrumLayout`…) se eliminan explícitamente para que no estorben, y los
  formatos viejos se traducen (ej.: el antiguo `spectrumLayout: 'left'` se
  convierte en el trío moderno modo/orientación/posición).

> **Analogía:** no es una cadena de traductores ("del latín al castellano
> antiguo, de ahí al moderno"). Es **un solo restaurador de muebles** que
> recibe cualquier mueble viejo y lo deja con el catálogo actual: repone los
> cajones que falten (con piezas de fábrica), tira los adornos descatalogados
> y reetiqueta los que cambiaron de nombre.

**¿Para qué sirve entonces el número 85?** El middleware `persist` solo llama
al migrador si la versión guardada es distinta a la actual. Subir el número
es la forma de decir "lo guardado ya no está al día; pásalo por el
restaurador". La costumbre del proyecto: **cada cambio de formato sube
`STORE_PERSIST_VERSION` en 1** y añade su normalización a la función.

---

## 6. El trastero: IndexedDB y la restauración de assets

Repasemos el problema: tus imágenes/audios no caben en localStorage, y las
blob URLs caducan. La solución tiene dos piezas:

### 6.1 `src/lib/db/imageDb.ts` — el encargado del trastero

Habla con **IndexedDB** (el cajón grande del navegador). Mantiene una base
llamada **`lwag-images`** con un único estante (`images`) donde cada archivo
se guarda como: `{ id, data (los bytes crudos), type (qué clase de archivo
es) }`. A pesar del nombre "imageDb", **también guarda los audios**.

Sus operaciones, en cristiano:

- `saveImage(file)` → genera un id único (tipo `img-1718041…-x3f9k`), guarda
  los bytes, devuelve el id. **Ese id es lo que el store persiste.**
- `loadImage(id)` → saca los bytes, fabrica una **blob URL fresca** y te la
  da. (El ticket del guardarropa se reimprime en cada visita.)
- `deleteImage(id)` / `clearAllImages()` → limpieza. (Recordatorio: cualquier
  botón que llegue aquí debe confirmar antes. Regla de oro nº 2.)
- Caso especial: ids que empiezan por **`virtual://`** no están en el
  trastero, sino en **carpetas locales de tu disco** que conectaste a la app
  (eso lo gestiona `localFoldersDb.ts`). El encargado lo detecta por el
  prefijo y va a buscar el archivo a la carpeta real.

### 6.2 `useRestoreWallpaperAssets` — el reencuentro al arrancar

Al abrir la app ocurre el paso 6 del arranque (Nivel 00): este hook
(`src/hooks/useRestoreWallpaperAssets.ts`) hace el casamiento entre lo
persistido y el trastero:

1. Lee del store la lista de fichas de imágenes (que tienen `assetId` pero
   `url: null`, recuerda el partialize).
2. Pide al trastero una blob URL fresca para cada `assetId`.
3. Rellena las fichas con sus URLs nuevas. **Las imágenes cuyo archivo ya no
   exista en el trastero se descartan de la lista** (sin archivo no hay nada
   que mostrar).
4. Hace lo mismo para el logo, el fondo global y los overlays.
5. Re-sincroniza los ajustes "espejo" de la imagen activa (escala, posición,
   etc. — ver la nota de duplicación abajo).
6. En segundo plano, regenera las miniaturas del pool que falten.

> 📌 **Nota de arquitectura (y de deuda):** habrás visto que existe
> `backgroundImages` (la lista de fichas, cada una con su escala/posición) **y
> además** claves planas sueltas como `imageScale`, `imagePositionX`… Estas
> claves planas son **el espejo de la imagen activa**: una copia de
> conveniencia para que los sliders y el renderer lean rápido "la actual".
> Cada vez que cambias de imagen activa, el slice de fondo copia los valores
> de la ficha a las claves planas, y viceversa. Funciona, pero significa que
> **la misma verdad vive en dos sitios y hay que mantenerlos sincronizados a
> mano**. Es la duplicación "BG" que retomaremos en el Nivel 06.

---

## 7. Receta: añadir un ajuste nuevo que se guarde

La checklist completa, en orden. Es el patrón que siguen todos los ajustes
existentes (míralo en cualquier commit reciente de feature):

1. **Declararlo** en `src/types/wallpaper.ts` dentro de `WallpaperState`
   (con su tipo: número, booleano, o una unión de opciones).
2. **Darle valor de fábrica** en `DEFAULT_STATE` (`src/store/defaultState.ts`).
3. **Crear su acción** (`setMiAjuste`) en la **slice dueña** (la del prefijo)
   y declarar la firma de la acción en `wallpaperStoreTypes.ts`.
4. **Migración:** añadir su línea `miAjuste: state.miAjuste ??
DEFAULT_STATE.miAjuste` en `wallpaperStoreMigrations.ts`, y **subir
   `STORE_PERSIST_VERSION`** en `src/lib/version.ts`.
5. **Si tiene rango** (mín/máx de un slider), declararlo en
   `src/config/ranges.ts` para que UI y validación compartan los límites.
6. **La interfaz:** el control en la pestaña correspondiente de
   `components/controls/tabs/`, con sus textos en `lib/i18n/es.ts` y `en.ts`.
7. **El consumo:** que el renderer o `layers.ts` lo lea y haga algo con él.

Si te saltas el paso 4, a ti te funcionará (tu localStorage ya tiene el
valor)… y a cualquier otra persona la app le arrancará con `undefined` en ese
cajón. Es el error clásico.

---

## 8. Glosario nuevo de este nivel

- **TypeScript / tipo:** la "ficha técnica" que declara qué existe y qué
  forma tiene. El revisor automático del proyecto.
- **Selector:** la función con la que un componente dice "del almacén, solo
  me interesa este cajón".
- **`useShallow`:** ayudante que evita redibujados de más cuando un selector
  devuelve varias cosas.
- **Middleware:** complemento que envuelve el store y le añade una habilidad
  (aquí: `persist`).
- **`partialize`:** el filtro de "qué NO se guarda".
- **Blob URL:** ticket temporal del navegador para un archivo en memoria.
  Caduca al cerrar la pestaña. Nunca se persiste.
- **`assetId`:** el identificador permanente de un archivo en el trastero
  (IndexedDB). Esto SÍ se persiste.
- **JSON:** formato de texto para guardar datos estructurados. Todo lo
  persistido acaba siendo JSON.
- **Normalizador:** la estrategia de migración de este proyecto — una función
  que empuja cualquier estado viejo al formato actual rellenando huecos con
  valores de fábrica.

---

## 9. Resumen en una frase

> El estado es **un archivador plano de cientos de cajones con prefijo**
> (ficha técnica en `types/wallpaper.ts`, valores de fábrica en
> `constants.ts`); lo modifican **12 cuadrillas de acciones** (slices); se
> guarda solo en localStorage como `vibrix-state` v85 **menos lo efímero y las
> blob URLs** (partialize); al arrancar, **un restaurador universal** lo
> actualiza (migraciones) y **el encargado del trastero** (imageDb +
> useRestoreWallpaperAssets) reimprime los tickets de tus imágenes.

---

**Siguiente:** [`02-pipeline-render.md`](./02-pipeline-render.md) — seguimos
la cinta de producción: cómo `layers.ts` convierte este almacén en capas y
cómo `WallpaperViewport` las reparte entre los tres dibujantes.
