# Codebase Structure

How the `src/` tree maps to the current product. This is a navigation guide for
humans and agents — when something here disagrees with the tree, the tree wins
(and this doc should be updated).

> **Naming rule:** folders and components describe the **current** product, not
> its history. Do not introduce `modern`, `new`, `v2`, `current`, `legacy`, or
> `temp` as names for the live UI. If something is genuinely experimental, label
> it explicitly and document why.

## Top-level map

| Area                                   | Lives in                                        |
| -------------------------------------- | ----------------------------------------------- |
| App entry / routes / shells            | `src/App.tsx`, `src/pages/`                     |
| Provider stack (above routes)          | `src/components/app/`                           |
| Shared low-level UI (tokens, controls) | `src/ui/`                                       |
| Editor control panel + tabs            | `src/components/controls/`                      |
| Output/Presentation/Recording shell    | `src/pages/OutputShellPage.tsx`, `src/runtime/` |
| Wallpaper render stage                 | `src/components/wallpaper/`                     |
| Feature engines (render/runtime/logic) | `src/features/*`                                |
| Audio capture / analysis / media keys  | `src/context/audioData/`, `src/lib/audio/`      |
| Global state + factory document        | `src/store/` (`defaultState.ts`)                |
| Save / load / restore / sync a project | `src/services/`                                 |
| Pure utilities (no store, no React)    | `src/lib/`                                      |
| Leaf constants and ranges              | `src/config/`                                   |

## Editor controls

The editor's tab UI lives under `src/components/controls/`:

- `ControlPanel.tsx` / `EditorOverlay.tsx` — the two editor shells that mount the tabs.
- `tabs/main/` — the editor tab entry-points that have **not** moved to a domain
  yet, plus the _composition shells_ (`MotionTab`, `LayersTab`, `SceneTab`…),
  which stack sections owned by several domains and belong here by design.
  Formerly `tabs/modern/` (renamed 2026-06; "modern" had come to mean
  "current"). The historical `Modern*` naming has been fully removed from the
  live UI.
- Tabs that now live with their domain: `SpectrumTab`, `LyricsTab`, `LogoTab`,
  `BackgroundTab`, `CalibrationTab`, the three AI Director panels, the eight
  Export sections, and the particles / rain / stage-FX sections. Import them via
  the domain facade (`@/features/<domain>/ui`), never by file path.

> `src/lib/` used to be the drawer everything ambiguous ended up in. It is now
> genuinely a leaf: if a module calls `useWallpaperStore.getState()` it belongs
> in `src/services/`, if it is a table of constants it belongs in `src/config/`,
> and if it is the app's default scene document it is `store/defaultState.ts`.

- `tabs/main/audio/`, `tabs/main/layers/`, `tabs/main/editor/` — sections still
  composed from here because they stack several domains.

**"Where does X live?" should be answerable with one folder.** If it isn't, that
is the bug. The three panels that still fail that test are listed in
[ARCHITECTURE.md](ARCHITECTURE.md) §6.9; everything else is at home.

## Where renderers and engines live

- Spectrum renderers: `src/features/spectrum/renderers/`
- Spectrum effects (glow, neon, rgb split, echo…): `src/features/spectrum/effects/`
- Spectrum runtime/profiles: `src/features/spectrum/runtime/`, `src/store/featureProfiles.ts`
- Pixel Art: `src/features/spectrum/domain/pixelArtHelpers.ts` (+ `renderers/linear/`)
- Logo (motor, presets, diagnostics, grid): `src/features/logo/` — **importar
  siempre por `@/features/logo`**, nunca por un archivo interno. Es el dominio
  migrado de referencia (ver [ARCHITECTURE.md](ARCHITECTURE.md) §6.1).
- Background (encuadre, slideshow, UI): `src/features/background/` — el
  **dibujo** del fondo global se pide por `@/features/background/render` (lo usan
  `GlobalBackgroundView` y el export offline). Qué cambia al **seleccionar una
  imagen** (escena u overrides, Keep Covered) está en
  `src/store/activeImageSelection.ts`, compartido por `setActiveImageId` y el
  slideshow del export (`src/features/export/video/slideshowSegments.ts`).
- Particles / Rain / Stage FX: `src/features/particles/`, `src/features/rain/`,
  `src/features/stageFx/` — el **dibujo** de Stage Lights y Flash Light se
  pide por `@/features/stageFx/render` (lo usan los canvas en vivo y el export
  offline, `src/features/export/renderSubsystems/stageFx.ts`).
- Capas de audio (Track Title, Now Playing, cover): `src/features/audioLayers/`
  — el **dibujo** se pide por `@/features/audioLayers/render`; el `<canvas>` y
  su loop siguen en `src/components/audio/layers/AudioLayerCanvas.tsx`.
- AI Director (intent, análisis de imagen, lotes): `src/features/aiDirector/`
  — modelo por `@/features/aiDirector`, paneles por `@/features/aiDirector/ui`.
  La clave de API vive en `backend/server/`, nunca en el browser.
- Calibración (rangos de sliders, kick sintético): `src/features/calibration/`
- Spectrum draw path: `@/features/spectrum/render` (el modelo es
  `@/features/spectrum`; están separados a propósito, ver ARCHITECTURE.md §3.1).
- Audio runtime / media-session / playlist: `src/context/audioData/`
- Output render quality / debug overlay: `src/runtime/`

## Where do I edit X?

| Want to change…           | Edit here                                                                         |
| ------------------------- | --------------------------------------------------------------------------------- |
| Background UI             | `src/features/background/controls/` (fachada: `@/features/background/ui`)         |
| Spectrum UI               | `src/features/spectrum/controls/` (fachada: `@/features/spectrum/ui`)             |
| Spectrum renderers        | `src/features/spectrum/renderers/`                                                |
| Pixel Art                 | `src/features/spectrum/domain/pixelArtHelpers.ts`                                 |
| Audio / media keys        | `src/context/audioData/` (e.g. `mediaTrackKeys.ts`, `useAudioPlaybackEffects.ts`) |
| Import/Export             | `src/features/export/`, `src/store/featureProfiles.ts`                            |
| Stage FX                  | `src/features/stageFx/` (fachadas: `@/features/stageFx/ui`, `/render`)            |
| Particles / Rain          | `src/features/particles/`, `src/features/rain/`                                   |
| Output / Recording        | `tabs/main/OutputTab.tsx` + `src/runtime/` + `src/features/recording/`            |
| AI Director               | `src/features/aiDirector/` (fachadas: `@/features/aiDirector`, `.../ui`)          |
| Calibración               | `src/features/calibration/` (fachadas: `@/features/calibration`, `.../ui`)        |
| Track Title / Now Playing | `src/features/audioLayers/` + `tabs/main/TrackTitleTab.tsx` (§6.9)                |
| Lyrics (contrato Lyrixa)  | `src/features/lyrics/domain/` — parser, loader, selección por rol/idioma          |

## Tests & docs

- Unit tests live beside their source as `*.test.ts` (Node env, no DOM).
- Docs live in `docs/`; `docs/README.md` indexes them.
- Structure guard: `pnpm structure:check` (`scripts/check-codebase-structure.mjs`).

## Naming

- `tabs/main/` holds the **current** editor tab entry-points. The historical
  `modern` naming has been removed from the live UI (folder + all `Modern*`
  components, sub-cards, hooks, and prop types). `pnpm structure:check` guards
  against regressions.
- **That "future batch" happened** (2026-09-03 → 09-05): feature-specific
  control sections now live next to their engines under
  `src/features/*/controls/`. `components/controls/tabs/` went from 31.6k to
  ~11.6k LOC. What is left there is composition shells, which belong to the
  editor by design.

> Persisted `localStorage` keys (`vibrix-editor-scroll-map`,
> `vibrix-spectrum-target`, plus the pre-rename `lwag-modern-*` names still
> read as fallbacks) and the
> `MODERN_*_STORAGE_KEY` constants that hold them keep their historical names on
> purpose — renaming them would break existing users' saved state.
