# Transiciones de imagen

## Catálogo

Capas → BG → Activa → Transición a la siguiente tiene pestañas **Esta imagen**
y **Global · setlist**. El catálogo contiene 34 estilos y variantes: fundido,
cuatro deslizamientos, zoom de entrada/salida, disolución orgánica, barras
escalonadas H/V, separación RGB, distorsión, cross zoom de entrada/salida,
barrido diagonal en ambos sentidos, iris de apertura/cierre, cuatro barridos,
dos giros, diamante y cortina de apertura/cierre, tablero, mosaico, onda radial,
onda líquida y compresión H/V. **Invertir dirección** cambia a la variante
opuesta cuando existe; las variantes también se seleccionan por separado.

Los estilos anteriores conservan sus identificadores, pero usan el renderer
compartido: fundido sin caída de brillo, deslizamientos sin huecos, máscaras
escalonadas y distorsión determinista según el progreso. Se conservan los
controles de duración, intensidad y audio y los presets personalizados.

## Capas enlazadas

Cada imagen puede aplicar su transición de salida a **Spectrum 1**, **Spectrum
2** y **Logo** mediante tres interruptores en «Esta imagen». La decisión se
guarda en la imagen saliente: al pasar a la siguiente, esas capas usan el mismo
estilo, duración, intensidad, empuje y canal de audio que el fondo. Las capas no
seleccionadas conservan el fundido corto del coordinador visual.

Spectrum 1 y Spectrum 2 mantienen superficies separadas cuando alguna imagen
del proyecto los enlaza. Esto permite congelar y transicionar cada salida de
forma independiente incluso si ambos comparten ajustes o uno se desactiva en la
imagen entrante. Preview y export offline usan el mismo compositor cinemático.

## Reparto global

- Seleccionar un setlist o toda la biblioteca, con contador de imágenes.
- Seleccionar todos los estilos o una combinación manual.
- Reparto aleatorio equilibrado: prohíbe estilos idénticos entre vecinas en el
  orden del setlist, incluido el cierre última → primera y el salto de imágenes
  deshabilitadas. Un ciclo impar con dos estilos se rechaza sin cambios.
- La selección de estilos es local al panel; las asignaciones quedan guardadas
  en las imágenes. No hay sorteo por frame ni durante el export.
- La confirmación identifica destino, cantidad, estilos y parámetros. Cancelar
  no cambia nada. Si la biblioteca o los setlists cambian durante el diálogo,
  se rechaza el plan para que el usuario revise y confirme de nuevo.
- Se preservan duración de imagen, timestamps y duración de transición.
  Opcionalmente se pueden aplicar intensidad, empuje y canal de audio.
  No se toca el suavizado global.
- Las imágenes son compartidas: editar una afecta también otros setlists que
  la referencian. La garantía de vecindad se refiere al orden del destino
  seleccionado; no promete el orden temporal personalizado de cada pista.

## Motor

`cinematicTransitions.ts` compone cada fuente una vez por cuadro; reutiliza tres
superficies completas y una máscara pequeña por contexto. `transitionMasks.ts`
produce campos deterministas y `transitionMotion.ts` dibuja movimiento y
atlases reflejados a resolución completa para zooms de salida, giros y compresión.
Estos atlases evitan costuras de transparencia entre copias separadas.
Preview y export offline usan `runBackgroundTransitionPass`; no hay un segundo
algoritmo para exportar. Las imágenes conservan su resolución.

El catálogo amplía `SlideshowTransitionType` y mantiene los identificadores
anteriores. La selección de capas enlazadas sí agrega
`transitionLayerTargets` a cada imagen; la migración v145 la inicializa vacía,
así que los proyectos existentes no cambian de aspecto.

## Referencias

Inspiración conceptual, con implementación Canvas propia sin copiar shaders:

- [GL Transitions](https://github.com/gl-transitions/gl-transitions).
- [CrossZoom](https://github.com/gl-transitions/gl-transitions/blob/master/transitions/CrossZoom.glsl).
- [Directional warp](https://github.com/gl-transitions/gl-transitions/blob/master/transitions/directionalwarp.glsl).

## Verificación

- Pruebas unitarias: extremos exactos de los 34 estilos, buffers por contexto,
  máscaras, reparto sin vecinas repetidas, ciclos imposibles, imágenes omitidas,
  alcance, conservación de duraciones y rechazo de confirmaciones obsoletas.
- Navegador: 680 comprobaciones de píxeles en horizontal/vertical, opacidad
  1/0,4 y cinco progresos por estilo, sin huecos ni caída de brillo.
- Panel real con persistencia sustituida por memoria antes de importar el store:
  cancelar no escribe; confirmar cambia solo las tres imágenes del setlist de
  prueba y conserva sus duraciones; las dos imágenes externas quedan intactas.
- Transiciones enlazadas: pruebas de captura inmutable de la imagen saliente,
  selección independiente de Spectrum 1/2/Logo, duración propia sin el fundido
  automático duplicado y particiones estables del spectrum.
- No se ha verificado un MP4 completo ni medido rendimiento 4K.
