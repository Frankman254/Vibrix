# Relevo para el siguiente agente

> Escrito el 2026-09-13 al cerrar la sesión con Claude. Léelo entero antes de
> tocar código. Después: [AGENTS.md](../AGENTS.md) → [TAREAS.md](TAREAS.md) →
> [ARCHITECTURE.md](../docs/architecture/ARCHITECTURE.md).

## 1. Cómo trabaja el usuario (obligatorio)

- **Responde siempre en español.** Docs en español, código y comentarios en
  inglés.
- **Trabaja directo sobre `main`.** Sin ramas, sin merges, **nunca `git push`**.
  Commit al terminar cada tarea, con mensaje en inglés estilo
  `feat(área): …` / `fix(área): …`.
- **Solo `pnpm`** (nunca `npm install`).
- **Sin feature creep:** haz lo que se pide, un dominio a la vez.
- Antes de decir "listo", deja todo en verde, en este orden:

    ```bash
    pnpm format
    pnpm lint
    pnpm architecture:check
    pnpm structure:check
    pnpm docs:check
    pnpm i18n:check
    pnpm test:types
    pnpm test:run
    pnpm build
    ```

- Al terminar, informa con honestidad qué verificaste y qué no.

## 2. Reglas duras del repo

- **Dirección de dependencias:** `types/`, `ui/`, `lib/` son hojas;
  `features/*` no importa `components/` ni `pages/`; `store/` no importa
  presentación. Lo vigila `pnpm architecture:check`.
- **Key persistida nueva en el store** ⇒ subir `STORE_PERSIST_VERSION`
  (`src/lib/version.ts`) y añadir migración. Si no, en producción la key es
  `undefined` aunque en dev se vea bien.
- **UI destructiva** (`variant="destructive"`) debe esperar
  `useDialog().confirm()` antes de actuar.
- **Textos de UI** van por i18n (`src/lib/i18n/en.ts` y `es.ts`), nunca
  hardcodeados.
- **Repos vecinos** (Lyrixa, transcriptor, vibrix-web): solo leer sus docs, no
  tocar su código.
- **Tests (Vitest)** corren en node sin plugin de GLSL: un test no puede
  importar archivos que importen `.glsl` (p. ej.
  `features/export/renderSubsystems/sceneGl.ts`). Pon la lógica pura en un
  módulo aparte y testea ese.
- **Pruebas en navegador** que cambien estado deben guardar y restaurar el
  estado persistido (IndexedDB `vibrix-state` y el store).

## 3. Dónde quedó el trabajo

Fase actual: **Fase 1 · Export de vídeo offline** (tab Export → MP4/WebM
frame a frame, sin tiempo real). Últimos commits: `42638dea` (Auto Focus y
Auto Logo por saliencia, `lib/saliency.ts`), `dab55cd5` (color activo de
letras llegaba mal a la caché de estilos), `f37e8a21` (estado honesto del
proveedor de IA en Diagnostics + `backend/server/.env.example`),
`01036b24` (sección `MusicDirectorPlan`, pura).

Principio del usuario: **el vídeo sale a calidad máxima**; el tiempo de render
no importa. El export ignora el modo de rendimiento, la pausa de movimiento y
el sleep mode del editor.

### Ya sale en el vídeo

- Fondo y fondo global.
- Slideshow, con fundido de escena.
- Spectrum, logo y track title.
- Letras Lyrixa, con las fuentes del bundle precargadas.
- Overlays de imagen.
- Stage Lights, Flash Light y Flash Edge.
- Camera FX (movimiento y shake) por capa.
- Partículas de fondo y de primer plano, con sus filtros.
- Lluvia.
- Los efectos avanzados del editor (Looks) sobre el overlay seleccionado:
  RGB shift (con envolvente de audio), scanlines y ruido. No es una capa:
  el subsistema `overlays` los dibuja en un scratch aparte, igual que el
  canvas extra que monta la vista en vivo.

Las capas se dibujan por `zIndex`.

### Pendiente (en orden sugerido)

> **Tarea activa:** [TAREA_EXPORT_RAPIDO_AISLADO.md](TAREA_EXPORT_RAPIDO_AISLADO.md)
> — bug de spectrum acelerado/duplicado (estado compartido preview↔export),
> calidad en Windows, audio de 1–3 h, pausa/tramos/reanudar y editor libre.
> Va **antes** que la lista de abajo. Fase por fase, con auditoría de Claude.

1. **Verificar letras** en un vídeo con un bundle Lyrixa real (sincronía ±1
   frame y estilos). No se ha verificado visualmente.
2. **Flash Edge** no se ha revisado frame a frame.
3. Los overlays de imagen se dibujan como **un solo grupo**: una capa con
   `zIndex` entre dos overlays no queda en medio.
4. Pedir al usuario la prueba real: canción de 3 min, abrirla en
   VLC/QuickTime y medir "≤ 1,5× la duración".
5. ~~Memoria: el audio se decodifica entero~~ — **hecho (Fase C,
   2026-09-14)**: `video/offlineAudioTrack.ts` decodifica por ventanas con
   mediabunny; el `AudioBuffer` entero se borró del export. Falta la prueba
   real con una mezcla de 1–3 h en el navegador del usuario.
6. Después: 1D (presets YouTube/Shorts/Instagram, rango in/out) y 1E (test de
   paridad offline vs preview). Ver [TAREAS.md](TAREAS.md).

## 4. Mapa rápido del export

Todo bajo `src/features/export/`.

| Archivo                                  | Qué hace                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `video/runOfflineVideoExport.ts`         | Bucle de frames: congela estado, segmentos del slideshow, audio, `renderFrameAt`, encoder, libera recursos   |
| `video/offlineAudioTrack.ts`             | Pista de audio streaming: mediabunny por chunks; análisis remuestreado, encoder con muestras nativas ≤ reloj |
| `renderSubsystem.ts`                     | Registro `RenderSubsystem { id, prepare?, beginFrame?, render, reset?, dispose? }`                           |
| `renderSubsystems/index.ts`              | `installDefaultRenderSubsystems()`: registra todos los subsistemas                                           |
| `renderSubsystems/sceneGl.ts`            | Partículas y lluvia con un `WebGLRenderer` propio (mismos shaders que en vivo)                               |
| `renderSubsystems/stageFx.ts`            | Stage Lights, Flash Light y Flash Edge                                                                       |
| `renderSubsystems/stubs.ts`              | No-ops que quedan (background, hud)                                                                          |
| `renderFrame.ts` + `frameComposition.ts` | Orden por `zIndex`, alpha de transición y transform de Camera FX por capa                                    |
| `video/offlineCameraFx.ts`               | Estado de movimiento y shake avanzado por tiempo del vídeo                                                   |
| `video/slideshowSegments.ts`             | Qué imagen o escena toca en cada frame, con fundido                                                          |
| `offlineExportPlanner.ts`                | Avisos y bloqueos antes de exportar (puro, sin canvas)                                                       |

Código compartido entre la vista en vivo y el export (cambiar uno cambia los
dos):

- `features/particles/render/particleSimulation.ts`
- `features/rain/render/rainUniforms.ts`
- `features/stageFx/render.ts` y `features/stageFx/cameraFxDraw.ts`
- `features/background/render`
- `lib/canvasText/trackFonts.ts`

**Patrón para meter una capa nueva al export:**

1. Extrae la lógica de la vista en vivo a un módulo puro dentro de
   `features/<capa>/render`.
2. Haz que la vista en vivo y un `RenderSubsystem` lo usen los dos.
3. Toma el tiempo solo de `ctx.timeMs` / `ctx.deltaMs`, nunca de
   `performance.now()`.
4. Escala los tamaños en píxeles por el lado corto (salida / viewport en
   vivo).
5. Quita el stub correspondiente.

Diseño completo: [OFFLINE_VIDEO_RENDERER_DESIGN.md](../docs/architecture/OFFLINE_VIDEO_RENDERER_DESIGN.md).

## 5. Verificar en el navegador

Levanta el servidor con `pnpm dev` (Vite, `http://localhost:5173`). Para
comparar el export con el preview, renderiza frames sueltos y compara píxeles
contra el canvas en vivo. Recuerda restaurar el estado después (sección 2).

## 6. Al cerrar tu sesión

- Actualiza [TAREAS.md](TAREAS.md), el `CHANGELOG.md` (`[Unreleased]`) y este
  archivo con lo que cambió.
- Haz commit en `main`, sin push.
