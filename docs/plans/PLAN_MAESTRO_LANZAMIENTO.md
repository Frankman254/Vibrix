# Plan maestro de lanzamiento — Vibrix

> **Propósito.** Llevar Vibrix de "motor de visuales muy completo que solo usa su
> autor" a **producto que alguien paga**. Este plan manda sobre cualquier otra
> idea de feature mientras esté activo. Si algo no aparece aquí, **no se
> construye** hasta pasar el hito de lanzamiento (Fase 5).

_Creado: 2026-09-13 · Actualizado: 2026-09-13 (suite Lyrixa/Transcriptor) · Versión de partida: `0.4.0-alpha.1` · Store v113._

Documentos relacionados (no se repiten aquí, se referencian):

- [PLAN_WEB_VENTA.md](PLAN_WEB_VENTA.md) — plan de la web de venta
  (`vibrix-web`, Next.js + Tailwind): secciones, animación, fases W0–W5.
- [MVP_PRODUCT_ARCHITECTURE.md](MVP_PRODUCT_ARCHITECTURE.md) — contratos del
  exportador offline (Fases 1, 2A y 2B ya implementadas).
- [DESKTOP_SUITE_READINESS.md](DESKTOP_SUITE_READINESS.md) — por qué escritorio
  y "wallpaper" quedan **después** del lanzamiento web.
- [../product/V1_ALPHA_SCOPE.md](../product/V1_ALPHA_SCOPE.md) — alcance de la
  alpha 0.3. Este plan **reemplaza** su lista "No entra" en un solo punto:
  _Export MP4 offline_ pasa a ser la prioridad #1.

---

## 0 · La tesis en una frase

> **Vibrix convierte una canción y una imagen en un vídeo musical animado
> (visualizer + letras sincronizadas) listo para YouTube, TikTok o un directo,
> desde el navegador y sin instalar nada.**

### Para quién (cliente inicial)

| Segmento                                        | Qué necesita                                | Qué paga hoy                          |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| Canales lofi / anime / nightcore / phonk        | Vídeos largos (1–3 h) con imagen + spectrum | Specterr, Renderforest, After Effects |
| Músicos independientes                          | Visualizer o lyric video por cada single    | VEED, Canva, freelancers de Fiverr    |
| Creadores de clips cortos (TikTok / Reels 9:16) | Clip de 15–60 s con letra grande y ritmo    | CapCut (gratis), plantillas sueltas   |
| Streamers / DJs                                 | Overlay reactivo al audio en OBS            | Magic Music Visuals, Synesthesia      |

**Contra quién NO competimos (todavía):** Wallpaper Engine y Lively. El modo
"fondo de pantalla" no existe en el código y su mercado se gana con catálogo
comunitario, no con calidad del motor.

### Por qué podemos ganar

1. **Todo en uno:** fondo + spectrum + logo + partículas + **letras
   sincronizadas (Lyrixa)**. Los competidores web hacen visualizer _o_ lyric
   video, rara vez ambos con este nivel de control.
2. **Cero instalación** y el render corre en la máquina del usuario → coste de
   servidor casi nulo (margen alto, a diferencia de Specterr, que renderiza en
   la nube).
3. **Base técnica seria:** 1110 tests, contrato de arquitectura, migraciones de
   store. Se puede iterar rápido sin romper.

### Qué nos impide cobrar hoy (los bloqueadores)

| #   | Bloqueador                                               | Fase que lo resuelve |
| --- | -------------------------------------------------------- | -------------------- |
| B1  | No hay export de vídeo real (solo grabación de pantalla) | Fase 1               |
| B2  | El editor abruma a quien no es experto                   | Fase 2               |
| B3  | Carga inicial pesada (1,76 MB JS, 419 KB gzip)           | Fase 3               |
| B4  | Huecos de i18n (Calibration) y bugs menores de la review | Fase 0               |
| B5  | Sin landing, sin pagos, sin marca de agua, sin legales   | Fase 4               |
| B6  | Sin material de marketing ni usuarios de prueba          | Fase 5               |

---

## 0.5 · La suite: Vibrix + Lyrixa + Transcriptor

Vibrix no está solo. En `Personal-Projects/` viven dos proyectos hermanos del
mismo autor que forman una cadena de producción de vídeo musical:

```
 audio / YouTube                      letra revisada                  vídeo final
      │                                     │                              │
┌─────▼───────────┐  .lyrixa.json  ┌────────▼────────┐  .lyrixa-lyrics.json ┌▼──────────┐
│  Transcriptor   │ ─────────────► │     Lyrixa      │ ───────────────────► │  Vibrix   │
│ (IA: saca letra)│  HTTP local    │ (edita/sincroniza)│   archivo o HTTP    │ (renderiza)│
└─────────────────┘                └─────────────────┘                      └───────────┘
```

### Estado real de cada pieza (revisado 2026-09-13)

| App              | Qué es hoy                                                                                                                                                                                                                                                                | Madurez                                                                  | ¿Corre en el navegador?                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Vibrix**       | Motor visual + editor. Consume el bundle de Lyrixa. ~620 commits, 1110 tests                                                                                                                                                                                              | Alpha avanzada                                                           | Sí                                                                             |
| **Lyrixa**       | Editor de letras tipo DAW (timeline, waveform, capas con `role`/idioma, tap sync, undo/redo). Exporta `.lyrixa-package` (proyecto + audio) y `.lyrixa-lyrics.json` (bundle para Vibrix). Envía a Vibrix por descarga o HTTP (`liveWallpaperTarget.ts`)                    | Temprana (~54 commits, `version 0.0.0`, nombre de paquete aún `lyra-ui`) | Sí                                                                             |
| **Transcriptor** | Servidor Python local (FastAPI): Whisper (MLX / faster-whisper), separación de voz BS-RoFormer/Demucs, modo ultra por votación, traducción y romaji con Ollama, guías de tracklist con LRCLIB. Exporta TXT/SRT/VTT/TSV/JSON + `.lyrixa.json`. API `/api/jobs/{id}/lyrixa` | Funcional para letras claras; ruidoso en mezclas densas                  | **No.** Necesita Python, ffmpeg, modelos de GBs y idealmente GPU/Apple Silicon |

### Qué significa para el lanzamiento

1. **Vibrix es el producto ancla y se lanza primero.** Es el único que ya
   resuelve un trabajo completo (vídeo) y el único que corre 100 % en el
   navegador sin coste de servidor.
2. **Lyrixa se lanza _con_ Vibrix, no por separado.** Para el usuario final es
   "el editor de letras de Vibrix". Se publica en el mismo dominio
   (p. ej. `/lyrics`) y el botón "Enviar a Vibrix" usa el mismo origen, sin
   descargas manuales. Venderlo suelto hoy compite contra herramientas
   gratuitas de subtítulos.
3. **El Transcriptor no entra en `1.0.0` como producto público.** Motivos:
    - No puede correr en el navegador del cliente; ofrecerlo online implica
      servidores con GPU → coste por minuto de audio (rompe el margen del
      modelo "render local").
    - El modo **descarga de YouTube (yt-dlp) no puede ir en un producto
      comercial**: viola los términos de YouTube. Debe desaparecer o quedar solo
      como herramienta personal. En la versión vendible la entrada es
      _archivo que el usuario ya tiene_.
    - La precisión aún no es fiable en mezclas; una IA que falla delante del
      cliente de pago daña la marca de las otras dos apps.
    - **Uso interno ahora:** producir las letras de las plantillas y de los
      vídeos de marketing (Fases 2 y 5) acelera muchísimo el trabajo del autor.
    - **Uso futuro (Fase 6):** "Auto-letras" como feature Pro por créditos
      (GPU en la nube) o incluido en la app de escritorio, **siempre** abriendo
      el resultado en Lyrixa para revisión humana.
4. **Formatos de letra: qué debe exportar Lyrixa** (respuesta a "no sé en qué
   otros formatos exportar"). Prioridad por utilidad real para el cliente:

    | Formato                                  | Para qué lo quiere un creador                                                              | Prioridad         |
    | ---------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
    | `.lyrixa-lyrics.json`                    | Vibrix (ya existe; es el contrato rico con capas, roles, `words[]`)                        | Hecho             |
    | **`.lrc` (+ Enhanced LRC con palabras)** | Letras sincronizadas en reproductores, Musixmatch/Spotify, karaoke. El formato más pedido  | **Alta — Fase 2** |
    | **`.srt` / `.vtt`**                      | Subir subtítulos a YouTube / TikTok / CapCut / Premiere del mismo vídeo que exporta Vibrix | **Alta — Fase 2** |
    | `.txt` plano                             | Descripción del vídeo de YouTube, copiar/pegar                                             | Alta (trivial)    |
    | `.ass` (Advanced SubStation)             | Karaoke con estilo (fuentes/colores/`\k` por sílaba) en ffmpeg/Aegisub/players de anime    | Media — Fase 6    |
    | TTML (Apple Music)                       | Entrega a distribuidoras / Apple Music time-synced lyrics                                  | Baja — Fase 6     |

    Y **Vibrix importa `.lrc` y `.srt`** convirtiéndolos al mismo modelo interno
    del bundle (una capa `primary`). Así Vibrix acepta letras de cualquier
    herramienta, y Lyrixa sigue siendo la forma "premium" de prepararlas.

5. **Una sola marca paraguas, una sola web.** La web de venta presenta la
   suite ("haz tu vídeo musical: letra → sincronía → visual"), pero en `1.0.0`
   solo vende **Vibrix Pro** (que incluye Lyrixa). El Transcriptor aparece como
   "próximamente" para medir interés (lista de espera).

### Contratos entre apps (no romper)

- `docs/features/LYRIXA_CONTRACT.md` (aquí) y `transcriptor/docs/contrato-lyrixa.md`
  son la frontera. Cualquier cambio de formato se versiona en el sobre del
  bundle y los tres lados aceptan la versión anterior.
- Nada de IPC especulativo (Electron/Tauri) hasta la Fase 6; el transporte hoy
  es archivo o HTTP local, y así queda.

---

## Reglas mientras dure el plan

1. **Congelación de features.** Nada de nuevas familias de spectrum, efectos,
   Stage FX, AI Director, modo wallpaper, Electron ni marketplace.
   Excepción: lo que una fase pida explícitamente.
2. **Una fase activa a la vez.** Se puede adelantar trabajo de la siguiente
   solo si la actual está bloqueada esperando algo externo.
3. **Cada fase termina con release** (tag + CHANGELOG + versión subida) y con
   el pipeline verde (`format`, `lint`, `architecture:check`,
   `structure:check`, `docs:check`, `test:run`, `build`).
4. **Criterio de salida medible.** Una fase no se cierra "cuando se siente
   lista", sino cuando cumple su tabla de _Criterios de salida_.
5. **Todo el material de demo/plantillas usa arte con licencia propia o
   libre.** Nada de personajes de anime con copyright en lo que se distribuye.

---

## Resumen de fases

| Fase | Nombre                         | Versión objetivo | Duración estimada\* | Resuelve |
| ---- | ------------------------------ | ---------------- | ------------------- | -------- |
| 0    | Higiene y deuda de la review   | `0.4.1-alpha`    | 1 semana            | B4       |
| 1    | Export de vídeo offline        | `0.5.0-alpha`    | 4–6 semanas         | B1       |
| 2    | Plantillas + modo rápido       | `0.6.0-beta`     | 3–4 semanas         | B2       |
| 3    | Rendimiento y peso de carga    | `0.7.0-beta`     | 1–2 semanas         | B3       |
| 4    | Producto: pagos, marca, legal  | `0.9.0-beta`     | 2–3 semanas         | B5       |
| 5    | Beta cerrada → lanzamiento     | `1.0.0`          | 3–4 semanas         | B6       |
| 6    | Post-lanzamiento (condicional) | `1.x`            | según métricas      | —        |

\*Estimaciones para una persona a tiempo parcial con asistencia de agentes.
Total realista: **4–5 meses** hasta `1.0.0` (objetivo: febrero 2027).

---

## Fase 0 · Higiene y deuda de la review — `0.4.1-alpha`

**Objetivo:** partir de una base limpia. Nada de lo que sigue debe heredar bugs
conocidos.

### Tareas

| #   | Tarea                                                                                                                                                              | Archivos principales                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 0.1 | Commitear la review del 2026-09-12 (fix de `SegmentedControl`, `.pnpm-store` fuera del repo, bump a 0.4.0-alpha.1) en rama propia                                  | —                                                                                       |
| 0.2 | i18n de Calibration: mover labels/hints hardcodeados en español a claves `en`/`es`                                                                                 | `src/features/calibration/calibrationConfig.ts`, `EnvelopeWaveformPreview.tsx`          |
| 0.3 | "Clear storage" real: borrar IndexedDB `vibrix-store`, `lwag-store` y bases de imágenes/carpetas, con `confirm()` y texto que avise qué se pierde                  | `src/components/controls/tabs/main/PerformanceTab.tsx`, `src/store/indexedDbStorage.ts` |
| 0.4 | Migración v110: si los 60 slots de Looks están llenos, no descartar el Custom legacy en silencio (reemplazar el más antiguo o conservarlo como slot extra + aviso) | `src/store/wallpaperStoreMigrations.ts` + test                                          |
| 0.5 | Decidir y documentar Keep Covered + `coverageFramingEdited`: al activar el lock, ¿reencuadra o respeta el encuadre manual? Alinear código y comentario             | `handleToggleCoverageLock`, `autoFitCoveredActiveImage`                                 |
| 0.6 | Paridad de letras en modo `coords`: nativo y bundle deben anclar el bloque igual (misma función compartida)                                                        | `LyricsOverlay`, `src/features/lyrics/runtime/lyrixaBundleRenderer.ts`                  |
| 0.7 | CHANGELOG: fusionar las dos cabeceras duplicadas `[0.3.0-alpha.1]`                                                                                                 | `CHANGELOG.md`                                                                          |
| 0.8 | Barrido i18n completo: script que detecte strings visibles sin `t()` en `src/components` y `src/features` (evitar que vuelva a pasar)                              | `scripts/`                                                                              |

### Criterios de salida

- [x] App en inglés sin un solo texto en español (verificado navegando todas las pestañas).
- [x] Tests nuevos para 0.4 y 0.6.
- [x] Pipeline verde, tag `v0.4.1-alpha`.

---

## Fase 1 · Export de vídeo offline — `0.5.0-alpha`

**Objetivo:** el botón **Exportar vídeo** produce un MP4 (H.264 + AAC) idéntico
a lo que se ve en el preview, más rápido o igual que tiempo real, sin
depender de que la pestaña esté visible ni de `getDisplayMedia`.

**Por qué es la fase #1:** es exactamente lo que cobran Specterr y VEED. Sin
esto, Vibrix es un juguete para OBS; con esto, es un producto.

### Punto de partida (ya existe)

- `OfflineAudioAnalysisSource.getSnapshotAt(timeMs)` determinista (Fase 2A).
- `createOfflineAudioLayerRenderSession` renderiza **logo, spectrum y track
  title** en un canvas propio (Fase 2B).
- El fondo ya se dibuja con un renderer imperativo 2D
  (`src/components/wallpaper/layers/imageCanvasBackgroundRenderer.ts`).
- `renderSubsystems/stubs.ts` tiene los huecos: `background`, `looks`,
  `motion`, `particles`, `rain`, `overlays`, `hud`.
- `offlineExportPlanner.ts` ya detecta `VideoEncoder` (WebCodecs).

### Decisión de arquitectura

**Compositor imperativo por capas + WebCodecs + muxer JS.**

```
Proyecto congelado (snapshot)
      │
      ▼
Bucle de frames  t = i / fps
      │  audio = OfflineAudioAnalysisSource.getSnapshotAt(t)
      ▼
renderFrameAt(ctx, t)  ──►  canvas de export (OffscreenCanvas W×H)
   background → looks → particles/rain → spectrum/logo → lyrics → overlays
      │
      ▼
VideoEncoder (H.264)  +  AudioEncoder (AAC)  ──►  muxer MP4  ──►  archivo
```

- **Muxer:** `mediabunny` (sucesor mantenido de `mp4-muxer`/`webm-muxer`,
  **MPL-2.0**: se puede usar en un producto cerrado sin modificar sus archivos;
  si se parchea, esos archivos se publican). Una sola dependencia para MP4 y WebM.
- **Capas R3F (partículas, lluvia):** no se reescriben. Se renderizan con un
  `WebGLRenderer` propio fuera de React sobre el mismo grafo de escena,
  avanzando el reloj manualmente, y se copian al canvas de export con
  `drawImage`. Si eso resulta inviable en una capa concreta, esa capa se marca
  "no soportada en export" en el planner (honestidad > paridad falsa).
- **Estado de módulo:** cada renderer que guarde estado en variables de módulo
  se resetea al crear la sesión (patrón ya usado en 2B).
- **Plan B si WebCodecs no está disponible** (Firefox antiguo, Safari viejo):
  export "en tiempo real" con `canvas.captureStream()` + `MediaRecorder` desde
  el canvas compuesto — sin picker de pantalla. Se ofrece como calidad
  "Compatible".

### Sub-fases

| Sub-fase | Entregable                                                                                                          | Criterio                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1A       | Pipeline mínimo: fondo + spectrum + logo + audio → MP4 1080p30. Progreso por fase y cancelación (`AbortController`) | Canción de 3 min exporta y se reproduce en VLC, YouTube y QuickTime |
| 1B       | Letras Lyrixa en el export (reutilizando `lyrixaBundleRenderer`)                                                    | Sincronía ±1 frame contra el preview                                |
| 1C       | Looks/filtros, partículas, lluvia, Stage FX, transiciones de slideshow/escenas                                      | Cada capa soportada o marcada como no soportada en el planner       |
| 1D       | Presets de salida: YouTube 1080p/1440p/4K, Shorts/TikTok 9:16, Instagram 1:1; 30/60 fps; rango parcial (in/out)     | Layout se recalcula al aspect de salida sin romper encuadre         |
| 1E       | Test de paridad: render offline vs preview para 5 proyectos de referencia (diff de píxeles con tolerancia)          | Test automatizado en CI                                             |

### Criterios de salida

- [ ] Export 1080p30 de 3 min en **≤ 1,5× la duración** en un portátil medio (M1 / Ryzen 5 + iGPU).
- [ ] Export de 1 h no crece la memoria (streaming de chunks, sin acumular frames).
- [ ] La grabación por `getDisplayMedia` queda como "Legacy" y OBS sigue igual.
- [ ] `docs/architecture` actualizado con el pipeline real.

### Riesgos

| Riesgo                                                                | Mitigación                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Renderers con dependencias ocultas del reloj real (`performance.now`) | Inyectar `timeMs` en todos; test que falle si un renderer lee el reloj global      |
| `shadowBlur` hace el export lento a 4K                                | Reutilizar `resolveGlowPerfScale`; en export, calidad fija "alta" y aceptar tiempo |
| Safari sin H.264 en `VideoEncoder`                                    | Fallback WebM/VP9 o modo "Compatible"                                              |

---

## Fase 2 · Plantillas + modo rápido — `0.6.0-beta`

**Objetivo:** alguien que nunca vio Vibrix sale con un vídeo exportado en
**menos de 3 minutos**, sin tocar el editor avanzado.

### Tareas

| #   | Tarea                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 | **12 plantillas oficiales** (proyecto `.vibrix` empaquetado): Lofi Room, Nightcore Pulse, Phonk Drift, Synthwave Grid, Lyric Minimal, Lyric Karaoke, Retro Pixel EQ, Radial Classic, Podcast Waveform, Vertical Short, Chill Rain, Club Strobe                           |
| 2.2 | Arte de plantillas con licencia: ilustraciones propias/encargadas o CC0. **Nada de anime con copyright.** Registrar licencia de cada asset en `docs/product/ASSET_LICENSES.md`                                                                                           |
| 2.3 | **Flujo "Crear vídeo"** (sustituye al first-run actual): 1) sube audio → 2) elige plantilla (preview animado real) → 3) cambia imagen/colores/título → 4) exporta. Reutiliza `FirstRunEmptyState` y las secciones existentes, **sin modales nuevos a pantalla completa** |
| 2.4 | Controles "simples" por plantilla: cada plantilla declara 4–6 parámetros expuestos (color principal, intensidad, imagen, título, estilo de letra). El resto vive en Advanced                                                                                             |
| 2.5 | **Letras sin fricción:** Vibrix importa `.lrc` y `.srt`/`.vtt` además del bundle Lyrixa (conversor a capa `primary`). En Lyrixa: export `.lrc`/Enhanced LRC, `.srt`/`.vtt` y `.txt`. Ver §0.5 punto 4                                                                    |
| 2.6 | Galería de plantillas con miniaturas en vídeo corto (generadas con el propio exportador)                                                                                                                                                                                 |
| 2.7 | Lyrixa integrada en el mismo dominio (`/lyrics` o subdominio) con "Enviar a Vibrix" por mismo origen; renombrar paquete `lyra-ui` → `lyrixa`, versionarlo y darle su propio CHANGELOG                                                                                    |

### Criterios de salida

- [ ] Prueba con 5 personas no técnicas: ≥ 4 exportan un vídeo en < 3 min sin ayuda.
- [ ] Ninguna plantilla baja de 50 fps en preview en modo `medium`.
- [ ] Todas las plantillas exportan con paridad (test 1E).

---

## Fase 3 · Rendimiento y peso de carga — `0.7.0-beta`

**Objetivo:** que la landing → editor cargue rápido en un móvil/portátil
modesto, porque la primera impresión decide la conversión.

| #   | Tarea                                                                                                          | Meta                                      |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 3.1 | Code-splitting del editor: pestañas Advanced, Calibration, AI Director, exportador y diagnósticos con `lazy()` | Chunk inicial **< 250 KB gzip**           |
| 3.2 | Fuentes bajo demanda (hoy 25 `@fontsource` importadas): cargar solo la usada por el proyecto                   | −X KB de CSS/woff en carga inicial        |
| 3.3 | `three` solo si el proyecto usa capas R3F (partículas/lluvia)                                                  | Proyecto sin partículas no descarga three |
| 3.4 | Presupuesto de rendimiento en CI: `size-limit` o script que falle si el chunk inicial crece                    | Regresión bloqueada                       |
| 3.5 | Auto-detección de calidad (`src/features/discovery/workloadHint.ts`) aplicada en primer arranque               | Sin tirones en el primer minuto           |
| 3.6 | Medir con [PERFORMANCE_BASELINE.md](../performance/PERFORMANCE_BASELINE.md) las 12 plantillas y publicar tabla | Baseline documentada                      |

### Criterios de salida

- [ ] Lighthouse (desktop) Performance ≥ 85 en la ruta del editor.
- [ ] Time-to-interactive < 3 s en 4G simulado.

---

## Fase 4 · Producto: pagos, marca de agua, legal — `0.9.0-beta`

**Objetivo:** poder cobrar de forma legal y sin construir un backend enorme.

### Modelo de negocio (propuesta inicial, validar en Fase 5)

| Plan                            | Precio                 | Incluye                                                                                  |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| **Free**                        | 0                      | Editor completo, 720p, marca de agua pequeña, 3 plantillas, OBS/present                  |
| **Pro**                         | 7 USD/mes · 59 USD/año | 1080p/1440p/4K, 60 fps, sin marca de agua, todas las plantillas, export de vídeos largos |
| **Lifetime** (solo lanzamiento) | 99 USD (cupo limitado) | Pro para siempre — financia el desarrollo inicial y premia a early adopters              |

El render es local → el coste marginal por usuario es casi cero. Eso permite
un Free generoso, que es el motor de adquisición (cada vídeo con marca de agua
es publicidad).

### Tareas

| #   | Tarea                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | **Marca de agua** aplicada solo en el compositor de export (Fase 1), nunca en preview/OBS. Módulo en `src/features/export`                                                                                                                                                                                                                                                                                                        |
| 4.2 | **Licencias:** Lemon Squeezy o Paddle (Merchant of Record: gestionan IVA/impuestos globales). Clave de licencia validada por un endpoint mínimo en `backend/server/` con caché offline de 7 días                                                                                                                                                                                                                                  |
| 4.3 | Cuentas: **no** construir auth propia. Email + license key basta para 1.0. (El stub de auth del AI Director sigue congelado)                                                                                                                                                                                                                                                                                                      |
| 4.4 | **Web de venta de la suite** (repo propio, p. ej. Next.js como `Landing-page-frankmandev`): hero con vídeo hecho con Vibrix, flujo "letra → sincronía → visual", galería de plantillas, precios, FAQ, lista de espera del Transcriptor. Separada de la app para que SEO y deploys no dependan del editor. **Plan completo: [PLAN_WEB_VENTA.md](PLAN_WEB_VENTA.md)**; sus fases W0–W1 pueden empezar antes (otro repo, no bloquea) |
| 4.5 | Legal: Términos, Privacidad (qué se guarda local vs servidor), aviso de que el usuario es responsable de los derechos del audio/imagen que sube, licencias de terceros (fuentes OFL, three.js MIT, mediabunny MPL-2.0)                                                                                                                                                                                                            |
| 4.6 | Telemetría respetuosa: Plausible/Umami (sin cookies) para embudo _visita → editor → export → pago_; Sentry (o similar) para errores de export                                                                                                                                                                                                                                                                                     |
| 4.7 | Hosting: build estático en Cloudflare Pages/Vercel + dominio; headers COOP/COEP si el exportador los necesita                                                                                                                                                                                                                                                                                                                     |
| 4.8 | Auditoría de marca: confirmar que "Vibrix", "Lyrixa" y el nombre paraguas están libres (dominio, redes, marca registrada en clases 9/42) antes de gastar en marketing                                                                                                                                                                                                                                                             |
| 4.9 | Transcriptor: quitar/aislar el modo descarga de YouTube de cualquier build distribuible; inventario de licencias de modelos (Whisper MIT, Demucs MIT, pesos de BS-RoFormer por verificar)                                                                                                                                                                                                                                         |

### Criterios de salida

- [ ] Compra de prueba de punta a punta (modo test del proveedor) desbloquea Pro.
- [ ] Export Free lleva marca de agua; Pro no.
- [ ] Landing publicada con legales enlazados.

---

## Fase 5 · Beta cerrada → lanzamiento `1.0.0`

**Objetivo:** validar que la gente **paga**, no solo que le gusta.

### 5A · Beta cerrada (2–3 semanas)

- Reclutar **20–30 creadores**: canales lofi/nightcore pequeños (1k–50k subs),
  músicos indie, streamers. Fuentes: r/lofi, r/WeAreTheMusicMakers, Discords de
  productores, TikTok.
- Les das Pro gratis a cambio de: 1 vídeo publicado con crédito + 15 min de
  entrevista.
- Canal de feedback único (Discord propio o formulario).
- Medir: % que exporta, nº de exports por usuario, dónde abandonan, bugs de export.

### 5B · Lanzamiento público

| Canal                   | Acción                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| YouTube / TikTok propio | 10–15 vídeos hechos con Vibrix antes del día D (el producto es su propio marketing)                     |
| Product Hunt            | Lanzamiento martes/miércoles con vídeo de 60 s y oferta Lifetime                                        |
| Reddit / Discord        | Posts de "cómo hice este visualizer" (no spam de enlace)                                                |
| Creadores de la beta    | Publican el mismo día con código de descuento                                                           |
| SEO                     | Páginas por intención: "lofi visualizer maker", "lyric video maker free", "audio spectrum video online" |

### Métricas de éxito (primeros 60 días)

| Métrica                          | Mínimo para seguir | Bueno |
| -------------------------------- | ------------------ | ----- |
| Visitantes → abren editor        | 25 %               | 40 %  |
| Abren editor → exportan un vídeo | 20 %               | 35 %  |
| Exportan → pagan                 | 2 %                | 5 %   |
| Usuarios de pago a 60 días       | 50                 | 200   |
| Churn mensual Pro                | < 12 %             | < 7 % |

### Punto de decisión (día 60)

- **Por encima del mínimo:** pasar a Fase 6.
- **Tráfico sí, pagos no:** revisar precio/plan Free (¿demasiado generoso?) y
  valor de Pro. Iterar 4 semanas.
- **Ni tráfico ni pagos:** el problema es posicionamiento, no producto. Probar
  un segundo segmento (streamers/OBS o lyric videos para artistas) antes de
  añadir features.

---

## Fase 6 · Post-lanzamiento (condicional a métricas)

Orden sugerido **solo si** los datos lo justifican:

1. **Timeline básica** (bloques de escena en el tiempo) — pedida por quien hace vídeos largos.
2. **Export por lotes** (varias canciones → varios vídeos) — killer feature para canales lofi.
3. **App de escritorio (Electron)** con ffmpeg nativo → exports 4K más rápidos. Ver [DESKTOP_SUITE_READINESS.md](DESKTOP_SUITE_READINESS.md).
4. **Packs de plantillas de pago / marketplace**.
5. **Auto-letras (Transcriptor)** como feature Pro: créditos por minuto en GPU cloud o incluido en escritorio; resultado siempre abre en Lyrixa para revisar.
6. **Shell de escritorio de la suite** que arranca Transcriptor + Lyrixa + Vibrix en puertos elegidos (ya previsto en el README del Transcriptor).
7. **Export `.ass` / TTML** en Lyrixa.
8. **AI Director** como feature Pro ("genera una escena a partir de la canción").
9. **Modo wallpaper** — solo con escritorio ya estable.

---

## Lo que queda explícitamente congelado hasta `1.0.0`

- Nuevas familias/formas de spectrum, nuevos Stage FX, nuevos efectos.
- AI Director (fases 6+), auth completa, cloud sync.
- Electron, móvil nativo, modo wallpaper.
- Marketplace, colaboración, cuentas sociales.
- Transcriptor como servicio público (sí se usa internamente).
- Refactors que no desbloqueen una fase de este plan.

---

## Seguimiento

| Fase | Estado    | Inicio     | Cierre     | Release       |
| ---- | --------- | ---------- | ---------- | ------------- |
| 0    | Hecha     | 2026-09-13 | 2026-09-13 | `0.4.1-alpha` |
| 1    | En curso  | 2026-09-13 | —          | —             |
| 2    | Pendiente | —          | —          | —             |
| 3    | Pendiente | —          | —          | —             |
| 4    | Pendiente | —          | —          | —             |
| 5    | Pendiente | —          | —          | —             |

Actualizar esta tabla al abrir y cerrar cada fase (y la copia resumida en
`.agents/SUITE.md` de los cuatro proyectos). El estado _as-built_ sigue
viviendo en [../status/CURRENT_SYSTEM_STATUS.md](../status/CURRENT_SYSTEM_STATUS.md).
