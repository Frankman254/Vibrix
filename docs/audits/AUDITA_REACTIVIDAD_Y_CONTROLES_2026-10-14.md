# Auditoría de reactividad de audio, controles de UI y forma del store

**Fecha:** 2026-10-14 · **Método:** lectura completa del pipeline de audio,
clasificación módulo-por-módulo de la superficie de controles, y conteo del
grafo store↔zonas; verificación cruzada de los titulares contra el código.
Los detalles exhaustivos (con fila por módulo clasificado) quedan en los
apéndices §A y §B; las conclusiones operativas se quemaron en
[DESIGN_PATTERNS.md](../architecture/DESIGN_PATTERNS.md).

## 0. Veredicto

La arquitectura de **zonas** está sana (0 aristas de deuda en runtime, 0
ciclos, guardrail en CI). Los tres problemas que quedan son de **forma de
módulo**, no de carpeta:

1. **El audio tiene pipeline excelente y no tiene dominio.** `AudioSnapshot` es
   la costura más profunda del producto (3 productores reales, live/export
   parity), pero el dominio `features/audio/` no existe: los controles están
   huérfanos en `tabs/main/audio/` y el proveedor de contexto expone una
   interfaz React de 37 miembros con 6 getters muertos.
2. **Los parámetros de reactividad no tienen dueño canónico.** "Cuánto reacciona
   X al kick" es ajustable en 11 superficies; 3 claves de análisis tienen 3
   escritores; el HUD de Quick Actions escribe 59 setters que tocan 5 buckets
   de pertenencia. La tabla de reset (el contrato de pertenencia) está obsoleta
   contra ~25 claves vivas.
3. **El store es un documento con 581 pass-throughs.** 581 setters para ~871
   claves, ~440 de ellos `set({ key: v })` de una línea. No es un error — es el
   precio del `SliderControl` genérico (interfaz = el store entero) — pero
   significa que la verificabilidad de pertenencia NO puede venir del tipo del
   store: tiene que venir de los guard-tests (el patrón
   `spectrumPanelKeyCoverage.test.ts`), y hoy solo Spectrum lo tiene.

---

## 1. Store y dirección de dependencias (medición propia)

- **Forma:** un store Zustand, 14 slices, `satisfies Partial<WallpaperStore>`;
  composición plana en `wallpaperStore.ts`. Sin duplicación de claves entre
  slices (verificado: `uniq -d` sobre los setters = vacío).
- **Números:** `wallpaperStoreTypes.ts` = 871 posiciones de clave + 581 setters
  declarados. Pass-throughs de una línea por slice: stageCamera 99,
  particlesRain 74, background 31, system 49, audio 81/85 (audioSlice es casi
  100 % pass-through; solo 4 acciones tienen lógica de slot).
- **Acoplamiento:** 484 referencias a `useWallpaperStore` en 126 archivos no-test
  (features 56, components 54, hooks/editor/context 15, services 3, lib 1 — la
  única arista `lib→store` está auditada por el contrato y es de tipo).
- **Suscripciones sin selector (re-render total):** 12 call sites, incluyendo
  dos dentro de loops de render: `OverlayImageLayerView.tsx:52` y
  `useQuickActionsViewModel.tsx:141`. Es el smell de performance más caro del
  repo y viola el patrón que el propio repo demuestra correcto
  (`imageCanvasRuntime` con `stateRef`+`subscribe`).
- **Contrato de pertenencia roto:** `config/controlPanelResetKeys.ts`
  (LEGACY_TAB_KEYS) define qué resetea cada pestaña, pero ~25 claves escribidas
  por controles enviados no están en ningún bucket (medido: `audioReactive`,
  `audioSmoothing`, playlist/setlists, shockwave/accents de spectrum, perf
  safe/sleep, chrome). El bucket `audio` declara 5 claves; la pestaña escribe
  ~30. `scene` declara `[]` y SceneTab escribe una clave de chrome.
- **Triple agencia de persistencia:** 22 claves aparecen a la vez en
  `WORKSPACE_ONLY_KEYS` (stripping de paquete de proyecto) y en
  `LEGACY_TAB_KEYS` (documento de escena); `activeSpectrumTarget` vive en tres
  mecanismos (workspace pref, partialize-exclude, store) y LayersTab agrega un
  cuarto (localStorage crudo). `audioFileVolume` tiene clave de store y manejo
  por contexto con dos caminos de escritura.
- **Convención de nombres como carga funcional:**
  `editor/factoryControlDefaults.ts` deriva el default de fábrica por reflexión
  `setX → x → FACTORY_DEFAULT_STATE[x]`. El nombre del setter es parte del
  contrato (double-click-reset); un setter mal nombrado pierde el reset en
  silencio. Esto legitima la regla `set<ClaveExacta>` y prohíbe aliases de
  destructuring como `setAudioSmoothing: state.setSlideshowTransitionAudioSmoothing`
  (`TransitionPanel.tsx:38`).

## 2. Reactividad de audio — flujo y salud

**Flujo:** `IAudioSourceAdapter` (3 adaptadores: File/Mic/Desktop — costura
real) → `AudioMixEngine` (crossfade de ≤2 FileAudioAnalyzers) →
`useAudioSnapshotRuntime.getAudioSnapshot()` (gating de pausa por store, caché
de 8 ms, amplitud=media(bins), decay de peak 0.98, `analyzeAudioChannels` con
smoothing 0 — crudos a propósito) → **`AudioSnapshot`** (costura central:
bins+timeDomain+amplitude+peak+6 canales+timestamp) → ~11 loops de consumidores,
cada uno con rAF propio y `getState()` por frame, cada uno aplicando su física
por instancia (`resolveAudioChannelValue` / `createAudioEnvelope` /
`stepMotionAudio`). **Export offline:** segundo productor determinista
(`createOfflineAudioAnalysisSourceFromReader/Buffer` — réplica a mano del
AnalyserNode sobre `offlineAudioTrack` streaming) que emite el MISMO `AudioSnapshot`; los
renderers no saben qué productor los alimenta. **Cross-tab:** BroadcastChannel
`vibrix-audio-sync` replica el snapshot al wallpaper/presentación.

**Lo profundo que hay que proteger:** `audioChannels.ts` (una interfaz, 6
canales en Hz + histeresis auto, alimenta vivo y offline),
`AudioEnvelope`, `AudioMixEngine` (5 métodos visibles, 485 líneas de
crossfade/content-aware), `offlineAudioAnalysis`/`offlineAudioTrack` (la
paridad live/export es REAL y verificable con `debugRenderSync`),
`motionAudioResponse` (el único consumidor con dependencia inyectada).

**Hallazgos con evidencia** (completos en §A; titulares):

- **F1 HIGH** — staleness cross-tab compara `performance.now()` de dos
  documentos con `timeOrigin` distintos: réplica fantasma o muerta según orden
  de carga.
- **F2/F5 HIGH** — `AudioMixEngine` NO satisface `IAudioSourceAdapter`: la
  dualidad `hasActive()?engine:analyzer` se re-deriva en ~7 call sites de
  transporte y snapshot. Es una segunda interfaz paralela no declarada.
- **F3/F4/F10/F18 MED** — superficie muerta: EMA de `DesktopAudioAnalyzer.smoothedBins`
  escrito y nunca leído; `getAmplitude/getPeak/getBands` triplicados en los 3
  adaptadores con 0 llamadores; los getters derivados del contexto bypassean la
  caché de 8 ms y no los usa ningún canvas; el remapeo `instrumental→mid,
hihat→treble` es vocabulario de una era muerta.
- **F6/F7 MED** — la definición de "amplitud" y el decay de peak viven en 5
  lugares; los rangos de banda en 3 sistemas incompatibles, dos de ellos
  asumiendo `fftSize===2048` (cambiar `fftSize` en el store rompe el sampling
  de bandas del spectrum en silencio).
- **F8 MED** — la selección de canal `auto` es por instancia: dos subsystems
  pueden disentir en el mismo frame sobre qué canal "es el kick". La
  segmentación smoothing-por-instancia es correcta; selection-por-instancia no
  fue defendida por el comentario que la cubre.
- **F9/F11/F12/F13** — la rama de pausa aloja un snapshot nuevo por consumer por
  frame (~700 allocs/s); OverlayImageLayerView lee canales crudos sin envelope y
  re-renderiza React por mutación; el snapshot es mutable compartido sin
  contract de validez declarado; la caché de 8 ms deja de garantizar coherencia
  de frame por encima de ~120 Hz.
- **F17 LOW** — `audioChannelSmoothing` es una knob de store sin UI que solo
  afecta al offline: la superficie de configuración no configura el camino vivo.
- **Testeabilidad:** `audioChannels` (pura, 291 LOC) y `spectrumBinSampling`
  (pura, alimenta 6 renderers) están SIN tests; `useAudioSnapshotRuntime` no es
  testeable (rAF+BroadcastChannel+store global en la closure). El repo ya tiene
  el patrón de solución probado: extraer el estado de transporte/playback como
  módulos puros bajo `context/audioData` con su `*.test.ts` al lado

## 3. Clasificación de la UI — controles mezclados

Inventario completo en §B (≈120 módulos clasificados AUDIO/VISUAL/HYBRID/OTRO
con claves y evidencia). La tabla de mezcla:

| Módulo                                            | Audio                                                                  | Visual                                 | Nota                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `useQuickActionsViewModel.tsx` (1,411 LOC)        | `audioReactive`, `motionPaused`, crossfade, media session, track-title | spectrum/particles/rain/logo/slideshow | + chrome (`editorTheme`, `activeSpectrumTarget`) + perf (`sleepMode*`) — 5 buckets en un módulo |
| `LooksTab.tsx`                                    | `rgbShiftAudioChannel/Smoothing/Attack/Release/PeakWindow/Punch`       | filtros                                | análisis en pestaña visual                                                                      |
| `SpectrumFxPanel` / `SpectrumAudioPanel`          | `spectrumShockwaveBandThresholds`, `spectrumAudioSmoothing`            | FX                                     | escrito por el adaptador target-bound (bien); claves fuera de la tabla de reset (mal)           |
| `MotionTab` + `ParticlesAppearanceSection`        | `particleAudio*`                                                       | aparición                              | shell re-hila lo que la sección ya lee — pass-through                                           |
| stageFx (`FxBandThresholdControls` + 4 secciones) | band thresholds, `*AudioReactive`                                      | beams/shake                            | canonical: el dueño visual controla su reactividad ✓                                            |
| `BgZoomAudioSection` + `TransitionPanel`          | `imageBass*`, `slideshowTransitionAudioSmoothing`                      | zoom/transition                        | el alias de nombre en TransitionPanel colisiona con la clave global                             |
| `DiagnosticsTab`                                  | sliders vivos de `audioAutoKickThreshold`/`HoldMs`                     | toggles HUD                            | diagnóstico editando producción                                                                 |
| `CalibrationTab` (grupo audio)                    | `audioSmoothing`, kick                                                 | —                                      | único editor de `audioSmoothing`: la pestaña incorrecta                                         |
| `AudioTab`                                        | lo suyo                                                                | `motionPaused` (pausa visual)          | el bucket audio posee una clave de output visual                                                |
| `SceneTab`                                        | —                                                                      | `editorImagePreviewQuality`            | escena escribiendo chrome, duplicado con AppearanceSection                                      |
| `TrackTitleTab` / `LyricsTabBody`                 | (leen playlist)                                                        | pintan capas                           | las claves `audioTrackTitle*`/`audioLyrics*` son VISUALES con prefijo audio                     |

Y las tres estructuras huérfanas: **no existe `features/audio/`** (el único
dominio sin carpeta), TrackTitle/Layers/Setlists siguen en `tabs/` (deuda ya
listada en ARCHITECTURE §6.9), y el reset cross-pestaña cableado en
`ControlPanel.tsx` (Spectrum reseteando el bucket logo) es el síntoma de que la
costura de reset está indexada por bucket de store pero la UI por anidamiento de
pestañas.

**Modelos a copiar** (miden que el patrón funciona aquí): `RainSection` (claves
de un solo dominio, un camino), `AudioTransportSection` (props-only, 0 store),
`useSpectrumTargetSettings` (adaptador instance-keyed + guard test de cobertura),
`editor/workspace/workspaceState.ts` (costura de UI-state documentada con
política de descarte).

---

## 4. Decisiones de diseño adoptadas (qué "debe" ser el sistema)

El análisis de capas no propone una pila nueva — la actual es correcta — sino
**mover el centro de gravedad del problema**: de "¿en qué carpeta vive?" (ya
resuelto por ARCHITECTURE) a "¿quién es el dueño verificable de este knob y por
qué costura entra el audio a mi frame?". En una línea cada capa objetivo:

1. **dominio `features/audio`** = modelo de análisis puro (`index`), reactividad
   compartida (`reactivity`: snapshot types, canales, envelope) y su UI
   (`ui`), consumida por el proveedor — el proveedor queda como montaje, el
   conocimiento vive en el dominio.
2. **El snapshot es LA costura reactiva** (ya lo es de facto: los tres
   productores y los ~11 consumidores coinciden). Se conserva, se le declara el
   contract de validez-por-frame, y la selección `auto` sube a él.
3. **Reactividad de una capa = claves del dominio de la capa**, con el
   vocabulario de canales compartido y un único escritor por knob; Diagnostics
   y el HUD dejan de escribir fuera de su balcón.
4. **Pertenencia verificada**: la tabla de reset se pone al día y cada dominio
   con claves instance/target recibe el guard-test de cobertura (patrón
   spectrum). El tipo del store no puede hacer este trabajo — 581 pass-throughs
   no tienen nada que testear individualmente; la cobertura se prueba sobre las
   fuentes.
5. **`AudioMixEngine` como adaptador más de `IAudioSourceAdapter`** (o un
   `IAudioTransport` declarado), borra la dualidad de 7 call sites.

Todo eso, con reglas operativas e ID de patrón, en
[DESIGN_PATTERNS.md](../architecture/DESIGN_PATTERNS.md).

---

## §A · Apéndice: hallazgos del pipeline de audio (detalle)

Las 24 finding completas (F1–F24) con fila-por-afirmación viven en el
reporte de auditoría; las HIGH/MED se resumen en §2 arriba. Referencias de
eje: `useAudioSnapshotRuntime.ts:224,227-236,245-249,252-256,258-266,272-277,287,306-331,330-351`;
`audioChannels.ts:48-83,144-234,236-291`; `types.ts:1-29` (17 miembros, 13
opcionales); `AudioMixEngine.ts:325,354,429`; `DesktopAudioAnalyzer.ts:113-120`;
`FileAudioAnalyzer.ts:308-338`; `offlineAudioAnalysis.ts:32,231,284,291`;
`motionAudioResponse.ts:53-91`; `audioEnvelope.ts:44-92`;
`useAudioData.ts:1` (pass-through); `AudioLayerCanvas.tsx:175`;
`StageLightsCanvas.tsx:74,96`; `imageCanvasRuntime.ts:138`;
`OverlayImageLayerView.tsx:52,76`; `spectrumBinSampling.ts:3-29`;
`useAudioPlaybackEffects.ts:321-419,366,385`; `defaultState.ts:177-179`;
`calibrationConfig.ts:360`.

Borrado seguro (test de borrado confirmado — la complejidad no reaparece en
ningún llamador): getters derivados muertos del contexto
(`getPeak/getBands/getFrequencyBins` + `getAmplitude` fuera de
OutputPerfModeDiagnostics), los `getAmplitude/getPeak/getBands` de los 3
adaptadores, `DesktopAudioAnalyzer.smoothedBins`, el alias `useAudioData`, la
rama de remapeo mid/treble.

## §B · Apéndice: tabla de clasificación de controles UI (detalle)

La matriz completa ~120 módulos (path | LOC | pestaña | clase A/V/H/O | claves)
se reconstruye desde `config/controlPanelResetKeys.ts` (baseline de pertenencia
declarada) + grep de setters por archivo. Regla de lectura de la tabla del §3:
HÍBRIDO no es un pecado por sí solo — `BgZoomAudioSection` es híbrido correcto
(la pestaña de fondo controlando la reactividad del fondo). El pecado es (a) dos
escritores para un knob, (b) un escritor fuera del bucket de su pestaña sin
migración ni guard, (c) claves visuales con vocabulario de audio. §B completo
quedó en el artifact de la auditoría; los 20 hallazgos numerados están todos
representados en §3 y en los patrones P5–P8 de la guía.
