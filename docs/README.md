# Project Documentation

**Current product version:** `0.4.1-alpha` · **Store persist:** v113 · **HEAD:** see `git rev-parse HEAD`

## Start here

**Plan activo:** [plans/PLAN_MAESTRO_LANZAMIENTO.md](plans/PLAN_MAESTRO_LANZAMIENTO.md) — hoja de ruta hacia `1.0.0` (export de vídeo → plantillas → rendimiento → pagos → lanzamiento). Web de venta: [plans/PLAN_WEB_VENTA.md](plans/PLAN_WEB_VENTA.md). Mapa de la suite y rutas de los proyectos vecinos: [../.agents/SUITE.md](../.agents/SUITE.md).

1. [product/V1_ALPHA_SCOPE.md](product/V1_ALPHA_SCOPE.md) — what's in / out of alpha
2. [status/CURRENT_SYSTEM_STATUS.md](status/CURRENT_SYSTEM_STATUS.md) — **as-built system status**
3. [architecture/OUTPUT_MODES.md](architecture/OUTPUT_MODES.md) — Edit / Presentation / Recording
4. [ARQUITECTURA_GENERAL.md](ARQUITECTURA_GENERAL.md) — domain architecture (legacy reference)
5. [AUDIO_RENDER_Y_SHADERS.md](AUDIO_RENDER_Y_SHADERS.md) — audio + render pipeline

## Architecture

| Doc                                                                                | Topic                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)                       | **The contract** — layers, dependency rules, ownership |
| [architecture/CODEBASE_STRUCTURE.md](architecture/CODEBASE_STRUCTURE.md)           | Where things live / "where do I edit X?"               |
| [architecture/OUTPUT_MODES.md](architecture/OUTPUT_MODES.md)                       | Output shells, providers, OBS                          |
| [architecture/LIVE_OUTPUT_SYNC_DESIGN.md](architecture/LIVE_OUTPUT_SYNC_DESIGN.md) | Future sync design (not implemented)                   |
| [architecture/CLOUD_READINESS.md](architecture/CLOUD_READINESS.md)                 | Cloud readiness assessment                             |
| [architecture/BACKEND_OPTIONS.md](architecture/BACKEND_OPTIONS.md)                 | Backend options (deferred)                             |

## Features

| Doc                                                              | Topic                                |
| ---------------------------------------------------------------- | ------------------------------------ |
| [features/SPECTRUM_ENGINE.md](features/SPECTRUM_ENGINE.md)       | Spectrum families, instances         |
| [features/SPECTRUM_PIXEL_ART.md](features/SPECTRUM_PIXEL_ART.md) | Pixel shape vs pixelate post-process |
| [features/LYRIXA_CONTRACT.md](features/LYRIXA_CONTRACT.md)       | Roles, idiomas, sourceId, words[]    |

## Guides & audits

| Doc                                                                        | Topic                       |
| -------------------------------------------------------------------------- | --------------------------- |
| [guides/OBS_PRESENTATION_MODE.md](guides/OBS_PRESENTATION_MODE.md)         | OBS workflow                |
| [audits/RECORDING_SUBSYSTEM_AUDIT.md](audits/RECORDING_SUBSYSTEM_AUDIT.md) | Internal recorder audit     |
| [performance/PERFORMANCE_BASELINE.md](performance/PERFORMANCE_BASELINE.md) | FPS measurement methodology |

## Onboarding (developer)

`onboarding/` — deep dives; verify `STORE_PERSIST_VERSION` against `src/lib/version.ts` (currently **113**).

## Archive

Historical handoffs and superseded status files: [archive/](archive/)

- `archive/PROGRESS_SPECTRUM_2026.md`
- `archive/MOTION_STABILIZATION_STATUS.md`
- `archive/HANDOFF_VIEWPORT_HUD_MULTI_MONITOR.md`
- `archive/SPECTRUM_ENGINE.md` (pre-pixel-art engine notes)

## Maintenance

- Active status → `status/CURRENT_SYSTEM_STATUS.md` only
- Finished handoffs → `archive/`
- Run `pnpm docs:check` and `pnpm architecture:check` before merging
