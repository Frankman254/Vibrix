# Output Modes

**Verified against:** `src/App.tsx`, `EditorPage.tsx`, `OutputShellPage.tsx`, `WallpaperViewport.tsx`

## Routes and session mode

| Route       | Shell                               | `RuntimeUiMode`   |
| ----------- | ----------------------------------- | ----------------- |
| `#/edit`    | Editor                              | `edit`            |
| `#/present` | Output                              | `presentation`    |
| `#/record`  | Output                              | `recording`       |
| `#/preview` | Preview (legacy mini player target) | synced from route |

`RouteRuntimeModeSync` keeps `useRuntimeUiModeStore` aligned with the hash route.

---

## Shared provider architecture

```
HashRouter
└── WallpaperAppProviders          ← I18n, AudioDataProvider, Dialog, sleep/wake
    ├── RouteRuntimeModeSync
    ├── AppAssetBootstrap          ← useRestoreWallpaperAssets (once)
    └── Routes
        ├── EditorPage
        ├── OutputShellPage        ← /present and /record
        └── PreviewPage
```

**Critical:** `AudioDataProvider` is **not** nested inside `EditorPage` or `OutputShellPage`. Navigating edit → present **does not** remount the audio tree.

---

## Edit Mode

### Mounted UI

- `WallpaperViewport` (`editorMode`, interaction overlays)
- `ControlPanel` (tabs, export, recording tools)
- `DragInteractionLayer`, `DragModeOverlay`
- Quick Actions HUD (`QuickActionsPanel`)
- `DiagnosticsHudStack`, `CanvasFpsOverlay` (when enabled)
- DEV: `OutputModeDevDiagnostics` (editor shell flags)

### Editor-only loops

- Preset dirty tracking, preview broadcast
- Drag positioning, command palette
- Panel / HUD theme chrome

### Launch points to output

- Export → Live Output (Presentation / Recording)
- Command palette
- HUD **PRES** button → `#/present`

---

## Presentation Mode

### Remains mounted

- Full wallpaper render stack (`WallpaperViewport`, `outputMode`)
- `AudioDataProvider` (continuous playback)
- `OutputRecoveryLayer`
- `OutputPresentationCursorPolicy`
- `SlideshowManager`, camera FX, all visual layers

### Unmounted / hidden

- `ControlPanel`
- Quick Actions HUD
- `DiagnosticsHudStack`, `CanvasFpsOverlay`
- `OverlayInteractionStage`, `FirstRunEmptyState`
- Editor drag layers

### Audio continuity

Same provider instance as edit. No `useRestoreWallpaperAssets` duplicate on output shell (`AppAssetBootstrap` runs once at app level).

### Cursor

Session setting `presentationHideCursor` (default **on**). Hides pointer after ~2.5s idle on `#/present` and `#/record`.

### Fullscreen

Optional `presentationFullscreenOnLaunch` — only when launched from a **button click** (`useEnterOutputMode`). Direct `#/present` load does not auto-request fullscreen.

### Recovery

- `Ctrl+Shift+E` → `#/edit`, exits fullscreen
- Top-left hot corner hold 2s (backup)

### OBS workflow

1. Prepare scene in `#/edit`
2. Export → **Presentation Mode** (or HUD PRES)
3. OBS **Window Capture** or **Browser Source** on the app window/tab
4. Audio from OBS (desktop audio) or browser tab audio as needed

See `docs/guides/OBS_PRESENTATION_MODE.md`.

---

## Recording Mode

### What it does

- Same clean shell as presentation
- Applies **session-only** performance settings from `outputPerformanceStore`:

| Setting                           | Effect                                                |
| --------------------------------- | ----------------------------------------------------- |
| `recordingTargetFps` 30/60        | Frame pacing on spectrum, stage FX, particles pump    |
| `recordingRenderScale` 0.5/0.75/1 | 2D canvas **backing** dimensions; WebGL max DPR scale |

Implementation: `src/runtime/outputRenderQuality.ts`

- CSS viewport stays 100% × 100%
- Backing width/height = `innerWidth * scale` (recording only)
- `SceneLayerCanvas` DPR max multiplied by scale

### What it does NOT do

- **Does not** record video to disk by itself
- **Does not** create a master compositor
- **Does not** force MediaRecorder FPS (export tab recorder is separate)

### Internal recorder (Export tab)

Removed (2026-09-30). The offline exporter is the only video path; live output is Presentation Mode + OBS. Historical record: `docs/archive/RECORDING_SUBSYSTEM_AUDIT.md`.

---

## Output performance settings (session-only)

Stored in `outputPerformanceStore` — **never** persisted to projects.

| Key                  | Presentation | Recording |
| -------------------- | ------------ | --------- |
| Hide cursor          | ✓            | ✓         |
| Fullscreen on launch | ✓            | ✓         |
| Target FPS           | —            | ✓         |
| Render scale         | —            | ✓         |

---

## DEV diagnostics

`OutputModeDevDiagnostics` (DEV only, bottom-left): mode, shell mount flags, backing resolution, approximate FPS.
