# Current System Status

**As of:** `chore/fase-0-higiene` (`main`) · App `0.7.0-alpha` · Store persist **v146**

This document describes the product **as implemented in code**, not aspirational roadmaps.

## Product summary

**Vibrix** is a browser-based, audio-reactive visual scene editor. Users compose scenes (backgrounds, spectrum, logo, particles, rain, stage FX), preview them in real time, and export clean output for OBS or a deterministic offline video file.

| Area                                   | Status                                   |
| -------------------------------------- | ---------------------------------------- |
| Editor + preview                       | **Stable**                               |
| Presentation / Recording output shells | **Usable but needs QA**                  |
| Offline video export (deterministic)   | **Usable but needs QA**                  |
| OBS + Presentation Mode                | **Stable** (recommended production path) |
| Cloud / login / backend                | **Planned / not implemented**            |
| Electron desktop                       | **Not implemented**                      |

---

## Runtime architecture

| Component                        | Status | Notes                                                       |
| -------------------------------- | ------ | ----------------------------------------------------------- |
| Vite + React 19 SPA              | Stable | HashRouter (`#/edit`, `#/present`, `#/record`, `#/preview`) |
| Shared `WallpaperAppProviders`   | Stable | Single `AudioDataProvider` above route shells               |
| Zustand + `localStorage` persist | Stable | `STORE_PERSIST_VERSION = 146`                               |
| IndexedDB assets                 | Stable | Images, audio blobs; las 5 bases abren por `openStoreDb`    |
| Vitest + GitHub Actions CI       | Stable | format, lint, types, tests, docs:check, build               |

Las cinco rutas de IndexedDB (`imageDb`, `localFoldersDb`, `signatureCache`,
`localSyncRepository`, `indexedDbStorage`) abren por
[src/lib/db/openStoreDb.ts](../../src/lib/db/openStoreDb.ts): verifica que los
almacenes pedidos existen y, si falta alguno, reabre en `version + 1` contada
desde la del disco para crearlo. Hace falta porque `onupgradeneeded` sólo salta
cuando la versión sube: una base que ya está en la versión actual sin su
`objectStore` no se arreglaría nunca y cada transacción tiraría `NotFoundError`
sin capturar.

Verified provider tree (`src/App.tsx`):

```
HashRouter
└── WallpaperAppProviders
    ├── RouteRuntimeModeSync
    ├── AppAssetBootstrap
    └── Routes → EditorPage | OutputShellPage | PreviewPage
```

---

## Editor shell (`#/edit`)

**Status: Stable**

Mounted:

- `WallpaperViewport` (`editorMode`)
- `ControlPanel`, drag layers, `DragModeOverlay`
- Quick Actions HUD, diagnostics FPS overlay (when enabled)
- `useBroadcastWallpaperChanges` for preview sync

Not mounted in output routes.

---

## Presentation shell (`#/present`)

**Status: Usable but needs QA**

Mounted:

- `WallpaperViewport` (`outputMode`)
- `OutputRecoveryLayer` (`Ctrl+Shift+E`, hot corner)
- `OutputPresentationCursorPolicy` (auto-hide cursor)
- DEV: `OutputModeDevDiagnostics`

Unmounted:

- ControlPanel, Quick Actions, editor launcher, drag UI, diagnostics HUD stack

Audio: **same** `AudioDataProvider` instance as edit (no remount on route change).

---

## Recording shell (`#/record`)

**Status: Usable but needs QA**

Same shell as presentation plus:

- Session `recordingTargetFps` (30/60) for canvas frame pacing
- Session `recordingRenderScale` (0.5 / 0.75 / 1.0) for 2D backing + WebGL DPR

Does **not** include an internal video encoder — see Recording subsystem.

---

## Audio lifecycle

**Status: Stable** (provider fix landed in `287e007`)

- `AudioDataProvider` wraps the full app once.
- File / playlist / desktop / mic capture via `useAudioCaptureController`.
- Analyser feeds spectrum, particles, stage FX, background reactivity.
- Route changes `#/edit` ↔ `#/present` do **not** destroy `AudioContext` (verified architecture; manual file playback QA recommended per session).

---

## Rendering layers

| Layer                         | Technology                     | Status |
| ----------------------------- | ------------------------------ | ------ |
| Global background             | Canvas 2D                      | Stable |
| Background / overlay images   | Canvas 2D                      | Stable |
| Particles / rain              | Three.js R3F                   | Stable |
| Spectrum / logo / track title | Canvas 2D (`AudioLayerCanvas`) | Stable |
| Stage lights / flash          | Canvas 2D                      | Stable |
| Camera FX                     | CSS transform stage            | Stable |
| Editor chrome                 | DOM                            | Stable |

**No master compositor canvas** — browser composites multiple canvases. Implication: video output is produced by the offline exporter, which redraws every layer into one frame (`renderFrameAt`), not by capturing the live page.

---

## Lyrixa Compose

**Status: Contract and pure runtime implemented; playback wiring pending**

- Export emits `<project>.vibrix-authoring` with manifest schema v2, immutable
  slot/image snapshots and transportable image previews.
- Images are authoring objects separate from `background-zoom`; Spectrum 1 and
  Spectrum 2 remain independent families.
- Score parsing accepts legacy schema v1 intervals and schema v2 sustained
  activations (`scene`, `feature-slot`, `image`, `inherit`).
- `resolveVisualStateAt(base, score, T)` is pure and deterministic. Granular
  overrides remain above later scenes/images until another cue or `inherit`.
- The score is not persisted and does not drive the live viewport or offline
  export yet. Import currently validates and reports compatibility only.

---

## Spectrum

**Status: Stable** (Pixel shape + pixelate post-process: **Usable but needs QA**)

- Families: classic, oscilloscope, tunnel, liquid, orbital, spiral
- Dual instances (Spectrum 1 / 2) with per-instance settings
- **Ownership contract:** controls below the Spectrum 1 / Spectrum 2 selector
  affect only the selected spectrum (incl. pixelate, profiles, randomize/reset);
  both-affecting controls (master enable, visibility, color source, reset-all)
  live above the selector labelled _Global / both_
- **Shared active target** (`activeSpectrumTarget`): editor + HUD use one
  selector, kept in sync; UI-only, not persisted in the project (localStorage
  pref `vibrix-spectrum-target`)
- HUD has **one** target-bound spectrum bank (`[S1|S2]` + toggles incl.
  pixelate) — no separate "clone" bank; `clone` naming retired from live UI
- Profile slots and Randomize / Reset are **per-target**
- Visual Accents pack (neon core, gradient flow, peak sparks, echo trace)
- Manual glow, RGB split (classic wave)
- **Pixel shape** (classic linear LED cells) — store v96
- **Pixelate post-process** (full-spectrum grid, **per-target**) — store v96
- **Scope radial Scale + rotation**: `spectrumScale` grows the scope's
  `spectrumInnerRadius` (the figure IS the ring; skipped while Follow Logo
  drives it); rotation controls available for scope radial. No new store keys

See `docs/features/SPECTRUM_ENGINE.md` (ownership model) and
`docs/features/SPECTRUM_PIXEL_ART.md`.

---

## Logo, particles, rain, stage FX

| Subsystem            | Status              |
| -------------------- | ------------------- |
| Reactive logo        | Stable              |
| Particles (bg/fg)    | Stable              |
| Rain                 | Stable              |
| Stage lights / flash | Stable              |
| Camera FX profiles   | Usable but needs QA |

---

## Projects / scenes / profiles

**Status: Stable**

- Scenes, setlists, profile slots (looks, spectrum, logo, etc.)
- Project package `.vibrix` export/import (reads `.lwag` too) (`PROJECT_SCHEMA_VERSION = 1`)
- Settings JSON (`SETTINGS_SCHEMA_VERSION = 1`)
- Feature profiles round-trip spectrum pixel settings (v96 keys)

---

## Authoring catalogue for Lyrixa (`vibrix-manifest`)

**Status: Stable (publish + review); playback is not implemented**

- `features/scenes/slotRevision.ts` — content hash of a slot's `values`
  (cyrb53 over a canonical tagged serialization, 14 hex digits). Derived on
  demand, **not** a persisted key: renaming a slot does not move it, editing a
  value does. A scene's revision folds in the revisions of the slots it binds.
- `features/scenes/authoringManifest.ts` — `buildAuthoringManifest` /
  `buildAuthoringManifestReport`: pure, clock-free, over exactly the 12
  composable families (`calibrationProfileSlots` is excluded by the parameter
  type). Dangling scene bindings are normalized away and reported, because
  Lyrixa's parser rejects a whole file for one.
- `features/scenes/authoringManifestFixture.ts` — the declared input the
  contract's literal fixture is derived from.
- `features/composition/vibrixScore.ts` + `vibrixScoreLoader.ts` — parse and
  review a Lyrixa score: collects every readable error, never throws, and reports
  per-cue `ready` / `updated` / `missing` / `empty` / `not-cueable`.
- UI: `features/export/controls/VibrixAuthoringSection.tsx` in the Export tab.
  Importing a score confirms first and **does not touch the project**; the review
  is the deliverable.
- Transport is a file (`<project>.vibrix-manifest.json`). No endpoint: the
  catalogue lives in the browser store, which `backend/server` never sees.
- Contract: [docs/features/VIBRIX_AUTHORING_CONTRACT.md](../features/VIBRIX_AUTHORING_CONTRACT.md).
  **Not implemented:** evaluating a score (`resolveVisualStateAt(base, score, T)`),
  which needs visual state at an instant to stop depending on the path taken.

---

## Intro / ending windows

**Status: Usable but needs QA**

- One module, two windows: `introSequence` (opening) and `outroSequence`
  (ending), both off by default. `introPlan.ts` decides how far each piece is
  mounted; `introPaint.ts` places it; `IntroLayer.tsx` plays it live and the
  offline exporter draws the same composition for the file.
- The window is drawn at a single shared z-index, `INTRO_LAYER_Z_INDEX` (95) —
  above every visual layer, under the HUD. The exporter reads that same
  constant (`FIXED_Z` in `features/export/frameComposition.ts`) so the file
  cannot stack it differently from the preview.
- Montage framing per image: `faceFocusX/Y` if the image was measured,
  otherwise the user's own framing (`focusX/Y`), and dead centre only when
  neither exists.
- **A setlist never eats the project's intro.** Activating a setlist bound to
  an `introProfileSlots` entry parks the project's two windows in
  `setlistIntroFallback` (store v143) and installs the slot's; leaving that
  setlist, deleting it, or unbinding its slot gives the parked windows back and
  clears the park. Chaining bound setlists parks once — the park always holds
  the project's windows, never the previous show's. Binding a slot to the
  setlist that is already active applies immediately.
- **The tab has its own transport.** A play button runs the window from the
  preview clock (`introPreviewStore.ts`, a standalone non-persisted store),
  reads **Pause** while it runs, and a Stop sits beside it; the window closes
  itself when it ends. Pausing freezes the frame but not the settings — the
  renderer keeps reading live state, so a dial moves in that frozen frame. The
  preview resolves its duration exactly like the real window, half-the-video
  clamp included. `features/export` does not import the store and must not: that
  is what keeps the file ruled by the track's clock, and a test walks the export
  folder to assert it.
- `montageImageScale` (store v144, 0.6–2.5) zooms the montage inside its cell.
  Below 1 the image is matted over the window's backdrop on purpose, and the
  pan shift goes to zero because there is no margin to travel into; above 1 the
  shift grows with the margin and still never exceeds it, which is the invariant
  that keeps a tiled montage from uncovering its backdrop.

---

## Persistence and schemas

| Constant                  | Value         | Location                                    |
| ------------------------- | ------------- | ------------------------------------------- |
| `APP_VERSION`             | `0.7.0-alpha` | `src/lib/version.ts`, `package.json`        |
| `STORE_PERSIST_VERSION`   | **146**       | Migrations in `wallpaperStoreMigrations.ts` |
| `PROJECT_SCHEMA_VERSION`  | 1             |                                             |
| `SETTINGS_SCHEMA_VERSION` | 1             |                                             |

Recent schema steps (full history in `src/lib/version.ts` and `CHANGELOG.md`):

| Version | Adds                                                                                                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v96     | `spectrumShape: pixel`, `spectrumPixelate`, `spectrumPixelateScale`                                                                                                                                                                                               |
| v97     | Spectrum 2 gets its own `spectrumSecondProfileSlots` bank                                                                                                                                                                                                         |
| v98     | Scene-first model — `defaultSceneSlotId`                                                                                                                                                                                                                          |
| v99     | Re-runs instance migration to backfill missing Spectrum 2 keys                                                                                                                                                                                                    |
| v100–02 | Liquid Glass toggles, per-surface tuning, then the reworked lens model                                                                                                                                                                                            |
| v103    | Legacy Motion bundles + per-image Spectrum 2 overrides split into slots                                                                                                                                                                                           |
| v104    | Scene/per-image bindings reference slots by stable `id`, never by index                                                                                                                                                                                           |
| v105    | Per-liquid-layer retro pixelate (`spectrumLiquidLayer{1,2,3}Pixelate`)                                                                                                                                                                                            |
| v106    | Radial shapes normalized + 6 retired; `spectrumRadialSharpness`                                                                                                                                                                                                   |
| v107–10 | Retired FX cleanup + unified Looks catalog and audio routing                                                                                                                                                                                                      |
| v111    | Cache-safe Vibrix factory logo URL and legacy logo migration                                                                                                                                                                                                      |
| v112    | Built-in logo variant mode (vector/pixel/auto)                                                                                                                                                                                                                    |
| v113    | Per-image `coverageFramingEdited` provenance flag                                                                                                                                                                                                                 |
| v114    | `showAutoZoomDebug` coverage-overlay debug flag                                                                                                                                                                                                                   |
| v115    | `sceneServiceBaseUrl` (AI scene-intent service location)                                                                                                                                                                                                          |
| v116    | Keep-Covered unconditional; `imageCoverageLockEnabled` removed                                                                                                                                                                                                    |
| v117    | `imageFramingManualEnabled`: manual framing switch (coverage math off)                                                                                                                                                                                            |
| v118    | `offlineExportResolutionId` + `offlineExportFps`: persisted export profile                                                                                                                                                                                        |
| v119    | `effectLayers` + `activeEffectLayerId`: several Looks stacks at once                                                                                                                                                                                              |
| v120    | Looks slots and per-image Looks overrides carry the whole layer stack                                                                                                                                                                                             |
| v121    | Global composition mode (`globalCompositionOverride` + per-image opt-out)                                                                                                                                                                                         |
| v122    | `sceneServiceModel` — which model the scene service should use ('' = server)                                                                                                                                                                                      |
| v123    | `slideshowTransitionAnchor`: where a manual timestamp sits in its transition                                                                                                                                                                                      |
| v124    | `motionLayers` + `activeMotionLayerId`: several Camera Motion movements at once                                                                                                                                                                                   |
| v125    | `cameraMotionAmplitudeAudio`: audio drives the size of a movement, not only its speed                                                                                                                                                                             |
| v126    | Per-image `cameraFxOverride` / `lightsOverride` / `trackTitleOverride`, all `null`                                                                                                                                                                                |
| v127    | `transitionPresets` (factory seeded) + per-image `transitionPresetId`, `null`                                                                                                                                                                                     |
| v128    | `globalCompositionSlots` (6 vacíos) + `activeGlobalCompositionSlotId`, `null`                                                                                                                                                                                     |
| v129    | `introStinger` + `outroStinger` (intro/ending generados), ambos apagados                                                                                                                                                                                          |
| v130    | `introSequence` + `outroSequence` (módulo de intro/ending), ambos apagados                                                                                                                                                                                        |
| v131    | El spectrum del intro pasa a ser un slot guardado + onda fija generada                                                                                                                                                                                            |
| v132    | El tiempo del intro en segundos (`buildSec`/`releaseSec`) + `backdropColorSource`                                                                                                                                                                                 |
| v133    | Foco de cara y de logo por imagen (`faceFocus*`, `logoFocus*`) + `logoFollowImageFocus`                                                                                                                                                                           |
| v138    | Slots de animaciones de intro (`introProfileSlots`) + `Setlist.introSlotId`                                                                                                                                                                                       |
| v139    | Spectrum 1 y 2 independientes en la ventana de intro (`spectrumPrimaryEnabled` / `spectrumPrimarySlotId` / `spectrumSecondEnabled` / `spectrumSecondSlotId`), por id de slot                                                                                      |
| v140    | Movimiento: zoom de borde, suavizado, estela y color de estela por capa (`cameraMotionEdgeZoom` / `cameraMotionSmoothing` / `cameraMotionTrail` / `cameraMotionTrailColor`)                                                                                       |
| v142    | Camera Motion «invertir con energía baja» por capa de movimiento (`cameraMotionInvertOnLowEnergy` / `cameraMotionInvertThreshold` / `cameraMotionInvertHoldMs`)                                                                                                   |
| v144    | `montageImageScale`: zoom del mosaico de la intro/ending dentro de su celda (por debajo de 1 la imagen queda enmarcada sobre el fondo, a propósito)                                                                                                               |
| v143    | `setlistIntroFallback`: dónde se aparcan las ventanas de intro/ending del proyecto mientras un setlist con slot ligado está activo                                                                                                                                |
| v141    | Encuadre manual y «la marca sigue a la imagen» por imagen (`framingManual` / `logoFollowsFocus` en cada `BackgroundImageItem`; las claves planas son el valor vivo de la imagen activa)                                                                           |
| v137    | Tipografía de las líneas de la intro tomada de Track Info (`titleTextStyleSource`, `taglineTextStyleSource`)                                                                                                                                                      |
| v136    | Escala de movimiento por capa de Camera Motion (`cameraMotionRange`)                                                                                                                                                                                              |
| v135    | Logo de la intro con colocación, desplazamientos, ancho y opacidad (`logoPlacement`, `logoOffsetX/Y`, `logoStretch`, `logoOpacity`)                                                                                                                               |
| v134    | Divisiones del montaje (`divisionPattern`, `divisionAngleDeg`) + variantes (`montageArrival`, `montageMove`) + imágenes a mano (`imageSourceMode`, `imageAssetIds`) + rellenos (`backdropFillMode`) + marco del título (`titleFrameShape/Style/Animation/Color*`) |

---

## Testing / CI

**Status: Stable**

- Vitest: 151 files / 1690 tests (version, output modes, pixel helpers, spectrum, intro windows, store migrations, authoring manifest / slot revisions / Lyrixa score, etc.)
- CI: `format:check`, `lint`, `test:types`, `test:run`, `docs:check`, `build`
- DEV harness: `#/dev/spectrum-fx`

---

## Performance modes

**Status: Stable**

- Editor: `performanceMode` low / medium / high (30/45/60 FPS caps on heavy canvases)
- Recording shell: additional `recordingRenderScale` + `recordingTargetFps` (session-only)

---

## Experimental features

| Feature                               | Status             |
| ------------------------------------- | ------------------ |
| Virtual folders (local FS API)        | Experimental       |
| Offline export planner                | Experimental (MVP) |
| Offline video export (MP4/WebM)       | Experimental (MVP) |
| Spectrum FX Lab (`#/dev/spectrum-fx`) | DEV only           |
| Cloud / Supabase                      | Not implemented    |

---

## Edición de tiempos del slideshow

- Audio Checkpoints, marcas manuales y sincronización por pista se excluyen al
  seleccionarlos. Cambiar de modo conserva las marcas guardadas.
- «Repartir en partes iguales» solicita confirmación, limpia las marcas del
  setlist activo (o de toda la biblioteca si no hay uno) y activa Audio
  Checkpoints. Al volver a manual, esas imágenes parten de tiempos automáticos.
- La timeline comparte el pool habilitado y las marcas del reproductor;
  representa los anclajes temporales, no el comienzo de cada fundido. Los clips
  se ordenan por tiempo y permiten editar inicio/fin en segundos.
- HUD → Audio ofrece sólo «Marcar aquí» y «Repartir en partes iguales» como
  accesos rápidos. La timeline y los campos precisos viven en el editor.

## Playback / media-key controls

- **Play/pause** (hardware key, e.g. F8): supported. Driven by Media Session +
  audio-element event sync.
- **Previous/next** (hardware key, e.g. F7/F9): supported **through Media Session
  where the browser/OS delivers it**. Handlers are registered automatically
  whenever there is an audio context — the "Enable Media Session" toggle now only
  controls the rich OS now-playing card, not whether the keys work.
- **Option + ← / Option + →**: guaranteed app fallback for previous/next (always
  reaches the page; for macOS cases where the OS swallows F7/F9).
- All paths call the same commands as the HUD ⏮/⏭ buttons. The `?debug=fps`
  overlay exposes `last key` / `last media-session` / `last cmd` to prove which
  path fired.

> macOS top-row media keys may be handled by the system/browser and may not
> arrive as normal `keydown` events — hence the Media Session primary path plus
> the Option+Arrow fallback.

---

## Known limitations

1. **No master output canvas in live mode** — Presentation Mode composes DOM layers; only the offline exporter draws a single deterministic frame.
2. **Recording render scale + pixelate** — double resampling can soften pixel grids (documented in `SPECTRUM_PIXEL_ART.md`).
3. **Pixel shape** — linear classic only; radial falls back to bars.
4. **Offline export needs WebCodecs** — Chromium only; Safari/Firefox fall back to OBS capture.
5. **The offline export is not yet QA'd end to end** — the frame-by-frame pipeline is implemented and tested by unit, but no long full-track render has been signed off.

---

## Immediate priorities

1. Offline video export QA (a full track, end to end) + OBS workflow documentation
2. `resolveVisualStateAt(base, score, T)` — the stateless refactor that lets a
   Lyrixa score actually drive the frame (own window, from the freeze tag)
3. Pixel Art visual polish and performance measurement (manual baselines)
4. Public alpha documentation freeze (`docs:check` in CI)

See deliverable “next three sprints” in sprint summary.
