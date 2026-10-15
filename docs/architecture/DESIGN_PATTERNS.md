# Patrones de diseño — la línea del sistema

> **Qué es este documento.** Las reglas concretas que una feature nueva tiene
> que seguir para no reintroducir la complejidad que la migración 2026-09 sacó.
> No repite [ARCHITECTURE.md](ARCHITECTURE.md) (zonas, dirección de
> dependencias, ownership) — lo complementa: ARCHITECTURE dice **dónde** vive el
> código; este documento dice **con qué forma** vive ahí.
>
> Cada patrón sale de evidencia medida en la auditoría de 2026-10
> ([AUDITA_REACTIVIDAD_Y_CONTROLES_2026-10-14.md](../audits/AUDITA_REACTIVIDAD_Y_CONTROLES_2026-10-14.md)).
> Cuando un patrón contradice código existente, el código existente es deuda.
>
> Vocabulario (igual que el skill de diseño del repo): **módulo**,
> **interfaz** (todo lo que un llamador debe saber: firma + invariantes + orden
>
> - modos de fallo + configuración + rendimiento), **implementación**,
>   **adaptador**, **costura** (_seam_: el lugar donde vive una interfaz),
>   **profundo** (mucho comportamiento detrás de poca interfaz),
>   **superficial** (la interfaz es casi tan grande como la implementación),
>   **pass-through** (no aporta comportamiento: el test de borrado lo confirma).

---

## Cómo se usa esto

Antes de abrir un PR de feature nueva, pasá el checklist de §7. Cada patrón
tiene ID (`P1`, `P2`, …) para citarlo en revisiones de código: "esto viola P4"
es más accionable que "está raro".

Un patrón es **obligatorio** si `architecture:check`, un test de guardrail o un
checklist de este documento lo verifican; es **guía** si depende de juicio. Al
final de cada uno se indica cuál es.

---

## P1 · Un dato por frame cruza UNA costura: `AudioSnapshot`

**Obligatorio.**

`AudioSnapshot` (`lib/audio/audioChannels.ts`) es la interfaz más profunda del
producto: bins + time-domain + amplitude + peak + 6 canales semánticos
(`full, kick, instrumental, bass, hihat, vocal`) + `timestampMs`, y la
producen tres adaptadores reales — el runtime en vivo, el análisis offline del
exportador y la réplica cross-tab. Live/export parity funciona **porque** los
dos caminos convergen en la misma forma. Todo lo reactivo al audio entra al
render por acá y solo por acá.

```
productores (3) ──▶ AudioSnapshot ──▶ consumidores por frame (loops rAF)
                     ↑ la costura
```

Reglas para una feature reactiva al audio:

1. El consumidor recibe el snapshot **por parámetro** (o por la closure de su
   loop con `getAudioSnapshot()` inyectado, como hace `imageCanvasRuntime`).
   Un renderer jamás construye un `AnalyserNode` ni llama `getByteFrequencyData`
   por su cuenta, ni importa un analyzer concreto.
2. El shape de entrada del dibujo es `{ state, audio: AudioSnapshot, dt, time }`
   — la firma que ya usan `renderAudioLayerFrame` y `stepStageLights`. Si tu
   función de step no puede recibir un `AudioSnapshot` fake, no es testeable.
3. **El snapshot es de un solo frame y compartido:** se puede leer, mutar las
   derivadas propias, y descartar. Nunca guardarlo en estado, compararlo entre
   frames, ni pasarle referencias de sus arrays a algo que viva más que el
   frame. (El runtime reutiliza los buffers del analyser — F12 de la auditoría.)
4. Derivar un canal semántico nuevo (p. ej. "presencia de sintetizador") es
   trabajo de `analyzeAudioChannels`, en un solo lugar, con su rango en Hz —
   nunca un `bins[12] * 0.7` en el renderer. Los rangos hardcodeados en bins
   se rompen cuando cambia `fftSize` (F7).

**Test de cumplimiento:** todo `draw*/step*` de la feature toma el snapshot como
argumento y tiene un test que le pasa un snapshot literal.

## P2 · Suavizado y ataque/por instancio, jamás global

**Obligatorio (invariante del pipeline).**

El snapshot entrega niveles **crudos** por frame (`smoothing=0` a propósito,
ver comentario en `useAudioSnapshotRuntime`). Cada elemento que se mueve con el
audio es dueño de su física: un `AudioEnvelope` (`utils/audioEnvelope.ts`:
rise/fall con dt) y/o un `AudioChannelSelectionState` propios, creados en el
runtime por instancia (Refs del canvas, `createStageLightsRuntime()`, etc.).
Un spectrum necesita otra inercia que un zoom de fondo; compartir EMA entre
elementos borra esa diferencia.

- Nuevo parámetro de "cómo reacciona" → vive en el runtime de TU instancia y en
  la config del store de TU dominio, y se aplica con `resolveAudioChannelValue`
  o `createAudioEnvelope`. No se agrega smoothing al snapshot global.
- Excepción declarada: la **selección** de canal en modo `auto` es estado
  semántico de la música, no del elemento (F8: hoy cada instancia elige solo y
  dos subsystems pueden disentir en el mismo frame). Si tocás `auto`, la
  dirección del diseño es mover la selección al snapshot, no perimetrarla más.

## P3 · El render loop: `getState()` o `stateRef`, y nada de React por frame

**Obligatorio.**

Dos patrones aceptados, y uno prohibido:

| Patrón                   | Cómo                                                                                                 | Cuándo                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **poll por frame**       | `const state = useWallpaperStore.getState()` dentro del rAF (`StageLightsCanvas:74`)                 | loops de canvas/WebGL; simple y sin suscripciones                                                                                 |
| **stateRef + subscribe** | un effect suscribe al store y refresca un ref; el loop lee `stateRef.current` (`imageCanvasRuntime`) | cuando el loop necesita saber QUE algo cambió (resetear transiciones, hidratar imágenes)                                          |
| **prohibido**            | `useWallpaperStore()` sin selector, o `setState` de React por frame                                  | **NUNCA.** `OverlayImageLayerView:52` es el ejemplo medido: re-render de React en cada mutación del store + write por frame (F11) |

Consecuencia obligatoria del poll/subscribe: el loop lee `performanceMode`,
`motionPaused` y `sleepModeActive` y respeta `resolveOutputMinFrameMs` — una
feature que ignora el frame-cap rompe el modo Recording (el cap es el contrato
de pacing de grabación).

## P4 · `IAudioSourceAdapter` es la costura de captura; `AudioMixEngine` tiende a ser un adaptador más, no un segundo universo

**Guía (dirección; hoy hay deuda F2/F5).**

La interfaz de fuente (`start/stop/getFrequencyBins/getTimeDomainBins/
setAnalysisConfig` + transporte opcional) tiene tres adaptadores reales
(File/Mic/Desktop). El motor de mezcla (crossfade de dos FileAudioAnalyzers)
hoy NO la implementa, y eso fuerza el `hasActive() ? engine : analyzer` en ~7
call sites.

Regla para código nuevo que toque captura/transporte:

1. Nada nuevo lee `engineRef` y `analyzerRef` por separado — se añade
   comportamiento al proveedor o, idealmente, se resuelve primero F2 (que
   `AudioMixEngine` satisfaga la interfaz de fuente y la dualidad desaparezca).
2. Si una fuente nueva no tiene PCM (p. ej. réplica remota), los miembros
   opcionales existen para eso: `getTimeDomainBins?()`. Un adaptador que no
   puede algo NO simula datos.
3. Un capability file-only (playback state real del `<audio>`) se agrega como
   miembro opcional honesto a la interfaz, no con `instanceof FileAudioAnalyzer`
   (F19).

## P5 · Configurar el audio es del dominio audio; REACCIONAR al audio es del dominio visual — y se nombra por el qué, no por el prefijo

**Obligatorio para claves nuevas; la tabla de reset es el contract (P7).**

La clasificación de UI de 2026-10 midió 11 superficies distintas donde el
usuario decide "cuánto reacciona X al kick", y claves `audio*` que pintan cosas.
La línea:

| La pregunta del usuario                                               | Dueño                                                                                                        | Ejemplo                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| "¿qué suena, de dónde, cuánto volumen, qué análisis (fft/smoothing)?" | **audio** (hoy `tabs/main/audio/`, mañana `features/audio/`)                                                 | `fftSize`, `audioSmoothing`                                                                   |
| "¿cómo se mueve MI capa con lo que suena?"                            | el **dominio visual** de la capa                                                                             | `imageBass*`, `particleAudio*`, `stageLightsBandThreshold`, `spectrumShockwaveBandThresholds` |
| "¿qué canal semántico me maneja?"                                     | el dominio visual, con el vocabulario compartido `AudioReactiveChannel` + `AudioChannelSelector` (`editor/`) | `imageAudioChannel`                                                                           |

Reglas:

- **Nunca duplicar un control.** Un knob tiene UN escritor canónico; otras UIs
  lo muestran read-only o enlazan al mismo setter via la misma sección. Hoy
  `audioAutoKickThreshold` tiene 3 escritores (Audio/Diagnostics/Calibration) —
  deuda, no patrón.
- **Diagnóstico y calibración no editan producción.** Diagnostics lee y muestra;
  Calibration edita overrides de RANGO de sliders, no el valor del knob de otro
  dominio (excepción actual documentada como deuda: grupo `audio`).
- **Prefijo de clave = dominio dueño, no "relacionado con audio".** Las claves
  visuales NO se bautizan `audio*` (deuda medida: `audioTrackTitle*`,
  `audioLyrics*` son pintura). Una clave nueva de reactividad visual lleva el
  prefijo del dominio: `miCapaAudioChannel`, `miCapaAudioAttack`. La trampa
  inversa también existe: `spectrumAudioSmoothing` es análisis, no pintura —
  nombrar por lo que configura.
- Alias de destructuring prohibidos: `setAudioSmoothing:
state.setSlideshowTransitionAudioSmoothing` (`TransitionPanel:38`) crea un
  segundo significado para un nombre ya ocupado. Si un panel quiere un alias
  corto, el local se llama distinto del global.

## P6 · El editor de una capa reactiva sigue la forma estándar

**Guía, con plantilla.**

Cada sección de controles que expone reactividad dibuja el mismo bloque (ver
`FxBandThresholdControls`, `BgZoomAudioSection`, `SpectrumAudioPanel`):

```
[switch "reactive"]  →  [AudioChannelSelector]  →  [intensidad]  →  (avanzado)
                                                   attack · release ·
                                                   smoothing · threshold ·
                                                   peakWindow · peakFloor · punch
```

Usar los `AUDIO_ROUTING_RANGES` / `FX_RANGES` de `config/ranges.ts` — los rangos
viven ahí, no inline en el JSX. La clave nueva se registra donde la pertenencia
se verifica (§P7). El HUD (`quickActions`) solo muestra toggles on/off de
carácter binario y con permiso explícito del dueño del knob: el HUD que escribe
59 setters de 5 buckets es deuda máxima (P8), no plantilla.

## P7 · Pertenencia de claves verificada, no declarada en prosa

**Obligatorio para claves nuevas.**

Tres listas, tres preguntas distintas, y hoy se contradicen entre sí:

| Lista                                                 | Pregunta que responde                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `LEGACY_TAB_KEYS` (`config/controlPanelResetKeys.ts`) | "resetear esta pestaña, ¿qué claves devuelve a fábrica?"                  |
| `WORKSPACE_ONLY_KEYS` (`lib/workspaceKeys.ts`)        | "esto es dónde-trabajaba, no el wallpaper: fuera del paquete de proyecto" |
| `partializeWallpaperStore` (`store/`)                 | "esto no se persiste ni en IndexedDB" (transientes de sesión)             |

Rutina para una clave nueva (además del bump de `STORE_PERSIST_VERSION` +
migración, que es regla de casa):

1. ¿Es propiedad del proyecto? → entra al bucket de SU dominio en
   `LEGACY_TAB_KEYS`. La tabla está obsoleta contra claves reales (medido:
   shockwave/accents, `audioReactive`, playlist, setlists) — cada feature nueva
   suma la suya y no hereda el descuido.
2. ¿Es estado de ventana/editor? → `WORKSPACE_ONLY_KEYS`, idealmente una clave
   nueva bajo el seam `editor/workspace/workspaceState.ts` (version-discard,
   sin migración, documentado).
3. ¿Es transitorio de sesión? → excluir en `partialize`.
   Una clave en dos listas a la vez es un diseño que hay que arreglar, no un
   detalle. (Medido: 22 claves en 1 ∩ 2.)
4. **Agregar el guard test:** el patrón correcto ya existe —
   `spectrumPanelKeyCoverage.test.ts` escanea los paneles y revienta CI si un
   panel escribe una clave no registrada. Features nuevas reactivas (o de
   cualquier dominio con claves target/instance) copian ese guard.
5. El setter del slice es `set({ key: v })` sin lógica; la lógica vive en el
   dominio. Las acciones compuestas (`applyX`, `saveSlot`) van al slice solo si
   son sobre EL documento; si orquestan persistencia → `services/`.

## P8 · El shell compone, el dominio implementa

**Obligatorio.**

Vale para pestañas y para el HUD, y es la corrección de lo que la auditoría
midió en `MotionTab` (selector de 180 líneas que re-hilaba todo el store por
props a secciones que ya lo leían solas — pass-through puro, test de borrado:
la complejidad desaparecía).

- **Shell de pestaña:** decide orden, qué secciones existen y el layout. No
  selecciona claves del store para repartirlas, no conoce setters de dominios,
  no tiene lógica de reset cross-dominio en su JSX (el `onResetLogo` cableado
  desde la pestaña Spectrum es el contraejemplo: el reset le pertenece al
  dominio reseteado, que lo exporta).
- **Sección de dominio:** lee del store lo suyo directamente (los hermanos
  stageFx ya lo hacen así — `CameraFxSection:46`), o recibe SOLO props mínimas
  como `AudioTransportSection` (158 LOC, cero store). Las dos formas son
  correctas; mezclarlas en una pestaña, no.
- **HUD/Quick Actions:** superficie de conmutadores y valores binarios de
  knobs cuyo dueño es un panel. Un toggle nuevo en el HUD requiere que el dueño
  del knob exponga el setter por su fachada `ui`; el HUD no importa claves ni
  slices ajenos, y no introduce knobs que no existan en el panel.

## P9 · Fachadas: la regla del consumidor, no la ceremonia

**Obligatorio (ya es contrato; acá, la ampliación).**

Resumen de ARCHITECTURE §3/§3.1 con las entradas nuevas que esta auditoría
consagra:

| Condición                                       | Fachada                                                                                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dominio plano de 1–4 archivos                   | ninguna — `@/features/layout/viewportMetrics` ya dice todo                                                                                                                                                                      |
| dominio con estructura interna                  | `./index` (modelo puro: sin React y sin store)                                                                                                                                                                                  |
| el mundo necesita dibujarlo (capas, export)     | `./render`                                                                                                                                                                                                                      |
| el editor necesita su superficie React          | `./ui`                                                                                                                                                                                                                          |
| la UI necesita el motor por frame (reactividad) | `./reactivity` o `./runtime` — así `features/audio` expondrá `analyzeAudioChannels`, `resolveAudioChannelValue`, `createAudioEnvelope`-adjacent y `AudioSnapshot` SIN arrastrar el proveedor React ni los adaptadores Web-Audio |

Un dominio nunca importa su propia fachada. Si tu módulo del dominio necesita
algo de su propio dominio, importa la ruta interna.

## P10 · Testeabilidad: aceptar dependencias, retornar resultados

**Guía con umbral duro.**

El gradiente de testeabilidad del repo (de la auditoría, de mejor a peor):
`offlineAudioTrack.test.ts` (decoder inyectado) > `motionAudioResponse`
(follower inyectado) > `AudioMixEngine.test` (mock de módulo — funciona, frágil)

> `audioChannels` (pura, cero tests — la mayor palanca perdida del pipeline).

Reglas:

- Lógica pura (matemática de canales, sampling de bins, planes de fotograma):
  funciones que reciben entradas y devuelven salidas; test unitario obligatorio
  con el archivo de test al lado. `analyzeAudioChannels` no tiene por qué seguir
  sin tests; una feature que agregue un canal nuevo AGREGA el test de los
  seis.
- Unidades con reloj/rAF/BroadcastChannel: inyectar `now()`/fábrica de canal, o
  extraer el compute como función pura (`computeSnapshot(inputs)`) y testear
  ESA. El patrón repo-probado: extraer el estado de transporte/playlist como
  módulos puros bajo `context/audioData` (`mediaTrackRuntime.ts`,
  `playlistNavigation.ts`, `mediaSessionPlaybackState.ts`) con su `*.test.ts` al lado.
- El renderer se prueba alimentándole un snapshot sintético (P1.2) — no
  necesitando un AudioContext.
- **No se crea una costura con un solo adaptador "por si acaso"** (una
  interfaz para el proveedor actual y nada más). Dos adaptadores reales
  (producción + test vale, como las fábricas `createOfflineAudioAnalysisSourceFrom*`) o módulo directo.

## P11 · Nomenclatura y traducción de vocabulario

**Obligatorio para nombres nuevos; lo existente se corrige, no se copia.**

- El vocabulario de análisis es `full · kick · instrumental · bass · hihat ·
vocal` (+ lo que agregue el dominio). **`mid`/`treble` están muertos**
  (era de 3 bandas; `getBands()` los remapea y nadie los consume). UI nueva no
  los introduce.
- `audio*` = dominio audio; prefijo visual = dominio visual (P5). La regla de
  `structure:check` sigue: nada de `modern`/`new`/`v2`/`legacy`/`temp` en
  nombres vivos.
- Los setters son `set<Key>` exactos y las acciones, verbos del documento
  (`applyPreset`, `saveSlot`). La reflexión de `factoryControlDefaults`
  (`setX` → `x` → default de fábrica) es el contrato: un setter cuyo nombre no
  decapitaliza a una clave de `FACTORY_DEFAULT_STATE` **silenciosamente pierde
  el double-click-reset**. Si una acción compuesta debe reseteable, la clave
  existe y el setter simple también.
- i18n: cada label nuevo, en `en.ts` Y `es.ts`, con el prefijo del dominio
  (`sfx_*` sigue la convención de los tabs). `i18n:check` lo exige.

## P12 · Persistencia: una casa por tipo de dato

**Obligatorio (condensa lo vigente + el drift medido).**

```
documento de escena  → store persist v153+ (IndexedDB, version, migración)
assets binarios      → IndexedDB por db propia, restaurados por services/
"última vez que..."  → workspaceState (localStorage, version-discard)
UI-only ephemeral    → partialize-excluded (aiDraft, activeSpectrumTarget, ...)
```

Un knob NO vive en dos casas a la vez. Medido: `audioFileVolume` existe en el
store y se maneja por el contexto sin escritor de store; `transitionStyle`
duplicado store/`useState`; `activeSpectrumTarget` en tres mecanismos. La
solución de una feature nueva nunca es "escribo en ambos y leo el que ande" —
se elige casa, se migra, se borra la otra.

---

## 12-bis · Anti-patrones detectados (prohibidos para nuevas features)

Lo que la auditoría encontró y que **no** es modelo:

1. `useWallpaperStore()` sin selector en un componente que vive el loop de
   render (P3 prohibido).
2. Setter duplicado por shell por props cuando la sección ya lee el store
   (MotionTab, P8).
3. Leer un knob de otro dominio "porque estoy cerca" sin que pertenezca a tu
   bucket de reset ni a tu fachada (Diagnostics escribiendo audio, P5).
4. `setX: state.setSlideshow…` alias que colisiona con nombres existentes
   (TransitionPanel, P11).
5. Interfaz React de 37 miembros donde 6 getters no los usa nadie y dos
   bypassean la caché del snapshot (contexto de audio, P1/P10 — deleting the
   dead getters shrinks the interface with zero reappearing complexity: pass-through).
6. EMA/bins "por si acaso" cuyo resultado no lee nadie
   (`DesktopAudioAnalyzer.smoothedBins`, P10 — dead weight on a hot path).
7. Un segundo evaluador/analizador por feature ("necesito el kick para mi
   efecto" → NO se escribe un detector ad-hoc en el renderer; es un canal en
   `analyzeAudioChannels`, P1.4).

---

## §7 · Checklist previo al PR de una feature nueva

```
□ Fachada: ¿mi dominio tiene estructura interna? → index/render/ui/reactivity (P9)
□ Claves: ¿cada clave nueva está en SU bucket de LEGACY_TAB_KEYS, en
  WORKSPACE_ONLY, o excluida en partialize — y SOLO en una? (P7)
□ STORE_PERSIST_VERSION bumped + migración escrita. (regla de casa)
□ Guard test: ¿una clave target/instance nueva tendría su coverage test estilo
  spectrumPanelKeyCoverage? (P7.4)
□ Reactividad: ¿el renderer recibe AudioSnapshot por argumento? ¿suavizado por
  instancia con envelope propio? ¿rango en Hz o desde config/ranges, no bins?
  (P1, P2, P6)
□ Loop: getState() o stateRef — nunca sin selector; respeta performanceMode,
  motionPaused, sleepModeActive. (P3)
□ Captura/transporte: nada nuevo lee analyzer/engine en paralelo; capability
  especial = miembro opcional de la interfaz. (P4)
□ Ownership UI: ¿mi sección lee el store directo o con props mínimas — y la
  pestaña no re-hila? ¿mi toggle HUD llama al setter del dueño? (P8)
□ Nombre: ¿el prefijo de la clave dice el dominio dueño? ¿sin mid/treble, sin
  v2/modern/legacy, con i18n en en+es? (P5, P11)
□ Test: la parte pura tiene test con datos literales; la parte con reloj tiene
  now() inyectado o un helper puro extraído. (P10)
□ Suite verde: format, lint, architecture:check, structure:check, docs:check,
  i18n:check, test:types, test:run, build.
```

## §8 · Orden de remediación de la deuda medida (fuera de features)

Para que el sistema no siga drenando, cuando haya ventana — en orden de
apalancamiento:

1. **`features/audio/`**: nace el dominio (el único del que ARCHITECTURE habla
   y no tiene carpeta): `index` (modelo puro), `reactivity` (snapshot +
   canales + envelope), `ui` (lo de `tabs/main/audio/`). Bachea el hoyo de
   ownership del que dependen P1–P5.
2. **F2/F5**: `AudioMixEngine` satisface `IAudioSourceAdapter`; se borran las
   ~7 dualidades `engine?analyzer:`; F19 cae de rebote.
3. **F1**: epoch cross-tab (`performance.now()` entre documentos) — bug de
   correctness en el sync de ventanas.
4. **F3/F4/F10/F18**: recortar la interfaz muerta (3× `getAmplitude/getPeak/
getBands`, `smoothedBins`, getters de contexto bypass, remapeo `mid/treble`)
   — la interfaz de 17 miembros vuelve a su tamaño real.
5. **P7 guards**: actualizar `LEGACY_TAB_KEYS` con las ~25 claves huérfanas y
   extender el coverage test a `features/audio` y reactividad.
6. **F8**: selección `auto` al snapshot; **F11** OverlayImageLayerView al
   patrón estándar; **F12** documentar/`freeze` en dev la validez-frame.
7. TracksTitle→`features/nowPlaying`, Setlists→`features/scenes/controls`,
   Quick Actions: separar el viewmodel por bucket (audio/visual/chrome/perf)
   como dueños, con el HUD consumiendo fachadas. (ARCHITECTURE §6.9 ya tenía
   los dos primeros; se suma el tercero.)
