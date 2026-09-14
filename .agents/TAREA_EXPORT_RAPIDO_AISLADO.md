# Tarea · Export de vídeo: bug de velocidad, calidad, mixes de 1–3 h, pausa/reanudar y editor libre

> Escrita por Claude el 2026-09-14 tras auditar el commit `71550d46` (Looks, de
> Qwen) y los vídeos exportados por el usuario. **Para Qwen.** Trabaja fase por
> fase, **un commit por fase** en `main`. Al terminar cada fase, para y avisa:
> Claude la audita y la prueba antes de seguir. Reglas de trabajo en
> [RELEVO.md](RELEVO.md).

## 0. Lo que reportó el usuario

1. **Windows:** el spectrum va "en cámara rápida", la calidad es muy mala y a
   ratos aparecen **dos radial spectrums** sin haberlos configurado. No usa la
   gráfica dedicada.
2. **Mac (1080p60):** va de maravilla, pero **al inicio de cada vídeo** el
   spectrum va rápido y luego se estabiliza.
3. Tiene **mixes de 1, 2 y 3 horas**: quiere que el render aproveche CPU y GPU
   y vaya lo más rápido posible.
4. Quiere **seguir usando el editor** mientras se genera el vídeo, sin que eso
   altere el vídeo.
5. Quiere **pausar**, sobrevivir a una **suspensión** del equipo sin perder el
   progreso, y renderizar **por tramos** que se unen al final (como los
   checkpoints del transcriptor).

## 1. Diagnóstico (ya verificado por Claude; no lo repitas, arréglalo)

### 1.1 Causa de la "cámara rápida" y del spectrum doble: estado global compartido

El preview en vivo **sigue dibujando mientras exportas**, y varios módulos
guardan estado en variables globales del módulo. El preview y el export usan
**el mismo estado**, así que cada frame del vídeo avanza la animación dos
veces: una por el preview y otra por el export.

| Estado global                                                      | Archivo                                                | Efecto en el vídeo                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spectrumRuntimeMap` (clave `instanceKey`, igual en vivo y export) | `src/features/spectrum/runtime/spectrumRuntime.ts:278` | Rotación, suavizado y picos avanzan con el `dt` de los dos bucles ⇒ **spectrum rápido**. Los canvas de memoria de frame / snapshot de transición copian el frame del preview (otro tamaño) ⇒ **segundo radial fantasma** |
| `logoEnvelope`, `logoRotation`                                     | `src/features/logo/runtime/ReactiveLogo.ts:50-54`      | Logo con envolvente y rotación mezcladas                                                                                                                                                                                 |
| `gradientFlowPhase`                                                | `src/features/spectrum/effects/gradientFlow.ts:8`      | Flujo de gradiente acelerado                                                                                                                                                                                             |
| `_drive`, `_color` (Flash Edge)                                    | `src/features/stageFx/flashEdgeDrive.ts`               | Riesgo menor (se escribe y se lee en el mismo frame), pero entra en la misma limpieza                                                                                                                                    |
| `resetSpectrum()` / `resetLogo()` desde el export                  | `src/features/export/renderSubsystems/audioLayers.ts`  | Al empezar el export se resetea también el preview                                                                                                                                                                       |

Por qué depende del equipo:

- **Windows**, con los frames de export más lentos, intercala muchos frames
  del preview por cada frame del vídeo, así que se nota todo el tiempo.
- **Mac**, al inicio (preparando y primeros frames), el preview aún corre a
  60 fps. Luego el bucle del export acapara el hilo y el preview casi no
  dibuja, así que se "estabiliza".

Los timestamps del MP4 están bien. Comprobado con `ffprobe`: 60/1 exacto y
cero deltas irregulares en `~/Downloads/deaf-kev-…mp4`.

### 1.2 Calidad en Windows

`offlineVideoEncoder.ts` usa `QUALITY_HIGH` sin bitrate explícito ni
`hardwareAcceleration`. En Mac sale a ~38 Mbps (bien). En Windows, el encoder
de Media Foundation con esa configuración puede dar un bitrate muy bajo.
mediabunny 1.56 acepta `bitrate` (número), `bitrateMode`, `latencyMode` y
`hardwareAcceleration` (ver `node_modules/mediabunny/dist/mediabunny.d.ts`,
líneas ~4660-4680).

### 1.3 GPU en Windows

- El navegador **no puede forzar** la GPU dedicada. Eso se elige en el SO:
  Configuración → Sistema → Pantalla → Gráficos → Chrome → "Alto rendimiento".
  Se comprueba en `chrome://gpu`.
- Lo que sí podemos hacer:
    - Pedir `powerPreference: 'high-performance'` al `WebGLRenderer` de
      `sceneGl.ts`.
    - Pedir `hardwareAcceleration: 'prefer-hardware'` al encoder.
    - **Mostrar al usuario** qué GPU y qué encoder se están usando.

### 1.4 Memoria con mixes largos (bloqueante para 2–3 h)

`decodeOfflineAudioFile` decodifica la canción entera a PCM: 3 h estéreo a
48 kHz en Float32 ≈ **4,1 GB**, lo que revienta la pestaña. Para 1–3 h hay que
leer el audio por ventanas.

### 1.6 "Array buffer allocation failed" en Brave (captura del usuario, 2026-09-14)

Contexto: `livewallpaperanime.netlify.app` en **Brave**, Ultrawide 1440p a
60 fps, canción de 4:33. El export falla al **finalizar**:

```
RangeError: Array buffer allocation failed
  at ArrayBuffer.slice ← _finalize ← finalize ← finish ← startExport
```

Causa:

- Brave trae **desactivado** `showSaveFilePicker` (File System Access API), así
  que `useOfflineVideoExport` cae al sink `buffer`.
- Con ese sink, mediabunny guarda **todo el MP4 en RAM** (`BufferTarget` +
  `fastStart: 'in-memory'`) y al final hace `slice` de un buffer de varios GB.
  Un ultrawide 1440p60 de 4,5 min pasa de 2 GB y el navegador no puede
  reservarlo.
- Con mixes de 1–3 h fallaría en cualquier resolución.

En la consola también aparece `THREE.WebGLRenderer: Context Lost`. Puede ser
el `forceContextLoss()` intencionado de `sceneGl.release()` al terminar, o una
pérdida real por memoria de GPU. Compruébalo y, si es real, lo cubre la Fase
B.3.

Arreglo (**Fase A.bis**; hazlo junto con la Fase A o justo después, en su
propio commit):

1. **Nunca generar el vídeo en RAM.** Si no hay `showSaveFilePicker`, escribe
   con `StreamTarget` a un archivo de **OPFS**
   (`navigator.storage.getDirectory()` → `getFileHandle(..., {create:true})` →
   `createWritable()`; está disponible en Brave, Chrome, Edge y Safari
   reciente). Usa `fastStart: false`, igual que el sink `stream`.
2. Al terminar, descarga con `URL.createObjectURL(await handle.getFile())`.
   El `File` de OPFS está respaldado por disco, así que no carga el vídeo en
   memoria. Borra el archivo de OPFS después de la descarga (con un retardo
   razonable) o al empezar el siguiente export.
3. Antes de empezar, comprueba el espacio con `navigator.storage.estimate()`.
   Estima el tamaño como bitrate × duración y avisa si no cabe (i18n).
4. Deja `BufferTarget` solo como último recurso para vídeos pequeños (p. ej.
   < 500 MB estimados) cuando no haya OPFS; si no, error claro, no crash.
5. Esto es la base de los tramos en OPFS de la Fase D: diseña el helper para
   reutilizarlo.
6. Mensaje en la UI para Brave: "Activa `brave://flags/#file-system-access-api`
   para elegir dónde guardar". Es opcional, porque con OPFS ya funciona.

**Hecho cuando:** en Brave (sin picker) un export de 1440p60 de más de 4 min
termina y descarga sin error, y la memoria de la pestaña no crece con la
duración.

### 1.5 Bug menor en el commit de Qwen (`71550d46`)

`resolveOverlayAdvancedEffects` (`overlayImageDraw.ts`) calcula
`min(36, (rgbShift+boost) · ladoCortoDeSALIDA · 0.65) · sizeFactor`. En vivo
es `min(36, … · ladoCortoDelCanvasEnVivo · 0.65)`, así que al multiplicar por
`sizeFactor` **escala dos veces** cuando la salida ≠ viewport (4K desde un
monitor 1080p ⇒ RGB shift ×2). Debe usar el lado corto del viewport en vivo
(`output / sizeFactor`) antes de multiplicar. Tampoco replica el gate
`!isTransitioning` del vivo (`imageCanvasFrameState.ts:294`); decide si aplica
y déjalo documentado. Añade un test con `sizeFactor: 2` y `rgbShift` pequeño
(sin clamp).

---

## Fase A · Aislar el estado del export (arregla 1.1 y 1.5) — PRIORIDAD

> La **Fase A.bis** (export sin RAM, §1.6) va en commit propio justo después.

Objetivo: que el preview y el export **no compartan ni un byte de estado
mutable**.

1. Inventario: lista todo el estado global mutable que toca el camino de
   render del export.

    ```bash
    grep -rnE "^(let |const [A-Za-z_]+ = (new (Map|WeakMap|Set)|create[A-Z]))" src/features src/lib src/utils | grep -v test
    ```

    Clasifica cada uno como **caché pura** (inofensiva: imágenes, fuentes,
    texto partido en líneas) o **estado de animación** (hay que aislarlo).
    Pega la tabla en el commit o en el doc de diseño.

2. Introduce un **ámbito de render** (`RenderScope`): un objeto que contiene
   todo el estado de animación (runtimes de spectrum por instancia, envolvente
   y rotación del logo, fase del gradiente, drive de Flash Edge…).
    - El preview usa un ámbito por defecto (comportamiento idéntico al actual).
    - El export crea **su propio ámbito** por export y lo pasa por
      `RenderFrameContext` hasta `renderAudioLayerFrame` → `drawSpectrum` /
      `drawLogo`.
    - Opción mínima aceptable si el cambio es muy grande: prefijar
      `instanceKey` con `export:` y convertir los `let` del logo y el gradiente
      en mapas por ámbito. Es obligatorio que el export **no llame a
      `resetSpectrum()` / `resetLogo()` globales**: solo resetea su ámbito.
3. Arregla 1.5.
4. Tests (Vitest, sin canvas real, sin importar `.glsl`):
    - Avanzar N pasos el runtime del ámbito `export` intercalando pasos del
      ámbito `live` da **el mismo** estado (rotación, envolvente) que sin
      intercalar.
    - Resetear el ámbito del export no toca el del preview.
5. Verificación en navegador (Claude la repetirá):
    - Exporta 10 s a 1080p30 con el preview reproduciendo y otra vez con el
      preview en pausa.
    - Extrae frames con
      `ffmpeg -ss 5 -i video.mp4 -frames:v 1 f.png` y compara: deben ser
      prácticamente idénticos.

**Hecho cuando:** los dos exports coinciden y el spectrum no se ve acelerado
al inicio.

## Fase B · Medir, calidad y GPU (arregla 1.2 y 1.3)

1. **Instrumentación** (solo con un flag de debug; ya existe
   `features/export/debugRenderSync.ts`, reutilízalo si encaja). Medir en ms
   por frame:
    - análisis de audio;
    - cada subsistema;
    - `encoder.addFrame`;
    - yields.

    Imprime un resumen cada 300 frames (media y p95). Apunta en
    `OFFLINE_VIDEO_RENDERER_DESIGN.md` la tabla a 1080p60 en el Mac del
    usuario. **Nada de optimizar antes de tener esta tabla.**

2. **Encoder:**
    - bitrate explícito por resolución y fps (hecho y subido el 2026-09-14 a pedido del
      usuario: 1080p30 = 28 Mbps, 1080p60 = 42 Mbps, píxeles^0,8; ver
      `recommendedVideoBitrateFor`);
    - `bitrateMode: 'variable'`, `latencyMode: 'quality'`,
      `hardwareAcceleration: 'prefer-hardware'`;
    - si `canEncodeVideo` falla con hardware, reintenta con `'no-preference'`.
3. `sceneGl.ts`: `powerPreference: 'high-performance'` en el
   `WebGLRenderer`. Maneja `webglcontextlost` / `webglcontextrestored`:
   recrear renderer y reseedear buffers (esto también cubre la suspensión del
   equipo, Fase D).
4. **Diagnóstico visible** en la tab Export (i18n en `en.ts` y `es.ts`):
    - GPU (`WEBGL_debug_renderer_info`);
    - si el encoder es por hardware;
    - bitrate.

    En Windows con GPU integrada, un aviso con la ruta de Configuración de
    1.3.

5. Quick wins **solo si la tabla lo justifica**:
    - actualizar el progreso de React cada ~250 ms en vez de cada 15 frames;
    - evitar `getImageData` en el camino del frame (grep);
    - no recrear scratch canvases.

**Hecho cuando:** la tabla está en el doc, el bitrate sale explícito (verifica
con `ffprobe`) y el diagnóstico se ve en la UI.

## Fase C · Audio por ventanas (arregla 1.4, necesario para 1–3 h)

1. Sustituye el `AudioBuffer` entero por lectura en streaming con mediabunny
   (`Input` + `AudioSampleSink`), sobre el blob del asset.
    - El análisis de cada frame solo necesita `fftSize` muestras alrededor de
      `t`: mantén un buffer circular de unos segundos y avánzalo en orden.
    - El análisis debe dar **los mismos bytes** que hoy; hay tests en
      `offlineAudioAnalysis.test.ts` y deben seguir pasando.
2. Pista de audio del vídeo:
    - si el códec del archivo original ya es compatible con el contenedor
      (AAC→MP4, Opus→WebM), **copia los paquetes** sin recodificar
      (`EncodedPacketSink` → `EncodedAudioPacketSource`);
    - si no, recodifica en streaming.
3. Criterio: un audio de 1 h no hace crecer la memoria de la pestaña más allá
   de unos cientos de MB (medir en el Administrador de tareas de Chrome) y el
   vídeo resultante dura exactamente lo que el audio.

## Fase D · Trabajo de export con pausa, tramos y reanudación

Modelo **"trabajo"** (como los checkpoints del transcriptor):

1. **Manifiesto** en IndexedDB (store propio, no el persist del Zustand):
    - `jobId`;
    - estado congelado (el snapshot que ya usa `getRenderStateSnapshot`);
    - `audioAssetId`;
    - resolución, fps, formato y bitrate;
    - `chunkSeconds` (p. ej. 30);
    - lista de tramos terminados con su archivo;
    - `createdAt` y `updatedAt`.
2. **Tramos en OPFS** (`navigator.storage.getDirectory()`): cada tramo es un
   archivo de vídeo solo con imagen, que empieza en keyframe. Al cerrar un
   tramo se actualiza el manifiesto. Así un cierre, crash o suspensión pierde
   como mucho el tramo en curso.
3. **Pausa:** el bucle espera una promesa-puerta entre frames. No hay que
   tocar el encoder, solo dejar de alimentarlo. El export no usa el reloj de
   pared, así que pausar no altera el vídeo.
4. **Reanudar** tras recargar la página o volver de la suspensión:
    - Busca trabajos incompletos y ofrece "Reanudar" o "Descartar" (este último
      es destructivo, así que va con `useDialog().confirm()`).
    - Al reanudar en el tramo `k`: resetea el ámbito de render (Fase A), aplica
      el segmento de slideshow de ese tiempo y hace **pre-roll**, es decir,
      renderiza sin codificar los ~8 s previos para que envolventes y suavizados
      converjan.
    - Documenta con honestidad: rotaciones acumuladas y posiciones de
      partículas pueden dar un salto pequeño **solo en el punto de
      reanudación**. Sin reanudación, el render es continuo.
    - Mejora opcional posterior: `snapshotState()` / `restoreState()` en
      `RenderSubsystem` para reanudación exacta.
5. **Unir al final:** remux sin recodificar. Lee los paquetes de cada tramo
   (`EncodedPacketSink`), escríbelos en un `Output` con
   `EncodedVideoPacketSource` desplazando timestamps, y añade la pista de
   audio (Fase C). Escribe al archivo elegido con `showSaveFilePicker`. El
   `FileSystemFileHandle` se puede guardar en IndexedDB para reusarlo tras
   recargar, pidiendo permiso otra vez. Al terminar, borra los tramos de
   OPFS.
6. UI en la tab Export:
    - botones Pausar, Reanudar y Cancelar;
    - lista de trabajos pendientes;
    - espacio usado en OPFS (`navigator.storage.estimate()`).

    Todo con i18n.

7. Tests puros:
    - cálculo de tramos (frames por tramo, último tramo parcial);
    - manifiesto (qué tramo toca tras reanudar);
    - desplazamiento de timestamps al unir.

**Hecho cuando:** exportas 2 min, recargas la pestaña a mitad, reanudas, y el
MP4 final dura exactamente lo mismo que el audio, reproduce en QuickTime o VLC
y el audio va sincronizado.

## Fase E · Render aislado del editor (el usuario sigue editando)

Con el modelo de trabajo de la Fase D, el runner puede vivir **en otro
contexto** que solo lee el manifiesto.

- **Opción recomendada primero: ventana o pestaña propia.** Por ejemplo
  `window.open('/?exportJob=<id>', '_blank', 'noopener')`, que carga solo el
  runner.
    - Es otro realm de JS: el estado de los módulos queda aislado por
      construcción y el editor no se entera.
    - Progreso, pausa y cancelación van por `BroadcastChannel('vibrix-export')`.
    - Verifica que:
        - el editor no se congela mientras la otra pestaña renderiza (Chrome suele
          usar otro proceso con `noopener`; mídelo);
        - la pestaña del export en segundo plano no se estrangula (el bucle no usa
          timers ni rAF, así que no debería).
- **Opción B, más adelante: Web Worker + `OffscreenCanvas`.** Aislamiento real
  en otro hilo, pero exige que todo el camino de render sea apto para workers:
    - sin `document.createElement` (usar `OffscreenCanvas`);
    - sin `HTMLImageElement` (usar `createImageBitmap`);
    - sin importar el store de Zustand (usa `localStorage`);
    - fuentes con `self.fonts`;
    - viewport pasado como dato.

    Es un refactor grande: **no lo empieces** sin que Claude y el usuario lo
    aprueben.

- Congelar de verdad: el runner usa **solo** el snapshot del manifiesto. Si
  el usuario edita el proyecto durante el export, el vídeo no cambia.
  Verifícalo cambiando el color del spectrum a mitad.

## Fase F · Tramos en paralelo (opcional; decidir con la tabla de la Fase B)

- Varios tramos a la vez (N ventanas o workers, cada uno con su encoder)
  aprovechan más núcleos y la GPU.
- Coste: cada tramo necesita pre-roll y **cada frontera** tendría el pequeño
  salto de la Fase D.4.
- Límites:
    - encoders por hardware simultáneos (NVENC de consumo ≈ 8 sesiones);
    - memoria de GPU.
- Debe ser un modo opcional ("rápido") y **no** el modo por defecto, salvo que
  se implemente la reanudación exacta (`snapshotState`).

---

## Protocolo de auditoría

- Un commit por fase en `main`, sin push. En el mensaje, qué verificaste y qué
  no.
- Antes de cada commit, la batería completa de [RELEVO.md](RELEVO.md) §1.
- Actualiza `CHANGELOG.md` (`[Unreleased]`, en español),
  `OFFLINE_VIDEO_RENDERER_DESIGN.md` y [TAREAS.md](TAREAS.md).
- Para y espera la auditoría de Claude antes de pasar a la siguiente fase. No
  mezcles fases en un commit.
