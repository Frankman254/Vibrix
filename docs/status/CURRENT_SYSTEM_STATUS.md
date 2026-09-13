# Current System Status

**As of:** `chore/fase-0-higiene` (`main`) · App `0.4.1-alpha` · Store persist **v113**

This document describes the product **as implemented in code**, not aspirational roadmaps.

## Product summary

**Vibrix** is a browser-based, audio-reactive visual scene editor. Users compose scenes (backgrounds, spectrum, logo, particles, rain, stage FX), preview them in real time, and export clean output for OBS or experimental in-browser screen recording.

| Area                                   | Status                                   |
| -------------------------------------- | ---------------------------------------- |
| Editor + preview                       | **Stable**                               |
| Presentation / Recording output shells | **Usable but needs QA**                  |
| Internal screen recorder               | **Experimental**                         |
| OBS + Presentation Mode                | **Stable** (recommended production path) |
| Cloud / login / backend                | **Planned / not implemented**            |
| Electron desktop                       | **Not implemented**                      |

---

## Runtime architecture

| Component                        | Status | Notes                                                       |
| -------------------------------- | ------ | ----------------------------------------------------------- |
| Vite + React 19 SPA              | Stable | HashRouter (`#/edit`, `#/present`, `#/record`, `#/preview`) |
| Shared `WallpaperAppProviders`   | Stable | Single `AudioDataProvider` above route shells               |
| Zustand + `localStorage` persist | Stable | `STORE_PERSIST_VERSION = 113`                               |
| IndexedDB assets                 | Stable | Images, audio blobs                                         |
| Vitest + GitHub Actions CI       | Stable | format, lint, types, tests, docs:check, build               |

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

**No master compositor canvas** — browser composites multiple canvases. Implication: internal recording uses `getDisplayMedia`, not `canvas.captureStream()`.

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

## Persistence and schemas

| Constant                  | Value         | Location                                    |
| ------------------------- | ------------- | ------------------------------------------- |
| `APP_VERSION`             | `0.4.1-alpha` | `src/lib/version.ts`, `package.json`        |
| `STORE_PERSIST_VERSION`   | **113**       | Migrations in `wallpaperStoreMigrations.ts` |
| `PROJECT_SCHEMA_VERSION`  | 1             |                                             |
| `SETTINGS_SCHEMA_VERSION` | 1             |                                             |

Recent schema steps (full history in `src/lib/version.ts` and `CHANGELOG.md`):

| Version | Adds                                                                    |
| ------- | ----------------------------------------------------------------------- |
| v96     | `spectrumShape: pixel`, `spectrumPixelate`, `spectrumPixelateScale`     |
| v97     | Spectrum 2 gets its own `spectrumSecondProfileSlots` bank               |
| v98     | Scene-first model — `defaultSceneSlotId`                                |
| v99     | Re-runs instance migration to backfill missing Spectrum 2 keys          |
| v100–02 | Liquid Glass toggles, per-surface tuning, then the reworked lens model  |
| v103    | Legacy Motion bundles + per-image Spectrum 2 overrides split into slots |
| v104    | Scene/per-image bindings reference slots by stable `id`, never by index |
| v105    | Per-liquid-layer retro pixelate (`spectrumLiquidLayer{1,2,3}Pixelate`)  |
| v106    | Radial shapes normalized + 6 retired; `spectrumRadialSharpness`         |
| v107–10 | Retired FX cleanup + unified Looks catalog and audio routing            |
| v111    | Cache-safe Vibrix factory logo URL and legacy logo migration            |

---

## Testing / CI

**Status: Stable**

- Vitest: ~98+ unit tests (version, output modes, pixel helpers, spectrum, recording MIME, etc.)
- CI: `format:check`, `lint`, `test:types`, `test:run`, `docs:check`, `build`
- DEV harness: `#/dev/recording-smoke`, `#/dev/spectrum-fx`

---

## Performance modes

**Status: Stable**

- Editor: `performanceMode` low / medium / high (30/45/60 FPS caps on heavy canvases)
- Recording shell: additional `recordingRenderScale` + `recordingTargetFps` (session-only)

---

## Experimental features

| Feature                               | Status             |
| ------------------------------------- | ------------------ |
| Internal `getDisplayMedia` recorder   | Experimental       |
| Virtual folders (local FS API)        | Experimental       |
| Offline export planner                | Experimental (MVP) |
| Offline video export (MP4/WebM)       | Experimental (MVP) |
| Spectrum FX Lab (`#/dev/spectrum-fx`) | DEV only           |
| Cloud / Supabase                      | Not implemented    |

---

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

1. **No master output canvas** — internal recording captures browser tab pixels, not a deterministic compositor.
2. **Recording render scale + pixelate** — double resampling can soften pixel grids (documented in `SPECTRUM_PIXEL_ART.md`).
3. **Pixel shape** — linear classic only; radial falls back to bars.
4. **Fullscreen + screen capture** — browser security requires picker; fullscreen re-entry is automated but manual toggle during record can end capture.
5. **MP4 in MediaRecorder** — browser-dependent; WebM VP9 preferred in Chrome.

---

## Immediate priorities

1. Recording reliability + OBS workflow documentation and QA
2. Pixel Art visual polish and performance measurement (manual baselines)
3. Public alpha documentation freeze (`docs:check` in CI)

See deliverable “next three sprints” in sprint summary.
