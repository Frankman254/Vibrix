# Preparación para el suite de escritorio (Windows / macOS)

**Fecha:** 2026-09-06 · **Estado:** informe, **nada migrado** · Alcance: qué
rompería si mañana empaquetáramos esto en Electron o Tauri, y qué se llama en
realidad este producto.

> Esto **no** propone migrar. Ninguna dependencia nueva, ningún cambio de
> tecnología. Es el inventario que hay que tener antes de decidir.

---

## 1 · Qué hace hoy este software (descripción honesta)

Un **editor de escenas audiovisuales reactivas al audio**, más los modos de
salida limpios para consumirlas.

- **Entrada de audio:** MP3 con playlist, micrófono, o captura de audio del
  escritorio. Se expone FFT por bandas **y** forma de onda (time-domain).
- **Motor visual:** fondo con slideshow + transformaciones reactivas, hasta dos
  instancias de espectro (con familias, formas, pixelado, glow propio),
  partículas, lluvia, logo reactivo, luces de escenario, looks/filtros, glitch
  y RGB split.
- **Letras:** importa bundles de **Lyrixa** y los renderiza con capas, roles e
  idiomas (ver `docs/features/LYRIXA_CONTRACT.md`).
- **Organización:** escenas con slots, setlists (curaciones del pool), perfiles
  por subsistema, presets.
- **AI Director:** deriva una intención de escena desde una imagen y la compila
  a estado de forma determinista.
- **Salidas:** `#/edit`, `#/present` (apto OBS), `#/record`, `#/preview`, más
  grabación por `MediaRecorder` y un exportador offline **a medio cablear**.

En una línea: **un motor de visuales reactivas con editor, no un reproductor.**
La palabra "wallpaper" del nombre actual describe **un** modo de uso, y encima
es el único que **todavía no existe de verdad** (§3).

---

## 2 · APIs del navegador de las que depende, y qué pasa en cada shell

| API                              | Dónde                                                                 | Electron (Chromium)                    | Tauri (WebView2 / WKWebView)                  |
| -------------------------------- | --------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| `getDisplayMedia` **con audio**  | `DesktopAudioAnalyzer`                                                | OK vía `setDisplayMediaRequestHandler` | Win: parcial · **mac: no** (ver §3.1)         |
| `getUserMedia` (micrófono)       | `MicrophoneAnalyzer`                                                  | OK (permiso del sistema)               | OK                                            |
| **File System Access** (handles) | `useLocalFolders`, `exportFileUtils`                                  | OK                                     | Win OK · **mac WKWebView: no la soporta**     |
| IndexedDB                        | store persistido, assets, caché de firmas (41 archivos tocan storage) | OK, sin cuota práctica                 | OK                                            |
| `BroadcastChannel`               | sync editor ↔ salida (4 archivos)                                     | OK entre ventanas del mismo origen     | OK                                            |
| WebCodecs `VideoEncoder`         | exportador offline (planificado)                                      | OK                                     | Win OK · mac: sólo Safari ≥16.4, verificar    |
| `MediaRecorder`                  | grabación en vivo                                                     | OK (webm/vp9)                          | **códecs distintos**: WKWebView sólo mp4/h264 |
| `requestFullscreen`              | `requestOutputFullscreen`                                             | Reemplazable por API de ventana        | Idem                                          |
| Screen Wake Lock                 | `usePlaybackWakeLock`                                                 | Usar `powerSaveBlocker`                | Plugin propio                                 |
| `mediaSession`                   | 16 archivos                                                           | Casi no-op                             | Casi no-op                                    |

**Hallazgo que no esperaba:** `navigator.storage.persist()` **no se llama en
ningún lado** (0 ocurrencias). Hoy, en navegador, toda la biblioteca de
proyectos vive en almacenamiento que el navegador puede desalojar bajo presión
de disco. Empaquetar en escritorio lo resuelve por accidente — pero mientras
sea web, es una pérdida de datos esperando ocurrir, y arreglarlo son tres
líneas. **No es parte de este trabajo**, pero queda anotado.

---

## 3 · Las tres barreras reales

### 3.1 · Audio del sistema en macOS

En Windows, `getDisplayMedia({ audio: true })` entrega el audio del sistema.
En macOS **no existe equivalente**: ni el navegador ni Electron pueden capturar
la salida de audio sin ayuda. Las salidas son un dispositivo virtual de audio
(BlackHole / Loopback, que instala el usuario) o un binario nativo sobre
ScreenCaptureKit / Core Audio taps (macOS 14.4+).

Esto es lo más caro de la lista y **es la razón principal para ir a Electron o
Tauri**, no las otras. Conviene decidirlo antes que cualquier cosa de UI: el
adaptador ya está aislado (`IAudioSourceAdapter`), así que un
`NativeLoopbackAnalyzer` entra sin tocar renderers.

### 3.2 · "Wallpaper" no está implementado en ninguna parte

Hoy `#/present` es una página a pantalla completa. Un wallpaper de verdad es
una ventana **detrás de los iconos del escritorio**, y eso no lo da ninguna API
web:

- **Windows:** reparentar la ventana al `WorkerW` que genera `Progman`. Bien
  documentado, estable, pero hay que rehacerlo cuando el explorador se reinicia.
- **macOS:** `NSWindow` en nivel de escritorio con `canJoinAllSpaces`. Además,
  las apps a pantalla completa crean un Space propio que **tapa el fondo**, y
  el comportamiento con múltiples monitores y con Stage Manager difiere.

O sea: el nombre promete algo que el software todavía no hace. Ver §4.

### 3.3 · Rutas hash y multiventana

El sync editor ↔ salida usa `BroadcastChannel` + rutas hash, que asume mismo
origen. En Electron son dos `BrowserWindow` del mismo origen → funciona igual.
En Tauri con múltiples webviews, verificar. **No es bloqueante**, pero es lo
que hay que probar primero al empaquetar, porque si se rompe se rompe callado.

---

## 4 · Nombre del producto

**No se renombró nada.** Ni repo, ni namespaces, ni paquetes. Esto es sólo la
lista para decidir.

### Por qué el nombre actual estorba

`LiveWallpaperAnimeGlitch` nombra tres cosas y **acierta en ninguna**:
"LiveWallpaper" es el modo que aún no existe (§3.2); "Anime" es un tipo de
imagen que el usuario aporta, no algo que el motor haga; "Glitch" es **un
efecto entre veinte**. Además no combina con `Lyrixa` ni con `Transcriptor`.

### Candidatos

Criterio: corto, pronunciable en español y en inglés, que suene a familia con
_Lyrixa_, y que nombre **lo que el motor hace** — no la estética de las imágenes.

| Nombre        | De dónde sale                                     | Por qué encaja                                                       |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| **Vibrix**    | vibración + la terminación de _Lyrixa_            | El más "familia" de todos. Suite: Transcriptor → Lyrixa → Vibrix.    |
| **Pulsara**   | pulso + cadencia de _Lyrixa_                      | El motor entero corre sobre envolventes de audio: pulso es literal.  |
| **Scenika**   | escena                                            | Nombra el modelo de datos real: escenas, slots, setlists.            |
| **Ondara**    | onda                                              | FFT y time-domain: ondas es lo que entra y lo que sale.              |
| **Sonaris**   | sonido + sonar                                    | Evoca espectro y osciloscopio, que son la firma visual del producto. |
| **Kaleidon**  | caleidoscopio                                     | Formas radiales, mirror fill, paletas rotatorias: es lo que se ve.   |
| **Animatriz** | anima/animación + matriz                          | Conserva el linaje "anime" sin prometer un género, en español.       |
| **Nocturna**  | uso real: corre de fondo mientras hacés otra cosa | El único que nombra el _hábito_ y no la técnica; el más arriesgado.  |

**Mi orden:** Vibrix (coherencia de suite) → Scenika (precisión técnica) →
Pulsara (el más lindo de decir).

**Antes de elegir hace falta** lo que este informe no hizo: búsqueda de marca,
disponibilidad de dominio y de nombre en npm. Ninguno de los ocho fue
verificado.

### Cómo se haría el rename, cuando se apruebe

Por capas y en commits separados, porque tocar todo junto vuelve irrevisable el
diff: (1) nombre visible — `<title>`, README, i18n; (2) `package.json` y el
badge de CI; (3) las claves de almacenamiento (`lwag-store`, `lwag-state`,
`lwag-workspace`) — **esto necesita migración o el usuario pierde su
biblioteca**; (4) el repo. Los prefijos `lwag*` son el paso caro; todo lo demás
es cosmético.

---

## 5 · Lo que **no** hay que hacer todavía

- No agregar Electron ni Tauri hasta decidir §3.1, que es el requisito que
  manda.
- No mover código a un paquete compartido "del suite": Lyrixa y este renderer
  se hablan por el **bundle**, no por tipos compartidos. Un paquete común
  volvería el contrato una dependencia, que es exactamente lo que
  `docs/features/LYRIXA_CONTRACT.md` evita.
- No renombrar nada sin aprobación.
