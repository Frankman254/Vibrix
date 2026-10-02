# Transiciones de imagen

En Capas → BG → Activa → Transición a la siguiente → modo avanzado,
los estilos **Zoom con estela**, **Barrido diagonal** y **Apertura circular**
complementan los nueve estilos anteriores. Usan los controles existentes de
duración, intensidad y audio; se pueden guardar como presets personalizados.

El renderer `features/background/cinematicTransitions.ts` compone cada imagen
una vez por cuadro y reutiliza tres superficies por contexto de destino.
Preview y export offline pasan por `runBackgroundTransitionPass`; no hay un
segundo algoritmo para exportar. La mezcla premultiplicada conserva brillo y
transparencia. La apertura es circular también en formatos verticales.

No se agregan claves persistidas: se amplía `SlideshowTransitionType` y se
mantienen los valores anteriores. No requiere migración del store.

## Referencias

Inspiración conceptual, con implementación Canvas propia sin copiar shaders:

- [GL Transitions](https://github.com/gl-transitions/gl-transitions).
- [CrossZoom](https://github.com/gl-transitions/gl-transitions/blob/master/transitions/CrossZoom.glsl).
- [Directional warp](https://github.com/gl-transitions/gl-transitions/blob/master/transitions/directionalwarp.glsl).

## Verificación

- Pruebas unitarias: extremos exactos, composición única de cada fuente,
  reutilización/redimensionado de buffers, aislamiento preview/export y fallback.
- Navegador: fotogramas al 0/25/50/75/100 % y 42 comprobaciones de píxeles
  con imágenes blancas, opacidad 1/0,4 e intensidad máxima, sin caída de brillo.
- No se ha verificado un MP4 completo con estos estilos ni medido rendimiento 4K.
