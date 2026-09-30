# Recording Subsystem Audit (ARCHIVED)

> **Archivado 2026-09-30.** El grabador in-app (`getDisplayMedia` +
> `MediaRecorder`) fue **eliminado**: `src/features/recording/`,
> `RecordingToolsSection` y `useRecordingExport` ya no existen. La única ruta
> de vídeo es el exportador offline determinista (`useOfflineVideoExport`), y
> la salida en vivo sigue siendo Presentation Mode + OBS. Este documento se
> conserva sólo como registro histórico.

**Date:** 2026-06-20 (re-audit)  
**HEAD:** `0bf9d914` · prior audit 2026-06-19  
**Scope:** In-browser `getDisplayMedia` + `MediaRecorder` path and relationship to Output / Recording modes.

## Executive summary

The in-app recorder remains a **legacy screen-capture wrapper**. It does **not** encode from an internal master compositor. **Presentation Mode + OBS** is the supported production workflow.

Recording Mode (`#/record`) reduces render cost via backing scale but **does not** write video files.

---

## File inventory (current)

| File                          | Role                                | Classification           |
| ----------------------------- | ----------------------------------- | ------------------------ |
| `useRecordingExport.ts`       | Hook: capture, record, save         | Working with limitations |
| `displayMediaCapture.ts`      | `preferCurrentTab`, monitor exclude | Working with limitations |
| `RecordingToolsSection.tsx`   | Export UI                           | Working                  |
| `recordingMimeSupport.ts`     | MIME + VP9 preference               | Working                  |
| `OutputModeLaunchSection.tsx` | Live output launch (not recorder)   | Working                  |
| `outputRenderQuality.ts`      | Recording shell backing scale       | Verified (unit tests)    |
| `dev/recordingSmokeHarness/*` | 5s DEV smoke                        | Manual only              |

---

## Classification matrix

| Item                                   | Status                   | Notes                                                         |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------- |
| `getDisplayMedia`                      | Working with limitations | User picker **required**; cannot auto-select without confirm  |
| `preferCurrentTab`                     | Working with limitations | Chrome/Edge; pre-selects tab in picker                        |
| `MediaRecorder` start/stop             | Verified working         | No pause/resume                                               |
| MIME selection                         | Verified working         | WebM VP9 preferred when supported                             |
| Audio inclusion                        | Working with limitations | `audio: true` on display media; browser-dependent             |
| Pause/resume                           | Broken / not implemented | —                                                             |
| Stop → save                            | Verified working         | `showSaveFilePicker` or download fallback                     |
| 30/60 FPS request                      | Working with limitations | `frameRate` **hint**; encoder may differ                      |
| Recording shell `recordingTargetFps`   | Verified (pacing)        | Caps RAF on canvases; **not** MediaRecorder FPS               |
| Recording shell `recordingRenderScale` | Verified (backing)       | 2D + WebGL DPR; not CSS transform                             |
| Fullscreen during record               | Working with limitations | Auto re-entry after picker; **manual toggle can end capture** |
| Scene changes during record            | Untested                 | Tab capture should reflect visually                           |
| App audio sync in file                 | Working with limitations | Tab audio if user shares tab with audio                       |
| Long recording memory                  | Architectural risk       | All chunks in RAM until stop                                  |
| Every visual layer in file             | Working with limitations | Only if tab/window capture includes composited pixels         |
| Pixel art crispness at scale 0.5       | Working with limitations | Double resampling possible                                    |
| Safari / Firefox                       | Untested                 | Manual matrix required                                        |

**Do not claim** MediaRecorder encodes exactly 60 FPS because `frameRate: 60` was passed — browsers treat this as a hint.

---

## Capture pipeline (current)

```
Export → Start Recording
  → exitFullscreen() if needed
  → getDisplayMedia({ preferCurrentTab, video: { frameRate }, audio? })
  → user confirms tab/window in browser UI
  → optional requestFullscreen() if "fullscreen after capture" enabled
  → MediaRecorder.start(250ms slices)
  → Stop → Blob → save picker or Downloads
```

If user clicks **manual fullscreen** during recording, `videoTrack.ended` may fire → recorder stops → save dialog (partial file).

---

## Output modes vs internal recorder

| Path                | Records to disk    | Clean UI                                       |
| ------------------- | ------------------ | ---------------------------------------------- |
| `#/present` + OBS   | Via OBS            | Yes                                            |
| `#/record` + OBS    | Via OBS            | Yes + render scale                             |
| Export tab recorder | Yes (experimental) | No (editor chrome unless user picks clean tab) |

---

## DEV smoke harness

`#/dev/recording-smoke` — 5s capture, local blob playback. **Not run in CI.**

---

## Practical recommendation

### Supported V1

1. Build scene in `#/edit`
2. **Presentation Mode** or **Recording Mode** for clean output
3. **OBS** Window Capture on browser window
4. Audio via OBS desktop or browser source

### Experimental

1. Export tab → configure WebM VP9, 60 FPS hint, bitrate
2. Enable **fullscreen after capture**
3. Confirm **this tab** in picker
4. Do **not** toggle fullscreen manually while recording
5. Stop → save dialog

### Deferred

- Master compositor + `canvas.captureStream()`
- Pause/resume
- Memory-bounded chunk streaming
- Guaranteed MP4/H.264 across browsers

---

## Prerequisites before internal recording v2

1. Single output compositor (all layers)
2. Audio tap from Web Audio graph
3. Bounded chunk writer
4. Explicit record state machine in UI (including output shell)

---

## Stale settings / dead paths

- `OutputRenderScaleStage` (CSS scale) — **removed**; replaced by `outputRenderQuality.ts`
- `useOutputModeAudioAutostart` — **removed** after shared provider fix

---

## Media-key / output-sync sprint findings

### Recorder status decision — **Experimental / Legacy. OBS remains V1.**

Audited the realtime recorder (`useRecordingExport`, `displayMediaCapture`,
`recordingMimeSupport`):

- **Capture source:** `getDisplayMedia` (screen/window capture), _not_
  `canvas.captureStream()`. There is no master compositor canvas.
- **Encoder:** `MediaRecorder`, VP9/opus preferred with VP8 → WebM → MP4
  fallback already implemented (`getSupportedRecordingFormats`).
- **Bitrate:** already configurable (`videoBitsPerSecond`, default 18 Mbps).
- **FPS:** a _hint_ only (`frameRate: { ideal, max }`), never guaranteed.

**Conclusion:** the quality ceiling is inherent to realtime `MediaRecorder` +
`getDisplayMedia` (browser throttling, no frame-accurate encode, large files).
The pieces a user would tune (bitrate, codec, FPS hint) already exist; no safe
change makes it match OBS. It stays **Experimental**, and OBS Window Capture is
the recommended V1 path. A true non-realtime path is scoped in
`docs/architecture/OFFLINE_VIDEO_RENDERER_DESIGN.md` (V3, not built).

### Media-key playback / analyser desync — root cause + fix

**Root cause:** `navigator.mediaSession.playbackState` was never set anywhere in
the codebase. With it left at the default `'none'`, the browser guesses
play-vs-pause from the raw media element, which diverges from the app's
canonical `audioPaused` state. That single gap explains all three reported
symptoms:

- F8 "pause then immediately resume" (browser fires the wrong action handler).
- F7/F9 previous/next inert (no active media session on macOS).
- Resume-while-paused-before-Presentation plays audio but the canvas stays
  frozen — audio resumed natively while React paused flags stayed stale, so
  `getAudioSnapshot()` kept returning the empty snapshot.

**Fix (part 1):** `resolveMediaSessionPlaybackState()` + an effect in
`useAudioPlaybackEffects` keep `navigator.mediaSession.playbackState` synced to
`audioCaptureState` + `audioPaused`.

### Follow-up: `playbackState` alone did NOT fix it — deeper root cause

User retest showed pause still didn't stay paused, F7/F9 still dead, and canvas
still frozen on resume. Deeper trace found the **real** root cause:

1. `mediaSessionEnabled` defaults to **`false`** — so unless the user enables the
   "Enable Media Session" toggle, hardware media keys are handled **100%
   natively** by the browser on the `<audio>` element, never through the app's
   canonical commands.
2. The audio element had **only an `'ended'` listener** — no `play`/`pause`
   listeners — so the app never observed native play/pause transitions.

That combination produced every symptom:

- **Pause won't stay paused:** native `audioEl.pause()` left `audioPaused=false`,
  so the `healPlayback` auto-recovery loop saw `elementPaused && !nearEnded`,
  judged it a "stall", and auto-resumed.
- **Canvas frozen on resume:** entering paused (`audioPaused=true`) then a native
  `audioEl.play()` left `audioPaused=true`, so `getAudioSnapshot()` stayed forced
  empty even though audio was audible.
- **F7/F9 dead:** native prev/next, with no playlist wiring; only Media Session
  routes those, and it was off.

**Fix (part 2 — the decisive one):** the active audio element now observes its
own `play`/`pause` events (`FileAudioAnalyzer.setOnPlaybackStateChange`,
forwarded through `AudioMixEngine` to the **active** track only) and a canonical
bridge in `AudioDataContext` (`syncPlaybackStateFromElement`) mirrors the real
element state into `audioPaused`/`isPaused`. Now, however playback is triggered
(UI button, Media Session, or native media key), the app's canonical paused
flags follow reality → the snapshot is never falsely empty → the canvas reacts,
and the recovery loop no longer fights a genuine pause. Playlist prev/next were
also factored into pure `resolveNextTrackId`/`resolvePrevTrackId` helpers (wrap +
empty-safe).

> **F7/F9 still require the Media Session toggle ON** (it is off by default) and
> a playlist with ≥2 enabled tracks — that path is OS-routed and unchanged here.

**Validation status:**

| Check                               | Status                            |
| ----------------------------------- | --------------------------------- |
| Unit: playbackState resolver        | ✅ tested                         |
| Unit: playlist prev/next boundaries | ✅ tested                         |
| Unit: analyser-state classifier     | ✅ tested                         |
| Element play/pause → canonical sync | ✅ implemented (logic verified)   |
| Mac F8 single-toggle / pause stays  | ⏳ pending hardware validation    |
| Mac F7 previous / F9 next           | ⏳ pending hardware validation    |
| Presentation resume → canvas reacts | ⏳ pending hardware validation    |
| Windows media keys                  | ⏳ Untested (no Windows hardware) |

The new `?debug=fps` overlay now also shows `audio`, `track`, `mediaSession`
state, and `analyser peak` + an "audio playing but analyser inactive" warning —
use it to confirm analyser activity while audio is audible.

> Hardware media-key behavior cannot be exercised headlessly. The code fix and
> root cause are verified by reasoning + unit test; the OS-key matrix above must
> be ticked by a human before claiming "working".

### Output FPS overlay (OBS-safe)

`OutputModeDevDiagnostics` was DEV-build-only, so it never appeared in the
production build used for OBS. Now opt-in via **`?debug=fps`** (e.g.
`#/present?debug=fps`) or the **Ctrl+Shift+F** toggle (sessionStorage-backed).
Never visible by default; shows mode, perf mode, backing/css size, DPR, render
scale, approx FPS + frame ms. Hide again with Ctrl+Shift+F before final capture.

---

## Device target policy

| Device class     | Intended use                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Phone / tablet   | Preview + light control only. No guaranteed recording/export; heavy effects may be limited. Not a performance-baseline target. |
| Laptop / desktop | **Recommended** for Presentation/Recording. OBS workflow supported. Performance baselines are measured here.                   |

The app is not hard-blocked on mobile; this is a guidance policy, not a gate.
