# Offline Video Renderer — Design + as-built

> Status: **MVP implementado (Fase 1A/1B del plan maestro).** La sección
> "Como está construido" describe el código real; el resto del documento es el
> diseño original y sigue siendo la referencia para lo que falta (1C–1E).

## Como está construido (2026-09)

```
ExportTabBody (components/)            inyecta createOfflineBackgroundSubsystem()
  └─ useOfflineVideoExport (features/export/controls)
       1. codecs sondeados antes del clic (resolveOfflineVideoFormat)
       2. showSaveFilePicker en el clic → StreamTarget; si no hay, BufferTarget
       3. loadImageBlob → decodeOfflineAudioFile (AudioBuffer entero)
       └─ runOfflineVideoExport (features/export/video)
            snapshot congelado + paleta real del fondo (getBackgroundPalette)
            prepareAllRenderSubsystems (carga la imagen de fondo)
            for i in 0..N:  t = i / fps
              fondo negro → renderFrameAt(ctx(t)) → encoder.addFrame(t)
              audio en rodajas de 1 s detrás del vídeo (el muxer intercala)
            finish() → archivo / Blob
```

| Pieza                                                      | Archivo                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Negociación de formato + progreso (puro, testeado)         | `src/features/export/video/offlineVideoFormat.ts`                                                              |
| mediabunny: encoder, sink, writable cancelable             | `src/features/export/video/offlineVideoEncoder.ts`                                                             |
| Bucle de frames                                            | `src/features/export/video/runOfflineVideoExport.ts`                                                           |
| Fondo (vive en `components/`, se inyecta)                  | `src/components/wallpaper/layers/imageCanvasOfflineSubsystem.ts`                                               |
| Subsistemas de audio (spectrum, logo, track title, lyrics) | `src/features/export/renderSubsystems/audioLayers.ts`                                                          |
| Overlays de imagen (CSS → canvas, matemática testeada)     | `src/features/export/renderSubsystems/overlays.ts` + `overlayImageDraw.ts`                                     |
| Fondo global (mismo dibujo que la vista en vivo)           | `src/features/export/renderSubsystems/globalBackground.ts` → `src/features/background/globalBackgroundDraw.ts` |
| Avisos de capas no exportadas                              | `src/features/export/offlineExportPlanner.ts`                                                                  |

Reglas que el código ya cumple y no se deben romper:

- **`features/export` no importa `components/`.** Las capas que viven en
  presentación entran como `extraSubsystems`.
- **El picker se abre en el clic.** Nada asíncrono largo antes de
  `showSaveFilePicker`, o el navegador pierde la activación de usuario.
- **Cancelar no deja archivo a medias:** `createCancellableFileWritable`
  convierte el `close()` en `abort()` salvo durante `finalizing`.
- **Los yields usan MessageChannel,** no `setTimeout` (throttled a 1 s en
  pestañas ocultas).
- **Paleta = la del fondo** (`useBackgroundPalette` en vivo), no la del tema del editor.
- **El análisis offline imita el `AnalyserNode` en vivo** (`offlineAudioAnalysis.ts`):
  últimas `fftSize` muestras hasta el instante del frame, ventana Blackman,
  magnitud / N, suavizado `audioSmoothing` escalado a pasos de 60 Hz, dB → byte
  y `timeDomain` para el oscilloscope; canales sin EMA extra, como el snapshot
  en vivo. Se decodifica a la frecuencia del `AudioContext` del dispositivo.
  Verificado contra un `AnalyserNode` real: 0 bytes de diferencia sin
  suavizado. Si se toca, repetir esa comparación.
- **El export no tiene presupuesto de tiempo real** (`getRenderStateSnapshot`):
  el snapshot fuerza `performanceMode: 'high'`, quita pausa de movimiento y
  sleep mode y descarta el pulso sintético de calibración. Da igual cuánto
  tarde cada frame: el vídeo sale siempre a calidad máxima, aunque el editor
  esté en `low`. Verificado: export con el editor en `low` y en `high` = 0
  píxeles de diferencia.
- **Reloj de render fijado al tiempo del vídeo** (`lib/visual/renderClock.ts`):
  lo que antes leía `performance.now()` al dibujar (rotación de color RGB de
  spectrum y lyrics) usa `getRenderNowMs()`; el export lo fija con
  `pinRenderClock(timeMs)` solo mientras dibuja cada frame.

Límites conocidos del MVP:

- El audio se decodifica entero en memoria: 1 h de audio ≈ 1,2 GB de PCM.
  El criterio "1 h sin crecer memoria" sigue abierto.
- Las capas de audio se agrupan por tipo, así que el entrelazado de `zIndex`
  entre tipos distintos no es exacto.
- No exportado aún (1C): Looks. El resto sale desde 1C: overlays (sin los
  efectos avanzados del editor sobre el overlay seleccionado), fondo global,
  slideshow con fundido de escena, Stage FX con Flash Edge, Camera FX,
  partículas y lluvia. Las capas se dibujan por `zIndex`
  (`frameComposition`); los overlays de imagen se dibujan como un solo grupo.
- El slideshow con sync por cambio de pista no avanza: el export es de una
  sola pista, igual que en vivo con una pista.
- Tamaño de overlays: son píxeles CSS del viewport del editor; con layout
  responsive se escalan por el lado corto (export / viewport en vivo) para
  conservar la proporción con logo y spectrum.

## Diseño de la costura de subsistemas (análisis 2026-09-13)

Análisis con el vocabulario de _codebase-design_ (módulo / interfaz / costura /
adaptador) de cómo está y cómo sigue 1C.

**La costura es real.** `RenderSubsystem` (`renderSubsystem.ts`) es una
interfaz profunda — `{ id, prepare?, render(ctx), reset?, dispose? }` — con dos
familias de adaptadores cruzándola hoy: los subsistemas canvas que viven en
`features/export/renderSubsystems/` y los que se inyectan desde presentación
(`extraSubsystems`, ej. el fondo). `features/export` no importa `components/`;
esa inyección es lo que mantiene la dirección de dependencias.
`RenderFrameContext` es la superficie de test: todo llega por `ctx` (estado
congelado, snapshot de audio, paleta, canvas) y se comprueba por lo que
termina en el canvas. `overlayImageDraw.test.ts` ya prueba por ahí.

**Defecto 1 · `renderSubsystems/stubs.ts` no pasa la prueba de borrado.**
(Estado 1C: los avisos del planner por capa ya no existen; quedan los stubs
de background, looks y hud.)
Son no-ops; `renderFrameAt` ya salta los ids no registrados
(`if (!subsystem) continue`) y `registerRenderSubsystem` pisa por id. Borrarlos
hace desaparecer la complejidad: son paso-through puro. Lo que _fingen_ guardar
es el conocimiento "esta capa todavía no se exporta" — hoy duplicado en tres
lados: el stub, `buildUnsupportedLayerIssues` (planner) y TAREAS.md, que además
lo mantiene a mano. Falla de localidad.

**Deepening propuesto.** El planner es puro y vive bajo `./index` (sin canvas,
sin registro — el split por consumidor sobrevive). En vez de importar el
registro, _recibir la dependencia_:

```ts
createOfflineExportPlan(state, capabilities, implementedLayerIds: readonly RenderSubsystemId[])
```

El planner avisa sólo de capas activas en `state` y ausentes de
`implementedLayerIds`; `useOfflineVideoExport` pasa
`listRegisteredSubsystems().map(s => s.id)` después de inyectar (único punto
que sabe qué adaptadores cayeron — el fondo sólo está implementado si
`ExportTabBody` lo inyecta). Los tests pasan un literal; sigue puro. Aterrizar
un subsistema borra su stub y su aviso desaparece solo.

**Riesgo 2 · un canvas 2D por frame.** `RenderFrameContext.canvas` es una
superficie; un canvas tiene un solo tipo de contexto. Cada capa con WebGL
(partículas, lluvia) debe dueñar su `OffscreenCanvas` + `WebGLRenderer` propio
fuera de React y `drawImage` su resultado a `ctx.canvas` dentro de
`render(ctx)`. La interfaz sigue siendo un método; lo WebGL es implementación,
no interfaz. La simulación determinista en T (semilla + `ctx.timeMs` + audio)
es in-process y testeable; el pase GPU no se mocka — se fumea contra el
preview (1E).

**Colocación de las costuras de 1C** (orden de TAREAS):

| Capa                | Categoría                                       | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fondo global        | in-process (**hecho**)                          | En vivo ya era canvas-2D, así que no hubo traducción CSS: se extrajo `drawGlobalBackgroundFrame` a `features/background/render` y la vista y el subsistema son dos adaptadores. Nuevo id `globalBackground`, primero del orden (bajo la imagen). Verificado: 99,2 % de píxeles idénticos contra el canvas en vivo; el resto son scanlines/RGB shift dependientes del tiempo.                                                                                                                                                                                                                                                                        |
| slideshow           | in-process (**hecho**)                          | `resolveSlideshowImageIdAtTime` (pura, en `features/background`) decide la imagen en t. `video/slideshowSegments` recorre los frames antes de renderizar y abre un segmento por cambio con el estado congelado + `buildActiveImageSelectionPatch` (lo mismo que aplica `setActiveImageId`: escena u overrides), encadenado; luego Keep Covered y paleta por segmento. El bucle pasa a cada frame el estado de su segmento y `prepare` recibe todos los estados. El fondo reproduce la carga en vivo (request → commit) al cambiar `imageUrl`, así que la transición es la del preview. Verificado: fade rojo→verde de 1 s con los tiempos del plan. |
| Stage FX            | in-process (**hecho**)                          | `features/stageFx/render` expone `stepStageLights`/`drawStageLights` y `stepFlashLight`/`drawFlashLight` (sin React ni store). `StageLightsCanvas`/`FlashLightCanvas` y `renderSubsystems/stageFx` son dos adaptadores: el vivo con su rAF y la paleta del hook, el offline con `ctx.timeMs`/`ctx.deltaMs`, el audio analizado y `ctx.palette`. Las constantes en píxeles se escalan por lado corto (salida / viewport). Flash Edge sale desde el `beginFrame` del subsistema, que alimenta su drive con el golpe del frame. Verificado: haces con puerta al pico + hold/decay y flash con disparo, decay y retrigger.                              |
| Camera FX           | in-process (**hecho**)                          | Opción (b), sin scratch-canvas: `video/offlineCameraFx` avanza el mismo estado de movimiento/sacudida que `CameraFxStage` y `renderFrameAt` envuelve cada capa objetivo en `save`/transform de canvas/`restore` (`cameraFxDraw`). Los offsets en píxeles se escalan por lado corto. Verificado: las capas objetivo se mueven y las demás no.                                                                                                                                                                                                                                                                                                        |
| partículas / lluvia | simulación in-process + GPU externa (**hecho**) | `particleSimulation` (pura) y `rainUniforms` los comparten `ParticleField`/`RainLayer` y `renderSubsystems/sceneGl`, que tiene un `WebGLRenderer` propio (un contexto para las tres capas, liberado al acabar) con la cámara del preview y hace `drawImage` al frame. `uPixelScale` convierte el tamaño de punto (píxeles de dispositivo en vivo) a la salida; los filtros CSS del wrapper se replican con `ctx.filter`. Verificado contra el preview.                                                                                                                                                                                              |

**Paso bloqueado:** la prueba de 3 min en VLC/QuickTime (TAREAS paso 1) y la
medición de "≤ 1,5× duración" (paso 2) dependen del usuario.

## Why the current recorder is not an offline renderer

The current internal recorder (`useRecordingExport` + `displayMediaCapture`)
uses `getDisplayMedia` + `MediaRecorder`. That pipeline is **realtime**:

- It captures whatever the screen/window actually paints, in wall-clock time.
- Output FPS is a _hint_ (`frameRate: { ideal, max }`), never a guarantee. If
  the machine drops to 40 FPS, the file is 40 FPS.
- The encoder runs live; quality is bounded by browser throttling, the chosen
  `videoBitsPerSecond`, and the capture surface resolution.
- Animation is driven by `requestAnimationFrame`, so the timeline is tied to
  real time and to the tab being focused/visible.

An offline renderer is the opposite: it evaluates the scene **at a fixed
timestamp T**, renders that frame at full quality however long it takes, then
advances T by `1 / fps`. Frame rate becomes an output property, not a runtime
constraint.

## Requirements for true offline rendering

1. **Deterministic timeline** — a project duration and a clock that can be set
   to an arbitrary T, independent of `requestAnimationFrame`.
2. **Frame-by-frame render** — render loop driven by a frame counter, not rAF.
3. **Fixed FPS + fixed resolution** — chosen up front, honored exactly.
4. **Audio decoding + analysis cache** — decode the track offline (e.g.
   `OfflineAudioContext`) and precompute the per-frame FFT/bands so the spectrum
   at time T is reproducible without playing audio in real time.
5. **Visual state evaluated at T** — every animated subsystem (spectrum,
   particles, background zoom, stage FX) must accept an explicit time/phase
   input instead of reading `performance.now()` internally.
6. **Master compositor canvas** — one canvas that composites every layer, so a
   single `getImageData`/`VideoFrame` per frame is the source of truth. Today
   layers render to separate canvases stacked by CSS.
7. **Encoder pipeline** — push each rendered frame into an encoder.

## Candidate browser technologies

| Tech                                        | Fit                  | Notes                                                                                    |
| ------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `OffscreenCanvas`                           | Good                 | Render off the main thread; needed for a compositor that is not tied to the visible DOM. |
| `WebCodecs` (`VideoEncoder` + `VideoFrame`) | Best in-browser path | Frame-accurate encode, decoupled from realtime. Chromium-only today; Safari partial.     |
| `ffmpeg.wasm`                               | Heavy fallback       | Can mux/encode, but large download and slow; viable when WebCodecs is absent.            |
| `MediaRecorder`                             | **Not suitable**     | Realtime-only; cannot do frame-by-frame export. This is what we have now.                |

## Refactors required before any implementation

- **Master output compositor** — collapse the per-layer canvases into one
  composited surface (or render-to-texture pipeline).
- **Deterministic animation clock** — replace direct `performance.now()` reads
  in animated subsystems with an injected time source.
- **Timeline / project duration** — a concept the app does not currently have
  (it is an infinite live wallpaper).
- **Audio analysis cache** — precomputed FFT frames keyed by timestamp.
- **Render presets** — resolution / FPS / bitrate / codec selection.

These are large, cross-cutting changes. They should not be attempted alongside
feature work.

## Recommendation (roadmap)

- **V1 (now):** OBS + Presentation Mode. Documented, works, high quality.
- **V2:** Improve the realtime recorder where safe — bitrate/codec presets,
  clearer "FPS is a hint" messaging. Keep it labeled Experimental.
- **V3:** Offline renderer / desktop exporter (WebCodecs in-browser, or FFmpeg
  in a future desktop shell) built on the compositor + deterministic-clock
  refactors above.

Do not build V3 until the compositor and deterministic clock exist.
