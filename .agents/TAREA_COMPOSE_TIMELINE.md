# Tarea — Compose por activaciones sostenidas (manifiesto y score v2)

> Decisión del usuario, 2026-10-03. Contrato:
> [docs/features/VIBRIX_AUTHORING_CONTRACT.md](../docs/features/VIBRIX_AUTHORING_CONTRACT.md),
> sección «Versión 2 — activaciones sostenidas».

> **Estado Vibrix, 2026-10-04:** V2.1, V2.1b y V2.2 implementadas. De V2.3
> está implementado y probado el evaluador puro; faltan la transición temporal
> de imagen, conectarlo al preview/Play y al export offline, y persistir el score
> con su migración cuando exista una superficie real que lo consuma.

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
5. No persistir el score hasta que el runtime lo consuma; cuando se persista,
   subir `STORE_PERSIST_VERSION` y añadir migración.
6. Importar el contenedor `.vibrix-score` producido por Lyrixa y conservar el
   JSON suelto como compatibilidad legacy.

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

## V2.3 · Evaluador y modo Compose en Vibrix

1. ✅ Implementar `resolveVisualStateAt(base, score, timeMs)` como función pura.
2. ✅ Partir siempre de una base congelada y plegar cues ordenados hasta `timeMs`.
3. ✅ Reutilizar `buildSceneSlotActivationPatch` y
   `buildActiveImageSelectionPatch`; no duplicar sus reglas.
4. El cambio de imagen usa la transición de la imagen saliente y tiempo
   absoluto.
5. Conectar el mismo evaluador al preview y al export offline.
6. En modo Compose, Play y seek siguen el score importado. Al activarlo,
   confirmar antes de sustituir el control temporal manual.
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
