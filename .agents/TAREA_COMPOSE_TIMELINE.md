# Tarea — Compose por activaciones sostenidas (manifiesto y score v2)

> Decisión del usuario, 2026-10-03. Contrato:
> [docs/features/VIBRIX_AUTHORING_CONTRACT.md](../docs/features/VIBRIX_AUTHORING_CONTRACT.md),
> sección «Versión 2 — activaciones sostenidas».

> **Estado Vibrix, revisado el 2026-10-14:** V2.1, V2.1b, V2.2 y V2.2b implementadas. De V2.3
> están implementados y probados el evaluador puro, la transición temporal de
> imagen y la sesión Compose persistida (store v153). Falta conectarla al
> preview/Play y al export offline.

> **Repaso 2026-10-13 — ésta vuelve a ser la tarea prioritaria.**
> Verificado por grep, no por memoria: `resolveVisualStateAt` **no se importa
> desde ningún sitio de `src/`** (la única mención fuera de su módulo es un
> comentario en `vibrixScore.ts`). O sea: 234 líneas de evaluador y 241 de tests
> que no llegan a la pantalla. Desde el 2026-10-04 los 20 commits siguientes
> fueron a export offline, slideshow, storage, WebGL, stage FX, demo y legacy.
> Esos arreglos se conservan, pero ya no desplazan W1→W5 salvo que una regresión
> bloquee el circuito de integración.
>
> El tramo que queda está secuenciado como **W1→W5** en
> [el plan de ataque](../docs/plans/PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md), §Vía 3,
> con el orden y el riesgo de cada paso. Dos avisos que se pierden si sólo se lee
> la lista de abajo:
>
> - **El punto 5 de V2.2 ya caducó.** W2 persiste score, base y enabled con
>   `STORE_PERSIST_VERSION` 153 y migración desde 152.
> - **El tag de congelación sigue sin existir** (sólo hay `v0.4.1-alpha`), y el
>   punto 5 de V2.3 es precisamente la cirugía para la que era la red.

## Resultado que debe verse

Lyrixa muestra un catálogo de objetos publicados por Vibrix. El usuario arrastra
una imagen, escena o slot guardado al carril correspondiente. El punto colocado
lo activa en ese tiempo y permanece efectivo hasta una activación posterior que
toque el mismo estado o hasta el final del audio.

Una imagen colocada en `00:00` y la siguiente en `03:00` ocupa visualmente esos
tres minutos. La transición del cambio la define la primera imagen mediante su
configuración «transition to next» ya guardada en Vibrix.

Al importar el score y activar Compose, Vibrix resuelve el mismo estado al
reproducir, hacer seek y exportar offline.

El intercambio final no son varios JSON escogidos a mano. Vibrix entrega a
Lyrixa un paquete de autoría con catálogo, snapshots y previews. Lyrixa devuelve
un paquete de score con la secuencia y sus dependencias usadas. Vibrix es quien
muestra la secuencia durante Play y quien la renderiza en el export offline.

## Modelo cerrado

- No hay un carril por pestaña de UI. Hay un carril por estado temporal
  independiente: Image, Scene, Spectrum 1, Spectrum 2, Looks, Particles, Rain,
  Lights, Camera FX, Logo, Track Title y Background Zoom.
- Scene e Image son activaciones agregadas: pueden tocar varias familias según
  los bindings, escena y overrides que ya poseen en Vibrix.
- Una activación granular sólo toca su familia.
- En el mismo milisegundo se aplican Scene, Image y luego granulares.
- `inherit` libera un override granular sostenido para volver al resultado de
  los agregados.
- La longitud del bloque se deriva del siguiente punto. Los proyectos nuevos no
  guardan `endTimeMs`.
- `intro-window` no se arrastra. Calibration nunca se publica.

## V2.1 · Publicar imágenes desde Vibrix

1. ✅ Subir el manifiesto a `schemaVersion: 2`.
2. ✅ Añadir `images: VibrixManifestImage[]`, derivado de `backgroundImages`.
3. ✅ Usar `assetId` como identidad y `revisionOf` sobre la configuración visual
   estable. Excluir URLs, miniatura y nombre de la revisión.
4. ✅ Exportar una miniatura transportable opcional. No publicar `blob:`
   URLs.
5. ✅ Incluir las revisiones de imágenes en `manifest.revision`.
6. ✅ Probar rename estable, cambio de transición detectable, asset sin miniatura,
   imagen deshabilitada y escena colgada.

## V2.1b · Paquete de autoría para Lyrixa

1. ✅ Exportar un contenedor JSON con extensión `.vibrix-authoring`; mantener
   `.vibrix-manifest.json` como import legacy.
2. ✅ Incluir el manifiesto v2, snapshots de todos los objetos publicados y las
   previews transportables disponibles.
3. ✅ No incluir `blob:` URLs, rutas locales ni valores dependientes del navegador.
4. ✅ Mantener ids y revisiones idénticos entre manifiesto y snapshots.
5. Lyrixa debe poder abrir el paquete desconectada y construir todo el catálogo.
6. Los originales de imagen no son necesarios para autorizar el timeline:
   Vibrix sigue siendo el renderer. Se agregan sólo en export portable para otra
   máquina; ese paso puede migrar el contenedor a ZIP sin cambiar los JSON
   internos.

## V2.2 · Score v2 y compatibilidad en Vibrix

1. ✅ Añadir `image` al vocabulario del timeline, no a `VibrixSlotFamily`.
2. ✅ Parsear targets `scene`, `feature-slot`, `image` e `inherit`.
3. ✅ Seguir leyendo scores v1 sin reinterpretarlos silenciosamente.
4. ✅ Revisar dependencias tanto de slots como de imágenes y reportar `ready`,
   `updated`, `missing`, `empty` o `disabled` según corresponda.
5. ✅ Persistir score, base congelada y estado Compose; store v153 con migración.
6. ✅ Importar el contenedor `.vibrix-score` producido por Lyrixa y conservar el
   JSON suelto como compatibilidad legacy.

### V2.2b · Leer el contenedor `.vibrix-score` (hecho, 2026-10-14)

Lyrixa ya lo emite (L5, `scorePackage.ts`; formato documentado arriba en el
contrato, §Transporte). Vibrix lo lee mediante `vibrixScorePackage.ts`, y el
loader conserva el sobre plano como compatibilidad. Implementado:

1. En `vibrixScoreLoader`/parser: si el JSON trae
   `format === 'vibrix-score' && packageVersion === 1`, leer el sobre desde
   `.envelope`; si no, tratarlo como sobre plano igual que hoy. Rechazar
   `packageVersion > 1` con error legible, no con `undefined`.
2. Resolver dependencias con `snapshots` cuando `selfContained === true`: mapa
   `kind:id` → snapshot; `reviewVibrixScore` debe poder informar sin el store
   vivo (la revisión `updated` contra snapshot compara `revision`, no vuelve a
   hashear `values`). Con `snapshots: null`, comportamiento actual (store).
3. `previews[].thumbnailDataUrl` alimentan la miniatura del objeto en el modo
   Compose; verificar que el valor empieza por `data:` antes de usarlo como
   `src` (defensa, el escritor nunca manda `blob:`).
4. Endurecer el vocabulario del parser: un track `kind: 'intro-window'`, un
   target `family: 'intro-window'` o un `inherit.family: 'intro-window'` deben
   errorar — el escritor honesto nunca los emite (no es cueable), y aceptarlos
   abre la puerta a un archivo que silencia una pista informativa por error.
5. Aplicar la regla compartida de carril apagado (§El score): cues bajo
   `track.enabled === false` no generan `missing`/`updated` ni demandan
   snapshot — Lyrixa ya los excluye del cierre y de `dependencies`; si el
   lector los tratara activos, rechazaría archivos válidos.

Criterio de salida cumplido: un `.vibrix-score` self-contained importa
con informe correcto sin tener el proyecto Vibrix abierto en el store de ese
navegador, y el mismo archivo sobre el proyecto vivo da el mismo frame que el
modo Compose actual. Suite verde sin bump de store: el contenedor se parsea, no
se persiste nada nuevo todavía. Hay cobertura de versión futura, previews no
transportables, cierre de snapshots y cues en carriles apagados.

## L2.1 · Timeline de Lyrixa

> Se implementa en el repo de Lyrixa, no desde esta ventana.

1. Importar `.vibrix-authoring` y manifiestos JSON v1/v2; los v1 simplemente no
   muestran Image.
2. Añadir los carriles por familia bajo un grupo plegable `Visual composition`.
3. Al soltar un objeto, crear sólo `startTimeMs`; el borde derecho visual llega
   al siguiente cue del carril o al final del audio.
4. Mover un cue cambia el corte y recalcula visualmente los dos tramos vecinos.
5. Añadir `Add at playhead` como alternativa a drag and drop.
6. Ofrecer `Inherit scene/image` en carriles granulares.
7. Mostrar miniatura de imágenes cuando exista y un placeholder con nombre
   cuando no.
8. Exportar `.vibrix-score` con `score.json` y sólo los snapshots/previews/assets
   realmente referenciados por sus cues.

**Estado comprobado en Lyrixa el 2026-10-13:** existe el primer corte v1:
parser de `.vibrix-manifest.json`, catálogo de escenas, una pista Scene, bloques
con `endTimeMs`, detección de slots actualizados/faltantes y export
`.vibrix-score.json`. No existen todavía el parser del paquete
`.vibrix-authoring`, schema v2, imágenes, carriles granulares, activaciones
sostenidas ni `inherit`. Su orden ejecutable vive en
`Lyrixa/.agents/TAREA_SECUENCIADOR.md`.

## V2.3 · Evaluador y modo Compose en Vibrix

1. ✅ Implementar `resolveVisualStateAt(base, score, timeMs)` como función pura.
2. ✅ Partir siempre de una base congelada y plegar cues ordenados hasta `timeMs`.
3. ✅ Reutilizar `buildSceneSlotActivationPatch` y
   `buildActiveImageSelectionPatch`; no duplicar sus reglas.
4. ✅ El cambio de imagen usa la transición de la imagen saliente y tiempo
   absoluto.
5. Conectar el mismo evaluador al preview y al export offline.
6. La activación de Compose ya confirma antes de sustituir el control temporal
   manual. Pendiente en W3: que Play y seek sigan el score importado.
7. Tests obligatorios: seek = reproducción desde cero; Spectrum 2 aislado;
   escena seguida de override granular; `inherit`; dos cues en el mismo ms;
   transición de imagen; slot o imagen cambiada/borrada.

## Puerta de salida

Con un score real de Lyrixa:

1. Image A en `00:00`, Image B en `03:00`.
2. Scene A en `00:00`, Scene B en `01:00`.
3. Spectrum 2 granular en `01:30`, `inherit` en `02:00`.
4. Seek a cada corte da el mismo frame que reproducir desde cero.
5. Preview y export offline coinciden en los cortes y durante las transiciones.

No se considera cerrado hasta verificar ese circuito completo.
