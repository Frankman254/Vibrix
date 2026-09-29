# Plan de renovación — septiembre 2026

Este documento recoge, **sin perder nada**, el encargo grande que llegó el
2026-09-29 y lo parte en fases con un orden de trabajo. Lo que ya está hecho
queda marcado aquí mismo para que nadie lo repita.

El encargo, en palabras del usuario:

> presets al texto en intro and ending y a los demas controles […] los presets
> de imagenes global y por preset y me cuesta encontrar la imagenes […] cuando
> estan verticales necesito poder centrar la imagen vertical y horizontalmente
> respecto al punto de la cara […] mas formas de divisiones, mas animaciones,
> mas efectos […] los modos de color aun esta verde […] el spectrum circular de
> la intro se esta centrando en el mark de la primera imagen […] esto que
> hacemos de edicion aqui en ending e intro lo deberiamos poder reutilizar para
> todo el sistema […] pule tambien las animaciones cuando camabiamos de imagenes
> […] audita todo el codigo detecta cosas olvidadas […] puedes buscar mas
> shaders […] el proyecto esta tambien muy gigante toca ir refactorizando

## Hecho (2026-09-29)

- **Presets de intro/ending.** `src/features/intro/introPresets.ts`: seis
  estilos de fábrica (Póster, Cinematográfico, Neón, Tira de película,
  Estallido, Mínimo). Son un **parche**, no un modo: no tocan el texto, ni las
  imágenes elegidas a mano, ni los slots de spectrum. Botonera encima de las
  sub-pestañas de la ventana.
- **El spectrum circular ya no se centra en el mark de la primera imagen.** Un
  slot con «seguir al logo» sigue al logo **de la ventana**
  (`resolveWindowLogoPlacement`), y si la ventana no dibuja logo deja de seguir.
  De paso, `centered` ahora centra de verdad: las posiciones son −1..1 desde el
  centro, y estaba escrito `0.5`.
- **Encuadre desde la cara.** Botón «Centrar el encuadre en la cara»: copia el
  punto de cara al foco de encuadre, que es lo que mantiene la cara en cuadro al
  recortar — vertical y horizontalmente.
- **Los tres puntos de la imagen en un solo panel** debajo del preview, editando
  uno a la vez, para poder ver los marcadores mientras se mueven.
- **Mark X geométrico**: toma el lado con más espacio respecto a la cara,
  empates a la izquierda, y dentro de esa banda se acerca al centro del encuadre
  sin pegarse a los bordes.

## Fase 1 — Imágenes: encontrarlas y presetearlas

1. **Buscador y filtros en el pool** (nombre, setlist, «sin punto de cara»,
   «sin escena»), más orden por uso reciente. Es el «me cuesta encontrar las
   imágenes».
2. **Presets de imagen globales y por preset**: un preset de imagen guarda el
   encuadre + puntos + overrides de una imagen y se puede aplicar a otra o a
   todo el pool. Decidir si vive junto a los slots de escena o aparte.
3. **Pulir las animaciones de cambio de imagen** (`visualTransition`): hoy solo
   hay un fade; faltan las variantes que el resto del sistema ya insinúa.

## Fase 2 — Más materia visual

4. Más **patrones de división** para el montaje (hoy 10).
5. Más **animaciones de llegada y de movimiento** por montaje.
6. Más **efectos** de ventana (grano, aberración, barridos de luz) reutilizando
   las capas de efectos que ya existen.
7. **Más shaders**: inventario de lo que hay y qué familias faltan.

## Fase 3 — Modos de color

8. Auditar dónde `ColorSourceMode` / `IntroFillMode` **no** están conectados
   (intro, HUD, lyrics, logo) y cerrarlo: mismo contrato en todas partes.

## Fase 4 — Reutilizar la edición de intro/ending en todo el sistema

9. Extraer el modelo «ventana con plan temporal» (`introPlan`) a algo que
   también pueda **dispararse con la música en vivo**: llamar una animación en
   mitad del tema, no solo al principio y al final.

## Fase 5 — Auditoría y refactor

10. Barrido de **código olvidado** (grafo de imports, no por nombre — ver
    `project_dead_ui_findings`), y lista de subsistemas a renovar.
11. **Refactor de tamaño**: el bundle ya avisa (>800 kB) y hay ficheros de más
    de 1.000 líneas. Partir por features, no por ficheros sueltos.

## Reglas que este plan no cambia

- Una fase por commit; nada de mezclar dominios.
- Clave persistida nueva ⇒ `STORE_PERSIST_VERSION` + migración.
- Todo el texto de UI por i18n (`en.ts` + `es.ts`).
- Antes de decir «listo»: `format`, `lint`, `architecture:check`,
  `structure:check`, `docs:check`, `i18n:check`, `test:types`, `test:run`,
  `build`.
