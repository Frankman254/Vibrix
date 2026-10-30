# QA — AI Director (fases 0–6)

**Fecha:** 2026-08-20 · Probado contra un pool **real** de 28 imágenes extraídas
del export `...bg222_...2026-08-20T05-15-18-290Z.lwag`, con `qwen3:8b` local vía
Ollama.

Este documento sirve para dos cosas: la lista de qué probar a mano, y los
hallazgos de la prueba que ya corrí. Si se lo pasás a otro agente, la parte que
importa es **"Bugs encontrados"** — hay uno que bloquea el feature a tu escala.

---

## Bugs encontrados con datos reales

### 1. BLOQUEANTE — el batch topa en 40 escenas

`MAX_SCENE_SLOTS = 40` (`systemSlice.ts:35`), y el batch lo respeta vía
`MAX_AI_BATCH_SCENES` (`aiDirectorSlice.ts:21`).

Medido, simulando el pool real:

| Entrada      | Escenas creadas | Imágenes ligadas | **Salteadas** |
| ------------ | --------------- | ---------------- | ------------- |
| 226 imágenes | 40              | 40               | **186**       |

O sea: **el feature que construí para 200 imágenes no funciona a 200
imágenes.** Lo verifiqué con 24–28 y nunca crucé el techo. Es mi error de
diseño, no un detalle de configuración.

Hay una tensión real detrás, y hay que elegir:

- **(a) Subir los caps.** Una escena por imagen implica también un slot de
  spectrum por imagen (medido: 28 imágenes → 28 slots distintos), y
  `MAX_SPECTRUM_SLOT_COUNT` es 120. Para 226 harían falta ~226 escenas y ~226
  slots por familia. Ahora que el persist es IndexedDB el espacio alcanza, pero
  hay que revisar qué más asume que estas listas son cortas (la UI de slots, los
  selects de escena).
- **(b) Una escena por cluster** (8 escenas compartidas por 226 imágenes).
  Respeta los caps sin tocar nada, pero se pierde la paleta por imagen — que es
  justamente lo que evita que el pool se vea repetido.
- **(c) Híbrido**: escena por cluster, y la variación de paleta por imagen se
  resuelve en el override per-imagen en vez de en una escena propia.

Mi recomendación es **(c)**, pero es una decisión de producto tuya. No la tomé.

### 2. El eje de energía está mal calibrado para arte real

Sobre tus 28 imágenes, `deriveEnergy` sólo produjo valores entre **0.26 y
0.68** — el 40% central del rango. El compilador está hecho para 0..1, así que
en la práctica ninguna escena llega a "realmente calma" ni a "realmente
agresiva".

Se ve en el resultado: los 4 clusters salieron casi idénticos — todos
`classic` + `bars` + `dust`, 3 de 4 con `clean` + `ambient`, energías 0.42–0.55.
El modelo no está fallando; **está recibiendo firmas que se parecen todas entre
sí**.

Arreglo probable: estirar el rango observado, o normalizar contra la
distribución del propio pool en el batch ("las más movidas _de tu librería_"),
que es lo que un usuario espera. No lo toqué porque calibrar contra una sola
muestra de 28 es frágil — conviene medir sobre las 226.

### 3. Ninguna de las 28 dio pixel art

`isPixelArt` fue `false` en las 28. Puede ser correcto (son wallpapers de anime,
no sprites), pero vos mencionaste tener pixel art en el pool. Vale confirmar con
una imagen que sepas que es pixel art antes de dar el detector por bueno.

---

## Lo que sí funciona (verificado con datos reales)

| Cosa                     | Medido                                                |
| ------------------------ | ----------------------------------------------------- |
| Análisis de imagen       | 26 ms por imagen → **~6 s para 226**                  |
| Modelo local por cluster | ~16 s con imagen adjunta → **~2 min para 8 clusters** |
| Caché del servidor       | segunda llamada idéntica: 16 ms                       |
| Batch mecánicamente      | 28 imágenes → 28 escenas, 28 ligadas, 0 salteadas     |
| Fallback sin servidor    | cae a la heurística y reporta el motivo               |
| Recuperación de escala   | modelo devuelve `energy: 30` → cliente lee 0.3        |

---

## Qué probar a mano

En este orden. Los primeros tres son los que más importan.

### A. Que tus imágenes volvieron (fase 5 + el fix)

1. Abrí la app en producción con el fix desplegado.
2. **El pool debe mostrar las 226 miniaturas.** Si siguen en blanco, abrí la
   consola y buscá `[vibrix]`.
3. Recargá dos veces más. Debe aguantar.
4. En DevTools → Application → IndexedDB deberían existir **tres** bases:
   `lwag-images` (blobs, nombre sin renombrar a propósito), `vibrix-store`
   (estado) y `vibrix-ai-director` (caché).
5. Cargá una imagen nueva, recargá, y confirmá que sigue ahí.

### B. Captura de escenas (fase 0)

1. Scene → Scenes → botón **cámara**.
2. Debe crear una escena y **no cambiar lo que ves** (capturar no re-aplica).
3. Tocá el botón otra vez sin cambiar nada: la segunda escena debe **reusar los
   mismos slots** (los contadores de slots no suben).
4. Apagá partículas y capturá: esa escena debe guardar partículas como `off` y,
   al aplicarla con partículas encendidas, volver a apagarlas.

### C. AI Director de una imagen (fases 1–3)

1. Levantá el servidor: `node --env-file=.env backend/server/src/index.mjs`
2. Scene → **AI Director** → elegí una imagen → **Sugerir escena**.
3. Debe aparecer la propuesta y **el wallpaper debe cambiar en vivo**.
4. **Descartar** debe dejar todo exactamente como estaba.
5. **Preguntarle al modelo** con un texto tipo "más calmo" — la etiqueta debe
   pasar a "Del modelo" y aparecer el rationale.
6. Mové los sliders de Energía/Peso/Movimiento: cada cambio debe recompilar y
   re-previsualizar al toque.
7. **Guardar como escena** → la escena queda ligada a esa imagen. Cambiá a otra
   imagen y volvé: debe recargar sola.
8. Apagá el servidor y volvé a Sugerir: debe seguir funcionando (heurística) y
   avisar por qué.

### D. Batch (fase 4) — con la limitación conocida

1. AI Director → panel **Todo el pool** → Planificar escenas.
2. Con tus 226 esperá el aviso de salteadas — **debería decir 186**. Si dice
   otra cosa, cambió algo.
3. Probá primero con un setlist de ~20 imágenes para ver el flujo completo sin
   toparte con el cap.

### E. Regresión de lo que tocó el otro agente

No revisé el glow manual ni la opacidad de looks. Como el AI Director escribe
sobre esas mismas claves (`spectrumGlowIntensity`, `filterOpacity`), conviene:

1. Aplicá una escena de IA y comprobá que el glow manual sigue haciendo lo suyo.
2. Lo mismo con la opacidad de looks.

---

## Cómo reproducir mi setup de prueba

```bash
ollama serve
LWAG_AI_PROVIDER=ollama OLLAMA_MODEL=qwen3:8b node --env-file=.env backend/server/src/index.mjs
npm run dev
```

Los `.lwag`/`.vibrix` antiguos conservan la cabecera JSON seguida de un asset
Base64 por línea. Los `.vibrix` nuevos usan el contenedor binario v2: magic
`VIBRIXPKG2`, longitud de cabecera, manifiesto JSON y después los bytes crudos de
cada asset en el orden declarado. Así se inspeccionan o extraen sin convertir
gigabytes a Base64.

---

## Estado del repo

914 tests verdes, lint sin errores, build OK. Nada de lo de arriba rompe la
suite — son cosas que sólo aparecen con datos reales y a escala real.
